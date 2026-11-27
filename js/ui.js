/* UI-Helfer: Escaping, Badges, Sheets, Toasts, Theme, Charts */
(function () {
  PL.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  PL.icon = (id, cls = '') => `<svg class="i ${cls}"><use href="#i-${id}"/></svg>`;

  PL.badge = function (points, opts = {}) {
    if (points == null) return `<span class="gb gb-empty ${opts.lg ? 'gb-lg' : ''}">–</span>`;
    const txt = opts.note ? PL.fmt(PL.toNote(points), 2) : (opts.dec != null ? PL.fmt(points, opts.dec) : PL.fmtPts(points));
    return `<span class="gb ${opts.lg ? 'gb-lg' : ''}" data-tier="${PL.tier(points)}">${opts.prefix || ''}${txt}${opts.suffix || ''}</span>`;
  };

  PL.subjChip = (sub) => sub
    ? `<span class="subj-chip" style="--c:${sub.color}"><span class="dot">${PL.esc(sub.short)}</span><span class="nm">${PL.esc(sub.name)}</span></span>`
    : `<span class="subj-chip" style="--c:var(--card-3)"><span class="dot">?</span><span class="nm muted">Nicht gewählt</span></span>`;

  PL.semName = (i) => PL.state.settings.semesters[i] || ('HJ ' + (i + 1));

  /* ---- Datum ---- */
  PL.parseDate = (iso) => { const [y, m, d] = (iso || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  PL.daysUntil = (iso) => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((PL.parseDate(iso) - t) / 864e5);
  };
  PL.fmtDate = (iso) => { if (!iso) return ''; const d = PL.parseDate(iso); return d.getDate() + '. ' + PL.MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  PL.relDays = (n) => (n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n === -1 ? 'Gestern' : n > 0 ? `in ${n} Tagen` : `vor ${-n} Tagen`);
  PL.dateBox = (iso) => { const d = PL.parseDate(iso); return `<div class="date-box"><div class="d">${d.getDate()}</div><div class="m">${PL.MONTHS[d.getMonth()]}</div></div>`; };

  /* ---- Theme ---- */
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  PL.applyTheme = function () {
    const pref = PL.state.settings.theme;
    const t = pref === 'auto' ? (mq.matches ? 'light' : 'dark') : pref;
    document.documentElement.dataset.theme = t;
    const meta = document.querySelectorAll('meta[name="theme-color"]');
    meta.forEach((m) => m.setAttribute('content', t === 'light' ? '#FFFFFF' : '#0F0F11'));
  };
  mq.addEventListener && mq.addEventListener('change', PL.applyTheme);

  /* ---- Sheet ---- */
  const layer = () => document.getElementById('sheetLayer');
  const sheetEl = () => document.getElementById('sheet');
  let lastFocus = null, closeTimer = null;
  /* opts: wide, split (zwei Spalten am Computer), cls (weitere Klassen), layer ('top' = oben statt mittig), onMount */
  PL.openSheet = function (html, opts = {}) {
    // Ein gerade schließendes Fenster darf das neue nicht mehr wegräumen
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    const l = layer();
    if (l.hidden) lastFocus = document.activeElement;
    const sh = sheetEl();
    sh.className = 'sheet' + (opts.wide ? ' wide' : '') + (opts.split ? ' two-col' : '') + (opts.cls ? ' ' + opts.cls : '');
    sh.style.transform = '';
    sh.innerHTML = '<div class="sheet-handle"></div>' + html;
    sh.scrollTop = 0;
    l.className = 'sheet-layer' + (opts.layer ? ' ' + opts.layer : '');
    l.hidden = false;
    document.body.style.overflow = 'hidden';
    if (opts.onMount) opts.onMount(sh);
    setTimeout(() => { const f = sh.querySelector('[autofocus]'); if (f && window.innerWidth >= 720) f.focus(); }, 60);
    enableSwipe(sh);
  };
  PL.closeSheet = function () {
    const l = layer();
    if (l.hidden || l.classList.contains('closing')) return;
    const sh = sheetEl();
    sh.classList.add('closing'); l.classList.add('closing');
    closeTimer = setTimeout(() => {
      closeTimer = null;
      l.hidden = true; l.className = 'sheet-layer'; sh.innerHTML = ''; sh.style.transform = '';
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    }, 200);
  };
  PL.sheetHead = (title, sub) => `
    <div class="sheet-head">
      <div><h2 class="sheet-title">${title}</h2>${sub ? `<div class="card-sub">${sub}</div>` : ''}</div>
      <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${PL.icon('x')}</button>
    </div>`;

  /* Herunterwischen schließt das Sheet (mobil) */
  function enableSwipe(sh) {
    const handle = sh.querySelector('.sheet-handle');
    if (!handle) return;
    let y0 = null, x0 = 0, dy = 0;
    const start = (e) => { if (sh.scrollTop > 0 || e.target.closest('.chips, .seg')) return; y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; sh.style.transition = 'none'; };
    const move = (e) => {
      if (y0 == null) return;
      const t = e.touches[0];
      // seitliches Wischen ist kein Schließen
      if (!dy && Math.abs(t.clientX - x0) > Math.abs(t.clientY - y0)) { y0 = null; return; }
      dy = Math.max(0, t.clientY - y0); if (dy > 0) { sh.style.transform = `translateY(${dy}px)`; }
    };
    const end = () => {
      if (y0 == null) return;
      sh.style.transition = 'transform .2s ease';
      if (dy > 110) PL.closeSheet(); else sh.style.transform = '';
      y0 = null;
    };
    sh.addEventListener('touchstart', start, { passive: true });
    sh.addEventListener('touchmove', move, { passive: true });
    sh.addEventListener('touchend', end);
  }

  /* ---- Toast ---- */
  PL.toast = function (msg, undo) {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${PL.icon('check')}<span>${PL.esc(msg)}</span>${undo ? '<button type="button">Rückgängig</button>' : ''}`;
    box.appendChild(t);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
    if (undo) t.querySelector('button').onclick = () => { undo(); kill(); };
    setTimeout(kill, undo ? 5000 : 2600);
  };

  /* ---- Charts ---- */
  PL.trendChart = function (points) {
    if (points.length < 2) return '<div class="empty"><b>Noch zu wenig Daten</b>Ab zwei Noten siehst du hier deinen Verlauf.</div>';
    const W = 600, H = 150, pl = 26, pr = 8, pt = 10, pb = 18;
    const vals = points.map((p) => p.avg);
    let min = Math.floor(Math.min(...vals) - .5), max = Math.ceil(Math.max(...vals) + .5);
    min = Math.max(0, min); max = Math.min(15, max);
    if (max - min < 2) { max = Math.min(15, min + 2); min = Math.max(0, max - 2); }
    const x = (i) => pl + (i / (points.length - 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
    let d = '';
    points.forEach((p, i) => {
      if (!i) { d = `M${x(0)},${y(p.avg)}`; return; }
      const x0 = x(i - 1), y0 = y(points[i - 1].avg), x1 = x(i), y1 = y(p.avg), cx = (x0 + x1) / 2;
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    });
    const area = d + ` L${x(points.length - 1)},${H - pb} L${x(0)},${H - pb} Z`;
    const ticks = [];
    const step = (max - min) > 6 ? 2 : 1;
    for (let v = min; v <= max; v += step) ticks.push(v);
    const last = points[points.length - 1];
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Verlauf deines Notenschnitts">
      <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((v) => `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-lbl" x="0" y="${y(v) + 3.5}">${v}</text>`).join('')}
      <path d="${area}" fill="url(#areaGrad)"/>
      <path class="line" d="${d}" vector-effect="non-scaling-stroke"/>
      <circle class="dot" cx="${x(points.length - 1)}" cy="${y(last.avg)}" r="4.5" vector-effect="non-scaling-stroke"/>
    </svg>`;
  };

  PL.histogram = function (dist) {
    const max = Math.max(1, ...dist);
    let h = '';
    for (let p = 0; p <= 15; p++) {
      const pct = dist[p] ? Math.max(8, (dist[p] / max) * 100) : 4;
      h += `<div class="col" title="${dist[p]}× ${p} Punkte"><div class="b ${dist[p] ? '' : 'zero'}" data-tier="${PL.tier(p)}" style="height:${pct}%"></div><span class="l">${p}</span></div>`;
    }
    return `<div class="histo">${h}</div>`;
  };

  /* Belastungs-Heatmap: eine Zeile pro Woche, eine Zelle pro Tag */
  const LOAD_TIER = [0, 1, 3, 4, 5];
  PL.workloadCard = function (weeks = 8, opts = {}) {
    const esc = PL.esc;
    const data = PL.workload(weeks);
    const tip = (it) => `${it.sub ? it.sub.short + ': ' : ''}${it.kind === 'task' ? 'Aufgabe – ' : it.type + ' – '}${it.title}`;
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const rows = data.map((w) => {
      const d0 = PL.parseDate(w.start), d6 = PL.addDays(d0, 6);
      const range = `${d0.getDate()}.${d0.getMonth() + 1}.–${d6.getDate()}.${d6.getMonth() + 1}.`;
      const cells = w.days.map((d) => {
        const evs = d.items.filter((it) => it.kind === 'event');
        const tasks = d.items.length - evs.length;
        const inner = evs.slice(0, 2).map((it) => `<b>${esc(it.sub ? it.sub.short : it.type.charAt(0))}</b>`).join('')
          + (evs.length > 2 ? '<b>+</b>' : '') + (tasks ? `<i>${tasks > 1 ? tasks : ''}</i>` : '');
        const label = `${dayNames[(PL.parseDate(d.date).getDay() + 6) % 7]}, ${PL.fmtDate(d.date)}${d.items.length ? ': ' + d.items.map(tip).join(', ') : ': nichts'}`;
        const cls = `wl-cell${d.past ? ' past' : ''}${d.today ? ' today' : ''}`;
        const attrs = `data-l="${d.level}" data-tier="${LOAD_TIER[d.level] || ''}" title="${esc(label)}" aria-label="${esc(label)}"`;
        return evs.length
          ? `<button type="button" class="${cls}" ${attrs} data-action="open-event" data-id="${evs[0].id}">${inner}</button>`
          : `<span class="${cls}" ${attrs}>${inner}</span>`;
      }).join('');
      const sub = [w.exams && `${w.exams} ${w.exams === 1 ? 'Termin' : 'Termine'}`, w.tasks && `${w.tasks} ${w.tasks === 1 ? 'Aufgabe' : 'Aufgaben'}`].filter(Boolean).join(' · ');
      return `<div class="wl-row">
        <div class="wl-kw"><b>KW ${w.kw}</b><span>${range}</span></div>
        <div class="wl-days">${cells}</div>
        <div class="wl-sum" data-tier="${LOAD_TIER[w.level] || ''}" data-l="${w.level}" title="${esc(sub || 'Nichts geplant')}"><b>${PL.LOAD_LABELS[w.level]}</b><span>${sub || '–'}</span></div>
      </div>`;
    }).join('');

    const peak = data.reduce((a, w) => (w.score > a.score ? w : a), data[0]);
    const examsTotal = data.reduce((x, w) => x + w.days.reduce((y, d) => y + d.items.filter((it) => it.kind === 'event' && /Klausur|Abiprüfung/.test(it.type)).length, 0), 0);
    const busy = data.filter((w) => w.level >= 3).length;
    const free = data.filter((w) => !w.exams).length;
    const stat = (v, l) => `<div class="wl-stat"><div class="v num">${v}</div><div class="l">${l}</div></div>`;
    const stats = `<div class="wl-stats">
      ${stat(peak.score ? 'KW ' + peak.kw : '–', 'Stressigste Woche')}
      ${stat(examsTotal, 'Klausuren')}
      ${stat(busy, busy === 1 ? 'Volle Woche' : 'Volle Wochen')}
      ${stat(free, 'Ohne Prüfung')}
    </div>`;
    const legend = `<div class="wl-legend">${[1, 2, 3, 4].map((l) => `<span><i data-l="${l}" data-tier="${LOAD_TIER[l]}"></i>${PL.LOAD_LABELS[l]}</span>`).join('')}</div>`;

    return `<section class="card ${opts.cls || ''}">
      <div class="card-head"><div><h2 class="card-title">${PL.icon('calendar')} Belastung</h2><div class="card-sub">Nächste ${weeks} Wochen · Klausuren, Tests, Referate und offene Aufgaben</div></div>${opts.link ? `<a class="link-btn" href="#/termine">Termine ${PL.icon('chevron-right', 'i-sm')}</a>` : ''}</div>
      ${stats}
      <div class="wl">
        <div class="wl-row wl-head"><div class="wl-kw"></div><div class="wl-days">${dayNames.map((n) => `<span>${n}</span>`).join('')}</div><div class="wl-sum"></div></div>
        ${rows}
      </div>
      ${legend}
    </section>`;
  };

  /* Kleine Verlaufslinie (Kennzahl-Kacheln) */
  PL.spark = function (vals) {
    const v = (vals || []).filter((x) => x != null && !isNaN(x));
    if (v.length < 2) return '';
    const W = 64, H = 26, p = 3;
    let min = Math.min(...v), max = Math.max(...v);
    if (max - min < 1) { min -= .5; max += .5; }
    const x = (i) => p + (i / (v.length - 1)) * (W - 2 * p);
    const y = (n) => p + (1 - (n - min) / (max - min)) * (H - 2 * p);
    const d = v.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="2.6"/></svg>`;
  };

  /* Veränderung mit Pfeil: z. B. „↑ 0,4 ggü. Q1.2“ */
  PL.delta = function (d, label, opts = {}) {
    if (d == null || isNaN(d)) return '';
    const r = Math.round(d * 10) / 10;
    const good = opts.invert ? r < 0 : r > 0;
    const cls = r === 0 ? '' : good ? 'up' : 'down';
    const arrow = r === 0 ? '' : PL.icon(r > 0 ? 'arrow-up' : 'arrow-down');
    return `<span class="delta ${cls}">${arrow}${PL.fmt(Math.abs(r), 1)}${label ? ' ' + label : ''}</span>`;
  };

  /* Kleiner Fortschrittsring (Einrichtung) */
  PL.progRing = function (frac) {
    const r = 7, c = 2 * Math.PI * r;
    return `<svg class="prog-ring" viewBox="0 0 18 18" aria-hidden="true"><circle class="bg" cx="9" cy="9" r="${r}"/><circle class="fg" cx="9" cy="9" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, frac)))}"/></svg>`;
  };

  /* Zeitleiste mit Schritten: [{ s: 'done'|'cur'|'bad'|'', t, d, html }] */
  PL.stepsHtml = function (steps) {
    const mk = (s) => (s === 'done' ? PL.icon('check') : s === 'bad' ? PL.icon('x') : '');
    return `<ol class="steps-tl">${steps.map((x) => `<li class="${x.s || ''}"><span class="st-mk">${mk(x.s)}</span>
      <div class="st-body"><b>${x.t}</b>${x.d ? `<span>${x.d}</span>` : ''}${x.html || ''}</div></li>`).join('')}</ol>`;
  };

  /* Schnitt pro Halbjahr als Balken, aktuelles Halbjahr dunkel, Ziel gestrichelt (wie bei Steep) */
  PL.semChart = function (vals, cur, goal) {
    const have = vals.filter((v) => v != null);
    if (!have.length) return '<div class="empty" style="border:0">Noch keine Halbjahresnoten</div>';
    const lo = Math.max(0, Math.floor(Math.min(...have, goal != null ? goal : 15) - 3));
    const pct = (v) => Math.max(6, Math.min(100, ((v - lo) / (15 - lo)) * 100));
    const cols = vals.map((v, i) => `<div class="sc-col ${i === cur ? 'cur' : ''}">
      <div class="sc-bar ${v == null ? 'empty' : ''} ${i === cur ? 'cur' : ''}" ${v != null ? `style="height:${pct(v)}%"` : ''}>${v != null ? `<span>${PL.fmt(v, 1)}</span>` : ''}</div>
      <b>${PL.esc(PL.semName(i))}</b></div>`).join('');
    // Ziel-Linie: Abstand von unten innerhalb der Balkenfläche (ohne Beschriftung oben und unten)
    const g = goal != null ? `<div class="sc-goal" style="bottom:calc(24px + (100% - 42px) * ${(pct(goal) / 100).toFixed(3)})"></div>` : '';
    return `<div class="sc-chart" role="img" aria-label="Schnitt pro Halbjahr">${g}${cols}</div>
      ${goal != null ? `<div class="sc-legend"><i></i>Ziel: ${PL.fmt(goal, 1)} Punkte im Schnitt</div>` : ''}`;
  };

  PL.ring = function (frac) {
    const r = 46, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, frac || 0)));
    return `<svg viewBox="0 0 112 112" aria-hidden="true">
      
      <circle class="ring-bg" cx="56" cy="56" r="${r}" fill="none" stroke-width="10"/>
      <circle class="ring-fg" cx="56" cy="56" r="${r}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>`;
  };
})();
