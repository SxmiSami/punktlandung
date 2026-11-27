/* Neuigkeiten: alles Neue an einem Ort – vor allem Dateien (Lernzettel) und
   Hausaufgaben aus Untis, dazu Mitteilungen, Tagesnachrichten, Klausuren,
   Ausfälle und Zettel, die Freunde mit dir teilen.
   Liegt wie der Untis-Zwischenspeicher nur auf diesem Gerät. */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;
  const KEY = 'punktlandung:feed';
  const KEEP_DAYS = 60, MAX_ITEMS = 250;
  Object.assign(PL.ui, { feedFilter: 'all' });

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  let store = Object.assign({ items: [], read: {}, saved: {}, init: false, sharesInit: false, errors: {} }, load() || {});
  store.items = store.items.filter((x) => x.kind !== 'onenote'); // OneNote-Seiten gab es bis 0.12 im Feed
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* voll */ } };
  const nowIso = () => new Date().toISOString();
  const subjectOf = (name) => {
    if (!name || !PL.untis) return null;
    const m = PL.untis.matchSubject({ name, long: '' });
    return m && m !== 'skip' ? m : null;
  };

  const FD = PL.feed = {};
  FD.item = (id) => FD.list().find((x) => x.id === id);

  /* ---------- Einsammeln ---------- */
  function upsert(seen, it, opts = {}) {
    seen.add(it.id);
    if (it.at) { const t = new Date(it.at); it.at = isNaN(t) ? nowIso() : t.toISOString(); }
    const old = store.items.find((x) => x.id === it.id);
    if (!old) { store.items.push(it); return 'new'; }
    const before = JSON.stringify(old);
    // Zeitpunkt des ersten Auftauchens behalten
    Object.assign(old, it, { at: opts.keepAt === false ? it.at : old.at });
    if (opts.renew) { delete store.read[it.id]; old.at = it.at; }
    return JSON.stringify(old) !== before ? 'changed' : '';
  }

  FD.ingest = function (data, range) {
    const today = PL.today();
    const seen = new Set();
    const first = !store.init;
    let fresh = 0;
    const count = (r) => { if (r === 'new') fresh++; };

    // Hausaufgaben – mit Dateien werden sie zu „Lernmaterial“
    (Array.isArray(data.homework) ? data.homework : []).forEach((h) => {
      if (!h.text && !(h.files && h.files.length)) return;
      const id = 'hw:' + h.id;
      const files = (h.files || []).map((f) => Object.assign({ kind: 'hw' }, f));
      const old = store.items.find((x) => x.id === id);
      const moreFiles = old && files.length > (old.files || []).length;
      count(upsert(seen, {
        id, kind: files.length ? 'file' : 'hw',
        at: old ? old.at : (h.date && h.date < today ? h.date + 'T07:00:00' : nowIso()),
        subject: h.subject || '', subjectId: subjectOf(h.subject),
        text: h.full || h.text || '', remark: h.remark || '', teacher: h.teacher || '',
        date: h.date || '', due: h.due || '', done: !!h.done, files, untisId: 'h' + h.id,
      }, { renew: moreFiles }));
      if (moreFiles) fresh++;
    });

    // Klausuren: neu oder verschoben
    (Array.isArray(data.exams) ? data.exams : []).forEach((x) => {
      if (!x.date || x.date < today) return;
      const id = 'ex:' + x.id;
      const old = store.items.find((i) => i.id === id);
      const moved = old && old.date !== x.date;
      count(upsert(seen, {
        id, kind: 'exam', at: old ? old.at : nowIso(),
        subject: x.subject || '', subjectId: subjectOf(x.subject),
        title: [x.name, x.text].filter(Boolean).join(' – '), type: x.type || '',
        date: x.date, start: x.start || '', end: x.end || '', rooms: x.rooms || [],
        movedFrom: moved ? old.date : (old && old.movedFrom) || '', untisId: 'x' + x.id,
      }, { renew: moved, keepAt: !moved }));
      if (moved) { const it = store.items.find((i) => i.id === id); it.at = nowIso(); fresh++; }
    });

    // Mitteilungen der Schule / Lehrkräfte
    const feed = data.feed || {};
    store.errors = feed.errors || {};
    (Array.isArray(feed.messages) ? feed.messages : []).forEach((m) => {
      const id = 'msg:' + m.id;
      const isNew = !store.items.some((x) => x.id === id);
      const r = upsert(seen, {
        id, kind: 'msg', at: m.at ? new Date(m.at).toISOString() : nowIso(),
        title: m.subject || 'Mitteilung', text: m.preview || '', sender: m.sender || '',
        hasFiles: !!m.files, msgId: m.id,
      });
      count(r);
      if (isNew && m.read) store.read[id] = 1;   // in Untis schon gelesen
    });

    // Tagesnachrichten
    (Array.isArray(feed.news) ? feed.news : []).forEach((n) => {
      if (!n.subject && !n.text) return;
      count(upsert(seen, {
        id: 'news:' + n.id, kind: 'news', at: (n.date || today) + 'T06:00:00',
        title: n.subject || 'Nachricht des Tages', text: n.text || '',
        files: (n.files || []).map((f) => Object.assign({ kind: 'news' }, f)),
      }));
    });

    // Ausfälle, Raumänderungen, EVA für die nächsten Tage
    if (Array.isArray(data.lessons) && range) {
      const until = PL.isoDate(PL.addDays(new Date(), 3));
      const live = new Set();
      data.lessons.forEach((l) => {
        if (l.date < today || l.date > until || l.type !== 'ls' || !l.subjects || !l.subjects[0]) return;
        const su = l.subjects[0];
        const sid = subjectOf(su.name);
        if (PL.untis.matchSubject(su) === 'skip') return;
        const room = l.rooms && l.rooms[0], orig = l.origRooms && l.origRooms[0];
        const eva = /\bEVA\b|eigenverantwortlich|selbstlern|selbststudium/i.test(l.info || '');
        const what = eva ? 'eva' : l.code === 'cancelled' ? 'cancel' : room && orig && room !== orig ? 'room'
          : (l.teachers && l.teachers[0] && l.origTeachers && l.origTeachers[0] && l.teachers[0] !== l.origTeachers[0]) ? 'teacher' : '';
        if (!what) return;
        const id = ['chg', l.date, su.name, l.start, what].join(':');
        live.add(id);
        count(upsert(seen, {
          id, kind: 'change', what, at: store.items.some((x) => x.id === id) ? undefined : nowIso(),
          subject: su.name, subjectId: sid, date: l.date, start: l.start, end: l.end,
          room: room || '', origRoom: orig || '', teacher: (l.teachers || [])[0] || '', info: l.info || '',
        }));
      });
      // Zurückgenommene Änderungen im abgerufenen Zeitraum verschwinden wieder
      store.items = store.items.filter((x) => x.kind !== 'change' || live.has(x.id) || x.date < today || x.date < range.from || x.date > range.to);
    }

    store.items.forEach((x) => { if (!x.at) x.at = nowIso(); });
    // Beim allerersten Mal nicht alles als neu zeigen – nur die letzten Tage
    if (first) {
      const cut = PL.addDays(new Date(), -3).toISOString();
      store.items.forEach((x) => { if (x.at < cut) store.read[x.id] = 1; });
      store.init = true;
    }
    prune();
    persist();
    return fresh;
  };

  function prune() {
    const cut = PL.addDays(new Date(), -KEEP_DAYS).toISOString();
    store.items = store.items.filter((x) => x.at >= cut || (x.kind === 'exam' && x.date >= PL.today()))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_ITEMS);
    const ids = new Set(store.items.map((x) => x.id));
    Object.keys(store.read).forEach((k) => { if (!ids.has(k) && !k.startsWith('share:')) delete store.read[k]; });
  }

  /* Zettel von Freunden kommen live dazu */
  function shares() {
    const F = PL.files;
    if (!F || !F.sharedList) return [];
    const list = F.sharedList().filter((x) => !x.gone).map((x) => ({
      id: 'share:' + x.key, kind: 'share', key: x.key, at: x.share.created_at || nowIso(),
      title: x.share.title || 'Datei', sender: x.share.owner_name || x.share.owner_email || 'Freund',
      subject: x.share.subject_short || '', mime: x.share.mime,
    }));
    if (!store.sharesInit && F.remoteAt > 0) {
      list.forEach((x) => { store.read[x.id] = 1; });
      store.sharesInit = true; persist();
    }
    return list;
  }

  FD.list = () => store.items.concat(shares()).sort((a, b) => b.at.localeCompare(a.at));
  FD.isRead = (id) => !!store.read[id];
  FD.unread = () => FD.list().filter((x) => !store.read[x.id]).length;
  FD.markRead = (id) => { if (!store.read[id]) { store.read[id] = 1; persist(); } };
  FD.markAll = () => { FD.list().forEach((x) => { store.read[x.id] = 1; }); persist(); };
  FD.errors = () => store.errors || {};

  /* ---------- Darstellung ---------- */
  const KIND = {
    file: { icon: 'paperclip', label: 'Material', color: 'var(--accent)' },
    hw: { icon: 'tasks', label: 'Hausaufgabe', color: '#3B82F6' },
    msg: { icon: 'mail', label: 'Mitteilung', color: '#06B6D4' },
    news: { icon: 'megaphone', label: 'Nachricht', color: '#F59E0B' },
    exam: { icon: 'alert', label: 'Klausur', color: '#EAB308' },
    change: { icon: 'calendar', label: 'Änderung', color: '#EF4444' },
    share: { icon: 'users', label: 'Geteilt', color: '#22C55E' },
  };
  const FILTERS = [
    ['all', 'Alle'], ['files', 'Dateien'], ['hw', 'Hausaufgaben'], ['msg', 'Mitteilungen'], ['plan', 'Klausuren & Ausfälle'],
  ];
  const inFilter = (x, f) => f === 'all'
    || (f === 'files' && (x.kind === 'file' || x.kind === 'share' || (x.files && x.files.length) || x.hasFiles))
    || (f === 'hw' && (x.kind === 'hw' || x.kind === 'file'))
    || (f === 'msg' && (x.kind === 'msg' || x.kind === 'news'))
    || (f === 'plan' && (x.kind === 'exam' || x.kind === 'change'));

  const subName = (x) => { const s = PL.subject(x.subjectId); return s ? s.name : x.subject || ''; };
  const subColor = (x) => { const s = PL.subject(x.subjectId); return s ? s.color : null; };
  const short = (t, n = 110) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const dayLabel = (iso) => {
    const d = PL.isoDate(new Date(iso));
    const n = PL.daysUntil(d);
    return n === 0 ? 'Heute' : n === -1 ? 'Gestern' : n > -7 ? new Date(iso).toLocaleDateString('de-DE', { weekday: 'long' }) : PL.fmtDate(d);
  };
  const periodLabel = (x) => {
    const r = PL.untis && PL.untis.periodRange(x.start, x.end || x.start, st().settings.periods);
    return r ? (r.from === r.to ? `${r.from}. Std.` : `${r.from}.–${r.to}. Std.`) : x.start || '';
  };
  const whenDay = (iso) => { const n = PL.daysUntil(iso); return n >= 0 && n <= 1 ? PL.relDays(n) : new Date(PL.parseDate(iso)).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }); };

  function texts(x) {
    const sub = subName(x);
    switch (x.kind) {
      case 'file': return { title: `${x.files.length === 1 ? 'Neue Datei' : x.files.length + ' neue Dateien'}${sub ? ' in ' + sub : ''}`, sub: [x.files.map((f) => f.name).join(', '), x.due && 'bis ' + whenDay(x.due)].filter(Boolean).join(' · ') };
      case 'hw': return { title: `Hausaufgabe${sub ? ' in ' + sub : ''}`, sub: [short(x.text, 90), x.due && 'bis ' + whenDay(x.due)].filter(Boolean).join(' · ') };
      case 'msg': return { title: x.title, sub: [x.sender, short(x.text, 90)].filter(Boolean).join(' · ') };
      case 'news': return { title: x.title, sub: short(x.text, 110) };
      case 'exam': return { title: `${x.movedFrom ? 'Klausur verschoben' : (/test/i.test(x.type) ? 'Test' : 'Klausur')}${sub ? ' in ' + sub : ''}`, sub: [whenDay(x.date), x.start && periodLabel(x), x.movedFrom && 'vorher ' + PL.fmtDate(x.movedFrom), x.title].filter(Boolean).join(' · ') };
      case 'change': {
        const what = { cancel: 'fällt aus', room: `in Raum ${x.room}`, eva: 'EVA', teacher: `Vertretung ${x.teacher}` }[x.what] || 'geändert';
        return { title: `${sub || 'Stunde'} ${what}`, sub: [whenDay(x.date), periodLabel(x), x.what === 'room' && x.origRoom && 'statt ' + x.origRoom, x.info].filter(Boolean).join(' · ') };
      }
      case 'share': return { title: x.title, sub: `von ${x.sender}${x.subject ? ' · ' + x.subject : ''}` };
      default: return { title: x.title || '', sub: '' };
    }
  }

  function rowHtml(x) {
    const k = KIND[x.kind] || KIND.news;
    const t = texts(x);
    const c = (x.kind === 'hw' && subColor(x)) || k.color;
    const files = x.files && x.files.length && x.kind !== 'file' ? `<span class="feed-clip">${ic('paperclip', 'i-sm')}${x.files.length}</span>` : x.hasFiles ? `<span class="feed-clip">${ic('paperclip', 'i-sm')}</span>` : '';
    const unread = !store.read[x.id];
    const cls = x.kind === 'change' ? ` ch-${x.what}` : '';
    return `<button class="row row-click feed-row ${unread ? 'unread' : ''}${cls}" data-action="feed-open" data-id="${esc(x.id)}">
      <span class="feed-ic" style="--c:${c}">${ic(k.icon)}</span>
      <span class="row-main"><span class="row-title" style="display:block">${esc(t.title)}</span>
      <span class="row-sub" style="display:block">${esc(t.sub)}</span></span>
      ${files}<span class="feed-time">${hhmm(x.at)}</span>${unread ? '<i class="feed-dot" aria-label="neu"></i>' : ''}
    </button>`;
  }

  function listHtml(items) {
    let html = '', day = '';
    items.forEach((x) => {
      const d = dayLabel(x.at);
      if (d !== day) {
        if (day) html += '</div></section>';
        html += `<div class="sec-title">${esc(d)}</div><section class="card" style="padding:6px 10px;margin-bottom:14px"><div class="list">`;
        day = d;
      }
      html += rowHtml(x);
    });
    return html ? html + '</div></section>' : '';
  }

  PL.views.feed = function () {
    const f = PL.ui.feedFilter;
    const all = FD.list();
    const items = all.filter((x) => inFilter(x, f));
    const unread = all.filter((x) => !store.read[x.id]).length;
    const U = PL.untis;
    const connected = U && U.connected();
    const chips = FILTERS.map(([v, l]) => {
      const n = all.filter((x) => inFilter(x, v) && !store.read[x.id]).length;
      return `<button class="chip ${f === v ? 'on' : ''}" data-action="feed-filter" data-v="${v}">${l}${n ? ` <b class="chip-n">${n}</b>` : ''}</button>`;
    }).join('');
    const err = FD.errors();
    const notes = [];
    if (connected && err.messages) notes.push('Mitteilungen aus Untis lassen sich gerade nicht abrufen – vielleicht gibt deine Schule sie nicht frei.');
    const empty = !connected
      ? `<div class="empty"><b>Verbinde Untis</b>Dann landen neue Dateien, Hausaufgaben, Mitteilungen, Klausuren und Ausfälle automatisch hier.<br><button class="btn btn-primary btn-sm" data-action="untis-connect">${ic('download', 'i-sm')} Mit Untis verbinden</button></div>`
      : `<div class="empty"><b>${f === 'all' ? 'Noch nichts Neues' : 'Hier ist nichts'}</b>${f === 'all' ? 'Sobald in Untis etwas dazukommt, steht es hier.' : 'Probier einen anderen Filter.'}</div>`;
    const when = U && U.lastFetch && U.lastFetch();
    return `<div class="page view">
      <header class="page-head"><div><div class="eyebrow">${unread ? `${unread} neu` : 'Alles gelesen'}${when ? ` · Stand ${esc(when)}` : ''}</div><h1 class="page-title">Neuigkeiten</h1></div>
        <div class="head-actions">
          ${connected ? `<button class="icon-btn" data-action="feed-refresh" aria-label="Aktualisieren" title="Aktualisieren">${ic('refresh')}</button>` : ''}
          ${unread ? `<button class="btn btn-sm" data-action="feed-read-all">${ic('check', 'i-sm')} <span class="hide-mobile">Alle gelesen</span></button>` : ''}
        </div></header>
      <div style="max-width:760px">
        <div class="chips feed-chips" style="margin-bottom:16px">${chips}</div>
        ${listHtml(items) || empty}
        ${notes.map((n) => `<p class="hint" style="margin:10px 4px">${ic('info', 'i-sm')} ${esc(n)}</p>`).join('')}
      </div>
    </div>`;
  };

  /* Karte auf der Übersicht */
  PL.feedCard = function () {
    const all = FD.list();
    if (!all.length) return '';
    const unread = all.filter((x) => !store.read[x.id]);
    const show = (unread.length ? unread : all).slice(0, 4);
    return `<section class="card span-2">
      <div class="card-head"><div><h2 class="card-title">${ic('bell')} Neuigkeiten</h2><div class="card-sub">${unread.length ? `${unread.length} neu` : 'Alles gelesen'}</div></div>
        <a class="link-btn" href="#/neu">Alle ${ic('chevron-right', 'i-sm')}</a></div>
      <div class="list">${show.map(rowHtml).join('')}</div>
    </section>`;
  };

  PL.feedBell = function () {
    const n = FD.unread();
    return `<a class="icon-btn" href="#/neu" aria-label="Neuigkeiten${n ? ` (${n} neu)` : ''}" title="Neuigkeiten">${ic('bell')}${n ? `<i class="bell-badge">${n > 99 ? '99+' : n}</i>` : ''}</a>`;
  };

  /* ---------- Öffnen ---------- */
  const linkify = (t) => esc(t).replace(/\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const attKey = (a) => [a.kind, a.id || a.url, a.name].join('|');
  const blobs = new Map();
  async function fileBlob(a) {
    const k = attKey(a);
    if (blobs.has(k)) return blobs.get(k);
    const b = await PL.untis.file(a);
    blobs.set(k, b);
    return b;
  }
  const baseName = (n) => String(n || 'Datei').replace(/\.[a-z0-9]{1,10}$/i, '');

  function filesHtml(files) {
    if (!files || !files.length) return '';
    return `<div class="field"><span class="field-label">${files.length === 1 ? 'Datei' : files.length + ' Dateien'}</span>
      <div class="list feed-files">${files.map((a, i) => {
        const t = PL.fileType('', a.name);
        const saved = store.saved[attKey(a)] && PL.files.note(store.saved[attKey(a)]);
        return `<div class="row feed-file">
          <span class="note-tile" style="--c:${t.color}">${ic(t.icon)}<b>${esc(t.label)}</b></span>
          <span class="row-main"><span class="row-title" style="display:block">${esc(a.name)}</span><span class="row-sub" style="display:block" data-fmsg="${i}">${saved ? 'Bei deinen Dateien gespeichert' : esc(t.name)}</span></span>
          <span class="feed-file-btns">
            <button type="button" class="btn btn-sm" data-fopen="${i}" title="Öffnen">${ic('eye', 'i-sm')}<span class="hide-mobile">Öffnen</span></button>
            ${saved ? `<button type="button" class="btn btn-sm" data-fnote="${esc(saved.id)}" title="Datei öffnen">${ic('file', 'i-sm')}</button>`
              : `<button type="button" class="btn btn-sm btn-primary" data-fsave="${i}" title="Bei Dateien speichern">${ic('download', 'i-sm')}<span class="hide-mobile">Bei Dateien</span></button>`}
          </span></div>`;
      }).join('')}</div></div>`;
  }

  function mountFiles(sh, files, subjectId, reopen) {
    sh.querySelectorAll('[data-fopen]').forEach((b) => {
      b.onclick = async () => {
        const a = files[Number(b.dataset.fopen)];
        const kind = PL.fileKind(PL.guessMime(a.name), a.name);
        const win = PL.files.prepWindow(PL.guessMime(a.name) || (kind === 'img' ? 'image/jpeg' : 'application/pdf'));
        const old = b.innerHTML; b.disabled = true; b.textContent = 'Lädt …';
        try { PL.files.show(await fileBlob(a), a.name, win); }
        catch (e) { if (win) win.close(); say(sh, b.dataset.fopen, e.message); }
        finally { b.disabled = false; b.innerHTML = old; }
      };
    });
    sh.querySelectorAll('[data-fsave]').forEach((b) => {
      b.onclick = async () => {
        const a = files[Number(b.dataset.fsave)];
        const old = b.innerHTML; b.disabled = true; b.textContent = 'Speichert …';
        try {
          const blob = await fileBlob(a);
          const s = st().settings;
          const before = new Set(st().notes.map((n) => n.id));
          const r = await PL.files.add([new File([blob], a.name, { type: blob.type })], {
            mode: PL.files.canUpload() ? (s.noteMode || 'both') : 'local', subjectId: subjectId || null,
            compress: s.compressPhotos !== false, title: baseName(a.name),
          });
          const note = st().notes.find((n) => !before.has(n.id));
          if (!r.ok || !note) throw new Error(r.warnings[0] || 'Speichern hat nicht geklappt.');
          store.saved[attKey(a)] = note.id; persist();
          PL.toast(`„${baseName(a.name)}“ bei den Dateien gespeichert`);
          reopen();
        } catch (e) { say(sh, b.dataset.fsave, e.message); b.disabled = false; b.innerHTML = old; }
      };
    });
    sh.querySelectorAll('[data-fnote]').forEach((b) => { b.onclick = () => PL.noteSheet(b.dataset.fnote); });
  }
  function say(sh, i, msg) {
    const el = sh.querySelector(`[data-fmsg="${i}"]`);
    if (el) { el.textContent = msg; el.style.color = 'var(--danger)'; el.style.whiteSpace = 'normal'; }
  }

  const meta = (pairs) => `<div class="feed-meta">${pairs.filter((p) => p[1]).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`;

  FD.open = function (id) {
    const x = FD.item(id);
    if (!x) return;
    FD.markRead(id);
    if (PL.render) PL.render();
    if (x.kind === 'share') { PL.sharedSheet(x.key); return; }
    if (x.kind === 'change') { changeSheet(x); return; }
    if (x.kind === 'exam') {
      const ev = st().events.find((e) => e.untisId === x.untisId);
      if (ev) { PL.eventSheet(ev.id); return; }
    }
    if (x.kind === 'msg') { messageSheet(x); return; }
    const t = texts(x);
    const sub = subName(x);
    const task = x.untisId && st().tasks.find((k) => k.untisId === x.untisId);
    const reopen = () => FD.open(id);
    let body = '';
    if (x.kind === 'hw' || x.kind === 'file') {
      body = `${x.text ? `<div class="feed-text">${linkify(x.text)}</div>` : ''}
        ${x.remark ? `<div class="feed-text muted">${linkify(x.remark)}</div>` : ''}
        ${meta([['Fach', sub], ['Aufgegeben', x.date && PL.fmtDate(x.date)], ['Fällig', x.due && `${PL.fmtDate(x.due)} (${PL.relDays(PL.daysUntil(x.due))})`], ['Lehrkraft', x.teacher]])}
        ${filesHtml(x.files)}
        ${x.files && x.files.length ? `<p class="hint" style="margin:4px 0 0">${ic('info', 'i-sm')} „Bei Dateien“ legt die Datei bei deinen Dateien${sub ? ' in ' + esc(sub) : ''} ab.</p>` : ''}`;
    } else if (x.kind === 'news') {
      body = `<div class="feed-text">${linkify(x.text)}</div>${filesHtml(x.files)}`;
    } else if (x.kind === 'exam') {
      body = `${meta([['Fach', sub], ['Datum', PL.fmtDate(x.date)], ['Zeit', x.start && `${periodLabel(x)} · ${x.start}–${x.end}`], ['Raum', (x.rooms || []).join(', ')], ['Vorher', x.movedFrom && PL.fmtDate(x.movedFrom)]])}
        ${x.title ? `<div class="feed-text">${esc(x.title)}</div>` : ''}
        <p class="hint">${st().settings.untisExams === false ? 'Klausuren aus Untis werden nicht automatisch als Termin übernommen (Einstellungen → Stundenplan).' : 'Diese Klausur ist (noch) nicht bei deinen Terminen – vielleicht hast du sie gelöscht oder das Fach ist nicht zugeordnet.'}</p>`;
    }
    PL.openSheet(`${PL.sheetHead(esc(t.title), esc((KIND[x.kind] || {}).label || '') + ' · ' + esc(dayLabel(x.at)))}
      ${body}
      <div class="sheet-foot" style="margin-top:14px">
        ${task ? `<button type="button" class="btn" data-task>${ic('tasks', 'i-sm')} Zur Aufgabe</button>` : ''}
        <button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button>
      </div>`, {
      onMount(sh) {
        mountFiles(sh, x.files || [], x.subjectId, reopen);
        const tb = sh.querySelector('[data-task]');
        if (tb) tb.onclick = () => PL.taskSheet({ id: task.id });
      },
    });
  };

  function changeSheet(x) {
    const t = texts(x);
    PL.openSheet(`${PL.sheetHead(esc(t.title), esc(PL.fmtDate(x.date)))}
      ${meta([['Stunde', `${periodLabel(x)} · ${x.start}–${x.end}`], ['Raum', x.room && (x.origRoom && x.origRoom !== x.room ? `${x.room} (statt ${x.origRoom})` : x.room)], ['Lehrkraft', x.teacher], ['Hinweis', x.info]])}
      <div class="sheet-foot" style="margin-top:14px">
        <button type="button" class="btn" data-cal>${ic('calendar', 'i-sm')} Im Kalender</button>
        <button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button>
      </div>`, {
      onMount(sh) {
        sh.querySelector('[data-cal]').onclick = () => {
          const mon = PL.mondayOf(PL.parseDate(x.date)), cur = PL.mondayOf(new Date());
          PL.ui.planMode = 'week';
          PL.ui.planWeek = Math.round((mon - cur) / (7 * 864e5));
          PL.closeSheet();
          location.hash = '#/plan';
        };
      },
    });
  }

  const details = new Map();
  function messageSheet(x) {
    const d = details.get(x.msgId);
    const head = PL.sheetHead(esc(x.title), esc([x.sender, new Date(x.at).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')));
    const foot = `<div class="sheet-foot" style="margin-top:14px"><button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button></div>`;
    if (!d) {
      PL.openSheet(`${head}<div class="feed-text">${linkify(x.text)}</div><div class="hint" data-load>${navigator.onLine === false ? 'Offline – die ganze Mitteilung lädt, sobald du online bist.' : 'Ganze Mitteilung wird geladen …'}</div>${foot}`);
      if (navigator.onLine === false) return;
      PL.untis.message(x.msgId).then((m) => {
        details.set(x.msgId, m);
        const sheet = document.getElementById('sheet');
        if (!document.getElementById('sheetLayer').hidden && sheet.querySelector('[data-load]')) messageSheet(x);
      }).catch((e) => {
        const el = document.querySelector('#sheet [data-load]');
        if (el) { el.textContent = e.message; el.style.color = 'var(--danger)'; }
      });
      return;
    }
    const files = (d.files || []).map((f) => Object.assign({ kind: 'msg' }, f));
    PL.openSheet(`${head}<div class="feed-text">${linkify(d.content || x.text)}</div>${filesHtml(files)}${foot}`, {
      onMount(sh) { mountFiles(sh, files, null, () => messageSheet(x)); },
    });
  }

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'feed-open': (d) => FD.open(d.id),
    'feed-filter': (d) => { PL.ui.feedFilter = d.v; PL.render(); },
    'feed-read-all': () => { FD.markAll(); PL.render(); PL.toast('Alles als gelesen markiert'); },
    'feed-refresh': (d, el) => {
      if (!PL.untis || !PL.untis.connected()) return;
      el.disabled = true; el.classList.add('spin');
      PL.untis.refresh({ force: true }).then(() => PL.toast(PL.untis.error ? PL.untis.error : 'Aktualisiert'));
    },
  });
})();
