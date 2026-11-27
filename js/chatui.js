/* Chat – Ansichten und Dialoge */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const C = PL.chat;
  const S = () => PL.sync;
  const me = () => (S().user ? S().user.id : null);
  const touch = () => window.matchMedia('(pointer: coarse)').matches;

  /* ---------- Zeit ---------- */
  const dayKey = (t) => PL.isoDate(new Date(t));
  const timeOf = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function dayLabel(t) {
    const n = PL.daysUntil(dayKey(t));
    if (n === 0) return 'Heute';
    if (n === -1) return 'Gestern';
    return PL.fmtDate(dayKey(t));
  }
  function listTime(t) {
    if (!t) return '';
    const n = PL.daysUntil(dayKey(t)), d = new Date(t);
    if (n === 0) return timeOf(t);
    if (n === -1) return 'Gestern';
    if (n > -7) return WD[d.getDay()];
    return d.getDate() + '. ' + PL.MONTHS[d.getMonth()];
  }

  /* Links in Nachrichten anklickbar machen (nach dem Escapen) */
  function linkify(text) {
    return esc(text).replace(/\bhttps?:\/\/[^\s<]+/g, (u) => {
      const trail = (u.match(/(?:[.,!?;:)\]]|&#39;|&quot;)+$/) || [''])[0];
      const url = trail ? u.slice(0, -trail.length) : u;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
    });
  }

  /* ---------- Liste ---------- */
  function chatRow(chat, active) {
    const last = chat.last;
    const n = chat.unread;
    return `<a class="row row-click chat-row ${chat.id === active ? 'on' : ''} ${n ? 'unread' : ''}" href="#/chat/${chat.id}">
      ${C.avatar(chat)}
      <span class="row-main">
        <span class="chat-line"><span class="row-title">${esc(C.title(chat))}</span><span class="chat-time">${listTime(last ? last.created_at : chat.createdAt)}</span></span>
        <span class="chat-line"><span class="row-sub">${esc(C.preview(last, chat))}</span>${n ? `<span class="chat-unread">${n > 99 ? '99+' : n}</span>` : ''}</span>
      </span>
    </a>`;
  }
  function listHtml(active) {
    if (!C.loaded) return C.error ? `<div class="empty"><b>Chats konnten nicht geladen werden</b>Bist du online?<br><button class="btn btn-sm" data-action="chat-reload">${ic('refresh', 'i-sm')} Nochmal versuchen</button></div>`
      : `<div class="empty">Chats werden geladen …</div>`;
    if (!C.chats.length) return `<div class="empty"><b>Noch keine Chats</b>Schreib Freunden, die auch Punktlandung nutzen – einzeln oder in einer Gruppe.<br><button class="btn btn-primary btn-sm" data-action="new-chat">${ic('plus', 'i-sm')} Neuer Chat</button></div>`;
    return `<section class="card chat-list-card"><div class="list">${C.chats.map((c) => chatRow(c, active)).join('')}</div></section>`;
  }
  const eyebrow = () => (C.unread ? `${C.unread} ungelesen` : C.loaded ? `${C.chats.length} ${C.chats.length === 1 ? 'Chat' : 'Chats'}` : 'Mit Freunden');

  /* ---------- Unterhaltung ---------- */
  function headInner(chat) {
    const members = C.members[chat.id] || [];
    const sub = chat.stub ? ''
      : chat.isGroup ? members.map((m) => (m.user_id === me() ? 'Du' : C.nameOf(chat.id, m.user_id))).join(', ')
      : ((C.otherOf(chat) || {}).email || 'Du bist allein in diesem Chat');
    return `<a class="icon-btn chat-back" href="#/chat" aria-label="Zurück">${ic('chevron-left')}</a>
      <button type="button" class="chat-who" ${chat.stub ? 'disabled' : `data-action="chat-info" data-id="${chat.id}"`}>
        ${chat.stub ? '' : C.avatar(chat, 'sm')}
        <span class="who-txt"><b>${esc(chat.stub ? 'Chat' : C.title(chat))}</b><span>${esc(sub)}</span></span>
      </button>
      ${chat.stub ? '' : `<button type="button" class="icon-btn" data-action="chat-info" data-id="${chat.id}" aria-label="Chat-Infos">${ic('info')}</button>`}`;
  }

  const same = (a, b) => a && b && a.kind !== 'system' && b.kind !== 'system' && a.sender === b.sender
    && dayKey(a.created_at) === dayKey(b.created_at) && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 5 * 60e3;

  function msgsHtml(chat) {
    const list = C.msgs[chat.id];
    if (!list) return `<div class="msg-sys">Nachrichten werden geladen …</div>`;
    let h = C.more[chat.id] ? `<button type="button" class="btn btn-sm msg-more" data-action="chat-older" data-id="${chat.id}">Ältere Nachrichten laden</button>` : '';
    if (!list.length) h += `<div class="msg-empty">${ic('chat', 'i-lg')}<b>Noch keine Nachrichten</b><span>Schreib die erste, schick ein GIF – oder über ${ic('plus', 'i-sm')} einen Lernzettel oder Klausurtermin.</span></div>`;
    let lastDay = '';
    list.forEach((m, i) => {
      const d = dayKey(m.created_at);
      if (d !== lastDay) { h += `<div class="msg-day">${dayLabel(m.created_at)}</div>`; lastDay = d; }
      if (m.kind === 'system') { h += `<div class="msg-sys">${esc(C.systemText(m, chat.id))}</div>`; return; }
      h += msgHtml(chat, m, !same(list[i - 1], m), !same(m, list[i + 1]));
    });
    return h;
  }

  function msgHtml(chat, m, first, last) {
    const mine = m.sender === me();
    const name = chat.isGroup && !mine && first ? `<div class="msg-name" style="--c:${C.memberColor(m.sender)}">${esc(C.nameOf(chat.id, m.sender, m.sender_name))}</div>` : '';
    const t = `<span class="t">${m.pending ? ic('clock') : ''}${timeOf(m.created_at)}</span>`;
    const gif = C.gifOf(m);
    const inner = m.kind === 'note' ? noteCard(m, t) : m.kind === 'event' ? eventCard(m, t) : gif ? gifCard(gif, t) : `<div class="bubble">${linkify(m.body)}${t}</div>`;
    return `<div class="msg ${mine ? 'mine' : ''} ${first ? 'first' : ''} ${last ? 'tail' : ''} ${m.failed ? 'failed' : ''}" data-msg="${m.id}">${name}${inner}${m.failed ? `<span class="msg-fail">${ic('alert')} Nicht gesendet – antippen</span>` : ''}</div>`;
  }

  function gifCard(g, t) {
    const ratio = g.w && g.h ? ` style="aspect-ratio:${g.w}/${g.h}"` : '';
    return `<div class="bubble gif-msg"><img src="${esc(g.url)}" alt="${esc(g.title || 'GIF')}"${ratio} loading="lazy" decoding="async" referrerpolicy="no-referrer">${t}</div>`;
  }

  function noteCard(m, t) {
    const p = m.payload || {};
    const type = PL.fileType(p.mime, p.ext ? 'x.' + p.ext : p.title);
    const sub = [p.subject_short || p.subject, type.name, p.size ? PL.fmtBytes(p.size) : ''].filter(Boolean).map(esc).join(' · ');
    return `<div class="bubble card-msg">
      <div class="mc-top"><span class="note-tile" style="--c:${type.color}">${ic(type.icon)}<b>${esc(type.label)}</b></span>
        <span class="mc-txt"><b>${esc(p.title || 'Lernzettel')}</b><span>${sub}</span></span></div>
      <div class="mc-actions">
        <button type="button" class="btn btn-sm" data-action="chat-note-open" data-chat="${m.chat_id}" data-id="${m.id}">${ic('eye', 'i-sm')} Öffnen</button>
        <button type="button" class="btn btn-sm" data-action="chat-note-save" data-chat="${m.chat_id}" data-id="${m.id}">${ic('download', 'i-sm')} Sichern</button>
      </div>${t}</div>`;
  }

  const hasEvent = (p) => PL.state.events.some((e) => e.date === p.date && e.type === p.type && (e.title || '') === (p.title || ''));
  function eventCard(m, t) {
    const p = m.payload || {};
    const n = PL.daysUntil(p.date);
    const mine = m.sender === me();
    const cd = n < 0 ? '' : `<span class="countdown ${n <= 3 ? (n === 0 ? 'today' : 'soon') : ''}">${PL.relDays(n)}</span>`;
    return `<div class="bubble card-msg">
      <div class="mc-top">${PL.dateBox(p.date)}
        <span class="mc-txt"><b>${esc(p.title || p.type || 'Termin')}</b><span>${[p.title ? p.type : '', p.subject_short || p.subject, n < 0 ? PL.relDays(n) : ''].filter(Boolean).map(esc).join(' · ')}</span></span>${cd}</div>
      ${mine ? '' : `<div class="mc-actions">${hasEvent(p)
        ? `<span class="mc-done">${ic('check', 'i-sm')} In deinem Kalender</span>`
        : `<button type="button" class="btn btn-sm" data-action="chat-event-add" data-chat="${m.chat_id}" data-id="${m.id}">${ic('calendar', 'i-sm')} In meinen Kalender</button>`}</div>`}${t}</div>`;
  }

  /* Rechte Spalte (breite Bildschirme): Kontakt bzw. Mitglieder, geteilte Dateien und Termine */
  function detailsHtml(chat) {
    if (!chat || chat.stub) return '';
    const members = C.members[chat.id] || [];
    const list = C.msgs[chat.id] || [];
    const notes = list.filter((m) => m.kind === 'note').slice(-6).reverse();
    const events = list.filter((m) => m.kind === 'event').slice(-4).reverse();
    const other = C.otherOf(chat);
    const sec = (title, body) => `<section class="cd-sec"><h3>${title}</h3>${body}</section>`;
    const people = chat.isGroup
      ? sec(`Mitglieder <span>${members.length}</span>`, members.map((m) => `<div class="cd-row"><span class="cd-dot" style="--c:${C.memberColor(m.user_id)}">${esc((m.user_id === me() ? 'Du' : C.nameOf(chat.id, m.user_id)).charAt(0).toUpperCase())}</span><span>${esc(m.user_id === me() ? 'Du' : C.nameOf(chat.id, m.user_id))}</span></div>`).join(''))
      : sec('Kontakt', `<div class="cd-kv"><span>E-Mail</span><b>${esc((other || {}).email || '–')}</b></div>`);
    const fileRows = notes.length ? notes.map((m) => { const p = m.payload || {}; return `<button type="button" class="cd-row cd-click" data-action="chat-note-open" data-chat="${m.chat_id}" data-id="${m.id}">${ic('file', 'i-sm')}<span>${esc(p.title || 'Lernzettel')}</span><small>${esc(p.subject_short || '')}</small></button>`; }).join('')
      : `<p class="cd-empty">Noch keine Dateien in diesem Chat</p>`;
    const evRows = events.length ? events.map((m) => { const p = m.payload || {}; return `<div class="cd-row">${ic('calendar', 'i-sm')}<span>${esc(p.title || p.type || 'Termin')}${p.subject_short ? ' · ' + esc(p.subject_short) : ''}</span><small>${p.date ? esc(PL.fmtDate(p.date)) : ''}</small></div>`; }).join('')
      : `<p class="cd-empty">Noch keine Termine in diesem Chat</p>`;
    return `<div class="cd-top">${C.avatar(chat)}<div><b>${esc(C.title(chat))}</b><span>${chat.isGroup ? `Gruppe · ${members.length} Personen` : 'Einzelchat'}</span></div></div>
      ${people}
      ${sec('Geteilte Dateien', fileRows)}
      ${sec('Termine', evRows)}
      <button type="button" class="btn btn-sm cd-more" data-action="chat-info" data-id="${chat.id}">${ic('info', 'i-sm')} Chat-Infos</button>`;
  }

  function convHtml(chat) {
    return `<header class="chat-head" data-chat-head>${headInner(chat)}</header>
      <div class="chat-scroll" data-chat-scroll><div class="msgs" data-chat-msgs>${msgsHtml(chat)}</div></div>
      <form class="chat-compose" data-chat-form autocomplete="off">
        <button type="button" class="icon-btn" data-action="chat-attach" data-id="${chat.id}" aria-label="Lernzettel oder Termin senden" title="Lernzettel oder Termin senden" ${chat.stub ? 'disabled' : ''}>${ic('plus')}</button>
        <button type="button" class="icon-btn gif-btn" data-action="chat-gif" data-id="${chat.id}" aria-label="GIF senden" title="GIF senden" ${chat.stub ? 'disabled' : ''}>GIF</button>
        <textarea class="input" data-chat-input rows="1" maxlength="2000" placeholder="Nachricht" aria-label="Nachricht" enterkeyhint="send"></textarea>
        <button type="submit" class="icon-btn chat-send" aria-label="Senden" data-send>${ic('send')}<span class="send-l">Senden</span></button>
      </form>`;
  }

  /* ---------- Seite ---------- */
  const modeOf = (arg) => [S().user ? 1 : 0, C.error || '', C.loaded ? 1 : 0, arg ? 1 : 0].join(':');
  const settingsBtn = () => `<a class="icon-btn hide-desk" href="#/einstellungen" aria-label="Einstellungen">${ic('settings')}${PL.syncDot()}</a>`;
  const pageHead = (actions) => `<header class="page-head"><div><div class="eyebrow" data-chat-eyebrow>${eyebrow()}</div><h1 class="page-title">Chat</h1></div><div class="head-actions">${actions}</div></header>`;

  PL.views.chat = function (arg) {
    const simple = (body) => `<div class="page view">${pageHead(settingsBtn())}<div style="max-width:620px">${body}</div></div>`;
    if (!C.available()) return simple(`<div class="empty"><b>Chat nicht verfügbar</b>Der Online-Speicher ist noch nicht verbunden. Die Anleitung steht in SYNC-EINRICHTEN.md.</div>`);
    if (!S().user) {
      return simple(`<section class="card chat-intro">
        <span class="chat-av lg" style="--c:var(--accent)">${ic('chat', 'i-lg')}</span>
        <h2 class="card-title" style="justify-content:center">Chatte mit deinen Freunden</h2>
        <p>Einzeln oder in Gruppen – und schick euch Lernzettel und Klausurtermine direkt in den Chat. Dafür brauchst du ein Konto, deine Freunde auch.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary" data-action="login">Anmelden</button><button class="btn" data-action="signup">Konto erstellen</button></div>
      </section>`);
    }
    if (C.error === 'setup') {
      return simple(`<div class="note-warn">${ic('alert', 'i-sm')}<div><b>Der Chat ist noch nicht eingerichtet.</b> Einmal <code>supabase/chat.sql</code> in Supabase im SQL Editor ausführen (siehe SYNC-EINRICHTEN.md, Schritt 6). Danach die App neu laden.</div></div>
        <button class="btn btn-sm" data-action="chat-reload">${ic('refresh', 'i-sm')} Nochmal prüfen</button>`);
    }
    let chat = arg ? C.chat(arg) : null;
    if (arg && !chat) {
      if (C.loaded) { PL.toast('Diesen Chat gibt es nicht mehr'); location.hash = '#/chat'; return ''; }
      chat = { id: arg, stub: true };   // lädt noch
    }
    return `<div class="page chat-page ${chat ? 'has-active' : 'view'}" data-chat-root data-chat-id="${esc(arg || '')}" data-chat-mode="${modeOf(arg)}">
      <div class="chat-layout">
        <div class="chat-list-pane">
          ${pageHead(`${settingsBtn()}<button class="btn btn-primary hide-mobile" data-action="new-chat">${ic('plus', 'i-sm')} Neuer Chat</button>`)}
          <div class="chat-list-wrap" data-chat-list>${listHtml(arg)}</div>
        </div>
        <section class="chat-pane">${chat ? convHtml(chat)
          : `<div class="chat-none">${ic('chat', 'i-lg')}<b>Wähle einen Chat</b><span>oder starte einen neuen mit Freunden</span><button class="btn btn-sm" data-action="new-chat">${ic('plus', 'i-sm')} Neuer Chat</button></div>`}</section>
        ${chat ? `<aside class="chat-details" data-chat-details aria-label="Details">${detailsHtml(chat)}</aside>` : ''}
      </div>
    </div>`;
  };

  /* Nach dem kompletten Aufbau: Eingabefeld verbinden, Nachrichten laden */
  let stickBottom = true, hadFocus = false;
  PL.chatMounted = function () {
    const root = document.querySelector('[data-chat-root]');
    if (!root) return;
    const id = root.dataset.chatId;
    const chat = id && C.chat(id);
    const box = root.querySelector('[data-chat-list]');
    if (box) box._html = box.innerHTML;
    if (!id || !root.querySelector('[data-chat-form]')) return;
    const ta = root.querySelector('[data-chat-input]');
    const form = root.querySelector('[data-chat-form]');
    const sc = root.querySelector('[data-chat-scroll]');
    const msgs = root.querySelector('[data-chat-msgs]');
    msgs._html = msgs.innerHTML;
    ta.value = C.drafts[id] || '';
    grow(ta);
    ta.addEventListener('input', () => { C.drafts[id] = ta.value; grow(ta); });
    ta.addEventListener('focus', () => { hadFocus = true; setTimeout(() => { if (stickBottom) sc.scrollTop = sc.scrollHeight; }, 250); });
    ta.addEventListener('blur', () => { hadFocus = false; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch()) { e.preventDefault(); submit(); }
    });
    // Senden-Knopf soll die Tastatur nicht schließen
    root.querySelector('[data-send]').addEventListener('pointerdown', (e) => { if (document.activeElement === ta) e.preventDefault(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    function submit() {
      const text = ta.value.trim();
      if (!text || !C.chat(id)) return;
      ta.value = ''; C.drafts[id] = ''; grow(ta);
      stickBottom = true;
      C.send(id, 'text', text).catch((err) => PL.toast(C.err(err)));
    }
    // GIFs laden nach – unten bleiben, wenn man unten war
    msgs.addEventListener('load', (e) => { if (e.target.tagName === 'IMG' && stickBottom) sc.scrollTop = sc.scrollHeight; }, true);
    sc.addEventListener('scroll', () => { stickBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120; }, { passive: true });
    sc.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      const el = e.target.closest('[data-msg]');
      if (!el || String(window.getSelection() || '')) return;
      msgSheet(id, el.dataset.msg);
    });
    stickBottom = true;
    sc.scrollTop = sc.scrollHeight;
    fitViewport();
    if (hadFocus || (!touch() && window.innerWidth >= 720)) ta.focus({ preventScroll: true });
    if (chat) {
      if (!C.msgs[id]) loadFirst(id);
      if (chat.unread && document.visibilityState === 'visible') C.markRead(id);
    }
  };
  function loadFirst(id) {
    C.loadMessages(id).then(() => { stickBottom = true; PL.render(); }, (e) => PL.toast(C.err(e)));
  }
  function grow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(140, ta.scrollHeight + 2) + 'px';
  }

  /* Bei Änderungen nur Liste und Nachrichten austauschen – das Eingabefeld bleibt */
  PL.chatPatch = function (arg) {
    const root = document.querySelector('[data-chat-root]');
    if (!root || root.dataset.chatId !== (arg || '') || root.dataset.chatMode !== modeOf(arg)) return false;
    const chat = arg ? C.chat(arg) : null;
    if (arg && !chat) return false;
    const set = (el, html) => { if (el && el._html !== html) { el.innerHTML = html; el._html = html; return true; } return false; };
    set(root.querySelector('[data-chat-list]'), listHtml(arg));
    const eb = root.querySelector('[data-chat-eyebrow]');
    if (eb) eb.textContent = eyebrow();
    if (chat) {
      set(root.querySelector('[data-chat-head]'), headInner(chat));
      set(root.querySelector('[data-chat-details]'), detailsHtml(chat));
      const sc = root.querySelector('[data-chat-scroll]');
      const fromBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
      if (set(root.querySelector('[data-chat-msgs]'), msgsHtml(chat))) {
        sc.scrollTop = stickBottom ? sc.scrollHeight : sc.scrollHeight - sc.clientHeight - fromBottom;
      }
      if (!C.msgs[chat.id]) loadFirst(chat.id);
      if (chat.unread && document.visibilityState === 'visible') C.markRead(chat.id);
    }
    return true;
  };

  /* iPhone: Bei offener Tastatur die Unterhaltung auf den sichtbaren Bereich verkleinern */
  function fitViewport() {
    const pane = document.querySelector('.chat-page.has-active .chat-pane');
    if (!pane) return;
    const vv = window.visualViewport;
    // Ab iPad-Breite liegt die Unterhaltung im Inhaltsbereich (siehe shell.js): dort nichts anpassen
    if (!vv || (PL.isDesk ? PL.isDesk() : window.innerWidth >= 768)) { pane.style.height = ''; pane.style.transform = ''; return; }
    pane.style.height = vv.height + 'px';
    pane.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
    if (stickBottom) { const sc = pane.querySelector('[data-chat-scroll]'); if (sc) sc.scrollTop = sc.scrollHeight; }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport);
    window.visualViewport.addEventListener('scroll', fitViewport);
  }
  window.addEventListener('resize', fitViewport);

  /* ---------- Dialoge ---------- */
  const findMsg = (chatId, id) => (C.msgs[chatId] || []).find((m) => m.id === id);
  const chipsWrap = 'chips" style="flex-wrap:wrap;overflow:visible';

  function msgSheet(chatId, id) {
    const m = findMsg(chatId, id);
    const chat = C.chat(chatId);
    if (!m || !chat || m.sender !== me() || m.kind === 'system' || m.pending) return;
    PL.openSheet(`${PL.sheetHead(m.failed ? 'Nicht gesendet' : 'Deine Nachricht', `${dayLabel(m.created_at)}, ${timeOf(m.created_at)}`)}
      <div class="msg-quote">${esc(C.preview(m, chat, true))}</div>
      <div class="sheet-foot col">
        ${m.failed ? `<button type="button" class="btn btn-primary" data-retry>${ic('refresh', 'i-sm')} Erneut senden</button>` : ''}
        ${m.kind === 'text' && !C.gifOf(m) && navigator.clipboard ? `<button type="button" class="btn" data-copy>Text kopieren</button>` : ''}
        <button type="button" class="btn btn-danger" data-del>${ic('trash', 'i-sm')} ${m.failed ? 'Verwerfen' : 'Für alle löschen'}</button>
      </div>`, {
      onMount(sh) {
        const r = sh.querySelector('[data-retry]');
        if (r) r.onclick = () => { PL.closeSheet(); C.retry(chatId, id).catch((e) => PL.toast(C.err(e))); };
        const cp = sh.querySelector('[data-copy]');
        if (cp) cp.onclick = () => { navigator.clipboard.writeText(m.body).then(() => PL.toast('Kopiert'), () => {}); PL.closeSheet(); };
        sh.querySelector('[data-del]').onclick = async (e) => {
          e.currentTarget.disabled = true;
          try { await C.removeMessage(chatId, id); PL.closeSheet(); PL.toast(m.failed ? 'Verworfen' : 'Nachricht gelöscht'); }
          catch (err) { PL.closeSheet(); PL.toast(C.err(err)); }
        };
      },
    });
  }

  /* Neuer Chat: einzeln oder Gruppe */
  PL.newChatSheet = function (opts = {}) {
    if (!S().user) { PL.authSheet('login'); return; }
    const f = { mode: opts.mode || 'direct', emails: [] };
    // Alle mit Konto (Name, sonst E-Mail); bis die Liste da ist bzw. ohne neue chat.sql: Bekannte
    const known = () => C.friends().map((email) => ({ email, name: '' }));
    let people = C.people || known(), all = !!C.people;
    const labelOf = (email) => { const p = people.find((x) => x.email.toLowerCase() === email.toLowerCase()); return p ? C.personLabel(p) : email; };
    const html = `
      ${PL.sheetHead('Neuer Chat', 'Mit Freunden, die ein Konto in Punktlandung haben')}
      <div class="seg seg-block" data-seg style="margin-bottom:16px">
        <button type="button" data-v="direct">${ic('chat', 'i-sm')} Einzelchat</button><button type="button" data-v="group">${ic('users', 'i-sm')} Gruppe</button>
      </div>
      <form data-form novalidate>
        <div class="field" data-group-only><label for="ncName">Name der Gruppe</label><input id="ncName" class="input" maxlength="60" placeholder="z. B. Mathe-LK"></div>
        <div class="field"><label for="ncEmail" data-email-label>Name oder E-Mail</label>
          <div style="display:flex;gap:8px"><input id="ncEmail" class="input" type="text" autocomplete="off" placeholder="Suchen oder name@beispiel.de" style="flex:1" autofocus>
          <button type="button" class="btn" data-add data-group-only>${ic('plus', 'i-sm')}</button></div></div>
        <div class="${chipsWrap};margin:-6px 0 12px" data-picked data-group-only></div>
        <div data-people-wrap hidden><div class="field-label" style="margin:-4px 0 8px" data-people-label>Alle mit Konto</div><div class="${chipsWrap};margin-bottom:14px;max-height:220px;overflow-y:auto" data-friends></div></div>
        <div class="auth-msg" data-msg hidden></div>
        <p class="hint" style="margin:0 0 14px">Hier stehen alle mit einem Konto in Punktlandung – mit dem Namen aus ihren Einstellungen, sonst mit der E-Mail. In Gruppen sehen alle, wer dabei ist.</p>
        <div class="sheet-foot"><button type="submit" class="btn btn-primary" data-go>Chat starten</button></div>
      </form>`;
    PL.openSheet(html, {
      onMount(sh) {
        const msg = sh.querySelector('[data-msg]');
        const go = sh.querySelector('[data-go]');
        const input = sh.querySelector('#ncEmail');
        const show = (t) => { msg.hidden = !t; msg.textContent = t || ''; };
        const draw = () => {
          const g = f.mode === 'group';
          sh.querySelectorAll('[data-seg] button').forEach((b) => b.classList.toggle('on', b.dataset.v === f.mode));
          sh.querySelectorAll('[data-group-only]').forEach((el) => { el.hidden = !g; });
          sh.querySelector('[data-email-label]').textContent = g ? 'Mitglieder (Name oder E-Mail)' : 'Name oder E-Mail';
          go.textContent = g ? 'Gruppe erstellen' : 'Chat starten';
          sh.querySelector('[data-picked]').innerHTML = f.emails.map((e) => `<button type="button" class="chip on" data-rm="${esc(e)}" title="${esc(e)}">${esc(labelOf(e))} ${ic('x', 'i-sm')}</button>`).join('');
          drawPeople();
        };
        const drawPeople = () => {
          const g = f.mode === 'group';
          const q = input.value.trim().toLowerCase();
          const picked = new Set(f.emails.map((e) => e.toLowerCase()));
          const list = people.filter((p) => !picked.has(p.email.toLowerCase()) && (!q || p.email.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)));
          sh.querySelector('[data-people-wrap]').hidden = !people.length;
          sh.querySelector('[data-people-label]').textContent = all ? 'Alle mit Konto' : 'Bekannte';
          sh.querySelector('[data-friends]').innerHTML = list.length
            ? list.map((p) => `<button type="button" class="chip" data-friend="${esc(p.email)}" title="${esc(p.email)}">${g ? ic('plus', 'i-sm') : ic('chat', 'i-sm')} ${esc(C.personLabel(p))}</button>`).join('')
            : '<span class="hint" style="margin:0">Niemand gefunden</span>';
        };
        // Name statt E-Mail eingetippt und genau eine Person passt → deren E-Mail
        const resolve = (t) => {
          t = t.trim();
          if (!t || t.includes('@')) return t;
          const q = t.toLowerCase();
          const hits = people.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
          const exact = hits.filter((p) => p.name.toLowerCase() === q);
          return (exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : { email: t }).email;
        };
        const addEmail = () => {
          const e = resolve(input.value);
          if (!e) return true;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { show('Bitte gib eine gültige E-Mail-Adresse ein.'); return false; }
          if (e.toLowerCase() === ((S().user || {}).email || '').toLowerCase()) { show('Du bist sowieso dabei.'); return false; }
          if (!f.emails.some((x) => x.toLowerCase() === e.toLowerCase())) f.emails.push(e);
          input.value = ''; show(''); draw();
          return true;
        };
        const busy = (on) => { go.disabled = on; if (on) go.textContent = 'Einen Moment …'; else draw(); };
        const done = (id) => { PL.closeSheet(); if (opts.then) opts.then(id); else location.hash = '#/chat/' + id; };
        const startDirect = async (email) => {
          busy(true); show('');
          try { done(await C.startDirect(email)); } catch (e) { show(C.err(e)); busy(false); }
        };
        sh.querySelector('[data-seg]').addEventListener('click', (e) => {
          const b = e.target.closest('button[data-v]'); if (!b) return;
          f.mode = b.dataset.v; show(''); draw();
          (f.mode === 'group' ? sh.querySelector('#ncName') : input).focus();
        });
        sh.querySelector('[data-add]').onclick = () => { addEmail(); input.focus(); };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && f.mode === 'group') { e.preventDefault(); addEmail(); } });
        input.addEventListener('input', drawPeople);
        sh.querySelector('[data-picked]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-rm]'); if (!b) return;
          f.emails = f.emails.filter((x) => x !== b.dataset.rm); draw();
        });
        sh.querySelector('[data-friends]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-friend]'); if (!b) return;
          if (f.mode === 'direct') { startDirect(b.dataset.friend); return; }
          f.emails.push(b.dataset.friend); input.value = ''; draw();
        });
        sh.querySelector('[data-form]').onsubmit = async (e) => {
          e.preventDefault();
          if (f.mode === 'direct') { startDirect(resolve(input.value)); return; }
          if (!addEmail()) return;
          const name = sh.querySelector('#ncName').value.trim();
          if (!name) { show('Gib der Gruppe einen Namen.'); sh.querySelector('#ncName').focus(); return; }
          if (!f.emails.length) { show('Füge mindestens eine E-Mail-Adresse hinzu.'); input.focus(); return; }
          busy(true); show('');
          try { done(await C.startGroup(name, f.emails)); } catch (err) { show(C.err(err)); busy(false); }
        };
        draw();
        C.loadPeople().then((list) => { if (!sh.isConnected) return; people = list; all = true; draw(); }, () => {});
      },
    });
  };

  /* Infos zum Chat: Mitglieder, Name, Verlassen */
  PL.chatInfoSheet = function (chatId) {
    const chat = C.chat(chatId);
    if (!chat) return;
    const members = (C.members[chatId] || []).slice().sort((a, b) => (b.user_id === me()) - (a.user_id === me()) || C.nameOf(chatId, a.user_id).localeCompare(C.nameOf(chatId, b.user_id), 'de'));
    const inChat = new Set(members.map((m) => (m.email || '').toLowerCase()));
    const friends = C.friends().filter((e) => !inChat.has(e.toLowerCase()));
    const other = C.otherOf(chat);
    const html = `
      ${PL.sheetHead(esc(C.title(chat)), chat.isGroup ? `Gruppe · ${members.length} Mitglieder` : 'Einzelchat')}
      ${chat.isGroup ? `<div class="field"><label for="ciName">Name der Gruppe</label><div style="display:flex;gap:8px"><input id="ciName" class="input" maxlength="60" value="${esc(chat.name)}" style="flex:1"><button type="button" class="btn" data-rename hidden>Speichern</button></div></div>` : ''}
      <div class="sec-title">Mitglieder<span>${members.length}</span></div>
      <div class="list" style="margin-bottom:14px">${members.map((m) => `
        <div class="row" style="padding:8px 4px"><span class="chat-av sm" style="--c:${C.memberColor(m.user_id)}">${esc((m.name || m.email || '?').charAt(0).toUpperCase())}</span>
          <span class="row-main"><span class="row-title" style="display:block">${esc(m.user_id === me() ? 'Du' : C.nameOf(chatId, m.user_id))}</span><span class="row-sub" style="display:block">${esc(m.email)}</span></span></div>`).join('')}</div>
      ${chat.isGroup ? `<form data-add-form class="field"><label for="ciEmail">Jemanden hinzufügen</label>
        <div style="display:flex;gap:8px"><input id="ciEmail" class="input" type="email" inputmode="email" autocomplete="off" placeholder="name@beispiel.de" style="flex:1"><button type="submit" class="btn btn-primary" data-add>Hinzufügen</button></div></form>
        ${friends.length ? `<div class="${chipsWrap};margin:-6px 0 14px">${friends.map((e) => `<button type="button" class="chip" data-friend="${esc(e)}">${ic('plus', 'i-sm')} ${esc(e)}</button>`).join('')}</div>` : ''}` : ''}
      <div class="auth-msg" data-msg hidden></div>
      <div class="sheet-foot">
        <button type="button" class="btn btn-danger" data-leave>${chat.isGroup ? 'Gruppe verlassen' : 'Chat löschen'}</button>
        <button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button>
      </div>`;
    PL.openSheet(html, {
      onMount(sh) {
        const msg = sh.querySelector('[data-msg]');
        const show = (t, ok) => { msg.hidden = !t; msg.textContent = t || ''; msg.classList.toggle('ok', !!ok); };
        const nameIn = sh.querySelector('#ciName');
        if (nameIn) {
          const btn = sh.querySelector('[data-rename]');
          nameIn.addEventListener('input', () => { btn.hidden = nameIn.value.trim() === chat.name || !nameIn.value.trim(); });
          const save = async () => {
            const v = nameIn.value.trim();
            if (!v || v === chat.name) return;
            btn.disabled = true;
            try { await C.rename(chatId, v); PL.chatInfoSheet(chatId); PL.toast('Gruppe umbenannt'); } catch (e) { show(C.err(e)); btn.disabled = false; }
          };
          btn.onclick = save;
          nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        }
        const add = async (email) => {
          const b = sh.querySelector('[data-add]');
          b.disabled = true; show('');
          try { await C.addMember(chatId, email); PL.chatInfoSheet(chatId); PL.toast(`${email} hinzugefügt`); } catch (e) { show(C.err(e)); b.disabled = false; }
        };
        const form = sh.querySelector('[data-add-form]');
        if (form) form.onsubmit = (e) => { e.preventDefault(); add(sh.querySelector('#ciEmail').value); };
        sh.querySelectorAll('[data-friend]').forEach((b) => { b.onclick = () => add(b.dataset.friend); });
        sh.querySelector('[data-leave]').onclick = () => {
          const title = C.title(chat);
          PL.confirmSheet(chat.isGroup ? 'Gruppe verlassen?' : 'Chat löschen?',
            chat.isGroup ? `Du bekommst keine Nachrichten mehr aus „${title}“ und siehst den Verlauf nicht mehr. Die anderen sehen, dass du gegangen bist.${members.length <= 1 ? ' Du bist als Letzte(r) drin – die Gruppe wird gelöscht.' : ''}`
              : `Der Chat verschwindet aus deiner Liste${other ? `, bei ${C.title(chat)} bleibt er erhalten` : ' und wird gelöscht'}. Wenn ihr euch wieder schreibt, ist der Verlauf wieder da.`,
            chat.isGroup ? 'Verlassen' : 'Löschen', async () => {
              location.hash = '#/chat';
              try { await C.leave(chatId); PL.toast(chat.isGroup ? 'Gruppe verlassen' : 'Chat gelöscht'); }
              catch (e) { PL.toast(C.err(e)); }
            });
        };
      },
    });
  };

  /* Lernzettel oder Termin in den Chat schicken */
  PL.chatAttachSheet = function (chatId, tab) {
    const chat = C.chat(chatId);
    if (!chat) return;
    const F = PL.files;
    let cur = tab || 'note';
    PL.openSheet(`${PL.sheetHead('Senden an ' + esc(C.title(chat)))}
      <div class="seg seg-block" data-seg style="margin-bottom:14px"><button type="button" data-v="note">${ic('file', 'i-sm')} Lernzettel</button><button type="button" data-v="event">${ic('calendar', 'i-sm')} Termin</button></div>
      <div class="auth-msg" data-msg hidden></div>
      <div data-body></div>`, {
      onMount(sh) {
        const body = sh.querySelector('[data-body]');
        const msg = sh.querySelector('[data-msg]');
        const show = (t, ok) => { msg.hidden = !t; msg.textContent = t || ''; msg.classList.toggle('ok', !!ok); };
        const cloudOk = F.canUpload() && F.remoteError !== 'setup';
        const draw = () => {
          sh.querySelectorAll('[data-seg] button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
          if (cur === 'note') {
            const notes = PL.state.notes.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
            body.innerHTML = !notes.length
              ? `<div class="empty"><b>Noch keine Dateien</b>Lade zuerst eine Datei hoch.<br><a class="btn btn-primary btn-sm" href="#/dateien">${ic('upload', 'i-sm')} Zu den Dateien</a></div>`
              : `<div class="list pick-list">${notes.map((n) => {
                const sub = PL.subject(n.subjectId);
                const type = PL.fileType(n.mime, n.ext ? 'x.' + n.ext : n.title);
                const can = n.cloud || (cloudOk && F.isHere(n.id));
                const why = n.cloud ? '' : !cloudOk ? ' · nur auf dem Gerät' : F.isHere(n.id) ? ' · wird in die Cloud geladen' : ' · nicht auf diesem Gerät';
                return `<button type="button" class="row row-click note-row" data-note="${n.id}" ${can ? '' : 'disabled'}>
                  <span class="note-tile" style="--c:${type.color}">${ic(type.icon)}<b>${esc(type.label)}</b></span>
                  <span class="row-main"><span class="row-title" style="display:block">${esc(n.title)}</span><span class="row-sub" style="display:block">${sub ? esc(sub.short) + ' · ' : ''}${PL.fmtBytes(n.size)}${why}</span></span>
                  ${ic('send', 'i-sm')}</button>`;
              }).join('')}</div>
              <p class="hint" style="margin:10px 0 0">Alle im Chat können den Zettel öffnen und speichern. Er zählt nur bei dir zum Speicher.</p>`;
          } else {
            const today = PL.today();
            const evs = PL.state.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
            body.innerHTML = !evs.length
              ? `<div class="empty"><b>Keine anstehenden Termine</b>Trag zuerst eine Klausur oder einen Test ein.<br><button class="btn btn-primary btn-sm" data-action="add-event">${ic('plus', 'i-sm')} Termin anlegen</button></div>`
              : `<div class="list pick-list">${evs.map((e) => {
                const sub = PL.subject(e.subjectId);
                return `<button type="button" class="row row-click" data-event="${e.id}" style="padding:9px 8px">${PL.dateBox(e.date)}
                  <span class="row-main"><span class="row-title" style="display:block">${esc(e.title || e.type)}</span><span class="row-sub" style="display:block">${sub ? esc(sub.short) + ' · ' : ''}${esc(e.type)} · ${PL.relDays(PL.daysUntil(e.date))}</span></span>
                  ${ic('send', 'i-sm')}</button>`;
              }).join('')}</div>`;
          }
        };
        sh.querySelector('[data-seg]').addEventListener('click', (e) => {
          const b = e.target.closest('button[data-v]'); if (!b) return;
          cur = b.dataset.v; show(''); draw();
        });
        body.addEventListener('click', async (e) => {
          const nb = e.target.closest('[data-note]'), eb = e.target.closest('[data-event]');
          if (nb && !nb.disabled) {
            const note = F.note(nb.dataset.note);
            if (!note) return;
            body.querySelectorAll('button').forEach((x) => { x.disabled = true; });
            if (!note.cloud) show('Wird in die Cloud geladen …', true);
            try { stickBottom = true; await C.sendNote(chatId, note); PL.closeSheet(); }
            catch (err) { show(C.err(err)); draw(); }
          }
          if (eb) {
            const ev = PL.state.events.find((x) => x.id === eb.dataset.event);
            if (!ev) return;
            PL.closeSheet();
            stickBottom = true;
            C.sendEvent(chatId, ev).catch((err) => PL.toast(C.err(err)));
          }
        });
        draw();
      },
    });
  };

  /* GIF suchen und senden */
  const GIF_TAGS = ['Danke', 'Haha', 'Ja', 'Nein', 'OMG', 'Müde', 'Lernen', 'Prüfung', 'Geschafft', 'Party', 'Hallo', 'Sorry'];
  PL.chatGifSheet = function (chatId) {
    const chat = C.chat(chatId);
    if (!chat) return;
    PL.openSheet(`${PL.sheetHead('GIF senden', 'an ' + esc(C.title(chat)))}
      <div class="field" style="margin-bottom:10px"><input class="input" type="search" data-q placeholder="GIFs suchen" aria-label="GIFs suchen" enterkeyhint="search" autocomplete="off" maxlength="50" autofocus></div>
      <div class="chips" data-tags style="margin-bottom:12px">${GIF_TAGS.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="gif-grid" data-grid></div>
      <div data-status></div>
      <div class="gif-foot">Powered by GIPHY</div>`, {
      wide: true,
      onMount(sh) {
        const input = sh.querySelector('[data-q]');
        const grid = sh.querySelector('[data-grid]');
        const status = sh.querySelector('[data-status]');
        let q = '', offset = 0, req = 0, timer = null, sending = false;
        const tile = (g) => `<button type="button" class="gif-tile" data-gif="${esc(g.id)}" aria-label="${esc(g.title || 'GIF')} senden"${g.w && g.h ? ` style="aspect-ratio:${g.w}/${g.h}"` : ''}><img src="${esc(g.url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>`;
        const found = new Map();
        async function load(more) {
          const my = ++req;
          if (!more) { offset = 0; found.clear(); grid.innerHTML = ''; }
          status.innerHTML = `<div class="gif-msg-line">GIFs werden geladen …</div>`;
          try {
            const res = await C.gifSearch(q, offset);
            if (my !== req || !sh.isConnected) return;
            res.list.forEach((g) => found.set(g.id, g));
            grid.insertAdjacentHTML('beforeend', res.list.map(tile).join(''));
            offset += res.list.length;
            status.innerHTML = !found.size ? `<div class="gif-msg-line">Keine GIFs zu „${esc(q)}“ gefunden</div>`
              : res.more && res.list.length ? `<button type="button" class="btn btn-sm" data-more style="display:flex;margin:12px auto 0">Mehr laden</button>` : '';
          } catch (e) {
            if (my !== req) return;
            status.innerHTML = `<div class="note-warn" style="margin-top:4px">${ic('alert', 'i-sm')}<div>${esc(C.err(e))}</div></div>`;
          }
        }
        input.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => { const v = input.value.trim(); if (v !== q) { q = v; load(false); } }, 350);
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); q = input.value.trim(); load(false); input.blur(); } });
        sh.querySelector('[data-tags]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-tag]'); if (!b) return;
          input.value = q = b.dataset.tag;
          load(false);
        });
        status.addEventListener('click', (e) => { const b = e.target.closest('[data-more]'); if (b) { b.disabled = true; load(true); } });
        grid.addEventListener('click', (e) => {
          const b = e.target.closest('[data-gif]');
          const g = b && found.get(b.dataset.gif);
          if (!g || sending) return;
          sending = true;
          PL.closeSheet();
          stickBottom = true;
          C.sendGif(chatId, g).catch((err) => PL.toast(C.err(err)));
        });
        load(false);
      },
    });
  };

  /* Chat auswählen (z. B. aus einem Termin heraus) */
  PL.chatPickSheet = function (title, sub, onPick) {
    if (!S().user) { PL.authSheet('login'); return; }
    const chats = C.chats;
    PL.openSheet(`${PL.sheetHead(esc(title), esc(sub || ''))}
      ${chats.length ? `<div class="list pick-list">${chats.map((c) => `<button type="button" class="row row-click chat-row" data-pick="${c.id}">${C.avatar(c)}
        <span class="row-main"><span class="row-title" style="display:block">${esc(C.title(c))}</span><span class="row-sub" style="display:block">${c.isGroup ? `Gruppe · ${(C.members[c.id] || []).length} Mitglieder` : esc((C.otherOf(c) || {}).email || '')}</span></span>${ic('send', 'i-sm')}</button>`).join('')}</div>`
        : `<p style="margin:0 0 12px;color:var(--text-2)">${C.loaded ? 'Du hast noch keine Chats.' : 'Chats werden geladen …'}</p>`}
      <div class="auth-msg" data-msg hidden></div>
      <div class="sheet-foot"><button type="button" class="btn" data-new>${ic('plus', 'i-sm')} Neuer Chat</button></div>`, {
      onMount(sh) {
        const msg = sh.querySelector('[data-msg]');
        const send = async (id, btn) => {
          sh.querySelectorAll('button').forEach((x) => { if (!x.closest('.sheet-head')) x.disabled = true; });
          msg.hidden = true;
          try {
            await onPick(id);
            const c = C.chat(id);
            PL.closeSheet();
            PL.toast(`An ${c ? C.title(c) : 'den Chat'} gesendet`);
          } catch (e) {
            msg.hidden = false; msg.textContent = C.err(e);
            sh.querySelectorAll('button').forEach((x) => { x.disabled = false; });
          }
        };
        sh.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => send(b.dataset.pick, b); });
        sh.querySelector('[data-new]').onclick = () => PL.newChatSheet({ then: (id) => { Promise.resolve(onPick(id)).then(() => { location.hash = '#/chat/' + id; }, (e) => PL.toast(C.err(e))); } });
      },
    });
  };

  /* ---------- Lernzettel aus dem Chat öffnen ---------- */
  function noteBlob(m) {
    const p = m.payload || {};
    const F = PL.files;
    if (m.sender === me()) { const n = F.note(p.note_id); if (n) return F.blob(n); }
    return F.sharedBlob({ key: 's:' + p.path, share: { path: p.path }, gone: false });
  }
  async function withBtn(btn, fn) {
    const old = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Lädt …'; }
    try { await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
  }

  /* ---------- Aktionen (werden in app.js übernommen) ---------- */
  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'new-chat': () => PL.newChatSheet(),
    'chat-reload': () => { C.error = null; C.refresh().then(() => PL.render()); },
    'chat-info': (d) => PL.chatInfoSheet(d.id),
    'chat-attach': (d) => PL.chatAttachSheet(d.id),
    'chat-gif': (d) => PL.chatGifSheet(d.id),
    'chat-older': (d, el) => {
      el.disabled = true; el.textContent = 'Lädt …';
      stickBottom = false;
      C.loadMessages(d.id, true).then(() => PL.render(), (e) => { PL.toast(C.err(e)); el.disabled = false; });
    },
    'chat-note-open': (d, el) => {
      const m = findMsg(d.chat, d.id); if (!m) return;
      const p = m.payload || {};
      const win = PL.files.prepWindow(p.mime);
      withBtn(el, async () => {
        try { PL.files.show(await noteBlob(m), p.title, win); }
        catch (e) { if (win) win.close(); PL.toast(C.err(e)); }
      });
    },
    'chat-note-save': (d, el) => {
      const m = findMsg(d.chat, d.id); if (!m) return;
      withBtn(el, async () => {
        try { await PL.files.save(await noteBlob(m), (m.payload || {}).title); }
        catch (e) { PL.toast(C.err(e)); }
      });
    },
    'chat-event-add': (d) => {
      const m = findMsg(d.chat, d.id); if (!m) return;
      const p = m.payload || {};
      const nm = (p.subject || '').trim().toLowerCase();
      const sub = PL.state.subjects.find((s) => nm && s.name.trim().toLowerCase() === nm)
        || PL.state.subjects.find((s) => p.subject_short && s.short === p.subject_short);
      PL.upsertEvent({ subjectId: sub ? sub.id : null, date: p.date, type: PL.EVENT_TYPES.includes(p.type) ? p.type : 'Sonstiges', title: p.title || '' });
      PL.toast('In deinen Kalender eingetragen');
    },
  });
})();
