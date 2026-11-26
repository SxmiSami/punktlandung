/* Ansichten (Views) – geben HTML-Strings zurück */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;
  PL.ui = { subjFilter: 'all', detailSem: null, goal: 1.5, setup: null };

  PL.NAV = [
    { id: '', label: 'Übersicht', icon: 'home' },
    { id: 'neu', label: 'Neuigkeiten', icon: 'bell', noTab: true },
    { id: 'faecher', label: 'Fächer', icon: 'layers' },
    { id: 'plan', label: 'Kalender', icon: 'calendar' },
    { id: 'aufgaben', label: 'Aufgaben', icon: 'tasks' },
    { id: 'dateien', label: 'Dateien', icon: 'file' },
    { id: 'chat', label: 'Chat', icon: 'chat' },
    { id: 'abitur', label: 'Abitur', icon: 'cap' },
  ];

  const semPill = () => `<button class="hero-pill sem-switch" data-action="cycle-sem" title="Halbjahr wechseln" style="background:var(--accent-soft);color:var(--accent-2)">${esc(PL.semName(st().settings.currentSem))} ${ic('chevron-down', 'i-sm')}</button>`;

  function pageHead(eyebrow, title, actions = '') {
    return `<header class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1></div><div class="head-actions">${actions}</div></header>`;
  }
  const settingsBtnHtml = () => `<a class="icon-btn hide-desk" href="#/einstellungen" aria-label="Einstellungen">${ic('settings')}${PL.syncDot()}</a>`;

  /* ================= Willkommen ================= */
  PL.views = {};
  PL.views.welcome = () => `
    <div class="welcome view"><div class="welcome-inner">
      <div class="welcome-logo" aria-hidden="true"></div>
      <h1>Dein Abi.<br><span>Auf den Punkt.</span></h1>
      <p>Trag deine Noten ein, behalte Q1 und Q2 im Blick und sieh live, auf welchen Abischnitt du zusteuerst.</p>
      <div class="welcome-actions">
        <button class="btn btn-primary" data-action="setup">${ic('sparkle')} Fächer einrichten</button>
        <button class="btn" data-action="import">${ic('upload', 'i-sm')} Datei importieren</button>
        <button class="btn" data-action="demo">Mit Beispieldaten ausprobieren</button>
        ${PL.sync.enabled && !PL.sync.user ? `<button class="btn btn-ghost" data-action="login">Schon ein Konto? <b style="color:var(--accent-2)">Anmelden</b></button>` : ''}
      </div>
      <div class="feature-list">
        <div>${ic('trend')}Live-Abischnitt</div>
        <div>${ic('layers')}Q1.1 bis Q2.2</div>
        <div>${ic('target')}Ziel-Rechner</div>
      </div>
      <div class="hint" style="margin-top:22px">Version ${PL.VERSION}</div>
    </div></div>`;

  /* ================= Einrichtung ================= */
  PL.startSetup = function () {
    const existing = st().subjects.map((s) => Object.assign({}, s, { picked: true }));
    const presets = PL.PRESETS.filter((p) => !existing.some((e) => e.short === p.short && e.name === p.name))
      .map((p) => ({ id: PL.uid(), short: p.short, name: p.name, color: p.color, lk: false, teacher: '', picked: false, isNew: true }));
    const exams = st().exams.map((e) => e.subjectId);
    PL.ui.setup = { step: 1, list: existing.concat(presets), exams, examCount: st().settings.examCount };
    location.hash = '#/setup';
  };

  PL.views.setup = function () {
    const S = PL.ui.setup;
    if (!S) { PL.startSetup(); return ''; }
    const picked = S.list.filter((s) => s.picked);
    const steps = `<div class="steps">${[1, 2, 3].map((n) => `<i class="${n <= S.step ? 'on' : ''}"></i>`).join('')}</div>`;
    let body = '', info = '', next = '';
    if (S.step === 1) {
      body = `
        ${pageHead('Schritt 1 von 3', 'Welche Fächer hast du?')}
        ${steps}
        <div class="pick-grid">${S.list.map((s, i) => `
          <button class="pick ${s.picked ? 'on' : ''}" style="--c:${s.color}" data-action="setup-toggle" data-i="${i}">
            <span class="subj-code" style="--c:${s.color}">${esc(s.short)}</span><span class="nm">${esc(s.name)}</span>
            <span class="ck">${ic('check')}</span>
          </button>`).join('')}
          <button class="pick" data-action="setup-custom" style="--c:var(--accent)"><span class="subj-code" style="--c:var(--card-3);color:var(--text)">${ic('plus', 'i-sm')}</span><span class="nm">Eigenes Fach</span></button>
        </div>`;
      info = `${picked.length} Fächer gewählt`;
      next = `<button class="btn btn-primary" data-action="setup-next" ${picked.length ? '' : 'disabled'}>Weiter ${ic('chevron-right', 'i-sm')}</button>`;
    } else if (S.step === 2) {
      const lks = picked.filter((s) => s.lk).length;
      body = `
        ${pageHead('Schritt 2 von 3', 'Deine Leistungskurse')}
        ${steps}
        <p class="muted" style="margin:-6px 0 16px">Leistungskurse zählen in Block I doppelt. Meist wählst du zwei.</p>
        <div class="pick-grid">${picked.map((s) => `
          <button class="pick ${s.lk ? 'on' : ''}" style="--c:${s.color}" data-action="setup-lk" data-id="${s.id}">
            <span class="subj-code" style="--c:${s.color}">${esc(s.short)}</span><span class="nm">${esc(s.name)}</span>
            <span class="ck">${ic('check')}</span>
          </button>`).join('')}
        </div>`;
      info = `${lks} Leistungskurs${lks === 1 ? '' : 'e'}`;
      next = `<button class="btn" data-action="setup-back">Zurück</button><button class="btn btn-primary" data-action="setup-next">Weiter ${ic('chevron-right', 'i-sm')}</button>`;
    } else {
      const opts = (sel) => `<option value="">– wählen –</option>` + picked.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.short)} · ${esc(s.name)}${s.lk ? ' (LK)' : ''}</option>`).join('');
      body = `
        ${pageHead('Schritt 3 von 3', 'Deine Abiturfächer')}
        ${steps}
        <div class="card" style="max-width:620px">
          <div class="field-label" style="margin-bottom:8px">Anzahl Prüfungen</div>
          <div class="seg seg-block" style="margin-bottom:12px">
            <button class="${S.examCount === 4 ? 'on' : ''}" data-action="setup-examcount" data-v="4">4 Prüfungen (×5)</button>
            <button class="${S.examCount === 5 ? 'on' : ''}" data-action="setup-examcount" data-v="5">5 Prüfungen (×4)</button>
          </div>
          ${Array.from({ length: S.examCount }, (_, i) => `
            <div class="assign-row"><span class="slot">P${i + 1}</span>
              <select class="select" data-setup-exam="${i}">${opts(S.exams[i])}</select></div>`).join('')}
          <p class="hint" style="margin:10px 0 0">P1 und P2 sind meist deine Leistungskurse. Du kannst das später jederzeit ändern.</p>
        </div>`;
      info = '';
      next = `<button class="btn" data-action="setup-back">Zurück</button><button class="btn btn-primary" data-action="setup-finish">${ic('check', 'i-sm')} Fertig</button>`;
    }
    const cancel = st().subjects.length ? `<button class="btn btn-ghost" data-action="setup-cancel">Abbrechen</button>` : '';
    return `<div class="page view">${body}<div class="setup-bar"><span class="info">${info}</span>${cancel}${next}</div></div>`;
  };

  /* ================= Übersicht ================= */
  function heroCard(opts = {}) {
    const T = PL.total();
    const b1 = T.b1, b2 = T.b2;
    const note = T.note;
    const frac = T.points != null ? T.points / 900 : 0;
    const status = T.points == null ? 'Noch keine Daten'
      : (T.hasProg ? 'Mit Prognose' : 'Endergebnis');
    return `
      <section class="hero ${opts.cls || ''}">
        <div class="hero-top">
          <span class="hero-label">${ic('cap', 'i-sm')} Abiturschnitt</span>
          <span class="hero-pill">${status}</span>
        </div>
        <div class="hero-body">
          <div>
            <div class="hero-grade num">${note != null ? PL.fmt(note, 1) : '–'}</div>
            <div class="hero-meta"><b class="num">${T.points != null ? T.points : 0}</b> von 900 Punkten${T.points != null && !T.passed ? ' · <b style="color:#FCA5A5">noch nicht bestanden</b>' : ''}</div>
          </div>
          <div class="hero-ring">${PL.ring(frac)}<div class="ring-label"><div><b class="num">${Math.round(frac * 100)}%</b>erreicht</div></div></div>
        </div>
        <div class="hero-blocks">
          <div class="hero-block"><div class="lbl">Block I · Halbjahre</div><div class="val num">${b1.points != null ? b1.points : '–'} <small>/ 600</small></div><div class="bar"><i style="width:${(b1.points || 0) / 6}%"></i></div></div>
          <div class="hero-block"><div class="lbl">Block II · Prüfungen</div><div class="val num">${b2.points != null ? b2.points : '–'} <small>/ ${b2.max}</small></div><div class="bar"><i style="width:${(b2.points || 0) / b2.max * 100}%"></i></div></div>
        </div>
        ${opts.link ? `<a class="hero-note" href="#/abitur" style="color:rgba(255,255,255,.8)">${ic('info', 'i-sm')} ${T.hasProg ? 'Fehlende Noten werden aus deinem bisherigen Schnitt hochgerechnet' : 'Details zur Berechnung'} ${ic('chevron-right', 'i-sm')}</a>` : ''}
      </section>`;
  }

  PL.views.dashboard = function () {
    const s = st().settings;
    const avg = PL.overallAvg();
    const name = s.name ? `Hey, ${esc(s.name)}` : 'Übersicht';
    const hour = new Date().getHours();
    const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Schön, dass du da bist' : 'Guten Abend';

    const semRows = [0, 1, 2, 3].map((i) => {
      const a = PL.overallAvg(i);
      return `<button class="row row-click" data-action="set-sem" data-sem="${i}" style="padding:9px 8px">
        <span class="row-main" style="font-weight:700">${esc(PL.semName(i))} ${i === s.currentSem ? '<span class="tag tag-lk" style="margin-left:6px">AKTUELL</span>' : ''}</span>
        <span style="flex:2;max-width:140px"><span class="bar" style="background:var(--card-3);margin:0"><i style="width:${a != null ? a / 15 * 100 : 0}%"></i></span></span>
        ${PL.badge(a, { dec: 1 })}
      </button>`;
    }).join('');

    const today = PL.today();
    const upcoming = st().events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    const missed = st().events.filter((e) => e.date < today && ['Klausur', 'Test', 'Referat'].includes(e.type)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    const evRows = upcoming.map(eventRow).join('') + missed.map((e) => missedRow(e)).join('');

    const recent = st().grades.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
    const subs = PL.sortedSubjects();

    return `<div class="page view">
      ${pageHead(`${semPill()}<span>${greet}</span>`, name, (PL.feedBell ? PL.feedBell() : '') + settingsBtnHtml())}
      <div class="grid grid-dash">
        <div class="span-2">${heroCard({ link: true })}</div>
        ${PL.feedCard ? PL.feedCard() : ''}

        <section class="card">
          <div class="card-head"><div><h2 class="card-title">${ic('trend')} Notenschnitt</h2><div class="card-sub">LK doppelt gewichtet</div></div></div>
          <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:10px">
            <div class="goal-val num ${avg != null ? 'tc-text' : ''}" data-tier="${PL.tier(avg)}">${avg != null ? PL.fmt(avg, 2) : '–'}</div>
            <div class="muted" style="font-weight:700;padding-bottom:4px">Punkte${avg != null ? ` · Note ≈ ${PL.fmt(PL.toNote(avg), 1)}` : ''}</div>
          </div>
          <div class="list">${semRows}</div>
        </section>

        ${PL.scheduleCard()}
        ${PL.tasksCard()}

        <section class="card">
          <div class="card-head"><h2 class="card-title">${ic('calendar')} Termine</h2><a class="link-btn" href="#/termine">Alle ${ic('chevron-right', 'i-sm')}</a></div>
          ${evRows ? `<div class="list">${evRows}</div>` : `<div class="empty"><b>Keine Termine</b>Plane deine nächste Klausur.<br><button class="btn btn-sm" data-action="add-event">${ic('plus', 'i-sm')} Termin</button></div>`}
        </section>

        <section class="card span-2">
          <div class="card-head"><div><h2 class="card-title">${ic('trend')} Verlauf</h2><div class="card-sub">Entwicklung deines Durchschnitts über alle Noten</div></div></div>
          ${PL.trendChart(PL.timeline())}
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">${ic('sparkle')} Letzte Noten</h2></div>
          ${recent.length ? `<div class="list">${recent.map(gradeRow).join('')}</div>` : `<div class="empty"><b>Noch keine Noten</b>Tippe auf „+“, um deine erste Note einzutragen.</div>`}
        </section>

        <section class="card span-full">
          <div class="card-head"><h2 class="card-title">${ic('layers')} Deine Fächer</h2><a class="link-btn" href="#/faecher">Alle ${ic('chevron-right', 'i-sm')}</a></div>
          <div class="mini-subjs">${subs.map((sub) => {
            const a = PL.subjectAvg(sub.id);
            return `<a class="mini-subj" style="--c:${sub.color}" href="#/fach/${sub.id}">
              <span class="subj-code" style="--c:${sub.color}">${esc(sub.short)}</span>
              <div class="nm">${esc(sub.name)}</div>${PL.badge(a, { dec: 1 })}</a>`;
          }).join('')}</div>
        </section>

        ${PL.workloadCard(6, { cls: 'span-2', link: true })}

        <section class="card span-mid">
          <div class="card-head"><div><h2 class="card-title">${ic('layers')} Punkteverteilung</h2><div class="card-sub">${st().grades.length} Noten insgesamt</div></div></div>
          ${PL.histogram(PL.distribution())}
        </section>
      </div>
    </div>`;
  };

  function gradeRow(g, opts = {}) {
    const sub = PL.subject(g.subjectId);
    const title = g.title || (g.cat === 'K' ? 'Klausur' : 'Sonstige Mitarbeit');
    return `<button class="row row-click" data-action="open-grade" data-id="${g.id}" style="text-align:left;padding:10px 8px">
      <span class="grade-pill num" data-tier="${PL.tier(g.points)}">${g.points}</span>
      <span class="row-main"><span class="row-title" style="display:block">${esc(title)}</span>
      <span class="row-sub" style="display:block">${opts.noSubject ? '' : (sub ? esc(sub.name) + ' · ' : '')}${esc(PL.semName(g.sem))} · ${PL.fmtDate(g.date)}${g.weight && g.weight !== 1 ? ` · ${PL.fmtPts(g.weight)}×` : ''}</span></span>
      <span class="muted" style="font-size:12.5px;font-weight:700">Note ${PL.NOTE_LABEL[g.points]}</span>
    </button>`;
  }
  PL.gradeRow = gradeRow;

  function eventRow(e) {
    const sub = PL.subject(e.subjectId);
    const n = PL.daysUntil(e.date);
    const cls = n <= 0 ? 'today' : n <= 3 ? 'soon' : '';
    return `<button class="row row-click" data-action="open-event" data-id="${e.id}" style="text-align:left;padding:10px 8px">
      ${PL.dateBox(e.date)}
      <span class="row-main"><span class="row-title" style="display:block">${esc(e.title || e.type)}</span>
      <span class="row-sub" style="display:block">${sub ? esc(sub.short) + ' · ' : ''}${esc(e.type)}</span></span>
      <span class="countdown ${cls}">${PL.relDays(n)}</span></button>`;
  }
  function missedRow(e) {
    const sub = PL.subject(e.subjectId);
    return `<div class="row" style="padding:10px 8px">
      ${PL.dateBox(e.date)}
      <span class="row-main"><span class="row-title" style="display:block">${esc(e.title || e.type)}</span>
      <span class="row-sub" style="display:block">${sub ? esc(sub.short) + ' · ' : ''}Ergebnis schon da?</span></span>
      <button class="btn btn-sm btn-primary" data-action="event-grade" data-id="${e.id}">${ic('plus', 'i-sm')} Note</button></div>`;
  }

  /* ================= Fächer ================= */
  function subjCard(sub) {
    const a = PL.subjectAvg(sub.id);
    const slot = PL.examSlotOf(sub.id);
    const bars = [0, 1, 2, 3].map((i) => {
      const c = PL.semesterCell(sub.id, i);
      const h = c.points != null ? Math.max(8, c.points / 15 * 100) : 0;
      return `<div class="sem-bar"><div class="track">
        ${c.kind === 'real' ? `<div class="fill" data-tier="${PL.tier(c.points)}" style="height:${h}%"></div>` : ''}
        <div class="v">${c.kind === 'real' ? c.points : ''}</div></div>
        <div class="k">${esc(PL.semName(i))}</div></div>`;
    }).join('');
    return `<a class="subj-card" style="--c:${sub.color}" href="#/fach/${sub.id}">
      <div class="subj-top">
        <span class="subj-code" style="--c:${sub.color}">${esc(sub.short)}</span>
        <div class="subj-info"><div class="subj-name">${esc(sub.name)}</div>
          <div class="subj-meta">${sub.lk ? '<span class="tag tag-lk">LK</span>' : '<span class="tag">GK</span>'}${slot >= 0 ? `<span class="tag tag-abi">P${slot + 1}</span>` : ''}<span>${esc(sub.teacher || '')}</span></div></div>
        ${PL.badge(a, { dec: 2, lg: true })}
      </div>
      <div class="sem-bars">${bars}</div>
    </a>`;
  }

  PL.views.subjects = function () {
    const f = PL.ui.subjFilter;
    let subs = PL.sortedSubjects();
    if (f === 'lk') subs = subs.filter((s) => s.lk);
    if (f === 'gk') subs = subs.filter((s) => !s.lk);
    if (f === 'abi') subs = subs.filter((s) => PL.examSlotOf(s.id) >= 0);
    const chip = (id, label) => `<button class="chip ${f === id ? 'on' : ''}" data-action="subj-filter" data-v="${id}">${label}</button>`;
    return `<div class="page view">
      ${pageHead(`${st().subjects.length} Fächer`, 'Fächer', `<button class="btn btn-primary" data-action="add-subject">${ic('plus', 'i-sm')} Fach</button>`)}
      <div class="chips" style="margin-bottom:16px">${chip('all', 'Alle')}${chip('lk', 'Leistungskurse')}${chip('gk', 'Grundkurse')}${chip('abi', 'Prüfungsfächer')}</div>
      ${subs.length ? `<div class="subj-grid">${subs.map(subjCard).join('')}</div>` : `<div class="empty"><b>Keine Fächer</b>Hier ist noch nichts.</div>`}
    </div>`;
  };

  /* ================= Fach-Detail ================= */
  PL.views.subject = function (id) {
    const sub = PL.subject(id);
    if (!sub) return `<div class="page view"><a class="back-link" href="#/faecher">${ic('chevron-left', 'i-sm')} Fächer</a><div class="empty"><b>Fach nicht gefunden</b></div></div>`;
    if (PL.ui.detailSem == null) PL.ui.detailSem = st().settings.currentSem;
    const sem = PL.ui.detailSem;
    const a = PL.subjectAvg(sub.id);
    const act = PL.semesterActual(sub.id, sem);
    const calc = PL.semesterCalc(sub.id, sem);
    const ov = PL.getOverride(sub.id, sem);
    const slot = PL.examSlotOf(sub.id);
    const gs = PL.gradesOf(sub.id, sem).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    const ks = gs.filter((g) => g.cat === 'K'), os = gs.filter((g) => g.cat !== 'K');
    const list = (arr, cat, label) => `
      <section class="card">
        <div class="card-head"><h2 class="card-title" style="font-size:16px">${label}</h2>
          <button class="btn btn-sm" data-action="add-grade" data-subject="${sub.id}" data-sem="${sem}" data-cat="${cat}">${ic('plus', 'i-sm')} Note</button></div>
        ${arr.length ? `<div class="list">${arr.map((g) => gradeRow(g, { noSubject: true })).join('')}</div>` : `<div class="empty" style="padding:18px">Noch keine Einträge in ${esc(PL.semName(sem))}.</div>`}
      </section>`;
    const semTabs = [0, 1, 2, 3].map((i) => `<button class="${i === sem ? 'on' : ''}" data-action="detail-sem" data-sem="${i}">${esc(PL.semName(i))}</button>`).join('');
    const total = PL.gradesOf(sub.id).length;

    return `<div class="page view">
      <a class="back-link" href="#/faecher">${ic('chevron-left', 'i-sm')} Fächer</a>
      <section class="subj-hero" style="--c:${sub.color}">
        <div style="display:flex;gap:14px;align-items:center">
          <span class="subj-code" style="--c:${sub.color}">${esc(sub.short)}</span>
          <div style="flex:1;min-width:0"><h1>${esc(sub.name)}</h1>
            <div class="subj-meta" style="margin-top:4px">${sub.lk ? '<span class="tag tag-lk">LEISTUNGSKURS</span>' : '<span class="tag">GRUNDKURS</span>'}${slot >= 0 ? `<span class="tag tag-abi">ABI P${slot + 1}</span>` : ''}<span>${esc(sub.teacher || '')}</span></div></div>
          <button class="icon-btn" data-action="edit-subject" data-id="${sub.id}" aria-label="Fach bearbeiten">${ic('edit')}</button>
        </div>
        <div class="subj-hero-stats">
          <div><div class="lbl">Gesamtschnitt</div><div class="val num">${a != null ? PL.fmt(a, 2) : '–'}</div></div>
          <div><div class="lbl">Note</div><div class="val num">${a != null ? PL.fmt(PL.toNote(a), 1) : '–'}</div></div>
          <div><div class="lbl">Einträge</div><div class="val num">${total}</div></div>
        </div>
      </section>

      <div style="margin:18px 0 14px"><div class="seg">${semTabs}</div></div>

      <div class="halfyear-box">
        ${act ? `<span class="grade-pill num" data-tier="${PL.tier(act.points)}" style="min-width:56px;height:52px;font-size:24px">${act.points}</span>` : `<span class="grade-pill" style="min-width:56px;height:52px;background:var(--card-3);color:var(--muted)">–</span>`}
        <div style="flex:1;min-width:160px">
          <div style="font-weight:800">Halbjahresnote ${esc(PL.semName(sem))}</div>
          <div class="hint">${ov.points != null ? `Zeugnisnote eingetragen${calc != null ? ` · rechnerisch ${PL.fmt(calc, 2)}` : ''}`
            : calc != null ? `Rechnerisch ${PL.fmt(calc, 2)} Punkte${ks.length && os.length ? ` (Klausuren ${st().settings.klausurShare}%)` : ''}` :'Noch keine Noten in diesem Halbjahr'}${ov.out ? ' · <b>nicht eingebracht</b>' : ''}</div>
        </div>
        <button class="btn btn-sm" data-action="open-cell" data-subject="${sub.id}" data-sem="${sem}">${ic('edit', 'i-sm')} Zeugnisnote</button>
      </div>

      <div class="split">${list(ks, 'K', 'Klausuren')}${list(os, 'S', 'Sonstige Mitarbeit')}</div>
      ${PL.subjectNotesCard(sub)}
      ${PL.onenoteCard ? PL.onenoteCard(sub) : ''}
    </div>`;
  };

  /* ================= Abitur ================= */
  PL.views.abitur = function () {
    const s = st().settings;
    const b1 = PL.blockI(), b2 = PL.blockII();
    const subs = PL.sortedSubjects();
    const head = [0, 1, 2, 3].map((i) => `<th class="${i === s.currentSem ? 'cur' : ''}">${esc(PL.semName(i))}</th>`).join('');
    const rows = subs.map((sub) => {
      const slot = PL.examSlotOf(sub.id);
      const cells = [0, 1, 2, 3].map((i) => {
        const c = PL.semesterCell(sub.id, i);
        const ov = PL.getOverride(sub.id, i);
        // Noch nicht ausgefüllte Halbjahre: nur graues, leeres Feld (Prognose fließt trotzdem in die Rechnung)
        const real = c.kind === 'real';
        return `<td><button class="cell ${real ? 'real' : 'open-cell'} ${c.out ? 'out' : ''}" ${real ? `data-tier="${PL.tier(c.points)}"` : ''} data-action="open-cell" data-subject="${sub.id}" data-sem="${i}" aria-label="${esc(sub.name)} ${esc(PL.semName(i))}${real ? '' : ' – noch keine Note'}">${real ? c.points : ''}${ov.points != null ? '<span class="ov"></span>' : ''}</button></td>`;
      }).join('');
      const a = PL.subjectAvg(sub.id);
      return `<tr>
        <td class="sub-cell"><a href="#/fach/${sub.id}" style="display:flex;align-items:center;gap:4px;min-width:0"><span class="slot">${slot >= 0 ? 'P' + (slot + 1) : ''}</span>${PL.subjChip(sub)}${sub.lk ? '<span class="tag tag-lk" style="margin-left:4px">×' + s.lkWeight + '</span>' : ''}</a></td>
        ${cells}
        <td style="padding-left:8px">${PL.badge(a, { dec: 1 })}</td>
      </tr>`;
    }).join('');

    const examRows = b2.rows.map((r, i) => {
      const e = st().exams[i];
      const cell = (v, field, lbl) => `<button class="cell ${v != null ? 'real' : 'empty-cell'}" data-tier="${PL.tier(v)}" data-action="open-exam" data-slot="${i}" data-field="${field}">${v != null ? v : '·'}<span class="lbl">${lbl}</span></button>`;
      const res = r.value != null ? Math.round(r.value * s.examFactor) : null;
      return `<div class="exam-row">
        <span class="exam-slot">P${i + 1}</span>
        <button data-action="open-exam" data-slot="${i}" style="text-align:left;min-width:0;display:flex">${PL.subjChip(r.sub)}</button>
        <div class="exam-vals">
          ${cell(e.s, 's', 'S')}${cell(e.m, 'm', 'M')}
          <span class="arrow">${ic('chevron-right', 'i-sm')}</span>
          <div class="exam-result num" style="${r.kind === 'prog' ? 'color:var(--muted)' : ''}">${res != null ? (r.kind === 'prog' ? '≈' : '') + res : '–'}<small>${r.value != null ? PL.fmtPts(Math.round(r.value * 10) / 10) + ' × ' + s.examFactor : '×' + s.examFactor}</small></div>
        </div>
      </div>`;
    }).join('');

    const req = PL.requirements();
    const g = goalHtml();

    return `<div class="page view">
      ${pageHead(`${semPill()}<span>Prognose & Berechnung</span>`, 'Abitur', settingsBtnHtml())}
      <div style="margin-bottom:18px">${heroCard()}</div>
      <div class="abi-grid">
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">Block I</h2><div class="card-sub">Halbjahresleistungen · tippe auf eine Note zum Bearbeiten</div></div></div>
          ${subs.length ? `<div class="table-wrap"><table class="abi-table">
            <thead><tr><th class="sub-cell">Fach</th>${head}<th>Ø</th></tr></thead>
            <tbody>${rows}</tbody></table></div>` : `<div class="empty">Noch keine Fächer angelegt.</div>`}
          <div class="legend"><span><i class="l-real"></i>Eingetragen</span><span><i class="l-prog"></i>Noch offen</span><span><i class="l-out"></i>Nicht eingebracht</span></div>
          <div class="abi-foot">
            <div><div class="big-score num">${b1.points != null ? b1.points : '–'} <small>/ 600</small></div>
              <div class="hint">${b1.inCount} Kurse eingebracht · ${b1.prog} davon hochgerechnet</div></div>
            ${PL.badge(b1.avg, { dec: 2, lg: true, prefix: 'Ø ' })}
          </div>
        </section>

        <div class="abi-side">
          <section class="card">
            <div class="card-head"><div><h2 class="card-title">Block II</h2><div class="card-sub">Abiturprüfungen · S = schriftlich, M = mündlich</div></div></div>
            <div class="list">${examRows}</div>
            <div class="abi-foot">
              <div class="big-score num">${b2.points != null ? b2.points : '–'} <small>/ ${b2.max}</small></div>
              ${PL.badge(b2.points != null ? b2.points / (s.examCount * s.examFactor) : null, { dec: 2, lg: true, prefix: 'Ø ' })}
            </div>
          </section>

          <section class="card" id="goalCard">
            <div class="card-head"><div><h2 class="card-title">${ic('target')} Ziel-Rechner</h2><div class="card-sub">Was brauchst du für deinen Wunschschnitt?</div></div></div>
            ${g}
          </section>

          <section class="card">
            <div class="card-head"><h2 class="card-title">${ic('check')} Zulassung & Bestehen</h2></div>
            <div class="checks">${req.map((r) => `<div class="check ${r.s}"><span class="check-ic">${ic(r.s === 'ok' ? 'check' : r.s === 'bad' ? 'x' : 'clock')}</span><div><div class="t">${r.t}</div><div class="d">${esc(r.d)}</div></div></div>`).join('')}</div>
            <p class="hint" style="margin:8px 0 0">Vereinfachte Prüfung nach den Regeln der KMK/APO-GOSt. Maßgeblich ist immer deine Schule.</p>
          </section>

          <section class="card">
            <div class="card-head"><h2 class="card-title">${ic('info')} So wird gerechnet</h2></div>
            <details class="faq"><summary>Block I – Halbjahresleistungen ${ic('chevron-down', 'i-sm')}</summary><p>Alle eingebrachten Halbjahresnoten werden addiert, Leistungskurse zählen ${s.lkWeight}-fach. Daraus ergibt sich: <code>Σ Punkte ÷ Σ Gewichte × 40</code> – maximal 600 Punkte.</p></details>
            <details class="faq"><summary>Block II – Prüfungen ${ic('chevron-down', 'i-sm')}</summary><p>Jede Prüfung zählt ${s.examFactor}-fach (max. ${b2.max} Punkte). Bei einer zusätzlichen mündlichen Prüfung zählt die schriftliche doppelt: <code>(2·S + M) ÷ 3</code>.</p></details>
            <details class="faq"><summary>Prognose ${ic('chevron-down', 'i-sm')}</summary><p>Für Halbjahre und Prüfungen ohne Noten wird dein bisheriger Schnitt im jeweiligen Fach angenommen (gestrichelt). Ohne Noten im Fach nutzen wir deinen Gesamtschnitt.</p></details>
            <details class="faq"><summary>Von Punkten zur Abinote ${ic('chevron-down', 'i-sm')}</summary><p>Die Gesamtpunktzahl E (300–900) wird über die KMK-Tabelle umgerechnet: <code>Note = 17/3 − E/180</code>, auf eine Nachkommastelle abgeschnitten. Ab 823 Punkten gibt es die 1,0.</p></details>
          </section>
        </div>
      </div>
    </div>`;
  };

  function goalHtml() {
    const t = PL.ui.goal;
    return `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
        <div><div class="hint" style="font-weight:700">Wunschschnitt</div><div class="goal-val num" id="goalVal">${PL.fmt(t, 1)}</div></div>
      </div>
      <input class="range" type="range" min="1" max="4" step="0.1" value="${t}" data-input="goal" aria-label="Wunschschnitt">
      <div id="goalOut">${goalResult(t)}</div>`;
  }
  function goalResult(t) {
    const r = PL.goal(t);
    let big, txt;
    if (!r.open) { big = r.reached ? ic('check', 'i-lg') : ic('x', 'i-lg'); txt = r.reached ? `Geschafft! Du hast ${r.current} Punkte (nötig: ${r.need}).` : `Leider nicht mehr erreichbar – nötig wären ${r.need} Punkte.`; }
    else if (r.impossible) { big = '✕'; txt = `Selbst mit 15 Punkten überall nicht mehr erreichbar (nötig: ${r.need} Punkte).`; }
    else if (r.secured) { big = ic('check', 'i-lg'); txt = `Schon sicher – egal, was in den ${r.open} offenen Kursen/Prüfungen passiert.`; }
    else { big = PL.fmt(r.x, 1); txt = `Punkte brauchst du im Schnitt in den <b>${r.open}</b> offenen Halbjahren und Prüfungen (≈ Note ${PL.fmt(PL.toNote(r.x), 1)}). Ziel: ${r.need} Punkte.`; }
    return `<div class="goal-out"><div class="big num" data-tier="${r.x != null ? PL.tier(r.x) : ''}" style="${r.x != null ? 'color:var(--tc)' : ''}">${big}</div><div style="font-size:13.5px;color:var(--text-2)">${txt}</div></div>`;
  }
  PL.updateGoal = function (v) {
    PL.ui.goal = Number(v);
    const val = document.getElementById('goalVal'), out = document.getElementById('goalOut');
    if (val) val.textContent = PL.fmt(PL.ui.goal, 1);
    if (out) out.innerHTML = goalResult(PL.ui.goal);
  };

  /* ================= Termine ================= */
  PL.views.events = function (seg) {
    const today = PL.today();
    const evs = st().events.slice().sort((a, b) => a.date.localeCompare(b.date));
    const up = evs.filter((e) => e.date >= today);
    const past = evs.filter((e) => e.date < today).reverse();
    const week = up.filter((e) => PL.daysUntil(e.date) <= 7), later = up.filter((e) => PL.daysUntil(e.date) > 7);
    const sec = (title, arr, fn) => arr.length ? `<div class="sec-title">${title}<span>${arr.length}</span></div><section class="card" style="padding:8px 10px;margin-bottom:16px"><div class="list">${arr.map(fn).join('')}</div></section>` : '';
    return `<div class="page view">
      ${pageHead(seg || `${up.length} anstehend`, 'Kalender', `<button class="btn btn-primary" data-action="add-event">${ic('plus', 'i-sm')} Termin</button>`)}
      <div style="max-width:760px">
      ${evs.length || st().tasks.some((t) => !t.done) ? `<div style="margin-bottom:16px">${PL.workloadCard(8)}</div>` : ''}
      ${!evs.length ? `<div class="empty"><b>Keine Termine</b>Trag Klausuren, Tests und Abiprüfungen ein – sie erscheinen mit Countdown in deiner Übersicht.<br><button class="btn btn-primary btn-sm" data-action="add-event">${ic('plus', 'i-sm')} Ersten Termin anlegen</button></div>` : ''}
      ${sec('Nächste 7 Tage', week, eventRow)}
      ${sec('Später', later, eventRow)}
      ${sec('Vergangen', past, (e) => {
        const sub = PL.subject(e.subjectId);
        return `<div class="row" style="padding:10px 8px">${PL.dateBox(e.date)}
          <button class="row-main" data-action="open-event" data-id="${e.id}" style="text-align:left"><span class="row-title" style="display:block">${esc(e.title || e.type)}</span>
          <span class="row-sub" style="display:block">${sub ? esc(sub.short) + ' · ' : ''}${esc(e.type)} · ${PL.relDays(PL.daysUntil(e.date))}</span></button>
          <button class="btn btn-sm" data-action="event-grade" data-id="${e.id}">${ic('plus', 'i-sm')} Note</button></div>`;
      })}
      </div>
    </div>`;
  };

  /* ================= Konto ================= */
  function accountCard() {
    const S = PL.sync;
    const head = `<div class="card-head"><div><h2 class="card-title">${ic('cloud')} Konto & Synchronisierung</h2><div class="card-sub">Deine Noten auf Handy, Tablet und PC</div></div></div>`;
    if (!S.enabled) {
      return `<section class="card">${head}<p class="hint" style="margin:0">Der Online-Speicher ist noch nicht verbunden. Die Anleitung steht in der Datei <b>SYNC-EINRICHTEN.md</b> im Projekt.</p></section>`;
    }
    if (!S.user) {
      return `<section class="card">${head}
        <p style="margin:0 0 14px;color:var(--text-2);font-size:14px">Melde dich an, dann sind deine Noten auf jedem Gerät automatisch auf dem gleichen Stand.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" data-action="login">Anmelden</button>
          <button class="btn" data-action="signup">Konto erstellen</button>
        </div></section>`;
    }
    return `<section class="card">${head}
      <div class="account-row">
        <span class="avatar">${esc((S.user.email || '?').charAt(0).toUpperCase())}</span>
        <div style="min-width:0;flex:1"><div class="row-title">${esc(S.user.email || '')}</div>
          <div class="row-sub" style="display:flex;align-items:center;gap:7px"><span class="sync-dot static" data-sync-dot data-s="${S.status}"></span><span data-sync-label>${esc(PL.syncLabel())}</span></div></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-sm" data-action="sync-now">${ic('refresh', 'i-sm')} Jetzt synchronisieren</button>
        <button class="btn btn-sm" data-action="change-password">${ic('lock', 'i-sm')} Passwort ändern</button>
        <button class="btn btn-sm btn-ghost" data-action="logout">Abmelden</button>
      </div></section>`;
  }

  /* ================= Einstellungen ================= */
  PL.views.settings = function () {
    const s = st().settings;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(s[key]) === String(v) ? 'on' : ''}" data-action="setting" data-key="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    return `<div class="page view">
      ${pageHead(`Punktlandung · Version ${PL.VERSION}`, 'Einstellungen')}
      <div class="grid" style="max-width:760px">
        <section class="card">
          <div class="card-head"><h2 class="card-title">Profil & Darstellung</h2></div>
          <div class="field"><label for="setName">Dein Name</label><input id="setName" class="input" data-setting="name" value="${esc(s.name)}" placeholder="Optional" maxlength="30"></div>
          <div class="opt-row"><div><div class="t">Design</div><div class="d">Hell, dunkel oder wie dein Gerät</div></div>${seg('theme', [['auto', 'Auto'], ['dark', 'Dunkel'], ['light', 'Hell']])}</div>
          <div class="opt-row"><div><div class="t">Aktuelles Halbjahr</div><div class="d">Neue Noten landen standardmäßig hier</div></div>${seg('currentSem', s.semesters.map((n, i) => [i, esc(n)]))}</div>
        </section>

        <section class="card">
          <div class="card-head"><div><h2 class="card-title">Abitur-Regeln</h2><div class="card-sub">Standard: Regeln wie in NRW (4 Prüfungen, LK doppelt)</div></div></div>
          <div class="opt-row"><div><div class="t">Prüfungen</div><div class="d">Anzahl × Gewichtung = max. 300 Punkte</div></div>${seg('examCount', [[4, '4 × 5'], [5, '5 × 4']])}</div>
          <div class="opt-row"><div><div class="t">LK-Gewichtung</div><div class="d">Faktor der Leistungskurse in Block I</div></div>${seg('lkWeight', [[1, '1×'], [2, '2×']])}</div>
          <div class="opt-row"><div><div class="t">Anteil Klausuren</div><div class="d">an der rechnerischen Halbjahresnote</div></div>${seg('klausurShare', [[40, '40%'], [50, '50%'], [60, '60%']])}</div>
          <div class="opt-row"><div><div class="t">Notenprognose</div><div class="d">Fehlende Noten aus deinem Schnitt hochrechnen</div></div>
            <label class="switch"><input type="checkbox" data-setting="prognosis" ${s.prognosis ? 'checked' : ''}><span></span></label></div>
        </section>

        <section class="card">
          <div class="card-head"><div><h2 class="card-title">${ic('clock')} Stundenplan</h2><div class="card-sub">${st().lessons.length} Stunden eingetragen</div></div><a class="link-btn" href="#/plan">Öffnen ${ic('chevron-right', 'i-sm')}</a></div>
          <div class="opt-row"><div><div class="t">A/B-Wochen</div><div class="d">Für Stunden, die nur jede zweite Woche stattfinden</div></div>
            <label class="switch"><input type="checkbox" data-setting="abWeeks" ${s.abWeeks ? 'checked' : ''}><span></span></label></div>
          ${s.abWeeks ? `<div class="opt-row"><div><div class="t">Diese Woche ist eine …</div><div class="d">KW ${PL.isoWeek(new Date())}</div></div>
            <div class="seg"><button class="${PL.weekType(new Date()) === 'A' ? 'on' : ''}" data-action="set-ab" data-v="A">A-Woche</button><button class="${PL.weekType(new Date()) === 'B' ? 'on' : ''}" data-action="set-ab" data-v="B">B-Woche</button></div></div>` : ''}
          <div class="opt-row"><div><div class="t">Stundenzeiten</div><div class="d">${s.periods.length} Stunden · ${esc(s.periods[0].start)} bis ${esc(s.periods[s.periods.length - 1].end)}</div></div><button class="btn btn-sm" data-action="edit-periods">${ic('edit', 'i-sm')} Bearbeiten</button></div>
          ${PL.untis ? PL.untis.settingsRow() : ''}
        </section>

        ${PL.onenote ? PL.onenote.settingsCard() : ''}

        ${accountCard()}

        ${PL.notesStorageRow()}

        <section class="card">
          <div class="card-head"><div><h2 class="card-title">Daten</h2><div class="card-sub">${PL.sync.user ? 'Gespeichert auf diesem Gerät und in deinem Konto' : 'Ohne Konto nur auf diesem Gerät gespeichert'}</div></div></div>
          <div class="opt-row"><div><div class="t">Backup exportieren</div><div class="d">Als Datei sichern oder aufs Handy übertragen</div></div><button class="btn btn-sm" data-action="export">${ic('download', 'i-sm')} Export</button></div>
          <div class="opt-row"><div><div class="t">Backup importieren</div><div class="d">Ersetzt die aktuellen Daten</div></div><button class="btn btn-sm" data-action="import">${ic('upload', 'i-sm')} Import</button></div>
          <div class="opt-row"><div><div class="t">Fächer neu einrichten</div><div class="d">Fächer, LKs und Prüfungsfächer wählen</div></div><button class="btn btn-sm" data-action="setup">Einrichten</button></div>
          <div class="opt-row"><div><div class="t">Beispieldaten laden</div><div class="d">Ersetzt deine Daten durch eine Demo</div></div><button class="btn btn-sm" data-action="demo">Laden</button></div>
          <div class="opt-row"><div><div class="t" style="color:var(--danger)">Alles löschen</div><div class="d">Noten, Fächer und Termine entfernen</div></div><button class="btn btn-sm btn-danger" data-action="reset">${ic('trash', 'i-sm')} Löschen</button></div>
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">${ic('info')} Als App installieren</h2></div>
          <p style="margin:0;color:var(--text-2);font-size:14px"><b>iPhone/iPad:</b> In Safari auf „Teilen“ → „Zum Home-Bildschirm“.<br><b>Android:</b> Im Chrome-Menü „App installieren“.<br><b>PC:</b> In Chrome/Edge auf das Installieren-Symbol in der Adressleiste.</p>
        </section>
        <div class="about"><span class="brand-mark" aria-hidden="true"></span><div><b>Punktlandung</b><span>Version ${PL.VERSION}</span></div></div>
      </div>
    </div>`;
  };
})();
