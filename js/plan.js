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
  PL.blocksOn = function (date, opts) {
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
    if (PL.untis && !(opts && opts.raw)) {
      try { return PL.untis.annotate(date, blocks.map((b) => Object.assign({}, b, { ids: b.ids.slice() }))); }
      catch (e) { console.error('Untis-Anzeige', e); }
    }
    return blocks;
  };

  /* Die nächsten Unterrichtstage eines Fachs (ab morgen), je Tag der erste Block */
  PL.nextLessons = function (subjectId, count = 2) {
    const out = [];
    for (let i = 1; i <= 42 && out.length < count; i++) {
      const d = PL.addDays(new Date(), i);
      const b = PL.blocksOn(d).find((x) => x.subjectId === subjectId && !x.cancelled);
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

  /* ================= Ein Tag mit allem, was Untis weiß ================= */
  /* Liefert Stunden (aus dem Plan) und Zusätze (Klausuren, Vertretungen …),
     mit Status, Hausaufgaben und Spalte (lane), falls sich zwei überschneiden. */
  const NEUTRAL = '#64748B';
  PL.dayItems = function (date) {
    const iso = PL.isoDate(date);
    const blocks = PL.blocksOn(date).map((b) => Object.assign({ kind: 'lesson' }, b));
    let extras = [];
    try { extras = (PL.untis ? PL.untis.extrasOn(date, blocks) : []).map((x) => Object.assign({ kind: 'extra', ids: [] }, x)); }
    catch (e) { console.error('Untis-Zusätze', e); }
    // selbst eingetragene Klausuren/Tests färben die Stunde des Fachs
    st().events.filter((e) => e.date === iso && e.subjectId && /Klausur|Test|Abiprüfung/.test(e.type)).forEach((e) => {
      const name = e.type + (e.title ? ': ' + e.title : '');
      // Klausuren finden meist als Zusatzstunde in einem anderen Raum statt
      const xs = extras.filter((i) => i.subjectId === e.subjectId);
      if (xs.length) { xs.forEach((i) => { i.exam = true; i.examName = i.examName || name; }); return; }
      const b = blocks.find((i) => i.subjectId === e.subjectId && !i.cancelled) || blocks.find((i) => i.subjectId === e.subjectId);
      if (b) { b.exam = true; b.cancelled = false; b.examName = b.examName || name; }
    });
    const items = extras.concat(blocks);
    items.forEach((it) => {
      it.start = PL.period(it.from).start; it.end = PL.period(it.to).end;
      const sub = it.subjectId && PL.subject(it.subjectId);
      it.color = sub ? sub.color : NEUTRAL;
      it.short = sub ? sub.short : it.label;
      it.name = sub ? sub.name : it.label;
      it.status = it.exam ? 'exam' : it.eva ? 'eva' : it.cancelled ? 'off' : (it.newRoom || it.irregular || (it.origTeacher && it.teacher && it.origTeacher !== it.teacher)) ? 'chg' : '';
    });
    // offene Hausaufgaben, die zu dieser Stunde fällig sind
    st().tasks.filter((t) => !t.done && t.due === iso && t.subjectId).forEach((t) => {
      const it = items.find((i) => i.subjectId === t.subjectId && i.status !== 'off') || items.find((i) => i.subjectId === t.subjectId);
      if (it) (it.tasks = it.tasks || []).push(t);
    });
    // Überschneidungen nebeneinander: Neues (Klausur) links, die ausfallende Stunde rechts
    items.sort((a, b) => a.from - b.from || (a.kind === b.kind ? 0 : a.kind === 'extra' ? -1 : 1));
    items.forEach((it, i) => {
      it.lane = 0; it.lanes = 1;
      const over = items.slice(0, i).filter((o) => o.from <= it.to && it.from <= o.to);
      if (over.length) {
        it.lanes = 2; over.forEach((o) => { o.lanes = 2; });
        it.lane = over.some((o) => o.lane === 0) ? 1 : 0;
      }
    });
    return items;
  };

  const tagFor = (it) => (it.status === 'exam' ? ' <span class="tag tag-exam">KLAUSUR</span>' : it.status === 'eva' ? ' <span class="tag tag-eva">EVA</span>' : it.status === 'off' ? ' <span class="tag tag-off">ENTFÄLLT</span>' : it.status === 'chg' ? ` <span class="tag tag-chg">${it.newRoom ? 'RAUM' : it.kind === 'extra' ? 'ÄNDERUNG' : 'VERTRETUNG'}</span>` : '');
  const roomHtml = (it) => (it.newRoom ? `<b class="room-new">${esc(it.newRoom)}</b>${it.room ? ` <s>${esc(it.room)}</s>` : ''}` : esc(it.room || ''));
  const teacherHtml = (it) => {
    if (it.status === 'eva' && it.origTeacher) return `<s class="tch-off">${esc(it.origTeacher)}</s>`;
    if (it.origTeacher && it.teacher && it.origTeacher !== it.teacher) return `<b class="tch-new">${esc(it.teacher)}</b> <s>${esc(it.origTeacher)}</s>`;
    return esc(it.teacher || '');
  };

  /* ================= Karten für die Übersicht ================= */
  PL.scheduleCard = function () {
    const hasPlan = st().lessons.length > 0;
    let date = new Date(), items = PL.dayItems(date), label = 'Heute';
    const over = items.length && toMin(items[items.length - 1].end) < nowMin() && items.every((i) => toMin(i.end) < nowMin());
    if (!items.length || over) {
      for (let i = 1; i <= 7; i++) {
        const d = PL.addDays(new Date(), i), b = PL.dayItems(d);
        if (b.length) { date = d; items = b; label = i === 1 ? 'Morgen' : DAYS_LONG[(d.getDay() + 6) % 7]; break; }
      }
    }
    const isToday = label === 'Heute', now = nowMin();
    const wt = PL.weekType(date);
    const iso = PL.isoDate(date);
    const rows = items.map((it, idx) => {
      const live = isToday && it.status !== 'off' && toMin(it.start) <= now && now <= toMin(it.end);
      const past = isToday && toMin(it.end) < now;
      const tch = teacherHtml(it);
      return `<button class="lesson-row st-${it.status || 'ok'} ${live ? 'live' : ''} ${past ? 'past' : ''}" style="--c:${it.color}" data-action="lesson-info" data-date="${iso}" data-i="${idx}">
        <span class="lr-time num">${esc(it.start)}<small>${esc(it.end)}</small></span>
        <span class="lr-bar"></span>
        <span class="row-main"><span class="row-title" style="display:block">${esc(it.name)}${live ? ' <span class="tag tag-live">JETZT</span>' : ''}${tagFor(it)}${it.tasks ? ` <span class="tag tag-hw">${ic('tasks', 'i-sm')} ${it.tasks.length}</span>` : ''}</span>
          <span class="row-sub" style="display:block">${it.from === it.to ? it.from + '.' : it.from + '.–' + it.to + '.'} Std.${it.room || it.newRoom ? ' · ' + roomHtml(it) : ''}${tch ? ' · ' + tch : ''}${it.examName ? ' · ' + esc(it.examName) : it.info ? ' · ' + esc(it.info) : ''}</span></span>
      </button>`;
    }).join('');
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${ic('clock')} Stundenplan</h2><div class="card-sub">${hasPlan ? label + (wt ? ` · ${wt}-Woche` : '') : 'Noch nicht eingetragen'}</div></div><a class="link-btn" href="#/plan">Woche ${ic('chevron-right', 'i-sm')}</a></div>
      ${!hasPlan ? `<div class="empty"><b>Kein Stundenplan</b>Trag deine Stunden einmal ein – dann siehst du hier immer, was als Nächstes kommt.<br><a class="btn btn-sm btn-primary" href="#/plan" style="margin-top:12px">${ic('plus', 'i-sm')} Stundenplan anlegen</a></div>`
        : rows ? `<div class="list">${rows}</div>` : `<div class="empty">Diese Woche kein Unterricht mehr 🎉</div>`}
    </section>`;
  };

  /* ---------- OneNote-Seite an einer Hausaufgabe ----------
     In OneNote die Seite rechts anklicken bzw. gedrückt halten → „Link zu Seite kopieren“.
     Die OneNote-App kopiert oft zwei Links (https://… und onenote:https://…) – beides wird erkannt. */
  ['punktlandung:ms-token', 'punktlandung:ms-auth', 'punktlandung:onenote'].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* egal */ } }); // Reste der Microsoft-Anmeldung (bis 0.12)
  PL.parseOneNote = function (raw) {
    // Ein Link pro Zeile; OneNote-Links enthalten Leerzeichen (Seitentitel), daher nicht an Leerzeichen trennen
    const urls = String(raw || '').replace(/onenote:/gi, '\nonenote:').split(/[\r\n]+/)
      .map((l) => (l.match(/(onenote:)?https?:\/\/.*/i) || [''])[0].trim().replace(/ /g, '%20')).filter(Boolean);
    const web = urls.find((u) => !/^onenote:/i.test(u)) || '';
    const app = urls.find((u) => /^onenote:/i.test(u)) || '';
    if (!web && !app) return null;
    return { web, app }; // nur App-Link: der Pfad dahinter ist keine Webseite, daher kein „Im Browser“
  };
  const oneNoteApp = (x) => x.app || (/^https:\/\/[^/]*(sharepoint\.com|onedrive\.live\.com|1drv\.ms|onenote\.com)/i.test(x.web || '') ? 'onenote:' + x.web : '');
  PL.openOneNote = function (x, where) {
    if (!x) return;
    const app = oneNoteApp(x);
    if (where !== 'web' && app) location.href = app;
    else if (x.web) window.open(x.web, '_blank', 'noopener');
  };
  const oneNoteButtons = (x) => `<div class="on-actions">
      ${oneNoteApp(x) ? `<button type="button" class="btn btn-sm" data-on="app">${ic('notebook', 'i-sm')} In OneNote öffnen</button>` : ''}
      ${x.web ? `<button type="button" class="btn btn-sm" data-on="web">${ic('globe', 'i-sm')} Im Browser</button>` : ''}</div>`;

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
      ${t.onenote ? `<button class="icon-btn task-on" data-action="task-onenote" data-id="${t.id}" aria-label="OneNote-Seite öffnen" title="OneNote-Seite öffnen">${ic('notebook')}</button>` : ''}
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
  PL.ui.planEdit = false;
  PL.views.plan = function (mode) {
    if (mode) PL.ui.planMode = mode;
    const m = PL.ui.planMode;
    const seg = `<div class="seg"><button class="${m === 'week' ? 'on' : ''}" data-action="plan-mode" data-v="week">Stundenplan</button><button class="${m === 'events' ? 'on' : ''}" data-action="plan-mode" data-v="events">Termine</button></div>`;
    if (m === 'events') return PL.views.events(seg);

    const s = st().settings;
    const edit = PL.ui.planEdit || !st().lessons.length;
    const monday = PL.addDays(PL.mondayOf(new Date()), PL.ui.planWeek * 7);
    const friday = PL.addDays(monday, 4);
    const wt = PL.weekType(monday);
    const n = s.periods.length;
    const today = PL.today();
    if (PL.untis && !edit) PL.untis.ensureWeek(monday);
    const col = (d) => `${2 + 2 * d} / span 2`;
    const slide = PL.ui.planSlide; PL.ui.planSlide = null;
    // Termine (Klausuren, Tests, Referate …) als eigene Zeile über den Stunden
    const evCells = edit || !PL.weekEventCell ? [] : DAYS.map((_, i) => PL.weekEventCell(PL.isoDate(PL.addDays(monday, i))));
    const ev = evCells.some(Boolean) ? 1 : 0;

    let cells = '';
    cells += `<div class="tt-corner">${wt ? `<span class="ab-badge">${wt}</span>` : ''}</div>`;
    DAYS.forEach((d, i) => {
      const date = PL.addDays(monday, i);
      const isT = PL.isoDate(date) === today;
      cells += `<div class="tt-day ${isT ? 'today' : ''}" style="grid-column:${col(i)}"><span>${d}</span><b>${date.getDate()}</b></div>`;
      if (ev) cells += `<div class="tt-evs" style="grid-row:2;grid-column:${col(i)}">${evCells[i]}</div>`;
    });
    if (ev) cells += `<div class="tt-evs-lbl" style="grid-row:2">${ic('calendar', 'i-sm')}</div>`;
    for (let p = 1; p <= n; p++) {
      const per = s.periods[p - 1];
      cells += `<div class="tt-time" style="grid-row:${p + 1 + ev}"><b>${p}</b><span>${esc(per.start)}</span><span class="tt-end">${esc(per.end)}</span></div>`;
      for (let d = 0; d < 5; d++) {
        cells += edit
          ? `<button class="tt-slot" style="grid-row:${p + 1 + ev};grid-column:${col(d)}" data-action="add-lesson" data-day="${d}" data-period="${p}" aria-label="${DAYS[d]} ${p}. Stunde hinzufügen">${ic('plus', 'i-sm')}</button>`
          : `<div class="tt-cell" style="grid-row:${p + 1 + ev};grid-column:${col(d)}"></div>`;
      }
    }
    const nowM = nowMin();
    for (let d = 0; d < 5; d++) {
      const date = PL.addDays(monday, d), iso = PL.isoDate(date);
      if (edit) {
        // Bearbeiten: nur der feste Plan, ohne Untis-Änderungen
        PL.blocksOn(date, { raw: true }).forEach((b) => {
          if (b.from > n) return;
          const sub = PL.subject(b.subjectId);
          cells += `<button class="tt-block editing" style="--c:${sub.color};grid-column:${col(d)};grid-row:${b.from + 1} / span ${Math.min(b.to, n) - b.from + 1}" data-action="edit-lesson" data-ids="${b.ids.join(',')}">
            <b>${esc(sub.short)}</b>${b.room ? `<span>${esc(b.room)}</span>` : ''}${b.week ? `<i class="wk">${b.week}</i>` : ''}<i class="ed">${ic('edit', 'i-sm')}</i></button>`;
        });
        continue;
      }
      PL.dayItems(date).forEach((it, idx) => {
        if (it.from > n) return;
        const live = iso === today && it.status !== 'off' && toMin(it.start) <= nowM && nowM <= toMin(it.end);
        const gc = it.lanes === 2 ? `${2 + 2 * d + it.lane} / span 1` : col(d);
        const tch = teacherHtml(it);
        const label = it.status === 'exam' ? 'Klausur' : it.status === 'eva' ? 'EVA' : it.status === 'off' ? 'Entfällt' : it.status === 'chg' ? (it.newRoom ? 'Raum' : it.kind === 'extra' ? 'Änderung' : 'Vertretung') : '';
        cells += `<button class="tt-block st-${it.status || 'ok'} ${live ? 'live' : ''} ${it.lanes === 2 ? 'half' : ''}" style="--c:${it.color};grid-column:${gc};grid-row:${it.from + 1 + ev} / span ${Math.min(it.to, n) - it.from + 1}" data-action="lesson-info" data-date="${iso}" data-i="${idx}">
          <b>${esc(it.short)}</b>${label ? `<em>${label}</em>` : ''}${it.room || it.newRoom ? `<span class="rm">${roomHtml(it)}</span>` : ''}${tch ? `<span class="tch">${tch}</span>` : ''}${it.week ? `<i class="wk">${it.week}</i>` : ''}${it.tasks ? `<i class="hw" title="Hausaufgabe fällig">${ic('tasks', 'i-sm')}${it.tasks.length > 1 ? it.tasks.length : ''}</i>` : ''}
        </button>`;
      });
    }

    const range = `${monday.getDate()}. ${PL.MONTHS[monday.getMonth()]} – ${friday.getDate()}. ${PL.MONTHS[friday.getMonth()]}`;
    const legend = PL.untis && PL.untis.connected() && !edit
      ? `<div class="tt-legend"><span class="lg off">Entfall</span><span class="lg moved">Raum-/Lehreränderung</span><span class="lg eva">EVA</span><span class="lg exam">Klausur</span>${ev ? `<span class="lg ev">${ic('calendar', 'i-sm')} Termine der Woche</span>` : ''}<span class="lg hw">${ic('tasks', 'i-sm')} Hausaufgabe</span></div>` : '';
    const hint = edit
      ? `Tippe auf ein leeres Feld, um eine Stunde einzutragen, oder auf eine Stunde, um sie zu ändern. Doppelstunden werden automatisch zusammengefasst.${s.abWeeks ? '' : ' A/B-Wochen kannst du in den Einstellungen einschalten.'}`
      : `Tippe auf eine Stunde für Details, wische für die nächste Woche.${PL.untis && PL.untis.connected() ? (PL.untis.error ? ` <span style="color:var(--danger)">Untis: ${esc(PL.untis.error)}</span>` : ' Änderungen kommen live aus Untis.') : ' Mit Untis (Einstellungen) siehst du hier auch Ausfälle und Klausuren.'}`;
    return `<div class="page view">
      ${pageHeadPlan('Kalender', seg)}
      <div class="week-nav">
        <button class="icon-btn" data-action="plan-week" data-v="-1" aria-label="Vorherige Woche">${ic('chevron-left')}</button>
        <div class="week-label"><b>KW ${PL.isoWeek(monday)}${wt ? ` · ${wt}-Woche` : ''}</b><span>${range}</span></div>
        <button class="icon-btn" data-action="plan-week" data-v="1" aria-label="Nächste Woche">${ic('chevron-right')}</button>
        ${PL.ui.planWeek !== 0 ? `<button class="btn btn-sm" data-action="plan-week" data-v="0">Heute</button>` : ''}
        ${st().lessons.length ? `<button class="btn btn-sm ${edit ? 'btn-primary' : ''} plan-edit-btn" data-action="plan-edit">${edit ? `${ic('check', 'i-sm')} Fertig` : `${ic('edit', 'i-sm')} Bearbeiten`}</button>` : ''}
      </div>
      ${edit && st().lessons.length ? `<div class="edit-banner">${ic('edit', 'i-sm')} Bearbeiten – Änderungen gelten jede Woche</div>` : ''}
      <section class="card tt-card ${edit ? 'is-edit' : ''} ${slide ? 'slide-' + slide : ''}" data-swipe-week>
        <div class="tt" style="grid-template-rows:auto${ev ? ' auto' : ''} repeat(${n}, var(--tt-row))">${cells}</div>
      </section>
      ${legend}
      <p class="hint" style="margin:12px 4px 0">${hint}</p>
    </div>`;
  };

  /* Details einer Stunde (Ansichtsmodus) */
  PL.lessonInfoSheet = function (iso, idx) {
    const date = PL.parseDate(iso);
    const it = PL.dayItems(date)[Number(idx)];
    if (!it) return;
    const rows = [];
    const row = (cls, t, d) => rows.push(`<div class="info-row ${cls}"><b>${t}</b><span>${d}</span></div>`);
    if (it.status === 'exam') row('exam', 'Klausur', esc(it.examName || 'In Untis als Prüfung eingetragen'));
    if (it.status === 'eva') row('eva', 'EVA', 'Eigenverantwortliches Arbeiten – ohne Lehrkraft');
    if (it.status === 'off') row('off', 'Entfällt', 'Die Stunde findet nicht statt');
    if (it.newRoom) row('moved', 'Raumänderung', `${esc(it.newRoom)}${it.room ? ` statt ${esc(it.room)}` : ''}`);
    if (it.origTeacher && it.teacher && it.origTeacher !== it.teacher) row('moved', 'Vertretung', `${esc(it.teacher)} statt ${esc(it.origTeacher)}`);
    if (it.info && it.info !== it.examName) row('', 'Hinweis', esc(it.info));
    const sub = it.subjectId && PL.subject(it.subjectId);
    const tasks = (it.tasks || []);
    PL.openSheet(`
      ${PL.sheetHead(esc(it.name), `${DAYS_LONG[(date.getDay() + 6) % 7]}, ${PL.fmtDate(iso)} · ${it.from === it.to ? it.from + '.' : it.from + '.–' + it.to + '.'} Std. · ${esc(it.start)}–${esc(it.end)} Uhr`)}
      <div class="info-grid">
        ${it.room || it.newRoom ? `<div><span class="hint">Raum</span><b>${roomHtml(it)}</b></div>` : ''}
        ${it.teacher || it.origTeacher ? `<div><span class="hint">Lehrkraft</span><b>${teacherHtml(it)}</b></div>` : sub && sub.teacher ? `<div><span class="hint">Lehrkraft</span><b>${esc(sub.teacher)}</b></div>` : ''}
        ${it.week ? `<div><span class="hint">Rhythmus</span><b>Nur ${it.week}-Woche</b></div>` : ''}
      </div>
      ${rows.join('')}
      ${tasks.length ? `<div class="field-label" style="margin-top:14px">Bis zu dieser Stunde fällig</div>
        <div class="tasks card" style="padding:6px">${tasks.map((t) => `<button class="task-main" data-action="open-task" data-id="${t.id}" style="padding:10px"><span class="task-title">${esc(t.title)}</span></button>`).join('')}</div>` : ''}
      <div class="sheet-foot" style="margin-top:16px">
        ${it.kind === 'lesson' ? `<button type="button" class="btn" data-action="edit-lesson" data-ids="${(it.allIds || it.ids).join(',')}" style="flex:0 0 auto">${ic('edit', 'i-sm')} Stunde ändern</button>` : ''}
        ${sub ? `<button type="button" class="btn btn-primary" data-action="add-task" data-subject="${sub.id}">${ic('plus', 'i-sm')} Hausaufgabe</button>` : `<button type="button" class="btn btn-primary" data-action="close-sheet">OK</button>`}
      </div>`);
  };

  /* Woche wechseln: wischen (Handy/iPad) oder Pfeiltasten (PC) */
  PL.changeWeek = function (step) {
    PL.ui.planWeek += step;
    PL.ui.planSlide = step > 0 ? 'next' : 'prev';
    PL.render();
  };
  (function swipeWeeks() {
    let x0 = null, y0 = 0, t0 = 0, horizontal = false, target = null, step = null;
    document.addEventListener('touchstart', (e) => {
      const card = e.target.closest('[data-swipe-week], [data-swipe-month]');
      if (!card || e.touches.length !== 1) { x0 = null; return; }
      target = card.matches('[data-swipe-month]') ? card : card.querySelector('.tt');
      step = card.matches('[data-swipe-month]') ? PL.changeMonth : PL.changeWeek;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); horizontal = false;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (!horizontal && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { x0 = null; return; }  // scrollt senkrecht
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) horizontal = true;
      const card = target;
      if (horizontal && card) { card.style.transition = 'none'; card.style.transform = `translateX(${dx * 0.35}px)`; card.style.opacity = String(1 - Math.min(0.4, Math.abs(dx) / 600)); }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      const fast = Date.now() - t0 < 700;
      x0 = null;
      const card = target;
      const reset = () => { if (card) { card.style.transition = 'transform .18s ease, opacity .18s ease'; card.style.transform = ''; card.style.opacity = ''; } };
      if (horizontal && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3 && (fast || Math.abs(dx) > 120)) {
        // nach links wischen = nächste Woche
        step(dx < 0 ? 1 : -1);
      } else reset();
    });
    document.addEventListener('keydown', (e) => {
      const go = document.querySelector('[data-swipe-week]') ? PL.changeWeek : document.querySelector('[data-swipe-month]') ? PL.changeMonth : null;
      if (!go || !document.getElementById('sheetLayer').hidden) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
  })();

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'lesson-info': (d) => PL.lessonInfoSheet(d.date, d.i),
    'plan-edit': () => { PL.ui.planEdit = !(PL.ui.planEdit || !st().lessons.length); PL.render(); },
    'task-onenote': (d) => { const t = st().tasks.find((x) => x.id === d.id); if (t) PL.openOneNote(t.onenote); },
  });

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
      <div class="field"><label for="tOn">OneNote-Seite <span class="muted" style="font-weight:500">(optional)</span></label>
        <input id="tOn" class="input" value="${esc(f.onenote ? f.onenote.web || f.onenote.app : '')}" placeholder="Link zur Seite einfügen" autocomplete="off" inputmode="url">
        <div class="due-hint">In OneNote die Seite rechts anklicken bzw. gedrückt halten → „Link zu Seite kopieren“</div>
        ${f.onenote ? oneNoteButtons(f.onenote) : ''}</div>
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
        sh.querySelectorAll('[data-on]').forEach((b) => { b.onclick = () => PL.openOneNote(f.onenote, b.dataset.on); });
        sh.querySelector('[data-save]').onclick = () => {
          f.title = sh.querySelector('#tTitle').value.trim();
          f.important = sh.querySelector('#tImp').checked;
          f.due = due.value;
          if (!f.title) { PL.toast('Was ist zu tun?'); return; }
          const rawOn = sh.querySelector('#tOn').value.trim();
          const on = rawOn ? PL.parseOneNote(rawOn) : null;
          if (rawOn && !on) { PL.toast('Bitte füge den Link zur OneNote-Seite ein (beginnt mit https://)'); return; }
          // unveränderten Link (mit App-Link) behalten
          if (on && f.onenote && on.web && on.web === f.onenote.web && !on.app) on.app = f.onenote.app;
          if (on) f.onenote = on; else delete f.onenote;
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
