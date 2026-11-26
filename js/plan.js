/* Stundenplan & Hausaufgaben */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;
  const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const DAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  Object.assign(PL.ui, { planWeek: 0, planMode: 'week', taskFilter: 'open' });

  /* ================= Datum & Wochen ================= */
  PL.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  PL.mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  PL.isoWeek = (d) => {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil(((x - y0) / 864e5 + 1) / 7);
  };
  PL.weekType = (d) => {
    const s = st().settings;
    if (!s.abWeeks || !s.abRef) return null;
    const diff = Math.round((PL.mondayOf(d) - PL.mondayOf(PL.parseDate(s.abRef))) / (7 * 864e5));
    return ((diff % 2) + 2) % 2 === 0 ? 'A' : 'B';
  };
  const toMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  PL.period = (p) => st().settings.periods[p - 1] || { start: '', end: '' };

  /* Unterrichtsblöcke eines Tages (Doppelstunden zusammengefasst) */
  PL.blocksOn = function (date) {
    const day = (date.getDay() + 6) % 7;
    if (day > 4) return [];
    const wt = PL.weekType(date);
    const ls = st().lessons
      .filter((l) => l.day === day && (!l.week || !wt || l.week === wt) && PL.subject(l.subjectId))
      .sort((a, b) => a.period - b.period);
    const blocks = [];
    ls.forEach((l) => {
      const last = blocks[blocks.length - 1];
      if (last && last.subjectId === l.subjectId && (last.room || '') === (l.room || '') && last.to === l.period - 1) {
        last.to = l.period; last.ids.push(l.id);
      } else if (!last || last.to < l.period) {
        blocks.push({ subjectId: l.subjectId, room: l.room || '', from: l.period, to: l.period, ids: [l.id], week: l.week || null });
      }
    });
    blocks.forEach((b) => { b.start = PL.period(b.from).start; b.end = PL.period(b.to).end; });
    return blocks;
  };

  /* Die nächsten Unterrichtstage eines Fachs (ab morgen), je Tag der erste Block */
  PL.nextLessons = function (subjectId, count = 2) {
    const out = [];
    for (let i = 1; i <= 42 && out.length < count; i++) {
      const d = PL.addDays(new Date(), i);
      const b = PL.blocksOn(d).find((x) => x.subjectId === subjectId);
      if (b) out.push({ date: PL.isoDate(d), block: b });
    }
    return out;
  };
  PL.nextLessonDate = (subjectId) => { const n = PL.nextLessons(subjectId, 1)[0]; return n ? n.date : null; };

  /* Stunde, die gerade läuft – oder die vor höchstens 20 Minuten zu Ende ging.
     Die Nachlaufzeit endet früher, sobald die nächste eigene Stunde beginnt
     (z. B. 5 Min. Pause nach der 3. Stunde → danach gilt schon das nächste Fach). */
  PL.currentBlock = function (at) {
    const now = at != null ? at : nowMin(), blocks = PL.blocksOn(new Date());
    const live = blocks.find((b) => toMin(b.start) <= now && now <= toMin(b.end));
    if (live) return live;
    const i = blocks.map((b) => toMin(b.end) < now).lastIndexOf(true);
    if (i < 0) return null;
    const next = blocks[i + 1];
    const until = Math.min(toMin(blocks[i].end) + 20, next ? toMin(next.start) : Infinity);
    return now < until ? blocks[i] : null;
  };

  const dayLabel = (iso) => {
    const n = PL.daysUntil(iso);
    if (n === 0) return 'Heute';
    if (n === 1) return 'Morgen';
    if (n === -1) return 'Gestern';
    const d = PL.parseDate(iso);
    return DAYS_LONG[(d.getDay() + 6) % 7] + ', ' + d.getDate() + '. ' + PL.MONTHS[d.getMonth()];
  };

  /* ================= Karten für die Übersicht ================= */
  PL.scheduleCard = function () {
    const hasPlan = st().lessons.length > 0;
    let date = new Date(), blocks = PL.blocksOn(date), label = 'Heute';
    const over = blocks.length && toMin(blocks[blocks.length - 1].end) < nowMin();
    if (!blocks.length || over) {
      for (let i = 1; i <= 7; i++) {
        const d = PL.addDays(new Date(), i), b = PL.blocksOn(d);
        if (b.length) { date = d; blocks = b; label = i === 1 ? 'Morgen' : DAYS_LONG[(d.getDay() + 6) % 7]; break; }
      }
    }
    const isToday = label === 'Heute', now = nowMin();
    const wt = PL.weekType(date);
    const rows = blocks.map((b) => {
      const sub = PL.subject(b.subjectId);
      const live = isToday && toMin(b.start) <= now && now <= toMin(b.end);
      const past = isToday && toMin(b.end) < now;
      return `<a class="lesson-row ${live ? 'live' : ''} ${past ? 'past' : ''}" style="--c:${sub.color}" href="#/fach/${sub.id}">
        <span class="lr-time num">${esc(b.start)}<small>${esc(b.end)}</small></span>
        <span class="lr-bar"></span>
        <span class="row-main"><span class="row-title" style="display:block">${esc(sub.name)}${live ? ' <span class="tag tag-live">JETZT</span>' : ''}</span>
          <span class="row-sub" style="display:block">${b.from === b.to ? b.from + '.' : b.from + '.–' + b.to + '.'} Std.${b.room ? ' · ' + esc(b.room) : ''}${sub.teacher ? ' · ' + esc(sub.teacher) : ''}</span></span>
      </a>`;
    }).join('');
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${ic('clock')} Stundenplan</h2><div class="card-sub">${hasPlan ? label + (wt ? ` · ${wt}-Woche` : '') : 'Noch nicht eingetragen'}</div></div><a class="link-btn" href="#/plan">Woche ${ic('chevron-right', 'i-sm')}</a></div>
      ${!hasPlan ? `<div class="empty"><b>Kein Stundenplan</b>Trag deine Stunden einmal ein – dann siehst du hier immer, was als Nächstes kommt.<br><a class="btn btn-sm btn-primary" href="#/plan" style="margin-top:12px">${ic('plus', 'i-sm')} Stundenplan anlegen</a></div>`
        : rows ? `<div class="list">${rows}</div>` : `<div class="empty">Diese Woche kein Unterricht mehr 🎉</div>`}
    </section>`;
  };

  function taskRow(t, opts = {}) {
    const sub = PL.subject(t.subjectId);
    const c = sub ? sub.color : 'var(--muted)';
    const overdue = !t.done && t.due && t.due < PL.today();
    return `<div class="task ${t.done ? 'done' : ''}" style="--c:${c}">
      <button class="task-check" data-action="toggle-task" data-id="${t.id}" aria-label="${t.done ? 'Als offen markieren' : 'Erledigt'}">${ic('check')}</button>
      <button class="task-main" data-action="open-task" data-id="${t.id}">
        <span class="task-title">${esc(t.title)}${t.important ? ' <b class="task-imp">!!!</b>' : ''}</span>
        <span class="task-meta">${sub ? `<span class="task-subj">${esc(sub.short)}</span>` : ''}${opts.showDue && t.due ? `<span class="${overdue ? 'overdue' : ''}">${dayLabel(t.due)}</span>` : ''}</span>
      </button>
    </div>`;
  }

  PL.tasksCard = function () {
    const open = st().tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || (b.important - a.important));
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${ic('tasks')} Hausaufgaben</h2><div class="card-sub">${open.length ? open.length + ' offen' : 'Alles erledigt'}</div></div>
        <a class="link-btn" href="#/aufgaben">Alle ${ic('chevron-right', 'i-sm')}</a></div>
      ${open.length ? `<div class="tasks">${open.slice(0, 5).map((t) => taskRow(t, { showDue: true })).join('')}</div>` : `<div class="empty"><b>Keine offenen Aufgaben</b>Genieß die freie Zeit.</div>`}
      ${addTaskBtn()}
    </section>`;
  };

  /* Großer Knopf zum Eintragen – nennt das Fach der aktuellen Stunde */
  function addTaskBtn(cls = '') {
    const cur = PL.currentBlock(), sub = cur && PL.subject(cur.subjectId);
    return `<button class="add-task-btn ${cls}" data-action="add-task" ${sub ? `style="--c:${sub.color}"` : ''}>
      <span class="atb-plus">${ic('plus')}</span>
      <span class="atb-text"><b>Hausaufgabe eintragen</b><small>${sub ? `für ${esc(sub.name)} – aktuelle Stunde` : 'Fach und Fälligkeit werden vorgeschlagen'}</small></span>
    </button>`;
  }

  /* ================= Kalender: Woche & Termine ================= */
  PL.views.plan = function (mode) {
    if (mode) PL.ui.planMode = mode;
    const m = PL.ui.planMode;
    const seg = `<div class="seg"><button class="${m === 'week' ? 'on' : ''}" data-action="plan-mode" data-v="week">Stundenplan</button><button class="${m === 'events' ? 'on' : ''}" data-action="plan-mode" data-v="events">Termine</button></div>`;
    if (m === 'events') return PL.views.events(seg);

    const s = st().settings;
    const monday = PL.addDays(PL.mondayOf(new Date()), PL.ui.planWeek * 7);
    const friday = PL.addDays(monday, 4);
    const wt = PL.weekType(monday);
    const n = s.periods.length;
    const today = PL.today();
    const evs = st().events;

    let cells = '';
    // Kopfzeile
    cells += `<div class="tt-corner">${wt ? `<span class="ab-badge">${wt}</span>` : ''}</div>`;
    DAYS.forEach((d, i) => {
      const date = PL.addDays(monday, i);
      const isT = PL.isoDate(date) === today;
      cells += `<div class="tt-day ${isT ? 'today' : ''}" style="grid-column:${i + 2}"><span>${d}</span><b>${date.getDate()}</b></div>`;
    });
    // Zeitspalte + leere Felder
    for (let p = 1; p <= n; p++) {
      const per = s.periods[p - 1];
      cells += `<div class="tt-time" style="grid-row:${p + 1}"><b>${p}</b><span>${esc(per.start)}</span></div>`;
      for (let d = 0; d < 5; d++) {
        cells += `<button class="tt-slot" style="grid-row:${p + 1};grid-column:${d + 2}" data-action="add-lesson" data-day="${d}" data-period="${p}" aria-label="${DAYS[d]} ${p}. Stunde hinzufügen">${ic('plus', 'i-sm')}</button>`;
      }
    }
    // Unterrichtsblöcke
    const nowM = nowMin();
    for (let d = 0; d < 5; d++) {
      const date = PL.addDays(monday, d), iso = PL.isoDate(date);
      PL.blocksOn(date).forEach((b) => {
        if (b.from > n) return;
        const sub = PL.subject(b.subjectId);
        const ev = evs.find((e) => e.date === iso && e.subjectId === b.subjectId);
        const live = iso === today && toMin(b.start) <= nowM && nowM <= toMin(b.end);
        cells += `<button class="tt-block ${live ? 'live' : ''}" style="--c:${sub.color};grid-column:${d + 2};grid-row:${b.from + 1} / span ${Math.min(b.to, n) - b.from + 1}" data-action="edit-lesson" data-ids="${b.ids.join(',')}">
          <b>${esc(sub.short)}</b>${b.room ? `<span>${esc(b.room)}</span>` : ''}${b.week ? `<i class="wk">${b.week}</i>` : ''}${ev ? `<em>● ${esc(ev.type)}</em>` : ''}
        </button>`;
      });
    }

    const range = `${monday.getDate()}. ${PL.MONTHS[monday.getMonth()]} – ${friday.getDate()}. ${PL.MONTHS[friday.getMonth()]}`;
    return `<div class="page view">
      ${pageHeadPlan('Kalender', seg)}
      <div class="week-nav">
        <button class="icon-btn" data-action="plan-week" data-v="-1" aria-label="Vorherige Woche">${ic('chevron-left')}</button>
        <div class="week-label"><b>KW ${PL.isoWeek(monday)}${wt ? ` · ${wt}-Woche` : ''}</b><span>${range}</span></div>
        <button class="icon-btn" data-action="plan-week" data-v="1" aria-label="Nächste Woche">${ic('chevron-right')}</button>
        ${PL.ui.planWeek !== 0 ? `<button class="btn btn-sm" data-action="plan-week" data-v="0">Heute</button>` : ''}
      </div>
      <section class="card tt-card">
        <div class="tt" style="grid-template-rows:auto repeat(${n}, var(--tt-row))">${cells}</div>
      </section>
      <p class="hint" style="margin:12px 4px 0">Tippe auf ein leeres Feld, um eine Stunde einzutragen. Doppelstunden werden automatisch zusammengefasst.${s.abWeeks ? '' : ' A/B-Wochen kannst du in den Einstellungen einschalten.'}</p>
    </div>`;
  };
  function pageHeadPlan(title, seg) {
    return `<header class="page-head"><div><div class="eyebrow">${seg}</div><h1 class="page-title">${title}</h1></div></header>`;
  }

  /* ================= Hausaufgaben ================= */
  PL.views.tasks = function () {
    const f = PL.ui.taskFilter;
    const today = PL.today();
    let list = st().tasks.slice();
    if (f === 'open') list = list.filter((t) => !t.done);
    if (f === 'done') list = list.filter((t) => t.done);
    list.sort((a, b) => (f === 'done' ? (b.due || '').localeCompare(a.due || '') : (a.due || '9').localeCompare(b.due || '9')) || (b.important - a.important));
    const groups = [];
    list.forEach((t) => {
      const key = !t.done && t.due && t.due < today ? 'overdue' : (t.due || 'none');
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, items: [] }; groups.push(g); }
      g.items.push(t);
    });
    const label = (k) => (k === 'overdue' ? 'Überfällig' : k === 'none' ? 'Ohne Datum' : dayLabel(k));
    const segBtn = (v, l) => `<button class="${f === v ? 'on' : ''}" data-action="task-filter" data-v="${v}">${l}</button>`;
    const openCount = st().tasks.filter((t) => !t.done).length;
    return `<div class="page view">
      <header class="page-head"><div><div class="eyebrow">${openCount} offen</div><h1 class="page-title">Aufgaben</h1></div>
</header>
      <div class="seg" style="margin-bottom:18px">${segBtn('open', 'Offen')}${segBtn('done', 'Erledigt')}${segBtn('all', 'Alle')}</div>
      <div style="max-width:760px">
      ${addTaskBtn('top')}
      ${groups.length ? groups.map((g) => `
        <div class="tl-group ${g.key === 'overdue' ? 'is-overdue' : ''}">
          <div class="tl-date">${label(g.key)}${g.key !== 'overdue' && g.key !== 'none' ? `<span>${PL.fmtDate(g.key)}</span>` : ''}</div>
          <div class="tasks card" style="padding:6px">${g.items.map((t) => taskRow(t)).join('')}</div>
        </div>`).join('')
        : `<div class="empty"><b>${f === 'done' ? 'Noch nichts erledigt' : 'Keine offenen Aufgaben'}</b>${f === 'done' ? '' : 'Neue Hausaufgaben trägst du oben mit „Hausaufgabe eintragen“ ein.'}</div>`}
      </div>
    </div>`;
  };

  PL.toggleTask = function (id) {
    const t = st().tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    PL.save();
    if (t.done) PL.toast('Erledigt', () => { t.done = false; PL.save(); });
  };

  /* ================= Sheets ================= */
  const segHtml = (opts, val) => opts.map(([v, l]) => `<button type="button" class="${String(v) === String(val) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('');
  function bindSeg(root, onPick) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || !root.contains(b)) return;
      root.querySelectorAll('button[data-v]').forEach((x) => x.classList.toggle('on', x === b));
      onPick(b.dataset.v);
    });
  }
  const subjChips = (subs, sel) => `<div class="chips" data-subjects>${subs.map((s) => `<button type="button" class="chip chip-subj ${s.id === sel ? 'on' : ''}" style="--c:${s.color}" data-id="${s.id}"><span class="sw"></span>${esc(s.short)} · ${esc(s.name)}</button>`).join('')}</div>`;
  function bindChips(sh, onPick) {
    const box = sh.querySelector('[data-subjects]');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      box.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      onPick(b.dataset.id);
    });
    const on = box.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /* Stunde(n) anlegen / bearbeiten */
  PL.lessonSheet = function (opts = {}) {
    const subs = PL.sortedSubjects();
    if (!subs.length) { PL.toast('Lege zuerst deine Fächer an'); return; }
    const s = st().settings, n = s.periods.length;
    const ids = opts.ids ? opts.ids.split(',') : [];
    const existing = ids.map((id) => st().lessons.find((l) => l.id === id)).filter(Boolean);
    const first = existing[0];
    const f = first
      ? { subjectId: first.subjectId, day: first.day, from: Math.min(...existing.map((l) => l.period)), to: Math.max(...existing.map((l) => l.period)), room: first.room || '', week: first.week || '' }
      : { subjectId: subs[0].id, day: Number(opts.day || 0), from: Number(opts.period || 1), to: Number(opts.period || 1), room: '', week: '' };
    if (!first) {
      // Doppelstunde vorschlagen, wenn die nächste Stunde frei ist
      const free = (p) => !st().lessons.some((l) => l.day === f.day && l.period === p);
      if (f.from % 2 === 1 && f.from + 1 <= n && free(f.from + 1)) f.to = f.from + 1;
    }
    const perOpts = (sel) => s.periods.map((p, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${i + 1}. Stunde (${esc(p.start)})</option>`).join('');
    PL.openSheet(`
      ${PL.sheetHead(first ? 'Stunde bearbeiten' : 'Stunde eintragen')}
      <div class="field"><span class="field-label">Fach</span>${subjChips(subs, f.subjectId)}</div>
      <div class="field"><span class="field-label">Tag</span><div class="seg seg-block" data-seg="day">${segHtml(DAYS.map((d, i) => [i, d]), f.day)}</div></div>
      <div class="field-row">
        <div class="field"><label for="lFrom">Von</label><select id="lFrom" class="select">${perOpts(f.from)}</select></div>
        <div class="field"><label for="lTo">Bis</label><select id="lTo" class="select">${perOpts(f.to)}</select></div>
      </div>
      <div class="field"><label for="lRoom">Raum</label><input id="lRoom" class="input" value="${esc(f.room)}" maxlength="20" placeholder="z. B. C127"></div>
      ${s.abWeeks ? `<div class="field"><span class="field-label">Rhythmus</span><div class="seg seg-block" data-seg="week">${segHtml([['', 'Jede Woche'], ['A', 'Nur A-Woche'], ['B', 'Nur B-Woche']], f.week)}</div></div>` : ''}
      <div class="sheet-foot">
        ${first ? `<button type="button" class="btn btn-danger" data-del style="flex:0 0 auto">${ic('trash', 'i-sm')}</button>` : ''}
        <button type="button" class="btn btn-primary" data-save>${ic('check', 'i-sm')} Speichern</button>
      </div>`, {
      onMount(sh) {
        bindChips(sh, (id) => { f.subjectId = id; });
        bindSeg(sh.querySelector('[data-seg="day"]'), (v) => { f.day = Number(v); });
        const wk = sh.querySelector('[data-seg="week"]');
        if (wk) bindSeg(wk, (v) => { f.week = v; });
        sh.querySelector('[data-save]').onclick = () => {
          let from = Number(sh.querySelector('#lFrom').value), to = Number(sh.querySelector('#lTo').value);
          if (to < from) [from, to] = [to, from];
          const room = sh.querySelector('#lRoom').value.trim();
          const week = f.week || null;
          // alte Einträge des Blocks entfernen, kollidierende Stunden ersetzen
          st().lessons = st().lessons.filter((l) => !ids.includes(l.id) &&
            !(l.day === f.day && l.period >= from && l.period <= to && (!week || !l.week || l.week === week)));
          for (let p = from; p <= to; p++) st().lessons.push({ id: PL.uid(), subjectId: f.subjectId, day: f.day, period: p, room, week });
          PL.save();
          PL.closeSheet();
          PL.toast(first ? 'Stunde aktualisiert' : 'Stunde eingetragen');
        };
        const del = sh.querySelector('[data-del]');
        if (del) del.onclick = () => {
          const removed = st().lessons.filter((l) => ids.includes(l.id));
          st().lessons = st().lessons.filter((l) => !ids.includes(l.id));
          PL.save(); PL.closeSheet();
          PL.toast('Stunde entfernt', () => { st().lessons.push(...removed); PL.save(); });
        };
      },
    });
  };

  /* Hausaufgabe anlegen / bearbeiten */
  PL.taskSheet = function (opts = {}) {
    const subs = PL.sortedSubjects();
    const ex = opts.id ? st().tasks.find((t) => t.id === opts.id) : null;
    const cur = PL.currentBlock();
    const startSubj = opts.subjectId || (cur && cur.subjectId) || (subs[0] && subs[0].id) || null;
    const f = ex ? Object.assign({}, ex) : { subjectId: startSubj, title: '', due: '', important: false, done: false };
    let next = f.subjectId ? PL.nextLessons(f.subjectId, 2) : [];
    if (!f.due) f.due = next[0] ? next[0].date : PL.isoDate(PL.addDays(new Date(), 1));
    const quickHtml = () => next.map((n, i) => `<button type="button" class="chip ${f.due === n.date ? 'on' : ''}" data-due="${n.date}">${i ? 'Übernächste Stunde' : 'Nächste Stunde'}</button>`).join('');
    // kleine Zeile unter der Auswahl: wann genau ist das?
    const dueHint = () => {
      if (!f.due) return '';
      const n = next.find((x) => x.date === f.due);
      const lbl = dayLabel(f.due);
      const date = /^(Heute|Morgen|Gestern)$/.test(lbl) ? `${lbl}, ${PL.fmtDate(f.due).replace(/ \d{4}$/, '')}` : lbl;
      if (n) { const b = n.block; return `${ic('clock', 'i-sm')} ${date} · ${b.from === b.to ? b.from + '.' : b.from + '.–' + b.to + '.'} Std. · ${esc(b.start)} Uhr${b.room ? ' · ' + esc(b.room) : ''}`; }
      if (!st().lessons.length) return `${date} · Trag deinen Stundenplan ein, dann wird die nächste Stunde automatisch gewählt.`;
      return date;
    };
    const subjName = (id) => { const s = PL.subject(id); return s ? s.name : ''; };
    PL.openSheet(`
      ${PL.sheetHead(ex ? 'Aufgabe bearbeiten' : 'Neue Hausaufgabe', !ex && cur && cur.subjectId === f.subjectId && !opts.subjectId ? `Aus deiner aktuellen Stunde: ${esc(subjName(cur.subjectId))}` : '')}
      ${subs.length ? `<div class="field"><span class="field-label">Fach</span>${subjChips(subs, f.subjectId)}</div>` : ''}
      <div class="field"><label for="tTitle">Was ist zu tun?</label><textarea id="tTitle" class="input" rows="2" maxlength="200" placeholder="z. B. Aufgabe 3 auf S. 42" autofocus>${esc(f.title)}</textarea></div>
      <div class="field"><span class="field-label">Bis wann?</span>
        <div class="chips due-chips" data-quick ${next.length ? '' : 'hidden'}>${quickHtml()}</div>
        <input id="tDue" class="input" type="date" value="${esc(f.due)}">
        <div class="due-hint" data-due-hint>${dueHint()}</div></div>
      <div class="opt-row"><div><div class="t">Wichtig</div><div class="d">Wird mit !!! markiert</div></div><label class="switch"><input type="checkbox" id="tImp" ${f.important ? 'checked' : ''}><span></span></label></div>
      <div class="sheet-foot">
        ${ex ? `<button type="button" class="btn btn-danger" data-del style="flex:0 0 auto">${ic('trash', 'i-sm')}</button>` : ''}
        <button type="button" class="btn btn-primary" data-save>${ic('check', 'i-sm')} Speichern</button>
      </div>`, {
      onMount(sh) {
        const due = sh.querySelector('#tDue'), qBox = sh.querySelector('[data-quick]');
        const hint = sh.querySelector('[data-due-hint]');
        const refreshQuick = () => { qBox.innerHTML = quickHtml(); qBox.hidden = !next.length; hint.innerHTML = dueHint(); };
        if (subs.length) bindChips(sh, (id) => {
          // war "Übernächste" gewählt, bleibt es dabei – sonst nächste Stunde
          const idx = Math.max(0, next.findIndex((n) => n.date === f.due));
          f.subjectId = id; next = PL.nextLessons(id, 2);
          if (!ex && next.length) { f.due = (next[idx] || next[0]).date; due.value = f.due; }
          refreshQuick();
        });
        qBox.addEventListener('click', (e) => { const b = e.target.closest('[data-due]'); if (!b) return; f.due = b.dataset.due; due.value = f.due; refreshQuick(); });
        due.onchange = () => { f.due = due.value; refreshQuick(); };
        sh.querySelector('[data-save]').onclick = () => {
          f.title = sh.querySelector('#tTitle').value.trim();
          f.important = sh.querySelector('#tImp').checked;
          f.due = due.value;
          if (!f.title) { PL.toast('Was ist zu tun?'); return; }
          PL.upsertTask(f);
          PL.closeSheet();
          PL.toast(ex ? 'Aufgabe aktualisiert' : 'Aufgabe gespeichert');
        };
        const del = sh.querySelector('[data-del]');
        if (del) del.onclick = () => { const t = PL.deleteTask(ex.id); PL.closeSheet(); PL.toast('Aufgabe gelöscht', () => PL.upsertTask(t)); };
      },
    });
  };

  /* Stundenzeiten bearbeiten */
  PL.periodsSheet = function () {
    let ps = st().settings.periods.map((p) => Object.assign({}, p));
    const rows = () => ps.map((p, i) => `<div class="period-row" data-i="${i}"><b>${i + 1}.</b>
        <input class="input" type="time" value="${esc(p.start)}" data-k="start" aria-label="Beginn ${i + 1}. Stunde">
        <span class="muted">–</span>
        <input class="input" type="time" value="${esc(p.end)}" data-k="end" aria-label="Ende ${i + 1}. Stunde">
        <button type="button" class="icon-btn" data-rm="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></div>`).join('');
    PL.openSheet(`${PL.sheetHead('Stundenzeiten', 'Beginn und Ende jeder Unterrichtsstunde')}
      <div data-rows>${rows()}</div>
      <button type="button" class="btn btn-sm" data-add style="margin:6px 0 14px">${ic('plus', 'i-sm')} Stunde hinzufügen</button>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-save>${ic('check', 'i-sm')} Speichern</button></div>`, {
      onMount(sh) {
        const box = sh.querySelector('[data-rows]');
        box.addEventListener('input', (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k) ps[Number(r.dataset.i)][e.target.dataset.k] = e.target.value; });
        box.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; ps.splice(Number(b.dataset.rm), 1); box.innerHTML = rows(); });
        sh.querySelector('[data-add]').onclick = () => {
          const last = ps[ps.length - 1];
          const add = (t, m) => { const x = toMin(t) + m; return String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
          ps.push(last ? { start: add(last.end, 5), end: add(last.end, 50) } : { start: '08:00', end: '08:45' });
          box.innerHTML = rows();
        };
        sh.querySelector('[data-save]').onclick = () => {
          if (!ps.length) { PL.toast('Mindestens eine Stunde nötig'); return; }
          st().settings.periods = ps;
          PL.save(); PL.closeSheet(); PL.toast('Stundenzeiten gespeichert');
        };
      },
    });
  };
})();
