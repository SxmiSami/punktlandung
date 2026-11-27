/* Grundgerüst: Seitenleiste, Kopfzeile, Tab-Leiste, Suche und „Was möchtest du eintragen?“
   - iPhone: schwebende Tab-Leiste mit Namen, + rechts daneben (schrumpft beim Scrollen)
   - iPad hochkant: schmale Icon-Leiste, lässt sich als Seitenleiste darüber aufklappen
   - Computer: Seitenleiste (einklappbar) und schwebender Inhaltsbereich mit Kopfzeile */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const root = document.documentElement;
  const SB_KEY = 'punktlandung:sidebar';
  const SUBJ_KEY = 'punktlandung:sb-subjects';
  const mqDesk = window.matchMedia('(min-width: 768px) and (min-height: 501px)');
  const isMac = root.classList.contains('mac');
  const keyName = isMac ? '⌘' : 'Strg';

  PL.isDesk = () => mqDesk.matches;
  /* Was scrollt? Am Computer der Inhaltsbereich, sonst die Seite */
  PL.scroller = () => {
    const panel = document.getElementById('panel');
    return PL.isDesk() && panel && !root.classList.contains('no-tabbar') ? panel : (document.scrollingElement || document.documentElement);
  };

  /* ---------- Breite der Seitenleiste ---------- */
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } };
  function applyLayout() {
    const w = window.innerWidth;
    const rail = w >= 768 && (w < 1100 || get(SB_KEY) === 'rail');
    root.classList.toggle('rail', rail);
    if (!rail) root.classList.remove('sb-open');
  }
  applyLayout();
  window.addEventListener('resize', applyLayout);

  /* ---------- Seiten ---------- */
  const GROUPS = [
    { items: ['', 'neu'] },
    { label: 'Schule', items: ['faecher', 'plan', 'aufgaben', 'abitur'] },
    { label: 'Austausch', items: ['dateien', 'chat'] },
  ];
  /* Farben der Symbole im „Mehr“-Fenster (wie in den iOS-Einstellungen) */
  const TINT = { '': '#FF5B1F', neu: '#EF4444', faecher: '#6366F1', plan: '#3B82F6', aufgaben: '#22C55E', dateien: '#0EA5E9', chat: '#10B981', abitur: '#8B5CF6', einstellungen: '#64748B' };
  const navItems = () => PL.NAV.filter((n) => n.id !== 'chat' || (PL.chat && PL.chat.available()));
  const counts = () => ({
    aufgaben: PL.state.tasks.filter((t) => !t.done).length,
    chat: PL.chat ? PL.chat.unread : 0,
    neu: PL.feed ? PL.feed.unread() : 0,
  });
  const fmtN = (v) => (v > 99 ? '99+' : String(v));
  const activeOf = (r) => (r.name === 'fach' ? 'faecher' : r.name === 'termine' ? 'plan' : r.name);

  function sideNavHtml(r) {
    const active = activeOf(r);
    const by = {};
    navItems().forEach((n) => { by[n.id] = n; });
    const c = counts();
    const count = (id) => (id === 'aufgaben' && c.aufgaben ? `<span class="count">${c.aufgaben}</span>`
      : (id === 'chat' || id === 'neu') && c[id] ? `<span class="count badge">${fmtN(c[id])}</span>` : '');
    const link = (n) => `<a class="side-link ${active === n.id && r.name !== 'fach' ? 'active' : ''}" href="#/${n.id}" title="${esc(n.label)}" ${active === n.id ? 'aria-current="page"' : ''}>${ic(n.icon)}<span class="lbl">${esc(n.label)}</span>${count(n.id)}</a>`;
    let h = '';
    GROUPS.forEach((g) => {
      const items = g.items.map((id) => by[id]).filter(Boolean);
      if (!items.length) return;
      if (g.label) h += `<div class="sb-label"><span>${g.label}</span></div><span class="sb-sep"></span>`;
      h += items.map(link).join('');
    });
    const subs = PL.sortedSubjects();
    if (subs.length) {
      const closed = get(SUBJ_KEY) === 'closed';
      h += `<div class="sb-label ${closed ? 'closed' : ''}"><button type="button" data-action="sb-subjects" aria-expanded="${!closed}">Deine Fächer ${ic('chevron-down')}</button></div>`;
      if (!closed) {
        h += subs.map((s) => {
          const a = PL.subjectAvg(s.id);
          return `<a class="side-link side-subj ${r.name === 'fach' && r.arg === s.id ? 'active' : ''}" href="#/fach/${s.id}" style="--c:${s.color}" title="${esc(s.name)}"><span class="sdot"></span><span class="lbl">${esc(s.name)}</span><span class="avg">${a != null ? PL.fmt(a, 1) : ''}</span></a>`;
        }).join('');
      }
    }
    return h;
  }

  function footHtml(r) {
    const s = PL.state.settings;
    let h = '';
    if (s.demo) {
      h += `<div class="side-demo"><b>${ic('sparkle')} Beispieldaten</b><span>Du probierst die App gerade mit erfundenen Noten aus.</span>
        <button class="btn btn-sm btn-block" data-action="demo-exit">Eigene Daten anlegen</button></div>`;
    }
    if (PL.whatsNewSheet) {
      h += `<button class="side-news" data-action="whats-new" title="Was ist neu"><span class="ico">${ic('sparkle')}</span><span class="txt"><b>Was ist neu</b><small>Version ${esc(PL.VERSION)}</small></span></button>`;
    }
    const nm = (s.name || '').trim();
    const mail = PL.sync.user ? (PL.sync.user.email || '') : '';
    const initial = (nm || mail).charAt(0).toUpperCase();
    h += `<a class="side-account ${r.name === 'einstellungen' ? 'active' : ''}" href="#/einstellungen" title="Einstellungen" aria-label="Einstellungen">
      <span class="avatar">${initial ? esc(initial) : ic('settings')}</span>
      <span class="who"><b>${esc(nm || 'Einstellungen')}</b><small>${esc(mail || 'Nur auf diesem Gerät')}</small></span>
      ${PL.sync.user ? PL.syncDot().replace('sync-dot', 'sync-dot static') : ''}${ic('settings')}</a>`;
    return h;
  }

  /* ---------- Kopfzeile ---------- */
  const SET_NAMES = { profil: 'Profil & Darstellung', abitur: 'Abitur-Regeln', stundenplan: 'Stundenplan & Untis', konto: 'Konto', dateien: 'Dateien & Speicher', daten: 'Daten & Backup', app: 'App & Infos' };
  function crumbs(r) {
    const nav = {};
    PL.NAV.forEach((n) => { nav[n.id] = n.label; });
    const one = (t) => `<b>${esc(t)}</b>`;
    const two = (href, a, b) => `<a href="${href}">${esc(a)}</a><span class="sep">/</span><b>${esc(b)}</b>`;
    switch (r.name) {
      case 'fach': { const s = PL.subject(r.arg); return s ? two('#/faecher', 'Fächer', s.name) : one('Fächer'); }
      case 'plan': return two('#/plan', 'Kalender', PL.ui.planMode === 'events' ? 'Termine' : 'Stundenplan');
      case 'termine': return two('#/plan', 'Kalender', 'Termine');
      case 'chat': { const c = r.arg && PL.chat && PL.chat.chat(r.arg); return c ? two('#/chat', 'Chat', PL.chat.title(c)) : one('Chat'); }
      case 'einstellungen': return r.arg && SET_NAMES[r.arg] ? two('#/einstellungen', 'Einstellungen', SET_NAMES[r.arg]) : one('Einstellungen');
      case 'setup': return one('Einrichtung');
      default: return one(nav[r.name] || 'Übersicht');
    }
  }
  function topbarHtml(r) {
    const n = PL.feed ? PL.feed.unread() : 0;
    const dark = root.dataset.theme === 'dark';
    return `<button class="tb-btn" data-action="sidebar-toggle" aria-label="Seitenleiste ein- oder ausklappen" title="Seitenleiste">${ic('sidebar')}</button>
      <nav class="crumbs" aria-label="Pfad">${crumbs(r)}</nav>
      <div class="tb-actions">
        <button class="tb-search" data-action="search" aria-label="Suchen">${ic('search')}<span>Suchen …</span><kbd>${keyName} K</kbd></button>
        <a class="tb-btn" href="#/neu" title="Neuigkeiten" aria-label="Neuigkeiten${n ? ` (${n} neu)` : ''}">${ic('bell')}${n ? `<i class="bell-badge">${fmtN(n)}</i>` : ''}</a>
        <button class="tb-btn" data-action="theme-toggle" title="${dark ? 'Helles Design' : 'Dunkles Design'}" aria-label="${dark ? 'Helles Design' : 'Dunkles Design'}">${ic(dark ? 'sun' : 'moon')}</button>
      </div>`;
  }

  /* ---------- Tab-Leiste (iPhone) ---------- */
  function tabbarHtml(r) {
    const active = activeOf(r);
    const c = counts();
    const nav = navItems();
    const tabs = nav.filter((n) => !n.noTab).slice(0, 4);
    const inMenu = !tabs.some((n) => n.id === active);
    // Neuigkeiten haben unten keinen eigenen Reiter: ihr Zähler hängt an „Übersicht“
    const badge = (id) => { const v = id === 'aufgaben' ? c.aufgaben : id === 'chat' ? c.chat : id === '' ? c.neu : 0; return v ? `<i class="tab-badge">${fmtN(v)}</i>` : ''; };
    const tab = (n) => `<a class="tab ${active === n.id ? 'active' : ''}" href="#/${n.id}" aria-label="${esc(n.label)}" ${active === n.id ? 'aria-current="page"' : ''}>${ic(n.icon)}<span>${esc(n.tab || n.label)}</span>${badge(n.id)}</a>`;
    return tabs.map(tab).join('')
      + `<button class="tab ${inMenu ? 'active' : ''}" data-action="nav-menu" aria-label="Weitere Seiten">${ic('menu')}<span>Mehr</span>${c.chat ? `<i class="tab-badge">${fmtN(c.chat)}</i>` : ''}</button>`;
  }

  /* Plus-Knopf passt sich der Seite an */
  function fabFor(r) {
    if (r.name === 'aufgaben') return ['add-task', 'Aufgabe hinzufügen'];
    if (r.name === 'dateien') return ['add-note', 'Datei hochladen'];
    if (r.name === 'chat') return ['new-chat', 'Neuer Chat'];
    if (r.name === 'plan' && PL.ui.planMode === 'week') return ['add-lesson', 'Stunde eintragen'];
    if (r.name === 'termine' || r.name === 'plan') return ['add-event', 'Termin hinzufügen'];
    if (r.name === 'fach' || r.name === 'faecher' || r.name === 'abitur') return ['add-grade', 'Note eintragen'];
    return ['new-entry', 'Neu eintragen'];
  }

  PL.shell = {};
  PL.shell.render = function (r) {
    const hidden = r.name === 'setup' || !PL.state.subjects.length;
    root.classList.toggle('no-tabbar', hidden);
    document.body.classList.toggle('no-tabbar', hidden);
    const nav = document.getElementById('sideNav');
    if (nav) {
      const y = nav.scrollTop;
      nav.innerHTML = sideNavHtml(r);
      nav.scrollTop = y;
    }
    const foot = document.getElementById('sideFoot');
    if (foot) foot.innerHTML = footHtml(r);
    const top = document.getElementById('topbar');
    if (top) top.innerHTML = topbarHtml(r);
    const tb = document.getElementById('tabbar');
    tb.style.display = hidden ? 'none' : '';
    tb.innerHTML = tabbarHtml(r);
    const fab = document.getElementById('fab');
    const [act, label] = fabFor(r);
    fab.dataset.action = act;
    fab.setAttribute('aria-label', label);
    fab.title = label;
    fab.hidden = hidden || r.name === 'einstellungen' || r.name === 'neu' || (r.name === 'chat' && (!!r.arg || !PL.sync.user));
  };
  PL.shell.routeChanged = function () {
    root.classList.remove('sb-open');
    const dock = document.getElementById('dock');
    if (dock) dock.classList.remove('min');
    lastY = 0;
  };

  /* Kopfzeile bekommt beim Scrollen eine feine Linie */
  const panel = document.getElementById('panel');
  panel.addEventListener('scroll', () => {
    const top = document.getElementById('topbar');
    if (top) top.classList.toggle('scrolled', panel.scrollTop > 4);
  }, { passive: true });
  /* iPhone: Tab-Leiste schrumpft beim Runterscrollen, beim Hochscrollen wieder groß */
  let lastY = 0;
  window.addEventListener('scroll', () => {
    if (PL.isDesk()) return;
    const y = window.scrollY;
    const dock = document.getElementById('dock');
    if (!dock) return;
    if (y > lastY + 8 && y > 120) dock.classList.add('min');
    else if (y < lastY - 8 || y < 60) dock.classList.remove('min');
    lastY = y;
  }, { passive: true });

  /* ---------- „Mehr“ (iPhone) ---------- */
  function menuSheet() {
    const r = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    const cur = r[0] === 'termine' ? 'plan' : r[0];
    const nav = navItems();
    const main = nav.filter((n) => !n.noTab).slice(0, 4).map((n) => n.id);
    const items = nav.filter((n) => !main.includes(n.id)).concat([{ id: 'einstellungen', label: 'Einstellungen', icon: 'settings' }]);
    const c = counts();
    const row = (n) => {
      const v = n.id === 'chat' ? c.chat : n.id === 'neu' ? c.neu : 0;
      return `<a class="menu-row ${cur === n.id ? 'active' : ''}" href="#/${n.id}" style="--c:${TINT[n.id] || '#64748B'}"><span class="ico">${ic(n.icon)}</span>${esc(n.label)}${v ? `<span class="count">${fmtN(v)}</span>` : ''}<span class="chev">${ic('chevron-right', 'i-sm')}</span></a>`;
    };
    PL.openSheet(`${PL.sheetHead('Mehr')}
      <button type="button" class="menu-search" data-action="search">${ic('search')}<span>Fächer, Aufgaben, Dateien suchen …</span></button>
      <nav class="menu-list" aria-label="Weitere Seiten">${items.map(row).join('')}</nav>`);
  }

  /* ---------- „Was möchtest du eintragen?“ ---------- */
  const CHOICES = [
    { act: 'add-grade', key: 'N', icon: 'target', c: '#FF5B1F', t: 'Note', d: 'Klausur oder sonstige Mitarbeit' },
    { act: 'add-task', key: 'H', icon: 'tasks', c: '#3B82F6', t: 'Hausaufgabe', d: 'Fällig zur nächsten Stunde im Fach' },
    { act: 'add-event', key: 'T', icon: 'calendar', c: '#F59E0B', t: 'Termin', d: 'Klausur, Test, Referat oder Abiprüfung' },
    { act: 'add-note', key: 'D', icon: 'upload', c: '#8B5CF6', t: 'Datei', d: 'Foto, PDF oder Lernzettel hochladen' },
    { act: 'add-lesson', key: '', icon: 'clock', c: '#14B8A6', t: 'Stunde', d: 'Im Stundenplan eintragen' },
  ];
  PL.chooserSheet = function () {
    if (!PL.state.subjects.length) { PL.startSetup(); return; }
    PL.openSheet(`${PL.sheetHead('Was möchtest du eintragen?')}
      <div class="choose">${CHOICES.map((x) => `<button type="button" class="ch-row" style="--c:${x.c}" data-action="${x.act}">
        <span class="ch-ic">${ic(x.icon)}</span>
        <span class="ch-txt"><b>${x.t}${x.key ? `<code>${x.key}</code>` : ''}</b><span>${x.d}</span></span>${ic('chevron-right', 'i-sm')}</button>`).join('')}</div>`);
  };

  /* ---------- Suche (Strg K) ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  function searchIndex() {
    const st = PL.state;
    const out = [];
    const add = (o) => out.push(o);
    const nav = navItems().concat([{ id: 'einstellungen', label: 'Einstellungen', icon: 'settings' }]);
    nav.forEach((n) => add({ g: 'Seiten', t: n.label, icon: n.icon, href: '#/' + n.id }));
    add({ g: 'Seiten', t: 'Termine & Prüfungen', icon: 'calendar', href: '#/termine', k: 'klausuren kalender' });
    Object.keys(SET_NAMES).forEach((k) => add({ g: 'Einstellungen', t: SET_NAMES[k], icon: 'settings', href: '#/einstellungen/' + k }));
    const act = (t, icon, fn, opts = {}) => add(Object.assign({ g: 'Aktionen', t, icon, run: fn }, opts));
    if (st.subjects.length) {
      act('Note eintragen', 'target', () => PL.gradeSheet({}), { key: 'N', sheet: true });
      act('Hausaufgabe eintragen', 'tasks', () => PL.taskSheet({}), { key: 'H', sheet: true });
      act('Termin anlegen', 'calendar', () => PL.eventSheet(null), { key: 'T', sheet: true, k: 'klausur test referat' });
      act('Datei hochladen', 'upload', () => PL.addNotesSheet({}), { key: 'D', sheet: true, k: 'lernzettel foto pdf' });
      act('Stunde eintragen', 'clock', () => PL.lessonSheet({ day: Math.min(4, (new Date().getDay() + 6) % 7), period: 1 }), { sheet: true, k: 'stundenplan' });
    }
    if (PL.chat && PL.chat.available() && PL.sync.user) act('Neuer Chat', 'chat', () => PL.newChatSheet(), { sheet: true });
    act(root.dataset.theme === 'dark' ? 'Helles Design' : 'Dunkles Design', root.dataset.theme === 'dark' ? 'sun' : 'moon', () => toggleTheme(), { k: 'theme darkmode hell dunkel' });
    if (PL.isDesk()) act('Seitenleiste ein- oder ausklappen', 'sidebar', () => toggleSidebar());
    act('Backup exportieren', 'download', () => PL.runAction('export'));
    if (PL.whatsNewSheet) act('Was ist neu', 'sparkle', () => PL.whatsNewSheet(null, true), { sheet: true, k: 'update version' });
    PL.sortedSubjects().forEach((s) => {
      const a = PL.subjectAvg(s.id);
      add({ g: 'Fächer', t: s.name, sub: (s.lk ? 'LK · ' : '') + (a != null ? `Ø ${PL.fmt(a, 1)} Punkte` : 'noch keine Noten'), code: s.short, c: s.color, href: '#/fach/' + s.id, k: s.short + ' ' + (s.teacher || '') });
    });
    const today = PL.today();
    st.tasks.filter((t) => !t.done).forEach((t) => {
      const s = PL.subject(t.subjectId);
      add({ g: 'Aufgaben', t: t.title, sub: [s && s.short, t.due && PL.relDays(PL.daysUntil(t.due))].filter(Boolean).join(' · '), icon: 'tasks', run: () => PL.taskSheet({ id: t.id }), sheet: true });
    });
    st.events.filter((e) => e.date >= PL.isoDate(PL.addDays(new Date(), -30))).sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
      add({ g: 'Termine', t: PL.eventName ? PL.eventName(e) : (e.title || e.type), sub: `${e.type} · ${e.date >= today ? PL.relDays(PL.daysUntil(e.date)) : PL.fmtDate(e.date)}`, icon: 'calendar', run: () => PL.eventSheet(e.id), sheet: true, k: e.type });
    });
    st.notes.forEach((n) => {
      const s = PL.subject(n.subjectId);
      add({ g: 'Dateien', t: n.title, sub: s ? s.short : '', icon: 'file', run: () => PL.noteSheet(n.id), sheet: true });
    });
    if (PL.chat && PL.chat.chats) PL.chat.chats.forEach((c) => add({ g: 'Chats', t: PL.chat.title(c), icon: 'chat', href: '#/chat/' + c.id }));
    out.forEach((o) => { o.nt = norm(o.t); o.nk = norm((o.k || '') + ' ' + (o.sub || '') + ' ' + o.g); });
    return out;
  }
  function score(o, q) {
    if (!q) return 1;
    let s = 0;
    q.split(/\s+/).filter(Boolean).forEach((w) => {
      if (o.nt.startsWith(w)) s += 6;
      else if (new RegExp('(^|[\\s\\-–·(/])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(o.nt)) s += 4;
      else if (o.nt.includes(w)) s += 2;
      else if (o.nk.includes(w)) s += 1;
      else s -= 100;
    });
    return s;
  }
  const GROUP_ORDER = ['Aktionen', 'Seiten', 'Fächer', 'Aufgaben', 'Termine', 'Dateien', 'Chats', 'Einstellungen'];

  PL.searchSheet = function () {
    const index = searchIndex();
    let list = [], sel = 0;
    PL.openSheet(`<div class="pal-top">${ic('search')}<input type="search" data-q placeholder="Suchen oder Befehl …" aria-label="Suchen" autocomplete="off" spellcheck="false" enterkeyhint="go"><button type="button" class="icon-btn hide-desk" data-action="close-sheet" aria-label="Schließen">${ic('x')}</button></div>
      <div class="pal-list" data-list role="listbox"></div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> auswählen</span><span><kbd>↵</kbd> öffnen</span><span><kbd>Esc</kbd> schließen</span></div>`, {
      cls: 'palette', layer: 'top',
      onMount(sh) {
        const input = sh.querySelector('[data-q]');
        const box = sh.querySelector('[data-list]');
        const draw = () => {
          const q = norm(input.value.trim());
          list = index.map((o) => ({ o, s: score(o, q) })).filter((x) => x.s > 0);
          if (q) list.sort((a, b) => b.s - a.s || GROUP_ORDER.indexOf(a.o.g) - GROUP_ORDER.indexOf(b.o.g));
          else list = list.filter((x) => ['Aktionen', 'Seiten', 'Fächer'].includes(x.o.g)).sort((a, b) => GROUP_ORDER.indexOf(a.o.g) - GROUP_ORDER.indexOf(b.o.g));
          list = list.slice(0, 40).map((x) => x.o);
          if (q) { const groups = []; list.forEach((o) => { if (!groups.includes(o.g)) groups.push(o.g); }); list.sort((a, b) => groups.indexOf(a.g) - groups.indexOf(b.g)); }
          sel = Math.min(sel, Math.max(0, list.length - 1));
          let h = '', g = '';
          list.forEach((o, i) => {
            if (o.g !== g) { h += `<div class="pal-group">${esc(o.g)}</div>`; g = o.g; }
            const icon = o.code ? `<span class="pal-ic sub" style="--c:${o.c}">${esc(o.code)}</span>` : `<span class="pal-ic">${ic(o.icon || 'chevron-right')}</span>`;
            h += `<button type="button" class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}" role="option">${icon}<span class="pal-t">${esc(o.t)}</span>${o.key ? `<kbd>${o.key}</kbd>` : o.sub ? `<span class="pal-s">${esc(o.sub)}</span>` : ''}</button>`;
          });
          box.innerHTML = h || `<div class="pal-empty">Nichts gefunden</div>`;
        };
        const mark = () => {
          box.querySelectorAll('.pal-item').forEach((b) => b.classList.toggle('sel', Number(b.dataset.i) === sel));
          const el = box.querySelector('.pal-item.sel');
          if (el) el.scrollIntoView({ block: 'nearest' });
        };
        const run = (o) => {
          if (!o) return;
          if (o.href) { PL.closeSheet(); if (location.hash !== o.href) location.hash = o.href; return; }
          if (o.sheet) { o.run(); return; }
          PL.closeSheet();
          setTimeout(o.run, 0);
        };
        input.addEventListener('input', () => { sel = 0; draw(); });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(list.length - 1, sel + 1); mark(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
          else if (e.key === 'Enter') { e.preventDefault(); run(list[sel]); }
        });
        box.addEventListener('mousemove', (e) => { const b = e.target.closest('.pal-item'); if (b && Number(b.dataset.i) !== sel) { sel = Number(b.dataset.i); mark(); } });
        box.addEventListener('click', (e) => { const b = e.target.closest('.pal-item'); if (b) run(list[Number(b.dataset.i)]); });
        draw();
        setTimeout(() => input.focus(), 30);
      },
    });
  };

  /* ---------- Aktionen ---------- */
  function toggleTheme() {
    const s = PL.state.settings;
    s.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    PL.save();
  }
  function toggleSidebar() {
    if (window.innerWidth < 1100) { root.classList.toggle('sb-open'); return; }
    set(SB_KEY, root.classList.contains('rail') ? 'full' : 'rail');
    applyLayout();
  }
  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'nav-menu': () => menuSheet(),
    'new-entry': () => PL.chooserSheet(),
    'search': () => PL.searchSheet(),
    'theme-toggle': () => toggleTheme(),
    'sidebar-toggle': () => toggleSidebar(),
    'sidebar-close': () => root.classList.remove('sb-open'),
    'sb-subjects': () => { set(SUBJ_KEY, get(SUBJ_KEY) === 'closed' ? 'open' : 'closed'); PL.render(); },
    'demo-exit': () => PL.confirmSheet('Eigene Daten anlegen?', 'Die Beispieldaten werden gelöscht. Danach wählst du deine eigenen Fächer.', 'Beispieldaten löschen', () => {
      const fresh = PL.emptyState();
      fresh.notes = PL.state.notes; fresh.devices = PL.state.devices; fresh.deletedNotes = PL.state.deletedNotes;
      fresh.settings.theme = PL.state.settings.theme;
      PL.replaceState(fresh);
      PL.startSetup();
    }),
  });

  /* ---------- Tastenkürzel ---------- */
  const typing = (el) => { const t = (el && el.tagName || '').toLowerCase(); return ['input', 'textarea', 'select'].includes(t) || (el && el.isContentEditable); };
  const sheetOpen = () => !document.getElementById('sheetLayer').hidden;
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (root.classList.contains('sb-open')) { root.classList.remove('sb-open'); return; }
      PL.closeSheet();
      return;
    }
    // Strg/⌘ K: Suche
    if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (PL.state.subjects.length || sheetOpen()) PL.searchSheet(); return; }
    // Strg/⌘ ↵: im offenen Fenster speichern
    if (mod && e.key === 'Enter' && sheetOpen()) {
      const sh = document.getElementById('sheet');
      const b = sh.querySelector('[data-save]:not([disabled]), [data-go]:not([disabled]), [data-yes], button[type="submit"]:not([disabled])');
      if (b) { e.preventDefault(); b.click(); }
      return;
    }
    if (mod || e.altKey || typing(e.target) || sheetOpen() || !PL.state.subjects.length) return;
    const k = e.key.toLowerCase();
    const map = { n: 'add-grade', h: 'add-task', t: 'add-event', d: 'add-note', '/': 'search' };
    if (map[k]) { e.preventDefault(); PL.runAction(map[k], {}); }
  });
})();
