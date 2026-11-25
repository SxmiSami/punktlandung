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
    const active = r.name === 'fach' ? 'faecher' : r.name;
    const hidden = r.name === 'setup' || !PL.state.subjects.length;
    document.getElementById('sideNav').innerHTML = PL.NAV.map((n) =>
      `<a class="side-link ${active === n.id ? 'active' : ''}" href="#/${n.id}">${ic(n.icon)} ${n.label}</a>`).join('');
    document.querySelectorAll('[data-nav="einstellungen"]').forEach((a) => a.classList.toggle('active', active === 'einstellungen'));
    const tb = document.getElementById('tabbar');
    tb.style.display = hidden ? 'none' : '';
    const tab = (n) => `<a class="tab ${active === n.id ? 'active' : ''}" href="#/${n.id}">${ic(n.icon)}<span>${n.label}</span></a>`;
    tb.innerHTML = tab(PL.NAV[0]) + tab(PL.NAV[1]) +
      `<button class="tab-fab" data-action="add-grade" aria-label="Note eintragen">${ic('plus')}</button>` +
      tab(PL.NAV[2]) + tab(PL.NAV[3]);
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
      case 'termine': html = PL.views.events(); break;
      case 'einstellungen': html = PL.views.settings(); break;
      case 'setup': html = PL.views.setup(); break;
      default: html = PL.views.dashboard();
    }
    if (html === '') return; // Umleitung läuft
    main.innerHTML = html;
    renderNav(r);
    if (changed) { window.scrollTo(0, 0); lastRoute = key; }
    else { main.querySelectorAll('.view').forEach((v) => (v.style.animation = 'none')); window.scrollTo(0, y); }
    const titles = { '': 'Übersicht', faecher: 'Fächer', fach: 'Fach', abitur: 'Abitur', termine: 'Termine', einstellungen: 'Einstellungen', setup: 'Einrichtung' };
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
    'reset': () => PL.confirmSheet('Alles löschen?', 'Alle Fächer, Noten und Termine werden von diesem Gerät gelöscht. Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen', () => {
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
          if (!data || !Array.isArray(data.subjects)) { PL.toast('Das ist kein gültiges Backup'); return; }
          PL.confirmSheet('Backup importieren?', `${data.subjects.length} Fächer und ${(data.grades || []).length} Noten ersetzen deine aktuellen Daten.`, 'Importieren', () => {
            PL.replaceState(data); location.hash = '#/'; PL.toast('Backup importiert');
          });
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
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
