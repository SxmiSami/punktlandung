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

  async logout() { try { await this.rpc('logout'); } catch (_) { /* egal */ } }
}

/* ---------- Hauptlogik ---------- */
export async function run(body: Json, opts: { base?: string } = {}) {
  const server = String(body.server || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const school = String(body.school || '').trim();
  const user = String(body.user || '').trim();
  if (!opts.base && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.webuntis\.com$/.test(server)) throw new UntisError('Der Server muss auf „.webuntis.com“ enden, z. B. nessa.webuntis.com.');
  if (!school || !user) throw new UntisError('Schule und Benutzername fehlen.');
  if (!body.secret && !body.password) throw new UntisError('Schlüssel oder Passwort fehlt.');
  const from = String(body.from || ''), to = String(body.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new UntisError('Ungültiger Zeitraum.');
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 62) throw new UntisError('Höchstens zwei Monate auf einmal.');

  const s = new Session(opts.base || `https://${server}`, school);
  if (body.secret) await s.loginSecret(user, String(body.secret));
  else await s.loginPassword(user, String(body.password));
  try {
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
      teachers: (l.te || []).map((x: Json) => x.longname || x.name || '').filter(Boolean),
      code: l.code || '',                 // '' | 'cancelled' | 'irregular'
      type: l.lstype || 'ls',             // ls = Unterricht, oh = Bürozeit, sb = Bereitschaft, bs = Pausenaufsicht, ex = Prüfung
      info: [l.substText, l.info, l.lstext].filter(Boolean).join(' · '),
    })).filter((l: Json) => l.type === 'ls' || l.type === 'ex');

    return { ok: true, name: s.name, timegrid, lessons };
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
