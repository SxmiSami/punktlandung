/* Zustand & Persistenz (localStorage) */
(function () {
  const KEY = 'punktlandung:v1';

  PL.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  PL.isoDate = (d) => {
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  };
  PL.today = () => PL.isoDate(new Date());

  PL.defaultSettings = () => ({
    name: '',
    theme: 'auto',          // auto | dark | light
    currentSem: 0,          // 0..3
    semesters: ['Q1.1', 'Q1.2', 'Q2.1', 'Q2.2'],
    examCount: 4,           // 4 (NRW u. a.) oder 5
    examFactor: 5,          // 5 bei 4 Prüfungen, 4 bei 5 Prüfungen
    lkWeight: 2,            // LK zählt in Block I doppelt
    klausurShare: 50,       // Anteil Klausuren an der Halbjahresnote in %
    prognosis: true,        // fehlende Noten hochrechnen
  });

  PL.emptyState = () => ({
    version: 1,
    settings: PL.defaultSettings(),
    subjects: [],
    grades: [],
    overrides: {},
    exams: [0, 1, 2, 3, 4].map((slot) => ({ slot, subjectId: null, s: null, m: null })),
    events: [],
  });

  function normalize(s) {
    const base = PL.emptyState();
    if (!s || typeof s !== 'object') return base;
    const out = Object.assign(base, s);
    out.settings = Object.assign(PL.defaultSettings(), s.settings || {});
    out.subjects = Array.isArray(s.subjects) ? s.subjects : [];
    out.grades = Array.isArray(s.grades) ? s.grades : [];
    out.events = Array.isArray(s.events) ? s.events : [];
    out.overrides = s.overrides && typeof s.overrides === 'object' ? s.overrides : {};
    const ex = Array.isArray(s.exams) ? s.exams : [];
    out.exams = [0, 1, 2, 3, 4].map((slot) => Object.assign({ slot, subjectId: null, s: null, m: null }, ex.find((e) => e && e.slot === slot) || {}));
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return PL.emptyState();
    }
  }

  PL.state = load();
  const listeners = [];

  PL.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(PL.state)); } catch (e) { /* Speicher voll / privat */ }
    listeners.forEach((fn) => fn());
  };
  PL.onChange = (fn) => listeners.push(fn);
  PL.replaceState = function (next) {
    PL.state = normalize(next);
    PL.save();
  };

  /* ---- Abfragen ---- */
  PL.subject = (id) => PL.state.subjects.find((s) => s.id === id);
  PL.gradesOf = (subjectId, sem) => PL.state.grades.filter((g) => g.subjectId === subjectId && (sem == null || g.sem === sem));
  PL.sortedSubjects = () => PL.state.subjects.slice().sort((a, b) => (b.lk - a.lk) || a.name.localeCompare(b.name, 'de'));
  PL.examSlotOf = (subjectId) => {
    const n = PL.state.settings.examCount;
    const e = PL.state.exams.find((x) => x.slot < n && x.subjectId === subjectId);
    return e ? e.slot : -1;
  };

  /* ---- Mutationen ---- */
  PL.upsertGrade = function (g) {
    const i = PL.state.grades.findIndex((x) => x.id === g.id);
    if (i >= 0) PL.state.grades[i] = g; else PL.state.grades.push(Object.assign({ id: PL.uid() }, g));
    PL.save();
  };
  PL.deleteGrade = function (id) {
    const g = PL.state.grades.find((x) => x.id === id);
    PL.state.grades = PL.state.grades.filter((x) => x.id !== id);
    PL.save();
    return g;
  };
  PL.upsertSubject = function (s) {
    const i = PL.state.subjects.findIndex((x) => x.id === s.id);
    if (i >= 0) PL.state.subjects[i] = s; else PL.state.subjects.push(Object.assign({ id: PL.uid() }, s));
    PL.save();
  };
  PL.deleteSubject = function (id) {
    const st = PL.state;
    st.subjects = st.subjects.filter((s) => s.id !== id);
    st.grades = st.grades.filter((g) => g.subjectId !== id);
    st.events = st.events.filter((e) => e.subjectId !== id);
    delete st.overrides[id];
    st.exams.forEach((e) => { if (e.subjectId === id) { e.subjectId = null; e.s = null; e.m = null; } });
    PL.save();
  };
  PL.getOverride = (subjectId, sem) => ((PL.state.overrides[subjectId] || {})[sem]) || {};
  PL.setOverride = function (subjectId, sem, patch) {
    const o = PL.state.overrides[subjectId] = PL.state.overrides[subjectId] || {};
    o[sem] = Object.assign({}, o[sem] || {}, patch);
    if (o[sem].points == null && !o[sem].out) delete o[sem];
    PL.save();
  };
  PL.upsertEvent = function (e) {
    const i = PL.state.events.findIndex((x) => x.id === e.id);
    if (i >= 0) PL.state.events[i] = e; else PL.state.events.push(Object.assign({ id: PL.uid() }, e));
    PL.save();
  };
  PL.deleteEvent = function (id) {
    const e = PL.state.events.find((x) => x.id === id);
    PL.state.events = PL.state.events.filter((x) => x.id !== id);
    PL.save();
    return e;
  };
})();
