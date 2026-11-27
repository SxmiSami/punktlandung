/* „Was ist neu“: nach einem Update einmal kurz zeigen, was sich geändert hat.
   - Gemerkt wird die gesehene Version in settings.seenVersion – mit Konto also für alle Geräte.
   - Mit Konto wird erst nach dem ersten Abgleich entschieden, damit ein anderes Gerät,
     auf dem man es schon gesehen hat, zählt.
   - Neue Nutzer (leerer Stand) sehen nichts: PL.emptyState setzt die aktuelle Version.
   - Das Fenster kommt nur, wenn es seit der zuletzt gesehenen Version einen neuen Eintrag
     ohne silent gibt. Ist der Eintrag der aktuellen Version silent, kommt bei diesem Update
     gar kein Fenster. In beiden Fällen wird die Version still als gesehen gemerkt. */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const S = () => PL.sync || {};

  const parts = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
  function cmp(a, b) {
    const x = parts(a), y = parts(b);
    for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    return 0;
  }

  /* since = zuletzt gesehene Version (zeigt alles danach, höchstens 3 Versionen).
     Ohne since: nur die aktuelle Version – oder mit all = true die letzten Versionen. */
  PL.whatsNewSheet = function (since, all) {
    const list = PL.CHANGELOG || [];
    let entries = since ? list.filter((e) => cmp(e.v, since) > 0 && cmp(e.v, PL.VERSION) <= 0).slice(0, 3) : list.slice(0, all ? 3 : 1);
    if (!entries.length) entries = list.slice(0, 1);
    if (!entries.length) return;
    const multi = entries.length > 1;
    const item = (it) => `<div class="wn-item">
        <span class="wn-ic">${ic(it.icon || 'sparkle')}</span>
        <div><b>${esc(it.title)}</b><span>${esc(it.text)}</span>${it.link ? `<a href="${esc(it.link[1])}" target="_blank" rel="noopener noreferrer">${esc(it.link[0])} ${ic('chevron-right', 'i-sm')}</a>` : ''}</div>
      </div>`;
    PL.openSheet(`
      <div class="wn-hero"><span class="wn-badge">${ic('sparkle')}</span>
        <div><div class="eyebrow">${all ? 'Letzte Updates' : 'Update'}</div><h2 class="sheet-title">${all || multi ? 'Was ist neu' : `Neu in Version ${esc(entries[0].v)}`}</h2></div>
        <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${ic('x')}</button></div>
      ${entries.map((e) => `${multi ? `<div class="sec-title">Version ${esc(e.v)}</div>` : ''}<div class="wn-list">${e.items.map(item).join('')}</div>`).join('')}
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">Alles klar</button></div>`);
  };

  /* ---------- Beim Start einmal prüfen ---------- */
  const sheetOpen = () => { const l = document.getElementById('sheetLayer'); return l && !l.hidden; };
  function syncSettled() {
    const s = S();
    if (!s.enabled) return true;
    if (!s.authReady) return false;
    if (!s.user) return true;
    return s.lastSync != null || s.status === 'offline' || s.status === 'error';
  }

  const started = Date.now();
  let timer = null;
  function check() {
    // Höchstens 15 s auf den ersten Abgleich warten, danach trotzdem entscheiden
    if (!syncSettled() && Date.now() - started < 15000) return;
    const st = PL.state.settings;
    if (cmp(st.seenVersion, PL.VERSION) >= 0) return stop();
    if (!PL.state.subjects.length) return stop();               // Willkommen/Einrichtung: nichts zeigen
    if (sheetOpen() || /^#\/setup/.test(location.hash)) return;  // später nochmal
    if (document.visibilityState !== 'visible') return;
    stop();
    const since = st.seenVersion;
    st.seenVersion = PL.VERSION;
    PL.save();
    // Gleich hochladen – während das Fenster offen ist, gleicht die App sonst nicht ab
    if (S().user && S().syncNow) S().syncNow();
    // Nur zeigen, wenn es etwas Neues gibt, das angekündigt werden soll (nicht silent)
    const list = PL.CHANGELOG || [];
    const cur = list.find((e) => e.v === PL.VERSION);
    const loud = !(cur && cur.silent) && list.some((e) => !e.silent && cmp(e.v, since) > 0 && cmp(e.v, PL.VERSION) <= 0);
    if (loud) PL.whatsNewSheet(since);
  }
  function stop() { clearInterval(timer); timer = null; }

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'whats-new': () => PL.whatsNewSheet(null, true),
  });

  window.addEventListener('load', () => {
    timer = setInterval(check, 700);
    setTimeout(check, 400);
  });
})();
