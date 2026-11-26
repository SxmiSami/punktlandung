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
    meta.forEach((m) => m.setAttribute('content', t === 'light' ? '#F3F4F8' : '#0B0C12'));
  };
  mq.addEventListener && mq.addEventListener('change', PL.applyTheme);

  /* ---- Sheet ---- */
  const layer = () => document.getElementById('sheetLayer');
  const sheetEl = () => document.getElementById('sheet');
  let lastFocus = null;
  PL.openSheet = function (html, opts = {}) {
    lastFocus = document.activeElement;
    const sh = sheetEl();
    sh.className = 'sheet' + (opts.wide ? ' wide' : '');
    sh.innerHTML = '<div class="sheet-handle"></div>' + html;
    layer().hidden = false;
    layer().classList.remove('closing');
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
    setTimeout(() => {
      l.hidden = true; sh.innerHTML = ''; sh.style.transform = '';
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
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

  PL.ring = function (frac) {
    const r = 46, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, frac || 0)));
    return `<svg viewBox="0 0 112 112" aria-hidden="true">
      <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C6F36B"/><stop offset="1" stop-color="#A89BFF"/></linearGradient></defs>
      <circle class="ring-bg" cx="56" cy="56" r="${r}" fill="none" stroke-width="10"/>
      <circle class="ring-fg" cx="56" cy="56" r="${r}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>`;
  };
})();
