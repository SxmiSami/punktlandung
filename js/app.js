/* App: Router, Navigation, Aktionen */
(function () {
  const ic = PL.icon;
  const main = document.getElementById('main');
  let lastRoute = null;

  /* Kein Zoomen mit zwei Fingern (iOS ignoriert user-scalable=no) */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  function route() {
    const h = (location.hash || '#/').replace(/^#\/?/, '');
    const [n0, arg] = h.split('/');
    const name = n0 === 'lernzettel' ? 'dateien' : n0;  // alter Link
    return { name: name || '', arg };
  }

  /* Seitenleiste, Kopfzeile und Tab-Leiste: siehe shell.js */
  const renderNav = (r) => PL.shell.render(r);

  function render() {
    const r = route();
    const key = r.name + '/' + (r.arg || '');
    const changed = key !== lastRoute;
    const sc = PL.scroller();
    const y = sc.scrollTop;
    PL.applyTheme();

    // Chat: nur Liste und Nachrichten austauschen, damit das Eingabefeld erhalten bleibt
    if (r.name === 'chat' && !changed && PL.chatPatch && PL.chatPatch(r.arg)) { renderNav(r); return; }

    let html;
    try {
    if (!PL.state.subjects.length && r.name !== 'setup' && r.name !== 'einstellungen' && r.name !== 'chat') html = PL.views.welcome();
    else switch (r.name) {
      case 'faecher': html = PL.views.subjects(); break;
      case 'fach':
        if (PL.ui.detailFor !== r.arg) { PL.ui.detailFor = r.arg; PL.ui.detailSem = PL.state.settings.currentSem; }
        html = PL.views.subject(r.arg); break;
      case 'abitur': html = PL.views.abitur(); break;
      case 'termine': html = PL.views.plan('events'); break;
      case 'plan': html = PL.views.plan(); break;
      case 'aufgaben': html = PL.views.tasks(); break;
      case 'dateien': html = PL.views.notes(); break;
      case 'chat': html = PL.views.chat(r.arg); break;
      case 'neu': html = PL.views.feed(); break;
      case 'einstellungen': html = PL.views.settings(r.arg); break;
      case 'setup': html = PL.views.setup(); break;
      default: html = PL.views.dashboard();
    }
    } catch (e) {
      // Nie eine leere Seite: Fehler zeigen, Navigation bleibt nutzbar
      console.error(e);
      html = `<div class="page view"><section class="card" style="max-width:640px"><div class="empty"><b>Diese Seite konnte nicht angezeigt werden</b>
        Deine Daten sind sicher. Lade die App neu – wenn es bleibt, schick einen Screenshot dieser Meldung.<br>
        <code style="display:block;margin-top:10px;font-size:12px;color:var(--muted);white-space:pre-wrap">${PL.esc(e && e.message || e)}</code>
        <button class="btn btn-sm btn-primary" style="margin-top:12px" onclick="location.reload()">Neu laden</button></div></section></div>`;
    }
    if (html === '') return; // Umleitung läuft
    main.innerHTML = html;
    renderNav(r);
    // Nach dem Zeichnen kann sich ändern, was scrollt (Willkommen: ganze Seite, sonst der Inhaltsbereich)
    const sc2 = PL.scroller();
    if (changed) { sc2.scrollTop = 0; if (sc2 !== sc) sc.scrollTop = 0; lastRoute = key; PL.shell.routeChanged(); }
    else { main.querySelectorAll('.view').forEach((v) => (v.style.animation = 'none')); sc2.scrollTop = y; }
    if (r.name === 'chat' && PL.chatMounted) PL.chatMounted(r.arg);
    // Titel bleibt immer „Punktlandung“: Safari nimmt ihn beim „Zum Home-Bildschirm“ als App-Namen
    document.title = 'Punktlandung';
  }
  PL.render = render;

  /* Lernzettel beim Laden anderer Daten behalten (die Dateien liegen ja noch da) */
  function keepNotes(next) {
    const cur = PL.state;
    const notes = (Array.isArray(next.notes) ? next.notes : []).slice();
    cur.notes.forEach((n) => { if (!notes.some((x) => x && x.id === n.id)) notes.push(n); });
    return Object.assign({}, next, { notes, devices: Object.assign({}, cur.devices, next.devices || {}), deletedNotes: cur.deletedNotes });
  }

  /* ---------- Aktionen ---------- */
  const A = {
    'close-sheet': () => PL.closeSheet(),
    'add-grade': (d) => PL.gradeSheet({ subjectId: d.subject || (route().name === 'fach' ? route().arg : null), sem: d.sem, cat: d.cat }),
    'open-grade': (d) => PL.gradeSheet({ id: d.id }),
    'add-subject': () => PL.subjectSheet(),
    'edit-subject': (d) => PL.subjectSheet(d.id),
    'open-cell': (d) => PL.cellSheet(d.subject, d.sem),
    'open-exam': (d) => PL.examSheet(d.slot),
    'add-event': (d) => PL.eventSheet(null, { date: d.date }),
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
    'plan-week': (d) => { const v = Number(d.v); if (v === 0) { PL.ui.planSlide = PL.ui.planWeek > 0 ? 'prev' : 'next'; PL.ui.planWeek = 0; render(); } else PL.changeWeek(v); },
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
      const go = () => { PL.replaceState(keepNotes(PL.demoState())); location.hash = '#/'; PL.toast('Beispieldaten geladen'); };
      if (PL.state.subjects.length) PL.confirmSheet('Beispieldaten laden?', 'Deine aktuellen Daten werden ersetzt. Exportiere vorher ein Backup, wenn du sie behalten willst.', 'Ersetzen', go);
      else go();
    },
    'login': () => PL.authSheet('login'),
    'signup': () => PL.authSheet('signup'),
    'change-password': () => PL.changePasswordSheet(),
    'sync-now': () => PL.sync.syncNow && PL.sync.syncNow(),
    'logout': () => PL.confirmSheet('Abmelden?', 'Deine Noten bleiben in deinem Konto gespeichert und werden von diesem Gerät entfernt. Melde dich einfach wieder an, um sie zurückzuholen. Lernzettel, die auf diesem Gerät gespeichert sind, bleiben hier und tauchen nach dem Anmelden wieder auf.', 'Abmelden', async () => {
      await PL.sync.signOut();
      location.hash = '#/';
      PL.toast('Abgemeldet');
    }),
    'reset': () => PL.confirmSheet('Alles löschen?', PL.sync.user
      ? 'Alle Fächer, Noten, Termine und Lernzettel werden gelöscht – auf allen Geräten, die mit deinem Konto verbunden sind, und in der Cloud. Das kann nicht rückgängig gemacht werden.'
      : 'Alle Fächer, Noten, Termine und Lernzettel werden von diesem Gerät gelöscht. Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen', async () => {
      const dead = PL.state.notes.map((n) => n.id).concat(PL.state.deletedNotes);
      await PL.files.wipeAll();
      const fresh = PL.emptyState();
      fresh.deletedNotes = dead.slice(-300);
      PL.replaceState(fresh); location.hash = '#/'; PL.toast('Alle Daten gelöscht');
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
          const go = () => { PL.replaceState(keepNotes(data)); location.hash = '#/'; PL.toast(`${data.subjects.length} Fächer und ${(data.grades || []).length} Noten importiert`); };
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

  Object.assign(A, PL.extraActions || {});
  /* Aktion per Name auslösen (Tastenkürzel, Suche) */
  PL.runAction = (name, d = {}) => { const fn = A[name]; if (fn) fn(d, null, null); };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = A[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset, el, e);
  });

  /* Gegen Spam: höchstens 3 Namenswechsel in 24 Stunden.
     Gemerkt in settings.nameChanges (Zeitpunkte) – mit Konto also für alle Geräte.
     Der Server (pl_chat_set_name) hat zusätzlich eine eigene Grenze. */
  const NAME_MAX = 3, NAME_WINDOW = 24 * 3600e3;
  function nameChangeOk(input) {
    const s = PL.state.settings, old = (s.name || '').trim(), v = input.value.trim();
    if (v === old) { input.value = s.name || ''; return false; }
    const now = Date.now();
    const recent = (s.nameChanges || []).filter((x) => typeof x === 'number' && x <= now && now - x < NAME_WINDOW).sort((a, b) => a - b);
    // Den allerersten Namen setzen zählt nicht
    if (!old) { s.nameChanges = recent; return true; }
    if (recent.length >= NAME_MAX) {
      input.value = s.name || '';
      const mins = Math.ceil((recent[0] + NAME_WINDOW - now) / 60000);
      PL.toast(`Du hast deinen Namen schon ${NAME_MAX}× geändert – wieder möglich in ${mins >= 60 ? Math.ceil(mins / 60) + ' Std.' : mins + ' Min.'}`);
      return false;
    }
    s.nameChanges = recent.concat(now);
    const left = NAME_MAX - s.nameChanges.length;
    PL.toast(left ? `Name geändert – heute noch ${left}× möglich` : 'Name geändert – für heute war das die letzte Änderung');
    return true;
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.setting === 'name' && !nameChangeOk(t)) return;
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
  /* Tastenkürzel: siehe shell.js */

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
