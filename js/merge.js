/* Zwei Datenstände zusammenführen (für die Synchronisierung)
   Drei-Wege-Vergleich: base = letzter gemeinsamer Stand, local = dieses Gerät, remote = Konto.
   - Nur auf einer Seite geändert → diese Änderung gilt.
   - Listen mit IDs (Noten, Fächer, Termine …) werden Eintrag für Eintrag zusammengeführt,
     neue Einträge von beiden Seiten bleiben erhalten.
   - Nur wenn dasselbe Feld auf beiden Seiten verschieden geändert wurde, gewinnt die neuere Änderung. */
(function (root) {
  // Listen, die als Ganzes gelten (Reihenfolge wichtig)
  const WHOLE = new Set(['settings.semesters', 'settings.periods']);

  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

  // Vergleich unabhängig von der Reihenfolge der Schlüssel (die Datenbank sortiert sie um)
  function same(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }

  function keyOf(items) {
    if (!items.length) return null;
    if (items.every((x) => isObj(x) && x.id != null)) return 'id';
    if (items.every((x) => isObj(x) && typeof x.slot === 'number')) return 'slot';
    return null;
  }

  function mergeSet(b, l, r) {
    const B = new Set(b), L = new Set(l), R = new Set(r);
    const out = l.filter((x) => R.has(x) || !B.has(x));        // hier vorhanden, dort nicht entfernt
    r.forEach((x) => { if (!L.has(x) && !B.has(x)) out.push(x); }); // dort neu
    return out;
  }

  function mergeList(b, l, r, k, path, localWins) {
    const map = (a) => new Map(a.map((x) => [x[k], x]));
    const B = map(b), L = map(l), R = map(r);
    const out = [];
    l.forEach((x) => {
      const id = x[k];
      if (R.has(id)) out.push(merge3(B.get(id), x, R.get(id), path, localWins));
      else if (!B.has(id) || !same(B.get(id), x)) out.push(x); // hier neu – oder dort gelöscht, hier aber geändert
    });
    r.forEach((x) => {
      const id = x[k];
      if (L.has(id)) return;
      if (!B.has(id) || !same(B.get(id), x)) out.push(x); // dort neu – oder hier gelöscht, dort aber geändert
    });
    return out;
  }

  function merge3(b, l, r, path, localWins) {
    if (same(l, r)) return l;
    if (same(b, l)) return r;
    if (same(b, r)) return l;
    // auf beiden Seiten unterschiedlich geändert
    if (Array.isArray(l) && Array.isArray(r) && !WHOLE.has(path)) {
      const bb = Array.isArray(b) ? b : [];
      const all = bb.concat(l, r);
      const k = keyOf(all);
      if (k) return mergeList(bb, l, r, k, path + '[]', localWins);
      if (all.every((x) => x === null || typeof x !== 'object')) return mergeSet(bb, l, r);
    } else if (isObj(l) && isObj(r)) {
      const bb = isObj(b) ? b : {};
      const out = {};
      new Set(Object.keys(l).concat(Object.keys(r))).forEach((key) => {
        const v = merge3(bb[key], l[key], r[key], path ? path + '.' + key : key, localWins);
        if (v !== undefined) out[key] = v;
      });
      return out;
    }
    return localWins ? l : r;
  }

  // doppelt übernommene Untis-Einträge (auf zwei Geräten gleichzeitig) nur einmal behalten
  function dedupeUntis(list) {
    const seen = new Set();
    return list.filter((x) => {
      if (!x || !x.untisId) return true;
      if (seen.has(x.untisId)) return false;
      seen.add(x.untisId);
      return true;
    });
  }

  /* base darf fehlen (z. B. nach einem Update) – dann bleiben Einträge von beiden Seiten erhalten */
  root.mergeStates = function (base, local, remote, localWins) {
    const out = merge3(isObj(base) ? base : {}, local || {}, remote || {}, '', !!localWins);
    if (Array.isArray(out.tasks)) out.tasks = dedupeUntis(out.tasks);
    if (Array.isArray(out.events)) out.events = dedupeUntis(out.events);
    if (Array.isArray(out.notes) && Array.isArray(out.deletedNotes)) {
      const dead = new Set(out.deletedNotes);
      out.notes = out.notes.filter((n) => !n || !dead.has(n.id));
    }
    return out;
  };
  root.sameData = same;
})(typeof PL !== 'undefined' ? PL : module.exports);
