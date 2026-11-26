/* Lernzettel – Dateispeicher
   - Lokal: IndexedDB auf dem jeweiligen Gerät (offline nutzbar)
   - Online: Supabase Storage (Bucket "lernzettel"), Ordner = eigene Nutzer-ID
   - Teilen: Tabelle note_shares, Empfänger dürfen die Datei dann lesen
   Die Einträge (Titel, Fach, wo gespeichert) liegen in PL.state.notes und werden normal synchronisiert. */
(function () {
  const MB = 1024 * 1024;
  const cfg = Object.assign({ bucket: 'lernzettel', quotaMB: 250, totalMB: 1024, maxFileMB: 25 }, (window.PL_CONFIG || {}).notes || {});
  const st = () => PL.state;

  const F = PL.files = {
    cfg,
    quota: cfg.quotaMB * MB,      // pro Person
    total: cfg.totalMB * MB,      // alle zusammen (kostenloser Plan)
    maxFile: cfg.maxFileMB * MB,  // pro Datei in der Cloud
    local: new Map(),             // Schlüssel -> Metadaten der Dateien auf diesem Gerät
    ready: false,
    usage: { mine: null, total: null },
    shared: [],                   // mit mir geteilt
    myShares: [],                 // von mir geteilt
    cloudOrphans: [],             // Dateien in der Cloud ohne Eintrag
    remoteError: null,            // 'setup' = SQL noch nicht ausgeführt
    remoteAt: 0,
    device: null,
    estimate: null,               // Browser-Speicher { usage, quota }
  };

  /* ---------- Formatierung ---------- */
  PL.fmtBytes = function (n) {
    if (n == null || isNaN(n)) return '–';
    const f = (v, d) => v.toLocaleString('de-DE', { maximumFractionDigits: d });
    if (n < 1024) return f(n, 0) + ' B';
    if (n < MB) return f(Math.max(1, Math.round(n / 1024)), 0) + ' KB';
    if (n < 1024 * MB) return f(n / MB, n < 10 * MB ? 1 : 0) + ' MB';
    return f(n / (1024 * MB), 2) + ' GB';
  };
  PL.fileKind = function (mime, name) {
    const m = mime || '';
    if (m.startsWith('image/')) return 'img';
    if (m === 'application/pdf' || /\.pdf$/i.test(name || '')) return 'pdf';
    return 'file';
  };

  /* ---------- Gerät ---------- */
  function guessDeviceName() {
    const ua = navigator.userAgent || '';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android-Handy' : 'Android-Tablet';
    if (/Windows/.test(ua)) return 'Windows-PC';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/CrOS/.test(ua)) return 'Chromebook';
    if (/Linux/.test(ua)) return 'Linux-PC';
    return 'Gerät';
  }
  try { F.device = JSON.parse(localStorage.getItem('punktlandung:device')); } catch (e) { F.device = null; }
  if (!F.device || !F.device.id) {
    F.device = { id: 'd' + PL.uid(), name: guessDeviceName() };
    try { localStorage.setItem('punktlandung:device', JSON.stringify(F.device)); } catch (e) { /* ignorieren */ }
  }
  F.deviceName = (id) => (id === F.device.id ? 'Dieses Gerät' : ((st().devices[id] || {}).name || 'Anderes Gerät'));

  /* ---------- IndexedDB ---------- */
  const DB_NAME = 'punktlandung-files';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('Kein lokaler Speicher verfügbar')); return; }
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('meta', { keyPath: 'key' });
        r.result.createObjectStore('data');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function run(stores, mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Speichern abgebrochen – ist der Gerätespeicher voll?'));
    }));
  }
  const idbAllMeta = () => run(['meta'], 'readonly', (t) => t.objectStore('meta').getAll());
  const idbGetData = (key) => run(['data'], 'readonly', (t) => t.objectStore('data').get(key));
  const idbPut = (meta, buf) => run(['meta', 'data'], 'readwrite', (t) => { t.objectStore('data').put(buf, meta.key); t.objectStore('meta').put(meta); });
  const idbDel = (key) => run(['meta', 'data'], 'readwrite', (t) => { t.objectStore('data').delete(key); t.objectStore('meta').delete(key); });

  const userId = () => (PL.sync && PL.sync.user ? PL.sync.user.id : null);
  const sharedKey = (share) => 's:' + share.path;

  async function putLocal(key, blob, extra) {
    const buf = await blob.arrayBuffer();
    const meta = Object.assign({ key, size: blob.size, mime: blob.type || extra.mime || '', user: userId(), saved: new Date().toISOString() }, extra);
    await idbPut(meta, buf);
    F.local.set(key, meta);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    return meta;
  }
  async function getLocal(key) {
    const meta = F.local.get(key);
    if (!meta) return null;
    const buf = await idbGetData(key);
    if (!buf) return null;
    return new Blob([buf], { type: meta.mime || 'application/octet-stream' });
  }
  async function delLocal(key) {
    await idbDel(key);
    F.local.delete(key);
  }

  F.localBytes = () => { let n = 0; F.local.forEach((m) => { n += m.size || 0; }); return n; };
  F.isHere = (id) => F.local.has(id);

  async function refreshEstimate() {
    try { if (navigator.storage && navigator.storage.estimate) F.estimate = await navigator.storage.estimate(); } catch (e) { /* egal */ }
  }

  /* Abgleich: Stimmen die Geräte-Angaben in den Einträgen mit dem überein, was hier wirklich liegt? */
  function markDevice(note, on) {
    const me = F.device.id;
    const has = note.devices.includes(me);
    if (on && !has) note.devices.push(me);
    if (!on && has) note.devices = note.devices.filter((d) => d !== me);
    if (on) st().devices[me] = { name: F.device.name };
    return has !== on;
  }
  async function reconcile() {
    if (!F.ready) return;
    let changed = false;
    const dead = new Set(st().deletedNotes);
    // Auf einem anderen Gerät gelöscht → hier auch löschen
    for (const [key, meta] of Array.from(F.local)) {
      if (meta.kind === 'own' && dead.has(key) && (meta.user || null) === userId()) {
        try { await delLocal(key); } catch (e) { /* später nochmal */ }
      }
    }
    st().notes.forEach((n) => { if (markDevice(n, F.local.has(n.id))) changed = true; });
    if (changed) PL.save();
  }
  F.reconcile = reconcile;

  /* Dateien auf diesem Gerät ohne Eintrag (z. B. nach „Daten aus Konto laden“) */
  F.localOrphans = function () {
    const ids = new Set(st().notes.map((n) => n.id));
    const dead = new Set(st().deletedNotes);
    const out = [];
    F.local.forEach((m, key) => {
      if (m.kind === 'own' && !ids.has(key) && !dead.has(key) && (m.user || null) === userId()) out.push(m);
    });
    return out;
  };

  /* ---------- Fotos verkleinern ---------- */
  const MAX_EDGE = 2000, QUALITY = 0.8;
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
      img.src = url;
    });
  }
  async function compressImage(file) {
    const img = await loadImage(file);   // <img> beachtet die Drehung aus den Foto-Daten
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';               // transparente PNGs bekommen weißen Hintergrund
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', QUALITY));
    c.width = c.height = 0;
    return blob;
  }
  const baseName = (name) => String(name || '').replace(/\.[^.\/\\]{1,6}$/, '');
  F.prepare = async function (file, compress) {
    const type = file.type || guessMime(file.name);
    if (compress && /^image\/(jpeg|jpg|png|webp|heic|heif|bmp)$/i.test(type)) {
      try {
        const out = await compressImage(file);
        if (out && out.size < file.size * 0.9) return { blob: out, mime: 'image/jpeg', name: baseName(file.name) + '.jpg', origSize: file.size };
      } catch (e) { /* z. B. HEIC am PC – dann Original behalten */ }
    }
    return { blob: file, mime: type || 'application/octet-stream', name: file.name, origSize: null };
  };
  function guessMime(name) {
    const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1];
    const map = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', txt: 'text/plain', md: 'text/markdown',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    return ext ? map[ext.toLowerCase()] || '' : '';
  }

  /* ---------- Fehler verständlich machen ---------- */
  function setupMissing(m) { return /bucket not found|relation .*note_shares|does not exist|could not find the function|schema cache/i.test(m); }
  F.err = function (e) {
    const m = (e && (e.message || e.error_description || e.error)) || String(e || '');
    if (e && e.code === 'quota') return m;
    if (setupMissing(m)) return 'Der Online-Speicher für Lernzettel ist noch nicht eingerichtet (supabase/lernzettel.sql in Supabase ausführen).';
    if (/maximum allowed size|payload too large|too large|413/i.test(m)) return `Die Datei ist zu groß für die Cloud (max. ${cfg.maxFileMB} MB).`;
    if (/row-level security|violates|unauthorized|403/i.test(m)) return `Hochladen nicht erlaubt – vermutlich sind deine ${cfg.quotaMB} MB voll.`;
    if (/failed to fetch|network|load failed/i.test(m) || !navigator.onLine) return 'Keine Verbindung. Bist du online?';
    if (/quota|QuotaExceeded/i.test(m)) return 'Der Speicher auf diesem Gerät ist voll.';
    return m || 'Unbekannter Fehler.';
  };
  const quotaError = (msg) => Object.assign(new Error(msg), { code: 'quota' });

  /* ---------- Cloud ---------- */
  const bucket = () => PL.sync.client.storage.from(cfg.bucket);
  F.canCloud = () => !!(PL.sync && PL.sync.enabled && PL.sync.user);
  const pathOf = (note) => `${userId()}/${note.id}`;

  /* Belegt laut Einträgen (eigene Zettel in der Cloud) */
  F.myCloudBytes = () => st().notes.reduce((n, x) => n + (x.cloud ? x.size || 0 : 0), 0);
  /* Belegt – Server-Wert, falls bekannt (enthält auch Dateien ohne Eintrag) */
  F.usedMine = () => Math.max(F.myCloudBytes(), F.usage.mine || 0);
  F.freeMine = () => Math.max(0, F.quota - F.usedMine());

  async function upload(note, blob) {
    if (!F.canCloud()) throw new Error('Melde dich an, um Zettel online zu speichern.');
    if (blob.size > F.maxFile) throw quotaError(`Die Datei ist zu groß für die Cloud (${PL.fmtBytes(blob.size)}, max. ${cfg.maxFileMB} MB).`);
    if (F.usedMine() + blob.size > F.quota) throw quotaError(`Kein Platz mehr in der Cloud: noch ${PL.fmtBytes(F.freeMine())} von ${cfg.quotaMB} MB frei.`);
    const { error } = await bucket().upload(pathOf(note), blob, { contentType: note.mime || blob.type || 'application/octet-stream', upsert: false, cacheControl: '3600' });
    if (error && !/already exists|duplicate/i.test(error.message || '')) throw error;
    note.cloud = true;
    if (F.usage.mine != null) F.usage.mine += blob.size;
    if (F.usage.total != null) F.usage.total += blob.size;
  }
  async function download(path) {
    const { data, error } = await bucket().download(path);
    if (error) throw error;
    return data;
  }
  async function removeCloud(note) {
    const { error } = await bucket().remove([pathOf(note)]);
    if (error) throw error;
    note.cloud = false;
    if (F.usage.mine != null) F.usage.mine = Math.max(0, F.usage.mine - (note.size || 0));
    if (F.usage.total != null) F.usage.total = Math.max(0, F.usage.total - (note.size || 0));
  }

  /* Zwischenspeicher für Dateien, die nur in der Cloud liegen (nur solange die App offen ist) */
  const mem = new Map();
  function remember(key, blob) {
    mem.set(key, blob);
    let n = 0;
    Array.from(mem.keys()).reverse().forEach((k) => { n += mem.get(k).size; if (n > 60 * MB) mem.delete(k); });
  }

  /* ---------- Eigene Zettel ---------- */
  F.note = (id) => st().notes.find((n) => n.id === id);

  /* mode: both | cloud | local */
  F.add = async function (files, opts, onProgress) {
    const results = { ok: 0, warnings: [] };
    const wantCloud = opts.mode !== 'local' && F.canCloud();
    const wantLocal = opts.mode !== 'cloud' || !F.canCloud();
    let i = 0;
    for (const file of files) {
      i++;
      onProgress && onProgress(i, files.length, file.name);
      const p = await F.prepare(file, opts.compress);
      const title = (files.length === 1 && opts.title) || baseName(file.name) || 'Lernzettel';
      const note = { id: PL.uid(), subjectId: opts.subjectId || null, title, mime: p.mime, size: p.blob.size, origSize: p.origSize, created: new Date().toISOString(), cloud: false, devices: [] };
      let local = false;
      if (wantLocal) {
        try { await putLocal(note.id, p.blob, { kind: 'own', title, mime: p.mime }); local = true; markDevice(note, true); }
        catch (e) { results.warnings.push(`„${title}“: ${F.err(e)}`); }
      }
      if (wantCloud) {
        try { await upload(note, p.blob); }
        catch (e) {
          results.warnings.push(`„${title}“: ${F.err(e)}`);
          if (!local) {   // nicht verlieren – dann eben nur hier speichern
            try { await putLocal(note.id, p.blob, { kind: 'own', title, mime: p.mime }); local = true; markDevice(note, true); results.warnings.push(`„${title}“ ist nur auf diesem Gerät gespeichert.`); }
            catch (e2) { /* geht gar nicht */ }
          }
        }
      }
      if (!local && !note.cloud) continue;
      st().notes.push(note);
      results.ok++;
      PL.save();
    }
    refreshEstimate().then(changed);
    return results;
  };

  /* Datei eines eigenen Zettels holen (lokal oder aus der Cloud) */
  F.blob = async function (note) {
    const l = await getLocal(note.id).catch(() => null);
    if (l) return l;
    if (mem.has(note.id)) return mem.get(note.id);
    if (!note.cloud) throw new Error(note.devices.length ? `Dieser Zettel liegt nur auf: ${note.devices.map(F.deviceName).join(', ')}.` : 'Dieser Zettel ist nirgends mehr gespeichert.');
    if (!F.canCloud()) throw new Error('Melde dich an, um den Zettel aus der Cloud zu laden.');
    const b = await download(pathOf(note));
    remember(note.id, b);
    return b;
  };

  F.setLocal = async function (note, on) {
    if (on) {
      const b = await F.blob(note);
      await putLocal(note.id, b, { kind: 'own', title: note.title, mime: note.mime });
    } else {
      await delLocal(note.id);
    }
    markDevice(note, on);
    PL.save();
    refreshEstimate().then(changed);
  };

  F.setCloud = async function (note, on) {
    if (on) {
      const b = await F.blob(note);
      await upload(note, b);
    } else {
      // Vorher sicherstellen, dass der Zettel nicht verloren geht
      if (!F.local.has(note.id) && !note.devices.some((d) => d !== F.device.id)) {
        const b = await F.blob(note);
        await putLocal(note.id, b, { kind: 'own', title: note.title, mime: note.mime });
        markDevice(note, true);
      }
      await removeCloud(note);
      await unshareAll(note).catch(() => {});
    }
    PL.save();
    changed();
  };

  F.update = function (note, patch) {
    Object.assign(note, patch);
    PL.save();
    if (F.local.has(note.id)) {
      const m = Object.assign({}, F.local.get(note.id), { title: note.title });
      F.local.set(note.id, m);
      run(['meta'], 'readwrite', (t) => t.objectStore('meta').put(m)).catch(() => {});
    }
    if (F.sharesOf(note).length) {
      const sub = PL.subject(note.subjectId);
      PL.sync.client.from('note_shares').update({ title: note.title, subject: sub ? sub.name : '', subject_short: sub ? sub.short : '', subject_color: sub ? sub.color : '' })
        .eq('note_id', note.id).eq('owner', userId()).then(() => F.refreshRemote(true));
    }
  };

  F.remove = async function (note) {
    if (note.cloud) {
      if (!F.canCloud()) throw new Error('Melde dich an, um den Zettel auch aus der Cloud zu löschen.');
      await removeCloud(note);
      await unshareAll(note).catch(() => {});
    }
    if (F.local.has(note.id)) await delLocal(note.id);
    st().notes = st().notes.filter((n) => n.id !== note.id);
    st().deletedNotes.push(note.id);
    if (st().deletedNotes.length > 300) st().deletedNotes = st().deletedNotes.slice(-300);
    mem.delete(note.id);
    PL.save();
    refreshEstimate().then(changed);
  };

  /* Verwaiste Dateien wieder als Zettel eintragen */
  F.restoreLocal = function () {
    const list = F.localOrphans();
    list.forEach((m) => {
      st().notes.push({ id: m.key, subjectId: null, title: m.title || 'Wiederhergestellt', mime: m.mime || '', size: m.size || 0, origSize: null, created: m.saved || new Date().toISOString(), cloud: false, devices: [F.device.id] });
    });
    if (list.length) { st().devices[F.device.id] = { name: F.device.name }; PL.save(); }
    return list.length;
  };
  F.restoreCloud = function () {
    const list = F.cloudOrphans.slice();
    list.forEach((o) => {
      st().notes.push({ id: o.name, subjectId: null, title: 'Wiederhergestellt ' + PL.fmtDate((o.created_at || '').slice(0, 10)), mime: (o.metadata || {}).mimetype || '', size: (o.metadata || {}).size || 0, origSize: null, created: o.created_at || new Date().toISOString(), cloud: true, devices: [] });
    });
    F.cloudOrphans = [];
    if (list.length) PL.save();
    return list.length;
  };
  F.deleteCloudOrphans = async function () {
    const names = F.cloudOrphans.map((o) => `${userId()}/${o.name}`);
    if (!names.length) return;
    const { error } = await bucket().remove(names);
    if (error) throw error;
    F.cloudOrphans = [];
    await F.refreshRemote(true);
  };

  /* Alles löschen (Einstellungen → Alles löschen) */
  F.wipeAll = async function () {
    const uid = userId();
    if (F.canCloud()) {
      try {
        const { data } = await bucket().list(uid, { limit: 1000 });
        const names = (data || []).filter((o) => o.id).map((o) => `${uid}/${o.name}`);
        if (names.length) await bucket().remove(names);
        await PL.sync.client.from('note_shares').delete().eq('owner', uid);
      } catch (e) { /* offline – Dateien bleiben in der Cloud */ }
    }
    for (const [key, meta] of Array.from(F.local)) {
      if ((meta.user || null) === uid) { try { await delLocal(key); } catch (e) { /* weiter */ } }
    }
    F.myShares = [];
    mem.clear();
  };

  /* ---------- Teilen ---------- */
  F.sharesOf = (note) => F.myShares.filter((s) => s.note_id === note.id);
  F.friends = function () {
    const seen = new Map();
    F.myShares.forEach((s) => s.recipient_email && seen.set(s.recipient_email.toLowerCase(), s.recipient_email));
    F.shared.forEach((s) => s.owner_email && seen.set(s.owner_email.toLowerCase(), s.owner_email));
    const me = ((PL.sync.user || {}).email || '').toLowerCase();
    seen.delete(me);
    return Array.from(seen.values()).sort();
  };

  F.share = async function (note, email) {
    email = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (email.toLowerCase() === ((PL.sync.user || {}).email || '').toLowerCase()) throw new Error('Das ist deine eigene E-Mail-Adresse.');
    if (!note.cloud) throw new Error('Der Zettel muss dafür in der Cloud gespeichert sein.');
    const c = PL.sync.client;
    const { data: rid, error: e1 } = await c.rpc('pl_find_user', { email });
    if (e1) throw e1;
    if (!rid) throw new Error('Unter dieser E-Mail gibt es noch kein Konto. Dein Freund muss sich zuerst in Punktlandung registrieren.');
    const sub = PL.subject(note.subjectId);
    const row = {
      recipient: rid, path: pathOf(note), note_id: note.id, title: note.title, mime: note.mime || '', size: note.size || 0,
      subject: sub ? sub.name : '', subject_short: sub ? sub.short : '', subject_color: sub ? sub.color : '', owner_name: st().settings.name || '',
    };
    const { error } = await c.from('note_shares').insert(row);
    if (error) {
      if (/duplicate|unique/i.test(error.message || '') || error.code === '23505') throw new Error('Mit dieser Person ist der Zettel schon geteilt.');
      throw error;
    }
    await F.refreshRemote(true);
  };
  F.unshare = async function (shareId) {
    const { error } = await PL.sync.client.from('note_shares').delete().eq('id', shareId);
    if (error) throw error;
    F.myShares = F.myShares.filter((s) => s.id !== shareId);
    F.shared = F.shared.filter((s) => s.id !== shareId);
    changed();
  };
  async function unshareAll(note) {
    if (!F.sharesOf(note).length) return;
    const { error } = await PL.sync.client.from('note_shares').delete().eq('note_id', note.id).eq('owner', userId());
    if (error) throw error;
    F.myShares = F.myShares.filter((s) => s.note_id !== note.id);
  }

  /* Mit mir geteilte Zettel – auch die, die nur noch lokal liegen */
  F.sharedList = function () {
    const out = F.shared.map((s) => ({ key: sharedKey(s), share: s, here: F.local.has(sharedKey(s)), gone: false }));
    const keys = new Set(out.map((x) => x.key));
    F.local.forEach((m, key) => {
      if (m.kind === 'shared' && !keys.has(key) && (m.user || null) === userId()) {
        out.push({ key, share: m.share || { title: m.title, subject: '', owner_email: '' }, here: true, gone: F.remoteAt > 0 });
      }
    });
    return out.sort((a, b) => (b.share.created_at || '').localeCompare(a.share.created_at || ''));
  };
  F.sharedItem = (key) => F.sharedList().find((x) => x.key === key);
  F.sharedBlob = async function (item) {
    const l = await getLocal(item.key).catch(() => null);
    if (l) return l;
    if (mem.has(item.key)) return mem.get(item.key);
    if (item.gone) throw new Error('Dieser Zettel wird nicht mehr geteilt.');
    const b = await download(item.share.path);
    remember(item.key, b);
    return b;
  };
  F.setSharedLocal = async function (item, on) {
    if (on) {
      const b = await F.sharedBlob(item);
      await putLocal(item.key, b, { kind: 'shared', title: item.share.title, mime: item.share.mime, share: item.share });
    } else {
      await delLocal(item.key);
    }
    refreshEstimate().then(changed);
  };
  F.leaveShared = async function (item) {
    if (!item.gone && item.share.id) await F.unshare(item.share.id);
    if (F.local.has(item.key)) await delLocal(item.key);
    mem.delete(item.key);
    changed();
  };

  /* ---------- Server-Infos holen (Speicher, Freigaben) ---------- */
  let remoteBusy = null;
  F.refreshRemote = function (force) {
    if (!F.canCloud() || !navigator.onLine) return Promise.resolve();
    if (remoteBusy) return remoteBusy;
    if (!force && Date.now() - F.remoteAt < 20000) return Promise.resolve();
    const c = PL.sync.client, uid = userId();
    remoteBusy = (async () => {
      const before = snapshot();
      try {
        const [mine, total, shares, list] = await Promise.all([
          c.rpc('pl_storage_used'), c.rpc('pl_storage_total'),
          c.from('note_shares').select('*').order('created_at', { ascending: false }),
          bucket().list(uid, { limit: 1000 }),
        ]);
        const err = mine.error || total.error || shares.error || list.error;
        if (err) { F.remoteError = setupMissing(err.message || '') ? 'setup' : 'error'; return; }
        F.remoteError = null;
        F.usage = { mine: Number(mine.data) || 0, total: Number(total.data) || 0 };
        const rows = shares.data || [];
        F.shared = rows.filter((s) => s.recipient === uid);
        F.myShares = rows.filter((s) => s.owner === uid);
        const ids = new Set(st().notes.map((n) => n.id));
        // Ohne Eintrag und älter als 2 Min. (frische Uploads werden gerade erst eingetragen)
        const recent = Date.now() - 2 * 60 * 1000;
        F.cloudOrphans = (list.data || []).filter((o) => o.id && !ids.has(o.name) && new Date(o.created_at || 0).getTime() < recent);
        F.remoteAt = Date.now();
      } catch (e) {
        F.remoteError = navigator.onLine ? 'error' : null;
      } finally {
        remoteBusy = null;
        if (snapshot() !== before) changed();
      }
    })();
    return remoteBusy;
  };
  function snapshot() {
    return JSON.stringify([F.usage, F.remoteError, F.shared.map((s) => s.id + s.title), F.myShares.map((s) => s.id + s.title), F.cloudOrphans.length]);
  }

  /* ---------- Öffnen / Sichern ---------- */
  const touch = () => window.matchMedia('(pointer: coarse)').matches;
  F.fileName = function (title, mime) {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf', 'text/plain': 'txt' }[mime] || '';
    const safe = String(title || 'Lernzettel').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
    return ext && !new RegExp('\\.' + ext + '$', 'i').test(safe) ? safe + '.' + ext : safe;
  };
  /* Für PDFs am PC ein Fenster vorab öffnen (sonst blockiert der Browser das Popup nach dem Laden) */
  F.prepWindow = (mime) => (PL.fileKind(mime) !== 'img' && !touch() ? window.open('about:blank', '_blank') : null);
  F.show = function (blob, title, win) {
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    if (PL.fileKind(blob.type) === 'img') { if (win) win.close(); PL.imageViewer(url, title); return; }
    if (win) { win.location.href = url; return; }
    const a = document.createElement('a');
    a.href = url; a.download = F.fileName(title, blob.type); a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };
  F.save = async function (blob, title) {
    const name = F.fileName(title, blob.type);
    try {
      const file = new File([blob], name, { type: blob.type });
      if (touch() && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  /* ---------- Start ---------- */
  function changed() { if (PL.render) PL.render(); }
  F.init = async function () {
    try {
      const metas = await idbAllMeta();
      metas.forEach((m) => F.local.set(m.key, m));
    } catch (e) { F.unavailable = true; }
    F.ready = true;
    await refreshEstimate();
    await reconcile();
    changed();
  };
  // Nach jeder Änderung von einem anderen Gerät abgleichen
  PL.onChange((opts) => { if (opts.fromRemote) setTimeout(() => { reconcile(); F.refreshRemote(); }, 50); });
  F.init();
})();
