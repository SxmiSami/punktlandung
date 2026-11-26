/* Lernzettel – Ansichten und Dialoge */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;
  const F = PL.files;
  Object.assign(PL.ui, { notesTab: 'mine' });

  const typeOfNote = (n) => PL.fileType(n.mime, n.ext ? 'x.' + n.ext : n.title);
  const typeOfShare = (s) => PL.fileType(s.mime, s.title);
  const dateOf = (iso) => (iso ? PL.fmtDate(String(iso).slice(0, 10)) : '');

  function tile(t) {
    return `<span class="note-tile" style="--c:${t.color}" title="${esc(t.name)}">${ic(t.icon)}<b>${esc(t.label)}</b></span>`;
  }

  /* Wo liegt der Zettel? Kleine Symbole rechts in der Zeile */
  function where(note) {
    const here = F.isHere(note.id);
    const others = note.devices.filter((d) => d !== F.device.id).length;
    const shares = F.sharesOf(note).length;
    return `<span class="note-where">
      <span class="nw ${note.cloud ? 'on' : ''}" title="${note.cloud ? 'In der Cloud' : 'Nicht in der Cloud'}">${ic('cloud', 'i-sm')}</span>
      <span class="nw ${here ? 'on' : ''}" title="${here ? 'Auf diesem Gerät' : 'Nicht auf diesem Gerät'}">${ic('device', 'i-sm')}${others ? `<small>+${others}</small>` : ''}</span>
      ${shares ? `<span class="nw on share" title="Mit ${shares} geteilt">${ic('users', 'i-sm')}<small>${shares}</small></span>` : ''}
    </span>`;
  }

  function noteRow(note, opts = {}) {
    const sub = PL.subject(note.subjectId);
    const kind = PL.fileKind(note.mime, note.title);
    const lost = !note.cloud && !note.devices.length && !F.isHere(note.id);
    return `<button class="row row-click note-row" data-action="open-note" data-id="${note.id}">
      ${tile(typeOfNote(note))}
      <span class="row-main"><span class="row-title" style="display:block">${esc(note.title)}</span>
      <span class="row-sub" style="display:block">${!opts.noSubject && sub ? esc(sub.short) + ' · ' : ''}${typeOfNote(note).name} · ${PL.fmtBytes(note.size)} · ${dateOf(note.created)}${lost ? ' · <b style="color:var(--danger)">nirgends gespeichert</b>' : ''}</span></span>
      ${where(note)}
    </button>`;
  }

  function sharedRow(item) {
    const s = item.share;
    const kind = PL.fileKind(s.mime, s.title);
    const from = s.owner_name || s.owner_email || 'Freund';
    return `<button class="row row-click note-row" data-action="open-shared" data-key="${esc(item.key)}">
      ${tile(typeOfShare(s))}
      <span class="row-main"><span class="row-title" style="display:block">${esc(s.title || 'Lernzettel')}</span>
      <span class="row-sub" style="display:block">von ${esc(from)}${s.subject_short ? ' · ' + esc(s.subject_short) : ''} · ${PL.fmtBytes(s.size)}${item.gone ? ' · nicht mehr geteilt' : ''}</span></span>
      <span class="note-where"><span class="nw on share">${ic('users', 'i-sm')}</span><span class="nw ${item.here ? 'on' : ''}">${ic('device', 'i-sm')}</span></span>
    </button>`;
  }

  /* ---------- Speicheranzeige (kompakt: Wolke mit Prozent, Details per Tippen) ---------- */
  const pctOf = (used, max) => (max ? Math.min(100, (used / max) * 100) : 0);
  const fmtPct = (p) => (p > 0 && p < 1 ? '< 1 %' : Math.round(p) + ' %');
  const lvlOf = (p) => (p >= 95 ? 'full' : p >= 80 ? 'warn' : '');

  /* Was zeigt die Wolke? */
  function storageState() {
    const S = PL.sync;
    if (!S.enabled || !S.user) return { kind: 'local' };
    if (F.remoteError === 'setup') return { kind: 'setup' };
    return { kind: 'cloud', pct: pctOf(F.usedMine(), F.quota) };
  }

  PL.storagePill = function () {
    F.refreshRemote();
    const s = storageState();
    const body = s.kind === 'cloud'
      ? `${ic('cloud', 'i-sm')}<b class="num">${fmtPct(s.pct)}</b><span class="pill-bar"><i style="width:${Math.max(4, s.pct)}%"></i></span>`
      : s.kind === 'setup' ? `${ic('cloud', 'i-sm')}<b>!</b>`
      : `${ic('device', 'i-sm')}<b>Lokal</b>`;
    return `<button class="store-pill ${s.kind === 'cloud' ? lvlOf(s.pct) : s.kind === 'setup' ? 'warn' : ''}" data-action="storage-info" title="Speicher anzeigen" aria-label="Speicher anzeigen">${body}</button>`;
  };

  function meter(pct, label, sub) {
    return `<div class="meter ${lvlOf(pct)}">
      <div class="meter-top"><span class="t">${label}</span><span class="v num"><b>${fmtPct(pct)}</b></span></div>
      <div class="meter-bar"><i style="width:${pct}%"></i></div>
      ${sub ? `<div class="hint">${sub}</div>` : ''}
    </div>`;
  }
  function storageDetails() {
    const S = PL.sync;
    let cloud = '';
    if (!S.enabled) cloud = `<p class="hint" style="margin:0 0 12px">Ohne Online-Speicher liegen Zettel nur auf diesem Gerät.</p>`;
    else if (!S.user) cloud = `<p class="hint" style="margin:0 0 12px">Melde dich an, um Zettel in der Cloud zu speichern und mit Freunden zu teilen. <button class="link-btn" data-action="login">Anmelden</button></p>`;
    else if (F.remoteError === 'setup') cloud = `<div class="note-warn">${ic('alert', 'i-sm')}<div><b>Online-Speicher noch nicht eingerichtet.</b> Einmal <code>supabase/lernzettel.sql</code> in Supabase ausführen. Bis dahin werden Zettel nur auf dem Gerät gespeichert.</div></div>`;
    else {
      cloud = meter(pctOf(F.usedMine(), F.quota), `${ic('cloud', 'i-sm')} Deine Cloud`, `${PL.fmtBytes(F.usedMine())} von ${F.cfg.quotaMB} MB · max. ${F.cfg.maxFileMB} MB pro Datei`)
        + (F.usage.total != null ? meter(pctOf(F.usage.total, F.total), `${ic('users', 'i-sm')} Alle zusammen`, `${PL.fmtBytes(F.usage.total)} von 1 GB · wird mit deinen Freunden geteilt`) : '');
    }
    const est = F.estimate;
    const localN = Array.from(F.local.values()).filter((m) => (m.user || null) === (S.user ? S.user.id : null)).length;
    const local = F.unavailable
      ? `<p class="hint">Dieser Browser erlaubt keinen lokalen Speicher (privates Fenster?).</p>`
      : meter(est && est.quota ? pctOf(F.localBytes(), est.quota) : 0, `${ic('device', 'i-sm')} ${esc(F.device.name)} · dieses Gerät`, `${localN} Zettel · ${PL.fmtBytes(F.localBytes())} · zählt nicht zur Cloud, geht auch offline`);
    return cloud + local + `<p class="hint" style="margin:10px 0 0;display:flex;gap:12px;flex-wrap:wrap"><span>${ic('cloud', 'i-sm')} Cloud</span><span>${ic('device', 'i-sm')} Dieses Gerät (+ weitere)</span><span>${ic('users', 'i-sm')} Geteilt</span></p>`;
  }
  PL.storageSheet = function () {
    F.refreshRemote(true).then(() => { const box = document.querySelector('#sheet [data-storage]'); if (box) box.innerHTML = storageDetails(); });
    PL.openSheet(`${PL.sheetHead('Speicher', 'Lernzettel online und auf deinen Geräten')}
      <div data-storage>${storageDetails()}</div>
      <div class="sheet-foot" style="margin-top:14px"><button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button></div>`);
  };
  /* Kurzfassung für die Einstellungen */
  PL.notesStorageRow = function () {
    const s = storageState();
    const d = s.kind === 'cloud' ? `${fmtPct(s.pct)} deiner Cloud belegt · ${st().notes.length} Zettel`
      : s.kind === 'setup' ? 'Online-Speicher noch nicht eingerichtet' : `Nur auf diesem Gerät · ${st().notes.length} Zettel`;
    return `<section class="card"><div class="opt-row" style="padding:0"><div><div class="t">${ic('file', 'i-sm')} Lernzettel</div><div class="d">${d}</div></div>
      <div style="display:flex;gap:8px;align-items:center"><button class="btn btn-sm" data-action="storage-info">Details</button><a class="btn btn-sm" href="#/lernzettel">Öffnen</a></div></div></section>`;
  };

  function orphanCards() {
    let h = '';
    const lo = F.localOrphans();
    if (lo.length) h += `<div class="note-warn">${ic('info', 'i-sm')}<div style="flex:1"><b>${lo.length} Zettel auf diesem Gerät ohne Eintrag</b> (${PL.fmtBytes(lo.reduce((n, m) => n + (m.size || 0), 0))}) – z. B. nach dem Laden anderer Daten.</div><button class="btn btn-sm" data-action="notes-restore-local">Wiederherstellen</button></div>`;
    const co = F.cloudOrphans;
    if (co.length) h += `<div class="note-warn">${ic('info', 'i-sm')}<div style="flex:1"><b>${co.length} Datei${co.length === 1 ? '' : 'en'} in deiner Cloud ohne Eintrag</b> (${PL.fmtBytes(co.reduce((n, o) => n + ((o.metadata || {}).size || 0), 0))}). Sie belegen Platz.</div><button class="btn btn-sm" data-action="notes-restore-cloud">Wiederherstellen</button><button class="btn btn-sm btn-ghost" data-action="notes-delete-cloud">Löschen</button></div>`;
    return h;
  }

  /* ---------- Seite „Lernzettel“ ---------- */
  PL.views.notes = function () {
    const tab = PL.ui.notesTab;
    const notes = st().notes.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const shared = F.sharedList();
    const segBtn = (v, l, n) => `<button class="${tab === v ? 'on' : ''}" data-action="notes-tab" data-v="${v}">${l}${n ? ` <span class="muted">${n}</span>` : ''}</button>`;
    let body;
    if (tab === 'shared') {
      body = shared.length ? `<section class="card" style="padding:8px 10px"><div class="list">${shared.map(sharedRow).join('')}</div></section>`
        : `<div class="empty"><b>Noch nichts geteilt</b>Wenn Freunde dir einen Zettel schicken, taucht er hier auf.</div>`;
    } else {
      const groups = [];
      PL.sortedSubjects().forEach((sub) => {
        const items = notes.filter((n) => n.subjectId === sub.id);
        if (items.length) groups.push({ sub, items });
      });
      const rest = notes.filter((n) => !PL.subject(n.subjectId));
      if (rest.length) groups.push({ sub: null, items: rest });
      body = groups.length ? groups.map((g) => `
        <div class="sec-title">${g.sub ? `<span style="display:flex;align-items:center;gap:8px"><span class="dot-c" style="--c:${g.sub.color}"></span>${esc(g.sub.name)}</span>` : 'Ohne Fach'}<span>${g.items.length}</span></div>
        <section class="card" style="padding:8px 10px;margin-bottom:16px"><div class="list">${g.items.map((n) => noteRow(n, { noSubject: true })).join('')}</div></section>`).join('')
        : `<div class="empty"><b>Noch keine Lernzettel</b>Lade Fotos oder PDFs hoch – sortiert nach Fach, auf Wunsch online auf allen Geräten.<br><button class="btn btn-primary btn-sm" data-action="add-note">${ic('upload', 'i-sm')} Zettel hochladen</button></div>`;
    }
    return `<div class="page view">
      <header class="page-head"><div><div class="eyebrow">${notes.length} Zettel${shared.length ? ` · ${shared.length} geteilt` : ''}</div><h1 class="page-title">Lernzettel</h1></div>
        <div class="head-actions">${PL.storagePill()}<button class="btn btn-primary hide-mobile" data-action="add-note">${ic('upload', 'i-sm')} Hochladen</button></div></header>
      ${orphanCards()}
      ${PL.sync.user ? `<div class="seg" style="margin-bottom:16px">${segBtn('mine', 'Meine', notes.length)}${segBtn('shared', 'Mit mir geteilt', shared.length)}</div>` : ''}
      <div style="max-width:760px">${body}</div>
    </div>`;
  };

  /* ---------- Karte im Fach ---------- */
  PL.subjectNotesCard = function (sub) {
    const own = st().notes.filter((n) => n.subjectId === sub.id).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const nm = sub.name.trim().toLowerCase();
    const shared = F.sharedList().filter((x) => (x.share.subject || '').trim().toLowerCase() === nm);
    const rows = own.map((n) => noteRow(n, { noSubject: true })).join('') + shared.map(sharedRow).join('');
    return `<section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2 class="card-title" style="font-size:16px">${ic('file')} Lernzettel</h2>${shared.length ? `<div class="card-sub">${shared.length} von Freunden</div>` : ''}</div>
        <button class="btn btn-sm" data-action="add-note" data-subject="${sub.id}">${ic('upload', 'i-sm')} Zettel</button></div>
      ${rows ? `<div class="list">${rows}</div>` : `<div class="empty" style="padding:18px">Noch keine Lernzettel für ${esc(sub.name)}.</div>`}
    </section>`;
  };

  /* ---------- Hochladen ---------- */
  const segHtml = (opts, val) => opts.map(([v, l, dis]) => `<button type="button" class="${String(v) === String(val) ? 'on' : ''}" data-v="${v}" ${dis ? 'disabled' : ''}>${l}</button>`).join('');

  PL.addNotesSheet = function (opts = {}) {
    const subs = PL.sortedSubjects();
    const cloudOk = F.canCloud() && F.remoteError !== 'setup';
    const s = st().settings;
    const f = { files: [], subjectId: opts.subjectId || null, mode: cloudOk ? (s.noteMode || 'both') : 'local', compress: s.compressPhotos !== false };
    const modeOpts = [['both', `${ic('cloud', 'i-sm')} + ${ic('device', 'i-sm')} Beides`, !cloudOk], ['cloud', `${ic('cloud', 'i-sm')} Nur Cloud`, !cloudOk], ['local', `${ic('device', 'i-sm')} Nur hier`]];
    const html = `
      ${PL.sheetHead('Lernzettel hochladen', 'Fotos, PDFs oder andere Dateien')}
      <div class="drop" data-drop>
        <button type="button" class="btn" data-pick="camera">${ic('camera', 'i-sm')} Foto aufnehmen</button>
        <button type="button" class="btn" data-pick="files">${ic('upload', 'i-sm')} Dateien wählen</button>
        <span class="hint hide-touch">oder Dateien hierher ziehen</span>
        <input type="file" accept="image/*" capture="environment" data-in="camera" hidden>
        <input type="file" multiple data-in="files" hidden>
      </div>
      <div class="list picked" data-picked></div>
      <div class="field" data-title-field hidden><label for="nTitle">Titel</label><input id="nTitle" class="input" maxlength="80" placeholder="z. B. Analysis – Ableitungen"></div>
      <div class="field"><span class="field-label">Fach</span>
        <div class="chips" data-subjects>
          ${subs.map((x) => `<button type="button" class="chip chip-subj ${x.id === f.subjectId ? 'on' : ''}" style="--c:${x.color}" data-id="${x.id}"><span class="sw"></span>${esc(x.short)} · ${esc(x.name)}</button>`).join('')}
          <button type="button" class="chip ${!f.subjectId ? 'on' : ''}" data-id="">Ohne Fach</button>
        </div></div>
      <div class="field"><span class="field-label">Speichern</span>
        <div class="seg seg-block" data-seg="mode">${segHtml(modeOpts, f.mode)}</div>
        <span class="hint" data-mode-hint></span></div>
      <div class="opt-row" style="padding-top:4px"><div><div class="t">Fotos verkleinern</div><div class="d">Spart meist 80–90 % Platz, Text bleibt gut lesbar</div></div>
        <label class="switch"><input type="checkbox" data-compress ${f.compress ? 'checked' : ''}><span></span></label></div>
      <div class="auth-msg" data-msg hidden></div>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-save disabled>${ic('upload', 'i-sm')} Hochladen</button></div>`;
    PL.openSheet(html, {
      onMount(sh) {
        const picked = sh.querySelector('[data-picked]');
        const save = sh.querySelector('[data-save]');
        const titleField = sh.querySelector('[data-title-field]');
        const modeHint = sh.querySelector('[data-mode-hint]');
        const msg = sh.querySelector('[data-msg]');
        const hintFor = () => {
          if (!F.canCloud()) return PL.sync.enabled ? 'Ohne Anmeldung nur auf diesem Gerät. Melde dich an für Cloud und Teilen.' : 'Nur auf diesem Gerät.';
          if (F.remoteError === 'setup') return 'Der Online-Speicher ist noch nicht eingerichtet – nur auf diesem Gerät.';
          return f.mode === 'local' ? 'Nur auf diesem Gerät – zählt nicht zu deinen Cloud-MB.'
            : `Cloud: noch ${PL.fmtBytes(F.freeMine())} von ${F.cfg.quotaMB} MB frei.` + (f.mode === 'cloud' ? ' Auf anderen Geräten kannst du ihn jederzeit lokal speichern.' : '');
        };
        const draw = () => {
          picked.innerHTML = f.files.map((file, i) => `<div class="row" style="padding:8px 4px">${tile(PL.fileType(file.type, file.name))}
            <span class="row-main"><span class="row-title" style="display:block">${esc(file.name)}</span><span class="row-sub" style="display:block">${PL.fmtBytes(file.size)}${file.size > F.maxFile && f.mode !== 'local' ? ' · <b style="color:var(--warn)">zu groß für die Cloud</b>' : ''}</span></span>
            <button type="button" class="icon-btn" data-rm="${i}" aria-label="Entfernen">${ic('x', 'i-sm')}</button></div>`).join('');
          titleField.hidden = f.files.length !== 1;
          if (f.files.length === 1 && !sh.querySelector('#nTitle').value) sh.querySelector('#nTitle').value = f.files[0].name.replace(/\.[a-z0-9]{1,10}$/i, '');
          save.disabled = !f.files.length;
          save.innerHTML = `${ic('upload', 'i-sm')} ${f.files.length > 1 ? f.files.length + ' Zettel hochladen' : 'Hochladen'}`;
          modeHint.textContent = hintFor();
        };
        const addFiles = (list) => { Array.from(list || []).forEach((x) => f.files.push(x)); draw(); };
        sh.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => sh.querySelector(`[data-in="${b.dataset.pick}"]`).click(); });
        sh.querySelectorAll('input[type=file]').forEach((inp) => { inp.onchange = () => { addFiles(inp.files); inp.value = ''; }; });
        const drop = sh.querySelector('[data-drop]');
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
        picked.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; f.files.splice(Number(b.dataset.rm), 1); draw(); });
        sh.querySelector('[data-subjects]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-id]'); if (!b) return;
          f.subjectId = b.dataset.id || null;
          sh.querySelectorAll('[data-subjects] .chip').forEach((x) => x.classList.toggle('on', x === b));
        });
        const sel = sh.querySelector('[data-subjects] .on');
        if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
        sh.querySelector('[data-seg="mode"]').addEventListener('click', (e) => {
          const b = e.target.closest('button[data-v]'); if (!b || b.disabled) return;
          f.mode = b.dataset.v;
          sh.querySelectorAll('[data-seg="mode"] button').forEach((x) => x.classList.toggle('on', x === b));
          draw();
        });
        sh.querySelector('[data-compress]').onchange = (e) => { f.compress = e.target.checked; };
        draw();
        save.onclick = async () => {
          if (!f.files.length) return;
          save.disabled = true; msg.hidden = true;
          sh.querySelectorAll('button, input').forEach((x) => { if (x !== save && !x.closest('.sheet-head')) x.disabled = true; });
          if (cloudOk) st().settings.noteMode = f.mode;
          st().settings.compressPhotos = f.compress;
          try {
            const r = await F.add(f.files, { subjectId: f.subjectId, mode: f.mode, compress: f.compress, title: sh.querySelector('#nTitle').value.trim() },
              (i, n) => { save.textContent = n > 1 ? `Wird gespeichert … ${i} von ${n}` : 'Wird gespeichert …'; });
            if (r.warnings.length) {
              PL.infoSheet(r.ok ? `${r.ok} Zettel gespeichert` : 'Nicht gespeichert', r.warnings);
            } else {
              PL.closeSheet();
              PL.toast(r.ok === 1 ? 'Zettel gespeichert' : `${r.ok} Zettel gespeichert`);
            }
          } catch (e) {
            msg.hidden = false; msg.textContent = F.err(e);
            save.disabled = false; save.textContent = 'Nochmal versuchen';
            sh.querySelectorAll('button, input').forEach((x) => { x.disabled = false; });
          }
        };
      },
    });
  };

  PL.infoSheet = function (title, lines) {
    PL.openSheet(`${PL.sheetHead(esc(title))}
      <ul class="info-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">OK</button></div>`);
  };

  /* ---------- Vorschau ---------- */
  function previewHtml(kind, t) {
    return `<div class="note-preview" data-preview data-kind="${kind}">${kind === 'img' ? '<div class="hint">Vorschau wird geladen …</div>' : `${tile(t)}`}</div>`;
  }
  function loadPreview(sh, getBlob, title) {
    const box = sh.querySelector('[data-preview]');
    if (!box || box.dataset.kind !== 'img') return;
    getBlob().then((b) => {
      const url = URL.createObjectURL(b);
      box.innerHTML = `<img src="${url}" alt="${esc(title)}">`;
      box.querySelector('img').onclick = () => PL.imageViewer(url, title);
    }).catch((e) => { box.innerHTML = `<div class="hint">${esc(F.err(e))}</div>`; });
  }
  async function openWith(getBlob, mime, title, btn) {
    const win = F.prepWindow(mime);
    const old = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Lädt …'; }
    try { F.show(await getBlob(), title, win); }
    catch (e) { if (win) win.close(); PL.toast(F.err(e)); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
  }
  async function saveWith(getBlob, title, btn) {
    const old = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Lädt …'; }
    try { await F.save(await getBlob(), title); }
    catch (e) { PL.toast(F.err(e)); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
  }

  PL.imageViewer = function (url, title) {
    const v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = `<div class="viewer-bar"><span>${esc(title || '')}</span><button class="icon-btn" aria-label="Schließen">${ic('x')}</button></div>
      <div class="viewer-body"><img src="${url}" alt="${esc(title || '')}"></div>`;
    const close = () => { v.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    v.querySelector('.viewer-bar button').onclick = close;
    v.querySelector('.viewer-body').onclick = (e) => { if (e.target.tagName === 'IMG') v.classList.toggle('zoom'); else close(); };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(v);
  };

  /* ---------- Eigener Zettel ---------- */
  PL.noteSheet = function (id) {
    const note = F.note(id);
    if (!note) { PL.closeSheet(); return; }
    const sub = PL.subject(note.subjectId);
    const kind = PL.fileKind(note.mime, note.title);
    const here = F.isHere(note.id);
    const others = note.devices.filter((d) => d !== F.device.id);
    const cloudOk = F.canCloud() && F.remoteError !== 'setup';
    const shares = F.sharesOf(note);
    const reachable = here || note.cloud;
    const html = `
      ${PL.sheetHead(esc(note.title), `${sub ? esc(sub.name) + ' · ' : ''}${typeOfNote(note).name} · ${PL.fmtBytes(note.size)}${note.origSize ? ` (verkleinert von ${PL.fmtBytes(note.origSize)})` : ''}`)}
      ${previewHtml(kind, typeOfNote(note))}
      <div class="note-actions">
        <button type="button" class="btn" data-open ${reachable ? '' : 'disabled'}>${ic('eye', 'i-sm')} Öffnen</button>
        <button type="button" class="btn" data-dl ${reachable ? '' : 'disabled'}>${ic('download', 'i-sm')} Sichern</button>
        ${PL.sync.enabled ? `<button type="button" class="btn" data-share>${ic('users', 'i-sm')} Teilen${shares.length ? ` · ${shares.length}` : ''}</button>` : ''}
      </div>
      <div class="sec-title" style="margin-top:6px">Gespeichert</div>
      <div class="opt-row"><div><div class="t">${ic('cloud', 'i-sm')} In der Cloud</div><div class="d">${!F.canCloud() ? 'Melde dich an, um online zu speichern' : F.remoteError === 'setup' ? 'Online-Speicher noch nicht eingerichtet' : note.cloud ? `Auf allen Geräten abrufbar · zählt ${PL.fmtBytes(note.size)} von deinen ${F.cfg.quotaMB} MB` : `Noch ${PL.fmtBytes(F.freeMine())} frei`}</div></div>
        <label class="switch"><input type="checkbox" data-loc="cloud" ${note.cloud ? 'checked' : ''} ${cloudOk && (note.cloud || here) ? '' : 'disabled'}><span></span></label></div>
      <div class="opt-row"><div><div class="t">${ic('device', 'i-sm')} Auf diesem Gerät</div><div class="d">${esc(F.device.name)} · ${here ? 'auch offline verfügbar' : note.cloud ? 'aus der Cloud herunterladen' : 'nicht verfügbar'}</div></div>
        <label class="switch"><input type="checkbox" data-loc="here" ${here ? 'checked' : ''} ${here || note.cloud ? '' : 'disabled'}><span></span></label></div>
      ${others.length ? `<div class="opt-row"><div><div class="t">Auch lokal auf</div><div class="d">${others.map((d) => esc(F.deviceName(d))).join(', ')}</div></div></div>` : ''}
      <div class="auth-msg" data-msg hidden></div>
      <div class="sec-title" style="margin-top:10px">Details</div>
      <div class="field-row">
        <div class="field"><label for="ntTitle">Titel</label><input id="ntTitle" class="input" value="${esc(note.title)}" maxlength="80"></div>
        <div class="field"><label for="ntSub">Fach</label><select id="ntSub" class="select"><option value="">Ohne Fach</option>${PL.sortedSubjects().map((x) => `<option value="${x.id}" ${x.id === note.subjectId ? 'selected' : ''}>${esc(x.short)} · ${esc(x.name)}</option>`).join('')}</select></div>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn btn-danger" data-del style="flex:0 0 auto">${ic('trash', 'i-sm')}</button>
        <button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button>
      </div>`;
    PL.openSheet(html, {
      onMount(sh) {
        const getBlob = () => F.blob(note);
        loadPreview(sh, getBlob, note.title);
        sh.querySelector('[data-open]').onclick = (e) => openWith(getBlob, note.mime, note.title, e.currentTarget);
        sh.querySelector('[data-dl]').onclick = (e) => saveWith(getBlob, note.title, e.currentTarget);
        const shareBtn = sh.querySelector('[data-share]');
        if (shareBtn) shareBtn.onclick = () => PL.shareSheet(note.id);
        const msg = sh.querySelector('[data-msg]');
        const busy = (on, text) => {
          sh.querySelectorAll('[data-loc]').forEach((x) => { x.disabled = on || x.disabled; });
          msg.hidden = !text; msg.textContent = text || ''; msg.classList.add('ok');
        };
        const doIt = async (fn, text, done) => {
          busy(true, text);
          try { await fn(); PL.noteSheet(note.id); if (done) PL.toast(done); }
          catch (e) { PL.noteSheet(note.id); setTimeout(() => { const s2 = document.querySelector('#sheet [data-msg]'); if (s2) { s2.hidden = false; s2.classList.remove('ok'); s2.textContent = F.err(e); } }, 0); }
        };
        const askDelete = () => PL.confirmSheet('Zettel löschen?', `„${note.title}“ ist dann nirgends mehr gespeichert und wird endgültig gelöscht.`, 'Löschen', async () => {
          try { await F.remove(note); PL.toast('Zettel gelöscht'); } catch (e) { PL.toast(F.err(e)); }
        });
        sh.querySelectorAll('[data-loc]').forEach((inp) => {
          inp.onchange = () => {
            const on = inp.checked;
            inp.checked = !on;  // erst nach Erfolg umschalten
            if (inp.dataset.loc === 'here') {
              if (on) return doIt(() => F.setLocal(note, true), 'Wird heruntergeladen …', 'Auf diesem Gerät gespeichert');
              if (!note.cloud && !others.length) return askDelete();
              return doIt(() => F.setLocal(note, false), 'Wird entfernt …', 'Von diesem Gerät entfernt');
            }
            if (on) return doIt(() => F.setCloud(note, true), 'Wird hochgeladen …', 'In der Cloud gespeichert');
            const keep = here ? 'auf diesem Gerät' : others.length ? `auf ${others.map(F.deviceName).join(', ')}` : 'auf diesem Gerät (wird jetzt heruntergeladen)';
            const text = `Der Zettel wird aus der Cloud gelöscht und bleibt nur ${keep} gespeichert. Das macht ${PL.fmtBytes(note.size)} frei.` + (shares.length ? ` Die Freigabe für ${shares.length} Person${shares.length === 1 ? '' : 'en'} endet.` : '');
            PL.confirmSheet('Aus der Cloud nehmen?', text, 'Aus der Cloud nehmen', () => {
              PL.noteSheet(note.id);
              doIt(() => F.setCloud(note, false), 'Wird aus der Cloud genommen …', 'Nur noch lokal gespeichert');
            });
          };
        });
        sh.querySelector('#ntTitle').onchange = (e) => { const v = e.target.value.trim(); if (v && v !== note.title) { F.update(note, { title: v }); sh.querySelector('.sheet-title').textContent = v; } };
        sh.querySelector('#ntSub').onchange = (e) => F.update(note, { subjectId: e.target.value || null });
        sh.querySelector('[data-del]').onclick = () => PL.confirmSheet('Zettel löschen?', `„${note.title}“ wird ${note.cloud ? 'aus der Cloud und ' : ''}von diesem Gerät gelöscht${others.length ? ' – auf den anderen Geräten beim nächsten Abgleich' : ''}.${shares.length ? ' Deine Freunde sehen ihn dann auch nicht mehr.' : ''}`, 'Löschen', async () => {
          try { await F.remove(note); PL.toast('Zettel gelöscht'); } catch (e) { PL.toast(F.err(e)); }
        });
      },
    });
  };

  /* ---------- Teilen ---------- */
  PL.shareSheet = function (id) {
    const note = F.note(id);
    if (!note) return;
    const S = PL.sync;
    let body;
    if (!S.user) {
      body = `<p style="margin:0 0 16px;color:var(--text-2)">Zum Teilen brauchst du ein Konto. Deine Freunde brauchen auch eins.</p>
        <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="login">Anmelden</button></div>`;
    } else if (!note.cloud) {
      body = `<p style="margin:0 0 16px;color:var(--text-2)">Geteilte Zettel laden deine Freunde aus der Cloud. Dafür muss der Zettel dort gespeichert sein (${PL.fmtBytes(note.size)}, noch ${PL.fmtBytes(F.freeMine())} frei).</p>
        <div class="auth-msg" data-msg hidden></div>
        <div class="sheet-foot"><button type="button" class="btn" data-back>Zurück</button><button type="button" class="btn btn-primary" data-up ${F.isHere(note.id) ? '' : 'disabled'}>${ic('cloud', 'i-sm')} In die Cloud laden</button></div>`;
    } else {
      const shares = F.sharesOf(note);
      const friends = F.friends().filter((e) => !shares.some((s) => (s.recipient_email || '').toLowerCase() === e.toLowerCase()));
      body = `
        ${shares.length ? `<div class="sec-title">Geteilt mit</div><div class="list" style="margin-bottom:14px">${shares.map((s) => `
          <div class="row" style="padding:8px 4px"><span class="avatar">${esc((s.recipient_email || '?').charAt(0).toUpperCase())}</span>
          <span class="row-main"><span class="row-title" style="display:block">${esc(s.recipient_email)}</span><span class="row-sub" style="display:block">seit ${dateOf(s.created_at)}</span></span>
          <button type="button" class="btn btn-sm btn-ghost" data-unshare="${s.id}">Beenden</button></div>`).join('')}</div>` : ''}
        <form data-form class="field"><label for="shEmail">E-Mail deines Freundes</label>
          <div style="display:flex;gap:8px"><input id="shEmail" class="input" type="email" inputmode="email" autocomplete="off" placeholder="name@beispiel.de" style="flex:1" autofocus>
          <button type="submit" class="btn btn-primary" data-go>Teilen</button></div></form>
        ${friends.length ? `<div class="chips" style="margin:-6px 0 14px;flex-wrap:wrap">${friends.map((e) => `<button type="button" class="chip" data-friend="${esc(e)}">${ic('plus', 'i-sm')} ${esc(e)}</button>`).join('')}</div>` : ''}
        <div class="auth-msg" data-msg hidden></div>
        <p class="hint" style="margin:0 0 14px">Deine Freunde brauchen ein Konto in Punktlandung. Geteilte Zettel zählen nur bei dir zum Speicher – sie können ihn ansehen und auf ihrem Gerät speichern.</p>
        <div class="sheet-foot"><button type="button" class="btn" data-back>Fertig</button></div>`;
    }
    PL.openSheet(`${PL.sheetHead('Zettel teilen', esc(note.title))}${body}`, {
      onMount(sh) {
        const msg = sh.querySelector('[data-msg]');
        const show = (t, ok) => { if (!msg) return; msg.hidden = !t; msg.textContent = t || ''; msg.classList.toggle('ok', !!ok); };
        const back = sh.querySelector('[data-back]');
        if (back) back.onclick = () => PL.noteSheet(note.id);
        const up = sh.querySelector('[data-up]');
        if (up) up.onclick = async () => {
          up.disabled = true; up.textContent = 'Wird hochgeladen …';
          try { await F.setCloud(note, true); PL.shareSheet(note.id); }
          catch (e) { show(F.err(e)); up.disabled = false; up.innerHTML = `${ic('cloud', 'i-sm')} In die Cloud laden`; }
        };
        const send = async (email) => {
          const go = sh.querySelector('[data-go]');
          go.disabled = true; show('');
          try { await F.share(note, email); PL.shareSheet(note.id); PL.toast(`Mit ${email} geteilt`); }
          catch (e) { show(F.err(e)); go.disabled = false; }
        };
        const form = sh.querySelector('[data-form]');
        if (form) form.onsubmit = (e) => { e.preventDefault(); send(sh.querySelector('#shEmail').value); };
        sh.querySelectorAll('[data-friend]').forEach((b) => { b.onclick = () => send(b.dataset.friend); });
        sh.querySelectorAll('[data-unshare]').forEach((b) => {
          b.onclick = async () => {
            b.disabled = true;
            try { await F.unshare(b.dataset.unshare); PL.shareSheet(note.id); PL.toast('Freigabe beendet'); }
            catch (e) { show(F.err(e)); b.disabled = false; }
          };
        });
      },
    });
  };

  /* ---------- Mit mir geteilt ---------- */
  PL.sharedSheet = function (key) {
    const item = F.sharedItem(key);
    if (!item) { PL.closeSheet(); return; }
    const s = item.share;
    const kind = PL.fileKind(s.mime, s.title);
    const from = s.owner_name ? `${s.owner_name}${s.owner_email ? ' (' + s.owner_email + ')' : ''}` : s.owner_email || 'Freund';
    const html = `
      ${PL.sheetHead(esc(s.title || 'Lernzettel'), `von ${esc(from)}${s.subject ? ' · ' + esc(s.subject) : ''} · ${PL.fmtBytes(s.size)}`)}
      ${previewHtml(kind, typeOfShare(s))}
      <div class="note-actions">
        <button type="button" class="btn" data-open>${ic('eye', 'i-sm')} Öffnen</button>
        <button type="button" class="btn" data-dl>${ic('download', 'i-sm')} Sichern</button>
      </div>
      ${item.gone ? `<div class="note-warn">${ic('info', 'i-sm')}<div>Dein Freund teilt diesen Zettel nicht mehr. Du hast noch die Kopie auf diesem Gerät.</div></div>` : ''}
      <div class="opt-row"><div><div class="t">${ic('device', 'i-sm')} Auf diesem Gerät speichern</div><div class="d">Auch offline verfügbar · zählt nicht zu deinem Cloud-Speicher</div></div>
        <label class="switch"><input type="checkbox" data-here ${item.here ? 'checked' : ''} ${item.gone ? 'disabled' : ''}><span></span></label></div>
      <div class="auth-msg" data-msg hidden></div>
      <div class="sheet-foot">
        <button type="button" class="btn btn-danger" data-leave style="flex:0 0 auto" title="Aus meiner Liste entfernen">${ic('trash', 'i-sm')}</button>
        <button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button>
      </div>`;
    PL.openSheet(html, {
      onMount(sh) {
        const getBlob = () => F.sharedBlob(item);
        loadPreview(sh, getBlob, s.title);
        sh.querySelector('[data-open]').onclick = (e) => openWith(getBlob, s.mime, s.title, e.currentTarget);
        sh.querySelector('[data-dl]').onclick = (e) => saveWith(getBlob, s.title, e.currentTarget);
        sh.querySelector('[data-here]').onchange = async (e) => {
          const on = e.target.checked;
          e.target.disabled = true;
          try { await F.setSharedLocal(item, on); PL.toast(on ? 'Auf diesem Gerät gespeichert' : 'Von diesem Gerät entfernt'); PL.sharedSheet(key); }
          catch (err) { e.target.checked = !on; e.target.disabled = false; const m = sh.querySelector('[data-msg]'); m.hidden = false; m.textContent = F.err(err); }
        };
        sh.querySelector('[data-leave]').onclick = () => PL.confirmSheet('Aus deiner Liste entfernen?', `„${s.title}“ verschwindet aus „Mit mir geteilt“${item.here ? ' und von diesem Gerät' : ''}. Bei deinem Freund bleibt er erhalten.`, 'Entfernen', async () => {
          try { await F.leaveShared(item); PL.toast('Entfernt'); } catch (err) { PL.toast(F.err(err)); }
        });
      },
    });
  };

  /* ---------- Aktionen (werden in app.js übernommen) ---------- */
  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'add-note': (d) => PL.addNotesSheet({ subjectId: d.subject || (location.hash.startsWith('#/fach/') ? location.hash.split('/')[2] : null) }),
    'open-note': (d) => PL.noteSheet(d.id),
    'open-shared': (d) => PL.sharedSheet(d.key),
    'storage-info': () => PL.storageSheet(),
    'notes-tab': (d) => { PL.ui.notesTab = d.v; PL.render(); },
    'notes-restore-local': () => { const n = F.restoreLocal(); PL.toast(`${n} Zettel wiederhergestellt`); },
    'notes-restore-cloud': () => { const n = F.restoreCloud(); PL.toast(`${n} Zettel wiederhergestellt`); },
    'notes-delete-cloud': () => PL.confirmSheet('Dateien löschen?', `${F.cloudOrphans.length} Datei(en) ohne Eintrag werden endgültig aus deiner Cloud gelöscht.`, 'Löschen', async () => {
      try { await F.deleteCloudOrphans(); PL.toast('Gelöscht'); } catch (e) { PL.toast(F.err(e)); }
    }),
  });
})();
