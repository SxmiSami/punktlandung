/* Admin (nur ein Konto): alle Konten sehen und für alle geteilte Dateien entfernen.
   Die Rechte prüft die Datenbank (supabase/admin.sql) – hier wird die Ansicht nur ein- oder ausgeblendet. */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const ADMIN_EMAIL = 'samuel.hollenhorst@gmail.com';
  const F = () => PL.files;
  const client = () => PL.sync.client;
  const dateOf = (iso) => (iso ? PL.fmtDate(String(iso).slice(0, 10)) : '');

  const A = PL.admin = {};
  A.is = () => !!(PL.sync && PL.sync.enabled && PL.sync.user && (PL.sync.user.email || '').toLowerCase() === ADMIN_EMAIL);

  A.err = function (e) {
    const m = (e && (e.message || e.error_description || e.error)) || String(e || '');
    if (/could not find the function|schema cache|does not exist/i.test(m)) return 'Admin ist noch nicht eingerichtet (supabase/admin.sql in Supabase ausführen).';
    if (/nur für den admin|42501|permission denied/i.test(m)) return 'Keine Berechtigung.';
    if (/schon 10 konten/i.test(m)) return `Schon ${A.maxCloud()} Konten haben Cloud-Zugriff. Schalte zuerst bei jemandem aus.`;
    if (/failed to fetch|network|load failed/i.test(m) || !navigator.onLine) return 'Keine Verbindung. Bist du online?';
    return m || 'Unbekannter Fehler.';
  };

  A.users = async function () {
    const { data, error } = await client().rpc('pl_admin_users');
    if (error) throw error;
    return data || [];
  };

  /* Cloud-Speicher für Dateien pro Konto ein-/ausschalten (max. 10, prüft auch die Datenbank) */
  A.maxCloud = () => (F() && F().cfg.maxCloudUsers) || 10;
  A.setCloud = async function (uid, on) {
    const { data, error } = await client().rpc('pl_admin_set_cloud', { uid, enabled: on });
    if (error) throw error;
    return Number(data) || 0;
  };

  /* Für alle geteilte Datei entfernen (die Datei bleibt bei der Person, die sie geteilt hat) */
  A.removePublic = async function (id) {
    const { data, error } = await client().from('public_files').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('Nicht entfernt – ist supabase/admin.sql in Supabase ausgeführt?');
    F().publicFiles = F().publicFiles.filter((p) => p.id !== id);
    await F().refreshRemote(true);
    if (PL.render) PL.render();
  };

  A.confirmRemove = function (p, after) {
    const who = p.owner_name || p.owner_email || 'jemandem';
    PL.confirmSheet('Für alle löschen?', `„${p.title || 'Datei'}“ von ${who} ist dann für niemanden mehr unter „Für alle“ zu sehen. Die Person, die sie geteilt hat, behält ihre Datei.`, 'Für alle löschen', async () => {
      try { await A.removePublic(p.id); PL.toast('Für alle gelöscht'); }
      catch (e) { PL.toast(A.err(e)); }
      if (after) after();
    });
  };

  /* ---------- Karte in den Einstellungen ---------- */
  A.card = function () {
    if (!A.is()) return '';
    const n = (F() && F().publicFiles || []).length;
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${ic('lock')} Admin</h2><div class="card-sub">Nur für dich sichtbar</div></div></div>
      <div class="opt-row"><div><div class="t">${ic('users', 'i-sm')} Konten &amp; Cloud-Zugriff</div><div class="d">Wer angemeldet ist und wer Dateien in die Cloud laden darf (max. ${A.maxCloud()})</div></div><button class="btn btn-sm" data-action="admin-users">Anzeigen</button></div>
      <div class="opt-row"><div><div class="t">${ic('globe', 'i-sm')} Für alle geteilte Dateien</div><div class="d">${n} Datei${n === 1 ? '' : 'en'} · du kannst sie für alle löschen</div></div><button class="btn btn-sm" data-action="admin-files">Verwalten</button></div>
    </section>`;
  };

  /* ---------- Konten ---------- */
  A.usersSheet = function () {
    if (!A.is()) return;
    PL.openSheet(`${PL.sheetHead('Konten', 'Wird geladen …')}<div data-list><p class="hint" style="margin:0 0 16px">Wird geladen …</p></div>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button></div>`, {
      async onMount(sh) {
        const box = sh.querySelector('[data-list]');
        const sub = sh.querySelector('.sheet-head .card-sub');
        let list = [];
        const max = A.maxCloud();
        const draw = (msg) => {
          const n = list.filter((u) => u.cloud).length;
          const full = n >= max;
          if (sub) sub.textContent = `${list.length} ${list.length === 1 ? 'Konto' : 'Konten'} · ${n} von ${max} mit Cloud`;
          const hasCloudCol = list.some((u) => typeof u.cloud === 'boolean');
          box.innerHTML = (msg ? `<div class="auth-msg" style="margin-bottom:14px">${esc(msg)}</div>` : '')
            + (hasCloudCol ? `<p class="hint" style="margin:0 0 10px">${ic('cloud', 'i-sm')} <b>${n} von ${max}</b> Konten dürfen Dateien in die Cloud laden${full ? ' – alle Plätze belegt' : ''}. Ausschalten löscht nichts, die Person kann nur nichts Neues hochladen.</p>` : '')
            + (list.length ? `<div class="list" style="margin-bottom:14px">${list.map((u) => `
            <div class="row" style="padding:8px 4px"><span class="avatar">${esc((u.email || '?').charAt(0).toUpperCase())}</span>
              <span class="row-main"><span class="row-title" style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(u.email || '–')}</span>
              <span class="row-sub" style="display:block">seit ${dateOf(u.created_at)}${u.last_sign_in_at ? ' · zuletzt ' + dateOf(u.last_sign_in_at) : ''}${u.used ? ' · ' + PL.fmtBytes(Number(u.used)) + ' in der Cloud' : ''}</span></span>
              ${typeof u.cloud === 'boolean' && u.id ? `<label class="switch" title="Cloud-Speicher für Dateien"><input type="checkbox" data-cloud="${esc(u.id)}" ${u.cloud ? 'checked' : ''} ${!u.cloud && full ? 'disabled' : ''} aria-label="Cloud für ${esc(u.email || '')}"><span></span></label>` : ''}</div>`).join('')}</div>`
            : '<p class="hint" style="margin:0 0 16px">Keine Konten gefunden.</p>');
          box.querySelectorAll('[data-cloud]').forEach((inp) => {
            inp.onchange = async () => {
              const u = list.find((x) => x.id === inp.dataset.cloud);
              if (!u) return;
              const on = inp.checked;
              box.querySelectorAll('[data-cloud]').forEach((x) => { x.disabled = true; });
              try {
                await A.setCloud(u.id, on);
                u.cloud = on;
                if (PL.sync.user && u.id === PL.sync.user.id) F().refreshRemote(true);
                draw();
              } catch (e) { draw(A.err(e)); }
            };
          });
        };
        try {
          list = await A.users();
          if (!box.isConnected) return;
          draw();
        } catch (e) {
          if (sub) sub.textContent = 'Fehler';
          box.innerHTML = `<div class="auth-msg" style="margin-bottom:14px">${esc(A.err(e))}</div>`;
        }
      },
    });
  };

  /* ---------- Für alle geteilte Dateien ---------- */
  A.filesSheet = function () {
    if (!A.is()) return;
    const list = (F().publicFiles || []).slice();
    const err = F().publicError;
    PL.openSheet(`${PL.sheetHead('Für alle geteilt', `${list.length} Datei${list.length === 1 ? '' : 'en'}`)}
      ${err ? `<div class="auth-msg" style="margin-bottom:14px">${esc(err === 'setup' ? F().err(new Error('public_files does not exist')) : 'Die Liste konnte nicht geladen werden.')}</div>` : ''}
      ${list.length ? `<div class="list" style="margin-bottom:14px">${list.map((p) => `
        <div class="row" style="padding:8px 4px"><span class="row-main"><span class="row-title" style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(p.title || 'Datei')}</span>
          <span class="row-sub" style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(p.owner_email || p.owner_name || '–')}${p.subject ? ' · ' + esc(p.subject) : ''} · ${PL.fmtBytes(p.size)} · ${dateOf(p.created_at)}</span></span>
          <button type="button" class="btn btn-sm btn-danger" data-del="${esc(p.id)}" title="Für alle löschen">${ic('trash', 'i-sm')}</button></div>`).join('')}</div>`
        : (err ? '' : '<p class="hint" style="margin:0 0 16px">Gerade ist nichts für alle geteilt.</p>')}
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button></div>`, {
      onMount(sh) {
        sh.querySelectorAll('[data-del]').forEach((b) => {
          b.onclick = () => { const p = list.find((x) => x.id === b.dataset.del); if (p) A.confirmRemove(p, () => setTimeout(A.filesSheet, 250)); };
        });
      },
    });
    F().refreshRemote(true);
  };

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'admin-users': () => A.usersSheet(),
    'admin-files': () => A.filesSheet(),
  });
})();
