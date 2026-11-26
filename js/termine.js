/* Termine & Prüfungen: nächste Prüfung, Monatskalender und Liste */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  Object.assign(PL.ui, { evMonth: 0, evFilter: 'all', evDay: null });

  /* Art eines Termins → Farbe/Form (Abi und Klausur kräftig, Test/Referat heller, Sonstiges neutral) */
  const KIND = { 'Abiprüfung': 'abi', 'Klausur': 'exam', 'Test': 'test', 'Referat': 'talk' };
  PL.eventKind = (e) => KIND[e.type] || 'misc';
  const isBig = (e) => /Klausur|Abiprüfung/.test(e.type || '');
  const isGraded = (e) => !!PL.LOAD_WEIGHTS[e.type];
  const FILTERS = [['all', 'Alle'], ['exam', 'Klausuren'], ['small', 'Tests & Referate'], ['misc', 'Sonstiges']];
  const matches = (e, f) => f === 'all' || (f === 'exam' ? isBig(e) : f === 'small' ? /Test|Referat/.test(e.type) : !isGraded(e));

  /* Wann genau? Stunde, Uhrzeit und Raum aus Stundenplan bzw. Untis */
  PL.eventSlot = function (e) {
    if (!e || !e.subjectId || !e.date) return null;
    let items;
    try { items = PL.dayItems(PL.parseDate(e.date)); } catch (_) { return null; }
    const it = items.find((i) => i.subjectId === e.subjectId && i.status === 'exam')
      || items.find((i) => i.subjectId === e.subjectId && i.status !== 'off');
    if (!it) return null;
    return { from: it.from, to: it.to, start: it.start, end: it.end, room: it.newRoom || it.room || '' };
  };
  const slotText = (s) => (s ? [`${s.from === s.to ? s.from + '.' : s.from + '.–' + s.to + '.'} Std.`, s.start && `${s.start} Uhr`, s.room].filter(Boolean).map(esc).join(' · ') : '');
  PL.eventSlotText = (e) => slotText(PL.eventSlot(e));

  const shortDay = (iso) => { const d = PL.parseDate(iso); return `${WD[d.getDay()]}, ${d.getDate()}. ${PL.MONTHS[d.getMonth()]}`; };
  const longDay = (iso) => { const d = PL.parseDate(iso); return `${WD_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS_LONG[d.getMonth()]}`; };
  PL.eventDayLabel = shortDay;

  /* Name des Termins: Fach vorne, Titel dahinter (ohne Dopplung wie „Klausur – Klausur“) */
  PL.eventName = function (e) {
    const sub = PL.subject(e.subjectId);
    // „Klausur – Lyrik“ → „Lyrik“: die Art steht ohnehin als Schild daneben
    const t = (e.title && e.title !== e.type ? e.title : '').replace(new RegExp('^' + (e.type || '') + '\\s*[–:-]\\s*'), '');
    return sub ? sub.name + (t ? ' – ' + t : '') : (t || e.type);
  };
  const filesOf = (e) => { try { return PL.files && PL.isExamEvent(e) ? PL.files.notesForExam(e.id).length : 0; } catch (_) { return 0; } };
  const cdClass = (n) => (n <= 0 ? 'today' : n <= 3 ? 'soon' : '');
  /* Inhalt der kleinen Kalender-Kästchen: Fachkürzel + Art, ohne Fach der Titel */
  const pill = (e) => {
    const s = PL.subject(e.subjectId);
    return s ? `<b>${esc(s.short)}</b><span>${esc(e.type)}</span>` : `<span class="only">${esc(e.title || e.type)}</span>`;
  };
  const typeTag = (e) => `<span class="ev-type k-${PL.eventKind(e)}">${esc(e.type)}</span>`;

  /* Datum als Kästchen in Fachfarbe: Wochentag, Tag, Monat */
  const dateBox = (e) => {
    const d = PL.parseDate(e.date), sub = PL.subject(e.subjectId);
    return `<div class="date-box ev-date k-${PL.eventKind(e)}" ${sub ? `style="--c:${sub.color}"` : ''}><div class="w">${WD[d.getDay()]}</div><div class="d">${d.getDate()}</div><div class="m">${PL.MONTHS[d.getMonth()]}</div></div>`;
  };

  /* Eine Zeile pro Termin (Übersicht, Liste, ausgewählter Tag) */
  PL.eventRow = function (e, opts = {}) {
    const n = PL.daysUntil(e.date);
    const slot = opts.slot === false ? '' : PL.eventSlotText(e);
    const files = filesOf(e);
    const meta = [opts.day ? esc(shortDay(e.date)) : '', slot, files ? `${ic('file', 'i-sm')} ${files}` : ''].filter(Boolean).join(' · ');
    const sub = typeTag(e) + (meta ? `<span class="ev-meta">${meta}</span>` : '');
    return `<button class="row row-click ev-row" data-action="open-event" data-id="${e.id}">
      ${dateBox(e)}
      <span class="row-main"><span class="row-title ev-title">${esc(PL.eventName(e))}</span>
      <span class="row-sub ev-sub">${sub}</span></span>
      <span class="countdown ${cdClass(n)}">${PL.relDays(n)}</span></button>`;
  };

  /* ---------- Nächste Prüfung ---------- */
  function heroHtml(up) {
    const exams = up.filter(isGraded);
    const e = exams[0];
    if (!e) return '';
    const n = PL.daysUntil(e.date), sub = PL.subject(e.subjectId);
    const slot = PL.eventSlotText(e), files = filesOf(e);
    const big = n === 0 ? 'Heute' : n === 1 ? 'Morgen' : String(n);
    const after = exams.slice(1, 4).map((x) => {
      const s = PL.subject(x.subjectId);
      return `<button type="button" class="ev-next" data-action="open-event" data-id="${x.id}" ${s ? `style="--c:${s.color}"` : ''}>
        <b>${esc(s ? s.short : x.type.charAt(0))}</b><span>${esc(x.type)} · ${esc(shortDay(x.date))}</span><em>${PL.relDays(PL.daysUntil(x.date))}</em></button>`;
    }).join('');
    // wie viele große Prüfungen in den nächsten 14 Tagen?
    const soon = exams.filter((x) => PL.daysUntil(x.date) <= 14).length;
    return `<section class="card ev-hero k-${PL.eventKind(e)}" ${sub ? `style="--c:${sub.color}"` : ''}>
      <button type="button" class="ev-hero-main" data-action="open-event" data-id="${e.id}">
        <div class="ev-hero-txt">
          <div class="ev-hero-eyebrow">Nächste${e.type === 'Test' ? 'r' : e.type === 'Referat' ? 's' : ''} ${esc(e.type)}</div>
          <div class="ev-hero-title">${esc(PL.eventName(e))}</div>
          <div class="ev-hero-when">${ic('calendar', 'i-sm')} ${esc(longDay(e.date))}</div>
          ${slot ? `<div class="ev-hero-when">${ic('clock', 'i-sm')} ${slot}</div>` : ''}
          <div class="ev-hero-tags">${files ? `<span class="tag">${ic('file', 'i-sm')} ${files} ${files === 1 ? 'Datei' : 'Dateien'}</span>` : ''}${soon > 1 ? `<span class="tag">${soon} Prüfungen in 2 Wochen</span>` : ''}</div>
        </div>
        <div class="ev-hero-count ${cdClass(n)}"><b class="num">${big}</b>${n > 1 ? '<span>Tage</span>' : ''}</div>
      </button>
      ${after ? `<div class="ev-hero-after"><div class="ev-hero-lbl">Danach</div><div class="ev-next-list">${after}</div></div>` : ''}
    </section>`;
  }

  /* ---------- Monatskalender ---------- */
  function monthHtml(evs) {
    const base = new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
    base.setMonth(base.getMonth() + PL.ui.evMonth);
    const y = base.getFullYear(), m = base.getMonth();
    const first = PL.mondayOf(base);
    const last = new Date(y, m + 1, 0);
    const weeks = Math.ceil((PL.addDays(PL.mondayOf(last), 7) - first) / (7 * 864e5));
    const today = PL.today(), sel = PL.ui.evDay;
    const slide = PL.ui.evSlide; PL.ui.evSlide = null;
    const byDay = {};
    evs.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });
    const monthEvs = evs.filter((e) => { const d = PL.parseDate(e.date); return d.getFullYear() === y && d.getMonth() === m; });

    let cells = `<span class="mc-kw"></span>` + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d, i) => `<span class="mc-wd ${i > 4 ? 'we' : ''}">${d}</span>`).join('');
    for (let w = 0; w < weeks; w++) {
      const mon = PL.addDays(first, w * 7);
      cells += `<span class="mc-kw">${PL.isoWeek(mon)}</span>`;
      for (let k = 0; k < 7; k++) {
        const d = PL.addDays(mon, k), iso = PL.isoDate(d);
        const list = (byDay[iso] || []).slice().sort((a, b) => (PL.LOAD_WEIGHTS[b.type] || 0) - (PL.LOAD_WEIGHTS[a.type] || 0));
        const pills = list.slice(0, 2).map((e) => {
          const s = PL.subject(e.subjectId);
          return `<i class="mc-ev k-${PL.eventKind(e)}" ${s ? `style="--c:${s.color}"` : ''}>${pill(e)}</i>`;
        }).join('') + (list.length > 2 ? `<i class="mc-more">+${list.length - 2}</i>` : '');
        const cls = ['mc-day', d.getMonth() !== m && 'out', k > 4 && 'we', iso === today && 'today', iso === sel && 'sel', iso < today && 'past', list.length && 'has'].filter(Boolean).join(' ');
        const label = `${longDay(iso)}${list.length ? ': ' + list.map((e) => e.type + ' ' + PL.eventName(e)).join(', ') : ''}`;
        cells += `<button type="button" class="${cls}" data-action="ev-day" data-date="${iso}" aria-label="${esc(label)}" title="${esc(label)}"><span class="n">${d.getDate()}</span><span class="mc-evs">${pills}</span></button>`;
      }
    }
    const n = (t) => monthEvs.filter((e) => e.type === t).length;
    const sum = [['Abiprüfung', 'Abiprüfung', 'Abiprüfungen'], ['Klausur', 'Klausur', 'Klausuren'], ['Test', 'Test', 'Tests'], ['Referat', 'Referat', 'Referate']]
      .map(([t, one, many]) => n(t) && `${n(t)} ${n(t) === 1 ? one : many}`).filter(Boolean).join(' · ') || 'Keine Prüfungen';

    let dayPanel = '';
    if (sel) {
      const list = byDay[sel] || [];
      const tasks = st().tasks.filter((t) => !t.done && t.due === sel);
      dayPanel = `<div class="mc-panel">
        <div class="mc-panel-head"><b>${esc(longDay(sel))}</b><span>${PL.relDays(PL.daysUntil(sel))}</span></div>
        ${list.length ? `<div class="list">${list.map((e) => PL.eventRow(e)).join('')}</div>` : '<p class="hint" style="margin:2px 0 8px">Kein Termin an diesem Tag.</p>'}
        ${tasks.length ? `<div class="mc-tasks">${ic('tasks', 'i-sm')} ${tasks.length} ${tasks.length === 1 ? 'Hausaufgabe' : 'Hausaufgaben'} fällig: ${tasks.slice(0, 3).map((t) => esc(t.title)).join(', ')}${tasks.length > 3 ? ' …' : ''}</div>` : ''}
        <button type="button" class="btn btn-sm" data-action="add-event" data-date="${sel}" style="margin-top:8px">${ic('plus', 'i-sm')} Termin an diesem Tag</button>
      </div>`;
    }
    return `<section class="card mcal-card">
      <div class="mcal-head">
        <button class="icon-btn" data-action="ev-month" data-v="-1" aria-label="Vorheriger Monat">${ic('chevron-left')}</button>
        <div class="mcal-title"><b>${MONTHS_LONG[m]} ${y}</b><span>${sum}</span></div>
        <button class="icon-btn" data-action="ev-month" data-v="1" aria-label="Nächster Monat">${ic('chevron-right')}</button>
        ${PL.ui.evMonth !== 0 ? `<button class="btn btn-sm" data-action="ev-month" data-v="0">Heute</button>` : ''}
      </div>
      <div class="mcal ${slide ? 'slide-' + slide : ''}" data-swipe-month>${cells}</div>
      <div class="mcal-legend"><span class="k-abi">Abiprüfung</span><span class="k-exam">Klausur</span><span class="k-test">Test/Referat</span><span class="k-misc">Sonstiges</span></div>
      ${dayPanel}
    </section>`;
  }

  /* ---------- Ansicht ---------- */
  PL.views.events = function (seg) {
    const today = PL.today();
    const all = st().events.slice().sort((a, b) => a.date.localeCompare(b.date) || (PL.LOAD_WEIGHTS[b.type] || 0) - (PL.LOAD_WEIGHTS[a.type] || 0));
    const f = PL.ui.evFilter;
    const evs = all.filter((e) => matches(e, f));
    const up = evs.filter((e) => e.date >= today);
    const past = evs.filter((e) => e.date < today).reverse();
    const upAll = all.filter((e) => e.date >= today);

    // anstehende Termine nach Monat gruppiert
    const groups = [];
    up.forEach((e) => {
      const d = PL.parseDate(e.date), key = d.getFullYear() * 12 + d.getMonth();
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, label: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`, items: [] }; groups.push(g); }
      g.items.push(e);
    });
    const count = (arr) => { const b = arr.filter(isBig).length; return b ? `${b} ${b === 1 ? 'Klausur' : 'Klausuren'}${arr.length > b ? ` · ${arr.length} gesamt` : ''}` : `${arr.length}`; };
    const chip = ([v, l]) => `<button class="chip ${f === v ? 'on' : ''}" data-action="ev-filter" data-v="${v}">${l}</button>`;
    const list = groups.length ? groups.map((g) => `
        <div class="sec-title">${g.label}<span>${count(g.items)}</span></div>
        <section class="card ev-list">${g.items.map((e) => PL.eventRow(e)).join('')}</section>`).join('')
      : `<div class="empty">${all.length ? `<b>Nichts Anstehendes</b>${f === 'all' ? 'Keine kommenden Termine.' : 'In dieser Auswahl steht nichts an.'}` : '<b>Keine Termine</b>Trag Klausuren, Tests und Abiprüfungen ein – sie erscheinen mit Countdown in deiner Übersicht.'}<br><button class="btn btn-primary btn-sm" data-action="add-event">${ic('plus', 'i-sm')} Termin anlegen</button></div>`;
    const pastHtml = past.length ? `<details class="ev-past" ${PL.ui.evPastOpen ? 'open' : ''} data-past>
        <summary class="sec-title">Vergangen<span>${past.length} ${ic('chevron-down', 'i-sm')}</span></summary>
        <section class="card ev-list">${past.map((e) => `<div class="row ev-row">${dateBox(e)}
          <button class="row-main" data-action="open-event" data-id="${e.id}" style="text-align:left"><span class="row-title" style="display:block">${esc(PL.eventName(e))}</span>
          <span class="row-sub ev-sub">${typeTag(e)}<span class="ev-meta">${PL.relDays(PL.daysUntil(e.date))}</span></span></button>
          ${isGraded(e) ? `<button class="btn btn-sm" data-action="event-grade" data-id="${e.id}">${ic('plus', 'i-sm')} Note</button>` : ''}</div>`).join('')}</section>
      </details>` : '';

    return `<div class="page view">
      <header class="page-head"><div><div class="eyebrow">${seg || ''}</div><h1 class="page-title">Kalender</h1></div>
        <button class="btn btn-primary" data-action="add-event">${ic('plus', 'i-sm')} Termin</button></header>
      <div class="ev-layout">
        <div class="ev-col">
          ${heroHtml(upAll)}
          ${monthHtml(evs)}
        </div>
        <div class="ev-col">
          <div class="chips" style="margin-bottom:12px">${FILTERS.map(chip).join('')}</div>
          ${list}
          ${pastHtml}
        </div>
      </div>
      ${all.length || st().tasks.some((t) => !t.done) ? `<div class="ev-load">${PL.workloadCard(8)}</div>` : ''}
    </div>`;
  };

  /* Monat wechseln: Pfeile, Wischen (siehe plan.js) oder Pfeiltasten */
  PL.changeMonth = function (step) {
    PL.ui.evSlide = (step === 0 ? -PL.ui.evMonth : step) > 0 ? 'next' : 'prev';
    PL.ui.evMonth = step === 0 ? 0 : PL.ui.evMonth + step;
    PL.ui.evDay = null;
    PL.render();
  };

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'ev-month': (d) => PL.changeMonth(Number(d.v)),
    'ev-filter': (d) => { PL.ui.evFilter = d.v; PL.render(); },
    'ev-day': (d) => {
      PL.ui.evDay = PL.ui.evDay === d.date ? null : d.date;
      PL.render();
      if (PL.ui.evDay) { const p = document.querySelector('.mc-panel'); if (p && p.getBoundingClientRect().bottom > window.innerHeight) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    },
  });
  // „Vergangen“ bleibt beim Neuzeichnen auf/zu
  document.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('[data-past]')) PL.ui.evPastOpen = e.target.open; }, true);

  /* Wochenplan: Termine eines Tages als eigene Zeile über den Stunden */
  PL.weekEventCell = function (iso) {
    const list = st().events.filter((e) => e.date === iso).sort((a, b) => (PL.LOAD_WEIGHTS[b.type] || 0) - (PL.LOAD_WEIGHTS[a.type] || 0));
    return list.map((e) => {
      const s = PL.subject(e.subjectId);
      return `<button type="button" class="tt-ev k-${PL.eventKind(e)}" ${s ? `style="--c:${s.color}"` : ''} data-action="open-event" data-id="${e.id}" title="${esc(e.type + ': ' + PL.eventName(e))}">${pill(e)}</button>`;
    }).join('');
  };
})();
