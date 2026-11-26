/* Untis-Vermittler für Punktlandung (Supabase Edge Function)

   WebUntis erlaubt keine Abfragen direkt aus dem Browser (CORS). Diese Funktion
   meldet sich stellvertretend bei WebUntis an, holt Stundenraster und Stundenplan
   und gibt sie vereinfacht zurück. Zugangsdaten werden hier NICHT gespeichert –
   sie kommen bei jeder Anfrage vom Gerät mit und sind danach wieder weg.

   Einrichtung: siehe SYNC-EINRICHTEN.md, Schritt 7.
*/

type Json = Record<string, any>;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class UntisError extends Error {
  status: number;
  constructor(msg: string, status = 400) { super(msg); this.status = status; }
}

/* ---------- Einmal-Code (TOTP) aus dem Untis-Schlüssel ---------- */
function base32(s: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const ch of clean) {
    val = (val << 5) | A.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export async function totp(secret: string, time: number, digits = 6): Promise<string> {
  const counter = Math.floor(time / 30000);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey('raw', base32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/* ---------- Hilfen ---------- */
const ymd = (iso: string) => Number(iso.replaceAll('-', ''));
const isoOf = (n: number) => { const s = String(n); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; };
const hhmm = (n: number) => { const s = String(n).padStart(4, '0'); return `${s.slice(0, 2)}:${s.slice(2)}`; };

function errorText(e: Json | undefined): string {
  const code = e && e.code;
  if (code === -8504) return 'Benutzername, Passwort oder Schlüssel stimmen nicht.';
  if (code === -8500 || code === -8998) return 'Diese Schule wurde nicht gefunden. Prüfe Server und Schulname.';
  if (code === -8509) return 'Untis erlaubt dir diese Abfrage nicht (fehlende Berechtigung).';
  if (code === -8520) return 'Nicht angemeldet – bitte erneut versuchen.';
  if (code === -8507) return 'Der Zeitraum liegt außerhalb des Schuljahrs.';
  return (e && e.message) ? `Untis meldet: ${e.message}` : 'Untis hat unerwartet geantwortet.';
}

/* Eine WebUntis-Sitzung */
class Session {
  sid = '';
  personType = 5;
  personId = 0;
  name = '';
  base: string;
  school: string;
  constructor(base: string, school: string) { this.base = base; this.school = school; }

  cookie() {
    return `JSESSIONID=${this.sid}; schoolname="_${btoa(String.fromCharCode(...new TextEncoder().encode(this.school)))}"`;
  }

  async post(path: string, query: Record<string, string>, body: Json) {
    const url = `${this.base}${path}?${new URLSearchParams(query)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(this.sid ? { Cookie: this.cookie() } : {}) },
        body: JSON.stringify(body),
        redirect: 'manual',
      });
    } catch (_) {
      throw new UntisError('Der Untis-Server ist nicht erreichbar. Prüfe die Server-Adresse.', 502);
    }
    const text = await res.text();
    let data: Json;
    try { data = JSON.parse(text); } catch (_) {
      throw new UntisError(res.status === 404 ? 'Diese Untis-Adresse gibt es nicht. Prüfe den Server.' : `Untis antwortet nicht wie erwartet (HTTP ${res.status}).`, 502);
    }
    const sc = res.headers.get('set-cookie') || '';
    const m = sc.match(/JSESSIONID=([^;]+)/);
    if (m) this.sid = m[1];
    return data;
  }

  async rpc(method: string, params: Json = {}) {
    const d = await this.post('/WebUntis/jsonrpc.do', { school: this.school }, { id: 'pl', method, params, jsonrpc: '2.0' });
    if (d.error) throw new UntisError(errorText(d.error), d.error.code === -8504 ? 401 : 400);
    return d.result;
  }

  async loginPassword(user: string, password: string) {
    const r = await this.rpc('authenticate', { user, password, client: 'Punktlandung' });
    if (!r || !r.sessionId) throw new UntisError('Anmeldung bei Untis fehlgeschlagen.', 401);
    this.sid = r.sessionId;
    this.personType = r.personType || 5;
    this.personId = r.personId || 0;
  }

  /* Anmeldung wie die Untis-App: Schlüssel aus dem QR-Code → Einmal-Code */
  async loginSecret(user: string, secret: string) {
    const now = Date.now();
    const otp = await totp(secret, now);
    const d = await this.post('/WebUntis/jsonrpc_intern.do', { m: 'getUserData2017', school: this.school, v: 'i2.2' },
      { id: 'pl', method: 'getUserData2017', params: [{ auth: { clientTime: now, user, otp } }], jsonrpc: '2.0' });
    if (d.error) throw new UntisError(errorText(d.error), 401);
    if (!this.sid) throw new UntisError('Untis hat keine Sitzung gestartet. Bitte erneut versuchen.', 502);
    const u = (d.result && d.result.userData) || {};
    this.name = u.displayName || '';
    if (u.elemId && (u.elemType === 'STUDENT' || u.elemType === 'TEACHER')) {
      this.personType = u.elemType === 'TEACHER' ? 2 : 5;
      this.personId = u.elemId;
    }
  }

  /* Falls die Anmeldung keine eigene Personen-Nummer geliefert hat */
  async ensurePerson() {
    if (this.personId) return;
    try {
      const res = await fetch(`${this.base}/WebUntis/api/daytimetable/config`, { headers: { Cookie: this.cookie(), Accept: 'application/json' } });
      const j = await res.json();
      const c = (j && j.data) || {};
      if (c.personId) { this.personId = c.personId; this.personType = c.personType || 5; }
    } catch (_) { /* unten Fehler */ }
    if (!this.personId) throw new UntisError('Dein Untis-Konto ist mit keinem Stundenplan verknüpft.', 400);
  }

  /* Neuere Untis-Schnittstelle (REST) mit derselben Sitzung */
  async getJson(path: string, query: Record<string, string | number>) {
    const q = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${this.base}${path}?${q}`, { headers: { Cookie: this.cookie(), Accept: 'application/json' }, redirect: 'manual' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  /* Manche Bereiche (Mitteilungen, Nachrichten) wollen zusätzlich einen Zugangs-Token */
  token = '';
  async bearer() {
    if (this.token) return this.token;
    const res = await fetch(`${this.base}/WebUntis/api/token/new`, { headers: { Cookie: this.cookie(), Accept: 'text/plain, application/json' }, redirect: 'manual' });
    if (!res.ok) throw new Error(`Token HTTP ${res.status}`);
    let t = (await res.text()).trim();
    if (t.startsWith('"')) { try { t = JSON.parse(t); } catch (_) { /* so lassen */ } }
    if (!t || t.length < 20 || t.startsWith('<') || t.startsWith('{')) throw new Error('Kein Token');
    return (this.token = t);
  }
  async getAuth(path: string, query: Record<string, string | number> = {}) {
    const tok = await this.bearer();
    const q = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${this.base}${path}${Object.keys(query).length ? '?' + q : ''}`, {
      headers: { Cookie: this.cookie(), Accept: 'application/json', Authorization: `Bearer ${tok}` }, redirect: 'manual',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async logout() { try { await this.rpc('logout'); } catch (_) { /* egal */ } }
}

/* ---------- Texte & Anhänge ---------- */
/* HTML aus Untis → lesbarer Text mit Zeilenumbrüchen, Links bleiben als Adresse erhalten */
export function cleanText(html: unknown): string {
  let s = String(html == null ? '' : html);
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
    const l = String(label).replace(/<[^>]*>/g, '').trim();
    return !l || l === href ? ` ${href} ` : `${l} (${href})`;
  });
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '\n• ').replace(/<[^>]*>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
  return s.split('\n').map((l) => l.replace(/[ \t\f\v]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
const attOf = (a: Json) => ({
  id: a && a.id != null ? String(a.id) : '',
  name: String((a && (a.name || a.fileName || a.filename || a.title)) || 'Datei'),
  url: String((a && (a.url || a.src || a.downloadUrl || a.link)) || ''),
});
const attList = (x: unknown) => (Array.isArray(x) ? x.filter((a) => a && typeof a === 'object').map(attOf) : []);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 120);

function b64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const MAX_FILE = 20 * 1024 * 1024;

/* Datei herunterladen: entweder direkt Bytes oder JSON mit „downloadUrl“ (Speicher-Link) */
async function fetchFile(s: Session, url: string, extra: Record<string, string> = {}, depth = 0): Promise<{ bytes: Uint8Array; type: string } | null> {
  const u = new URL(url, s.base);
  const own = u.host === new URL(s.base).host;
  // Nur Untis selbst und dessen Datei-Speicher – kein offener Vermittler für beliebige Seiten
  if (!own && !(u.protocol === 'https:' && /(\.webuntis\.com|\.amazonaws\.com|\.untis\.at|\.untis\.com)$/.test(u.hostname))) return null;
  const headers: Record<string, string> = { ...extra };
  if (own) { headers.Cookie = s.cookie(); headers.Accept = '*/*'; if (s.token) headers.Authorization = `Bearer ${s.token}`; }
  const res = await fetch(u.toString(), { headers, redirect: own ? 'manual' : 'follow' });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && depth < 3) return fetchFile(s, res.headers.get('location')!, {}, depth + 1);
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (Number(res.headers.get('content-length') || 0) > MAX_FILE) throw new UntisError('Die Datei ist zu groß (über 20 MB). Öffne sie direkt in Untis.', 413);
  if (type === 'application/json') {
    const j = await res.json().catch(() => null);
    const d = (j && (j.data || j)) || {};
    if (d.downloadUrl && depth < 3) {
      const h: Record<string, string> = {};
      (d.additionalHeaders || []).forEach((x: Json) => { if (x && x.key) h[x.key] = String(x.value); });
      return fetchFile(s, d.downloadUrl, h, depth + 1);
    }
    return null;
  }
  if (type === 'text/html') return null;   // Anmeldeseite o. Ä.
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FILE) throw new UntisError('Die Datei ist zu groß (über 20 MB). Öffne sie direkt in Untis.', 413);
  return { bytes, type: type || 'application/octet-stream' };
}

/* ---------- Einzelne Abrufe: Mitteilung öffnen, Datei laden ---------- */
async function runAction(s: Session, body: Json) {
  if (body.action === 'message') {
    const id = String(body.id || '');
    if (!/^[\w-]{1,64}$/.test(id)) throw new UntisError('Ungültige Mitteilung.');
    let j: Json;
    try { j = await s.getAuth(`/WebUntis/api/rest/view/v1/messages/${encodeURIComponent(id)}`); }
    catch (e) { throw new UntisError(`Die Mitteilung konnte nicht geladen werden (${errMsg(e)}).`, 502); }
    const m = (j && (j.data || j)) || {};
    return {
      ok: true,
      message: {
        id, subject: cleanText(m.subject), content: cleanText(m.content || m.text || m.body || ''),
        sender: typeof m.sender === 'string' ? m.sender : (m.sender && m.sender.displayName) || '',
        at: m.sentDateTime || m.dateTime || '',
        files: attList(m.storageAttachments).concat(attList(m.attachments)),
      },
    };
  }
  if (body.action === 'file') {
    const f = body.file || {};
    const id = String(f.id || '');
    const kind = String(f.kind || '');
    if (id && !/^[\w-]{1,64}$/.test(id)) throw new UntisError('Ungültige Datei.');
    const tries: string[] = [];
    if (kind === 'msg' && id) tries.push(`/WebUntis/api/rest/view/v1/messages/${id}/attachmentstorageurl`);
    if (f.url) tries.push(String(f.url));
    if (kind !== 'msg' && id) tries.push(`/WebUntis/api/homeworks/attachments/${id}`, `/WebUntis/api/rest/view/v1/messages/${id}/attachmentstorageurl`);
    if (!tries.length) throw new UntisError('Zu dieser Datei fehlt die Adresse.');
    try { await s.bearer(); } catch (_) { /* geht manchmal auch ohne */ }
    for (const t of tries) {
      try {
        const r = await fetchFile(s, t);
        if (r) return { ok: true, name: String(f.name || 'Datei'), type: r.type, data: b64(r.bytes) };
      } catch (e) { if (e instanceof UntisError) throw e; }
    }
    throw new UntisError('Untis gibt diese Datei nicht heraus. Öffne sie direkt in der Untis-App.', 404);
  }
  throw new UntisError('Unbekannte Aktion.');
}

/* ---------- Hauptlogik ---------- */
export async function run(body: Json, opts: { base?: string } = {}) {
  const server = String(body.server || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const school = String(body.school || '').trim();
  const user = String(body.user || '').trim();
  if (!opts.base && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.webuntis\.com$/.test(server)) throw new UntisError('Der Server muss auf „.webuntis.com“ enden, z. B. nessa.webuntis.com.');
  if (!school || !user) throw new UntisError('Schule und Benutzername fehlen.');
  if (!body.secret && !body.password) throw new UntisError('Schlüssel oder Passwort fehlt.');
  const action = body.action ? String(body.action) : '';
  const from = String(body.from || ''), to = String(body.to || '');
  if (!action) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new UntisError('Ungültiger Zeitraum.');
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > 62) throw new UntisError('Höchstens zwei Monate auf einmal.');
  }

  const s = new Session(opts.base || `https://${server}`, school);
  if (body.secret) await s.loginSecret(user, String(body.secret));
  else await s.loginPassword(user, String(body.password));
  try {
    if (action) return await runAction(s, body);
    await s.ensurePerson();

    // Stundenraster: Montag (day 2) bevorzugt, sonst der Tag mit den meisten Stunden
    let timegrid: { name: string; start: string; end: string }[] = [];
    try {
      const tg = (await s.rpc('getTimegridUnits')) || [];
      const day = tg.find((d: Json) => d.day === 2) || tg.slice().sort((a: Json, b: Json) => b.timeUnits.length - a.timeUnits.length)[0];
      if (day) timegrid = day.timeUnits.slice().sort((a: Json, b: Json) => a.startTime - b.startTime)
        .map((u: Json) => ({ name: String(u.name || ''), start: hhmm(u.startTime), end: hhmm(u.endTime) }));
    } catch (_) { /* Raster ist optional */ }

    const opt = (withTeachers: boolean) => ({
      options: {
        element: { id: s.personId, type: s.personType },
        startDate: ymd(from), endDate: ymd(to),
        showInfo: true, showSubstText: true, showLsText: true, showStudentgroup: true,
        subjectFields: ['name', 'longname'], roomFields: ['name'], klasseFields: ['name'],
        ...(withTeachers ? { teacherFields: ['name', 'longname'] } : {}),
      },
    });
    let raw: Json[];
    try { raw = await s.rpc('getTimetable', opt(true)); }
    catch (_) { raw = await s.rpc('getTimetable', opt(false)); }

    const lessons = (raw || []).map((l: Json) => ({
      date: isoOf(l.date),
      start: hhmm(l.startTime),
      end: hhmm(l.endTime),
      subjects: (l.su || []).map((x: Json) => ({ name: x.name || '', long: x.longname || '' })),
      rooms: (l.ro || []).map((x: Json) => x.name || '').filter(Boolean),
      origRooms: (l.ro || []).map((x: Json) => x.orgname || '').filter(Boolean),
      teachers: (l.te || []).map((x: Json) => x.name || '').filter(Boolean),
      origTeachers: (l.te || []).map((x: Json) => x.orgname || '').filter(Boolean),
      code: l.code || '',                 // '' | 'cancelled' | 'irregular'
      type: l.lstype || 'ls',             // ls = Unterricht, oh = Bürozeit, sb = Bereitschaft, bs = Pausenaufsicht, ex = Prüfung
      info: [l.substText, l.info, l.lstext].filter(Boolean).join(' · '),
    })).filter((l: Json) => l.type === 'ls' || l.type === 'ex');

    // Klausuren und Hausaufgaben (optional – manche Schulen geben sie für Schüler nicht frei)
    let exams: Json[] | null = null, homework: Json[] | null = null;
    const ex = body.extras;
    if (ex && /^\d{4}-\d{2}-\d{2}$/.test(ex.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(ex.to || '') && ex.to >= ex.from
        && (Date.parse(ex.to) - Date.parse(ex.from)) / 864e5 <= 130) {
      const range = { startDate: ymd(ex.from), endDate: ymd(ex.to) };
      try {
        const j = await s.getJson('/WebUntis/api/exams', { ...range, klasseId: -1, withGrades: 'false' });
        const list = (j && j.data && j.data.exams) || [];
        exams = list.filter((e: Json) => {
          const st = e.assignedStudents || [];
          return !st.length || st.some((x: Json) => x.id === s.personId);
        }).map((e: Json) => ({
          id: e.id,
          date: isoOf(e.examDate),
          start: e.startTime ? hhmm(e.startTime) : '',
          end: e.endTime ? hhmm(e.endTime) : '',
          subject: e.subject || '',
          type: e.examType || '',
          name: e.name || '',
          text: e.text || '',
          rooms: (e.rooms || []).map((r: Json) => (typeof r === 'string' ? r : r.name || '')).filter(Boolean),
        }));
      } catch (_) { exams = null; }
      try {
        const j = await s.getJson('/WebUntis/api/homeworks/lessons', range);
        const d = (j && j.data) || {};
        const subj: Record<string, string> = {}, teach: Record<string, string> = {};
        (d.lessons || []).forEach((l: Json) => { subj[l.id] = l.subject || ''; });
        (d.teachers || []).forEach((t: Json) => { teach[t.id] = t.name || ''; });
        homework = (d.homeworks || []).map((h: Json) => ({
          id: h.id,
          subject: subj[h.lessonId] || '',
          date: h.date ? isoOf(h.date) : '',
          due: h.dueDate ? isoOf(h.dueDate) : '',
          text: String(h.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
          full: cleanText(h.text),
          remark: cleanText(h.remark),
          teacher: teach[h.teacherId] || '',
          done: !!h.completed,
          files: attList(h.attachments),
        }));
      } catch (_) { homework = null; }
    }

    // Für die Neuigkeiten: Mitteilungen und Tagesnachrichten (jedes für sich optional)
    let feed: Json | null = null;
    if (body.feed && typeof body.feed === 'object') {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(body.feed.today || '') ? body.feed.today : new Date().toISOString().slice(0, 10);
      const errors: Record<string, string> = {};
      let messages: Json[] | null = null, news: Json[] | null = null;
      try {
        const j = await s.getAuth('/WebUntis/api/rest/view/v1/messages');
        const list = (j && (j.incomingMessages || (j.data && j.data.incomingMessages))) || [];
        messages = list.slice(0, 40).map((m: Json) => ({
          id: String(m.id),
          subject: cleanText(m.subject),
          preview: cleanText(m.contentPreview || ''),
          sender: typeof m.sender === 'string' ? m.sender : (m.sender && m.sender.displayName) || '',
          at: m.sentDateTime || m.dateTime || '',
          read: !!m.isMessageRead,
          files: !!m.hasAttachments,
        }));
      } catch (e) { errors.messages = errMsg(e); }
      try {
        let j: Json;
        try { j = await s.getAuth('/WebUntis/api/public/news/newsWidgetData', { date: ymd(day) }); }
        catch (_) { j = await s.getJson('/WebUntis/api/public/news/newsWidgetData', { date: ymd(day) }); }
        const d = (j && j.data) || {};
        news = (d.messagesOfDay || []).map((m: Json) => ({ id: String(m.id), date: day, subject: cleanText(m.subject), text: cleanText(m.text), files: attList(m.attachments) }));
        if (typeof d.systemMessage === 'string' && cleanText(d.systemMessage)) news.unshift({ id: 'sys-' + day, date: day, subject: 'Hinweis der Schule', text: cleanText(d.systemMessage), files: [] });
      } catch (e) { errors.news = errMsg(e); }
      feed = { messages, news, errors };
    }

    return { ok: true, name: s.name, timegrid, lessons, exams, homework, feed };
  } finally {
    await s.logout();
  }
}

export async function handler(req: Request, opts: { base?: string } = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const reply = (data: Json, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return reply({ ok: false, error: 'Nur POST' }, 405);
  let body: Json;
  try { body = await req.json(); } catch (_) { return reply({ ok: false, error: 'Ungültige Anfrage' }, 400); }
  try {
    return reply(await run(body, opts));
  } catch (e) {
    const status = e instanceof UntisError ? e.status : 500;
    return reply({ ok: false, error: e instanceof UntisError ? e.message : 'Unerwarteter Fehler beim Abruf von Untis.' }, status);
  }
}

// @ts-ignore – Deno gibt es nur in Supabase, nicht beim lokalen Testen mit Node
if (typeof Deno !== 'undefined') Deno.serve((req: Request) => handler(req));
