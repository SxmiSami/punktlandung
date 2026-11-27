/* Chat mit Freunden – Einzel- und Gruppenchats über Supabase
   - Tabellen chats, chat_members, chat_messages (supabase/chat.sql)
   - Neue Nachrichten kommen live über Supabase Realtime, sonst alle 20 s
   - Chats liegen nur online (nicht im Backup und nicht in PL.state) */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const PAGE = 60;
  const C = PL.chat = {
    chats: [],          // { id, isGroup, name, createdBy, lastRead, last, unread }
    members: {},        // chatId -> [{ user_id, email, name }]
    msgs: {},           // chatId -> Nachrichten (alt → neu)
    more: {},           // chatId -> ältere vorhanden?
    drafts: {},         // chatId -> angefangener Text
    unread: 0,
    loaded: false,
    error: null,        // 'setup' | 'error' | null
    live: false,
  };
  const S = () => PL.sync;
  const me = () => (S().user ? S().user.id : null);
  const db = () => S().client;
  const changed = () => { if (PL.render) PL.render(); };

  C.available = () => !!(S() && S().enabled);
  /* Zeitstempel einheitlich (Server liefert „+00:00“ mit Mikrosekunden, der Browser „Z“) */
  const iso = (t) => { const d = new Date(t || 0); return isNaN(d) ? '' : d.toISOString(); };
  const norm = (m) => (m ? Object.assign(m, { created_at: iso(m.created_at) }) : m);
  C.chat = (id) => C.chats.find((c) => c.id === id);

  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  /* ---------- Namen ---------- */
  const emailName = (e) => String(e || '').split('@')[0];
  C.myName = () => (PL.state.settings.name || '').trim() || emailName((S().user || {}).email) || 'Ich';
  function memberOf(chatId, uid) { return (C.members[chatId] || []).find((m) => m.user_id === uid); }
  C.nameOf = function (chatId, uid, fallback) {
    if (uid && uid === me()) return 'Du';
    const m = memberOf(chatId, uid);
    if (m) return m.name || emailName(m.email) || 'Freund';
    return fallback || 'Ehemaliges Mitglied';
  };
  C.title = function (chat) {
    if (!chat) return 'Chat';
    if (chat.isGroup) return chat.name || 'Gruppe';
    const other = (C.members[chat.id] || []).find((m) => m.user_id !== me());
    return other ? (other.name || emailName(other.email)) : 'Nur du';
  };
  C.otherOf = (chat) => (C.members[chat.id] || []).find((m) => m.user_id !== me());
  const colorOf = (key) => { let h = 0; String(key || '').split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) | 0; }); return PL.COLORS[Math.abs(h) % PL.COLORS.length]; };
  C.avatar = function (chat, cls = '') {
    if (chat.isGroup) return `<span class="chat-av ${cls}" style="--c:${colorOf(chat.id)}">${ic('users', 'i-sm')}</span>`;
    const o = C.otherOf(chat);
    const label = o ? (o.name || o.email || '?') : '?';
    return `<span class="chat-av ${cls}" style="--c:${colorOf(o ? o.user_id : chat.id)}">${esc(label.charAt(0).toUpperCase())}</span>`;
  };
  C.memberColor = (uid) => colorOf(uid);

  /* ---------- Fehler ---------- */
  const setupMissing = (m) => /relation .*chat|chat_members|chat_messages|pl_chat_|could not find the function|schema cache|does not exist/i.test(m);
  C.err = function (e) {
    const m = (e && (e.message || e.error_description || e.error)) || String(e || '');
    let x;
    if ((x = m.match(/pl_no_user:(\S+)/))) return `Unter ${x[1]} gibt es noch kein Konto. Dein Freund muss sich zuerst in Punktlandung registrieren.`;
    if (/pl_no_user/.test(m)) return 'Unter dieser E-Mail gibt es noch kein Konto. Dein Freund muss sich zuerst in Punktlandung registrieren.';
    if (/pl_self/.test(m)) return 'Das ist deine eigene E-Mail-Adresse.';
    if (/pl_no_name/.test(m)) return 'Gib der Gruppe einen Namen.';
    if (/pl_already/.test(m)) return 'Diese Person ist schon in der Gruppe.';
    if (/pl_not_member/.test(m)) return 'Du bist nicht mehr in diesem Chat.';
    if (/pl_not_signed_in/.test(m)) return 'Bitte melde dich zuerst an.';
    if (/pl_no_gif_key/.test(m)) return 'GIFs sind noch nicht eingerichtet (GIPHY-Schlüssel in js/config.js, siehe SYNC-EINRICHTEN.md).';
    if (/pl_gif_key/.test(m)) return 'Der GIPHY-Schlüssel in js/config.js funktioniert nicht.';
    if (/pl_gif_net/.test(m)) return 'GIFs konnten nicht geladen werden. Bist du online?';
    if (setupMissing(m)) return 'Der Chat ist noch nicht eingerichtet (supabase/chat.sql in Supabase ausführen).';
    if (/object not found|not_found|404/i.test(m)) return 'Dieser Zettel ist nicht mehr in der Cloud.';
    return PL.files ? PL.files.err(e) : (m || 'Unbekannter Fehler.');
  };
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

  /* ---------- Laden ---------- */
  let busy = null, again = false;
  C.refresh = function () {
    if (!me() || !navigator.onLine) return Promise.resolve();
    if (busy) { again = true; return busy; }
    const uid = me();
    busy = (async () => {
      const before = snapshot();
      try {
        const c = db();
        const [mine, mem, ov] = await Promise.all([
          c.from('chat_members').select('chat_id, last_read_at, name, chats(id, is_group, name, created_by, created_at)').eq('user_id', uid),
          c.from('chat_members').select('chat_id, user_id, email, name, joined_at'),
          c.rpc('pl_chat_overview'),
        ]);
        const err = mine.error || mem.error || ov.error;
        if (err) { C.error = setupMissing(err.message || '') ? 'setup' : 'error'; return; }
        if (uid !== me()) return;  // inzwischen abgemeldet
        C.error = null;
        const over = new Map((ov.data || []).map((o) => [o.chat_id, o]));
        C.members = {};
        (mem.data || []).forEach((m) => { (C.members[m.chat_id] = C.members[m.chat_id] || []).push(m); });
        C.chats = (mine.data || []).filter((r) => r.chats).map((r) => {
          const o = over.get(r.chat_id) || {};
          return {
            id: r.chat_id, isGroup: r.chats.is_group, name: r.chats.name, createdBy: r.chats.created_by, createdAt: iso(r.chats.created_at),
            lastRead: r.last_read_at,
            last: o.last_id ? { id: o.last_id, sender: o.last_sender, sender_name: o.last_name, kind: o.last_kind, body: o.last_body, payload: o.last_payload, created_at: iso(o.last_at) } : null,
            unread: o.unread || 0,
          };
        });
        sortChats();
        // Chats, aus denen man raus ist, vergessen
        Object.keys(C.msgs).forEach((id) => { if (!C.chat(id)) delete C.msgs[id]; });
        C.loaded = true;
        // Anzeigenamen aktuell halten
        const nm = (PL.state.settings.name || '').trim();
        if ((mine.data || []).some((r) => (r.name || '') !== nm)) c.rpc('pl_chat_set_name', { my_name: nm }).then(() => {}, () => {});
      } catch (e) {
        C.error = navigator.onLine ? 'error' : null;
      } finally {
        busy = null;
        if (snapshot() !== before) changed();
        if (again) { again = false; C.refresh(); }
      }
    })();
    return busy;
  };
  function sortChats() {
    const t = (c) => (c.last ? c.last.created_at : c.createdAt) || '';
    C.chats.sort((a, b) => t(b).localeCompare(t(a)));
    C.unread = C.chats.reduce((n, c) => n + (c.unread || 0), 0);
  }
  function snapshot() {
    return JSON.stringify([C.error, C.loaded, C.unread, C.chats.map((c) => [c.id, c.name, c.unread, c.last && c.last.id]), Object.keys(C.members).map((k) => k + C.members[k].map((m) => m.user_id + m.name).join())]);
  }

  C.loadMessages = async function (chatId, older) {
    if (!me()) return;
    const list = C.msgs[chatId] || [];
    let q = db().from('chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(PAGE);
    if (older && list.length) q = q.lt('created_at', list[0].created_at);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []).map(norm).reverse();
    const cur = C.msgs[chatId] || [];
    const ids = new Set(cur.map((m) => m.id));
    C.msgs[chatId] = older ? rows.filter((m) => !ids.has(m.id)).concat(cur) : mergeNewest(cur, rows);
    C.more[chatId] = (data || []).length === PAGE;
  };
  function mergeNewest(cur, rows) {
    const byId = new Map(rows.map((m) => [m.id, m]));
    cur.forEach((m) => { if (!byId.has(m.id) && (m.pending || m.failed)) byId.set(m.id, m); });
    return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /* ---------- Live ---------- */
  let channel = null, pollTimer = null, soonTimer = null;
  function soon() { clearTimeout(soonTimer); soonTimer = setTimeout(() => C.refresh(), 400); }
  function connect() {
    if (channel || !me()) return;
    channel = db().channel('pl-chat-' + me())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (p) => onMessage(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => onDelete(p.old))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, () => soon())
      .subscribe((status) => {
        C.live = status === 'SUBSCRIBED';
        if (C.live) { C.refresh(); reloadOpen(); }
      });
    clearInterval(pollTimer);
    // Falls Realtime nicht geht: regelmäßig nachsehen (nur wenn die App sichtbar ist)
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible' && !C.live) { C.refresh(); reloadOpen(); } }, 20000);
  }
  function disconnect() {
    if (channel) { try { db().removeChannel(channel); } catch (e) { /* egal */ } }
    channel = null; C.live = false;
    clearInterval(pollTimer);
    Object.assign(C, { chats: [], members: {}, msgs: {}, more: {}, drafts: {}, unread: 0, loaded: false, error: null });
  }
  function reloadOpen() {
    const id = openChatId();
    if (id && C.msgs[id]) C.loadMessages(id).then(changed, () => {});
  }
  const openChatId = () => { const m = (location.hash || '').match(/^#\/chat\/([0-9a-f-]{36})/i); return m ? m[1] : null; };
  const viewing = (id) => openChatId() === id && document.visibilityState === 'visible';

  function onMessage(m) {
    if (!m || !m.chat_id) return;
    norm(m);
    const chat = C.chat(m.chat_id);
    if (!chat) { soon(); return; }   // neuer Chat, in den man hinzugefügt wurde
    const list = C.msgs[m.chat_id];
    if (list) {
      const i = list.findIndex((x) => x.id === m.id);
      if (i >= 0) list[i] = m; else { list.push(m); list.sort((a, b) => a.created_at.localeCompare(b.created_at)); }
    }
    if (!chat.last || chat.last.created_at <= m.created_at || chat.last.id === m.id) chat.last = m;
    if (m.sender !== me()) {
      if (viewing(m.chat_id)) C.markRead(m.chat_id);
      else { chat.unread = (chat.unread || 0) + 1; notify(chat, m); }
    }
    if (m.kind === 'system') soon();   // Name oder Mitglieder haben sich geändert
    sortChats();
    changed();
  }
  function onDelete(old) {
    if (!old || !old.id) return;
    let hit = false;
    Object.keys(C.msgs).forEach((k) => {
      const before = C.msgs[k].length;
      C.msgs[k] = C.msgs[k].filter((x) => x.id !== old.id);
      if (C.msgs[k].length !== before) hit = true;
    });
    if (hit || C.chats.some((c) => c.last && c.last.id === old.id)) { soon(); changed(); }
  }

  /* Kleine Benachrichtigung in der App */
  function notify(chat, m) {
    const box = document.getElementById('toasts');
    if (!box || document.visibilityState !== 'visible') return;
    const t = document.createElement('div');
    t.className = 'toast chat-toast';
    const who = chat.isGroup ? `${C.nameOf(chat.id, m.sender, m.sender_name)} · ${C.title(chat)}` : C.title(chat);
    t.innerHTML = `${ic('chat')}<span><b>${esc(who)}</b>${esc(C.preview(m, chat, true))}</span><button type="button">Öffnen</button>`;
    box.appendChild(t);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
    t.querySelector('button').onclick = () => { location.hash = '#/chat/' + chat.id; kill(); };
    setTimeout(kill, 4500);
  }

  /* ---------- Senden ---------- */
  C.send = async function (chatId, kind, body, payload) {
    if (!me()) throw new Error('Bitte melde dich zuerst an.');
    const msg = { id: uuid(), chat_id: chatId, sender: me(), sender_name: C.myName(), kind, body: String(body || '').slice(0, 2000), payload: payload || null, created_at: new Date().toISOString(), pending: true };
    (C.msgs[chatId] = C.msgs[chatId] || []).push(msg);
    const chat = C.chat(chatId);
    if (chat) { chat.last = msg; sortChats(); }
    changed();
    return deliver(msg);
  };
  async function deliver(msg) {
    msg.pending = true; msg.failed = false;
    const { id, chat_id, sender_name, kind, body, payload } = msg;
    const { error } = await db().from('chat_messages').insert({ id, chat_id, sender_name, kind, body, payload });
    if (error && !/duplicate|23505/.test((error.message || '') + error.code)) {
      msg.pending = false; msg.failed = true; changed();
      throw error;
    }
    msg.pending = false;
    changed();
  }
  C.retry = (chatId, id) => { const m = (C.msgs[chatId] || []).find((x) => x.id === id); if (m) { changed(); return deliver(m); } return Promise.resolve(); };
  C.removeMessage = async function (chatId, id) {
    const list = C.msgs[chatId] || [];
    const m = list.find((x) => x.id === id);
    if (!(m && m.failed)) {
      const { error } = await db().from('chat_messages').delete().eq('id', id);
      if (error) throw error;
      soon();
    }
    const rest = C.msgs[chatId] = list.filter((x) => x.id !== id);
    const chat = C.chat(chatId);
    if (chat && chat.last && chat.last.id === id) { chat.last = rest[rest.length - 1] || null; sortChats(); }
    changed();
  };

  C.sendNote = async function (chatId, note) {
    const F = PL.files;
    if (!note.cloud) await F.setCloud(note, true);
    const sub = PL.subject(note.subjectId);
    return C.send(chatId, 'note', note.title, {
      path: `${me()}/${note.id}`, note_id: note.id, title: note.title, mime: note.mime || '', ext: note.ext || '', size: note.size || 0,
      subject: sub ? sub.name : '', subject_short: sub ? sub.short : '', subject_color: sub ? sub.color : '',
    });
  };
  C.sendEvent = function (chatId, ev) {
    const sub = PL.subject(ev.subjectId);
    return C.send(chatId, 'event', ev.title || ev.type, {
      date: ev.date, type: ev.type, title: ev.title || '',
      subject: sub ? sub.name : '', subject_short: sub ? sub.short : '', subject_color: sub ? sub.color : '',
    });
  };

  /* ---------- GIFs (Suche über GIPHY) ----------
     Ein GIF ist eine normale Text-Nachricht: Text = Link zum GIF (ältere App-Versionen zeigen den Link),
     payload.gif = Bild für die Anzeige. Angezeigt werden nur Bilder von GIPHY und Tenor. */
  const GIF_URL = /^https:\/\/(?:media\d*\.giphy\.com|i\.giphy\.com|media\d*\.tenor\.com)\/[^\s"'<>]+$/i;
  C.gifOf = function (m) {
    if (!m || m.kind !== 'text') return null;
    const g = m.payload && m.payload.gif;
    if (g && GIF_URL.test(g.url || '')) return { url: g.url, w: Number(g.w) || 0, h: Number(g.h) || 0, title: String(g.title || '') };
    // Nur ein GIF-Link als Text (z. B. aus GIPHY kopiert)
    const t = String(m.body || '').trim();
    if (GIF_URL.test(t) && /\.(gif|webp)(\?|$)/i.test(t)) return { url: t, w: 0, h: 0, title: '' };
    const page = t.match(/^https:\/\/giphy\.com\/gifs\/(?:[\w-]*-)?([A-Za-z0-9]{6,})\/?$/);
    if (page) return { url: `https://media.giphy.com/media/${page[1]}/giphy.gif`, w: 0, h: 0, title: '' };
    return null;
  };
  C.gifReady = () => !!(window.PL_CONFIG || {}).giphyKey;
  C.gifSearch = async function (q, offset) {
    const key = (window.PL_CONFIG || {}).giphyKey;
    if (!key) throw new Error('pl_no_gif_key');
    const p = new URLSearchParams({ api_key: key, limit: '24', offset: String(offset || 0), rating: 'pg-13', bundle: 'messaging_non_clips' });
    if (q) { p.set('q', q); p.set('lang', 'de'); }
    let res;
    try { res = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${p}`); } catch (e) { throw new Error('pl_gif_net'); }
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'pl_gif_key' : 'pl_gif_net');
    const j = await res.json();
    const list = (j.data || []).map((g) => {
      const i = (g.images || {}).fixed_width || {};
      return { id: g.id, title: String(g.title || '').replace(/\s+GIF.*$/i, ''), url: i.webp || i.url, gif: i.url, w: Number(i.width) || 0, h: Number(i.height) || 0 };
    }).filter((g) => GIF_URL.test(g.url || '') && GIF_URL.test(g.gif || ''));
    const pg = j.pagination || {};
    return { list, more: (pg.offset || 0) + (pg.count || 0) < (pg.total_count || 0) };
  };
  C.sendGif = (chatId, g) => C.send(chatId, 'text', g.gif, { gif: { id: g.id, url: g.url, w: g.w, h: g.h, title: g.title, src: 'giphy' } });

  C.markRead = (function () {
    const timers = {};
    return function (chatId) {
      const chat = C.chat(chatId);
      if (chat && chat.unread) { chat.unread = 0; sortChats(); setTimeout(changed, 0); }
      clearTimeout(timers[chatId]);
      timers[chatId] = setTimeout(() => { if (me()) db().rpc('pl_chat_read', { chat: chatId }).then(() => {}, () => {}); }, 600);
    };
  })();

  /* ---------- Chats anlegen / verwalten ---------- */
  C.startDirect = async function (email) {
    email = String(email || '').trim();
    if (!validEmail(email)) throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
    const { data, error } = await db().rpc('pl_chat_direct', { email, my_name: (PL.state.settings.name || '').trim() });
    if (error) throw error;
    await C.refresh();
    return data;
  };
  C.startGroup = async function (name, emails) {
    if (!String(name || '').trim()) throw new Error('Gib der Gruppe einen Namen.');
    const bad = emails.find((e) => !validEmail(e));
    if (bad) throw new Error(`„${bad}“ ist keine gültige E-Mail-Adresse.`);
    const { data, error } = await db().rpc('pl_chat_group', { name: name.trim(), emails, my_name: (PL.state.settings.name || '').trim() });
    if (error) throw error;
    await C.refresh();
    return data;
  };
  C.addMember = async function (chatId, email) {
    email = String(email || '').trim();
    if (!validEmail(email)) throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (email.toLowerCase() === ((S().user || {}).email || '').toLowerCase()) throw new Error('Das bist du selbst.');
    const { error } = await db().rpc('pl_chat_add', { chat: chatId, email, my_name: (PL.state.settings.name || '').trim() });
    if (error) throw error;
    await C.refresh();
  };
  C.rename = async function (chatId, name) {
    const { error } = await db().rpc('pl_chat_rename', { chat: chatId, name, my_name: (PL.state.settings.name || '').trim() });
    if (error) throw error;
    await C.refresh();
  };
  C.leave = async function (chatId) {
    const { error } = await db().rpc('pl_chat_leave', { chat: chatId, my_name: (PL.state.settings.name || '').trim() });
    if (error) throw error;
    delete C.msgs[chatId];
    C.chats = C.chats.filter((c) => c.id !== chatId);
    sortChats();
    await C.refresh();
  };

  /* Bekannte Leute: aus Chats und geteilten Lernzetteln */
  C.friends = function () {
    const seen = new Map();
    const mine = ((S().user || {}).email || '').toLowerCase();
    Object.values(C.members).forEach((list) => list.forEach((m) => { if (m.email && m.email.toLowerCase() !== mine) seen.set(m.email.toLowerCase(), m.email); }));
    (PL.files ? PL.files.friends() : []).forEach((e) => seen.set(e.toLowerCase(), e));
    return Array.from(seen.values()).sort();
  };

  /* Alle Leute mit Konto: [{ email, name }] – mit Namen zuerst, dann nach Name/E-Mail.
     Fehlt pl_chat_people (chat.sql noch nicht neu ausgeführt), bleiben es die Bekannten. */
  C.people = null;
  C.loadPeople = async function () {
    if (!me()) return C.people || [];
    const { data, error } = await db().rpc('pl_chat_people');
    if (error) throw error;
    const mine = ((S().user || {}).email || '').toLowerCase();
    const label = (p) => (p.name || p.email).toLowerCase();
    C.people = (data || [])
      .filter((p) => p.email && p.email.toLowerCase() !== mine)
      .map((p) => ({ email: p.email, name: (p.name || '').trim() }))
      .sort((a, b) => (!a.name - !b.name) || label(a).localeCompare(label(b), 'de'));
    return C.people;
  };
  C.personLabel = (p) => p.name || p.email;

  /* ---------- Texte ---------- */
  C.systemText = function (m, chatId) {
    const who = C.nameOf(chatId, m.sender, m.sender_name);
    const hat = m.sender && m.sender === me() ? 'hast' : 'hat';
    const p = m.payload || {};
    switch (m.body) {
      case 'created': return `${who} ${hat} die Gruppe „${p.name || ''}“ erstellt`;
      case 'added': return `${who} ${hat} ${p.who || 'jemanden'} hinzugefügt`;
      case 'left': return `${who} ${hat} die Gruppe verlassen`;
      case 'renamed': return `${who} ${hat} die Gruppe in „${p.name || ''}“ umbenannt`;
      default: return '';
    }
  };
  C.preview = function (m, chat, noName) {
    if (!m) return chat && chat.isGroup ? 'Gruppe erstellt' : 'Noch keine Nachrichten';
    if (m.kind === 'system') return C.systemText(m, chat.id);
    const text = m.kind === 'note' ? 'Lernzettel: ' + ((m.payload || {}).title || '')
      : m.kind === 'event' ? 'Termin: ' + eventLabel(m.payload || {})
      : C.gifOf(m) ? 'GIF'
      : String(m.body || '').replace(/\s+/g, ' ');
    if (noName) return text;
    if (m.sender === me()) return 'Du: ' + text;
    return chat.isGroup ? `${C.nameOf(chat.id, m.sender, m.sender_name)}: ${text}` : text;
  };
  function eventLabel(p) { return `${p.title || p.type || 'Termin'} · ${PL.fmtDate(p.date)}`; }

  /* ---------- Start / Abmelden ---------- */
  if (!C.available()) return;
  S().client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (session && session.user) {
        if (channel && C._uid !== session.user.id) disconnect();
        C._uid = session.user.id;
        connect();
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') C.refresh();
      } else if (channel || C.loaded) { disconnect(); C._uid = null; changed(); }
    }, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !me()) return;
    C.refresh();
    reloadOpen();
    const id = openChatId();
    if (id) C.markRead(id);
  });
  window.addEventListener('online', () => { if (me()) { C.refresh(); reloadOpen(); } });
})();
