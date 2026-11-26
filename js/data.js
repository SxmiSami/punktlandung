/* Statische Daten: Farben, Fächervorlagen, Notentabelle */
window.PL = window.PL || {};

/* App-Version – bei jedem Update erhöhen (und in sw.js anpassen) */
PL.VERSION = '0.8.1';

/* Standard-Stundenzeiten (in den Einstellungen änderbar) */
PL.DEFAULT_PERIODS = [
  { start: '07:45', end: '08:30' }, { start: '08:35', end: '09:20' },
  { start: '09:40', end: '10:25' }, { start: '10:30', end: '11:15' },
  { start: '11:30', end: '12:15' }, { start: '12:20', end: '13:05' },
  { start: '14:00', end: '14:45' }, { start: '14:45', end: '15:30' },
];

PL.COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF', '#EC4899', '#64748B'
];

PL.PRESETS = [
  { short: 'D',  name: 'Deutsch',              color: '#EF4444' },
  { short: 'M',  name: 'Mathematik',           color: '#3B82F6' },
  { short: 'E',  name: 'Englisch',             color: '#EAB308' },
  { short: 'F',  name: 'Französisch',          color: '#6366F1' },
  { short: 'S',  name: 'Spanisch',             color: '#F59E0B' },
  { short: 'L',  name: 'Latein',               color: '#64748B' },
  { short: 'BI', name: 'Biologie',             color: '#22C55E' },
  { short: 'CH', name: 'Chemie',               color: '#14B8A6' },
  { short: 'PH', name: 'Physik',               color: '#8B5CF6' },
  { short: 'IF', name: 'Informatik',           color: '#06B6D4' },
  { short: 'EK', name: 'Erdkunde',             color: '#F97316' },
  { short: 'GE', name: 'Geschichte',           color: '#D946EF' },
  { short: 'SW', name: 'Sozialwissenschaften', color: '#84CC16' },
  { short: 'PL', name: 'Philosophie',          color: '#64748B' },
  { short: 'PA', name: 'Pädagogik',            color: '#EC4899' },
  { short: 'ER', name: 'Ev. Religion',         color: '#F59E0B' },
  { short: 'KR', name: 'Kath. Religion',       color: '#F59E0B' },
  { short: 'KU', name: 'Kunst',                color: '#EC4899' },
  { short: 'MU', name: 'Musik',                color: '#8B5CF6' },
  { short: 'LI', name: 'Literatur',            color: '#EF4444' },
  { short: 'SP', name: 'Sport',                color: '#22C55E' },
];

/* Punkte -> Note mit Tendenz */
PL.NOTE_LABEL = ['6', '5-', '5', '5+', '4-', '4', '4+', '3-', '3', '3+', '2-', '2', '2+', '1-', '1', '1+'];

PL.EVENT_TYPES = ['Klausur', 'Test', 'Referat', 'Abiprüfung', 'Sonstiges'];

PL.MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/* Demo-Daten zum Ausprobieren */
PL.demoState = function () {
  const mk = (short, name, color, lk, teacher) => ({ id: PL.uid(), short, name, color, lk, teacher });
  const D = mk('D', 'Deutsch', '#EF4444', true, 'Herr Albrecht');
  const IF = mk('IF', 'Informatik', '#06B6D4', true, 'Frau Lindner');
  const M = mk('M', 'Mathematik', '#3B82F6', false, 'Herr Okafor');
  const EK = mk('EK', 'Erdkunde', '#F97316', false, 'Frau Brandt');
  const E = mk('E', 'Englisch', '#EAB308', false, 'Ms. Carter');
  const GE = mk('GE', 'Geschichte', '#D946EF', false, 'Herr Yilmaz');
  const PH = mk('PH', 'Physik', '#8B5CF6', false, 'Frau Novak');
  const KR = mk('KR', 'Kath. Religion', '#F59E0B', false, 'Frau Weber');
  const KU = mk('KU', 'Kunst', '#EC4899', false, 'Herr Sommer');
  const SP = mk('SP', 'Sport', '#22C55E', false, 'Herr Krüger');
  const subjects = [D, IF, M, EK, E, GE, PH, KR, KU, SP];

  const today = new Date();
  const ago = (days) => PL.isoDate(new Date(today.getTime() - days * 864e5));
  const ahead = (days) => PL.isoDate(new Date(today.getTime() + days * 864e5));
  const g = (s, sem, cat, points, daysAgo, title) => ({ id: PL.uid(), subjectId: s.id, sem, cat, points, date: ago(daysAgo), title: title || '', weight: 1 });

  const grades = [
    g(D, 0, 'K', 13, 340, '1. Klausur'), g(D, 0, 'K', 14, 280, '2. Klausur'), g(D, 0, 'S', 14, 260, 'Mitarbeit'),
    g(IF, 0, 'K', 14, 330, '1. Klausur'), g(IF, 0, 'K', 15, 270, '2. Klausur'), g(IF, 0, 'S', 13, 255, 'Mitarbeit'),
    g(M, 0, 'K', 10, 320, '1. Klausur'), g(M, 0, 'K', 12, 265, '2. Klausur'), g(M, 0, 'S', 11, 255, 'Mitarbeit'),
    g(EK, 0, 'K', 12, 300, 'Klausur'), g(EK, 0, 'S', 12, 255, 'Mitarbeit'),
    g(E, 0, 'K', 11, 310, 'Klausur'), g(E, 0, 'S', 13, 255, 'Mitarbeit'),
    g(GE, 0, 'S', 12, 255, 'Mitarbeit'), g(PH, 0, 'S', 12, 255, 'Mitarbeit'),
    g(KR, 0, 'S', 13, 255, 'Mitarbeit'), g(KU, 0, 'S', 11, 255, 'Mitarbeit'), g(SP, 0, 'S', 14, 255, 'Praxis'),
    // Q1.2
    g(D, 1, 'K', 12, 150, '1. Klausur'), g(D, 1, 'K', 14, 95, '2. Klausur'), g(D, 1, 'S', 13, 80, 'Mitarbeit'),
    g(IF, 1, 'K', 15, 140, '1. Klausur'), g(IF, 1, 'K', 14, 90, '2. Klausur'), g(IF, 1, 'S', 14, 80, 'Projekt'),
    g(M, 1, 'K', 11, 145, '1. Klausur'), g(M, 1, 'K', 13, 92, '2. Klausur'), g(M, 1, 'S', 12, 80, 'Mitarbeit'),
    g(EK, 1, 'K', 13, 120, 'Klausur'), g(EK, 1, 'S', 12, 80, 'Referat'),
    g(E, 1, 'K', 12, 118, 'Klausur'), g(E, 1, 'S', 13, 80, 'Mitarbeit'),
    g(GE, 1, 'S', 11, 80, 'Mitarbeit'), g(PH, 1, 'S', 13, 80, 'Mitarbeit'), g(KR, 1, 'S', 12, 80, 'Mitarbeit'),
    g(SP, 1, 'S', 13, 80, 'Praxis'),
    // Q2.1 (laufend)
    g(D, 2, 'K', 14, 30, '1. Klausur'), g(IF, 2, 'K', 13, 26, '1. Klausur'), g(M, 2, 'K', 12, 24, '1. Klausur'),
    g(E, 2, 'S', 12, 12, 'Vokabeltest'), g(GE, 2, 'S', 13, 8, 'Referat Weimarer Republik'),
  ];

  const ev = (s, days, type, title) => ({ id: PL.uid(), subjectId: s.id, date: ahead(days), type, title: title || '' });
  const events = [
    ev(IF, 6, 'Klausur', '2. Klausur – Datenbanken'),
    ev(E, 11, 'Klausur', 'Klausur – Dystopian Fiction'),
    ev(D, 17, 'Klausur', '2. Klausur – Lyrik'),
    ev(PH, 3, 'Test', 'Test Induktion'),
    ev(M, -2, 'Test', 'Test Stochastik'),
  ];

  const L = (s, day, from, to, room, week) => {
    const out = [];
    for (let p = from; p <= to; p++) out.push({ id: PL.uid(), subjectId: s.id, day, period: p, room, week: week || null });
    return out;
  };
  const lessons = [].concat(
    L(IF, 0, 1, 2, 'C127'), L(D, 0, 3, 4, 'D209'), L(KR, 0, 5, 5, 'D212'), L(E, 0, 6, 6, 'D108'),
    L(GE, 1, 1, 2, 'C217'), L(EK, 1, 3, 4, 'H007'), L(E, 1, 5, 6, 'D108'), L(SP, 1, 7, 8, 'Halle', 'A'), L(M, 1, 7, 8, 'D208', 'B'),
    L(IF, 2, 1, 2, 'C127'), L(D, 2, 3, 4, 'D209'), L(KU, 2, 5, 5, 'K04'), L(EK, 2, 6, 6, 'H007'), L(SP, 2, 7, 8, 'Halle'),
    L(KU, 3, 1, 2, 'K04'), L(M, 3, 3, 4, 'D208'), L(PH, 3, 5, 5, 'D208'), L(GE, 3, 6, 6, 'C217'),
    L(KR, 4, 1, 2, 'D212'), L(PH, 4, 3, 4, 'D208'), L(IF, 4, 5, 5, 'C127'), L(D, 4, 6, 6, 'D209')
  );
  const t = (s, days, title, important, done) => ({ id: PL.uid(), subjectId: s.id, title, due: ahead(days), important: !!important, done: !!done });
  const tasks = [
    t(KU, 1, 'Skizzen für die Mappe fertigstellen'),
    t(IF, 2, 'SQL-Abfragen Aufgabe 3–5'),
    t(D, 5, 'Faust I bis Szene 12 lesen'),
    t(E, 5, 'Mindmap zur Kurzgeschichte', true),
    t(M, -1, 'Stochastik-Blatt 2', false, true),
  ];

  return {
    version: 1,
    settings: Object.assign(PL.defaultSettings(), { name: 'Alex', currentSem: 2, abWeeks: true, abRef: PL.isoDate(PL.mondayOf(today)) }),
    lessons,
    tasks,
    subjects,
    grades,
    overrides: {},
    exams: [
      { slot: 0, subjectId: D.id, s: null, m: null },
      { slot: 1, subjectId: IF.id, s: null, m: null },
      { slot: 2, subjectId: M.id, s: null, m: null },
      { slot: 3, subjectId: EK.id, s: null, m: null },
      { slot: 4, subjectId: null, s: null, m: null },
    ],
    events,
  };
};
