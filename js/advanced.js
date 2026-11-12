/* Piano Path — intermediate levels: two-octave and hands-together scales, arpeggios, harder rhythms,
   hands-together sight-reading, accompanying by ear, and learning real pieces (with MusicXML import). */
(function () {
  'use strict';
  const PP = window.PP;
  const M = PP.M, L = PP.L, SK = PP.SkillById;
  const pc = M.pc;
  const pick = L.pick;

  // ---------- evenness from timing and key velocity ----------
  function evenness(times, vels) {
    const iois = [];
    for (let i = 1; i < times.length; i++) iois.push(times[i] - times[i - 1]);
    const mean = iois.reduce((a, b) => a + b, 0) / (iois.length || 1);
    const sd = Math.sqrt(iois.reduce((a, b) => a + (b - mean) ** 2, 0) / (iois.length || 1));
    const vm = vels.reduce((a, b) => a + b, 0) / (vels.length || 1);
    const vsd = Math.sqrt(vels.reduce((a, b) => a + (b - vm) ** 2, 0) / (vels.length || 1));
    return { tEven: Math.max(0, Math.min(1, 1 - (sd / (mean || 1)) * 2)), vEven: Math.max(0, Math.min(1, 1 - vsd * 4)) };
  }

  // ---------- sequence drill: scales and arpeggios, one hand or both ----------
  function seqDrill(api, o) {
    const notes = o.notes;
    const rel = notes.map((n) => n.midi - notes[0].midi);
    const names = notes.map((n) => M.nameOf(n));
    const first = pc(notes[0].midi);
    api.prompt(o.title);
    api.sub(o.sub);
    api.stageHTML(`<div class="seq" id="seq">${notes.map(() => '<span class="dot"></span>').join('')}</div><div class="staff-slot wide" id="sq-staff"></div>`);
    let idx = 0, base = null, mistakes = 0, hinted = false, pend = [], pendT = 0, pendV = 0, times = [], vels = [], gaps = [], src = 'screen';
    const ds = () => api.root.querySelectorAll('#seq .dot');
    const show = () => { hinted = true; PP.Staff.render(api.root.querySelector('#sq-staff'), { clef: 'treble', fifths: o.fifths, items: notes.map((n) => ({ kind: 'note', notes: [n], dur: 'q' })), beatW: 8, label: 'Notes' }); };
    api.actions([{ label: 'Show fingering', fn: () => { hinted = true; api.say(o.fing, 'info'); } }, { label: 'Show the notes', fn: show }]);
    const reset = () => { idx = 0; pend = []; times = []; vels = []; gaps = []; ds().forEach((d) => { d.className = 'dot'; d.textContent = ''; }); };
    const fail = (ev) => {
      mistakes++;
      api.say(`Not ${M.midiName(ev.midi, o.fifths)} — next was <b>${names[idx]}</b>. Start again from ${names[0]}.`, 'bad');
      const at = idx;
      reset();
      const d = ds()[at]; if (d) d.className = 'dot bad';
      if (mistakes >= 2 && !hinted) show();
    };
    const step = (t, v) => {
      if (idx === 0) api.startClock();
      times.push(t); vels.push(v || 0);
      const d = ds()[idx]; d.className = 'dot on'; d.textContent = names[idx];
      idx++;
      if (idx < notes.length) return;
      const usedHint = hinted;
      const e = evenness(times, vels);
      const parts = [`Timing evenness ${Math.round(e.tEven * 100)}%`];
      if (src !== 'screen') parts.push(`loudness evenness ${Math.round(e.vEven * 100)}%`);
      if (gaps.length) parts.push(`hands within ${Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)} ms of each other`);
      const evenOk = !o.evenGoal || e.tEven >= o.evenGoal;
      show();
      api.finish({
        correct: mistakes === 0 && evenOk, hinted: usedHint,
        note: parts.join(' · ') + '.' + (mistakes ? ` ${mistakes} restart${mistakes > 1 ? 's' : ''}.` : '') + (evenOk ? '' : ` Goal: ${Math.round(o.evenGoal * 100)}% timing evenness — play slower and steadier.`),
      });
    };
    return {
      onNote(ev) {
        if (ev.type !== 'on') return;
        src = ev.src;
        if (o.hands === 1) {
          if (idx === 0) { if (pc(ev.midi) !== first) { api.say(`Start on ${names[0]}.`, 'info'); return; } base = ev.midi; }
          if (ev.midi !== base + rel[idx]) { fail(ev); return; }
          step(ev.t, ev.vel);
          return;
        }
        if (pc(ev.midi) !== pc(notes[idx].midi)) {
          if (idx === 0 && !pend.length) { api.say(`Start on ${names[0]} with both hands, an octave apart.`, 'info'); return; }
          fail(ev);
          return;
        }
        if (pend.includes(ev.midi)) return;
        pend.push(ev.midi);
        if (pend.length === 1) { pendT = ev.t; pendV = ev.vel; return; }
        gaps.push(Math.abs(ev.t - pendT));
        pend = [];
        step(pendT, (pendV + ev.vel) / 2);
      },
    };
  }

  // ---------- Scales: two octaves, hands together, chromatic ----------
  const scales = SK.scales;
  const oldScaleAsk = scales.ask, oldScaleLabel = scales.label;
  const SCALE_RE = /^(O2|HT1|HT2|CHR):(h:)?(.+)$/;
  function scaleNotes(t, harmonic, octaves) {
    const k = M.key(t, harmonic ? 'minor' : 'major');
    const type = harmonic ? 'harmonic' : 'major';
    let up = M.scaleOf(k, 4, type);
    if (up[0].midi > 66) up = M.scaleOf(k, 3, type);
    if (octaves === 2) up = up.concat(M.scaleOf(k, up[0].oct + 1, type).slice(1));
    return { k, notes: up.concat(up.slice(0, -1).reverse()) };
  }
  scales.label = function (item) {
    const m = SCALE_RE.exec(item);
    if (!m) return oldScaleLabel.call(this, item);
    if (m[1] === 'CHR') return `Chromatic scale from ${m[3]}`;
    return `${m[3]}${m[2] ? ' harmonic minor' : ' major'} — ${m[1] === 'O2' ? '2 octaves' : m[1] === 'HT1' ? 'hands together' : '2 octaves, hands together'}`;
  };
  scales.ask = function (item, st, api) {
    const m = SCALE_RE.exec(item);
    if (!m) return oldScaleAsk.call(this, item, st, api);
    const [, kind, h, t] = m;
    const ht = kind.startsWith('HT');
    let notes, fifths = 0, fing;
    if (kind === 'CHR') {
      const s = M.parse(t + '4');
      notes = [];
      for (let i = 0; i <= 12; i++) notes.push(M.spell(s.midi + i, 0, 'sharp'));
      for (let i = 11; i >= 0; i--) notes.push(M.spell(s.midi + i, 0, 'flat'));
      fing = 'Chromatic fingering: 3 on every black key, thumb on white keys; where two white keys sit together use 1–2 (right hand going up: 2 on F and C; left hand going up: 2 on E and B).';
    } else {
      const sc = scaleNotes(t, !!h, kind === 'HT1' ? 1 : 2);
      notes = sc.notes; fifths = sc.k.fifths;
      const f = L.FINGERS[(h ? 'h:' : '') + t] || ['12312345', '54321321'];
      fing = `Right hand ${f[0].split('').join(' ')} · Left hand ${f[1].split('').join(' ')} (one octave going up; repeat the pattern for the second octave).` + (ht ? ' The thumbs tuck under at different moments, so practise hands together slowly.' : '');
    }
    return seqDrill(api, {
      title: `Play <b>${this.label(item)}</b>, up and down`,
      sub: ht ? `Both hands, an octave apart, starting on ${t}. Keep them exactly together.` : `Start on any ${t}. Either hand. Keep it even.`,
      notes, hands: ht ? 2 : 1, fing, fifths, evenGoal: st.even,
    });
  };
  scales.stages.push(
    { t: 'Two octaves, one hand', lvl: 5, target: 18, items: ['C', 'G', 'D', 'A', 'E'].map((x) => 'O2:' + x), d: 'C, G, D, A and E major, up and down.' },
    { t: 'Hands together, one octave', lvl: 6, target: 14, items: ['C', 'G', 'D', 'F'].map((x) => 'HT1:' + x), d: 'Both hands an octave apart.' },
    { t: 'Hands together, two octaves', lvl: 7, target: 24, even: 0.7, items: ['C', 'G', 'D', 'A', 'E', 'F'].map((x) => 'HT2:' + x), d: 'Needs 70% timing evenness.' },
    { t: 'Hands together: flat keys and minors', lvl: 8, target: 26, even: 0.75, items: ['B♭', 'E♭', 'A♭'].map((x) => 'HT2:' + x).concat(['A', 'E', 'D'].map((x) => 'HT2:h:' + x)), d: 'Needs 75% timing evenness.' },
    { t: 'Chromatic scale', lvl: 8, target: 14, items: ['C', 'D', 'E', 'F♯', 'A♭'].map((x) => 'CHR:' + x), d: 'One octave up and down.' },
  );

  // ---------- Arpeggios ----------
  function arpNotes(name, upDown) {
    const minor = name.endsWith('m');
    const root = minor ? name.slice(0, -1) : name;
    let r = M.parse(root + '4');
    if (r.midi > 66) r = M.parse(root + '3');
    const tri = M.chordNotes(r, minor ? 'min' : 'maj');
    const up = tri.concat(tri.map((n) => M.note(n.letter, n.acc, n.oct + 1)), [M.note(r.letter, r.acc, r.oct + 2)]);
    const fifths = (minor ? M.MINOR_FIFTHS : M.MAJOR_FIFTHS)[root] || 0;
    return { notes: upDown ? up.concat(up.slice(0, -1).reverse()) : up, fifths };
  }
  const arpSkill = {
    id: 'arpeggios', strand: 'keys', title: 'Arpeggios', icon: '⌇',
    blurb: 'Broken chords over two octaves: the other half of technique.',
    method: 'Technique built in graded steps, as in exam syllabuses: one hand going up, then up and down, then hands together, with the app measuring how even your timing and touch are so you know what to fix.',
    round: 6, mastery: 0.8,
    stages: [
      { t: 'C, G and F major, going up', lvl: 4, target: 8, items: ['C', 'G', 'F'] },
      { t: 'A, D and E minor, going up', lvl: 5, target: 8, items: ['Am', 'Dm', 'Em'] },
      { t: 'Up and down, one hand', lvl: 6, target: 14, items: ['C', 'G', 'F', 'Am', 'Dm', 'Em'].map((x) => 'ud:' + x) },
      { t: 'Hands together, up and down', lvl: 7, target: 16, items: ['C', 'G', 'F', 'Am', 'Dm', 'Em'].map((x) => 'HT:' + x) },
      { t: 'Hands together, more keys', lvl: 8, target: 16, even: 0.7, items: ['D', 'A', 'E', 'B♭', 'Bm', 'Gm', 'Cm'].map((x) => 'HT:' + x), d: 'Needs 70% timing evenness.' },
    ],
    pool: (st) => st.items,
    label(item) {
      const n = item.replace(/^(ud:|HT:)/, '');
      return (n.endsWith('m') ? n.slice(0, -1) + ' minor' : n + ' major') + (item.startsWith('HT:') ? ', hands together' : item.startsWith('ud:') ? ', up and down' : '');
    },
    ask(item, st, api) {
      const ht = item.startsWith('HT:');
      const { notes, fifths } = arpNotes(item.replace(/^(ud:|HT:)/, ''), item.includes(':'));
      return seqDrill(api, {
        title: `Play the <b>${this.label(item)}</b> arpeggio, two octaves`,
        sub: ht ? 'Both hands, an octave apart.' : 'Either hand, starting on the root.',
        notes, hands: ht ? 2 : 1, fifths, evenGoal: st.even,
        fing: 'Right hand 1 2 3 1 2 3 5 going up · Left hand 5 4 2 1 4 2 1 (or 5 3 2 1 3 2 1 if the 4th finger feels cramped). Let the thumb pass under smoothly and keep the wrist level.',
      });
    },
  };

  // ---------- Rhythm: sixteenths, triplets, syncopation, 6/8 ----------
  L.BAR.s16 = ['s s s s q q q', 'q s s s s h', 'e e s s s s q q', 'q q s s s s q', 's s s s s s s s h', 'q de s q q'];
  L.BAR.trip = ['t t t q h', 'q t t t q q', 't t t t t t h', 'e q e q q', 'q e q e q', 'e q e h', 'q q t t t q'];
  L.BAR.c68 = ['dq dq', 'e e e dq', 'dq e e e', 'q e q e', 'e e e e e e', 'dh', 'q e dq'];
  SK.rhythm.stages.push(
    { t: 'Sixteenth notes', lvl: 5, bars: ['a', 'c', 's16', 's16'], n: 2, bpb: 4 },
    { t: 'Triplets and syncopation', lvl: 6, bars: ['c', 'trip', 'trip'], n: 2, bpb: 4 },
    { t: '6/8 time', lvl: 7, bars: ['c68'], n: 4, bpb: 3, compound: true, d: 'Two clicks per bar: count “1-2-3, 4-5-6”.' },
    { t: 'Everything mixed', lvl: 8, bars: ['c', 'd', 's16', 'trip'], n: 4, bpb: 4 },
  );

  // ---------- More chords ----------
  SK.chords.stages.push({ t: 'Major 7th and minor 7th chords', lvl: 6, target: 7, items: ['C', 'D', 'E', 'F', 'G', 'A'].flatMap((r) => [r + ':maj7', r + ':min7']) });
  SK.keychords.stages.push({ t: 'All 12 major keys: I, IV, V, vi', lvl: 6, target: 6, items: L.MAJ_ROOTS.flatMap((k) => ['I', 'IV', 'V', 'vi'].map((n) => k + ':' + n)) });

  // ---------- multi-voice scores (both hands) ----------
  function buildScore(evs, barEnds, fifths) {
    const onsets = [...new Set(evs.map((e) => Math.round(e.beat * 1000) / 1000))].sort((a, b) => a - b);
    const end = Math.max(...evs.map((e) => e.beat + e.beats));
    const items = [];
    const sliceOf = new Map();
    let ni = 0;
    onsets.forEach((b, i) => {
      const here = evs.filter((e) => Math.abs(e.beat - b) < 1e-3);
      const next = i + 1 < onsets.length ? onsets[i + 1] : end;
      items.push({
        kind: 'note', adv: next - b, dur: here[0].dur,
        notes: here.map((e) => (e.midi == null
          ? { rest: true, staff: e.staff, dur: e.dur, dots: e.dots }
          : { ...(e.sp ? M.note(e.sp[0], e.sp[1], e.sp[2]) : M.spell(e.midi, fifths)), staff: e.staff, dur: e.dur, dots: e.dots, tup: e.tup, beam: e.beam !== undefined ? e.staff + e.beam : undefined })),
      });
      here.forEach((e) => sliceOf.set(e, ni));
      ni++;
      if (barEnds.some((x) => x > b + 1e-3 && x <= next + 1e-3)) items.push({ kind: next >= end - 1e-3 ? 'end' : 'bar' });
    });
    const playable = evs.filter((e) => e.midi != null).sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    return { items, playable, slice: playable.map((e) => sliceOf.get(e)), end };
  }
  const MARKS = ['ok', 'bad', 'early', 'late', 'miss', 'cur'];
  function scoreView(slot, o) {
    const sc = buildScore(o.events, o.barEnds, o.fifths);
    const r = PP.Staff.render(slot, { clef: o.clef, fifths: o.fifths, time: o.time, items: sc.items, beatW: o.beatW || 24, label: o.label || 'Music' });
    if (o.scroll) { r.svg.style.width = Math.round(r.width * 1.3) + 'px'; r.svg.style.maxWidth = 'none'; r.svg.style.maxHeight = 'none'; }
    const rank = { ok: 0, early: 1, late: 1, miss: 2, bad: 3 };
    let st = [];
    const follow = (el) => {
      if (!o.scroll || !el) return;
      const cr = el.getBoundingClientRect(), sr = slot.getBoundingClientRect();
      if (cr.left > sr.left + sr.width * 0.65 || cr.left < sr.left) slot.scrollLeft += cr.left - sr.left - sr.width * 0.25;
    };
    return {
      sc, r, els: r.noteEls, follow,
      clear() { st = []; r.noteEls.forEach((g) => g.classList.remove(...MARKS)); },
      mark(pi, s) {
        const si = sc.slice[pi];
        const g = r.noteEls[si];
        if (!g) return;
        if (st[si] === undefined || rank[s] > rank[st[si]]) { g.classList.remove(...MARKS); st[si] = s; g.classList.add(s); }
      },
      cursor(b) { r.setCursor(b); if (b !== null) follow(r.svg.querySelector('.cursor')); },
    };
  }
  /** "Wait for me": step through the notes with no clock. */
  function stepMode(api, view, playable, slices, done) {
    const order = [], req = new Map();
    playable.forEach((e, i) => { const s = slices[i]; if (!req.has(s)) { req.set(s, new Set()); order.push(s); } req.get(s).add(e.midi); });
    let p = 0, got = new Set();
    view.clear();
    const cur = () => { const g = view.els[order[p]]; if (g) { g.classList.add('cur'); view.follow(g); } };
    if (order.length) cur();
    const off = api.Input.on((ev) => {
      if (ev.type !== 'on' || p >= order.length) return;
      const s = order[p], need = req.get(s), g = view.els[s];
      if (!need.has(ev.midi)) { g.classList.add('bad'); return; }
      got.add(ev.midi);
      if (![...need].every((m) => got.has(m))) return;
      g.classList.remove('cur', 'bad'); g.classList.add('ok');
      p++; got = new Set();
      if (p < order.length) cur(); else { off(); if (done) done(); }
    });
    return off;
  }
  function dynamicsNote(notes, dyn) {
    const v = notes.filter((n) => n.vel !== undefined && n.src && n.src !== 'screen').map((n) => n.vel);
    if (!v.length) return ' Dynamics are checked when you play on the piano.';
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    const ok = dyn === 'p' ? avg <= 0.5 : avg >= 0.6;
    return ` Dynamics: average key force ${Math.round(avg * 100)}% — ${ok ? `a good ${dyn === 'p' ? 'piano (soft)' : 'forte (loud)'}.` : dyn === 'p' ? 'too loud for piano; lighten your touch.' : 'not quite forte; use more arm weight.'}`;
  }

  // ---------- Sight-reading: more keys, hands together, 3/4, dynamics ----------
  const KEYSETS = {
    C: { name: 'C major', fifths: 0, pool: [60, 62, 64, 65, 67, 69], tonic: 60 },
    G: { name: 'G major', fifths: 1, pool: [62, 64, 66, 67, 69, 71, 72, 74], tonic: 67 },
    F: { name: 'F major', fifths: -1, pool: [60, 62, 64, 65, 67, 69, 70, 72], tonic: 65 },
    D: { name: 'D major', fifths: 2, pool: [62, 64, 66, 67, 69, 71, 73, 74], tonic: 62 },
    Am: { name: 'A minor', fifths: 0, pool: [57, 59, 60, 62, 64, 65, 67, 69], tonic: 57 },
    Bb: { name: 'B♭ major', fifths: -2, pool: [62, 63, 65, 67, 69, 70, 72, 74], tonic: 70 },
  };
  const HT_PROGS = ['I-IV-V-I', 'I-V-IV-I', 'I-ii-V-I', 'I-vi-V-I'];
  function sightAdv(item, st, api) {
    const K = KEYSETS[pick(st.keys)];
    const bpb = st.bpb || 4;
    const bpm = Math.round(st.bpm * api.tempoFactor());
    const barStrs = [];
    for (let i = 0; i < st.n - 1; i++) barStrs.push(pick(L.BAR[pick(st.bars)]));
    barStrs.push(bpb === 3 ? 'dh' : pick(['w', 'h h', 'q q h']));
    const { evs } = L.buildPiece(barStrs, bpb);
    const nums = st.ht ? pick(HT_PROGS).split('-') : null;
    const pool = K.pool;
    const tIdx = Math.max(0, pool.indexOf(K.tonic));
    let i = tIdx;
    const playIdx = evs.map((e, n) => (e.rest ? -1 : n)).filter((n) => n >= 0);
    const midiAt = {};
    playIdx.forEach((n, k) => {
      const e = evs[n];
      if (k > 0) {
        const d = Math.random() > 0.65 ? pick([-2, 2, -3, 3]) : pick([-1, 1, 1, -1, 0]);
        let j = i + d;
        if (j < 0 || j >= pool.length) j = i - d;
        i = Math.max(0, Math.min(pool.length - 1, j));
      }
      if (nums && Math.abs(e.beat % bpb) < 1e-6) {
        const [off, type] = L.DIA[nums[Math.floor(e.beat / bpb + 1e-6)]];
        const pcs = M.chordPcs((pc(K.tonic) + off) % 12, type);
        let best = i, bd = 99;
        pool.forEach((m, j) => { if (pcs.includes(pc(m)) && Math.abs(j - i) < bd) { bd = Math.abs(j - i); best = j; } });
        i = best;
      }
      midiAt[n] = pool[i];
    });
    if (playIdx.length) midiAt[playIdx[playIdx.length - 1]] = pool[tIdx];
    const events = evs.map((e, n) => ({ beat: e.beat, beats: e.beats, midi: e.rest ? null : midiAt[n], staff: 't', dur: e.dur, dots: e.dots, beam: e.beam, tup: e.tup }));
    if (nums) nums.forEach((nm, bar) => {
      let root = 48 + ((pc(K.tonic) + L.DIA[nm][0]) % 12);
      if (root > 52) root -= 12;
      if (st.ht === 'h' && bpb === 4) events.push({ beat: bar * 4, beats: 2, midi: root, staff: 'b', dur: 'h', dots: 0 }, { beat: bar * 4 + 2, beats: 2, midi: root + 7, staff: 'b', dur: 'h', dots: 0 });
      else events.push({ beat: bar * bpb, beats: bpb, midi: root, staff: 'b', dur: bpb === 3 ? 'h' : 'w', dots: bpb === 3 ? 1 : 0 });
    });
    const barEnds = [];
    for (let k = 1; k <= st.n; k++) barEnds.push(k * bpb);
    const dyn = st.dyn ? pick(['p', 'f']) : null;
    const firsts = events.filter((e) => e.beat === 0 && e.midi != null).map((e) => M.midiName(e.midi, K.fifths, undefined, true)).join(' + ');
    api.prompt(`Sight-read this${nums ? ' with both hands' : ''} — <b>${bpm} beats per minute</b>`);
    api.sub(`Look first: key <b>${K.name}</b> · time <b>${bpb}/4</b> · first note${nums ? 's' : ''} <b>${firsts}</b>${dyn ? ` · dynamic <b class="dyn">${dyn}</b> (${dyn === 'p' ? 'soft' : 'loud'})` : ''}. Then press Start and keep going.`);
    api.stageHTML('<div class="staff-slot wide" id="sa-staff"></div><div class="perf-status" id="perf-status"></div>');
    const view = scoreView(api.root.querySelector('#sa-staff'), { clef: nums ? 'grand' : 'treble', fifths: K.fifths, time: [bpb, 4], events, barEnds, beatW: 26, label: 'Sight-reading piece' });
    const playable = view.sc.playable;
    const status = api.root.querySelector('#perf-status');
    let run = null, stepOff = null;
    api.Keys.focus(playable[0].midi);
    const start = () => {
      if (run) return;
      if (stepOff) { stepOff(); stepOff = null; }
      view.clear();
      api.setActionsDisabled(true);
      run = PP.Perf.run({
        events: playable.map((e) => ({ beat: e.beat, dur: e.beats, midi: e.midi })), bpm, beatsPerBar: bpb, countIn: bpb, pitched: true,
        onCursor: (b) => { if (b < 0) { status.textContent = 'Count-in: ' + Math.ceil(-b); view.cursor(null); } else { status.textContent = 'Play!'; view.cursor(b); } },
        onMark: (n, s) => view.mark(n, s),
        onDone: (res) => {
          run = null; view.cursor(null); status.textContent = ''; api.setActionsDisabled(false);
          api.finish({ correct: res.score >= 0.85, score: res.score, manual: true, note: `Score ${Math.round(res.score * 100)}%. ${res.summary}${dyn ? dynamicsNote(res.notes, dyn) : ''}` });
          api.actions([{ label: 'Practise it slowly (no clock)', fn: () => {
            if (stepOff) stepOff();
            stepOff = stepMode(api, view, playable, view.sc.slice, () => api.say('Nice. Press Next for a new piece.', 'good'));
            api.say('Slow practice: play each note or chord when you’re ready. This doesn’t change your score.', 'info');
          } }]);
        },
      });
    };
    api.actions([{ label: 'Start', primary: true, fn: start }]);
    return { cleanup: () => { if (run) run.stop(); if (stepOff) stepOff(); } };
  }
  const sight = SK.sight, oldSightAsk = sight.ask;
  sight.ask = function (item, st, api) { return st.adv ? sightAdv(item, st, api) : oldSightAsk.call(this, item, st, api); };
  sight.stages.push(
    { t: 'D major and A minor, wider range', lvl: 5, adv: true, keys: ['D', 'Am'], bars: ['a', 'b', 'c'], n: 4, bpm: 66 },
    { t: 'Hands together: melody and bass', lvl: 6, adv: true, ht: 'w', keys: ['C', 'G'], bars: ['a'], n: 4, bpm: 56 },
    { t: 'Hands together: moving bass', lvl: 7, adv: true, ht: 'h', keys: ['G', 'F', 'C'], bars: ['a', 'b', 'c'], n: 4, bpm: 60 },
    { t: 'Hands together in 3/4, with dynamics', lvl: 8, adv: true, ht: 'w', bpb: 3, keys: ['D', 'Bb', 'F'], bars: ['t3'], n: 4, bpm: 66, dyn: true },
  );

  // ---------- Accompany by ear ----------
  const MIN_DIA = { i: [0, 'min'], iv: [5, 'min'], V: [7, 'maj'], VI: [8, 'maj'] };
  function melodyOver(chords, scale) {
    const out = [];
    let prev = scale[Math.floor(scale.length / 2)];
    chords.forEach((c, bar) => {
      const slots = bar === chords.length - 1 ? [[0, 4]] : pick([[[0, 1], [1, 1], [2, 1], [3, 1]], [[0, 2], [2, 1], [3, 1]], [[0, 1], [1, 1], [2, 2]]]);
      slots.forEach(([b, d]) => {
        const strong = b % 2 === 0;
        let cands = scale.filter((m) => (strong ? c.pcs.includes(pc(m)) : true) && Math.abs(m - prev) <= (strong ? 5 : 2) && m !== prev);
        if (!cands.length) cands = scale.filter((m) => c.pcs.includes(pc(m)));
        const m = pick(cands);
        out.push({ beat: bar * 4 + b, dur: d, midi: m });
        prev = m;
      });
    });
    return out;
  }
  function runAccomp(api, o) {
    const S = PP.Sound, ctx = S.ensure(), beatSec = 60 / o.bpm, countIn = 4, bars = o.chords.length;
    const t0 = ctx.currentTime + 0.35;
    const bus = ctx.createGain();
    bus.connect(S.out);
    for (let b = 0; b < countIn + bars * 4; b++) S.click(t0 + b * beatSec, b % 4 === 0, bus);
    o.melody.forEach((e) => S.note(e.midi, t0 + (countIn + e.beat) * beatSec, e.dur * beatSec * 0.9, 0.6, bus));
    if (o.withChords) o.chords.forEach((c, i) => c.voicing.forEach((m) => S.note(m, t0 + (countIn + i * 4) * beatSec, 4 * beatSec * 0.95, 0.35, bus)));
    const startPerf = S.perfAt(t0), beatMs = beatSec * 1000, lat = PP.store.pref('latencyMs', 0);
    const res = o.chords.map(() => null);
    let raf = 0, stopped = false;
    const stop = () => { stopped = true; cancelAnimationFrame(raf); try { bus.gain.setValueAtTime(0, ctx.currentTime); bus.disconnect(); } catch (e) { /* ignore */ } };
    const tick = () => {
      if (stopped) return;
      const b = (performance.now() - startPerf) / beatMs - countIn;
      o.onBeat(b);
      if (!o.listenOnly) {
        const held = new Set(api.Input.heldMidis().map(pc));
        const bb = b - lat / beatMs;
        o.chords.forEach((c, k) => {
          if (res[k] !== null) return;
          if (bb >= k * 4 - 0.4 && bb <= k * 4 + 1.2 && c.pcs.every((p) => held.has(p))) { res[k] = true; o.onBar(k, true); }
          else if (bb > k * 4 + 1.2) { res[k] = false; o.onBar(k, false); }
        });
      }
      if (b > bars * 4 + 0.3) { stop(); o.onDone(res.filter(Boolean).length / bars); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return { stop };
  }
  const accompSkill = {
    id: 'accomp', strand: 'sight', title: 'Accompany by ear', icon: '♮',
    blurb: 'Play the chords under a tune: from chord symbols, then by ear.',
    method: 'Lead-sheet and by-ear accompaniment, the way pop, folk and church musicians learn: first read chord symbols and play them in time, then hear the progression and find the chords yourself. Every chord is heard against the key, so you learn how I, IV, V and vi feel.',
    round: 4, timed: true, generated: true,
    stages: [
      { t: 'Chord symbols: I and V', lvl: 4, keys: ['C', 'G'], prog: ['I-V-I-V', 'I-I-V-I', 'I-V-V-I', 'V-I-V-I'], show: true },
      { t: 'Chord symbols: I, IV and V', lvl: 5, keys: ['C', 'G', 'F'], prog: ['I-IV-V-I', 'I-V-IV-I', 'I-IV-I-V', 'IV-I-V-I'], show: true },
      { t: 'By ear: I and V', lvl: 6, keys: ['C', 'G', 'F'], prog: ['I-V-I-V', 'I-I-V-I', 'I-V-V-I', 'V-I-V-I'] },
      { t: 'By ear: common progressions', lvl: 7, keys: ['C', 'G', 'F', 'D'], prog: L.PROGS },
      { t: 'By ear: minor keys', lvl: 8, keys: ['A', 'E', 'D'], minor: true, prog: ['i-iv-V-i', 'i-V-i-V', 'i-iv-i-V', 'i-VI-iv-V'] },
    ],
    pool: (st) => st.prog,
    label(item) { return item.split('-').join(' – '); },
    ask(item, st, api) {
      const k = M.key(pick(st.keys), st.minor ? 'minor' : 'major');
      let prev = null;
      const chords = item.split('-').map((n) => {
        const [off, type] = (st.minor ? MIN_DIA : L.DIA)[n];
        const rp = (k.tonicPc + off) % 12;
        const voicing = L.voiceChord(rp, type, prev);
        prev = voicing;
        let bass = 36 + rp; if (bass < 40) bass += 12;
        return { n, pcs: M.chordPcs(rp, type), voicing: [bass].concat(voicing), sym: M.midiName(60 + rp, k.fifths) + (type === 'min' ? 'm' : '') };
      });
      const kp = M.keyPcs(k), scale = [];
      for (let m = 60; m <= 76; m++) if (kp.includes(pc(m))) scale.push(m);
      const melody = melodyOver(chords, scale);
      const bpm = Math.round(84 * api.tempoFactor());
      api.prompt(st.show ? `Play the chords — key of <b>${k.name}</b>` : `Find the chords by ear — key of <b>${k.name}</b>`);
      api.sub(st.show ? 'Play each chord on beat 1 of its bar (left hand, any inversion) while the app plays the tune.' : 'Press “Listen” to hear the tune with its chords as often as you like. Then press Start and play the chords yourself on beat 1 of each bar.');
      api.stageHTML(`<div class="lead" id="lead">${chords.map((c, i) => `<div class="lbar" data-i="${i}"><span class="lsym">${st.show ? c.sym : '?'}</span><span class="lnum">${st.show ? c.n : 'bar ' + (i + 1)}</span></div>`).join('')}</div><div class="perf-status" id="perf-status"></div>`);
      const boxes = () => api.root.querySelectorAll('.lbar');
      const status = api.root.querySelector('#perf-status');
      const reveal = (i) => { const b = boxes()[i]; b.querySelector('.lsym').textContent = chords[i].sym; b.querySelector('.lnum').textContent = chords[i].n; };
      let run = null;
      const go = (listen) => {
        if (run) return;
        api.setActionsDisabled(true);
        boxes().forEach((b) => b.classList.remove('good', 'bad', 'cur'));
        run = runAccomp(api, {
          bpm, chords, melody, withChords: listen, listenOnly: listen,
          onBeat: (b) => {
            status.textContent = b < 0 ? 'Count-in: ' + Math.ceil(-b) : listen ? 'Listen…' : 'Play!';
            const bi = Math.floor(b / 4);
            boxes().forEach((x, i) => x.classList.toggle('cur', i === bi));
          },
          onBar: (i, ok) => { boxes()[i].classList.add(ok ? 'good' : 'bad'); if (!st.show) reveal(i); },
          onDone: (score) => {
            run = null; status.textContent = ''; api.setActionsDisabled(false);
            boxes().forEach((x) => x.classList.remove('cur'));
            if (listen) return;
            chords.forEach((_, i) => reveal(i));
            api.finish({ correct: score >= 0.75, score, manual: true, note: `${Math.round(score * chords.length)} of ${chords.length} chords on time. The progression: ${chords.map((c) => `${c.n} (${c.sym})`).join(' – ')}.` });
            api.actions([{ label: 'Hear it with the chords', fn: () => go(true) }]);
          },
        });
      };
      api.actions([{ label: 'Start', primary: true, fn: () => go(false) }, { label: st.show ? 'Hear it first' : 'Listen', fn: () => go(true) }]);
      return { cleanup: () => { if (run) run.stop(); } };
    },
  };

  // ---------- Learn a piece ----------
  const DUR = { w: ['w', 0, 4], h: ['h', 0, 2], q: ['q', 0, 1], e: ['8', 0, 0.5], s: ['16', 0, 0.25], dq: ['q', 1, 1.5], dh: ['h', 1, 3], de: ['8', 1, 0.75] };
  function voice(str, staff) {
    const out = [];
    let b = 0;
    str.trim().split(/\s+/).forEach((tok) => {
      if (tok === '|') return;
      const [n, d = 'q'] = tok.split('/');
      const [dur, dots, beats] = DUR[d];
      const nn = n === 'r' ? null : M.parse(n);
      out.push({ beat: b, beats, midi: nn ? nn.midi : null, sp: nn ? [nn.letter, nn.acc, nn.oct] : null, staff, dur, dots });
      b += beats;
    });
    let id = 0;
    for (let i = 0; i < out.length;) {
      const ok = (e) => e.midi !== null && (e.dur === '8' || e.dur === '16');
      if (!ok(out[i])) { i++; continue; }
      let j = i;
      while (j + 1 < out.length && ok(out[j + 1]) && Math.floor(out[j + 1].beat + 1e-6) === Math.floor(out[i].beat + 1e-6)) j++;
      if (j > i) { for (let k = i; k <= j; k++) out[k].beam = 'v' + id; id++; }
      i = j + 1;
    }
    return out;
  }
  const PRELUDE = [['C4', 'E4', 'G4', 'C5', 'E5'], ['C4', 'D4', 'A4', 'D5', 'F5'], ['B3', 'D4', 'G4', 'D5', 'F5'], ['C4', 'E4', 'G4', 'C5', 'E5']]
    .map((n) => { const half = [n[0], n[1], n[2], n[3], n[4], n[2], n[3], n[4]].map((x) => x + '/s').join(' '); return half + ' ' + half; }).join(' | ');
  const PIECES = {
    ode: {
      title: 'Ode to Joy', by: 'Beethoven, arranged with a simple left hand', time: [4, 4], bpb: 4, fifths: 0, bpm: 96,
      rh: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/dq D4/e D4/h | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/dq C4/e C4/h | D4 D4 E4 C4 | D4 E4/e F4/e E4 C4 | D4 E4/e F4/e E4 D4 | C4 D4 G3/h | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/dq C4/e C4/h',
      lh: 'C3/w | G2/w | C3/h E3/h | G2/w | C3/w | G2/w | C3/h E3/h | G2/h C3/h | G2/w | G2/h C3/h | G2/h B2/h | C3/h G2/h | C3/w | G2/w | C3/h E3/h | G2/h C3/h',
    },
    prelude: { title: 'Prelude in C, first 4 bars', by: 'J. S. Bach, BWV 846 — the broken-chord figure on one staff', time: [4, 4], bpb: 4, fifths: 0, bpm: 66, rh: PRELUDE },
    minuet: {
      title: 'Minuet in G, first 8 bars', by: 'attributed to Christian Petzold — with a simplified left hand', time: [3, 4], bpb: 3, fifths: 1, bpm: 104,
      rh: 'D5 G4/e A4/e B4/e C5/e | D5 G4 G4 | E5 C5/e D5/e E5/e F#5/e | G5 G4 G4 | C5 D5/e C5/e B4/e A4/e | B4 C5/e B4/e A4/e G4/e | F#4 G4/e A4/e B4/e G4/e | A4/dh',
      lh: 'G3/dh | B3/dh | C4/dh | B3/dh | A3/dh | G3/dh | D3/dh | D3/dh',
    },
  };
  function pieceData(p) {
    if (p.events) return p;
    const events = voice(p.rh, 't').concat(p.lh ? voice(p.lh, 'b') : []);
    const end = Math.max(...events.map((e) => e.beat + e.beats));
    const barEnds = [];
    for (let b = p.bpb; b <= end + 1e-6; b += p.bpb) barEnds.push(b);
    return { ...p, events, barEnds, end };
  }

  const TYPE = { breve: 'w', whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '16', '64th': '16' };
  function durGuess(beats) {
    for (const [b, d, dt] of [[4, 'w', 0], [3, 'h', 1], [2, 'h', 0], [1.5, 'q', 1], [1, 'q', 0], [0.75, '8', 1], [0.5, '8', 0]]) if (beats >= b - 1e-3) return [d, dt];
    return ['16', 0];
  }
  /** Parse uncompressed MusicXML (first one or two parts; staves 1 and 2). */
  function parseMusicXML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('That file isn’t readable MusicXML. If it ends in .mxl, export it again as uncompressed MusicXML (.musicxml).');
    const parts = [...doc.getElementsByTagName('part')];
    if (!parts.length) throw new Error('No music found in that file.');
    const q = (el, sel) => el.querySelector(sel);
    const num = (el, sel) => { const x = el.querySelector(sel); return x ? parseFloat(x.textContent) : null; };
    const title = ((q(doc, 'work-title') || q(doc, 'movement-title') || {}).textContent || 'Imported piece').trim();
    let fifths = 0, time = [4, 4], barEnds = [];
    const events = [];
    const multi = parts.length > 1;
    parts.slice(0, 2).forEach((part, pi) => {
      let div = 1, mStart = 0;
      const ends = [];
      [...part.children].filter((m) => m.tagName === 'measure').slice(0, 300).forEach((meas) => {
        let t = 0, maxT = 0, last = 0;
        for (const node of meas.children) {
          if (node.tagName === 'attributes') {
            div = num(node, 'divisions') || div;
            if (pi === 0 && !events.length && num(node, 'key fifths') !== null) fifths = num(node, 'key fifths');
            if (pi === 0 && !events.length && num(node, 'time beats') !== null) time = [num(node, 'time beats'), num(node, 'time beat-type')];
          } else if (node.tagName === 'backup') t -= num(node, 'duration') || 0;
          else if (node.tagName === 'forward') { t += num(node, 'duration') || 0; maxT = Math.max(maxT, t); }
          else if (node.tagName === 'note') {
            if (q(node, 'grace') || q(node, 'cue')) continue;
            const d = num(node, 'duration') || 0;
            const chord = !!q(node, 'chord');
            const onset = chord ? last : t;
            if (!chord) { last = t; t += d; }
            maxT = Math.max(maxT, t);
            const staff = multi ? (pi === 0 ? 't' : 'b') : ((num(node, 'staff') || 1) >= 2 ? 'b' : 't');
            const beats = d / div, beat = mStart + onset / div;
            const ty = q(node, 'type');
            let dur = ty && TYPE[ty.textContent.trim()];
            let dots = Math.min(1, node.getElementsByTagName('dot').length);
            if (!dur) [dur, dots] = durGuess(beats);
            if (q(node, 'rest')) { if (!chord) events.push({ beat, beats, midi: null, staff, dur, dots }); continue; }
            const stepEl = q(node, 'pitch step');
            if (!stepEl) continue;
            const li = M.LETTERS.indexOf(stepEl.textContent.trim());
            const alter = Math.round(num(node, 'pitch alter') || 0);
            const oct = num(node, 'pitch octave');
            const midi = (oct + 1) * 12 + M.LETTER_PC[li] + alter;
            const tieStop = [...node.getElementsByTagName('tie')].some((x) => x.getAttribute('type') === 'stop');
            if (tieStop) {
              const prev = [...events].reverse().find((e) => e.midi === midi && e.staff === staff && Math.abs(e.beat + e.beats - beat) < 0.02);
              if (prev) { prev.beats += beats; continue; }
            }
            events.push({ beat, beats, midi, sp: [li, alter, oct], staff, dur, dots, tup: !!q(node, 'time-modification') });
          }
        }
        const full = (time[0] * 4) / time[1];
        mStart += maxT > 0 ? maxT / div : full;
        ends.push(mStart);
      });
      if (pi === 0) barEnds = ends;
    });
    if (!events.some((e) => e.midi != null)) throw new Error('No notes found in that file.');
    const bpb = (time[0] * 4) / time[1];
    return { title, by: 'Imported from MusicXML', time, bpb, fifths, bpm: 80, events, barEnds, end: barEnds[barEnds.length - 1], imported: true };
  }

  const piecesSkill = {
    id: 'pieces', strand: 'rep', title: 'Learn a piece', icon: '𝄐',
    blurb: 'Learn real music: small sections, hands separately, slowly, then up to tempo.',
    method: 'Deliberate practice for pieces, as teachers use it: work in short sections, hands separately before together, slowly enough to be accurate, then raise the tempo in small steps. The app raises the tempo by 10% after every run of 90% or better, can play the other hand for you, and has a “Wait for me” mode for learning the notes with no clock.',
    round: 1, timed: true, noRequeue: true,
    stages: [
      { t: 'Ode to Joy, hands together', lvl: 3, items: ['ode'] },
      { t: 'Bach: Prelude in C, opening', lvl: 6, items: ['prelude'] },
      { t: 'Minuet in G, first 8 bars', lvl: 7, items: ['minuet'] },
      { t: 'Your own piece (MusicXML)', lvl: 8, items: ['own'] },
    ],
    pool: (st) => st.items,
    label(item) { return item === 'own' ? 'Your own piece' : PIECES[item].title; },
    ask(item, st, api) {
      const data = PP.store.data;
      data.pieces = data.pieces || {};
      data.pieceProg = data.pieceProg || {};
      let id = item === 'own' ? Object.keys(data.pieces)[0] || null : item;
      let run = null, stepOff = null, hands = 't', view = null, p = null;
      const prog = (pid) => (data.pieceProg[pid] = data.pieceProg[pid] || { tempo: 0.6, best: 0 });
      const stopAll = () => { if (run) { run.stop(); run = null; } if (stepOff) { stepOff(); stepOff = null; } };

      const draw = () => {
        stopAll();
        const own = item === 'own';
        const opts = Object.keys(data.pieces).map((k) => `<option value="${k}"${k === id ? ' selected' : ''}>${data.pieces[k].title.replace(/</g, '&lt;')}</option>`).join('');
        const importer = own ? `<div class="ptools">${opts ? `<label>Piece <select id="pc-piece">${opts}</select></label>` : ''}<label class="btn soft sm file-btn">Import MusicXML<input type="file" id="pc-file" accept=".musicxml,.xml" hidden></label></div>
          <p class="muted small">Get MusicXML from MuseScore (File → Export → MusicXML, choose “Uncompressed (.musicxml)”), musescore.com or IMSLP. Compressed .mxl files aren’t supported yet.</p>` : '';
        if (!id) {
          api.prompt('Learn a piece of your choice');
          api.sub('Import a piece as MusicXML to practise it here with the same tools.');
          api.stageHTML(importer);
          api.actions([]);
          bindImport();
          return;
        }
        p = id in PIECES ? pieceData(PIECES[id]) : data.pieces[id];
        const pr = prog(id);
        const hasLH = p.events.some((e) => e.staff === 'b');
        if (!hasLH) hands = 't';
        const nBars = p.barEnds.length;
        const barOpts = (sel) => p.barEnds.map((_, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${i + 1}</option>`).join('');
        api.prompt(`<b>${p.title.replace(/</g, '&lt;')}</b>`);
        api.sub(`${p.by.replace(/</g, '&lt;')}. Learn it in small sections: hands separately and slowly first, then together, then up to tempo.`);
        api.stageHTML(`${importer}
          <div class="ptools">
            ${hasLH ? `<div class="seg" role="radiogroup" aria-label="Hands">${[['t', 'Right hand'], ['b', 'Left hand'], ['both', 'Both']].map(([v, l]) => `<button class="segb${hands === v ? ' on' : ''}" data-h="${v}">${l}</button>`).join('')}</div>` : ''}
            <label>Bars <select id="pc-from">${barOpts(0)}</select> to <select id="pc-to">${barOpts(nBars - 1)}</select></label>
            <span>Tempo <b id="pc-tempo">${Math.round(pr.tempo * 100)}%</b> <span class="muted">(${Math.round(p.bpm * pr.tempo)} bpm)</span></span>
          </div>
          <div class="staff-slot piece-slot" id="pc-staff"></div>
          <div class="perf-status" id="perf-status"></div>`);
        view = scoreView(api.root.querySelector('#pc-staff'), { clef: hasLH ? 'grand' : 'treble', fifths: p.fifths, time: p.time, events: p.events, barEnds: p.barEnds, beatW: 24, scroll: true, label: p.title });
        api.root.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => { hands = b.dataset.h; api.root.querySelectorAll('[data-h]').forEach((x) => x.classList.toggle('on', x === b)); }; });
        const setTempo = (d) => { pr.tempo = Math.max(0.3, Math.min(1.2, Math.round((pr.tempo + d) * 10) / 10)); PP.store.save(); draw(); };
        api.actions([
          { label: 'Play with click', primary: true, fn: play },
          { label: 'Wait for me (no clock)', fn: waitMode },
          { label: 'Hear it', fn: hear },
          { label: 'Tempo −', fn: () => setTempo(-0.1) },
          { label: 'Tempo +', fn: () => setTempo(0.1) },
          { label: 'Done for now', fn: () => { stopAll(); api.finish({ correct: false, score: pr.best, manual: true, note: `Progress saved: tempo ${Math.round(pr.tempo * 100)}%, best run ${Math.round(pr.best * 100)}%. Come back tomorrow — spaced practice beats one long session.` }); } },
        ]);
        bindImport();
      };
      function bindImport() {
        const f = api.root.querySelector('#pc-file');
        if (f) f.onchange = async () => {
          const file = f.files && f.files[0];
          if (!file) return;
          try {
            const piece = parseMusicXML(await file.text());
            const nid = 'x' + Date.now();
            data.pieces[nid] = piece;
            PP.store.save();
            id = nid;
            draw();
            api.say(`Imported “${piece.title.replace(/</g, '&lt;')}” (${piece.barEnds.length} bars).`, 'good');
          } catch (e) { api.say((e && e.message) || 'Couldn’t read that file.', 'bad'); }
        };
        const s = api.root.querySelector('#pc-piece');
        if (s) s.onchange = () => { id = s.value; draw(); };
      }
      function range() {
        const from = parseInt(api.root.querySelector('#pc-from').value, 10);
        const to = Math.max(from, parseInt(api.root.querySelector('#pc-to').value, 10));
        const rs = from === 0 ? 0 : p.barEnds[from - 1], re = p.barEnds[to];
        const inR = (e) => e.beat >= rs - 1e-3 && e.beat < re - 1e-3;
        const sel = view.sc.playable.map((e, gi) => ({ e, gi })).filter((x) => inR(x.e) && (hands === 'both' || x.e.staff === hands));
        const other = view.sc.playable.filter((e) => inR(e) && hands !== 'both' && e.staff !== hands);
        return { from, to, rs, sel, other, full: from === 0 && to === p.barEnds.length - 1 };
      }
      function play() {
        if (run) return;
        if (stepOff) { stepOff(); stepOff = null; }
        const r = range();
        if (!r.sel.length) { api.say('There are no notes for that hand in those bars.', 'info'); return; }
        const pr = prog(id);
        const bpm = Math.round(p.bpm * pr.tempo);
        const status = api.root.querySelector('#perf-status');
        view.clear();
        api.setActionsDisabled(true);
        run = PP.Perf.run({
          events: r.sel.map((x) => ({ beat: x.e.beat - r.rs, dur: x.e.beats, midi: x.e.midi })),
          autoPlay: r.other.map((e) => ({ beat: e.beat - r.rs, dur: e.beats, midi: e.midi })),
          bpm, beatsPerBar: p.bpb, countIn: p.bpb, pitched: true, clickEvery: p.time[1] === 8 && p.time[0] % 3 === 0 ? 1.5 : 1,
          onCursor: (b) => { if (b < 0) { status.textContent = 'Count-in: ' + Math.ceil(-b); view.cursor(null); } else { status.textContent = 'Play!'; view.cursor(b + r.rs); } },
          onMark: (i, s) => view.mark(r.sel[i].gi, s),
          onDone: (res) => {
            run = null; view.cursor(null); status.textContent = ''; api.setActionsDisabled(false);
            const pct = Math.round(res.score * 100);
            if (res.score >= 0.9 && hands === 'both' && r.full && pr.tempo >= 1) {
              pr.best = Math.max(pr.best, res.score); PP.store.save();
              api.finish({ correct: true, score: res.score, manual: true, note: `${pct}% — the whole piece, hands together, at full tempo. Piece learned! Keep playing it now and then so it stays in your hands.` });
              return;
            }
            if (res.score >= 0.9) {
              const nextT = Math.min(1, Math.round((pr.tempo + 0.1) * 10) / 10);
              const raised = nextT > pr.tempo;
              pr.tempo = nextT;
              if (r.full && hands === 'both') pr.best = Math.max(pr.best, res.score);
              PP.store.save();
              const tip = hands !== 'both' ? (hands === 't' && p.events.some((e) => e.staff === 'b') ? 'Next: the left hand, then both together.' : 'Next: hands together.') : r.full ? 'Keep going until full tempo.' : 'Next: a longer section, then the whole piece.';
              draw();
              api.say(`Clean run: ${pct}%.${raised ? ` Tempo raised to ${Math.round(nextT * 100)}%.` : ''} ${tip}`, 'good');
            } else {
              api.say(`${pct}% — ${res.summary} Repeat at this tempo, use “Wait for me” on the tricky bars, or press Tempo −.`, 'bad');
            }
          },
        });
      }
      function waitMode() {
        stopAll();
        const r = range();
        if (!r.sel.length) { api.say('There are no notes for that hand in those bars.', 'info'); return; }
        stepOff = stepMode(api, view, r.sel.map((x) => x.e), r.sel.map((x) => view.sc.slice[x.gi]), () => { stepOff = null; api.say('Section done. Repeat it a few times, then try “Play with click”.', 'good'); });
        api.say('Wait for me: play each note or chord when you’re ready. Wrong notes turn red; just find the right one.', 'info');
      }
      function hear() {
        stopAll();
        const r = range();
        const pr = prog(id);
        const sec = 60 / (p.bpm * pr.tempo);
        const evs = view.sc.playable.filter((e) => e.beat >= r.rs - 1e-3 && (r.to === p.barEnds.length - 1 || e.beat < p.barEnds[r.to] - 1e-3));
        api.Sound.seq(evs.map((e) => ({ m: e.midi, at: (e.beat - r.rs) * sec, d: Math.max(0.15, e.beats * sec * 0.95), v: 0.55 })), 0.15);
      }
      draw();
      return { cleanup: stopAll };
    },
  };

  // ---------- register ----------
  [arpSkill, accompSkill, piecesSkill].forEach((s) => { PP.Skills.push(s); PP.SkillById[s.id] = s; });
  const strand = (id) => PP.STRANDS.find((s) => s.id === id);
  strand('keys').skills.splice(2, 0, 'arpeggios');
  strand('sight').skills.push('accomp');
  PP.STRANDS.push({ id: 'rep', title: 'Repertoire', sub: 'Real pieces, practised the way teachers teach', skills: ['pieces'] });
  PP.parseMusicXML = parseMusicXML;
})();
