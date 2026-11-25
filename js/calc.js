/* Notenberechnung & Abitur-Logik
   Block I:  Σ(Punkte × Gewicht) / Σ Gewicht × 40   (LK-Kurse doppelt)  → max. 600
   Block II: Prüfungsergebnis × Faktor (4×5 bzw. 5×4)                    → max. 300
   Abinote:  floor((1020 − E) / 18) / 10, mindestens 1,0               (KMK-Tabelle) */
(function () {
  const S = () => PL.state.settings;

  PL.tier = (p) => {
    if (p == null || isNaN(p)) return 0;
    const r = Math.round(p);
    if (r >= 13) return 1;
    if (r >= 10) return 2;
    if (r >= 7) return 3;
    if (r >= 4) return 4;
    return 5;
  };
  PL.toNote = (p) => (17 - p) / 3;
  PL.fmt = (n, d = 2) => (n == null || isNaN(n) ? '–' : n.toFixed(d).replace('.', ','));
  PL.fmtPts = (n) => (n == null ? '–' : (Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : PL.fmt(n, 1)));

  function wAvg(list) {
    let s = 0, w = 0;
    list.forEach((g) => { const wt = g.weight || 1; s += g.points * wt; w += wt; });
    return w ? s / w : null;
  }

  /* Rechnerische Halbjahresnote aus Einzelnoten (dezimal) */
  PL.semesterCalc = function (subjectId, sem) {
    const gs = PL.gradesOf(subjectId, sem);
    if (!gs.length) return null;
    const k = wAvg(gs.filter((g) => g.cat === 'K'));
    const o = wAvg(gs.filter((g) => g.cat !== 'K'));
    if (k != null && o != null) {
      const sh = S().klausurShare / 100;
      return k * sh + o * (1 - sh);
    }
    return k != null ? k : o;
  };

  /* Tatsächliche Halbjahresnote (Zeugnisnote oder gerundete Rechnung) */
  PL.semesterActual = function (subjectId, sem) {
    const ov = PL.getOverride(subjectId, sem);
    if (ov.points != null) return { points: ov.points, decimal: ov.points, source: 'override' };
    const c = PL.semesterCalc(subjectId, sem);
    if (c == null) return null;
    return { points: Math.round(c), decimal: c, source: 'calc' };
  };

  PL.subjectAvg = function (subjectId) {
    const vals = [];
    for (let sem = 0; sem < 4; sem++) {
      const a = PL.semesterActual(subjectId, sem);
      if (a) vals.push(a.decimal);
    }
    if (!vals.length) return null;
    return vals.reduce((x, y) => x + y, 0) / vals.length;
  };

  /* Gesamtschnitt (LK doppelt gewichtet); optional nur ein Halbjahr */
  PL.overallAvg = function (sem) {
    let s = 0, w = 0;
    PL.state.subjects.forEach((sub) => {
      let v = null;
      if (sem == null) v = PL.subjectAvg(sub.id);
      else { const a = PL.semesterActual(sub.id, sem); v = a ? a.decimal : null; }
      if (v == null) return;
      const wt = sub.lk ? S().lkWeight : 1;
      s += v * wt; w += wt;
    });
    return w ? s / w : null;
  };

  PL.prognosisFor = function (subjectId) {
    if (!S().prognosis) return null;
    const a = PL.subjectAvg(subjectId);
    if (a != null) return a;
    return PL.overallAvg();
  };

  /* Zelle in Block I: real / prog / leer */
  PL.semesterCell = function (subjectId, sem, fill) {
    const out = !!PL.getOverride(subjectId, sem).out;
    const a = PL.semesterActual(subjectId, sem);
    if (a) return Object.assign({ kind: 'real', out }, a);
    const p = fill != null ? fill : PL.prognosisFor(subjectId);
    if (p == null) return { kind: 'empty', out, points: null };
    return { kind: 'prog', out, points: fill != null ? p : Math.round(p), decimal: p };
  };

  PL.blockI = function (fill) {
    let sum = 0, w = 0, inCount = 0, real = 0, prog = 0, under5 = 0, under5LK = 0, zeros = 0;
    PL.state.subjects.forEach((sub) => {
      for (let sem = 0; sem < 4; sem++) {
        const c = PL.semesterCell(sub.id, sem, fill);
        if (c.out || c.points == null) continue;
        const wt = sub.lk ? S().lkWeight : 1;
        sum += c.points * wt; w += wt; inCount++;
        if (c.kind === 'real') real++; else prog++;
        if (c.points < 5) { under5++; if (sub.lk) under5LK++; }
        if (c.points === 0) zeros++;
      }
    });
    if (!w) return { points: null, max: 600, avg: null, inCount, real, prog, under5, under5LK, zeros };
    const avg = sum / w;
    return { points: Math.round(avg * 40), max: 600, avg, inCount, real, prog, under5, under5LK, zeros };
  };

  PL.examResult = function (slot, fill) {
    const e = PL.state.exams[slot];
    const sub = e && e.subjectId ? PL.subject(e.subjectId) : null;
    if (!sub) return { sub: null, kind: 'none', value: null };
    let value = null, kind = 'real';
    if (e.s != null && e.m != null) value = (2 * e.s + e.m) / 3;
    else if (e.s != null) value = e.s;
    else if (e.m != null) value = e.m;
    else {
      kind = 'prog';
      value = fill != null ? fill : PL.prognosisFor(sub.id);
      if (value == null) kind = 'empty';
    }
    return { sub, kind, value, s: e.s, m: e.m };
  };

  PL.blockII = function (fill) {
    const n = S().examCount, f = S().examFactor;
    let sum = 0, any = false, prog = 0, real = 0, over5 = 0, over5LK = false;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const r = PL.examResult(i, fill);
      rows.push(r);
      if (r.value == null) continue;
      any = true;
      sum += r.value * f;
      if (r.kind === 'prog') prog++; else real++;
      if (r.value * f >= 25 - 1e-9) { over5++; if (r.sub && r.sub.lk) over5LK = true; }
    }
    return { points: any ? Math.round(sum) : null, max: n * 15 * f, rows, prog, real, over5, over5LK, assigned: rows.filter((r) => r.sub).length };
  };

  PL.abiNote = function (E) {
    if (E == null) return null;
    const t = Math.floor((1020 - E) / 18);
    return Math.max(10, t) / 10;
  };

  PL.total = function (fill) {
    const b1 = PL.blockI(fill), b2 = PL.blockII(fill);
    if (b1.points == null && b2.points == null) return { b1, b2, points: null, note: null };
    const E = (b1.points || 0) + (b2.points || 0);
    return { b1, b2, points: E, max: 900, note: PL.abiNote(E), passed: E >= 300, hasProg: b1.prog > 0 || b2.prog > 0 };
  };

  PL.requirements = function () {
    const b1 = PL.blockI(), b2 = PL.blockII();
    const n = S().examCount;
    const st = (cond, has) => (has ? (cond ? 'ok' : 'bad') : 'na');
    return [
      { s: st(b1.points >= 200, b1.points != null), t: 'Block I: mindestens 200 Punkte', d: b1.points != null ? `Aktuell ${b1.points} von 600` : 'Noch keine Halbjahresnoten' },
      { s: st(b1.zeros === 0, b1.inCount > 0), t: 'Kein eingebrachter Kurs mit 0 Punkten', d: b1.zeros ? `${b1.zeros} Kurs(e) mit 0 Punkten` : 'Alles gut' },
      { s: st(b1.under5 <= 8 && b1.under5LK <= 3, b1.inCount > 0), t: 'Höchstens 8 Kurse unter 5 Punkten', d: `${b1.under5} unter 5 Punkten (davon ${b1.under5LK} LK, max. 3)` },
      { s: st(b2.points >= 100, b2.points != null), t: 'Block II: mindestens 100 Punkte', d: b2.points != null ? `Aktuell ${b2.points} von ${b2.max}` : 'Noch keine Prüfungsfächer' },
      { s: st(b2.over5 >= 2 && b2.over5LK, b2.assigned === n), t: 'Mind. 2 Prüfungen mit ≥ 5 Punkten, davon ein LK', d: b2.assigned === n ? `${b2.over5} Prüfung(en) mit ≥ 5 Punkten` : `Erst ${b2.assigned} von ${n} Prüfungsfächern gewählt` },
    ];
  };

  /* Ziel-Rechner: Welchen Schnitt brauche ich in allen offenen Kursen/Prüfungen? */
  PL.goal = function (targetNote) {
    const T = Math.round(targetNote * 10);
    const need = 1020 - 18 * (T + 1) + 1;
    let open = 0;
    PL.state.subjects.forEach((sub) => {
      for (let sem = 0; sem < 4; sem++) {
        if (!PL.getOverride(sub.id, sem).out && !PL.semesterActual(sub.id, sem)) open++;
      }
    });
    for (let i = 0; i < S().examCount; i++) {
      const r = PL.examResult(i, 0);
      if (r.sub && r.kind === 'prog') open++;
    }
    const at = (x) => PL.total(x).points || 0;
    if (!open) return { open, need, reached: at(0) >= need, current: at(0) };
    if (at(15) < need) return { open, need, impossible: true };
    if (at(0) >= need) return { open, need, secured: true };
    let lo = 0, hi = 15;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (at(mid) >= need) hi = mid; else lo = mid; }
    return { open, need, x: hi };
  };

  /* Statistiken */
  PL.timeline = function () {
    const gs = PL.state.grades.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let s = 0;
    return gs.map((g, i) => { s += g.points; return { date: g.date, avg: s / (i + 1), points: g.points }; });
  };
  PL.distribution = function () {
    const d = new Array(16).fill(0);
    PL.state.grades.forEach((g) => { if (g.points >= 0 && g.points <= 15) d[g.points]++; });
    return d;
  };
})();
