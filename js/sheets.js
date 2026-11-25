/* Bottom-Sheets / Dialoge */
(function () {
  const esc = PL.esc, ic = PL.icon;
  const st = () => PL.state;

  PL.pointsPicker = function (value, opts = {}) {
    let h = '<div class="points" data-picker>';
    for (let p = 15; p >= 0; p--) {
      h += `<button type="button" class="pt ${value === p ? 'on' : ''}" data-tier="${PL.tier(p)}" data-p="${p}" aria-label="${p} Punkte"><b>${p}</b><small>${PL.NOTE_LABEL[p]}</small></button>`;
    }
    if (opts.clear) h += `<button type="button" class="pt pt-clear" data-p="">${ic('x', 'i-sm')} ${opts.clear}</button>`;
    return h + '</div>';
  };
  function bindPicker(root, onPick) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.pt');
      if (!b || !root.contains(b)) return;
      root.querySelectorAll('.pt').forEach((x) => x.classList.toggle('on', x === b && b.dataset.p !== ''));
      onPick(b.dataset.p === '' ? null : Number(b.dataset.p));
    });
  }
  function bindSeg(root, onPick) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || !root.contains(b)) return;
      root.querySelectorAll('button[data-v]').forEach((x) => x.classList.toggle('on', x === b));
      onPick(b.dataset.v);
    });
  }
  const segHtml = (opts, val) => opts.map(([v, l]) => `<button type="button" class="${String(v) === String(val) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('');

  /* ---------- Note eintragen / bearbeiten ---------- */
  PL.gradeSheet = function (opts = {}) {
    const subs = PL.sortedSubjects();
    if (!subs.length) { PL.toast('Lege zuerst deine Fächer an'); PL.startSetup(); return; }
    const existing = opts.id ? st().grades.find((g) => g.id === opts.id) : null;
    const f = existing ? Object.assign({}, existing) : {
      subjectId: opts.subjectId || (subs[0] && subs[0].id),
      sem: opts.sem != null ? Number(opts.sem) : st().settings.currentSem,
      cat: opts.cat || 'K', points: null, date: PL.today(), title: opts.title || '', weight: 1,
    };
    const html = `
      ${PL.sheetHead(existing ? 'Note bearbeiten' : 'Neue Note')}
      <div class="field"><span class="field-label">Fach</span>
        <div class="chips" data-subjects>${subs.map((s) => `<button type="button" class="chip chip-subj ${s.id === f.subjectId ? 'on' : ''}" style="--c:${s.color}" data-id="${s.id}"><span class="sw"></span>${esc(s.short)} · ${esc(s.name)}</button>`).join('')}</div>
      </div>
      <div class="field"><span class="field-label">Halbjahr</span><div class="seg seg-block" data-seg="sem">${segHtml(st().settings.semesters.map((n, i) => [i, esc(n)]), f.sem)}</div></div>
      <div class="field"><span class="field-label">Art</span><div class="seg seg-block" data-seg="cat">${segHtml([['K', 'Klausur'], ['S', 'Sonstige Mitarbeit']], f.cat)}</div></div>
      <div class="field"><span class="field-label">Punkte</span>${PL.pointsPicker(f.points)}</div>
      <div class="field-row">
        <div class="field"><label for="gTitle">Bezeichnung</label><input id="gTitle" class="input" value="${esc(f.title)}" placeholder="z. B. 1. Klausur" maxlength="60"></div>
        <div class="field"><label for="gDate">Datum</label><input id="gDate" class="input" type="date" value="${esc(f.date)}"></div>
      </div>
      <div class="field"><span class="field-label">Gewichtung</span><div class="seg" data-seg="weight">${segHtml([[0.5, '½×'], [1, '1×'], [2, '2×']], f.weight || 1)}</div></div>
      <div class="sheet-foot">
        ${existing ? `<button type="button" class="btn btn-danger" data-del style="flex:0 0 auto">${ic('trash', 'i-sm')}</button>` : ''}
        <button type="button" class="btn btn-primary" data-save>${ic('check', 'i-sm')} Speichern</button>
      </div>`;
    PL.openSheet(html, {
      onMount(sh) {
        sh.querySelector('[data-subjects]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-id]'); if (!b) return;
          f.subjectId = b.dataset.id;
          sh.querySelectorAll('[data-subjects] .chip').forEach((x) => x.classList.toggle('on', x === b));
        });
        const sel = sh.querySelector('[data-subjects] .on');
        if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
        bindSeg(sh.querySelector('[data-seg="sem"]'), (v) => { f.sem = Number(v); });
        bindSeg(sh.querySelector('[data-seg="cat"]'), (v) => { f.cat = v; });
        bindSeg(sh.querySelector('[data-seg="weight"]'), (v) => { f.weight = Number(v); });
        bindPicker(sh.querySelector('[data-picker]'), (p) => { f.points = p; });
        sh.querySelector('[data-save]').onclick = () => {
          if (f.points == null) { PL.toast('Bitte wähle die Punkte aus'); return; }
          f.title = sh.querySelector('#gTitle').value.trim();
          f.date = sh.querySelector('#gDate').value || PL.today();
          PL.upsertGrade(f);
          if (opts.eventId) PL.deleteEvent(opts.eventId);
          PL.closeSheet();
          const sub = PL.subject(f.subjectId);
          PL.toast(`${f.points} Punkte in ${sub ? sub.name : 'Fach'} gespeichert`);
        };
        const del = sh.querySelector('[data-del]');
        if (del) del.onclick = () => {
          const g = PL.deleteGrade(existing.id);
          PL.closeSheet();
          PL.toast('Note gelöscht', () => PL.upsertGrade(g));
        };
      },
    });
  };

  /* ---------- Fach anlegen / bearbeiten ---------- */
  PL.subjectSheet = function (id) {
    const ex = id ? PL.subject(id) : null;
    const f = ex ? Object.assign({}, ex) : { short: '', name: '', teacher: '', lk: false, color: PL.COLORS[(st().subjects.length * 3) % PL.COLORS.length] };
    const html = `
      ${PL.sheetHead(ex ? 'Fach bearbeiten' : 'Neues Fach')}
      <div class="field-row" style="grid-template-columns:96px 1fr">
        <div class="field"><label for="sShort">Kürzel</label><input id="sShort" class="input" value="${esc(f.short)}" maxlength="4" placeholder="D" style="text-transform:uppercase" autofocus></div>
        <div class="field"><label for="sName">Name</label><input id="sName" class="input" value="${esc(f.name)}" maxlength="40" placeholder="Deutsch"></div>
      </div>
      <div class="field"><label for="sTeacher">Lehrkraft</label><input id="sTeacher" class="input" value="${esc(f.teacher || '')}" maxlength="40" placeholder="Optional"></div>
      <div class="opt-row" style="padding-top:0"><div><div class="t">Leistungskurs</div><div class="d">Zählt in Block I doppelt</div></div><label class="switch"><input type="checkbox" id="sLk" ${f.lk ? 'checked' : ''}><span></span></label></div>
      <div class="field" style="margin-top:8px"><span class="field-label">Farbe</span>
        <div class="color-pick">${PL.COLORS.map((c) => `<button type="button" class="${c === f.color ? 'on' : ''}" style="--c:${c}" data-c="${c}" aria-label="Farbe ${c}"></button>`).join('')}</div></div>
      <div class="sheet-foot">
        ${ex ? `<button type="button" class="btn btn-danger" data-del style="flex:0 0 auto">${ic('trash', 'i-sm')}</button>` : ''}
        <button type="button" class="btn btn-primary" data-save>${ic('check', 'i-sm')} Speichern</button>
      </div>`;
    PL.openSheet(html, {
      onMount(sh) {
        sh.querySelector('.color-pick').addEventListener('click', (e) => {
          const b = e.target.closest('[data-c]'); if (!b) return;
          f.color = b.dataset.c;
          sh.querySelectorAll('.color-pick button').forEach((x) => x.classList.toggle('on', x === b));
        });
        sh.querySelector('[data-save]').onclick = () => {
          f.short = sh.querySelector('#sShort').value.trim().toUpperCase();
          f.name = sh.querySelector('#sName').value.trim();
          f.teacher = sh.querySelector('#sTeacher').value.trim();
          f.lk = sh.querySelector('#sLk').checked;
          if (!f.name) { PL.toast('Bitte gib einen Namen ein'); return; }
          if (!f.short) f.short = f.name.slice(0, 2).toUpperCase();
          PL.upsertSubject(f);
          PL.closeSheet();
          PL.toast(ex ? 'Fach aktualisiert' : `${f.name} angelegt`);
        };
        const del = sh.querySelector('[data-del]');
        if (del) del.onclick = () => {
          const n = PL.gradesOf(ex.id).length;
          PL.confirmSheet('Fach löschen?', `„${ex.name}“ und ${n} Note${n === 1 ? '' : 'n'} werden dauerhaft entfernt.`, 'Löschen', () => {
            PL.deleteSubject(ex.id);
            location.hash = '#/faecher';
            PL.toast('Fach gelöscht');
          });
        };
      },
    });
  };

  /* ---------- Halbjahresnote (Block-I-Zelle) ---------- */
  PL.cellSheet = function (subjectId, sem) {
    sem = Number(sem);
    const sub = PL.subject(subjectId);
    if (!sub) return;
    const ov = PL.getOverride(subjectId, sem);
    const calc = PL.semesterCalc(subjectId, sem);
    const n = PL.gradesOf(subjectId, sem).length;
    const prog = PL.prognosisFor(subjectId);
    const html = `
      ${PL.sheetHead(`${esc(sub.name)} · ${esc(PL.semName(sem))}`, sub.lk ? 'Leistungskurs – zählt doppelt' : 'Grundkurs')}
      <div class="halfyear-box" style="margin-bottom:16px">
        <div style="flex:1">
          <div style="font-weight:800">${calc != null ? `Rechnerisch ${PL.fmt(calc, 2)} Punkte` : 'Noch keine Einzelnoten'}</div>
          <div class="hint">${calc != null ? `aus ${n} Note${n === 1 ? '' : 'n'} · gerundet ${Math.round(calc)}` : prog != null && st().settings.prognosis ? `Prognose: ${PL.fmt(prog, 1)} Punkte` : 'Trag Noten ein oder setze direkt die Zeugnisnote.'}</div>
        </div>
        <a class="btn btn-sm" href="#/fach/${sub.id}" data-goto-sem="${sem}">Noten ${ic('chevron-right', 'i-sm')}</a>
      </div>
      <div class="field"><span class="field-label">Zeugnisnote (überschreibt die Rechnung)</span>${PL.pointsPicker(ov.points != null ? ov.points : null, { clear: 'Keine Zeugnisnote – automatisch berechnen' })}</div>
      <div class="opt-row"><div><div class="t">In Block I einbringen</div><div class="d">Abwählen, wenn du diesen Kurs nicht einbringst</div></div>
        <label class="switch"><input type="checkbox" id="cIn" ${ov.out ? '' : 'checked'}><span></span></label></div>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button></div>`;
    PL.openSheet(html, {
      onMount(sh) {
        bindPicker(sh.querySelector('[data-picker]'), (p) => PL.setOverride(subjectId, sem, { points: p }));
        sh.querySelector('#cIn').onchange = (e) => PL.setOverride(subjectId, sem, { out: !e.target.checked });
        sh.querySelector('[data-goto-sem]').onclick = () => { PL.ui.detailSem = sem; PL.ui.detailFor = subjectId; PL.closeSheet(); };
      },
    });
  };

  /* ---------- Abiturprüfung ---------- */
  PL.examSheet = function (slot) {
    slot = Number(slot);
    const e = st().exams[slot];
    const subs = PL.sortedSubjects();
    const used = st().exams.filter((x) => x.slot !== slot && x.slot < st().settings.examCount).map((x) => x.subjectId);
    const html = `
      ${PL.sheetHead(`Prüfung P${slot + 1}`, `Zählt ${st().settings.examFactor}-fach in Block II`)}
      <div class="field"><label for="eSub">Prüfungsfach</label>
        <select id="eSub" class="select"><option value="">– wählen –</option>${subs.map((s) => `<option value="${s.id}" ${s.id === e.subjectId ? 'selected' : ''} ${used.includes(s.id) ? 'disabled' : ''}>${esc(s.short)} · ${esc(s.name)}${s.lk ? ' (LK)' : ''}</option>`).join('')}</select></div>
      <div class="field"><span class="field-label">Schriftlich (S)</span><div data-pk="s">${PL.pointsPicker(e.s, { clear: 'Noch kein Ergebnis' })}</div></div>
      <div class="field"><span class="field-label">Mündlich (M) – nur bei mündlicher Prüfung oder Nachprüfung</span><div data-pk="m">${PL.pointsPicker(e.m, { clear: 'Keine mündliche Prüfung' })}</div></div>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-action="close-sheet">Fertig</button></div>`;
    PL.openSheet(html, {
      onMount(sh) {
        sh.querySelector('#eSub').onchange = (ev) => { e.subjectId = ev.target.value || null; PL.save(); };
        bindPicker(sh.querySelector('[data-pk="s"]'), (p) => { e.s = p; PL.save(); });
        bindPicker(sh.querySelector('[data-pk="m"]'), (p) => { e.m = p; PL.save(); });
      },
    });
  };

  /* ---------- Termin ---------- */
  PL.eventSheet = function (id) {
    const ex = id ? st().events.find((x) => x.id === id) : null;
    const subs = PL.sortedSubjects();
    const f = ex ? Object.assign({}, ex) : { subjectId: subs[0] ? subs[0].id : null, type: 'Klausur', title: '', date: PL.isoDate(new Date(Date.now() + 7 * 864e5)) };
    const html = `
      ${PL.sheetHead(ex ? 'Termin bearbeiten' : 'Neuer Termin')}
      <div class="field"><span class="field-label">Art</span><div class="seg" data-seg="type" style="display:flex">${segHtml(PL.EVENT_TYPES.map((t) => [t, t]), f.type)}</div></div>
      <div class="field"><label for="evSub">Fach</label><select id="evSub" class="select"><option value="">Ohne Fach</option>${subs.map((s) => `<option value="${s.id}" ${s.id === f.subjectId ? 'selected' : ''}>${esc(s.short)} · ${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field-row">
        <div class="field"><label for="evTitle">Titel</label><input id="evTitle" class="input" value="${esc(f.title)}" maxlength="60" placeholder="z. B. Analysis"></div>
        <div class="field"><label for="evDate">Datum</label><input id="evDate" class="input" type="date" value="${esc(f.date)}"></div>
      </div>
      <div class="sheet-foot">
        ${ex ? `<button type="button" class="btn btn-danger" data-del style="flex:0 0 auto">${ic('trash', 'i-sm')}</button>` : ''}
        <button type="button" class="btn btn-primary" data-save>${ic('check', 'i-sm')} Speichern</button>
      </div>`;
    PL.openSheet(html, {
      onMount(sh) {
        bindSeg(sh.querySelector('[data-seg="type"]'), (v) => { f.type = v; });
        sh.querySelector('[data-save]').onclick = () => {
          f.subjectId = sh.querySelector('#evSub').value || null;
          f.title = sh.querySelector('#evTitle').value.trim();
          f.date = sh.querySelector('#evDate').value;
          if (!f.date) { PL.toast('Bitte wähle ein Datum'); return; }
          PL.upsertEvent(f);
          PL.closeSheet();
          PL.toast(ex ? 'Termin aktualisiert' : 'Termin angelegt');
        };
        const del = sh.querySelector('[data-del]');
        if (del) del.onclick = () => { const ev = PL.deleteEvent(ex.id); PL.closeSheet(); PL.toast('Termin gelöscht', () => PL.upsertEvent(ev)); };
      },
    });
  };

  /* ---------- Bestätigung ---------- */
  PL.confirmSheet = function (title, text, label, onYes) {
    PL.openSheet(`${PL.sheetHead(esc(title))}<p style="margin:0 0 18px;color:var(--text-2)">${esc(text)}</p>
      <div class="sheet-foot"><button type="button" class="btn" data-action="close-sheet">Abbrechen</button><button type="button" class="btn btn-primary" data-yes style="background:var(--danger);box-shadow:none">${esc(label)}</button></div>`, {
      onMount(sh) { sh.querySelector('[data-yes]').onclick = () => { PL.closeSheet(); setTimeout(onYes, 210); }; },
    });
  };

  /* ---------- Anmelden / Registrieren ---------- */
  PL.authSheet = function (mode = 'login') {
    const S = PL.sync;
    if (!S || !S.enabled) { PL.toast('Die Synchronisierung ist noch nicht eingerichtet'); return; }
    const html = `
      ${PL.sheetHead('Dein Konto', 'Melde dich an, damit deine Noten auf allen Geräten gleich sind.')}
      <div class="seg seg-block" data-seg="mode" style="margin-bottom:16px">${segHtml([['login', 'Anmelden'], ['signup', 'Registrieren']], mode)}</div>
      <form data-auth novalidate>
        <div class="field"><label for="aEmail">E-Mail</label><input id="aEmail" class="input" type="email" autocomplete="email" inputmode="email" required autofocus></div>
        <div class="field"><label for="aPw">Passwort</label><input id="aPw" class="input" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required>
          <span class="hint" data-pw-hint ${mode === 'login' ? 'hidden' : ''}>Mindestens 6 Zeichen</span></div>
        <div class="auth-msg" data-msg hidden></div>
        <div class="sheet-foot col">
          <button type="submit" class="btn btn-primary" data-submit>${mode === 'login' ? 'Anmelden' : 'Konto erstellen'}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-forgot ${mode === 'login' ? '' : 'hidden'}>Passwort vergessen?</button>
        </div>
      </form>`;
    PL.openSheet(html, {
      onMount(sh) {
        const msg = sh.querySelector('[data-msg]');
        const submit = sh.querySelector('[data-submit]');
        const show = (text, ok) => { msg.hidden = !text; msg.textContent = text || ''; msg.classList.toggle('ok', !!ok); };
        bindSeg(sh.querySelector('[data-seg="mode"]'), (v) => {
          mode = v;
          submit.textContent = v === 'login' ? 'Anmelden' : 'Konto erstellen';
          sh.querySelector('[data-forgot]').hidden = v !== 'login';
          sh.querySelector('[data-pw-hint]').hidden = v === 'login';
          sh.querySelector('#aPw').autocomplete = v === 'login' ? 'current-password' : 'new-password';
          show('');
        });
        sh.querySelector('[data-auth]').onsubmit = async (e) => {
          e.preventDefault();
          const email = sh.querySelector('#aEmail').value.trim();
          const pw = sh.querySelector('#aPw').value;
          if (!email || !pw) { show('Bitte E-Mail und Passwort eingeben.'); return; }
          submit.disabled = true; show('');
          try {
            if (mode === 'login') {
              const err = await S.signIn(email, pw);
              if (err) { show(err); return; }
              PL.closeSheet();
              PL.toast('Angemeldet – deine Noten werden synchronisiert');
            } else {
              const r = await S.signUp(email, pw);
              if (r.error) { show(r.error); return; }
              if (r.needsConfirm) show('Fast geschafft! Wir haben dir eine E-Mail geschickt. Klick auf den Link darin und melde dich danach hier an.', true);
              else { PL.closeSheet(); PL.toast('Konto erstellt – du bist angemeldet'); }
            }
          } finally { submit.disabled = false; }
        };
        sh.querySelector('[data-forgot]').onclick = async () => {
          const email = sh.querySelector('#aEmail').value.trim();
          if (!email) { show('Gib zuerst deine E-Mail-Adresse ein.'); return; }
          const err = await S.resetPassword(email);
          show(err || 'Wir haben dir einen Link zum Zurücksetzen geschickt.', !err);
        };
      },
    });
  };

  PL.newPasswordSheet = function () {
    PL.openSheet(`${PL.sheetHead('Neues Passwort')}
      <form data-pwform>
        <div class="field"><label for="nPw">Neues Passwort</label><input id="nPw" class="input" type="password" autocomplete="new-password" minlength="6" autofocus></div>
        <div class="auth-msg" data-msg hidden></div>
        <div class="sheet-foot"><button type="submit" class="btn btn-primary">Speichern</button></div>
      </form>`, {
      onMount(sh) {
        sh.querySelector('[data-pwform]').onsubmit = async (e) => {
          e.preventDefault();
          const err = await PL.sync.updatePassword(sh.querySelector('#nPw').value);
          const msg = sh.querySelector('[data-msg]');
          if (err) { msg.hidden = false; msg.textContent = err; return; }
          PL.closeSheet(); PL.toast('Passwort geändert');
        };
      },
    });
  };

  /* ---------- Eigenes Fach im Setup ---------- */
  PL.customSubjectSheet = function (onAdd) {
    const f = { color: PL.COLORS[Math.floor(Math.random() * PL.COLORS.length)] };
    PL.openSheet(`${PL.sheetHead('Eigenes Fach')}
      <div class="field-row" style="grid-template-columns:96px 1fr">
        <div class="field"><label for="cShort">Kürzel</label><input id="cShort" class="input" maxlength="4" placeholder="Z" style="text-transform:uppercase" autofocus></div>
        <div class="field"><label for="cName">Name</label><input id="cName" class="input" maxlength="40" placeholder="z. B. Technik"></div>
      </div>
      <div class="field"><span class="field-label">Farbe</span><div class="color-pick">${PL.COLORS.map((c) => `<button type="button" class="${c === f.color ? 'on' : ''}" style="--c:${c}" data-c="${c}"></button>`).join('')}</div></div>
      <div class="sheet-foot"><button type="button" class="btn btn-primary" data-save>${ic('plus', 'i-sm')} Hinzufügen</button></div>`, {
      onMount(sh) {
        sh.querySelector('.color-pick').addEventListener('click', (e) => {
          const b = e.target.closest('[data-c]'); if (!b) return;
          f.color = b.dataset.c; sh.querySelectorAll('.color-pick button').forEach((x) => x.classList.toggle('on', x === b));
        });
        sh.querySelector('[data-save]').onclick = () => {
          const name = sh.querySelector('#cName').value.trim();
          if (!name) { PL.toast('Bitte gib einen Namen ein'); return; }
          const short = (sh.querySelector('#cShort').value.trim() || name.slice(0, 2)).toUpperCase();
          onAdd({ id: PL.uid(), short, name, color: f.color, lk: false, teacher: '', picked: true, isNew: true });
          PL.closeSheet();
        };
      },
    });
  };
})();
