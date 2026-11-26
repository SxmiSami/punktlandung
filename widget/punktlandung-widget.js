// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: graduation-cap;

/* Punktlandung – Widget für iPhone (App „Scriptable“)
   Zeigt Abischnitt, nächste Termine und offene Aufgaben auf dem Home- oder Sperrbildschirm.
   Die Daten kommen aus deinem Punktlandung-Konto (gleiche Synchronisierung wie die App).

   Einrichten: siehe widget/WIDGET-EINRICHTEN.md
   Im Widget unter „Parameter“ kannst du wählen, was es zeigt:
     (leer)    Standard: Abischnitt + Termine/Aufgaben je nach Größe
     abi       nur Abischnitt
     termine   nächste Termine
     aufgaben  offene Aufgaben */

const SUPABASE_URL = 'https://quurwakilvvunjhcbmzz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jvnIIUVtss5IG27f01JB4Q_5DX3o3SK'; // öffentlicher Schlüssel, wie in js/config.js
const APP_URL = 'https://sxmisami.github.io/punktlandung/';

const SESSION_KEY = 'punktlandung.session'; // Anmeldung (nur Tokens, nie das Passwort)
const CACHE_FILE = 'punktlandung-widget-cache.json';
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const LOAD_WEIGHTS = { 'Abiprüfung': 4, 'Klausur': 3, 'Test': 2, 'Referat': 2 };

/* ---------------- Farben (wie in der App) ---------------- */
const C = {
  bg: Color.dynamic(new Color('#F3F4F8'), new Color('#0B0C12')),
  card: Color.dynamic(new Color('#FFFFFF'), new Color('#151823')),
  text: Color.dynamic(new Color('#12141D'), new Color('#F3F4F8')),
  text2: Color.dynamic(new Color('#4A4F63'), new Color('#B9BED0')),
  muted: Color.dynamic(new Color('#6B7086'), new Color('#7E8499')),
  accent: Color.dynamic(new Color('#6A57F0'), new Color('#8C7BFF')),
  danger: Color.dynamic(new Color('#E5384B'), new Color('#FF6B7A')),
  warn: Color.dynamic(new Color('#C98A00'), new Color('#FBBF24')),
};

/* ---------------- Anmeldung & Daten ---------------- */
async function authRequest(grant, body) {
  const req = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`);
  req.method = 'POST';
  req.headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  req.body = JSON.stringify(body);
  req.timeoutInterval = 15;
  const res = await req.loadJSON();
  const status = req.response && req.response.statusCode;
  if (status >= 400 || !res || !res.access_token) {
    const msg = (res && (res.msg || res.error_description || res.message || res.error)) || `Fehler ${status}`;
    const err = new Error(msg);
    err.auth = status >= 400 && status < 500;
    throw err;
  }
  const session = {
    access_token: res.access_token,
    refresh_token: res.refresh_token,
    expires_at: res.expires_at || Math.floor(Date.now() / 1000) + (res.expires_in || 3600),
  };
  Keychain.set(SESSION_KEY, JSON.stringify(session));
  return session;
}

function loadSession() {
  if (!Keychain.contains(SESSION_KEY)) return null;
  try { return JSON.parse(Keychain.get(SESSION_KEY)); } catch (e) { return null; }
}

async function validSession() {
  const s = loadSession();
  if (!s || !s.refresh_token) return null;
  // Zugangs-Token gilt etwa eine Stunde – nur erneuern, wenn es (fast) abgelaufen ist
  if (s.access_token && s.expires_at - 120 > Date.now() / 1000) return s;
  return authRequest('refresh_token', { refresh_token: s.refresh_token });
}

async function fetchState(session) {
  const req = new Request(`${SUPABASE_URL}/rest/v1/user_data?select=data,updated_at`);
  req.headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` };
  req.timeoutInterval = 15;
  const rows = await req.loadJSON();
  const status = req.response && req.response.statusCode;
  if (status === 401) { const e = new Error('Anmeldung abgelaufen'); e.auth = true; throw e; }
  if (status >= 400) throw new Error((rows && rows.message) || `Fehler ${status}`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? { state: row.data, updatedAt: row.updated_at } : { state: null, updatedAt: null };
}

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
function readCache() {
  try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null; } catch (e) { return null; }
}
function writeCache(c) { try { fm.writeString(cachePath, JSON.stringify(c)); } catch (e) { /* egal */ } }

/* Holt die Daten; bei Netzproblemen den letzten Stand. Ergebnis: { state, fetchedAt, offline } oder { error } */
async function getData() {
  let session;
  try {
    session = await validSession();
  } catch (e) {
    if (e.auth) { Keychain.remove(SESSION_KEY); return { error: 'login' }; }
    const c = readCache();
    return c ? Object.assign(c, { offline: true }) : { error: 'offline' };
  }
  if (!session) return { error: 'login' };
  try {
    const r = await fetchState(session);
    const out = { state: r.state, fetchedAt: Date.now() };
    writeCache(out);
    return out;
  } catch (e) {
    if (e.auth) {
      // Token passt nicht mehr – einmal erneuern und neu versuchen
      try {
        const s = await authRequest('refresh_token', { refresh_token: session.refresh_token });
        const r = await fetchState(s);
        const out = { state: r.state, fetchedAt: Date.now() };
        writeCache(out);
        return out;
      } catch (e2) {
        if (e2.auth) { Keychain.remove(SESSION_KEY); return { error: 'login' }; }
      }
    }
    const c = readCache();
    return c ? Object.assign(c, { offline: true }) : { error: 'offline' };
  }
}

/* ---------------- Abischnitt (gleiche Rechnung wie js/calc.js) ---------------- */
function calcTotal(st) {
  const set = Object.assign({ examCount: 4, examFactor: 5, lkWeight: 2, klausurShare: 50, prognosis: true }, st.settings || {});
  const subjects = st.subjects || [], grades = st.grades || [], overrides = st.overrides || {}, exams = st.exams || [];
  const subject = (id) => subjects.find((s) => s.id === id);
  const gradesOf = (id, sem) => grades.filter((g) => g.subjectId === id && g.sem === sem);
  const getOverride = (id, sem) => ((overrides[id] || {})[sem]) || {};
  const wAvg = (list) => {
    let s = 0, w = 0;
    list.forEach((g) => { const wt = g.weight || 1; s += g.points * wt; w += wt; });
    return w ? s / w : null;
  };
  const semesterCalc = (id, sem) => {
    const gs = gradesOf(id, sem);
    if (!gs.length) return null;
    const k = wAvg(gs.filter((g) => g.cat === 'K'));
    const o = wAvg(gs.filter((g) => g.cat !== 'K'));
    if (k != null && o != null) { const sh = set.klausurShare / 100; return k * sh + o * (1 - sh); }
    return k != null ? k : o;
  };
  const semesterActual = (id, sem) => {
    const ov = getOverride(id, sem);
    if (ov.points != null) return { points: ov.points, decimal: ov.points };
    const c = semesterCalc(id, sem);
    return c == null ? null : { points: Math.round(c), decimal: c };
  };
  const subjectAvg = (id) => {
    const vals = [];
    for (let sem = 0; sem < 4; sem++) { const a = semesterActual(id, sem); if (a) vals.push(a.decimal); }
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  };
  const overallAvg = () => {
    let s = 0, w = 0;
    subjects.forEach((sub) => {
      const v = subjectAvg(sub.id);
      if (v == null) return;
      const wt = sub.lk ? set.lkWeight : 1;
      s += v * wt; w += wt;
    });
    return w ? s / w : null;
  };
  const prognosisFor = (id) => {
    if (!set.prognosis) return null;
    const a = subjectAvg(id);
    return a != null ? a : overallAvg();
  };

  // Block I
  let sum = 0, w = 0, prog1 = 0;
  subjects.forEach((sub) => {
    for (let sem = 0; sem < 4; sem++) {
      if (getOverride(sub.id, sem).out) continue;
      const a = semesterActual(sub.id, sem);
      let points;
      if (a) points = a.points;
      else { const p = prognosisFor(sub.id); if (p == null) continue; points = Math.round(p); prog1++; }
      const wt = sub.lk ? set.lkWeight : 1;
      sum += points * wt; w += wt;
    }
  });
  const b1 = w ? Math.round((sum / w) * 40) : null;

  // Block II
  let sum2 = 0, any = false, prog2 = 0;
  for (let i = 0; i < set.examCount; i++) {
    const e = exams.find((x) => x && x.slot === i) || exams[i];
    const sub = e && e.subjectId ? subject(e.subjectId) : null;
    if (!sub) continue;
    let value;
    if (e.s != null && e.m != null) value = (2 * e.s + e.m) / 3;
    else if (e.s != null) value = e.s;
    else if (e.m != null) value = e.m;
    else { value = prognosisFor(sub.id); if (value == null) continue; prog2++; }
    any = true;
    sum2 += value * set.examFactor;
  }
  const b2 = any ? Math.round(sum2) : null;

  if (b1 == null && b2 == null) return { points: null, note: null, b1, b2 };
  const E = (b1 || 0) + (b2 || 0);
  return { points: E, note: Math.max(10, Math.floor((1020 - E) / 18)) / 10, b1, b2, b2max: set.examCount * 15 * set.examFactor, hasProg: prog1 > 0 || prog2 > 0 };
}

/* ---------------- Termine & Aufgaben ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (iso) => { const [y, m, d] = (iso || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const daysUntil = (iso) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseDate(iso) - t) / 864e5); };
const relLong = (n) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);
const relShort = (iso) => {
  const n = daysUntil(iso), d = parseDate(iso);
  if (n < 0) return 'überfällig';
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n < 7) return WD[d.getDay()];
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
};
const fmtNote = (n) => (n == null ? '–' : n.toFixed(1).replace('.', ','));

function upcoming(st) {
  const today = isoDate(new Date());
  const subj = (id) => (st.subjects || []).find((s) => s.id === id);
  const events = (st.events || [])
    .filter((e) => e && e.date && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (LOAD_WEIGHTS[b.type] || 0) - (LOAD_WEIGHTS[a.type] || 0))
    .map((e) => {
      const sub = subj(e.subjectId);
      const t = (e.title && e.title !== e.type ? e.title : '').replace(new RegExp('^' + (e.type || '') + '\\s*[–:-]\\s*'), '');
      return { date: e.date, type: e.type || 'Termin', sub, label: sub ? `${sub.short} · ${e.type}` : (t || e.type || 'Termin'), graded: !!LOAD_WEIGHTS[e.type] };
    });
  const tasks = (st.tasks || [])
    .filter((t) => t && !t.done)
    .sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || ((b.important ? 1 : 0) - (a.important ? 1 : 0)))
    .map((t) => ({ due: t.due, title: t.title || 'Aufgabe', sub: subj(t.subjectId), important: !!t.important, overdue: !!(t.due && t.due < today) }));
  return { events, tasks, nextExam: events.find((e) => e.graded) || events[0] || null };
}

/* ---------------- Bausteine ---------------- */
function addLabel(stack, text, size, color, opts = {}) {
  const t = stack.addText(text);
  t.font = opts.font || Font.semiboldSystemFont(size);
  t.textColor = color;
  t.lineLimit = opts.lines || 1;
  if (opts.scale) t.minimumScaleFactor = opts.scale;
  return t;
}

function heading(stack, text) {
  const t = addLabel(stack, text.toUpperCase(), 10, C.muted, { font: Font.boldSystemFont(10) });
  return t;
}

function dot(stack, color) {
  const d = stack.addStack();
  d.size = new Size(8, 8);
  d.cornerRadius = 4;
  d.backgroundColor = color ? new Color(color) : C.muted;
}

function row(stack, color, text, right, rightColor, size = 13) {
  const r = stack.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  r.spacing = 6;
  dot(r, color);
  addLabel(r, text, size, C.text, { font: Font.mediumSystemFont(size) });
  r.addSpacer();
  addLabel(r, right, size - 1, rightColor || C.text2, { font: Font.semiboldSystemFont(size - 1) });
  return r;
}

function abiBlock(stack, T, big) {
  const head = stack.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  const sym = SFSymbol.named('graduationcap.fill');
  sym.applyFont(Font.boldSystemFont(11));
  const img = head.addImage(sym.image);
  img.imageSize = new Size(14, 14);
  img.tintColor = C.accent;
  head.addSpacer(4);
  heading(head, 'Abischnitt');
  stack.addSpacer(2);
  addLabel(stack, fmtNote(T.note), big, C.text, { font: Font.heavyRoundedSystemFont(big), scale: 0.6 });
  const sub = T.points == null ? 'Noch keine Noten' : `${T.points} / 900${T.hasProg ? ' · Prognose' : ''}`;
  addLabel(stack, sub, 11, C.text2, { scale: 0.8 });
}

function eventsBlock(stack, U, max, size) {
  heading(stack, 'Termine');
  stack.addSpacer(4);
  if (!U.events.length) { addLabel(stack, 'Keine Termine', size, C.muted); return; }
  U.events.slice(0, max).forEach((e, i) => {
    if (i) stack.addSpacer(3);
    const n = daysUntil(e.date);
    row(stack, e.sub && e.sub.color, e.label, relShort(e.date), n <= 2 && e.graded ? C.warn : null, size);
  });
}

function tasksBlock(stack, U, max, size) {
  const overdue = U.tasks.filter((t) => t.overdue).length;
  heading(stack, `Aufgaben${U.tasks.length ? ' · ' + U.tasks.length + ' offen' : ''}`);
  stack.addSpacer(4);
  if (!U.tasks.length) { addLabel(stack, 'Alles erledigt 🎉', size, C.muted); return; }
  U.tasks.slice(0, max).forEach((t, i) => {
    if (i) stack.addSpacer(3);
    const text = (t.sub ? t.sub.short + ' · ' : '') + t.title;
    row(stack, t.sub && t.sub.color, text, t.due ? relShort(t.due) : '', t.overdue ? C.danger : null, size);
  });
  if (overdue && max < U.tasks.length) { stack.addSpacer(3); addLabel(stack, `${overdue} überfällig`, size - 2, C.danger); }
}

function nextExamLine(stack, U, size) {
  const e = U.nextExam;
  if (!e) { addLabel(stack, 'Keine Termine', size, C.muted); return; }
  const r = stack.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  r.spacing = 5;
  dot(r, e.sub && e.sub.color);
  addLabel(r, e.label, size, C.text, { font: Font.semiboldSystemFont(size), scale: 0.8 });
  stack.addSpacer(1);
  const n = daysUntil(e.date);
  addLabel(stack, n === 0 ? 'Heute!' : n === 1 ? 'Morgen' : relLong(n), size - 1, n <= 2 ? C.warn : C.text2);
}

function footer(w, data) {
  if (!data.offline) return;
  const d = new Date(data.fetchedAt);
  w.addSpacer(4);
  addLabel(w, `Offline · Stand ${pad(d.getHours())}:${pad(d.getMinutes())}`, 9, C.muted);
}

/* ---------------- Widgets ---------------- */
function messageWidget(title, text) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = 'scriptable:///run/' + encodeURIComponent(Script.name());
  const fam = config.widgetFamily || 'medium';
  if (fam.startsWith('accessory')) { addLabel(w, title, 12, Color.white()); return w; }
  heading(w, 'Punktlandung');
  w.addSpacer(6);
  addLabel(w, title, 15, C.text, { font: Font.boldSystemFont(15), lines: 2 });
  w.addSpacer(2);
  addLabel(w, text, 12, C.text2, { lines: 3, scale: 0.8 });
  return w;
}

function buildWidget(data, family, param) {
  const st = data.state || {};
  const T = calcTotal(st);
  const U = upcoming(st);
  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  param = (param || '').trim().toLowerCase();

  /* Sperrbildschirm */
  if (family === 'accessoryInline') {
    const e = U.nextExam;
    w.addText(`Abi ${fmtNote(T.note)}` + (e ? ` · ${e.sub ? e.sub.short + ' ' : ''}${e.type} ${relShort(e.date)}` : ''));
    return w;
  }
  if (family === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const s = w.addStack(); s.layoutVertically(); s.centerAlignContent();
    const t1 = s.addText('Abi'); t1.font = Font.semiboldSystemFont(10); t1.centerAlignText();
    const t2 = s.addText(fmtNote(T.note)); t2.font = Font.heavyRoundedSystemFont(20); t2.minimumScaleFactor = 0.6; t2.centerAlignText();
    return w;
  }
  if (family === 'accessoryRectangular') {
    const t = w.addText(`Abi ${fmtNote(T.note)}${T.hasProg ? ' (Prognose)' : ''}`);
    t.font = Font.boldSystemFont(14);
    const e = U.nextExam;
    const l2 = w.addText(e ? `${e.label} · ${relShort(e.date)}` : 'Keine Termine');
    l2.font = Font.systemFont(12); l2.lineLimit = 1;
    const l3 = w.addText(U.tasks.length ? `${U.tasks.length} Aufgabe${U.tasks.length === 1 ? '' : 'n'} offen` : 'Keine Aufgaben offen');
    l3.font = Font.systemFont(12); l3.lineLimit = 1;
    return w;
  }

  /* Home-Bildschirm */
  w.backgroundColor = C.bg;
  if (family === 'small') {
    w.setPadding(14, 14, 14, 14);
    if (param === 'termine') eventsBlock(w, U, 4, 12);
    else if (param === 'aufgaben') tasksBlock(w, U, 4, 12);
    else {
      abiBlock(w, T, 40);
      if (param !== 'abi') { w.addSpacer(); heading(w, 'Als Nächstes'); w.addSpacer(3); nextExamLine(w, U, 12); }
    }
    w.addSpacer();
    footer(w, data);
    return w;
  }

  const large = family === 'large' || family === 'extraLarge';
  w.setPadding(14, 16, 14, 16);
  const top = w.addStack();
  top.layoutHorizontally();
  top.topAlignContent();

  const left = top.addStack();
  left.layoutVertically();
  abiBlock(left, T, large ? 48 : 40);
  if (large && T.points != null) {
    left.addSpacer(4);
    addLabel(left, `Block I ${T.b1 != null ? T.b1 : '–'} / 600  ·  Block II ${T.b2 != null ? T.b2 : '–'} / ${T.b2max}`, 11, C.muted, { scale: 0.7 });
  }

  if (!large) {
    if (param === 'abi') { top.addSpacer(); w.addSpacer(); footer(w, data); return w; }
    top.addSpacer(14);
    const right = top.addStack();
    right.layoutVertically();
    if (param === 'termine') eventsBlock(right, U, 4, 12);
    else if (param === 'aufgaben') tasksBlock(right, U, 4, 12);
    else { eventsBlock(right, U, 2, 12); right.addSpacer(8); tasksBlock(right, U, 2, 12); }
    w.addSpacer();
    footer(w, data);
    return w;
  }

  top.addSpacer();
  w.addSpacer(14);
  if (param !== 'aufgaben') { eventsBlock(w, U, param === 'termine' ? 10 : 5, 13); w.addSpacer(12); }
  if (param !== 'termine') tasksBlock(w, U, param === 'aufgaben' ? 10 : 5, 13);
  w.addSpacer();
  footer(w, data);
  return w;
}

/* ---------------- In der Scriptable-App: Anmelden & Vorschau ---------------- */
async function loginFlow() {
  const a = new Alert();
  a.title = 'Bei Punktlandung anmelden';
  a.message = 'Mit dem gleichen Konto wie in der App. Das Passwort wird nicht gespeichert, nur die Anmeldung.';
  a.addTextField('E-Mail');
  a.addSecureTextField('Passwort');
  a.addAction('Anmelden');
  a.addCancelAction('Abbrechen');
  if ((await a.presentAlert()) === -1) return false;
  const email = a.textFieldValue(0).trim(), password = a.textFieldValue(1);
  try {
    await authRequest('password', { email, password });
    return true;
  } catch (e) {
    const m = /invalid login credentials/i.test(e.message) ? 'E-Mail oder Passwort ist falsch.'
      : /email not confirmed/i.test(e.message) ? 'Bitte bestätige zuerst deine E-Mail-Adresse.'
      : e.message;
    const err = new Alert();
    err.title = 'Anmeldung fehlgeschlagen';
    err.message = m;
    err.addAction('OK');
    await err.presentAlert();
    return false;
  }
}

async function preview(family) {
  const data = await getData();
  const w = data.error === 'login' ? messageWidget('Bitte anmelden', 'Starte das Skript noch einmal und melde dich an.')
    : data.error ? messageWidget('Keine Verbindung', 'Bist du online?')
    : !data.state ? messageWidget('Noch keine Daten', 'Melde dich in Punktlandung mit demselben Konto an.')
    : buildWidget(data, family, '');
  if (family === 'small') await w.presentSmall();
  else if (family === 'large') await w.presentLarge();
  else await w.presentMedium();
}

async function appMenu() {
  if (!loadSession()) {
    if (!(await loginFlow())) return;
    await preview('medium');
    return;
  }
  const a = new Alert();
  a.title = 'Punktlandung-Widget';
  a.message = 'Du bist angemeldet. Leg das Widget auf den Home- oder Sperrbildschirm und wähle dieses Skript aus.';
  ['Vorschau klein', 'Vorschau mittel', 'Vorschau groß'].forEach((t) => a.addAction(t));
  a.addDestructiveAction('Abmelden');
  a.addCancelAction('Fertig');
  const i = await a.presentAlert();
  if (i === 0) await preview('small');
  else if (i === 1) await preview('medium');
  else if (i === 2) await preview('large');
  else if (i === 3) { Keychain.remove(SESSION_KEY); if (fm.fileExists(cachePath)) fm.remove(cachePath); }
}

/* ---------------- Start ---------------- */
if (config.runsInWidget) {
  const data = await getData();
  let w;
  if (data.error === 'login') w = messageWidget('Bitte anmelden', 'Tippe hier und melde dich in Scriptable mit deinem Punktlandung-Konto an.');
  else if (data.error) w = messageWidget('Keine Verbindung', 'Das Widget lädt die Daten, sobald du wieder online bist.');
  else if (!data.state) w = messageWidget('Noch keine Daten', 'Öffne Punktlandung und melde dich dort mit demselben Konto an.');
  else w = buildWidget(data, config.widgetFamily, args.widgetParameter);
  Script.setWidget(w);
} else {
  await appMenu();
}
Script.complete();
