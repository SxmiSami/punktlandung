/* Konto & Synchronisierung über Supabase
   - Alle Daten liegen weiterhin lokal (funktioniert offline).
   - Mit Konto wird der komplette Stand als ein Datensatz pro Nutzer gespeichert.
   - Abgleich: beim Start, beim Zurückkehren in die App, alle 30 s und nach jeder Änderung.
   - Wurde auf beiden Seiten etwas geändert, werden die Stände zusammengeführt (js/merge.js):
     Änderungen von beiden Geräten bleiben erhalten. Nur wenn dasselbe Feld auf beiden Seiten
     verschieden geändert wurde, gewinnt die neuere Änderung.
   - Hochladen nur, wenn der Stand im Konto noch der ist, den dieses Gerät zuletzt kannte –
     sonst erst neu abholen und zusammenführen (kein Überschreiben fremder Änderungen). */
(function () {
  const cfg = window.PL_CONFIG || {};
  const META_KEY = 'punktlandung:sync';
  const BASE_KEY = 'punktlandung:sync-base'; // letzter gemeinsamer Stand mit dem Konto
  const S = PL.sync = { enabled: false, client: null, user: null, status: 'off', lastSync: null, error: null };

  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { meta = {}; }
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignorieren */ } };
  const loadBase = () => { try { return JSON.parse(localStorage.getItem(BASE_KEY)); } catch (e) { return null; } };
  const saveBase = (d) => {
    try { if (d == null) localStorage.removeItem(BASE_KEY); else localStorage.setItem(BASE_KEY, JSON.stringify(d)); }
    catch (e) { try { localStorage.removeItem(BASE_KEY); } catch (e2) { /* ohne Basis wird beim Zusammenführen nichts gelöscht */ } }
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const sheetOpen = () => !document.getElementById('sheetLayer').hidden;

  /* ---- Status-Anzeige ---- */
  PL.syncLabel = function () {
    if (!S.enabled) return 'Nicht eingerichtet';
    if (!S.user) return 'Nicht angemeldet';
    switch (S.status) {
      case 'syncing': return 'Synchronisiere …';
      case 'offline': return 'Offline – wird später synchronisiert';
      case 'error': return 'Fehler beim Synchronisieren';
      case 'ok': return 'Synchronisiert' + (S.lastSync ? ' · ' + new Date(S.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');
      default: return 'Angemeldet';
    }
  };
  PL.syncDot = () => (S.enabled && S.user ? `<span class="sync-dot" data-sync-dot data-s="${S.status}"></span>` : '');
  function setStatus(s, err) {
    S.status = s;
    S.error = err || null;
    if (s === 'ok') S.lastSync = Date.now();
    document.querySelectorAll('[data-sync-dot]').forEach((el) => (el.dataset.s = s));
    document.querySelectorAll('[data-sync-label]').forEach((el) => (el.textContent = PL.syncLabel()));
  }

  const hasData = (st) => !!(st && Array.isArray(st.subjects) && st.subjects.length);

  /* Lokale Änderungen merken und hochladen */
  let seq = 0; // zählt lokale Änderungen (auch während gerade hochgeladen wird)
  PL.onChange((opts) => {
    if (opts.fromRemote) return;
    seq++;
    meta.dirty = true;
    meta.changedAt = Date.now();
    saveMeta();
    if (S.user) schedulePush();
  });
  let pushTimer = null;
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(() => S.syncNow(), 1200); }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return;

  S.enabled = true;
  // vor dem Anlegen des Clients merken – Supabase liest den Link danach aus der Adresse
  let signupLink = /type=signup/.test(location.hash + location.search);
  S.client =window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const table = () => S.client.from('user_data');
  const redirect = () => location.origin + location.pathname;

  let busy = false, again = false, conflicts = 0;
  // opts.force: auch abgleichen, wenn gerade ein Fenster offen ist (beim Abmelden)
  S.syncNow = async function (opts) {
    const force = !!(opts && opts.force);
    if (!S.user) return;
    if (!force && sheetOpen()) return; // während einer Eingabe nicht abgleichen
    if (busy) { again = true; return; }
    if (!navigator.onLine) { setStatus('offline'); return; }
    busy = true;
    setStatus('syncing');
    try {
      const { data: row, error } = await table().select('data, updated_at').eq('user_id', S.user.id).maybeSingle();
      if (error) throw error;
      if (meta.userId !== S.user.id) { meta.userId = S.user.id; meta.remoteStamp = null; saveBase(null); saveMeta(); }

      let ok = true;
      if (!row) {
        ok = await push(null);
      } else if (row.updated_at === meta.remoteStamp) {
        if (meta.dirty) ok = await push(row.updated_at); else setStatus('ok');
      } else if (meta.remoteStamp == null) {
        // erster Abgleich auf diesem Gerät
        if (hasData(PL.state) && hasData(row.data)) { setStatus('ok'); askWhichData(row); }
        else if (hasData(PL.state)) ok = await push(row.updated_at);
        else apply(row);
      } else if (meta.dirty) {
        // auf beiden Seiten etwas geändert → zusammenführen statt überschreiben
        if (!force && sheetOpen()) setStatus('ok');
        else { mergeRemote(row); ok = await push(row.updated_at); }
      } else {
        apply(row);
      }
      if (ok) conflicts = 0;
      else if (++conflicts <= 3) again = true; // ein anderes Gerät war schneller → neu abholen und zusammenführen
      else { conflicts = 0; setStatus('error', 'Abgleich gerade nicht möglich – wird später erneut versucht'); }
    } catch (e) {
      setStatus(navigator.onLine ? 'error' : 'offline', e && e.message);
    } finally {
      busy = false;
      if (again) { again = false; S.syncNow(); }
    }
  };

  /* Hochladen – aber nur, wenn im Konto noch der Stand `expected` liegt.
     Gibt false zurück, wenn inzwischen ein anderes Gerät etwas hochgeladen hat. */
  async function push(expected) {
    const mySeq = seq;
    const snap = clone(PL.state);
    const stamp = new Date().toISOString();
    const res = expected == null
      ? await table().insert({ user_id: S.user.id, data: snap, updated_at: stamp }).select('updated_at').maybeSingle()
      : await table().update({ data: snap, updated_at: stamp }).eq('user_id', S.user.id).eq('updated_at', expected).select('updated_at').maybeSingle();
    if (res.error) {
      if (res.error.code === '23505') return false; // Datensatz gibt es schon
      throw res.error;
    }
    if (!res.data) return false;
    meta.remoteStamp = res.data.updated_at;
    saveBase(snap);
    if (seq === mySeq) meta.dirty = false; else schedulePush(); // während des Hochladens geändert
    saveMeta();
    setStatus('ok');
    return true;
  }

  function mergeRemote(row) {
    const remote = row.data || PL.emptyState();
    const localWins = (meta.changedAt || 0) > Date.parse(row.updated_at);
    const merged = PL.mergeStates(loadBase(), clone(PL.state), remote, localWins);
    // ab jetzt ist der Konto-Stand die gemeinsame Basis; die eigenen Änderungen bleiben „ungespeichert“
    meta.remoteStamp = row.updated_at;
    saveBase(remote);
    saveMeta();
    PL.replaceState(merged, { fromRemote: true });
  }

  function apply(row) {
    // Nicht mitten in einer Eingabe die Daten austauschen – nächster Abgleich holt es nach
    if (sheetOpen()) { setStatus('ok'); return; }
    meta.remoteStamp = row.updated_at;
    meta.dirty = false;
    saveBase(row.data || null);
    saveMeta();
    PL.replaceState(row.data || PL.emptyState(), { fromRemote: true });
    setStatus('ok');
  }

  function askWhichData(row) {
    const count = (st) => `${(st.subjects || []).length} Fächer, ${(st.grades || []).length} Noten`;
    PL.openSheet(`${PL.sheetHead('Welche Daten behalten?')}
      <p style="margin:0 0 16px;color:var(--text-2)">In deinem Konto und auf diesem Gerät sind unterschiedliche Noten gespeichert. Welcher Stand soll ab jetzt auf allen Geräten gelten?</p>
      <div style="display:grid;gap:10px">
        <button type="button" class="btn btn-primary" data-pick="remote" style="height:auto;padding:12px;flex-direction:column;gap:2px">Daten aus meinem Konto<small style="font-weight:600;opacity:.8">${count(row.data || {})}</small></button>
        <button type="button" class="btn" data-pick="local" style="height:auto;padding:12px;flex-direction:column;gap:2px">Daten von diesem Gerät<small style="font-weight:600;opacity:.7">${count(PL.state)}</small></button>
      </div>`, {
      onMount(sh) {
        sh.querySelector('[data-pick="remote"]').onclick = () => { PL.closeSheet(); setTimeout(() => { apply(row); PL.toast('Daten aus deinem Konto geladen'); }, 230); };
        sh.querySelector('[data-pick="local"]').onclick = async () => {
          PL.closeSheet();
          try {
            setStatus('syncing');
            if (await push(row.updated_at)) PL.toast('Daten dieses Geräts gespeichert'); else S.syncNow();
          } catch (e) { setStatus('error', e.message); }
        };
      },
    });
  }

  /* ---- Konto ---- */
  function germanError(err) {
    const m = (err && err.message) || String(err || '');
    if (/invalid login credentials/i.test(m)) return 'E-Mail oder Passwort ist falsch.';
    if (/email not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link im Postfach).';
    if (/already registered|already been registered/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
    if (/password should be at least|at least 6/i.test(m)) return 'Das Passwort muss mindestens 6 Zeichen lang sein.';
    if (/should be different from the old/i.test(m)) return 'Das neue Passwort muss sich vom alten unterscheiden.';
    if (/weak|pwned|leaked/i.test(m)) return 'Dieses Passwort ist zu leicht zu erraten. Nimm ein anderes.';
    if (/reauthentication|nonce/i.test(m)) return 'Bitte melde dich neu an und versuche es dann noch einmal.';
    if (/valid email|invalid email|unable to validate email/i.test(m)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (/rate limit|too many/i.test(m)) return 'Zu viele Versuche. Warte kurz und probier es dann noch einmal.';
    if (/failed to fetch|network/i.test(m)) return 'Keine Verbindung. Bist du online?';
    return m || 'Unbekannter Fehler.';
  }

  S.signIn = async (email, password) => {
    const { error } = await S.client.auth.signInWithPassword({ email, password });
    return error ? germanError(error) : null;
  };
  S.signUp = async (email, password) => {
    const { data, error } = await S.client.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } });
    if (error) return { error: germanError(error) };
    return { needsConfirm: !data.session };
  };
  S.resetPassword = async (email) => {
    const { error } = await S.client.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
    return error ? germanError(error) : null;
  };
  S.updatePassword = async (password) => {
    const { error } = await S.client.auth.updateUser({ password });
    return error ? germanError(error) : null;
  };
  // Passwort ändern, während man angemeldet ist: erst das aktuelle Passwort prüfen
  S.changePassword = async (current, next) => {
    const email = S.user && S.user.email;
    if (!email) return 'Du bist nicht angemeldet.';
    const { error: checkErr } = await S.client.auth.signInWithPassword({ email, password: current });
    if (checkErr) return /invalid login credentials/i.test(checkErr.message || '') ? 'Das aktuelle Passwort ist falsch.' : germanError(checkErr);
    const { error } = await S.client.auth.updateUser({ password: next });
    return error ? germanError(error) : null;
  };
  S.signOut = async () => {
    if (meta.dirty && meta.remoteStamp != null && S.user && navigator.onLine) { try { await S.syncNow({ force: true }); } catch (e) { /* trotzdem abmelden */ } }
    await S.client.auth.signOut();
    meta = {};
    saveMeta();
    saveBase(null);
    PL.replaceState(PL.emptyState(), { fromRemote: true });
  };

  /* Nach dem Anmelden/Registrieren: sobald das Fenster zu ist, Daten aus dem Konto holen.
     Anmelden → direkt zur Übersicht (mit den Fächern aus dem Konto).
     Registrieren → neues Konto ist leer, also gleich Fächer einrichten. */
  S.afterAuth = function (kind) {
    S.loading = kind === 'login' && !hasData(PL.state);
    if (S.loading) PL.render && PL.render();
    setTimeout(async () => {
      try { await S.syncNow(); } catch (e) { /* Status zeigt den Fehler */ }
      S.loading = false;
      if (kind === 'signup' && !hasData(PL.state)) { PL.startSetup(); return; }
      if (/^#\/setup/.test(location.hash)) { PL.ui.setup = null; location.hash = '#/'; }
      else PL.render && PL.render();
    }, 240); // Fenster schließt in 200 ms – vorher würde der Abgleich übersprungen
  };

  S.client.auth.onAuthStateChange((event, session) => {
    S.user = session ? session.user : null;
    S.authReady = true;  // Anmeldestatus ist bekannt (für „Was ist neu“)
    // Rückkehr über den Bestätigungslink aus der Registrierungs-E-Mail (nur einmal)
    const fromSignupLink = signupLink && !!S.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');
    if (fromSignupLink) signupLink = false;
    // Supabase-Aufrufe nicht direkt im Callback ausführen
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') PL.newPasswordSheet();
      if (fromSignupLink) S.afterAuth('signup');
      else if (S.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) S.syncNow();
      if (!S.user) setStatus('off');
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');
        PL.render && PL.render();
      }
    }, 0);
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') S.syncNow(); });
  window.addEventListener('online', () => S.syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') S.syncNow(); }, 30000);
})();
