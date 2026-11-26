/* OneNote-Anbindung (Microsoft 365 / Schulkonto)
   - Pro Fach einen OneNote-Abschnitt verknüpfen und direkt öffnen (geht auch ohne Anmeldung, per Link)
   - Mit „Mit Microsoft anmelden“: Seiten des Abschnitts in der App sehen, neue Seiten in den
     Neuigkeiten, Seiten als Datei speichern.
   Anmeldung direkt bei Microsoft (OAuth mit PKCE, ohne Server). Die Anmeldung bleibt NUR auf
   diesem Gerät (nicht im Konto, nicht im Backup). Microsoft lässt sie bei Web-Apps höchstens
   24 Stunden gelten – danach reicht ein Tipp auf „Erneut anmelden“.
   Einrichtung: siehe SYNC-EINRICHTEN.md, Schritt 8. */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;
  const ON = PL.onenote = { error: null };
  const TOK = 'punktlandung:ms-token';
  const AUTH = 'punktlandung:ms-auth';
  const CACHE = 'punktlandung:onenote';
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const SCOPES = 'openid profile offline_access User.Read Notes.Read.All Team.ReadBasic.All';
  const CHECK_EVERY = 10 * 60 * 1000;

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* voll */ } };
  const cfg = () => (window.PL_CONFIG || {}).microsoft || {};
  const cache = () => Object.assign({ sections: null, sectionsAt: 0, sectionErrors: [], known: {}, checkedAt: 0 }, read(CACHE) || {});
  const saveCache = (c) => write(CACHE, c);
  const rerender = () => { if (PL.render) PL.render(); };

  ON.configured = () => !!cfg().clientId;
  ON.redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const authority = () => `https://login.microsoftonline.com/${encodeURIComponent(cfg().tenant || 'organizations')}/oauth2/v2.0`;
  ON.adminConsentUrl = () => `https://login.microsoftonline.com/${encodeURIComponent(cfg().tenant || 'organizations')}/adminconsent?client_id=${encodeURIComponent(cfg().clientId || '')}&redirect_uri=${encodeURIComponent(ON.redirectUri())}`;
  ON.account = () => read(TOK);
  ON.connected = () => !!read(TOK);
  /* Angemeldet, aber die 24 Stunden sind um → Seiten gehen erst nach „Erneut anmelden“ */
  ON.expired = () => { const t = read(TOK); return !!t && !t.refresh && !(t.access && t.exp > Date.now()); };
  ON.ready = () => ON.configured() && ON.connected() && !ON.expired();

  /* ---------- Fehler verständlich machen ---------- */
  function explain(code, desc) {
    const d = String(desc || '');
    const aad = (d.match(/AADSTS(\d+)/) || [])[1];
    if (/65001|90094|90008/.test(aad || '') || /admin/i.test(d) || code === 'consent_required')
      return 'Deine Schule muss Punktlandung zuerst freigeben. Eine Lehrkraft oder die IT (Microsoft-365-Administrator) kann das mit einem Klick erledigen – den Link findest du unter Einstellungen → OneNote.';
    if (aad === '50011') return `Die Weiterleitungs-Adresse passt nicht. In der App-Registrierung bei Microsoft muss genau diese Adresse als „Single-Page-Anwendung“ eingetragen sein: ${ON.redirectUri()}`;
    if (aad === '9002326' || aad === '700054' || aad === '9002327') return 'In der App-Registrierung bei Microsoft muss die Plattform „Single-Page-Anwendung“ (SPA) sein, nicht „Web“.';
    if (aad === '50194') return 'Die App ist nur für deine Schule registriert. Trag in js/config.js bei „tenant“ die Verzeichnis-ID (Mandanten-ID) deiner Schule ein.';
    if (aad === '700016') return 'Microsoft kennt diese App-ID nicht. Prüfe „clientId“ und „tenant“ in js/config.js.';
    if (aad === '700084' || aad === '700082' || code === 'invalid_grant') return 'Die Anmeldung bei Microsoft ist abgelaufen. Bitte melde dich erneut an.';
    if (code === 'access_denied') return 'Die Anmeldung wurde abgebrochen.';
    if (code === 'interaction_required' || code === 'login_required') return 'Bitte melde dich erneut bei Microsoft an.';
    return d.split(/\r?\n/)[0].replace(/^AADSTS\d+:\s*/, '') || 'Die Anmeldung bei Microsoft hat nicht geklappt.';
  }
  const loginNeeded = () => Object.assign(new Error('Bitte melde dich erneut bei Microsoft an (Microsoft verlangt das etwa einmal am Tag).'), { code: 'login' });

  /* ---------- Anmeldung (PKCE) ---------- */
  const b64url = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randStr = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  function parseJwt(t) {
    try { return JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; }
  }

  ON.signIn = async function (opts = {}) {
    if (!ON.configured()) { ON.setupSheet(); return; }
    if (!window.crypto || !crypto.subtle) { PL.toast('Die Anmeldung geht nur über https.'); return; }
    const verifier = randStr(48), state = randStr(16);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    write(AUTH, { verifier, state, hash: opts.hash || location.hash || '#/einstellungen', at: Date.now() });
    const old = read(TOK);
    const p = new URLSearchParams({
      client_id: cfg().clientId, response_type: 'code', response_mode: 'query', redirect_uri: ON.redirectUri(),
      scope: SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state,
    });
    if (old && old.email) p.set('login_hint', old.email); else p.set('prompt', 'select_account');
    location.href = `${authority()}/authorize?${p}`;
  };

  async function tokenRequest(params) {
    let res;
    try {
      res = await fetch(`${authority()}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(Object.assign({ client_id: cfg().clientId, scope: SCOPES }, params)),
      });
    } catch (e) { throw new Error(navigator.onLine === false ? 'Du bist offline.' : 'Microsoft antwortet nicht.'); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.access_token) throw Object.assign(new Error(explain(d.error, d.error_description)), { code: d.error || 'http' });
    const old = read(TOK) || {};
    const c = parseJwt(d.id_token || '') || {};
    const t = {
      access: d.access_token, refresh: d.refresh_token || old.refresh || null,
      exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 - 60000,
      name: c.name || old.name || '', email: c.preferred_username || c.email || old.email || '', tid: c.tid || old.tid || '',
      since: params.grant_type === 'authorization_code' ? Date.now() : old.since || Date.now(),
    };
    write(TOK, t);
    return t;
  }

  let refreshing = null;
  async function token() {
    const t = read(TOK);
    if (!t) throw loginNeeded();
    if (t.access && t.exp > Date.now()) return t.access;
    if (!t.refresh) throw loginNeeded();
    if (!refreshing) refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }).finally(() => { refreshing = null; });
    try { return (await refreshing).access; }
    catch (e) {
      if (/invalid_grant|interaction_required|login_required/.test(e.code || '')) {
        write(TOK, Object.assign({}, t, { access: null, refresh: null }));
        rerender();
        throw loginNeeded();
      }
      throw e;
    }
  }

  /* Rückkehr von Microsoft: …/?code=…&state=… – sofort aufräumen, damit die App die richtige Seite zeigt */
  (function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!q.has('state') || (!q.has('code') && !q.has('error'))) return;
    const a = read(AUTH);
    if (!a || q.get('state') !== a.state) return;
    write(AUTH, null);
    history.replaceState(null, '', ON.redirectUri() + (a.hash || '#/einstellungen'));
    if (q.has('error')) {
      ON.error = explain(q.get('error'), q.get('error_description'));
      setTimeout(() => { rerender(); ON.errorSheet(); }, 300);
      return;
    }
    ON.loggingIn = true;
    tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), code_verifier: a.verifier, redirect_uri: ON.redirectUri() })
      .then((t) => {
        ON.error = null;
        const c = cache(); c.sections = null; c.sectionsAt = 0; saveCache(c);
        PL.toast(`Mit Microsoft verbunden${t.name ? ' – hallo ' + t.name.split(' ')[0] : ''}`);
        ON.check({ force: true });
      })
      .catch((e) => { ON.error = e.message; setTimeout(() => ON.errorSheet(), 300); })
      .finally(() => { ON.loggingIn = false; rerender(); });
  })();

  ON.signOut = function () {
    write(TOK, null);
    const c = cache(); c.sections = null; c.sectionsAt = 0; saveCache(c);
    pages.clear();
    ON.error = null;
    rerender();
  };

  /* ---------- Microsoft Graph ---------- */
  async function graph(path, opts = {}) {
    const at = await token();
    let res;
    try { res = await fetch(/^https:/.test(path) ? path : GRAPH + path, { headers: { Authorization: 'Bearer ' + at } }); }
    catch (e) { throw new Error(navigator.onLine === false ? 'Du bist offline.' : 'Microsoft antwortet nicht.'); }
    if (res.status === 401 && !opts.retried) {
      const t = read(TOK); if (t) { t.exp = 0; write(TOK, t); }
      return graph(path, Object.assign({}, opts, { retried: true }));
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const er = d.error || {};
      const msg = String(er.message || '');
      let text = msg || `Fehler bei Microsoft (HTTP ${res.status})`;
      if (er.code === '10008' || /5000 items|exceeds the maximum number of items/i.test(msg))
        text = 'In der Dateiablage dieses Teams liegen zu viele Dateien – Microsoft lässt OneNote dort nicht über die Schnittstelle lesen. Öffnen in OneNote geht trotzdem.';
      else if (res.status === 403) text = 'Kein Zugriff auf dieses Notizbuch.';
      else if (res.status === 404) text = 'Nicht (mehr) gefunden – vielleicht wurde der Abschnitt verschoben oder gelöscht.';
      else if (res.status === 429 || res.status === 503) text = 'Microsoft bremst gerade – versuch es gleich nochmal.';
      throw Object.assign(new Error(text), { status: res.status, code: er.code });
    }
    return opts.raw ? res : res.json();
  }
  async function all(path, max = 8) {
    let out = [], url = path;
    for (let i = 0; i < max && url; i++) { const d = await graph(url); out = out.concat(d.value || []); url = d['@odata.nextLink']; }
    return out;
  }
  async function pool(items, n, fn) {
    const q = items.slice();
    await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); }));
  }
  const base = (link) => (link.src && link.src.startsWith('g:') ? `/groups/${link.src.slice(2)}/onenote` : '/me/onenote');
  const href = (links, k) => (links && links[k] && links[k].href) || '';

  /* ---------- Abschnitte (eigene Notizbücher + Notizbücher deiner Teams, z. B. Kursnotizbücher) ---------- */
  let sectionsLoading = null;
  ON.sections = () => cache().sections;
  ON.sectionErrors = () => cache().sectionErrors || [];
  ON.loadSections = function (force) {
    const c = cache();
    if (!force && c.sections && Date.now() - c.sectionsAt < 6 * 3600e3) return Promise.resolve(c.sections);
    if (sectionsLoading) return sectionsLoading;
    sectionsLoading = (async () => {
      const out = [], errors = [];
      const add = (src, srcName, list) => list.forEach((s) => out.push({
        src, srcName, id: s.id, name: s.displayName || 'Abschnitt',
        notebook: (s.parentNotebook && s.parentNotebook.displayName) || '',
        group: (s.parentSectionGroup && s.parentSectionGroup.displayName) || '',
        web: href(s.links, 'oneNoteWebUrl'), app: href(s.links, 'oneNoteClientUrl'),
        modified: s.lastModifiedDateTime || '',
      }));
      const q = '/onenote/sections?$expand=parentNotebook,parentSectionGroup&$top=100';
      try { add('me', 'Meine Notizbücher', await all('/me' + q)); }
      catch (e) { if (e.code === 'login') throw e; errors.push('Eigene Notizbücher: ' + e.message); }
      let teams = [];
      try { teams = await all('/me/joinedTeams?$select=id,displayName'); }
      catch (e) { if (e.code === 'login') throw e; errors.push('Teams: ' + e.message); }
      await pool(teams, 4, async (tm) => {
        try { add('g:' + tm.id, tm.displayName || 'Team', await all(`/groups/${tm.id}${q}`, 4)); }
        catch (e) { if (e.status !== 404 && e.status !== 403) errors.push(`${tm.displayName}: ${e.message}`); }
      });
      const c2 = cache();
      c2.sections = out; c2.sectionsAt = Date.now(); c2.sectionErrors = errors;
      saveCache(c2);
      return out;
    })().finally(() => { sectionsLoading = null; });
    return sectionsLoading;
  };

  /* ---------- Seiten eines Abschnitts ---------- */
  const pages = new Map();   // link.id → { at, list, error, loading }
  ON.pagesOf = (link) => pages.get(link.id) || null;
  ON.loadPages = async function (link, force) {
    if (!link || !link.id) return [];
    const cur = pages.get(link.id);
    if (cur && cur.loading) return cur.loading;
    if (!force && cur && cur.list && Date.now() - cur.at < 5 * 60 * 1000) return cur.list;
    const entry = Object.assign({}, cur || {});
    entry.loading = graph(`${base(link)}/sections/${link.id}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,links&$orderby=lastModifiedDateTime desc&$top=100`)
      .then((d) => {
        const list = (d.value || []).map((p) => ({
          id: p.id, title: p.title || 'Ohne Titel', created: p.createdDateTime || '', modified: p.lastModifiedDateTime || '',
          web: href(p.links, 'oneNoteWebUrl'), app: href(p.links, 'oneNoteClientUrl'),
        }));
        pages.set(link.id, { at: Date.now(), list, error: null });
        return list;
      })
      .catch((e) => { pages.set(link.id, { at: Date.now(), list: (cur && cur.list) || null, error: e.message }); throw e; });
    pages.set(link.id, entry);
    return entry.loading;
  };

  /* Seite als eigenständige HTML-Datei (Bilder eingebettet) */
  const toDataUrl = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
  ON.pageHtml = async function (link, page) {
    const res = await graph(`${base(link)}/pages/${page.id}/content`, { raw: true });
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    doc.querySelectorAll('script, iframe').forEach((x) => x.remove());
    const imgs = Array.from(doc.querySelectorAll('img'));
    await pool(imgs, 4, async (img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-fullres-src') || '';
      img.removeAttribute('data-fullres-src'); img.removeAttribute('data-src-type'); img.removeAttribute('data-fullres-src-type');
      if (!src.startsWith('https://graph.microsoft.com/')) return;
      try { img.setAttribute('src', await toDataUrl(await (await graph(src, { raw: true })).blob())); }
      catch (e) { img.removeAttribute('src'); img.setAttribute('alt', '[Bild konnte nicht geladen werden]'); }
    });
    // Angehängte Dateien kann die Seite nicht mitbringen – Hinweis statt leerem Kasten
    doc.querySelectorAll('object').forEach((o) => {
      const p = doc.createElement('p');
      p.className = 'pl-att';
      p.textContent = `📎 ${o.getAttribute('data-attachment') || 'Angehängte Datei'} (nur in OneNote)`;
      o.replaceWith(p);
    });
    const head = doc.head || doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
    head.insertAdjacentHTML('afterbegin', `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank">
      <style>
        body { font-family: -apple-system, "Segoe UI", Calibri, Arial, sans-serif; font-size: 15px; line-height: 1.45; color: #1a1a1a; background: #fff; margin: 0 auto; padding: 18px; max-width: 900px; }
        [style*="position:absolute"] { position: static !important; }
        div, p, table { max-width: 100% !important; }
        img { max-width: 100% !important; height: auto !important; }
        table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 4px 6px; }
        .pl-head { border-bottom: 1px solid #e3e3e3; margin: 0 0 14px; padding-bottom: 10px; }
        .pl-head h1 { font-size: 22px; margin: 0 0 4px; } .pl-head div, .pl-foot { color: #777; font-size: 12.5px; }
        .pl-foot { border-top: 1px solid #e3e3e3; margin-top: 22px; padding-top: 10px; }
        .pl-att { color: #555; font-style: italic; }
      </style>`);
    const when = page.modified ? new Date(page.modified).toLocaleString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    doc.body.insertAdjacentHTML('afterbegin', `<header class="pl-head"><h1>${esc(page.title)}</h1><div>${esc([link.notebook, link.name].filter(Boolean).join(' › '))}${when ? ' · zuletzt geändert ' + esc(when) : ''}</div></header>`);
    doc.body.insertAdjacentHTML('beforeend', `<footer class="pl-foot">Aus OneNote übernommen mit Punktlandung${page.web ? ` · <a href="${esc(page.web)}">In OneNote öffnen</a>` : ''}</footer>`);
    if (!doc.querySelector('title')) head.insertAdjacentHTML('beforeend', `<title>${esc(page.title)}</title>`);
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  };

  /* ---------- Neue Seiten → Neuigkeiten ---------- */
  const linked = () => st().subjects.filter((s) => s.onenote && s.onenote.id);
  let checking = null;
  ON.check = function (opts = {}) {
    if (!ON.ready() || st().settings.onenoteFeed === false) return Promise.resolve(0);
    const c = cache();
    if (!opts.force && Date.now() - c.checkedAt < CHECK_EVERY) return Promise.resolve(0);
    if (checking) return checking;
    checking = (async () => {
      let fresh = 0;
      const items = [];
      for (const sub of linked()) {
        const link = sub.onenote;
        let list;
        try { list = await ON.loadPages(link, true); } catch (e) { if (e.code === 'login') break; continue; }
        const c2 = cache();
        const known = c2.known[link.id];
        const now = {};
        list.forEach((p) => { now[p.id] = 1; });
        if (known) {
          list.filter((p) => !known[p.id]).forEach((p) => items.push({
            id: 'on:' + p.id, kind: 'onenote', at: p.created || new Date().toISOString(),
            subjectId: sub.id, title: p.title, section: link.name, notebook: link.notebook || '',
            src: link.src, sectionId: link.id, pageId: p.id, web: p.web, app: p.app, modified: p.modified,
          }));
        }
        c2.known[link.id] = Object.assign({}, known || {}, now);
        saveCache(c2);
      }
      if (items.length && PL.feed && PL.feed.add) fresh = PL.feed.add(items);
      const c3 = cache(); c3.checkedAt = Date.now(); saveCache(c3);
      rerender();
      return fresh;
    })().finally(() => { checking = null; });
    return checking;
  };

  /* ---------- Öffnen ---------- */
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
  /* Link für die OneNote-App: Graph liefert „onenote:https://…“, bei eingefügten Links davor setzen */
  const appUrl = (x) => x.app || (/^https:\/\/[^/]*(sharepoint\.com|onedrive\.live\.com|1drv\.ms|onenote\.com)/i.test(x.web || '') ? 'onenote:' + x.web : '');
  ON.openApp = (x) => { const u = appUrl(x); if (u) location.href = u; else ON.openWeb(x); };
  ON.openWeb = (x) => { if (x.web) window.open(x.web, '_blank', 'noopener'); };
  function openButtons(x, cls = 'btn-sm') {
    const a = appUrl(x);
    return `${a ? `<button type="button" class="btn ${cls} btn-primary" data-on-app>${ic('notebook', 'i-sm')} OneNote-App</button>` : ''}
      ${x.web ? `<button type="button" class="btn ${cls}" data-on-web>${ic('globe', 'i-sm')} Im Browser</button>` : ''}`;
  }
  function mountOpen(sh, x) {
    const a = sh.querySelector('[data-on-app]'); if (a) a.onclick = () => ON.openApp(x);
    const w = sh.querySelector('[data-on-web]'); if (w) w.onclick = () => ON.openWeb(x);
  }

  PL.htmlViewer = function (html, title) {
    const v = document.createElement('div');
    v.className = 'viewer viewer-page';
    v.innerHTML = `<div class="viewer-bar"><span>${esc(title || '')}</span><button class="icon-btn" aria-label="Schließen">${ic('x')}</button></div>
      <div class="viewer-body"><iframe sandbox="allow-popups allow-popups-to-escape-sandbox" title="${esc(title || 'Seite')}"></iframe></div>`;
    v.querySelector('iframe').srcdoc = html;
    const close = () => { v.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    v.querySelector('.viewer-bar button').onclick = close;
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(v);
  };

  const fmtWhen = (iso) => {
    if (!iso) return '';
    const d = PL.isoDate(new Date(iso)), n = PL.daysUntil(d);
    return n === 0 ? 'heute ' + new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : n === -1 ? 'gestern' : n > -7 ? `vor ${-n} Tagen` : PL.fmtDate(d);
  };

  /* Eine Seite: öffnen, hier ansehen, bei Dateien speichern */
  ON.pageSheet = function (link, page, subjectId) {
    const sub = PL.subject(subjectId);
    const savedId = (cache().saved || {})[page.id];
    const saved = savedId && PL.files && PL.files.note(savedId);
    PL.openSheet(`${PL.sheetHead(esc(page.title), esc([link.notebook, link.name].filter(Boolean).join(' › ')))}
      <div class="feed-meta">
        ${sub ? `<div><span>Fach</span><b>${esc(sub.name)}</b></div>` : ''}
        ${page.created ? `<div><span>Erstellt</span><b>${esc(PL.fmtDate(PL.isoDate(new Date(page.created))))}</b></div>` : ''}
        ${page.modified ? `<div><span>Geändert</span><b>${esc(fmtWhen(page.modified))}</b></div>` : ''}
      </div>
      <div class="on-actions">${openButtons(page, '')}</div>
      <div class="on-actions">
        <button type="button" class="btn" data-view>${ic('eye', 'i-sm')} Hier ansehen</button>
        ${saved ? `<button type="button" class="btn" data-note>${ic('file', 'i-sm')} Gespeicherte Datei</button>`
          : `<button type="button" class="btn" data-save>${ic('download', 'i-sm')} Bei Dateien speichern</button>`}
      </div>
      <p class="hint" data-msg>${ic('info', 'i-sm')} „Hier ansehen“ und „Bei Dateien“ zeigen Text, Bilder und eingefügte PDFs. Mit dem Stift Geschriebenes gibt Microsoft dabei nicht mit – dafür in OneNote öffnen.</p>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button></div>`, {
      onMount(sh) {
        mountOpen(sh, page);
        const say = (m) => { const el = sh.querySelector('[data-msg]'); el.textContent = m; el.style.color = 'var(--danger)'; };
        const busy = async (b, label, fn) => {
          const old = b.innerHTML; b.disabled = true; b.textContent = label;
          try { await fn(); } catch (e) { say(e.message); } finally { if (b.isConnected) { b.disabled = false; b.innerHTML = old; } }
        };
        const v = sh.querySelector('[data-view]');
        v.onclick = () => busy(v, 'Lädt …', async () => PL.htmlViewer(await ON.pageHtml(link, page), page.title));
        const s = sh.querySelector('[data-save]');
        if (s) s.onclick = () => busy(s, 'Speichert …', async () => {
          const html = await ON.pageHtml(link, page);
          const set = st().settings;
          const before = new Set(st().notes.map((n) => n.id));
          const name = PL.files.fileName(page.title, '') + '.html';
          const r = await PL.files.add([new File([html], name, { type: 'text/html' })], {
            mode: PL.files.canCloud() ? (set.noteMode || 'both') : 'local', subjectId: subjectId || null, compress: false, title: page.title,
          });
          const note = st().notes.find((n) => !before.has(n.id));
          if (!r.ok || !note) throw new Error(r.warnings[0] || 'Speichern hat nicht geklappt.');
          const c = cache(); c.saved = Object.assign({}, c.saved, { [page.id]: note.id }); saveCache(c);
          PL.toast(`„${page.title}“ bei den Dateien gespeichert`);
          ON.pageSheet(link, page, subjectId);
        });
        const n = sh.querySelector('[data-note]');
        if (n) n.onclick = () => PL.noteSheet(savedId);
      },
    });
  };

  /* Aus den Neuigkeiten */
  ON.openFeedItem = function (x) {
    const sub = PL.subject(x.subjectId);
    const link = (sub && sub.onenote && sub.onenote.id === x.sectionId) ? sub.onenote : { src: x.src, id: x.sectionId, name: x.section, notebook: x.notebook };
    ON.pageSheet(link, { id: x.pageId, title: x.title, web: x.web, app: x.app, created: x.at, modified: x.modified }, x.subjectId);
  };

  /* ---------- Karte im Fach ---------- */
  PL.onenoteCard = function (sub) {
    const link = sub.onenote;
    const head = (sub2, btns) => `<div class="card-head"><div><h2 class="card-title" style="font-size:16px">${ic('notebook')} OneNote</h2>${sub2 ? `<div class="card-sub">${sub2}</div>` : ''}</div>${btns || ''}</div>`;
    if (!link) {
      return `<section class="card" style="margin-top:14px">
        ${head('', `<button class="btn btn-sm" data-action="onenote-link" data-subject="${sub.id}">${ic('plus', 'i-sm')} Verknüpfen</button>`)}
        <div class="empty" style="padding:14px 18px">Verknüpfe einen Abschnitt aus deinem OneNote-Notizbuch (z. B. dem Kursnotizbuch), um ihn von hier aus zu öffnen${ON.configured() ? ' und die Seiten hier zu sehen' : ''}.</div>
      </section>`;
    }
    const where = [link.srcName && link.srcName !== 'Meine Notizbücher' ? link.srcName : '', link.notebook, link.group, link.name].filter(Boolean);
    const btns = `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn btn-sm btn-primary" data-action="onenote-open" data-subject="${sub.id}">${ic('notebook', 'i-sm')} Öffnen</button>
        <button class="icon-btn" data-action="onenote-link" data-subject="${sub.id}" aria-label="Verknüpfung ändern" title="Verknüpfung ändern">${ic('edit')}</button></div>`;
    let body = '';
    if (link.id && ON.configured()) {
      if (!ON.connected()) body = `<div class="empty" style="padding:14px 18px">Melde dich mit deinem Schulkonto bei Microsoft an, um die Seiten hier zu sehen.<br><button class="btn btn-sm" data-action="onenote-signin">${ic('lock', 'i-sm')} Mit Microsoft anmelden</button></div>`;
      else if (ON.expired()) body = `<div class="empty" style="padding:14px 18px">Die Anmeldung bei Microsoft ist abgelaufen (das passiert etwa einmal am Tag).<br><button class="btn btn-sm" data-action="onenote-signin">${ic('refresh', 'i-sm')} Erneut anmelden</button></div>`;
      else {
        const p = ON.pagesOf(link);
        if (!p || (!p.list && !p.error)) {
          if (!p) ON.loadPages(link).then(rerender, rerender);
          body = '<div class="hint" style="padding:6px 8px">Seiten werden geladen …</div>';
        } else if (p.error && !p.list) {
          body = `<div class="hint" style="padding:6px 8px;color:var(--danger)">${esc(p.error)}</div>`;
        } else {
          const list = p.list;
          const top = list.slice(0, PL.ui.onenoteAll === sub.id ? 100 : 8);
          const fresh = (pg) => PL.feed && PL.feed.item('on:' + pg.id) && !PL.feed.isRead('on:' + pg.id);
          body = list.length ? `<div class="list">${top.map((pg) => `<button class="row row-click" data-action="onenote-page" data-subject="${sub.id}" data-page="${esc(pg.id)}">
              <span class="note-tile on-tile">${ic('notebook')}</span>
              <span class="row-main"><span class="row-title" style="display:block">${esc(pg.title)}</span><span class="row-sub" style="display:block">geändert ${esc(fmtWhen(pg.modified))}</span></span>
              ${fresh(pg) ? '<span class="tag tag-abi">NEU</span>' : ''}${ic('chevron-right', 'i-sm')}</button>`).join('')}</div>
            ${list.length > top.length ? `<button class="link-btn" style="margin:8px 8px 2px" data-action="onenote-more" data-subject="${sub.id}">Alle ${list.length} Seiten zeigen</button>` : ''}
            ${p.error ? `<div class="hint" style="padding:6px 8px;color:var(--danger)">${esc(p.error)}</div>` : ''}`
            : '<div class="empty" style="padding:14px 18px">In diesem Abschnitt sind noch keine Seiten.</div>';
        }
      }
    }
    return `<section class="card" style="margin-top:14px">${head(esc(where.join(' › ')) || 'Verknüpfter Link', btns)}${body}</section>`;
  };

  /* ---------- Abschnitt verknüpfen ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  /* Wie gut passt ein Abschnitt zum Fach? („Mathe LK“ ↔ Mathematik, Team „Q2 D GK“ ↔ D) */
  function score(sub, s) {
    const nm = norm(sub.name), sh = norm(sub.short);
    let v = 0;
    [[s.name, 3], [s.notebook, 2], [s.srcName, 2], [s.group, 1]].forEach(([f, w]) => {
      const h = norm(f);
      if (!h) return;
      if (nm && (h.includes(nm) || (nm.length >= 5 && h.includes(nm.slice(0, 5))))) v += 3 * w;
      else if (sh && new RegExp(`(^|[^a-z0-9])${sh}([^a-z0-9]|$)`).test(String(f).toLowerCase())) v += 2 * w;
    });
    return v;
  }

  ON.linkSheet = function (subjectId) {
    const sub = PL.subject(subjectId);
    if (!sub) return;
    const cur = sub.onenote || null;
    const ready = ON.ready();
    const secs = ready ? ON.sections() : null;
    const sectionRow = (s) => `<button type="button" class="row row-click on-sec ${cur && cur.id === s.id ? 'on' : ''}" data-sec="${esc(s.id)}" data-q="${esc(norm([s.name, s.group, s.notebook, s.srcName].join(' ')))}">
        <span class="note-tile on-tile">${ic('notebook')}</span>
        <span class="row-main"><span class="row-title" style="display:block">${esc(s.name)}</span>
        <span class="row-sub" style="display:block">${esc([s.srcName !== 'Meine Notizbücher' ? s.srcName : '', s.notebook, s.group].filter(Boolean).join(' › '))}</span></span>
        ${cur && cur.id === s.id ? ic('check', 'i-sm') : ''}</button>`;
    let picker = '';
    if (!ON.configured()) {
      picker = `<p class="hint">${ic('info', 'i-sm')} Die Microsoft-Anmeldung ist für diese App noch nicht eingerichtet (SYNC-EINRICHTEN.md, Schritt 8). Du kannst aber einen Link einfügen.</p>`;
    } else if (!ON.connected() || ON.expired()) {
      picker = `<div class="empty" style="padding:14px">${ON.expired() ? 'Die Anmeldung bei Microsoft ist abgelaufen.' : 'Melde dich mit deinem Schulkonto an, dann kannst du den Abschnitt einfach auswählen.'}<br>
        <button type="button" class="btn btn-sm btn-primary" data-signin>${ic('lock', 'i-sm')} ${ON.expired() ? 'Erneut anmelden' : 'Mit Microsoft anmelden'}</button></div>`;
    } else if (!secs) {
      picker = '<div class="hint" data-loading style="padding:10px 4px">Notizbücher werden geladen …</div>';
    } else {
      const ranked = secs.map((s) => ({ s, v: score(sub, s) })).sort((a, b) => b.v - a.v || (b.s.modified || '').localeCompare(a.s.modified || ''));
      const good = ranked.filter((x) => x.v >= 3).slice(0, 6).map((x) => x.s);
      const errs = ON.sectionErrors();
      picker = `<div class="field"><input class="input" type="search" data-search placeholder="Abschnitt, Notizbuch oder Team suchen" autocomplete="off"></div>
        ${good.length ? `<div class="sec-title" data-good>Passt vermutlich zu ${esc(sub.name)}</div><div class="list" data-good>${good.map(sectionRow).join('')}</div>` : ''}
        <div class="sec-title">Alle Abschnitte (${secs.length})</div>
        <div class="list on-list" data-all>${secs.length ? ranked.map((x) => sectionRow(x.s)).join('') : '<div class="empty" style="padding:14px">Keine Notizbücher gefunden.</div>'}</div>
        <div class="hint" style="margin-top:6px">${ic('info', 'i-sm')} Nicht dabei? <button type="button" class="link-btn" data-reload>Neu laden</button>${errs.length ? ` · ${errs.length} ${errs.length === 1 ? 'Notizbuch' : 'Notizbücher'} nicht lesbar: ${esc(errs.slice(0, 2).join(' · '))}` : ''}</div>`;
    }
    const manual = cur && !cur.id ? cur : null;
    PL.openSheet(`${PL.sheetHead('OneNote verknüpfen', esc(sub.name))}
      ${picker}
      <details class="on-manual" ${!ON.configured() || manual ? 'open' : ''}>
        <summary>Oder Link einfügen</summary>
        <p class="hint" style="margin-top:6px">In OneNote den Abschnitt (oder eine Seite) gedrückt halten bzw. rechts anklicken → <b>„Link zu Abschnitt kopieren“</b> und hier einfügen.</p>
        <div class="field"><input class="input" data-url placeholder="https://…" value="${esc(manual ? manual.web : '')}" autocomplete="off" inputmode="url"></div>
        <div class="field"><input class="input" data-name placeholder="Name (z. B. Mathe – Kursnotizbuch)" value="${esc(manual ? manual.name : '')}" maxlength="60"></div>
        <button type="button" class="btn btn-sm" data-save-url>${ic('check', 'i-sm')} Link speichern</button>
      </details>
      <div class="sheet-foot">
        ${cur ? `<button type="button" class="btn btn-danger" data-unlink style="flex:0 0 auto">${ic('trash', 'i-sm')} Trennen</button>` : ''}
        <button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button>
      </div>`, {
      wide: true,
      onMount(sh) {
        const setLink = (link) => {
          sub.onenote = link;
          PL.upsertSubject(sub);
          if (link && link.id) {
            // Bekannte Seiten merken, damit nicht alles als „neu“ in den Neuigkeiten landet
            ON.loadPages(link, true).then((list) => { const c = cache(); c.known[link.id] = Object.fromEntries(list.map((p) => [p.id, 1])); saveCache(c); rerender(); }).catch(rerender);
          }
          PL.closeSheet();
          PL.toast(link ? `OneNote mit ${sub.name} verknüpft` : 'Verknüpfung entfernt');
        };
        const si = sh.querySelector('[data-signin]');
        if (si) si.onclick = () => ON.signIn({ hash: `#/fach/${sub.id}` });
        if (sh.querySelector('[data-loading]')) {
          ON.loadSections().then(() => { if (document.getElementById('sheet').contains(sh.querySelector('[data-loading]'))) ON.linkSheet(subjectId); })
            .catch((e) => { const el = sh.querySelector('[data-loading]'); if (el) { el.textContent = e.message; el.style.color = 'var(--danger)'; } });
        }
        const rl = sh.querySelector('[data-reload]');
        if (rl) rl.onclick = () => { rl.textContent = 'Lädt …'; ON.loadSections(true).then(() => ON.linkSheet(subjectId), (e) => { rl.textContent = e.message; }); };
        sh.querySelectorAll('[data-sec]').forEach((b) => {
          b.onclick = () => {
            const s = (ON.sections() || []).find((x) => x.id === b.dataset.sec);
            if (s) setLink({ src: s.src, srcName: s.srcName, id: s.id, name: s.name, notebook: s.notebook, group: s.group, web: s.web, app: s.app });
          };
        });
        const q = sh.querySelector('[data-search]');
        if (q) q.oninput = () => {
          const v = norm(q.value);
          sh.querySelectorAll('[data-good]').forEach((x) => { x.hidden = !!v; });
          sh.querySelectorAll('[data-all] [data-sec]').forEach((b) => { b.hidden = !!v && !b.dataset.q.includes(v); });
        };
        sh.querySelector('[data-save-url]').onclick = () => {
          const raw = sh.querySelector('[data-url]').value.trim();
          const m = raw.match(/(onenote:)?https?:\/\/\S+/i);
          if (!m) { PL.toast('Bitte füge einen OneNote-Link ein (beginnt mit https://)'); return; }
          const url = m[0].replace(/^onenote:/i, '');
          const name = sh.querySelector('[data-name]').value.trim() || 'OneNote';
          setLink({ web: url, app: /^onenote:/i.test(m[0]) ? m[0] : '', name });
        };
        const un = sh.querySelector('[data-unlink]');
        if (un) un.onclick = () => setLink(null);
      },
    });
  };

  /* ---------- Einstellungen ---------- */
  ON.settingsCard = function () {
    const t = read(TOK);
    const n = st().subjects.filter((s) => s.onenote).length;
    let rows;
    if (!ON.configured()) {
      rows = `<p class="hint" style="margin:0">${ic('info', 'i-sm')} Die Anmeldung mit dem Schulkonto ist noch nicht eingerichtet – das geht einmalig über eine App-Registrierung bei Microsoft (SYNC-EINRICHTEN.md, Schritt 8). Links zu Abschnitten kannst du schon jetzt bei jedem Fach eintragen.</p>
        <div class="opt-row"><div><div class="t">Weiterleitungs-Adresse</div><div class="d">Für die App-Registrierung</div></div><code class="on-code">${esc(ON.redirectUri())}</code></div>`;
    } else if (!t) {
      rows = `<div class="opt-row"><div><div class="t">Microsoft-Konto</div><div class="d">Mit dem Schulkonto anmelden, um Seiten in der App zu sehen</div></div><button class="btn btn-sm btn-primary" data-action="onenote-signin">${ic('lock', 'i-sm')} Anmelden</button></div>`;
    } else {
      rows = `<div class="opt-row"><div><div class="t">${esc(t.name || 'Microsoft-Konto')}</div><div class="d">${esc(t.email || '')}${ON.expired() ? '<br><span style="color:var(--danger)">Anmeldung abgelaufen – Microsoft verlangt das etwa einmal am Tag</span>' : ''}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${ON.expired() ? `<button class="btn btn-sm btn-primary" data-action="onenote-signin">${ic('refresh', 'i-sm')} Erneut anmelden</button>` : ''}<button class="btn btn-sm btn-ghost" data-action="onenote-signout">Abmelden</button></div></div>
        <div class="opt-row"><div><div class="t">Neue Seiten in den Neuigkeiten</div><div class="d">Für Fächer mit verknüpftem Abschnitt</div></div>
          <label class="switch"><input type="checkbox" data-setting="onenoteFeed" ${st().settings.onenoteFeed !== false ? 'checked' : ''}><span></span></label></div>`;
    }
    if (ON.error) rows += `<p class="hint" style="color:var(--danger);margin:8px 0 0">${esc(ON.error)}</p>${/freigeben/.test(ON.error) ? `<div class="opt-row"><div><div class="t">Link für die IT</div><div class="d">Damit kann ein Administrator die App freigeben</div></div><button class="btn btn-sm" data-action="onenote-consent-link">${ic('send', 'i-sm')} Kopieren</button></div>` : ''}`;
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${ic('notebook')} OneNote</h2><div class="card-sub">${n ? `${n} ${n === 1 ? 'Fach' : 'Fächer'} verknüpft` : 'Verknüpfen kannst du einen Abschnitt bei jedem Fach'}</div></div></div>
      ${rows}
    </section>`;
  };

  ON.setupSheet = function () {
    PL.infoSheet('OneNote noch nicht eingerichtet', [
      'Für die Anmeldung mit dem Schulkonto braucht Punktlandung einmalig eine App-Registrierung bei Microsoft (kostenlos).',
      'Die Anleitung steht in SYNC-EINRICHTEN.md, Schritt 8.',
      `Weiterleitungs-Adresse: ${ON.redirectUri()}`,
      'Bis dahin kannst du bei jedem Fach einen Link zu deinem OneNote-Abschnitt einfügen.',
    ]);
  };
  ON.errorSheet = function () {
    if (!ON.error) return;
    const consent = /freigeben/.test(ON.error);
    PL.openSheet(`${PL.sheetHead('Anmeldung bei Microsoft')}
      <p style="margin:0 0 12px">${esc(ON.error)}</p>
      ${consent ? `<p class="hint">Schick diesen Link an deine Lehrkraft oder die IT. Wer Administrator ist, kann Punktlandung damit für die ganze Schule freigeben:</p><code class="on-code" style="display:block;margin:6px 0 12px">${esc(ON.adminConsentUrl())}</code>` : ''}
      <div class="sheet-foot">
        ${consent ? `<button type="button" class="btn" data-copy>${ic('send', 'i-sm')} Link kopieren</button>` : `<button type="button" class="btn" data-again>${ic('refresh', 'i-sm')} Nochmal versuchen</button>`}
        <button type="button" class="btn btn-primary" data-action="close-sheet">OK</button>
      </div>`, {
      onMount(sh) {
        const c = sh.querySelector('[data-copy]'); if (c) c.onclick = () => copyConsent();
        const a = sh.querySelector('[data-again]'); if (a) a.onclick = () => ON.signIn();
      },
    });
  };
  function copyConsent() {
    const url = ON.adminConsentUrl();
    if (navigator.share && isTouch()) { navigator.share({ title: 'Punktlandung freigeben', text: 'Bitte gib die App Punktlandung (OneNote lesen) für unsere Schule frei:', url }).catch(() => {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => PL.toast('Link kopiert'), () => PL.toast(url));
  }

  PL.extraActions = Object.assign(PL.extraActions || {}, {
    'onenote-link': (d) => ON.linkSheet(d.subject),
    'onenote-open': (d) => { const s = PL.subject(d.subject); if (s && s.onenote) ON.openApp(s.onenote); },
    'onenote-signin': () => ON.signIn(),
    'onenote-signout': () => PL.confirmSheet('Bei Microsoft abmelden?', 'Die Verknüpfungen deiner Fächer bleiben erhalten. Seiten siehst du erst nach dem nächsten Anmelden wieder.', 'Abmelden', () => { ON.signOut(); PL.toast('Bei Microsoft abgemeldet'); }),
    'onenote-consent-link': () => copyConsent(),
    'onenote-more': (d) => { PL.ui.onenoteAll = d.subject; rerender(); },
    'onenote-page': (d) => {
      const s = PL.subject(d.subject);
      const p = s && s.onenote && ON.pagesOf(s.onenote);
      const page = p && p.list && p.list.find((x) => x.id === d.page);
      if (page) ON.pageSheet(s.onenote, page, s.id);
    },
  });

  // Beim Start und beim Zurückholen der App nach neuen Seiten sehen
  setTimeout(() => ON.check(), 2500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ON.check(); });
})();
