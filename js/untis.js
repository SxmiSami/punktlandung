/* Untis-Anbindung: Stundenplan übernehmen, Ausfälle & Raumänderungen anzeigen.
   Die Anfrage läuft über die Supabase-Funktion „untis“ (supabase/functions/untis),
   weil WebUntis keine Abfragen direkt aus dem Browser zulässt.
   Zugangsdaten bleiben NUR auf diesem Gerät (nicht im Konto, nicht im Backup). */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;
  const U = PL.untis = { busy: false, error: null };
  const CRED = 'punktlandung:untis';
  const CACHE = 'punktlandung:untis-cache';
  const DAY_MS = 864e5;

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* voll */ } };
  U.creds = () => read(CRED);
  U.connected = () => !!U.creds();
  const cache = () => read(CACHE) || { fetchedAt: 0, days: {} };

  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9äöüß]+/i).filter(Boolean).map(norm);

  /* ---------- Abruf ---------- */
  U.fetch = async function (creds, from, to, more) {
    const cfg = window.PL_CONFIG || {};
    if (!cfg.supabaseUrl) throw new Error('Die Online-Verbindung ist nicht eingerichtet.');
    let res;
    try {
      res = await fetch(`${cfg.supabaseUrl}/functions/v1/untis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey },
        body: JSON.stringify(Object.assign({}, creds, { from, to }, more || {})),
      });
    } catch (e) {
      // Ohne eingerichtete Funktion scheitert schon die Vorab-Anfrage des Browsers (CORS)
      throw new Error(navigator.onLine === false ? 'Du bist offline.' : 'Der Untis-Zugang antwortet nicht. Ist die Funktion „untis“ in Supabase eingerichtet? (SYNC-EINRICHTEN.md, Schritt 7)');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* unten */ }
    if (res.status === 404 && !(data && data.error)) throw new Error('Der Untis-Zugang ist in Supabase noch nicht eingerichtet (SYNC-EINRICHTEN.md, Schritt 7).');
    if (res.status === 401 && data && !('ok' in data)) throw new Error('Supabase lässt die Anfrage nicht durch: Bei der Funktion „untis“ muss „Verify JWT“ ausgeschaltet sein.');
    if (!data || !data.ok) throw new Error((data && data.error) || `Fehler beim Abruf (HTTP ${res.status})`);
    return data;
  };

  /* Link aus dem Untis-QR-Code („untis://setschool?url=…&school=…&user=…&key=…“) */
  U.parseLink = function (text) {
    const s = String(text || '').trim();
    const q = s.includes('?') ? s.slice(s.indexOf('?') + 1) : '';
    if (!q) return null;
    const p = new URLSearchParams(q);
    const key = p.get('key'), url = p.get('url');
    if (!key || !url) return null;
    return { server: url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), school: p.get('school') || '', user: p.get('user') || '', secret: key };
  };

  /* ---------- Zeiten & Fächer zuordnen ---------- */
  /* Untis-Zeit → Stunden (von–bis) im Raster der App */
  U.periodRange = function (start, end, periods) {
    const s = toMin(start), e = toMin(end);
    let from = -1, to = -1;
    periods.forEach((p, i) => {
      const ps = toMin(p.start), pe = toMin(p.end);
      if (from < 0 && s < pe && ps < e) from = i + 1;
      if (ps < e && s < pe) to = i + 1;
    });
    if (from < 0) return null;
    return { from, to: Math.max(from, to) };
  };

  const isLk = (su) => /(^|[^a-z])lk([^a-z]|$)/i.test(su.name + ' ' + su.long);
  U.matchSubject = function (su) {
    const map = st().settings.untisMap || {};
    if (su.name in map) return map[su.name] === 'skip' ? 'skip' : (PL.subject(map[su.name]) ? map[su.name] : null);
    const subs = st().subjects, n = norm(su.name), l = norm(su.long), tk = tokens(su.name);
    return (subs.find((s) => norm(s.short) === n)
      || subs.find((s) => l && norm(s.name) === l)
      || subs.find((s) => tk.includes(norm(s.short)))
      || subs.find((s) => l && norm(s.name) && l.startsWith(norm(s.name)))
      || {}).id || null;
  };
  /* Vorschlag für ein neues Fach */
  function newSubject(su, used) {
    const n = norm(su.name), l = norm(su.long), tk = tokens(su.name);
    const preset = PL.PRESETS.find((p) => norm(p.short) === n || (l && norm(p.name) === l))
      || PL.PRESETS.find((p) => tk.includes(norm(p.short)))
      || PL.PRESETS.find((p) => l && l.startsWith(norm(p.name)));
    const color = preset ? preset.color : PL.COLORS.find((c) => !used.includes(c)) || PL.COLORS[0];
    return {
      id: PL.uid(),
      short: preset ? preset.short : su.name.replace(/[^A-Za-zÄÖÜäöü0-9]/g, '').slice(0, 3).toUpperCase() || su.name.slice(0, 3),
      name: preset ? preset.name : (su.long || su.name),
      color, lk: isLk(su), teacher: '',
    };
  }

  /* ---------- Wochenplan aus den Untis-Stunden ableiten ---------- */
  const mondayIso = (iso) => PL.isoDate(PL.mondayOf(PL.parseDate(iso)));
  /* Aus mehreren Wochen den festen Plan ableiten.
     Eine Stunde zählt, wenn sie in den meisten Wochen vorkommt – so fallen
     Klausuren, Vertretungen und einmalige Änderungen heraus, und eine Woche
     mit vielen Änderungen bringt den Plan nicht durcheinander.
     Kommt sie nur in geraden oder nur in ungeraden Wochen vor → A/B-Stunde. */
  const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  U.buildPlan = function (lessons, periods) {
    const all = lessons.filter((l) => l.type === 'ls' && l.subjects.length);
    const byWeek = {};
    all.forEach((l) => { (byWeek[mondayIso(l.date)] = byWeek[mondayIso(l.date)] || []).push(l); });
    const weeks = Object.keys(byWeek).sort().filter((w) => byWeek[w].length >= 5);
    if (!weeks.length) return { weeks: [], entries: [], subjects: [], dropped: [] };
    const parity = (w) => Math.round((PL.parseDate(w) - PL.parseDate(weeks[0])) / (7 * DAY_MS)) % 2;
    const dayOf = (iso) => (PL.parseDate(iso).getDay() + 6) % 7;
    const daysWith = {};
    weeks.forEach((w) => { daysWith[w] = new Set(byWeek[w].map((l) => dayOf(l.date))); });

    const entries = {}, dropped = [];
    weeks.forEach((w) => byWeek[w].forEach((l) => {
      const day = dayOf(l.date);
      if (day > 4) return;
      const su = l.subjects[0];
      const r = U.periodRange(l.start, l.end, periods);
      if (!r) { dropped.push({ day, label: `${l.start}–${l.end}`, su, why: 'außerhalb der Stundenzeiten' }); return; }
      const key = [day, r.from, r.to, su.name].join('|');
      const e = entries[key] = entries[key] || { day, from: r.from, to: r.to, su, room: '', rooms: {}, weeks: new Set(), regular: 0 };
      const room = l.origRooms[0] || l.rooms[0] || '';
      if (room) e.rooms[room] = (e.rooms[room] || 0) + (l.code === 'irregular' ? 1 : 2);
      e.weeks.add(w);
      if (l.code !== 'irregular') e.regular++;
    }));

    const list = [];
    Object.values(entries).forEach((e) => {
      const has = [...e.weeks];
      const hasP = [0, 1].map((p) => has.filter((w) => parity(w) === p).length);
      // Wochen, in denen an diesem Tag überhaupt Unterricht war (Feiertage zählen nicht)
      const possP = [0, 1].map((p) => weeks.filter((w) => parity(w) === p && daysWith[w].has(e.day)).length);
      const label = `${e.from === e.to ? e.from + '.' : e.from + '.–' + e.to + '.'} Std.`;
      let week = null;
      if (weeks.length > 1 && !(hasP[0] && hasP[1])) {
        const p = hasP[0] ? 0 : 1;
        // in weniger als der Hälfte der passenden Wochen → einmalig (Klausur, Vertretung …)
        if (hasP[p] * 2 <= possP[p] && possP[p] > 1) { dropped.push({ day: e.day, label, su: e.su, why: `nur ${hasP[p]}× in ${weeks.length} Wochen` }); return; }
        if (!e.regular && has.length < 2) { dropped.push({ day: e.day, label, su: e.su, why: 'nur als Änderung' }); return; }
        if (possP[1 - p]) week = p;      // in den anderen Wochen war Unterricht, aber nicht diese Stunde
      } else if (weeks.length === 1 && !e.regular) {
        dropped.push({ day: e.day, label, su: e.su, why: 'nur als Änderung' }); return;
      }
      const room = Object.keys(e.rooms).sort((x, y) => e.rooms[y] - e.rooms[x])[0] || '';
      list.push({ day: e.day, from: e.from, to: e.to, su: e.su, room, week, n: has.length });
    });

    // Überschneidungen: zwei Fächer in derselben Stunde (gleiche Woche) → das häufigere gewinnt
    list.sort((x, y) => y.n - x.n || (x.week == null ? -1 : 1));
    const kept = [];
    list.forEach((e) => {
      const clash = kept.find((k) => k.day === e.day && k.from <= e.to && e.from <= k.to && (k.week == null || e.week == null || k.week === e.week));
      if (clash) dropped.push({ day: e.day, label: `${e.from === e.to ? e.from + '.' : e.from + '.–' + e.to + '.'} Std.`, su: e.su, why: `gleichzeitig mit ${clash.su.name}` });
      else kept.push(e);
    });

    const subjects = {};
    kept.forEach((e) => {
      const x = subjects[e.su.name] = subjects[e.su.name] || { name: e.su.name, long: e.su.long, count: 0 };
      x.count += (e.to - e.from + 1) * (e.week == null ? 1 : 0.5);
    });
    dropped.forEach((d) => { d.dayName = DAYS_SHORT[d.day]; });
    dropped.sort((x, y) => x.day - y.day || String(x.label).localeCompare(String(y.label)));
    return { weeks, entries: kept, subjects: Object.values(subjects).sort((a, b) => b.count - a.count), dropped };
  };

  /* ---------- Ausfälle & Raumänderungen ---------- */
  U.dayInfo = function (iso) {
    const c = cache();
    const day = c.days[iso];
    if (!day) return null;
    const periods = st().settings.periods;
    return day.map((l) => {
      const r = U.periodRange(l.start, l.end, periods);
      const sid = l.subjects[0] ? U.matchSubject(l.subjects[0]) : null;
      return r ? Object.assign({}, l, r, { subjectId: sid === 'skip' ? null : sid }) : null;
    }).filter(Boolean);
  };

  const EVA_RE = /\bEVA\b|eigenverantwortlich|selbstlern|selbststudium/i;
  const EXAM_RE = /klausur|prüfung|pruefung|\bexam/i;
  const overlap = (x, y) => x.from <= y.to && y.from <= x.to;

  /* Wird von PL.blocksOn aufgerufen: Entfall, EVA, Raum- und Lehreränderung */
  U.annotate = function (date, blocks) {
    if (!U.connected()) return blocks;
    const info = U.dayInfo(PL.isoDate(date));
    if (!info) return blocks;
    // Doppelstunde, bei der nur eine Stunde ausfällt/anders ist → aufteilen
    const sig = (b, p) => info.filter((l) => l.subjectId === b.subjectId && l.from <= p && p <= l.to)
      .map((l) => [l.code, l.rooms[0], l.info, l.teachers[0]].join('|')).sort().join(';');
    const split = [];
    blocks.forEach((b) => {
      let cur = null;
      for (let p = b.from; p <= b.to; p++) {
        const g = sig(b, p);
        if (cur && cur.g === g) { cur.b.to = p; cur.b.ids.push(b.ids[p - b.from]); continue; }
        const nb = Object.assign({}, b, { from: p, to: p, ids: [b.ids[p - b.from]].filter(Boolean), allIds: b.allIds || b.ids.slice() });
        cur = { g, b: nb }; split.push(nb);
      }
    });
    split.forEach((b) => { b.start = PL.period(b.from).start; b.end = PL.period(b.to).end; });
    blocks = split;
    blocks.forEach((b) => {
      const hits = info.filter((l) => l.subjectId === b.subjectId && overlap(l, b));
      if (!hits.length) return;
      const live = hits.filter((l) => l.code !== 'cancelled');
      const txt = hits.map((l) => l.info).filter(Boolean);
      if (EVA_RE.test(txt.join(' '))) b.eva = true;
      else if (!live.length) b.cancelled = true;
      if (hits.some((l) => l.type === 'ex')) b.exam = true;
      const moved = live.find((l) => l.rooms[0] && l.origRooms.length && l.rooms[0] !== l.origRooms[0]);
      if (moved) b.newRoom = moved.rooms[0];
      const t = live[0] || hits[0];
      b.teacher = t.teachers[0] || '';
      b.origTeacher = t.origTeachers[0] || '';
      if (b.eva && !b.origTeacher) { b.origTeacher = b.teacher; b.teacher = ''; }
      if (txt.length) b.info = txt[0];
    });
    return blocks;
  };

  /* Was Untis an diesem Tag zusätzlich hat: Klausuren, Vertretungen in anderen
     Fächern, Veranstaltungen. Klausuren im eigenen Fach färben den Block. */
  U.extrasOn = function (date, blocks) {
    if (!U.connected()) return [];
    const iso = PL.isoDate(date);
    const info = U.dayInfo(iso);
    const out = [];
    (info || []).forEach((l) => {
      if (l.code === 'cancelled') return;
      if (blocks.some((b) => b.subjectId && l.subjectId === b.subjectId && overlap(l, b))) return;
      const label = l.subjects[0] ? l.subjects[0].name : (l.info || 'Termin');
      const it = {
        subjectId: l.subjectId, label, from: l.from, to: l.to, room: l.rooms[0] || '',
        teacher: l.teachers[0] || '', origTeacher: l.origTeachers[0] || '',
        exam: l.type === 'ex' || EXAM_RE.test(l.info), eva: EVA_RE.test(l.info),
        info: l.subjects[0] ? l.info : '',
      };
      // direkt aufeinanderfolgende Einträge (z. B. Klausur über zwei Stunden) zusammenfassen
      const prev = out.find((o) => o.label === it.label && o.room === it.room && o.to === it.from - 1 && o.exam === it.exam);
      if (prev) { prev.to = it.to; return; }
      out.push(it);
    });
    const c = cache();
    (c.exams || []).filter((x) => x.date === iso && x.start).forEach((x) => {
      const m = U.matchSubject({ name: x.subject, long: '' });
      const sid = m && m !== 'skip' ? m : null;
      const r = U.periodRange(x.start, x.end || x.start, st().settings.periods);
      if (!r) return;
      const name = [x.name, x.text].filter(Boolean).join(' – ');
      const hit = out.find((o) => (sid ? o.subjectId === sid : o.label === x.subject) && overlap(o, r))
        || blocks.find((b) => sid && b.subjectId === sid && overlap(b, r));
      if (hit) { hit.exam = true; hit.examName = name; if (hit.cancelled) hit.cancelled = false; return; }
      out.push({ subjectId: sid, label: x.subject || 'Klausur', from: r.from, to: r.to, room: x.rooms && x.rooms[0] || '', teacher: '', origTeacher: '', exam: true, examName: name, info: '' });
    });
    return out;
  };

  /* Aktuelle und nächste Woche (oder eine bestimmte) nachladen */
  let inflight = null;
  const failed = {};
  U.refresh = async function (opts = {}) {
    const creds = U.creds();
    if (!creds || inflight || navigator.onLine === false) return inflight;
    const c = cache();
    const monday = opts.monday ? PL.mondayOf(opts.monday) : PL.mondayOf(new Date());
    const from = PL.isoDate(monday), to = PL.isoDate(PL.addDays(monday, opts.monday ? 4 : 11));
    const fresh = Date.now() - (c.ranges && c.ranges[from] || 0) < 30 * 60e3;
    if (!opts.force && fresh) return;
    if (!opts.force && failed[from] && Date.now() - failed[from] < 5 * 60e3) return;
    inflight = (async () => {
      try {
        const s = st().settings;
        const wantExtras = !opts.monday && (s.untisExams !== false || s.untisHomework !== false);
        const data = await U.fetch(creds, from, to, wantExtras ? { extras: { from: PL.isoDate(PL.addDays(new Date(), -14)), to: PL.isoDate(PL.addDays(new Date(), 90)) } } : null);
        if (wantExtras) U.applyExtras(data);
        const next = cache();
        if (wantExtras && Array.isArray(data.exams)) next.exams = data.exams;
        next.days = next.days || {};
        for (let d = PL.parseDate(from); PL.isoDate(d) <= to; d = PL.addDays(d, 1)) next.days[PL.isoDate(d)] = [];
        data.lessons.forEach((l) => (next.days[l.date] = next.days[l.date] || []).push(l));
        // Alte Tage aufräumen (älter als 2 Wochen)
        const cut = PL.isoDate(PL.addDays(new Date(), -14));
        Object.keys(next.days).forEach((k) => { if (k < cut) delete next.days[k]; });
        next.ranges = Object.assign({}, next.ranges || {}, { [from]: Date.now() });
        next.fetchedAt = Date.now();
        write(CACHE, next);
        U.error = null;
        delete failed[from];
      } catch (e) {
        U.error = e.message;
        failed[from] = Date.now();
      } finally {
        inflight = null;
        if (PL.render) PL.render();
      }
    })();
    return inflight;
  };
  /* ---------- Klausuren → Termine, Hausaufgaben → Aufgaben ---------- */
  /* Was einmal übernommen wurde, wird gemerkt – gelöschte Einträge kommen so nicht wieder. */
  U.applyExtras = function (data) {
    const S = st(), set = S.settings;
    const seen = new Set(set.untisSeen || []);
    const today = PL.today();
    let changed = false, newExams = 0, newTasks = 0;
    const sid = (name) => { const m = name ? U.matchSubject({ name, long: '' }) : null; return m && m !== 'skip' ? m : null; };

    if (set.untisExams !== false && Array.isArray(data.exams)) {
      data.exams.forEach((x) => {
        const subjectId = sid(x.subject);
        if (!subjectId || !x.date) return;
        const key = 'x' + x.id;
        const type = /test|lk|lernkontrolle|kurzarbeit/i.test(x.type + ' ' + x.name) && !/klausur/i.test(x.type + ' ' + x.name) ? 'Test' : 'Klausur';
        const title = [x.name, x.text].filter(Boolean).join(' – ').slice(0, 120);
        const ev = S.events.find((e) => e.untisId === key);
        if (ev) {
          if (ev.date !== x.date) { ev.date = x.date; changed = true; }
          return;
        }
        if (seen.has(key) || x.date < today) return;
        seen.add(key); changed = true;
        // schon selbst eingetragen? Dann nur verknüpfen
        const same = S.events.find((e) => !e.untisId && e.subjectId === subjectId && e.date === x.date);
        if (same) { same.untisId = key; return; }
        S.events.push({ id: PL.uid(), subjectId, date: x.date, type, title: title || type, untisId: key });
        newExams++;
      });
    }
    if (set.untisHomework !== false && Array.isArray(data.homework)) {
      data.homework.forEach((h) => {
        const subjectId = sid(h.subject);
        if (!subjectId || !h.text) return;
        const key = 'h' + h.id;
        const t = S.tasks.find((x) => x.untisId === key);
        if (t) {
          if (h.due && t.due !== h.due && !t.done) { t.due = h.due; changed = true; }
          return;
        }
        if (seen.has(key) || h.done || (h.due && h.due < today)) return;
        // selbst schon etwas für dieses Fach um den Termin eingetragen? → nachfragen
        const days = (x) => (x ? PL.parseDate(x).getTime() / DAY_MS : 0);
        const mine = S.tasks.find((t) => !t.untisId && !t.done && t.subjectId === subjectId && t.due && h.due && Math.abs(days(t.due) - days(h.due)) <= 2);
        if (mine) {
          if (!U.conflicts.some((c) => c.key === key)) U.conflicts.push({ key, taskId: mine.id, subjectId, text: h.text.slice(0, 200), due: h.due || '' });
          return;
        }
        seen.add(key); changed = true;
        S.tasks.push({ id: PL.uid(), subjectId, title: h.text.slice(0, 200), due: h.due || '', important: false, done: false, untisId: key });
        newTasks++;
      });
    }
    if (U.conflicts.length) setTimeout(U.showConflict, 600);
    if (!changed) return;
    set.untisSeen = [...seen].slice(-600);
    PL.save();
    const parts = [newExams && `${newExams} Klausur${newExams === 1 ? '' : 'en'}`, newTasks && `${newTasks} Hausaufgabe${newTasks === 1 ? '' : 'n'}`].filter(Boolean);
    if (parts.length) PL.toast(`Neu aus Untis: ${parts.join(' und ')}`);
  };

  /* Untis-Hausaufgabe trifft auf eine eigene Eintragung: Was stimmt? */
  U.conflicts = [];
  U.showConflict = function () {
    const S = st();
    while (U.conflicts.length && !S.tasks.some((t) => t.id === U.conflicts[0].taskId && !t.done)) U.conflicts.shift();
    const c = U.conflicts[0];
    if (!c) return;
    // nicht mitten in ein anderes Fenster hinein
    if (!document.getElementById('sheetLayer').hidden) { setTimeout(U.showConflict, 1500); return; }
    const mine = S.tasks.find((t) => t.id === c.taskId);
    const sub = PL.subject(c.subjectId);
    const done = (how) => {
      const seen = new Set(S.settings.untisSeen || []);
      seen.add(c.key);
      S.settings.untisSeen = [...seen].slice(-600);
      U.conflicts.shift();
      if (how === 'untis') { mine.title = c.text; if (c.due) mine.due = c.due; mine.untisId = c.key; }
      if (how === 'both') S.tasks.push({ id: PL.uid(), subjectId: c.subjectId, title: c.text, due: c.due, important: false, done: false, untisId: c.key });
      PL.save();
      PL.closeSheet();
      PL.toast(how === 'untis' ? 'Untis-Eintrag übernommen' : how === 'both' ? 'Beide behalten' : 'Deine Eintragung bleibt');
      if (U.conflicts.length) setTimeout(U.showConflict, 400);
    };
    const card = (title, text, due) => `<div class="hw-compare"><div class="hint" style="font-weight:700">${title}</div><div class="hw-text">${esc(text)}</div><div class="hint">${due ? 'Bis ' + esc(PL.fmtDate(due)) : 'Ohne Datum'}</div></div>`;
    PL.openSheet(`
      ${PL.sheetHead('Hausaufgabe prüfen', `${sub ? esc(sub.name) + ' · ' : ''}In Untis steht eine Hausaufgabe, du hast selbst schon eine eingetragen.`)}
      ${card('In Untis', c.text, c.due)}
      ${card('Deine Eintragung', mine.title, mine.due)}
      <div class="sheet-foot col" style="margin-top:14px">
        <button type="button" class="btn btn-primary" data-hw="untis">Untis-Version übernehmen</button>
        <button type="button" class="btn" data-hw="mine">Meine behalten</button>
        <button type="button" class="btn btn-ghost btn-sm" data-hw="both">Beide behalten (sind verschiedene Aufgaben)</button>
      </div>`, {
      onMount(sh) { sh.querySelectorAll('[data-hw]').forEach((b) => { b.onclick = () => done(b.dataset.hw); }); },
    });
  };

  /* Kalender zeigt eine Woche, die noch nicht geladen ist → nachladen */
  U.ensureWeek = function (monday) {
    if (!U.connected()) return;
    const iso = PL.isoDate(monday);
    if (cache().days[iso]) return;
    setTimeout(() => U.refresh({ monday }), 0);
  };

  /* ---------- Fenster: verbinden & übernehmen ---------- */
  U.sheet = function () {
    const saved = U.creds();
    const f = Object.assign({ server: '', school: '', user: '', method: 'secret', secret: '', password: '' }, saved || {});
    if (saved) f.method = saved.secret ? 'secret' : 'password';
    const segBtn = (v, l) => `<button type="button" class="${f.method === v ? 'on' : ''}" data-v="${v}">${l}</button>`;
    PL.openSheet(`
      ${PL.sheetHead('Mit Untis verbinden', 'Stundenplan übernehmen und Ausfälle sehen')}
      <form data-untis novalidate>
        <p class="hint" style="margin:0 0 10px">Öffne WebUntis (z. B. am PC): <b>Profil → Freigaben → Zugriff über Untis Mobile → Anzeigen</b>. Dann den QR-Code scannen – alles Weitere füllt sich von selbst.</p>
        <button type="button" class="btn btn-primary qr-btn" data-scan>${ic('camera', 'i-sm')} QR-Code scannen</button>
        <details class="qr-manual" ${saved ? 'open' : ''}><summary>Oder selbst eintragen</summary>
        <div class="field"><label for="uLink">Link aus dem QR-Code <span class="muted">(optional)</span></label>
          <input id="uLink" class="input" placeholder="untis://setschool?url=…" autocomplete="off" autocapitalize="off" spellcheck="false">
          <span class="hint">Steht unter dem QR-Code. Einfügen – dann füllt sich alles von selbst.</span></div>
        <div class="field-row">
          <div class="field"><label for="uServer">Server</label><input id="uServer" class="input" value="${esc(f.server)}" placeholder="z. B. nessa.webuntis.com" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
          <div class="field"><label for="uSchool">Schule</label><input id="uSchool" class="input" value="${esc(f.school)}" placeholder="Schulname in Untis" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        </div>
        <div class="field"><label for="uUser">Benutzername</label><input id="uUser" class="input" value="${esc(f.user)}" autocomplete="username" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><span class="field-label">Anmeldung</span><div class="seg seg-block" data-seg="method">${segBtn('secret', 'Schlüssel (empfohlen)')}${segBtn('password', 'Passwort')}</div></div>
        <div class="field" data-m="secret" ${f.method === 'secret' ? '' : 'hidden'}><label for="uSecret">Schlüssel</label>
          <input id="uSecret" class="input" value="${esc(f.secret)}" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <span class="hint">Steht unter dem QR-Code. Funktioniert auch, wenn du dich sonst über ein Schulkonto anmeldest.</span></div>
        <div class="field" data-m="password" ${f.method === 'password' ? '' : 'hidden'}><label for="uPw">Untis-Passwort</label>
          <input id="uPw" class="input" type="password" value="${esc(f.password)}" autocomplete="current-password"></div>
        </details>
        <p class="hint" style="margin:0 0 14px">${ic('info', 'i-sm')} Die Zugangsdaten bleiben nur auf diesem Gerät. Sie werden bei jedem Abruf über deinen Supabase-Zugang an Untis geschickt und dort nicht gespeichert.</p>
        <div class="auth-msg" data-msg hidden></div>
        <div class="sheet-foot"><button type="submit" class="btn btn-primary" data-go>${ic('download', 'i-sm')} Stundenplan laden</button></div>
      </form>`, {
      onMount(sh) {
        const $ = (s) => sh.querySelector(s);
        const msg = $('[data-msg]');
        const methodBox = $('[data-seg="method"]');
        const setMethod = (m) => {
          f.method = m;
          methodBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === m));
          sh.querySelectorAll('[data-m]').forEach((x) => { x.hidden = x.dataset.m !== m; });
        };
        methodBox.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) setMethod(b.dataset.v); });
        const fill = (p, how) => {
          $('#uServer').value = p.server; $('#uSchool').value = p.school; $('#uUser').value = p.user; $('#uSecret').value = p.secret;
          setMethod('secret');
          $('.qr-manual').open = true;
          msg.hidden = false; msg.className = 'auth-msg ok'; msg.textContent = `${how} – ${p.user} an ${p.school}.`;
        };
        $('#uLink').addEventListener('input', (e) => { const p = U.parseLink(e.target.value); if (p) fill(p, 'Daten aus dem Link übernommen'); });
        $('[data-scan]').onclick = () => U.scanQR((p) => {
          fill(p, 'QR-Code erkannt');
          // gleich laden – dafür war der Scan da
          $('[data-untis]').requestSubmit();
        });
        $('[data-untis]').addEventListener('submit', async (e) => {
          e.preventDefault();
          const creds = {
            server: $('#uServer').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
            school: $('#uSchool').value.trim(), user: $('#uUser').value.trim(),
          };
          if (f.method === 'secret') creds.secret = $('#uSecret').value.replace(/\s+/g, '');
          else creds.password = $('#uPw').value;
          const missing = !creds.server ? 'Server' : !creds.school ? 'Schule' : !creds.user ? 'Benutzername' : !(creds.secret || creds.password) ? (f.method === 'secret' ? 'Schlüssel' : 'Passwort') : '';
          if (missing) { msg.hidden = false; msg.className = 'auth-msg'; msg.textContent = `${missing} fehlt.`; return; }
          const btn = $('[data-go]');
          btn.disabled = true; btn.textContent = 'Lade aus Untis …'; msg.hidden = true;
          try {
            const monday = PL.mondayOf(new Date());
            const data = await U.fetch(creds, PL.isoDate(monday), PL.isoDate(PL.addDays(monday, 41)));
            reviewSheet(creds, data);
          } catch (err) {
            msg.hidden = false; msg.className = 'auth-msg'; msg.textContent = err.message;
            btn.disabled = false; btn.innerHTML = `${ic('download', 'i-sm')} Stundenplan laden`;
          }
        });
      },
    });
  };

  /* Schritt 2: Fächer zuordnen und übernehmen */
  function reviewSheet(creds, data) {
    const s = st().settings;
    const tg = (data.timegrid || []).map((t) => ({ start: t.start, end: t.end }));
    const f = { adoptTimes: tg.length > 0, choice: {} };
    const periods = () => (f.adoptTimes ? tg : s.periods);
    let plan = U.buildPlan(data.lessons, periods());

    if (!plan.entries.length) {
      PL.openSheet(`${PL.sheetHead('Kein Unterricht gefunden')}
        <p style="margin:0 0 18px;color:var(--text-2)">In den nächsten sechs Wochen steht in Untis kein Unterricht für dich (z. B. Ferien). Versuch es nach den Ferien noch einmal.</p>
        <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">OK</button></div>`);
      return;
    }
    plan.subjects.forEach((su) => {
      const m = U.matchSubject(su);
      f.choice[su.name] = m || 'new';
    });
    const opts = (sel) => `<option value="new" ${sel === 'new' ? 'selected' : ''}>+ Neues Fach anlegen</option>
      <option value="skip" ${sel === 'skip' ? 'selected' : ''}>Nicht übernehmen</option>
      ${PL.sortedSubjects().map((x) => `<option value="${x.id}" ${sel === x.id ? 'selected' : ''}>${esc(x.short)} · ${esc(x.name)}</option>`).join('')}`;
    const hasAB = () => plan.entries.some((e) => e.week != null);
    const countHours = () => plan.entries.filter((e) => f.choice[e.su.name] !== 'skip').reduce((n, e) => n + (e.to - e.from + 1), 0);
    const droppedHtml = () => (plan.dropped.length ? `<details class="qr-manual" style="margin-top:10px"><summary>${plan.dropped.length} Stunde(n) nicht übernommen</summary>
      <div class="hint" style="line-height:1.6">${plan.dropped.map((d) => `${esc(d.dayName || '')} ${esc(d.label)} · <b>${esc(d.su.name)}</b> – ${esc(d.why)}`).join('<br>')}</div>
      <p class="hint" style="margin:8px 0 0">Fehlt eine Stunde, die du wirklich hast? Trag sie danach im Kalender von Hand ein.</p></details>` : '');
    const summary = () => {
      const n = countHours();
      return `${n} Stunden im Plan · ${plan.subjects.length} Fächer${hasAB() ? ' · A/B-Wochen erkannt' : ''}`;
    };
    PL.openSheet(`
      ${PL.sheetHead('Stundenplan übernehmen', data.name ? `Angemeldet als ${esc(data.name)}` : esc(creds.school))}
      <div class="auth-msg ok" data-sum style="margin-bottom:14px">${summary()}</div>
      <div class="field"><span class="field-label">Fächer zuordnen</span>
        ${plan.subjects.map((su) => `<div class="assign-row"><div style="flex:0 0 42%;min-width:0"><b>${esc(su.name)}</b>${su.long && su.long !== su.name ? `<div class="hint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(su.long)}</div>` : ''}</div>
          <select class="select" data-su="${esc(su.name)}">${opts(f.choice[su.name])}</select></div>`).join('')}
      </div>
      ${tg.length ? `<div class="opt-row"><div><div class="t">Stundenzeiten aus Untis</div><div class="d">${tg.length} Stunden · ${esc(tg[0].start)} bis ${esc(tg[tg.length - 1].end)}</div></div>
        <label class="switch"><input type="checkbox" data-times ${f.adoptTimes ? 'checked' : ''}><span></span></label></div>` : ''}
      ${hasAB() ? `<p class="hint" style="margin:6px 0 0">Manche Stunden gibt es nur jede zweite Woche. A/B-Wochen werden eingeschaltet, die Woche ab ${PL.fmtDate(plan.weeks[0])} zählt als ${s.abWeeks && s.abRef ? PL.weekType(PL.parseDate(plan.weeks[0])) : 'A'}-Woche.</p>` : ''}
      <div data-dropped>${droppedHtml()}</div>
      ${st().lessons.length ? `<p class="hint" style="margin:10px 0 0">${ic('alert', 'i-sm')} Dein bisheriger Stundenplan (${st().lessons.length} Stunden) wird ersetzt.</p>` : ''}
      <div class="sheet-foot" style="margin-top:16px"><button type="button" class="btn" data-back>Zurück</button><button type="button" class="btn btn-primary" data-apply>${ic('check', 'i-sm')} Übernehmen</button></div>`, {
      wide: true,
      onMount(sh) {
        const sum = sh.querySelector('[data-sum]');
        sh.querySelectorAll('[data-su]').forEach((sel) => { sel.onchange = () => { f.choice[sel.dataset.su] = sel.value; sum.textContent = summary(); }; });
        const times = sh.querySelector('[data-times]');
        if (times) times.onchange = () => { f.adoptTimes = times.checked; plan = U.buildPlan(data.lessons, periods()); sum.textContent = summary(); sh.querySelector('[data-dropped]').innerHTML = droppedHtml(); };
        sh.querySelector('[data-back]').onclick = () => U.sheet();
        sh.querySelector('[data-apply]').onclick = () => apply(creds, data, plan, f, tg);
      },
    });
  }

  function apply(creds, data, plan, f, tg) {
    const S = st();
    const before = JSON.stringify({ subjects: S.subjects, lessons: S.lessons, settings: S.settings });
    const map = Object.assign({}, S.settings.untisMap || {});
    const created = [];
    plan.subjects.forEach((su) => {
      let id = f.choice[su.name];
      if (id === 'new') {
        // gleiche neue Fächer (z. B. „M“ und „M-LK“) nur einmal anlegen
        const n = newSubject(su, S.subjects.map((x) => x.color));
        const twin = created.find((c) => c.short === n.short && c.name === n.name);
        if (twin) id = twin.id;
        else { S.subjects.push(n); created.push(n); id = n.id; }
      }
      map[su.name] = id;
    });
    S.settings.untisMap = map;
    if (f.adoptTimes && tg.length) S.settings.periods = tg.map((t) => ({ start: t.start, end: t.end }));
    const hasAB = plan.entries.some((e) => e.week != null);
    // Woche 0 der Untis-Daten ist A, außer A/B ist schon eingestellt
    let first = 'A';
    if (hasAB) {
      if (S.settings.abWeeks && S.settings.abRef) first = PL.weekType(PL.parseDate(plan.weeks[0]));
      else { S.settings.abWeeks = true; S.settings.abRef = plan.weeks[0]; }
    }
    const other = first === 'A' ? 'B' : 'A';
    S.lessons = [];
    plan.entries.forEach((e) => {
      const sid = map[e.su.name];
      if (!sid || sid === 'skip') return;
      const week = e.week == null ? null : (e.week === 0 ? first : other);
      for (let p = e.from; p <= e.to; p++) {
        if (S.lessons.some((l) => l.day === e.day && l.period === p && (!l.week || !week || l.week === week))) continue;
        S.lessons.push({ id: PL.uid(), subjectId: sid, day: e.day, period: p, room: e.room || '', week });
      }
    });
    write(CRED, creds);
    // Abgerufene Tage gleich für die Ausfälle merken
    const c = { fetchedAt: Date.now(), days: {}, ranges: { [PL.isoDate(PL.mondayOf(new Date()))]: Date.now() } };
    for (let d = PL.mondayOf(new Date()), i = 0; i < 28; i++, d = PL.addDays(d, 1)) c.days[PL.isoDate(d)] = [];
    data.lessons.forEach((l) => (c.days[l.date] = c.days[l.date] || []).push(l));
    write(CACHE, c);
    U.error = null;
    PL.save();
    setTimeout(() => U.refresh({ force: true }), 300);
    PL.closeSheet();
    location.hash = '#/plan';
    PL.toast(`${S.lessons.length} Stunden aus Untis übernommen${created.length ? ` · ${created.length} neue Fächer` : ''}`, () => {
      const b = JSON.parse(before);
      S.subjects = b.subjects; S.lessons = b.lessons; S.settings = b.settings;
      PL.save();
    });
  }

  /* ---------- QR-Code scannen (Kamera oder Foto/Screenshot) ---------- */
  const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  let decoder = null;
  const loadScript = (src) => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Der QR-Leser konnte nicht geladen werden. Bist du online?'));
    document.head.appendChild(s);
  });
  /* liefert eine Funktion: Bild/Video → Text im QR-Code (oder null) */
  async function getDecoder() {
    if (decoder) return decoder;
    if ('BarcodeDetector' in window) {
      try {
        if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
          const d = new window.BarcodeDetector({ formats: ['qr_code'] });
          return (decoder = async (src) => { const r = await d.detect(src); return r[0] ? r[0].rawValue : null; });
        }
      } catch (e) { /* weiter mit jsQR */ }
    }
    if (!window.jsQR) await loadScript(JSQR);
    const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    return (decoder = async (src) => {
      const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
      if (!w || !h) return null;
      const k = Math.min(1, 1000 / Math.max(w, h));
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      ctx.drawImage(src, 0, 0, c.width, c.height);
      const r = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      return r ? r.data : null;
    });
  }
  U.decodeImage = async function (file) {
    const dec = await getDecoder();
    const bmp = await createImageBitmap(file);
    try { return await dec(bmp); } finally { if (bmp.close) bmp.close(); }
  };

  U.scanQR = function (onFound) {
    const box = document.createElement('div');
    box.className = 'qr-scan';
    box.innerHTML = `<div class="qr-view"><video playsinline muted autoplay></video><div class="qr-frame"></div></div>
      <p class="qr-msg" data-msg>Kamera wird gestartet …</p>
      <div class="qr-actions"><button type="button" class="btn" data-photo>${ic('image', 'i-sm')} Foto oder Screenshot</button><button type="button" class="btn btn-ghost" data-cancel>Abbrechen</button></div>`;
    document.body.appendChild(box);
    const video = box.querySelector('video'), msgEl = box.querySelector('[data-msg]');
    let stream = null, done = false, timer = null;
    const say = (t, bad) => { msgEl.textContent = t; msgEl.classList.toggle('bad', !!bad); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); stop(); } };
    const stop = () => {
      done = true; clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      window.removeEventListener('keydown', onKey, true);
      box.remove();
    };
    window.addEventListener('keydown', onKey, true);
    const handle = (text) => {
      if (!text) return false;
      const p = U.parseLink(text);
      if (!p) { say('Das ist kein Untis-QR-Code. Nimm den aus „Zugriff über Untis Mobile“.', true); return false; }
      stop(); onFound(p); return true;
    };
    box.querySelector('[data-cancel]').onclick = stop;
    box.querySelector('[data-photo]').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const file = inp.files[0]; if (!file) return;
        say('Bild wird gelesen …');
        try {
          const text = await U.decodeImage(file);
          if (!text) say('Im Bild wurde kein QR-Code gefunden. Schneide es enger zu oder versuch es mit der Kamera.', true);
          else handle(text);
        } catch (e) { say(e.message || 'Das Bild konnte nicht gelesen werden.', true); }
      };
      inp.click();
    };
    (async () => {
      let dec;
      try { dec = await getDecoder(); } catch (e) { say(e.message, true); return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { box.classList.add('no-cam'); say('Kamera ist hier nicht verfügbar – wähle ein Foto oder einen Screenshot vom QR-Code.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      } catch (e) {
        box.classList.add('no-cam');
        say(e && e.name === 'NotAllowedError' ? 'Kein Zugriff auf die Kamera. Erlaube ihn in den Einstellungen oder wähle ein Foto vom QR-Code.' : 'Keine Kamera gefunden – wähle ein Foto oder einen Screenshot vom QR-Code.', true);
        return;
      }
      if (done) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch (e) { /* autoplay */ }
      say('Halte die Kamera auf den QR-Code in WebUntis.');
      const tick = async () => {
        if (done) return;
        try { if (video.readyState >= 2 && handle(await dec(video))) return; } catch (e) { /* nächstes Bild */ }
        timer = setTimeout(tick, 200);
      };
      tick();
    })();
  };

  U.disconnect = function () {
    PL.confirmSheet('Untis trennen?', 'Die Zugangsdaten werden von diesem Gerät gelöscht. Dein Stundenplan bleibt erhalten, Ausfälle werden aber nicht mehr angezeigt.', 'Trennen', () => {
      write(CRED, null); write(CACHE, null); U.error = null;
      if (PL.render) PL.render();
      PL.toast('Untis getrennt');
    });
  };

  /* Zeile in den Einstellungen (Karte „Stundenplan“) */
  U.settingsRow = function () {
    const c = U.creds();
    if (!c) return `<div class="opt-row"><div><div class="t">Untis</div><div class="d">Stundenplan übernehmen, Ausfälle und Raumänderungen sehen</div></div><button class="btn btn-sm" data-action="untis-connect">Verbinden</button></div>`;
    const at = cache().fetchedAt;
    const when = at ? new Date(at).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'noch nie';
    return `<div class="opt-row"><div><div class="t">Untis</div><div class="d">${esc(c.school)} · ${esc(c.user)}<br>${U.error ? `<span style="color:var(--danger)">${esc(U.error)}</span>` : `Zuletzt abgerufen: ${when}`}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-sm" data-action="untis-connect">${ic('refresh', 'i-sm')} Neu übernehmen</button><button class="btn btn-sm btn-ghost" data-action="untis-disconnect">Trennen</button></div></div>
      <div class="opt-row"><div><div class="t">Klausuren aus Untis</div><div class="d">Landen automatisch bei den Terminen</div></div>
        <label class="switch"><input type="checkbox" data-setting="untisExams" ${st().settings.untisExams !== false ? 'checked' : ''}><span></span></label></div>
      <div class="opt-row"><div><div class="t">Hausaufgaben aus Untis</div><div class="d">Landen automatisch bei den Aufgaben</div></div>
        <label class="switch"><input type="checkbox" data-setting="untisHomework" ${st().settings.untisHomework !== false ? 'checked' : ''}><span></span></label></div>`;
  };

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'untis-connect': () => U.sheet(),
    'untis-disconnect': () => U.disconnect(),
    'untis-refresh': () => U.refresh({ force: true }).then(() => PL.toast(U.error ? U.error : 'Untis aktualisiert')),
  });

  // Beim Start und beim Zurückholen der App nachsehen, ob es etwas Neues gibt
  setTimeout(() => U.refresh(), 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') U.refresh(); });
  window.addEventListener('online', () => U.refresh());
})();
