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

  const semPill = () => `<button class="hero-pill sem-switch" data-action="cycle-sem" title="Aktuelles Halbjahr wechseln">${esc(PL.semName(st().settings.currentSem))} ${ic('chevron-down', 'i-sm')}</button>`;

  function pageHead(eyebrow, title, actions = '') {
    return `<header class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1></div><div class="head-actions">${actions}</div></header>`;
  }
  PL.pageHead = pageHead;
  // Am Handy: Glocke und Einstellungen im Seitenkopf (am Computer stehen sie in der Kopfzeile bzw. Seitenleiste)
  const settingsBtnHtml = () => `<a class="icon-btn hide-desk" href="#/einstellungen" aria-label="Einstellungen">${ic('settings')}${PL.syncDot()}</a>`;
  const bellHtml = () => (PL.feedBell ? PL.feedBell().replace('class="icon-btn"', 'class="icon-btn hide-desk"') : '');

  /* Punkte, die man für eine Abinote braucht (KMK-Tabelle) */
  PL.pointsForNote = (note) => Math.max(300, Math.min(900, 1020 - 18 * (Math.round(note * 10) + 1) + 1));
  /* Wunschschnitt (im Ziel-Rechner gewählt) */
  const goalNote = () => { const g = Number(st().settings.goal); return g >= 1 && g <= 4 ? g : null; };

  /* ================= Willkommen ================= */
  PL.views = {};
  PL.views.welcome = () => `
    <div class="onb view">
      <div class="onb-brand"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">Punktlandung</span></div>
      <h1 class="onb-title">Dein Abi.<br>Auf den Punkt.</h1>
      <p class="onb-sub">Trag deine Noten ein, behalte Q1 und Q2 im Blick und sieh live, auf welchen Abischnitt du zusteuerst.</p>
      <div class="onb-art" aria-hidden="true">
        <div class="onb-card onb-card-back">
          <span class="subj-code" style="--c:#3B82F6">M</span>
          <div><b>Mathe</b><small>Klausur · Q1.1</small></div>
          <span class="gb" data-tier="1">13</span>
        </div>
        <div class="onb-card onb-card-third">
          <small>Nächste Klausur</small>
          <b>Mo, 1. Dez</b>
          <span>Deutsch · in 4 Tagen</span>
        </div>
        <div class="onb-card onb-card-front">
          <small>Abiturschnitt</small>
          <b>1,8</b>
          <span class="bar"><i style="width:72%"></i></span>
        </div>
      </div>
      <div class="onb-actions">
        ${PL.sync.loading ? `<button class="btn btn-primary btn-lg" disabled>Deine Daten werden geladen …</button>` : `
        <button class="btn btn-primary btn-lg" data-action="setup">Fächer einrichten</button>
        <button class="btn btn-lg" data-action="demo">Mit Beispieldaten ausprobieren</button>`}
        <div class="onb-links" ${PL.sync.loading ? 'style="display:none"' : ''}>
          <button class="onb-link" data-action="import">Datei importieren</button>
          ${PL.sync.enabled && !PL.sync.user ? `<button class="onb-link" data-action="login">Schon ein Konto? Anmelden</button>` : ''}
        </div>
        <div class="hint onb-version">Version ${PL.VERSION}</div>
      </div>
    </div>`;

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
    // Direkt aufgerufen (z. B. nach Neuladen): Auswahl neu anlegen und gleich zeichnen
    if (!PL.ui.setup) PL.startSetup();
    const S = PL.ui.setup;
    const picked = S.list.filter((s) => s.picked);
    const steps = `<div class="steps">${[1, 2, 3].map((n) => `<i class="${n <= S.step ? 'on' : ''}"></i>`).join('')}</div>`;
    // Kopf wie im Onboarding: Zurück-Pfeil, großer Titel, grauer Untertitel
    const backAttr = S.step > 1 ? 'data-action="setup-back"' : st().subjects.length ? 'data-action="setup-cancel"' : '';
    const head = (title, sub) => `<div class="onb-head">
        ${backAttr ? `<button class="onb-back" ${backAttr} aria-label="${S.step > 1 ? 'Zurück' : 'Abbrechen'}">${ic('chevron-left')}</button>` : `<a class="onb-back" href="#/" aria-label="Zurück">${ic('chevron-left')}</a>`}
        ${steps}
        <h1 class="onb-title">${title}</h1>
        <p class="onb-sub">${sub}</p>
      </div>`;
    let body = '', info = '', next = '';
    if (S.step === 1) {
      body = `
        ${head('Welche Fächer hast du?', 'Tipp alle Fächer an, die du in der Oberstufe belegst. Eigene Fächer kannst du unten hinzufügen.')}
        <div class="pick-grid">${S.list.map((s, i) => `
          <button class="pick ${s.picked ? 'on' : ''}" style="--c:${s.color}" data-action="setup-toggle" data-i="${i}">
            <span class="subj-code" style="--c:${s.color}">${esc(s.short)}</span><span class="nm">${esc(s.name)}</span>
            <span class="ck">${ic('check')}</span>
          </button>`).join('')}
          <button class="pick" data-action="setup-custom" style="--c:var(--accent)"><span class="subj-code" style="--c:var(--card-3);color:var(--text);opacity:1">${ic('plus', 'i-sm')}</span><span class="nm">Eigenes Fach</span></button>
        </div>`;
      info = `${picked.length} Fächer gewählt`;
      next = `<button class="btn btn-primary btn-lg" data-action="setup-next" ${picked.length ? '' : 'disabled'}>Weiter</button>`;
    } else if (S.step === 2) {
      const lks = picked.filter((s) => s.lk).length;
      body = `
        ${head('Deine Leistungskurse', 'Leistungskurse zählen in Block I doppelt. Meist wählst du zwei.')}
        <div class="pick-grid">${picked.map((s) => `
          <button class="pick ${s.lk ? 'on' : ''}" style="--c:${s.color}" data-action="setup-lk" data-id="${s.id}">
            <span class="subj-code" style="--c:${s.color}">${esc(s.short)}</span><span class="nm">${esc(s.name)}</span>
            <span class="ck">${ic('check')}</span>
          </button>`).join('')}
        </div>`;
      info = `${lks} Leistungskurs${lks === 1 ? '' : 'e'}`;
      next = `<button class="btn btn-primary btn-lg" data-action="setup-next">Weiter</button>`;
    } else {
      const opts = (sel) => `<option value="">– wählen –</option>` + picked.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.short)} · ${esc(s.name)}${s.lk ? ' (LK)' : ''}</option>`).join('');
      body = `
        ${head('Deine Abiturfächer', 'P1 und P2 sind meist deine Leistungskurse. Du kannst das später jederzeit ändern.')}
        <div class="card">
          <div class="field-label" style="margin-bottom:8px">Anzahl Prüfungen</div>
          <div class="seg seg-block" style="margin-bottom:12px">
            <button class="${S.examCount === 4 ? 'on' : ''}" data-action="setup-examcount" data-v="4">4 Prüfungen (×5)</button>
            <button class="${S.examCount === 5 ? 'on' : ''}" data-action="setup-examcount" data-v="5">5 Prüfungen (×4)</button>
          </div>
          ${Array.from({ length: S.examCount }, (_, i) => `
            <div class="assign-row"><span class="slot">P${i + 1}</span>
              <select class="select" data-setup-exam="${i}">${opts(S.exams[i])}</select></div>`).join('')}
        </div>`;
      info = '';
      next = `<button class="btn btn-primary btn-lg" data-action="setup-finish">Fertig</button>`;
    }
    return `<div class="page view onb-page">${body}<div class="setup-bar">${info ? `<span class="info">${info}</span>` : ''}${next}</div></div>`;
  };

  /* ================= Übersicht ================= */
  /* Abiturschnitt: große Zahl, Fortschritt bis 900 Punkte, Ziel als gestrichelte Linie */
  function heroCard(opts = {}) {
    const T = PL.total();
    const b1 = T.b1, b2 = T.b2;
    const pts = T.points;
    const goal = goalNote();
    const need = goal ? PL.pointsForNote(goal) : null;
    const status = pts == null ? '<span class="pill">Noch keine Noten</span>'
      : T.hasProg ? '<span class="pill">Prognose</span>' : '<span class="pill ok">Endergebnis</span>';
    let goalLine = '';
    if (goal && pts != null) goalLine = need > pts ? `Ziel ${PL.fmt(goal, 1)}: noch <b class="num">${need - pts}</b> Punkte` : `Ziel ${PL.fmt(goal, 1)} erreicht`;
    else if (!goal) goalLine = `<a href="#/abitur" data-goto-goal style="color:var(--accent-2)">Wunschschnitt festlegen ›</a>`;
    return `
      <section class="card abi-hero ${opts.cls || ''}">
        <div class="ah-top"><span class="ah-lbl">Abiturschnitt</span>${status}</div>
        <div class="ah-main">
          <div class="ah-grade">${T.note != null ? PL.fmt(T.note, 1) : '–'}</div>
          <div class="ah-meta"><b class="num">${pts != null ? pts : 0}</b> von 900 Punkten${pts != null && !T.passed ? ' · <span class="bad">noch nicht bestanden</span>' : ''}${goalLine ? '<br>' + goalLine : ''}</div>
        </div>
        <div class="ah-track">
          <div class="ah-bar"><i style="width:${(pts || 0) / 9}%"></i></div>
          ${need ? `<span class="ah-goal" style="left:${need / 9}%" title="${need} Punkte für ${PL.fmt(goal, 1)}"><em>${PL.fmt(goal, 1)}</em></span>` : ''}
          <div class="ah-scale"><span>0</span><span>900</span></div>
        </div>
        <div class="ah-blocks">
          <div class="ah-block"><span>Block I · Halbjahre</span><b class="num">${b1.points != null ? b1.points : '–'} <small>/ 600</small></b><span class="mini-bar"><i style="width:${(b1.points || 0) / 6}%"></i></span></div>
          <div class="ah-block"><span>Block II · Prüfungen</span><b class="num">${b2.points != null ? b2.points : '–'} <small>/ ${b2.max}</small></b><span class="mini-bar"><i style="width:${(b2.points || 0) / b2.max * 100}%"></i></span></div>
        </div>
        ${opts.link ? `<a class="ah-note" href="#/abitur">${ic('info')} ${T.hasProg ? 'Fehlende Noten werden aus deinem bisherigen Schnitt hochgerechnet' : 'So wird gerechnet'} ${ic('chevron-right')}</a>` : ''}
      </section>`;
  }
  PL.heroCard = heroCard;

  /* Kennzahlen oben (wie die Leiste bei Shopify) */
  function kpis() {
    const s = st().settings;
    const T = PL.total();
    const avg = PL.overallAvg();
    const today = PL.today();
    const open = st().tasks.filter((t) => !t.done);
    const over = open.filter((t) => t.due && t.due < today).length;
    const dueToday = open.filter((t) => t.due === today).length;
    const exam = st().events.filter((e) => e.date >= today && PL.LOAD_WEIGHTS[e.type]).sort((a, b) => a.date.localeCompare(b.date))[0];
    // Veränderung: aktuelles Halbjahr gegenüber dem letzten mit Noten
    const cur = s.currentSem, vals = [0, 1, 2, 3].map((i) => PL.overallAvg(i));
    let prev = -1;
    for (let i = cur - 1; i >= 0; i--) if (vals[i] != null) { prev = i; break; }
    const delta = vals[cur] != null && prev >= 0 ? vals[cur] - vals[prev] : null;
    const line = PL.timeline().slice(-14).map((p) => p.avg);
    const n = exam ? PL.daysUntil(exam.date) : null;
    const sub = exam && PL.subject(exam.subjectId);
    return `<div class="dash-kpis">
      <a class="kpi" href="#/abitur">
        <span class="kpi-lbl">${ic('cap')} Abiturschnitt</span>
        <div class="kpi-row"><span class="kpi-val">${T.note != null ? PL.fmt(T.note, 1) : '–'}</span></div>
        <span class="kpi-sub">${T.points != null ? `<b class="num">${T.points}</b> / 900 Punkte` : 'Noch keine Noten'}</span>
      </a>
      <a class="kpi" href="#/faecher">
        <span class="kpi-lbl">${ic('trend')} Notenschnitt</span>
        <div class="kpi-row"><span class="kpi-val">${avg != null ? PL.fmt(avg, 1) : '–'}<small>P.</small></span>${PL.spark(line)}</div>
        <span class="kpi-sub">${delta != null ? PL.delta(delta, 'ggü. ' + esc(PL.semName(prev))) : avg != null ? `≈ Note ${PL.fmt(PL.toNote(avg), 1)}` : 'LK doppelt gewichtet'}</span>
      </a>
      <a class="kpi ${over ? 'warn' : ''}" href="#/aufgaben">
        <span class="kpi-lbl">${ic('tasks')} Offene Aufgaben</span>
        <div class="kpi-row"><span class="kpi-val">${open.length}</span></div>
        <span class="kpi-sub">${over ? `<b style="color:var(--danger-ink)">${over} überfällig</b>` : dueToday ? `<b>${dueToday}</b> heute fällig` : open.length ? 'Nichts für heute' : 'Alles erledigt'}</span>
      </a>
      ${exam ? `<button class="kpi" data-action="open-event" data-id="${exam.id}">
        <span class="kpi-lbl">${ic('calendar')} Nächste${exam.type === 'Test' ? 'r' : exam.type === 'Referat' ? 's' : ''} ${esc(exam.type)}</span>
        <div class="kpi-row"><span class="kpi-val">${n === 0 ? 'Heute' : n === 1 ? 'Morgen' : `${n}<small>Tage</small>`}</span></div>
        <span class="kpi-sub">${sub ? esc(sub.name) : esc(exam.title || exam.type)}</span>
      </button>` : `<a class="kpi" href="#/termine">
        <span class="kpi-lbl">${ic('calendar')} Nächste Klausur</span>
        <div class="kpi-row"><span class="kpi-val">–</span></div>
        <span class="kpi-sub">Keine geplant</span>
      </a>`}
    </div>`;
  }

  /* Notenschnitt pro Halbjahr */
  function semCard() {
    const s = st().settings;
    const avg = PL.overallAvg();
    const vals = [0, 1, 2, 3].map((i) => PL.overallAvg(i));
    const cur = s.currentSem;
    let prev = -1;
    for (let i = cur - 1; i >= 0; i--) if (vals[i] != null) { prev = i; break; }
    const delta = vals[cur] != null && prev >= 0 ? vals[cur] - vals[prev] : null;
    const goal = goalNote();
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">Notenschnitt</h2><div class="card-sub">Punkte pro Halbjahr · LK doppelt</div></div><a class="link-btn" href="#/faecher">Fächer ${ic('chevron-right')}</a></div>
      <div class="sc">
        <div class="sc-left">
          <div class="sc-val">${avg != null ? PL.fmt(avg, 2) : '–'}<small>P.</small></div>
          ${delta != null ? PL.delta(delta, 'ggü. ' + esc(PL.semName(prev))) : ''}
          <span class="kpi-sub">${avg != null ? `≈ Note ${PL.fmt(PL.toNote(avg), 1)}` : ''}</span>
        </div>
        ${PL.semChart(vals, cur, goal ? 17 - 3 * goal : null)}
      </div>
    </section>`;
  }

  /* Einrichtung als Zeitleiste – verschwindet, wenn alles erledigt oder ausgeblendet ist */
  function setupCard() {
    const s = st().settings;
    if (s.demo || s.setupDone) return '';
    const subs = st().subjects, lks = subs.filter((x) => x.lk).length;
    const items = [{ done: true, t: 'Fächer einrichten', d: `${subs.length} Fächer · ${lks} LK` }];
    const ex = st().exams.slice(0, s.examCount);
    const examsOk = ex.every((e) => e.subjectId);
    items.push({ done: examsOk, t: 'Prüfungsfächer wählen', d: examsOk ? `P1–P${s.examCount} gewählt` : 'Damit die Abi-Prognose stimmt', act: `<button class="btn btn-sm btn-primary" data-action="setup">Prüfungsfächer wählen</button>` });
    const plan = st().lessons.length > 0;
    items.push({ done: plan, t: 'Stundenplan eintragen', d: plan ? `${st().lessons.length} Stunden eingetragen` : 'Selbst eintragen oder aus WebUntis laden', act: `<a class="btn btn-sm btn-primary" href="#/plan">Stundenplan</a>${PL.untis ? `<button class="btn btn-sm" data-action="untis-connect">Aus Untis laden</button>` : ''}` });
    const grade = st().grades.length > 0;
    items.push({ done: grade, t: 'Erste Note eintragen', d: grade ? `${st().grades.length} Noten eingetragen` : 'Danach rechnet die App deinen Schnitt', act: `<button class="btn btn-sm btn-primary" data-action="add-grade">Note eintragen</button>` });
    if (PL.sync.enabled) {
      const acc = !!PL.sync.user;
      items.push({ done: acc, t: 'Konto anlegen', d: acc ? 'Auf allen Geräten synchronisiert' : 'Gleiche Noten auf Handy, iPad und PC', act: `<button class="btn btn-sm btn-primary" data-action="signup">Konto erstellen</button><button class="btn btn-sm" data-action="login">Anmelden</button>` });
    }
    const done = items.filter((x) => x.done).length;
    if (done === items.length) return '';
    const first = items.findIndex((x) => !x.done);
    return `<section class="card setup-card">
      <div class="card-head"><div><div class="setup-count">${PL.progRing(done / items.length)} ${done} von ${items.length} erledigt</div><h2 class="card-title">Richte Punktlandung fertig ein</h2></div>
        <button class="btn btn-sm btn-ghost" data-action="setup-hide">Ausblenden</button></div>
      ${PL.stepsHtml(items.map((x, i) => ({ s: x.done ? 'done' : i === first ? 'cur' : '', t: x.t, d: x.d, html: i === first ? `<div class="st-acts">${x.act}</div>` : '' })))}
    </section>`;
  }

  function quickBar() {
    const chip = (act, icon, c, t) => `<button type="button" data-action="${act}" style="--c:${c}">${ic(icon)} ${t}</button>`;
    return `<div class="quick">
      <button type="button" class="quick-main" data-action="new-entry"><span class="plus">${ic('plus')}</span>Was möchtest du eintragen?</button>
      <div class="quick-chips">${chip('add-grade', 'target', '#FF5B1F', 'Note')}${chip('add-task', 'tasks', '#3B82F6', 'Hausaufgabe')}${chip('add-event', 'calendar', '#F59E0B', 'Termin')}${chip('add-note', 'upload', '#8B5CF6', 'Datei')}</div>
    </div>`;
  }

  function recentCard() {
    const recent = st().grades.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
    return `<section class="card">
      <div class="card-head"><h2 class="card-title">Letzte Noten</h2><button class="link-btn" data-action="add-grade">${ic('plus')} Note</button></div>
      ${recent.length ? `<div class="list">${recent.map((g) => gradeRow(g)).join('')}</div>` : `<div class="empty"><b>Noch keine Noten</b>Tippe auf „+“, um deine erste Note einzutragen.</div>`}
    </section>`;
  }

  PL.views.dashboard = function () {
    const s = st().settings;
    // Begrüßung nach Tageszeit als Überschrift, darüber das Datum
    const now = new Date(), hour = now.getHours();
    const greet = hour < 5 ? 'Noch wach' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : hour < 23 ? 'Guten Abend' : 'Gute Nacht';
    const first = (s.name || '').trim().split(/\s+/)[0];
    const name = first ? `${greet}, ${esc(first)}${hour < 5 ? '?' : ''}` : `${greet}${hour < 5 ? '?' : ''}`;
    const dateLine = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const subs = PL.sortedSubjects();
    const agenda = PL.agendaCard ? PL.agendaCard() : '';
    const feed = PL.feedCard ? PL.feedCard() : '';

    return `<div class="page view">
      ${pageHead(`<span>${dateLine}</span>${semPill()}`, name, bellHtml() + settingsBtnHtml())}
      <div class="dash">
        ${s.demo ? `<div class="demo-banner">${ic('sparkle')}<div><b>Beispieldaten</b><span>Alles hier ist erfunden.</span></div><button class="btn btn-sm" data-action="demo-exit">Eigene Daten</button></div>` : ''}
        ${quickBar()}
        ${setupCard()}
        ${kpis()}
        <div class="dash-cols">
          <div class="dash-main">
            ${heroCard({ link: true })}
            <div class="dash-solo">${agenda}</div>
            <div class="dash-pair">${semCard()}${PL.scheduleCard()}</div>
            ${feed ? `<div class="dash-solo">${feed}</div>` : ''}
            ${PL.workloadCard(6, { link: true })}
            <section class="card">
              <div class="card-head"><h2 class="card-title">Deine Fächer</h2><a class="link-btn" href="#/faecher">Alle ${ic('chevron-right')}</a></div>
              <div class="mini-subjs">${subs.map((sub) => {
                const a = PL.subjectAvg(sub.id);
                return `<a class="mini-subj" style="--c:${sub.color}" href="#/fach/${sub.id}">
                  <div class="top"><span class="subj-code" style="--c:${sub.color}">${esc(sub.short)}</span>${PL.badge(a, { dec: 1 })}</div>
                  <div class="nm">${esc(sub.name)}</div></a>`;
              }).join('')}</div>
            </section>
            <div class="dash-solo">${recentCard()}</div>
            <div class="dash-pair">
              <section class="card">
                <div class="card-head"><div><h2 class="card-title">Verlauf</h2><div class="card-sub">Durchschnitt über alle Noten</div></div></div>
                ${PL.trendChart(PL.timeline())}
              </section>
              <section class="card">
                <div class="card-head"><div><h2 class="card-title">Punkteverteilung</h2><div class="card-sub">${st().grades.length} Noten insgesamt</div></div></div>
                ${PL.histogram(PL.distribution())}
              </section>
            </div>
          </div>
          <aside class="dash-side" aria-label="Als Nächstes">
            ${agenda}
            ${feed}
            ${recentCard()}
          </aside>
        </div>
      </div>
    </div>`;
  };

  function gradeRow(g, opts = {}) {
    const sub = PL.subject(g.subjectId);
    const title = g.title || (g.cat === 'K' ? 'Klausur' : 'Sonstige Mitarbeit');
    return `<button class="row row-click" data-action="open-grade" data-id="${g.id}" style="padding:9px 8px">
      <span class="grade-pill num" data-tier="${PL.tier(g.points)}">${g.points}</span>
      <span class="row-main"><span class="row-title" style="display:block">${esc(title)}</span>
      <span class="row-sub" style="display:block">${opts.noSubject ? '' : (sub ? esc(sub.name) + ' · ' : '')}${esc(PL.semName(g.sem))} · ${PL.fmtDate(g.date)}${g.weight && g.weight !== 1 ? ` · ${PL.fmtPts(g.weight)}×` : ''}</span></span>
      <span class="muted" style="font-size:12.5px;font-weight:500;font-family:var(--mono)">Note ${PL.NOTE_LABEL[g.points]}</span>
    </button>`;
  }
  PL.gradeRow = gradeRow;

  /* ================= Fächer ================= */
  const nextEventOf = (subjectId) => st().events.filter((e) => e.subjectId === subjectId && e.date >= PL.today() && PL.LOAD_WEIGHTS[e.type]).sort((a, b) => a.date.localeCompare(b.date))[0];
  /* „heute“, „morgen“, „in 6 Tagen“ (mitten im Satz klein, Substantive bleiben groß) */
  const relLower = (iso) => { const t = PL.relDays(PL.daysUntil(iso)); return /^(Heute|Morgen|Gestern)$/.test(t) ? t.toLowerCase() : t; };
  /* Countdown als große Zahl: „17 Tage“, „Morgen“, „Heute“ */
  const countdownVal = (iso) => { const n = PL.daysUntil(iso); return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : `${n}<small> Tage</small>`; };
  function subjCard(sub) {
    const a = PL.subjectAvg(sub.id);
    const slot = PL.examSlotOf(sub.id);
    const cur = st().settings.currentSem;
    const bars = [0, 1, 2, 3].map((i) => {
      const c = PL.semesterCell(sub.id, i);
      const real = c.kind === 'real';
      const h = c.points != null ? Math.max(8, c.points / 15 * 100) : 0;
      return `<div class="sem-bar ${i === cur ? 'cur' : ''}"><div class="track">${c.points != null ? `<div class="fill ${real ? '' : 'prog'}" style="height:${h}%"></div>` : ''}</div>
        <span class="v num ${real ? '' : 'none'}">${real ? c.points : c.points != null ? '≈' + c.points : '–'}</span><span class="k">${esc(PL.semName(i))}</span></div>`;
    }).join('');
    const nx = nextEventOf(sub.id);
    return `<a class="subj-card" style="--c:${sub.color}" href="#/fach/${sub.id}">
      <div class="subj-top">
        <span class="subj-code" style="--c:${sub.color}">${esc(sub.short)}</span>
        <div class="subj-info"><div class="subj-name">${esc(sub.name)}</div>
          <div class="subj-meta">${sub.lk ? '<span class="tag tag-lk">LK</span>' : '<span class="tag">GK</span>'}${slot >= 0 ? `<span class="tag tag-abi">P${slot + 1}</span>` : ''}<span>${esc(sub.teacher || '')}</span></div></div>
        <div class="subj-avg" data-tier="${PL.tier(a)}"><b>${a != null ? PL.fmt(a, 1) : '–'}</b><small>${a != null ? `Note ${PL.fmt(PL.toNote(a), 1)}` : 'Ø Punkte'}</small></div>
      </div>
      <div class="sem-bars">${bars}</div>
      ${nx ? `<div class="subj-next">${ic('calendar')} <b>${esc(nx.type)}</b> ${relLower(nx.date)}${nx.title ? ' · ' + esc(PL.eventName ? PL.eventName(nx).replace(sub.name + ' – ', '') : nx.title) : ''}</div>` : ''}
    </a>`;
  }

  PL.views.subjects = function () {
    const f = PL.ui.subjFilter;
    let subs = PL.sortedSubjects();
    if (f === 'lk') subs = subs.filter((s) => s.lk);
    if (f === 'gk') subs = subs.filter((s) => !s.lk);
    if (f === 'abi') subs = subs.filter((s) => PL.examSlotOf(s.id) >= 0);
    const seg = (id, label) => `<button class="${f === id ? 'on' : ''}" data-action="subj-filter" data-v="${id}">${label}</button>`;
    const lk = st().subjects.filter((s) => s.lk).length;
    return `<div class="page view">
      ${pageHead(`${st().subjects.length} Fächer · ${lk} Leistungskurse`, 'Fächer', `<button class="btn btn-primary" data-action="add-subject">${ic('plus', 'i-sm')} Fach</button>`)}
      <div style="margin-bottom:16px"><div class="seg">${seg('all', 'Alle')}${seg('lk', 'Leistungskurse')}${seg('gk', 'Grundkurse')}${seg('abi', 'Prüfungsfächer')}</div></div>
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
        <div class="card-head"><h2 class="card-title">${label}<span class="muted" style="font-weight:500;font-family:var(--mono);font-size:12.5px">${arr.length || ''}</span></h2>
          <button class="btn btn-sm" data-action="add-grade" data-subject="${sub.id}" data-sem="${sem}" data-cat="${cat}">${ic('plus', 'i-sm')} Note</button></div>
        ${arr.length ? `<div class="list">${arr.map((g) => gradeRow(g, { noSubject: true })).join('')}</div>` : `<div class="empty" style="padding:16px">Noch keine Einträge in ${esc(PL.semName(sem))}.</div>`}
      </section>`;
    const semTabs = [0, 1, 2, 3].map((i) => `<button class="${i === sem ? 'on' : ''}" data-action="detail-sem" data-sem="${i}">${esc(PL.semName(i))}</button>`).join('');
    const total = PL.gradesOf(sub.id).length;
    const nx = nextEventOf(sub.id);

    return `<div class="page view">
      <a class="back-link hide-desk" href="#/faecher">${ic('chevron-left', 'i-sm')} Fächer</a>
      <section class="subj-hero" style="--c:${sub.color}">
        <div class="sh-top">
          <span class="subj-code" style="--c:${sub.color}">${esc(sub.short)}</span>
          <div style="flex:1;min-width:0"><h1>${esc(sub.name)}</h1>
            <div class="subj-meta">${sub.lk ? '<span class="tag tag-lk">Leistungskurs</span>' : '<span class="tag">Grundkurs</span>'}${slot >= 0 ? `<span class="tag tag-abi">Abi P${slot + 1}</span>` : ''}<span>${esc(sub.teacher || '')}</span></div></div>
          <button class="icon-btn" data-action="edit-subject" data-id="${sub.id}" aria-label="Fach bearbeiten" title="Fach bearbeiten">${ic('edit')}</button>
        </div>
        <div class="sh-stats">
          <div><div class="lbl">Schnitt</div><div class="val num tc-text" data-tier="${PL.tier(a)}">${a != null ? PL.fmt(a, 2) : '–'}<small> P.</small></div></div>
          <div><div class="lbl">Note</div><div class="val num">${a != null ? PL.fmt(PL.toNote(a), 1) : '–'}</div></div>
          <div><div class="lbl">${nx ? `${esc(nx.type)}${PL.daysUntil(nx.date) > 1 ? ' in' : ''}` : 'Einträge'}</div><div class="val num">${nx ? countdownVal(nx.date) : total}</div></div>
        </div>
      </section>

      <div class="detail-tabs"><div class="seg">${semTabs}</div>
        <button class="btn btn-sm btn-primary hide-phone" data-action="add-grade" data-subject="${sub.id}" data-sem="${sem}">${ic('plus', 'i-sm')} Note eintragen</button></div>

      <div class="halfyear-box">
        ${act ? `<span class="grade-pill lg num" data-tier="${PL.tier(act.points)}">${act.points}</span>` : `<span class="grade-pill lg">–</span>`}
        <div style="flex:1;min-width:160px">
          <div class="t">Halbjahresnote ${esc(PL.semName(sem))}</div>
          <div class="hint">${ov.points != null ? `Zeugnisnote eingetragen${calc != null ? ` · rechnerisch ${PL.fmt(calc, 2)}` : ''}`
            : calc != null ? `Rechnerisch ${PL.fmt(calc, 2)} Punkte${ks.length && os.length ? ` (Klausuren ${st().settings.klausurShare} %)` : ''}` : 'Noch keine Noten in diesem Halbjahr'}${ov.out ? ' · <b>nicht eingebracht</b>' : ''}</div>
        </div>
        <button class="btn btn-sm" data-action="open-cell" data-subject="${sub.id}" data-sem="${sem}">${ic('edit', 'i-sm')} Zeugnisnote</button>
      </div>

      <div class="split">${list(ks, 'K', 'Klausuren')}${list(os, 'S', 'Sonstige Mitarbeit')}</div>
      ${PL.subjectNotesCard(sub)}
    </div>`;
  };

  /* ================= Abitur ================= */
  PL.views.abitur = function () {
    const s = st().settings;
    const b1 = PL.blockI(), b2 = PL.blockII();
    const subs = PL.sortedSubjects();
    const head = [0, 1, 2, 3].map((i) => `<th class="${i === s.currentSem ? 'cur' : ''}"><span>${esc(PL.semName(i))}</span></th>`).join('');
    const rows = subs.map((sub) => {
      const slot = PL.examSlotOf(sub.id);
      const cells = [0, 1, 2, 3].map((i) => {
        const c = PL.semesterCell(sub.id, i);
        const ov = PL.getOverride(sub.id, i);
        // Noch nicht ausgefüllte Halbjahre: nur leeres Feld (Prognose fließt trotzdem in die Rechnung)
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

    return `<div class="page view">
      ${pageHead(`${semPill()}<span>Prognose & Berechnung</span>`, 'Abitur', settingsBtnHtml())}
      <div style="margin-bottom:16px">${heroCard()}</div>
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
            <div class="card-head"><div><h2 class="card-title">Ziel-Rechner</h2><div class="card-sub">Was brauchst du für deinen Wunschschnitt?</div></div></div>
            ${goalHtml()}
          </section>

          <section class="card">
            <div class="card-head"><div><h2 class="card-title">Zulassung & Bestehen</h2><div class="card-sub">${req.filter((r) => r.s === 'ok').length} von ${req.length} erfüllt</div></div></div>
            ${PL.stepsHtml(req.map((r) => ({ s: r.s === 'ok' ? 'done' : r.s === 'bad' ? 'bad' : '', t: r.t, d: esc(r.d) })))}
            <p class="hint" style="margin:14px 0 0">Vereinfachte Prüfung nach den Regeln der KMK/APO-GOSt. Maßgeblich ist immer deine Schule.</p>
          </section>

          <section class="card">
            <div class="card-head"><h2 class="card-title">So wird gerechnet</h2></div>
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
    const t = PL.ui.goalLive != null ? PL.ui.goalLive : (goalNote() || PL.ui.goal);
    return `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
        <div><div class="hint" style="font-weight:500">Wunschschnitt</div><div class="goal-val num" id="goalVal">${PL.fmt(t, 1)}</div></div>
        <span class="hint num" id="goalNeed">${PL.pointsForNote(t)} Punkte nötig</span>
      </div>
      <input class="range" type="range" min="1" max="4" step="0.1" value="${t}" data-input="goal" aria-label="Wunschschnitt">
      <div id="goalOut">${goalResult(t)}</div>
      <p class="hint" style="margin:10px 0 0">Dein Wunschschnitt erscheint als gestrichelte Linie auf der Übersicht.</p>`;
  }
  function goalResult(t) {
    const r = PL.goal(t);
    let big, txt;
    if (!r.open) { big = r.reached ? ic('check', 'i-lg') : ic('x', 'i-lg'); txt = r.reached ? `Geschafft! Du hast ${r.current} Punkte (nötig: ${r.need}).` : `Leider nicht mehr erreichbar – nötig wären ${r.need} Punkte.`; }
    else if (r.impossible) { big = ic('x', 'i-lg'); txt = `Selbst mit 15 Punkten überall nicht mehr erreichbar (nötig: ${r.need} Punkte).`; }
    else if (r.secured) { big = ic('check', 'i-lg'); txt = `Schon sicher – egal, was in den ${r.open} offenen Kursen/Prüfungen passiert.`; }
    else { big = PL.fmt(r.x, 1); txt = `Punkte brauchst du im Schnitt in den <b>${r.open}</b> offenen Halbjahren und Prüfungen (≈ Note ${PL.fmt(PL.toNote(r.x), 1)}).`; }
    return `<div class="goal-out"><div class="big num" ${r.x != null ? `data-tier="${PL.tier(r.x)}"` : ''}>${big}</div><div style="font-size:13.5px;color:var(--text-2)">${txt}</div></div>`;
  }
  PL.updateGoal = function (v) {
    PL.ui.goalLive = Number(v);
    const val = document.getElementById('goalVal'), out = document.getElementById('goalOut'), need = document.getElementById('goalNeed');
    if (val) val.textContent = PL.fmt(PL.ui.goalLive, 1);
    if (need) need.textContent = PL.pointsForNote(PL.ui.goalLive) + ' Punkte nötig';
    if (out) out.innerHTML = goalResult(PL.ui.goalLive);
  };
  /* Beim Loslassen des Reglers als Wunschschnitt merken */
  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.input === 'goal') {
      st().settings.goal = Math.round(Number(e.target.value) * 10) / 10;
      PL.ui.goalLive = null;
      PL.save();
    }
  });

  /* Termine: siehe termine.js */

  /* ================= Konto ================= */
  function accountCard() {
    const S = PL.sync;
    const head = `<div class="card-head"><div><h2 class="card-title">Konto & Synchronisierung</h2><div class="card-sub">Deine Noten auf Handy, Tablet und PC</div></div></div>`;
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
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-sm" data-action="sync-now">${ic('refresh', 'i-sm')} Jetzt synchronisieren</button>
        <button class="btn btn-sm" data-action="change-password">${ic('lock', 'i-sm')} Passwort ändern</button>
        <button class="btn btn-sm btn-ghost" data-action="logout">${ic('logout', 'i-sm')} Abmelden</button>
      </div></section>`;
  }

  /* ================= Einstellungen ================= */
  /* Übersicht wie bei Cal.com (am Handy als Liste), jeder Bereich als eigene Seite */
  const SECTIONS = [
    { id: 'profil', g: 'Persönlich', icon: 'users', c: '#FF5B1F', t: 'Profil & Darstellung', d: 'Name, helles oder dunkles Design, aktuelles Halbjahr', k: 'name design theme dunkel hell farbe halbjahr' },
    { id: 'konto', g: 'Persönlich', icon: 'cloud', c: '#16A34A', t: 'Konto', d: 'Anmelden, synchronisieren, Passwort ändern', k: 'sync synchronisieren anmelden abmelden passwort admin e-mail' },
    { id: 'abitur', g: 'Schule', icon: 'cap', c: '#8B5CF6', t: 'Abitur-Regeln', d: 'Prüfungen, LK-Gewichtung, Klausuranteil, Prognose', k: 'nrw prüfungen leistungskurs gewichtung klausur anteil prognose fächer einrichten' },
    { id: 'stundenplan', g: 'Schule', icon: 'clock', c: '#3B82F6', t: 'Stundenplan & Untis', d: 'A/B-Wochen, Stundenzeiten, WebUntis', k: 'untis webuntis ab-wochen a/b zeiten stunden hausaufgaben klausuren' },
    { id: 'dateien', g: 'Daten', icon: 'file', c: '#0EA5E9', t: 'Dateien & Speicher', d: 'Cloud-Speicher und Dateien auf diesem Gerät', k: 'speicher cloud lernzettel gerät' },
    { id: 'daten', g: 'Daten', icon: 'download', c: '#64748B', t: 'Daten & Backup', d: 'Exportieren, importieren, Beispieldaten, löschen', k: 'backup export import löschen beispieldaten demo zurücksetzen' },
    { id: 'app', g: 'App', icon: 'info', c: '#78716C', t: 'App & Infos', d: 'Installieren, Version, Was ist neu', k: 'installieren home-bildschirm version neu update' },
  ];
  PL.SETTINGS_SECTIONS = SECTIONS;

  function sectionBody(id) {
    const s = st().settings;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(s[key]) === String(v) ? 'on' : ''}" data-action="setting" data-key="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    switch (id) {
      case 'profil': return `<section class="card">
          <div class="field"><label for="setName">Dein Name</label><input id="setName" class="input" data-setting="name" value="${esc(s.name)}" placeholder="Optional" maxlength="30"><div class="hint">Erscheint in der Begrüßung und im Chat · höchstens 3 Änderungen pro Tag</div></div>
          <div class="opt-row"><div><div class="t">Design</div><div class="d">Hell, dunkel oder wie dein Gerät</div></div>${seg('theme', [['auto', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']])}</div>
          <div class="opt-row"><div><div class="t">Aktuelles Halbjahr</div><div class="d">Neue Noten landen standardmäßig hier</div></div>${seg('currentSem', s.semesters.map((n, i) => [i, esc(n)]))}</div>
        </section>`;
      case 'abitur': return `<section class="card">
          <div class="card-head"><div><h2 class="card-title">Rechenregeln</h2><div class="card-sub">Standard: Regeln wie in NRW (4 Prüfungen, LK doppelt)</div></div></div>
          <div class="opt-row"><div><div class="t">Prüfungen</div><div class="d">Anzahl × Gewichtung = max. 300 Punkte</div></div>${seg('examCount', [[4, '4 × 5'], [5, '5 × 4']])}</div>
          <div class="opt-row"><div><div class="t">LK-Gewichtung</div><div class="d">Faktor der Leistungskurse in Block I</div></div>${seg('lkWeight', [[1, '1×'], [2, '2×']])}</div>
          <div class="opt-row"><div><div class="t">Anteil Klausuren</div><div class="d">an der rechnerischen Halbjahresnote</div></div>${seg('klausurShare', [[40, '40 %'], [50, '50 %'], [60, '60 %']])}</div>
          <div class="opt-row"><div><div class="t">Notenprognose</div><div class="d">Fehlende Noten aus deinem Schnitt hochrechnen</div></div>
            <label class="switch"><input type="checkbox" data-setting="prognosis" ${s.prognosis ? 'checked' : ''}><span></span></label></div>
        </section>
        <section class="card"><div class="opt-row"><div><div class="t">Fächer neu einrichten</div><div class="d">Fächer, Leistungskurse und Prüfungsfächer wählen</div></div><button class="btn btn-sm" data-action="setup">Einrichten</button></div></section>`;
      case 'stundenplan': return `<section class="card">
          <div class="card-head"><div><h2 class="card-title">Stundenplan</h2><div class="card-sub">${st().lessons.length} Stunden eingetragen</div></div><a class="link-btn" href="#/plan">Öffnen ${ic('chevron-right')}</a></div>
          <div class="opt-row"><div><div class="t">A/B-Wochen</div><div class="d">Für Stunden, die nur jede zweite Woche stattfinden</div></div>
            <label class="switch"><input type="checkbox" data-setting="abWeeks" ${s.abWeeks ? 'checked' : ''}><span></span></label></div>
          ${s.abWeeks ? `<div class="opt-row"><div><div class="t">Diese Woche ist eine …</div><div class="d">KW ${PL.isoWeek(new Date())}</div></div>
            <div class="seg"><button class="${PL.weekType(new Date()) === 'A' ? 'on' : ''}" data-action="set-ab" data-v="A">A-Woche</button><button class="${PL.weekType(new Date()) === 'B' ? 'on' : ''}" data-action="set-ab" data-v="B">B-Woche</button></div></div>` : ''}
          <div class="opt-row"><div><div class="t">Stundenzeiten</div><div class="d">${s.periods.length} Stunden · ${esc(s.periods[0].start)} bis ${esc(s.periods[s.periods.length - 1].end)}</div></div><button class="btn btn-sm" data-action="edit-periods">${ic('edit', 'i-sm')} Bearbeiten</button></div>
        </section>
        ${PL.untis ? `<section class="card"><div class="card-head"><div><h2 class="card-title">WebUntis</h2><div class="card-sub">Ausfälle, Raumänderungen, Klausuren und Hausaufgaben live</div></div></div>${PL.untis.settingsRow()}</section>` : ''}`;
      case 'konto': return `${accountCard()}${PL.admin ? PL.admin.card() : ''}`;
      case 'dateien': return PL.notesStorageRow();
      case 'daten': return `<section class="card">
          <div class="card-head"><div><h2 class="card-title">Daten</h2><div class="card-sub">${PL.sync.user ? 'Gespeichert auf diesem Gerät und in deinem Konto' : 'Ohne Konto nur auf diesem Gerät gespeichert'}</div></div></div>
          <div class="opt-row"><div><div class="t">Backup exportieren</div><div class="d">Als Datei sichern oder aufs Handy übertragen</div></div><button class="btn btn-sm" data-action="export">${ic('download', 'i-sm')} Export</button></div>
          <div class="opt-row"><div><div class="t">Backup importieren</div><div class="d">Ersetzt die aktuellen Daten</div></div><button class="btn btn-sm" data-action="import">${ic('upload', 'i-sm')} Import</button></div>
          <div class="opt-row"><div><div class="t">Beispieldaten laden</div><div class="d">Ersetzt deine Daten durch eine Demo</div></div><button class="btn btn-sm" data-action="demo">Laden</button></div>
        </section>
        <section class="card"><div class="opt-row"><div><div class="t" style="color:var(--danger-ink)">Alles löschen</div><div class="d">Noten, Fächer, Termine und Dateien entfernen</div></div><button class="btn btn-sm btn-danger" data-action="reset">${ic('trash', 'i-sm')} Löschen</button></div></section>`;
      case 'app': return `<section class="card">
          <div class="card-head"><h2 class="card-title">Als App installieren</h2></div>
          <p style="margin:0;color:var(--text-2);font-size:14px;line-height:1.6"><b>iPhone/iPad:</b> In Safari auf „Teilen“ → „Zum Home-Bildschirm“.<br><b>Android:</b> Im Chrome-Menü „App installieren“.<br><b>PC:</b> In Chrome/Edge auf das Installieren-Symbol in der Adressleiste.</p>
        </section>
        <section class="card">
          <div class="card-head"><h2 class="card-title">Tastenkürzel</h2><span class="card-sub">am Computer</span></div>
          <div class="opt-row"><div class="t">Suchen</div><span><kbd>${document.documentElement.classList.contains('mac') ? '⌘' : 'Strg'}</kbd> <kbd>K</kbd></span></div>
          <div class="opt-row"><div class="t">Note eintragen</div><kbd>N</kbd></div>
          <div class="opt-row"><div class="t">Hausaufgabe eintragen</div><kbd>H</kbd></div>
          <div class="opt-row"><div class="t">Termin anlegen</div><kbd>T</kbd></div>
          <div class="opt-row"><div class="t">Datei hochladen</div><kbd>D</kbd></div>
          <div class="opt-row"><div class="t">Im Fenster speichern</div><span><kbd>${document.documentElement.classList.contains('mac') ? '⌘' : 'Strg'}</kbd> <kbd>↵</kbd></span></div>
        </section>
        <div class="about"><span class="brand-mark" aria-hidden="true"></span><div><b>Punktlandung</b><span>Version ${PL.VERSION}</span></div>
          ${PL.whatsNewSheet ? `<button class="btn btn-sm" data-action="whats-new">${ic('sparkle', 'i-sm')} Was ist neu</button>` : ''}</div>`;
      default: return '';
    }
  }

  const setItem = (x) => `<a class="set-item" href="#/einstellungen/${x.id}" style="--c:${x.c}" data-k="${esc((x.t + ' ' + x.d + ' ' + x.k).toLowerCase())}">
      <span class="set-ic">${ic(x.icon)}</span><span class="set-txt"><b>${x.t}</b><span>${x.d}</span></span>${ic('chevron-right', 'i-sm')}</a>`;
  const groups = () => SECTIONS.reduce((a, x) => { (a[x.g] = a[x.g] || []).push(x); return a; }, {});

  PL.views.settings = function (arg) {
    const sec = SECTIONS.find((x) => x.id === arg);
    if (!sec) {
      const g = groups();
      return `<div class="page view">
        ${pageHead(`Punktlandung · Version ${PL.VERSION}`, 'Einstellungen')}
        <label class="set-search">${ic('search', 'i-sm')}<input type="search" data-input="set-search" placeholder="Einstellungen durchsuchen" aria-label="Einstellungen durchsuchen" autocomplete="off"></label>
        <div data-set-list>${Object.keys(g).map((name) => `<div class="set-group" data-set-group>${name}</div><div class="set-grid">${g[name].map(setItem).join('')}</div>`).join('')}</div>
        <p class="hint" data-set-none hidden style="margin:14px 12px">Nichts gefunden.</p>
      </div>`;
    }
    const g = groups();
    const nav = Object.keys(g).map((name) => `<div class="set-group">${name}</div>${g[name].map((x) => `<a href="#/einstellungen/${x.id}" class="${x.id === sec.id ? 'on' : ''}" style="--c:${x.c}">${ic(x.icon)}${x.t}</a>`).join('')}`).join('');
    return `<div class="page view">
      <a class="back-link set-back" href="#/einstellungen">${ic('chevron-left', 'i-sm')} Einstellungen</a>
      <div class="set-layout">
        <nav class="set-nav" aria-label="Bereiche">${nav}</nav>
        <div>
          <div class="set-sec-head" style="--c:${sec.c}"><span class="set-ic">${ic(sec.icon)}</span><div><h2>${sec.t}</h2><p>${sec.d}</p></div></div>
          <div class="set-body">${sectionBody(sec.id)}</div>
        </div>
      </div>
    </div>`;
  };
  /* Suche in der Übersicht der Einstellungen (ohne neu zu zeichnen) */
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  document.addEventListener('input', (e) => {
    if (!e.target.dataset || e.target.dataset.input !== 'set-search') return;
    const q = norm(e.target.value.trim());
    const box = document.querySelector('[data-set-list]');
    if (!box) return;
    let any = false;
    box.querySelectorAll('.set-grid').forEach((grid) => {
      let n = 0;
      grid.querySelectorAll('.set-item').forEach((it) => { const ok = !q || q.split(/\s+/).every((w) => norm(it.dataset.k).includes(w)); it.hidden = !ok; if (ok) n++; });
      grid.hidden = !n;
      const head = grid.previousElementSibling;
      if (head && head.matches('[data-set-group]')) head.hidden = !n;
      if (n) any = true;
    });
    const none = document.querySelector('[data-set-none]');
    if (none) none.hidden = any;
  });

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'setup-hide': () => { st().settings.setupDone = true; PL.save(); PL.toast('Ausgeblendet – Einrichtung findest du unter Einstellungen'); },
  });
})();
