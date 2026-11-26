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
  U.fetch = async function (creds, from, to) {
    const cfg = window.PL_CONFIG || {};
    if (!cfg.supabaseUrl) throw new Error('Die Online-Verbindung ist nicht eingerichtet.');
    let res;
    try {
      res = await fetch(`${cfg.supabaseUrl}/functions/v1/untis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey },
        body: JSON.stringify(Object.assign({}, creds, { from, to })),
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
  U.buildPlan = function (lessons, periods) {
    // Vertretungen/Raumänderungen („irregular“) bestätigen nur Stunden, legen aber keine eigenen an
    const all = lessons.filter((l) => l.type === 'ls' && l.subjects.length);
    const byWeek = {};
    all.forEach((l) => { (byWeek[mondayIso(l.date)] = byWeek[mondayIso(l.date)] || []).push(l); });
    const weeks = Object.keys(byWeek).sort().filter((w) => byWeek[w].length >= 5);
    // zwei aufeinanderfolgende Wochen mit Unterricht (für A/B), sonst nur eine
    let pair = null;
    for (let i = 0; i < weeks.length - 1 && !pair; i++) {
      if (Math.round((PL.parseDate(weeks[i + 1]) - PL.parseDate(weeks[i])) / DAY_MS) === 7) pair = [weeks[i], weeks[i + 1]];
    }
    const use = pair || weeks.slice(0, 1);
    if (!use.length) return { weeks: [], entries: [], subjects: [], skipped: 0 };

    const entries = {};
    let skipped = 0;
    const dayOf = (iso) => (PL.parseDate(iso).getDay() + 6) % 7;
    const daysWith = use.map((w) => new Set(byWeek[w].map((l) => dayOf(l.date))));
    use.forEach((w, wi) => byWeek[w].forEach((l) => {
      const day = dayOf(l.date);
      if (day > 4) return;
      const r = U.periodRange(l.start, l.end, periods);
      if (!r) { if (l.code !== 'irregular') skipped++; return; }
      const su = l.subjects[0];
      const key = [day, r.from, r.to, su.name].join('|');
      const e = entries[key] = entries[key] || { day, from: r.from, to: r.to, su, room: '', weeks: new Set(), regular: new Set() };
      const room = l.origRooms[0] || l.rooms[0] || '';
      if (room && (!e.room || l.code !== 'irregular')) e.room = room;
      e.weeks.add(wi);
      if (l.code !== 'irregular') e.regular.add(wi);
    }));
    const list = [];
    Object.values(entries).forEach((e) => {
      if (!e.regular.size) return;               // nur als Vertretung aufgetaucht
      let week = null;
      if (use.length === 2 && e.weeks.size === 1) {
        const wi = [...e.weeks][0];
        // fiel der Tag in der anderen Woche ganz aus (Feiertag), zählt die Stunde trotzdem jede Woche
        if (daysWith[1 - wi].has(e.day)) week = wi;
      }
      list.push({ day: e.day, from: e.from, to: e.to, su: e.su, room: e.room, week });
    });
    const subjects = {};
    list.forEach((e) => {
      const x = subjects[e.su.name] = subjects[e.su.name] || { name: e.su.name, long: e.su.long, count: 0 };
      x.count += (e.to - e.from + 1) * (e.week == null ? 1 : 0.5);
    });
    return { weeks: use, entries: list, subjects: Object.values(subjects).sort((a, b) => b.count - a.count), skipped };
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

  /* Wird von PL.blocksOn aufgerufen: markiert Blöcke als „Entfällt“ usw. */
  U.annotate = function (date, blocks) {
    if (!U.connected()) return blocks;
    const info = U.dayInfo(PL.isoDate(date));
    if (!info) return blocks;
    blocks.forEach((b) => {
      const hits = info.filter((l) => l.subjectId === b.subjectId && l.from <= b.to && b.from <= l.to);
      if (!hits.length) return;
      if (hits.every((l) => l.code === 'cancelled')) b.cancelled = true;
      const moved = hits.find((l) => l.code !== 'cancelled' && l.rooms[0] && l.origRooms.length && l.rooms[0] !== l.origRooms[0]);
      if (moved) b.newRoom = moved.rooms[0];
      const txt = hits.map((l) => l.info).filter(Boolean)[0];
      if (txt) b.info = txt;
    });
    return blocks;
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
        const data = await U.fetch(creds, from, to);
        const next = cache();
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
        <div class="field"><label for="uLink">Link aus dem QR-Code <span class="muted">(optional)</span></label>
          <input id="uLink" class="input" placeholder="untis://setschool?url=…" autocomplete="off" autocapitalize="off" spellcheck="false">
          <span class="hint">In WebUntis: <b>Profil → Freigaben → Zugriff über Untis Mobile → Anzeigen</b>. Den Link unter dem QR-Code hier einfügen – dann füllt sich alles von selbst.</span></div>
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
        $('#uLink').addEventListener('input', (e) => {
          const p = U.parseLink(e.target.value);
          if (!p) return;
          $('#uServer').value = p.server; $('#uSchool').value = p.school; $('#uUser').value = p.user; $('#uSecret').value = p.secret;
          setMethod('secret');
          msg.hidden = false; msg.className = 'auth-msg ok'; msg.textContent = 'Daten aus dem Link übernommen.';
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
            const data = await U.fetch(creds, PL.isoDate(monday), PL.isoDate(PL.addDays(monday, 27)));
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
        <p style="margin:0 0 18px;color:var(--text-2)">In den nächsten vier Wochen steht in Untis kein Unterricht für dich (z. B. Ferien). Versuch es nach den Ferien noch einmal.</p>
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
      ${plan.skipped ? `<p class="hint" style="margin:6px 0 0">${plan.skipped} Stunde(n) liegen außerhalb deiner Stundenzeiten und werden ausgelassen.</p>` : ''}
      ${st().lessons.length ? `<p class="hint" style="margin:10px 0 0">${ic('alert', 'i-sm')} Dein bisheriger Stundenplan (${st().lessons.length} Stunden) wird ersetzt.</p>` : ''}
      <div class="sheet-foot" style="margin-top:16px"><button type="button" class="btn" data-back>Zurück</button><button type="button" class="btn btn-primary" data-apply>${ic('check', 'i-sm')} Übernehmen</button></div>`, {
      wide: true,
      onMount(sh) {
        const sum = sh.querySelector('[data-sum]');
        sh.querySelectorAll('[data-su]').forEach((sel) => { sel.onchange = () => { f.choice[sel.dataset.su] = sel.value; sum.textContent = summary(); }; });
        const times = sh.querySelector('[data-times]');
        if (times) times.onchange = () => { f.adoptTimes = times.checked; plan = U.buildPlan(data.lessons, periods()); sum.textContent = summary(); };
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
    PL.closeSheet();
    location.hash = '#/plan';
    PL.toast(`${S.lessons.length} Stunden aus Untis übernommen${created.length ? ` · ${created.length} neue Fächer` : ''}`, () => {
      const b = JSON.parse(before);
      S.subjects = b.subjects; S.lessons = b.lessons; S.settings = b.settings;
      PL.save();
    });
  }

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
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-sm" data-action="untis-connect">${ic('refresh', 'i-sm')} Neu übernehmen</button><button class="btn btn-sm btn-ghost" data-action="untis-disconnect">Trennen</button></div></div>`;
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
