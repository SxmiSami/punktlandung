/* App: Router, Navigation, Aktionen */
(function () {
  const ic = PL.icon;
  const main = document.getElementById('main');
  let lastRoute = null;

  function route() {
    const h = (location.hash || '#/').replace(/^#\/?/, '');
    const [name, arg] = h.split('/');
    return { name: name || '', arg };
  }

  function renderNav(r) {
    const active = r.name === 'fach' ? 'faecher' : r.name === 'termine' ? 'plan' : r.name;
    const hidden = r.name === 'setup' || !PL.state.subjects.length;
    const openTasks = PL.state.tasks.filter((t) => !t.done).length;
    document.getElementById('sideNav').innerHTML = PL.NAV.map((n) =>
      `<a class="side-link ${active === n.id ? 'active' : ''}" href="#/${n.id}">${ic(n.icon)} ${n.label}${n.id === 'aufgaben' && openTasks ? `<span class="count">${openTasks}</span>` : ''}</a>`).join('');
    const ver = document.getElementById('sideVersion');
    if (ver) ver.textContent = 'Version ' + PL.VERSION;
    document.querySelectorAll('[data-nav="einstellungen"]').forEach((a) => a.classList.toggle('active', active === 'einstellungen'));
    const ss = document.getElementById('sideSettings');
    if (ss) ss.innerHTML = `${ic('settings')} Einstellungen ${PL.sync.user ? `<span class="count" style="display:flex;align-items:center;gap:6px">${PL.syncDot().replace('sync-dot', 'sync-dot static')}</span>` : ''}`;
    const tb = document.getElementById('tabbar');
    tb.style.display = hidden ? 'none' : '';
    const tab = (n) => `<a class="tab ${active === n.id ? 'active' : ''}" href="#/${n.id}">${ic(n.icon)}<span>${n.label}</span>${n.id === 'aufgaben' && openTasks ? `<i class="tab-badge">${openTasks}</i>` : ''}</a>`;
    tb.innerHTML = PL.NAV.map(tab).join('');
    // Schwebender +-Knopf: passt sich der aktuellen Seite an
    const fab = document.getElementById('fab');
    const fabAction = r.name === 'aufgaben' ? ['add-task', 'Aufgabe hinzufügen']
      : (r.name === 'plan' && PL.ui.planMode === 'week') ? ['add-lesson', 'Stunde eintragen']
      : (r.name === 'termine' || r.name === 'plan') ? ['add-event', 'Termin hinzufügen']
      : ['add-grade', 'Note eintragen'];
    fab.dataset.action = fabAction[0];
    fab.setAttribute('aria-label', fabAction[1]);
    fab.title = fabAction[1];
    fab.hidden = hidden || r.name === 'einstellungen';
  }

  function render() {
    const r = route();
    const key = r.name + '/' + (r.arg || '');
    const changed = key !== lastRoute;
    const y = window.scrollY;
    PL.applyTheme();

    let html;
    if (!PL.state.subjects.length && r.name !== 'setup' && r.name !== 'einstellungen') html = PL.views.welcome();
    else switch (r.name) {
      case 'faecher': html = PL.views.subjects(); break;
      case 'fach':
        if (PL.ui.detailFor !== r.arg) { PL.ui.detailFor = r.arg; PL.ui.detailSem = PL.state.settings.currentSem; }
        html = PL.views.subject(r.arg); break;
      case 'abitur': html = PL.views.abitur(); break;
      case 'termine': html = PL.views.plan('events'); break;
      case 'plan': html = PL.views.plan(); break;
      case 'aufgaben': html = PL.views.tasks(); break;
      case 'einstellungen': html = PL.views.settings(); break;
      case 'setup': html = PL.views.setup(); break;
      default: html = PL.views.dashboard();
    }
    if (html === '') return; // Umleitung läuft
    main.innerHTML = html;
    renderNav(r);
    if (changed) { window.scrollTo(0, 0); lastRoute = key; }
    else { main.querySelectorAll('.view').forEach((v) => (v.style.animation = 'none')); window.scrollTo(0, y); }
    const titles = { '': 'Übersicht', faecher: 'Fächer', fach: 'Fach', abitur: 'Abitur', termine: 'Termine', plan: 'Stundenplan', aufgaben: 'Aufgaben', einstellungen: 'Einstellungen', setup: 'Einrichtung' };
    document.title = (titles[r.name] || 'Übersicht') + ' · Punktlandung';
  }
  PL.render = render;

  /* ---------- Aktionen ---------- */
  const A = {
    'close-sheet': () => PL.closeSheet(),
    'add-grade': (d) => PL.gradeSheet({ subjectId: d.subject || (route().name === 'fach' ? route().arg : null), sem: d.sem, cat: d.cat }),
    'open-grade': (d) => PL.gradeSheet({ id: d.id }),
    'add-subject': () => PL.subjectSheet(),
    'edit-subject': (d) => PL.subjectSheet(d.id),
    'open-cell': (d) => PL.cellSheet(d.subject, d.sem),
    'open-exam': (d) => PL.examSheet(d.slot),
    'add-event': () => PL.eventSheet(),
    'open-event': (d) => PL.eventSheet(d.id),
    'event-grade': (d) => {
      const e = PL.state.events.find((x) => x.id === d.id);
      if (!e) return;
      PL.gradeSheet({ subjectId: e.subjectId, cat: e.type === 'Klausur' ? 'K' : 'S', title: e.title || e.type, eventId: e.id });
    },
    'add-task': (d) => PL.taskSheet({ subjectId: d.subject || (route().name === 'fach' ? route().arg : null) }),
    'open-task': (d) => PL.taskSheet({ id: d.id }),
    'toggle-task': (d) => PL.toggleTask(d.id),
    'task-filter': (d) => { PL.ui.taskFilter = d.v; render(); },
    'add-lesson': (d) => PL.lessonSheet({ day: d.day != null ? d.day : Math.min(4, (new Date().getDay() + 6) % 7), period: d.period || 1 }),
    'edit-lesson': (d) => PL.lessonSheet({ ids: d.ids }),
    'plan-week': (d) => { const v = Number(d.v); PL.ui.planWeek = v === 0 ? 0 : PL.ui.planWeek + v; render(); },
    'plan-mode': (d) => { PL.ui.planMode = d.v; if (route().name === 'termine' && d.v === 'week') location.hash = '#/plan'; else render(); },
    'edit-periods': () => PL.periodsSheet(),
    'set-ab': (d) => {
      const mon = PL.mondayOf(new Date());
      PL.state.settings.abRef = PL.isoDate(d.v === 'A' ? mon : PL.addDays(mon, -7));
      PL.save();
      PL.toast(`Diese Woche ist jetzt eine ${d.v}-Woche`);
    },
    'set-sem': (d) => { PL.state.settings.currentSem = Number(d.sem); PL.save(); PL.toast(`Aktuelles Halbjahr: ${PL.semName(Number(d.sem))}`); },
    'cycle-sem': () => { const s = PL.state.settings; s.currentSem = (s.currentSem + 1) % 4; PL.save(); },
    'detail-sem': (d) => { PL.ui.detailSem = Number(d.sem); render(); },
    'subj-filter': (d) => { PL.ui.subjFilter = d.v; render(); },
    'setting': (d) => {
      const s = PL.state.settings;
      const v = isNaN(Number(d.v)) ? d.v : Number(d.v);
      s[d.key] = v;
      if (d.key === 'examCount') s.examFactor = v === 5 ? 4 : 5;
      PL.save();
    },
    'demo': () => {
      const go = () => { PL.replaceState(PL.demoState()); location.hash = '#/'; PL.toast('Beispieldaten geladen'); };
      if (PL.state.subjects.length) PL.confirmSheet('Beispieldaten laden?', 'Deine aktuellen Daten werden ersetzt. Exportiere vorher ein Backup, wenn du sie behalten willst.', 'Ersetzen', go);
      else go();
    },
    'login': () => PL.authSheet('login'),
    'signup': () => PL.authSheet('signup'),
    'sync-now': () => PL.sync.syncNow && PL.sync.syncNow(),
    'logout': () => PL.confirmSheet('Abmelden?', 'Deine Noten bleiben in deinem Konto gespeichert und werden von diesem Gerät entfernt. Melde dich einfach wieder an, um sie zurückzuholen.', 'Abmelden', async () => {
      await PL.sync.signOut();
      location.hash = '#/';
      PL.toast('Abgemeldet');
    }),
    'reset': () => PL.confirmSheet('Alles löschen?', PL.sync.user
      ? 'Alle Fächer, Noten und Termine werden gelöscht – auf allen Geräten, die mit deinem Konto verbunden sind. Das kann nicht rückgängig gemacht werden.'
      : 'Alle Fächer, Noten und Termine werden von diesem Gerät gelöscht. Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen', () => {
      PL.replaceState(PL.emptyState()); location.hash = '#/'; PL.toast('Alle Daten gelöscht');
    }),
    'export': () => {
      const blob = new Blob([JSON.stringify(PL.state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `punktlandung-backup-${PL.today()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      PL.toast('Backup exportiert');
    },
    'import': () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const file = inp.files[0]; if (!file) return;
        file.text().then((txt) => {
          let data;
          try { data = JSON.parse(txt); } catch (e) { PL.toast('Datei konnte nicht gelesen werden'); return; }
          if (!data || !Array.isArray(data.subjects)) { PL.toast('Das ist keine gültige Punktlandung-Datei'); return; }
          const go = () => { PL.replaceState(data); location.hash = '#/'; PL.toast(`${data.subjects.length} Fächer und ${(data.grades || []).length} Noten importiert`); };
          if (!PL.state.subjects.length) go();
          else PL.confirmSheet('Daten importieren?', `${data.subjects.length} Fächer und ${(data.grades || []).length} Noten ersetzen deine aktuellen Daten.`, 'Importieren', go);
        });
      };
      inp.click();
    },

    /* Setup-Assistent */
    'setup': () => PL.startSetup(),
    'setup-toggle': (d) => { const s = PL.ui.setup.list[Number(d.i)]; s.picked = !s.picked; if (!s.picked) s.lk = false; render(); },
    'setup-custom': () => PL.customSubjectSheet((sub) => { PL.ui.setup.list.push(sub); render(); }),
    'setup-lk': (d) => { const s = PL.ui.setup.list.find((x) => x.id === d.id); s.lk = !s.lk; render(); },
    'setup-examcount': (d) => { PL.ui.setup.examCount = Number(d.v); render(); },
    'setup-back': () => { PL.ui.setup.step--; render(); window.scrollTo(0, 0); },
    'setup-next': () => {
      const S = PL.ui.setup;
      S.step++;
      if (S.step === 3) {
        const picked = S.list.filter((s) => s.picked);
        const valid = (id) => picked.some((s) => s.id === id);
        S.exams = S.exams.map((id) => (valid(id) ? id : null));
        const lks = picked.filter((s) => s.lk);
        if (!S.exams[0] && lks[0]) S.exams[0] = lks[0].id;
        if (!S.exams[1] && lks[1]) S.exams[1] = lks[1].id;
      }
      render(); window.scrollTo(0, 0);
    },
    'setup-cancel': () => { PL.ui.setup = null; location.hash = '#/einstellungen'; },
    'setup-finish': () => {
      const S = PL.ui.setup;
      const picked = S.list.filter((s) => s.picked);
      const keep = new Set(picked.map((s) => s.id));
      PL.state.subjects.filter((s) => !keep.has(s.id)).forEach((s) => PL.deleteSubject(s.id));
      PL.state.subjects = picked.map(({ picked: _p, isNew: _n, ...rest }) => rest);
      PL.state.settings.examCount = S.examCount;
      PL.state.settings.examFactor = S.examCount === 5 ? 4 : 5;
      PL.state.exams.forEach((e) => {
        const id = S.exams[e.slot] || null;
        if (e.subjectId !== id) { e.subjectId = id; e.s = null; e.m = null; }
      });
      PL.ui.setup = null;
      PL.save();
      location.hash = '#/';
      PL.toast(`${picked.length} Fächer eingerichtet – los geht's!`);
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = A[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el, e);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.setting) {
      PL.state.settings[t.dataset.setting] = t.type === 'checkbox' ? t.checked : t.value.trim();
      if (t.dataset.setting === 'abWeeks' && t.checked && !PL.state.settings.abRef) PL.state.settings.abRef = PL.isoDate(PL.mondayOf(new Date()));
      PL.save();
    }
    if (t.dataset.setupExam != null && PL.ui.setup) {
      PL.ui.setup.exams[Number(t.dataset.setupExam)] = t.value || null;
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'goal') PL.updateGoal(e.target.value);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') PL.closeSheet();
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !['input', 'textarea', 'select'].includes(tag) && document.getElementById('sheetLayer').hidden && PL.state.subjects.length) {
      e.preventDefault(); A['add-grade']({});
    }
  });

  PL.onChange(render);
  window.addEventListener('hashchange', () => { PL.closeSheet(); render(); });
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
        // Die installierte App wird meist nur aus dem Hintergrund geholt, nicht neu geladen –
        // deshalb beim Zurückkehren selbst nach einer neuen Version fragen.
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      }).catch(() => {});
    });
    // Neue Version hat übernommen → einmal neu laden (nicht beim allerersten Installieren).
    // Ist gerade ein Fenster offen (z. B. beim Tippen), erst danach.
    let hadController = !!navigator.serviceWorker.controller, reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      const tryReload = () => {
        if (reloading) return;
        if (!document.getElementById('sheetLayer').hidden) { setTimeout(tryReload, 1000); return; }
        reloading = true; location.reload();
      };
      tryReload();
    });
  }
})();
