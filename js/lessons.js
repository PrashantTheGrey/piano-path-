/* Piano Path — the curriculum: skills, stages and how each question is asked and checked. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});
  const M = PP.M;
  const pc = M.pc;

  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(pc(m));
  const whites = (lo, hi) => { const o = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) o.push(m); return o; };
  const listNames = (notes) => notes.map((n) => M.nameOf(n)).join('–');

  // ---------- shared helpers ----------
  /** Watch held keys for a chord with the given pitch classes. Calls done(ok, heldMidis). */
  function chordWatcher(targetPcs, api, done, alsoAccept) {
    const target = new Set(targetPcs);
    let timer = null;
    return function (ev) {
      const held = api.Input.heldMidis();
      const hp = new Set(held.map(pc));
      if (timer) { clearTimeout(timer); timer = null; }
      if (hp.size === target.size && [...target].every((p) => hp.has(p))) { done(true, held); return; }
      if (alsoAccept) { const r = alsoAccept(hp, held); if (r) return; }
      if (ev.type === 'on' && (hp.size >= target.size || held.length >= target.size + 1)) {
        timer = api.after(750, () => {
          const h2 = api.Input.heldMidis();
          const p2 = new Set(h2.map(pc));
          if (p2.size === target.size && [...target].every((p) => p2.has(p))) done(true, h2);
          else if (p2.size >= target.size) done(false, h2);
        });
      }
    };
  }
  const heldNames = (midis, fifths) => [...new Set(midis.map((m) => M.midiName(m, fifths)))].join(', ') || 'nothing';

  /** Place a chord's tones in a comfortable middle register (for showing / playing). */
  function placeChord(notes) {
    const shift = notes[0].midi < 55 ? 12 : notes[0].midi > 67 ? -12 : 0;
    return notes.map((n) => M.note(n.letter, n.acc, n.oct + shift / 12));
  }

  // ---------- 1. Keyboard map ----------
  const KEY_TIPS = {
    0: 'C is the white key just left of each pair of black keys.',
    2: 'D sits between the two black keys.',
    4: 'E is just right of the pair of black keys.',
    5: 'F is just left of each group of three black keys.',
    7: 'G sits between the 1st and 2nd of the three black keys.',
    9: 'A sits between the 2nd and 3rd of the three black keys.',
    11: 'B is just right of the three black keys.',
  };
  function blackTip(p) {
    return `${M.SHARP_NAMES[p]} and ${M.FLAT_NAMES[p]} are the same black key: just right of ${M.SHARP_NAMES[p - 1]}, just left of ${M.SHARP_NAMES[p + 1]}.`;
  }
  const keysSkill = {
    id: 'keys', strand: 'keys', title: 'Keyboard map', icon: '⌨',
    blurb: 'Find any note name on the keys, instantly.',
    method: 'Retrieval practice with a speed goal: you recall each key from memory, against the clock, until it’s automatic. Missed notes come back sooner.',
    round: 10, correction: true,
    stages: [
      { t: 'C, D and E', lvl: 1, target: 2.5, items: ['0', '2', '4'], d: 'The keys around each pair of black keys.' },
      { t: 'F, G, A and B', lvl: 1, target: 2.5, items: ['5', '7', '9', '11'], d: 'The keys around each group of three black keys.' },
      { t: 'All white keys', lvl: 1, target: 2, items: ['0', '2', '4', '5', '7', '9', '11'], d: 'Mixed, faster.' },
      { t: 'Black keys as sharps', lvl: 2, target: 2.5, items: ['1#', '3#', '6#', '8#', '10#'], d: 'A sharp is the next key to the right.' },
      { t: 'Black keys as flats', lvl: 2, target: 2.5, items: ['1b', '3b', '6b', '8b', '10b'], d: 'A flat is the next key to the left.' },
    ],
    pool: (st) => st.items,
    label(item) { const p = parseInt(item, 10); return (item.endsWith('b') ? M.FLAT_NAMES : M.SHARP_NAMES)[p]; },
    ask(item, st, api) {
      const p = parseInt(item, 10);
      const flat = item.endsWith('b');
      const label = this.label(item);
      api.prompt(`Play any <span class="big-note">${label}</span>`);
      api.sub('Any octave counts.');
      api.startClock();
      return {
        onNote(ev) {
          if (ev.type !== 'on') return;
          const ok = pc(ev.midi) === p;
          api.finish({
            correct: ok,
            note: ok ? '' : `You played ${M.midiName(ev.midi, 0, flat ? 'flat' : 'sharp')}. ${KEY_TIPS[p] || blackTip(p)}`,
            reveal: () => api.Keys.markPcs([p], 'hint'),
            fix: (e) => e.type === 'on' && pc(e.midi) === p,
          });
        },
      };
    },
  };

  // ---------- 2. Note reading ----------
  const LANDMARKS = [
    { step: 14, name: 'Low C (two ledger lines below the bass staff)' },
    { step: 21, name: 'Bass C (2nd space of the bass staff)' },
    { step: 24, name: 'Bass F (4th line — the line between the bass clef’s dots)' },
    { step: 28, name: 'Middle C (one ledger line)' },
    { step: 32, name: 'Treble G (2nd line — where the treble clef curls)' },
    { step: 35, name: 'Treble C (3rd space)' },
    { step: 42, name: 'High C (two ledger lines above the treble staff)' },
  ];
  function landmarkTip(n, clef) {
    const s = M.stepOf(n);
    const marks = clef === 'treble' ? LANDMARKS.filter((L) => L.step >= 28) : clef === 'bass' ? LANDMARKS.filter((L) => L.step <= 28) : LANDMARKS;
    let best = marks[0];
    for (const L of marks) if (Math.abs(L.step - s) < Math.abs(best.step - s)) best = L;
    const d = s - best.step;
    if (d === 0) return `It’s a landmark: ${best.name}.`;
    return `Nearest landmark: ${best.name}. This note is ${Math.abs(d)} step${Math.abs(d) > 1 ? 's' : ''} ${d > 0 ? 'up' : 'down'} from it (line → space → line).`;
  }
  function parseReadItem(item) {
    // '64' | '61b' | '61#' | '60+64' (dyad) | '48|67' (bass|treble)
    if (item.includes('|')) {
      const [b, t] = item.split('|').map((x) => parseInt(x, 10));
      return { notes: [{ ...M.spell(b, 0), staff: 'b' }, { ...M.spell(t, 0), staff: 't' }], midis: [b, t] };
    }
    if (item.includes('+')) {
      const ms = item.split('+').map((x) => parseInt(x, 10));
      return { notes: ms.map((m) => M.spell(m, 0)), midis: ms };
    }
    const m = parseInt(item, 10);
    const pref = item.endsWith('b') ? 'flat' : item.endsWith('#') ? 'sharp' : undefined;
    return { notes: [M.spell(m, 0, pref)], midis: [m] };
  }
  function chromaticItems(lo, hi) {
    const o = [];
    for (let m = lo; m <= hi; m++) { if (isBlack(m)) { o.push(m + '#', m + 'b'); } else o.push(String(m)); }
    return o;
  }
  function readingSkill(id, title, clef, blurb, stages) {
    return {
      id, strand: 'read', title, blurb,
      icon: clef === 'bass' ? '𝄢' : clef === 'grand' ? '𝄚' : '𝄞',
      method: 'Landmark reading (as taught in methods like Piano Adventures): you anchor on a few landmark notes and read the rest as steps and skips from them. Spaced repetition brings back the notes you miss, and the speed goal builds fluency.',
      round: 10, correction: true,
      stages,
      pool: (st) => st.items,
      label(item) { return parseReadItem(item).notes.map((n) => M.nameOf(n, true)).join(' + '); },
      ask(item, st, api) {
        const { notes, midis } = parseReadItem(item);
        const multi = midis.length > 1;
        api.staff({ clef: st.clef || clef, items: [{ kind: 'note', notes, dur: 'w' }], label: 'Note on a staff' });
        api.prompt(multi ? 'Play both notes together' : 'Play this note');
        api.sub(st.d || '');
        api.startClock();
        const want = new Set(midis);
        const describe = () => notes.map((n) => `<b>${M.nameOf(n, true)}</b>`).join(' and ');
        return {
          onNote(ev) {
            if (ev.type !== 'on') return;
            const reveal = () => { api.Keys.mark(midis, 'hint'); api.Keys.focus(midis[0]); api.Sound.chord(midis, 0, 1, 0.6); };
            if (!want.has(ev.midi)) {
              api.finish({
                correct: false,
                note: `You played ${M.midiName(ev.midi, 0, undefined, true)}. This is ${describe()}. ${landmarkTip(notes[notes.length - 1], st.clef || clef)}`,
                reveal,
                fix: () => midis.every((m) => api.Input.held.has(m)),
              });
              return;
            }
            if (midis.every((m) => api.Input.held.has(m))) api.finish({ correct: true, note: multi ? '' : M.nameOf(notes[0], true) });
          },
        };
      },
    };
  }
  const trebleSkill = readingSkill('treble', 'Treble clef notes', 'treble', 'Read right-hand notes at a glance.', [
    { t: 'Middle C position', lvl: 1, target: 3, items: whites(60, 67).map(String), d: 'C4 to G4: the five notes under your right hand.' },
    { t: 'Middle C to treble C', lvl: 1, target: 3, items: whites(60, 72).map(String), d: 'One full octave up from middle C.' },
    { t: 'The whole staff', lvl: 2, target: 2.5, items: whites(62, 79).map(String), d: 'D4 (below the staff) to G5 (above it).' },
    { t: 'Ledger lines', lvl: 3, target: 2.5, items: whites(57, 84).map(String), d: 'From A3 below middle C up to high C.' },
    { t: 'Sharps and flats', lvl: 4, target: 3, items: chromaticItems(60, 72), d: 'Read the accidental, then find the black (or white) key.' },
  ]);
  const bassSkill = readingSkill('bass', 'Bass clef notes', 'bass', 'Read left-hand notes at a glance.', [
    { t: 'Bass C position', lvl: 1, target: 3, items: whites(48, 55).map(String), d: 'C3 to G3: the five notes under your left hand.' },
    { t: 'F2 to middle C', lvl: 2, target: 3, items: whites(41, 60).map(String), d: 'The whole bass staff, up to middle C.' },
    { t: 'Ledger lines', lvl: 3, target: 2.5, items: whites(36, 64).map(String), d: 'Low C up to E4 above middle C.' },
    { t: 'Sharps and flats', lvl: 4, target: 3, items: chromaticItems(48, 60), d: 'Accidentals in the bass clef.' },
  ]);
  const dyads = [];
  whites(60, 72).forEach((a) => { const w = whites(a, 84); [2, 3, 4, 5].forEach((k) => { if (w[k] && w[k] <= 79) dyads.push(a + '+' + w[k]); }); });
  const hands = [];
  whites(48, 55).forEach((b) => whites(60, 67).forEach((t) => { if ((t - b) % 3 === 0) hands.push(b + '|' + t); }));
  const grandSkill = readingSkill('grand', 'Grand staff', 'grand', 'Both clefs together, the way real music looks.', [
    { t: 'Both clefs, mixed', lvl: 3, target: 2.5, items: whites(43, 77).map(String), d: 'Notes jump between the clefs. Middle C sits between them.' },
    { t: 'Two notes at once', lvl: 4, target: 3.5, items: dyads, d: 'Read the bottom note, then the gap (3rd, 4th, 5th, 6th).' },
    { t: 'Hands together', lvl: 5, target: 4, items: hands, d: 'One note in each hand at the same time.' },
  ]);

  // ---------- 3. Key signatures ----------
  const MAJ_NAMES = Object.keys(M.MAJOR_FIFTHS);
  const relMajor = (fifths) => MAJ_NAMES.find((n) => M.MAJOR_FIFTHS[n] === fifths);
  const keysigSkill = {
    id: 'keysig', strand: 'keys', title: 'Key signatures', icon: '♯',
    blurb: 'Name the key from its sharps or flats.',
    method: 'You learn two short rules, then practise them until you no longer need them. Feedback after each answer restates the rule with that exact key.',
    round: 10,
    stages: [
      { t: 'C, G and F', lvl: 2, target: 5, items: ['C', 'G', 'F'] },
      { t: 'Up to two sharps or flats', lvl: 3, target: 5, items: ['C', 'G', 'F', 'D', 'B♭'] },
      { t: 'Up to four', lvl: 3, target: 5, items: ['C', 'G', 'F', 'D', 'B♭', 'A', 'E♭', 'E', 'A♭'] },
      { t: 'All major keys', lvl: 4, target: 5, items: MAJ_NAMES.slice() },
      { t: 'Minor keys', lvl: 4, target: 6, items: ['m:A', 'm:E', 'm:D', 'm:B', 'm:G', 'm:F♯', 'm:C', 'm:C♯', 'm:F'] },
    ],
    pool: (st) => st.items,
    label(item) { return item.startsWith('m:') ? item.slice(2) + ' minor' : item + ' major'; },
    ask(item, st, api) {
      const minor = item.startsWith('m:');
      const t = minor ? item.slice(2) : item;
      const k = M.key(t, minor ? 'minor' : 'major');
      const clef = st.lvl >= 3 && Math.random() < 0.4 ? 'bass' : 'treble';
      api.staff({ clef, fifths: k.fifths, items: [], minWidth: 140, label: 'Key signature' });
      api.prompt(minor ? 'Which <b>minor</b> key has this signature?' : 'Which <b>major</b> key has this signature?');
      api.sub('');
      const table = minor ? M.MINOR_FIFTHS : M.MAJOR_FIFTHS;
      const others = Object.keys(table).filter((n) => n !== t && Math.abs(table[n] - k.fifths) <= 3 && Math.abs(table[n]) <= Math.max(4, Math.abs(k.fifths) + 1));
      const opts = shuffle([t, ...shuffle(others).slice(0, 3)]);
      let rule;
      if (k.fifths === 0) rule = minor ? 'No sharps or flats: A minor (relative of C major).' : 'No sharps or flats means C major.';
      else if (k.fifths > 0) {
        const last = M.LETTERS[[3, 0, 4, 1, 5, 2, 6][k.fifths - 1]] + '♯';
        const maj = relMajor(k.fifths);
        rule = `Sharps rule: the last sharp is ${last}; one half step up is ${maj}, so it’s ${maj} major.` + (minor ? ` The relative minor is 3 half steps below ${maj}: ${t} minor.` : '');
      } else {
        const maj = relMajor(k.fifths);
        rule = (k.fifths === -1 ? 'One flat is always F major.' : `Flats rule: the second-to-last flat names the key — ${maj} major.`) + (minor ? ` The relative minor is 3 half steps below ${maj}: ${t} minor.` : '');
      }
      api.startClock();
      api.buttons(opts.map((o) => ({ label: o + (minor ? ' minor' : ' major'), value: o })), (v) => {
        api.markButton(t, 'good');
        if (v !== t) api.markButton(v, 'bad');
        api.finish({ correct: v === t, note: rule });
      });
      return {};
    },
  };

  // ---------- 4. Scales ----------
  const FINGERS = {
    C: ['12312345', '54321321'], G: ['12312345', '54321321'], D: ['12312345', '54321321'], A: ['12312345', '54321321'], E: ['12312345', '54321321'],
    B: ['12312345', '43214321'], F: ['12341234', '54321321'], 'B♭': ['41231234', '32143213'], 'E♭': ['31234123', '32143213'],
    'A♭': ['34123123', '32143213'], 'D♭': ['23123412', '32143213'], 'F♯': ['23412312', '43213214'],
    'h:A': ['12312345', '54321321'], 'h:E': ['12312345', '54321321'], 'h:D': ['12312345', '54321321'], 'h:G': ['12312345', '54321321'],
    'h:C': ['12312345', '54321321'], 'h:B': ['12312345', '43214321'],
  };
  const scalesSkill = {
    id: 'scales', strand: 'keys', title: 'Scales', icon: '≋',
    blurb: 'Play every major and minor scale from memory.',
    method: 'Recall first: you play the scale before seeing it written (retrieval practice). A clean, even run is the goal; any slip restarts from the tonic so the correct pattern is what gets repeated. Keys follow the order used in graded piano exams.',
    round: 6, correction: false,
    stages: [
      { t: 'C, G and F major', lvl: 1, target: 14, items: ['C', 'G', 'F'] },
      { t: 'D, A, B♭ and E♭ major', lvl: 2, target: 12, items: ['D', 'A', 'B♭', 'E♭'] },
      { t: 'E, A♭, B, D♭ and F♯ major', lvl: 3, target: 12, items: ['E', 'A♭', 'B', 'D♭', 'F♯'] },
      { t: 'Up and down (C, G, D, F, B♭)', lvl: 3, target: 22, items: ['ud:C', 'ud:G', 'ud:D', 'ud:F', 'ud:B♭'] },
      { t: 'Harmonic minors', lvl: 4, target: 14, items: ['h:A', 'h:E', 'h:D', 'h:G', 'h:C', 'h:B'] },
    ],
    pool: (st) => st.items,
    label(item) {
      if (item.startsWith('h:')) return item.slice(2) + ' harmonic minor';
      if (item.startsWith('ud:')) return item.slice(3) + ' major (up and down)';
      return item + ' major';
    },
    ask(item, st, api) {
      const harmonic = item.startsWith('h:');
      const ud = item.startsWith('ud:');
      const t = item.replace(/^(h:|ud:)/, '');
      const k = M.key(t, harmonic ? 'minor' : 'major');
      const up = M.scaleOf(k, 4, harmonic ? 'harmonic' : 'major');
      const seq = ud ? up.concat(up.slice(0, -1).reverse()) : up;
      const rel = seq.map((n) => n.midi - up[0].midi);
      const fing = FINGERS[harmonic ? 'h:' + t : t];
      api.prompt(`Play <b>${this.label(item)}</b>`);
      api.sub(`Start on any ${t}. Either hand. Aim for an even, steady run.`);
      const dots = seq.map(() => '<span class="dot"></span>').join('');
      api.stageHTML(`<div class="seq" id="seq">${dots}</div><div class="staff-slot" id="sc-staff"></div>`);
      const dotEls = () => api.root.querySelectorAll('#seq .dot');
      let idx = 0, base = null, mistakes = 0, hinted = false;
      const showNotes = () => {
        hinted = true;
        const slot = api.root.querySelector('#sc-staff');
        const items = seq.map((n) => ({ kind: 'note', notes: [n], dur: 'q' }));
        PP.Staff.render(slot, { clef: 'treble', fifths: k.fifths, items, beatW: 1.2 * 10, label: 'Scale' });
      };
      api.actions([
        { label: 'Show fingering', fn: () => { hinted = true; api.say(`Right hand: ${fing[0].split('').join(' ')} · Left hand: ${fing[1].split('').join(' ')} (going up)`, 'info'); } },
        { label: 'Show the notes', fn: showNotes },
      ]);
      return {
        onNote(ev) {
          if (ev.type !== 'on') return;
          const ds = dotEls();
          if (idx === 0) {
            if (pc(ev.midi) === k.tonicPc) {
              base = ev.midi; idx = 1; api.startClock();
              ds.forEach((d) => { d.className = 'dot'; d.textContent = ''; });
              ds[0].className = 'dot on'; ds[0].textContent = M.nameOf(seq[0]);
            } else api.say(`Start on ${t}.`, 'info');
            if (idx < seq.length) return;
          }
          const expected = base + rel[idx];
          if (ev.midi === expected) {
            ds[idx].className = 'dot on'; ds[idx].textContent = M.nameOf(seq[idx]);
            idx++;
            if (idx === seq.length) {
              const usedHint = hinted;
              showNotes();
              api.finish({ correct: mistakes === 0, hinted: usedHint, note: mistakes ? `Finished, with ${mistakes} restart${mistakes > 1 ? 's' : ''}. It’ll come back for another clean run.` : listNames(up) });
            }
          } else {
            mistakes++;
            const hit = up.find((n) => pc(n.midi) === pc(ev.midi));
            api.say(`Not ${hit ? M.nameOf(hit) : M.midiName(ev.midi, k.fifths)} — next was <b>${M.nameOf(seq[idx])}</b>. Start again from ${t}.`, 'bad');
            ds[idx].className = 'dot bad';
            idx = 0;
            if (mistakes >= 2 && !hinted) showNotes();
          }
        },
      };
    },
  };

  // ---------- 5. Chords ----------
  const MAJ_ROOTS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const MIN_ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  const chordName = (root, type) => (type === 'maj' ? `${root} major` : `${root} ${M.CHORDS[type].label}`);
  function askChord(api, root, type, prompt, explain) {
    const rootNote = M.parse(root + '4');
    const tones = placeChord(M.chordNotes(rootNote, type));
    const pcs = tones.map((n) => pc(n.midi));
    const fifths = M.MAJOR_FIFTHS[root] !== undefined && Math.abs(M.MAJOR_FIFTHS[root]) <= 6 ? M.MAJOR_FIFTHS[root] : 0;
    api.prompt(prompt);
    api.sub('Any inversion, any octave. Hold the notes down together.');
    api.stageHTML('<div class="staff-slot" id="ch-staff"></div>');
    api.startClock();
    const show = () => PP.Staff.render(api.root.querySelector('#ch-staff'), { clef: 'treble', items: [{ kind: 'note', notes: tones, dur: 'w' }], minWidth: 120, label: 'Chord' });
    const watch = chordWatcher(pcs, api, (ok, held) => {
      show();
      api.finish({
        correct: ok,
        note: (ok ? '' : `You held ${heldNames(held, fifths)}. `) + explain + ` = ${listNames(tones)}.`,
        reveal: () => { api.Keys.mark(tones.map((n) => n.midi), 'hint'); api.Sound.chord(tones.map((n) => n.midi), 0, 1.4); },
      });
    });
    return { onNote: watch };
  }
  const chordsSkill = {
    id: 'chords', strand: 'keys', title: 'Chords', icon: '♫',
    blurb: 'Build any triad or 7th chord without thinking.',
    method: 'Practice by shape and sound: you build each chord from its root, hear it, and see it written right after. Spaced repetition keeps the ones you fumble in rotation.',
    round: 8,
    stages: [
      { t: 'C, F and G major', lvl: 1, target: 5, items: ['C:maj', 'F:maj', 'G:maj'] },
      { t: 'White-key major chords', lvl: 2, target: 5, items: ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((r) => r + ':maj') },
      { t: 'Minor chords', lvl: 2, target: 5, items: ['A', 'D', 'E', 'C', 'F', 'G', 'B'].map((r) => r + ':min') },
      { t: 'Major and minor, all 12 roots', lvl: 3, target: 5, items: MAJ_ROOTS.map((r) => r + ':maj').concat(MIN_ROOTS.map((r) => r + ':min')) },
      { t: 'Diminished and augmented', lvl: 4, target: 6, items: ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((r) => r + ':dim').concat(['C', 'D', 'E', 'F', 'G', 'A'].map((r) => r + ':aug')) },
      { t: 'Dominant 7th chords', lvl: 5, target: 7, items: MAJ_ROOTS.map((r) => r + ':dom7') },
    ],
    pool: (st) => st.items,
    label(item) { const [r, t] = item.split(':'); return chordName(r, t); },
    ask(item, st, api) {
      const [root, type] = item.split(':');
      const tip = { maj: 'Major = root + 4 half steps + 3 half steps', min: 'Minor = root + 3 half steps + 4 half steps', dim: 'Diminished = two minor 3rds (3 + 3 half steps)', aug: 'Augmented = two major 3rds (4 + 4 half steps)', dom7: 'Dominant 7th = major chord + a minor 7th above the root', maj7: 'Major 7th = major chord + a major 7th (one half step below the octave)', min7: 'Minor 7th = minor chord + a minor 7th above the root' }[type];
      return askChord(api, root, type, `Play <span class="big-note">${chordName(root, type)}</span>`, `${tip}. ${chordName(root, type)}`);
    },
  };

  // ---------- 6. Chords in a key ----------
  const NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  const MAJ_DEG_TYPE = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
  function degreeChord(k, num) {
    if (k.mode === 'minor') {
      const sc = M.scaleOf(k, 4, 'harmonic');
      const map = { i: [0, 'min'], iv: [3, 'min'], V: [4, 'maj'], VI: [5, 'maj'] };
      const [d, type] = map[num];
      return { root: sc[d], type };
    }
    const sc = M.scaleOf(k, 4, 'major');
    const d = NUMERALS.indexOf(num);
    return { root: sc[d], type: MAJ_DEG_TYPE[d] };
  }
  const keychordsSkill = {
    id: 'keychords', strand: 'keys', title: 'Chords in a key', icon: 'Ⅳ',
    blurb: 'Know I, IV, V and vi in any key — the backbone of playing by ear.',
    method: 'Roman-numeral (Nashville-style) thinking: songs reuse the same few chord numbers in every key. Once the numbers are automatic, you can play along with, or transpose, almost any song.',
    round: 8,
    stages: [
      { t: 'C major: I, IV, V', lvl: 2, target: 6, items: ['C:I', 'C:IV', 'C:V'] },
      { t: 'C, G, F: I, IV, V, vi', lvl: 3, target: 6, items: ['C', 'G', 'F'].flatMap((k) => ['I', 'IV', 'V', 'vi'].map((n) => k + ':' + n)) },
      { t: 'Add ii and iii', lvl: 4, target: 6, items: ['C', 'G', 'F', 'D'].flatMap((k) => ['I', 'ii', 'iii', 'IV', 'V', 'vi'].map((n) => k + ':' + n)) },
      { t: 'More keys: D, A, B♭, E♭', lvl: 4, target: 6, items: ['D', 'A', 'B♭', 'E♭'].flatMap((k) => ['I', 'ii', 'IV', 'V', 'vi'].map((n) => k + ':' + n)) },
      { t: 'Minor keys: i, iv, V', lvl: 5, target: 6, items: ['A', 'E', 'D'].flatMap((k) => ['i', 'iv', 'V'].map((n) => 'm' + k + ':' + n)) },
    ],
    pool: (st) => st.items,
    label(item) { const [kk, n] = item.split(':'); const minor = kk.startsWith('m'); return `${n} in ${minor ? kk.slice(1) + ' minor' : kk + ' major'}`; },
    ask(item, st, api) {
      const [kk, num] = item.split(':');
      const minor = kk.startsWith('m');
      const k = M.key(minor ? kk.slice(1) : kk, minor ? 'minor' : 'major');
      const { root, type } = degreeChord(k, num);
      const rootName = M.nameOf(root);
      return askChord(api, rootName, type, `Key of <b>${k.name}</b>: play the <span class="big-note rn">${num}</span> chord`, `${num} in ${k.name} is ${chordName(rootName, type)}`);
    },
  };

  // ---------- 7. Find the note (functional ear training) ----------
  const RESOLVE = { 0: [0], 1: [1, 0], 2: [2, 0], 3: [3, 2, 0], 4: [4, 2, 0], 5: [5, 4, 2, 0], 6: [6, 7, 9, 11, 12], 7: [7, 5, 4, 2, 0], 8: [8, 9, 11, 12], 9: [9, 11, 12], 10: [10, 11, 12], 11: [11, 12] };
  function tonicMidi(k) { let t = 60 + k.tonicPc; if (t > 64) t -= 12; return t; }
  function cadence(t, at = 0) {
    // I – IV – V – I with smooth voice leading and a bass line
    return [
      { m: [t - 12, t, t + 4, t + 7], at, d: 0.55 },
      { m: [t - 7, t, t + 5, t + 9], at: at + 0.6, d: 0.55 },
      { m: [t - 5, t - 1, t + 2, t + 7], at: at + 1.2, d: 0.55 },
      { m: [t - 12, t, t + 4, t + 7], at: at + 1.8, d: 0.9 },
    ];
  }
  const pitchSkill = {
    id: 'pitch', strand: 'ear', title: 'Find the note', icon: '◎',
    blurb: 'Hear any note in relation to the key — the core play-by-ear skill.',
    method: 'Functional ear training (the approach behind Alain Benbassat’s Functional Ear Trainer, rooted in movable-do solfège): a cadence sets the key, you find one note, then hear it resolve home. You learn how each scale degree feels, not absolute pitches.',
    round: 10,
    stages: [
      { t: 'do, re, mi', lvl: 1, target: 6, items: ['C:0', 'C:2', 'C:4'] },
      { t: 'do to sol', lvl: 1, target: 6, items: [0, 2, 4, 5, 7].map((s) => 'C:' + s) },
      { t: 'The whole scale in C', lvl: 2, target: 6, items: [0, 2, 4, 5, 7, 9, 11].map((s) => 'C:' + s) },
      { t: 'Any key (C, G, F, D, B♭)', lvl: 3, target: 6, items: ['C', 'G', 'F', 'D', 'B♭'].flatMap((k) => [0, 2, 4, 5, 7, 9, 11].map((s) => k + ':' + s)) },
      { t: 'Chromatic notes', lvl: 4, target: 7, items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((s) => 'C:' + s) },
    ],
    pool: (st) => st.items,
    label(item) { const [kk, s] = item.split(':'); return `${M.SOLFEGE[s]} in ${kk}`; },
    ask(item, st, api) {
      const [kk, sStr] = item.split(':');
      const s = parseInt(sStr, 10);
      const k = M.key(kk, 'major');
      const t = tonicMidi(k);
      const target = t + s;
      let ready = false;
      const play = (full) => {
        ready = false;
        const ev = full ? cadence(t) : [{ m: [t - 12, t, t + 4, t + 7], at: 0, d: 0.7 }];
        const noteAt = full ? 3.0 : 1.1;
        ev.push({ m: target, at: noteAt, d: 1.0, v: 0.8 });
        const delay = 0.1;
        api.Sound.seq(ev, delay);
        api.after((delay + noteAt) * 1000, () => { ready = true; if (!api.clockStarted()) api.startClock(); });
      };
      api.prompt(`Key of <b>${k.name}</b>: find the note you hear`);
      api.sub('Play it on the piano — any octave. You’ll hear it resolve home afterwards.');
      api.stageHTML(`<div class="solfa">${[0, 2, 4, 5, 7, 9, 11].map((x) => `<span class="sf${x === 0 ? ' home' : ''}">${M.SOLFEGE[x]}</span>`).join('')}</div>`);
      play(api.qIndex === 0 || api.qIndex % 5 === 0);
      api.actions([{ label: 'Hear the key again', fn: () => play(true) }, { label: 'Hear the note again', fn: () => api.Sound.note(target, 0, 1, 0.8) }]);
      const resolveSeq = () => RESOLVE[s].map((x, i) => ({ m: t + x, at: i * 0.38, d: i === RESOLVE[s].length - 1 ? 0.9 : 0.36 }));
      return {
        onNote(ev) {
          if (ev.type !== 'on' || !ready) return;
          const ok = pc(ev.midi) === pc(target);
          const sf = M.SOLFEGE[s];
          const nm = M.midiName(target, k.fifths, s === 6 ? 'sharp' : 'flat');
          api.root.querySelectorAll('.solfa .sf').forEach((el) => { if (el.textContent === sf) el.classList.add(ok ? 'good' : 'want'); });
          if (ok) api.Sound.seq(resolveSeq(), 0.35);
          else api.Sound.seq([{ m: target, at: 0, d: 0.6 }].concat(resolveSeq().map((e) => ({ ...e, at: e.at + 0.7 }))), 0.3);
          api.finish({
            correct: ok,
            note: `It was <b>${sf}</b> (${nm}), the ${M.DEGREE_NAMES[s]} note of ${k.name}. Listen to it resolve home.`,
            reveal: () => api.Keys.markPcs([pc(target)], 'hint'),
            delay: 2600,
          });
        },
      };
    },
  };

  // ---------- 8. Intervals ----------
  const intervalsSkill = {
    id: 'intervals', strand: 'ear', title: 'Intervals', icon: '↕',
    blurb: 'Recognise the distance between two notes.',
    method: 'Each interval is tied to a familiar tune (a memory hook), then practised until you hear the size directly. Spaced repetition focuses on the pairs you confuse.',
    round: 10,
    stages: [
      { t: '2nd, 3rd, 5th, octave', lvl: 1, target: 5, items: ['2', '4', '7', '12'] },
      { t: 'Add minor 3rd and 4th', lvl: 2, target: 5, items: ['2', '3', '4', '5', '7', '12'] },
      { t: 'Add minor 2nd and 6ths', lvl: 3, target: 5, items: ['1', '2', '3', '4', '5', '7', '8', '9', '12'] },
      { t: 'All intervals, going up', lvl: 4, target: 5, items: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
      { t: 'All intervals, going down', lvl: 5, target: 5, items: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12'] },
    ],
    pool: (st) => st.items,
    label(item) { const d = item.startsWith('d'); return M.INTERVALS[parseInt(item.replace('d', ''), 10)].name + (d ? ' (down)' : ''); },
    ask(item, st, api) {
      const down = item.startsWith('d');
      const n = parseInt(item.replace('d', ''), 10);
      const a = down ? rnd(65, 76) : rnd(52, 64);
      const b = down ? a - n : a + n;
      const play = () => { api.Sound.seq([{ m: a, at: 0, d: 0.75 }, { m: b, at: 0.8, d: 1.0 }], 0.1); };
      play();
      api.after(900, () => { if (!api.clockStarted()) api.startClock(); });
      api.prompt(`What interval do you hear${down ? ' (going down)' : ''}?`);
      api.sub('');
      api.actions([{ label: 'Hear it again', fn: play }, { label: 'Play both together', fn: () => api.Sound.chord([a, b], 0, 1.3) }]);
      const opts = st.items.map((x) => ({ label: M.INTERVALS[parseInt(x.replace('d', ''), 10)].name, value: x }));
      api.buttons(opts, (v) => {
        api.markButton(item, 'good');
        if (v !== item) api.markButton(v, 'bad');
        const info = M.INTERVALS[n];
        api.finish({ correct: v === item, note: `${info.name}${down ? ' down' : ''} (${n} half steps).` + (down ? '' : ` Hook: ${info.hook}.`), delay: 1600 });
        if (v !== item) play();
      });
      return {};
    },
  };

  // ---------- 9. Chord colour ----------
  const QUALITY_HINT = { maj: 'bright, settled', min: 'darker, sad', dim: 'tense, squeezed', aug: 'eerie, floating', maj7: 'soft, dreamy', dom7: 'bluesy, wants to move', min7: 'mellow, warm' };
  const qualitySkill = {
    id: 'quality', strand: 'ear', title: 'Chord colour', icon: '◐',
    blurb: 'Tell major, minor and other chords apart by sound.',
    method: 'Contrast training: you hear the chord as a block and then broken, and compare its colour against a small set of choices. New chord types are added only when the earlier ones are reliable.',
    round: 10,
    stages: [
      { t: 'Major or minor', lvl: 1, target: 5, items: ['maj', 'min'] },
      { t: 'Major or minor, inverted', lvl: 2, target: 5, items: ['maj', 'min'], inv: true },
      { t: 'Add diminished', lvl: 3, target: 5, items: ['maj', 'min', 'dim'], inv: true },
      { t: 'Add augmented', lvl: 4, target: 5, items: ['maj', 'min', 'dim', 'aug'], inv: true },
      { t: '7th chords', lvl: 5, target: 6, items: ['maj7', 'dom7', 'min7'] },
    ],
    pool: (st) => st.items,
    label(item) { return M.CHORDS[item].label; },
    ask(item, st, api) {
      const root = rnd(50, 62);
      let tones = M.CHORDS[item].iv.map((i) => root + i);
      if (st.inv) { const r = rnd(0, 2); for (let i = 0; i < r; i++) tones = tones.slice(1).concat(tones[0] + 12); }
      const play = () => api.Sound.seq([{ m: tones, at: 0, d: 1.2 }].concat(tones.map((m, i) => ({ m, at: 1.4 + i * 0.32, d: 0.5 }))), 0.1);
      play();
      api.startClock();
      api.prompt('What kind of chord is this?');
      api.sub('You hear it together, then one note at a time.');
      api.actions([{ label: 'Hear it again', fn: play }]);
      api.buttons(st.items.map((x) => ({ label: M.CHORDS[x].label[0].toUpperCase() + M.CHORDS[x].label.slice(1), sub: QUALITY_HINT[x], value: x })), (v) => {
        api.markButton(item, 'good');
        if (v !== item) api.markButton(v, 'bad');
        api.finish({ correct: v === item, note: `${M.CHORDS[item].label[0].toUpperCase() + M.CHORDS[item].label.slice(1)}: ${QUALITY_HINT[item]}.` });
      });
      return {};
    },
  };

  // ---------- 10. Hear the chords (progressions) ----------
  const DIA = { I: [0, 'maj'], ii: [2, 'min'], iii: [4, 'min'], IV: [5, 'maj'], V: [7, 'maj'], vi: [9, 'min'] };
  function voiceChord(rootPc, type, prev) {
    const iv = M.CHORDS[type].iv;
    const r = 55 + ((rootPc - 7 + 12) % 12);
    const base = iv.map((i) => r + i);
    const cands = [];
    for (let inv = 0; inv < iv.length; inv++) {
      let v = base.slice(inv).concat(base.slice(0, inv).map((m) => m + 12));
      for (const sh of [-12, 0]) { const w = v.map((m) => m + sh); if (w[0] >= 52 && w[w.length - 1] <= 76) cands.push(w); }
    }
    if (!prev) return cands.sort((a, b) => Math.abs(a[0] - 60) - Math.abs(b[0] - 60))[0];
    const cost = (c) => c.reduce((s, m, i) => s + Math.abs(m - (prev[i] !== undefined ? prev[i] : prev[prev.length - 1])), 0);
    return cands.sort((a, b) => cost(a) - cost(b))[0];
  }
  function progressionEvents(tonicPcVal, nums, dur = 1.0) {
    let prev = null;
    return nums.map((n, i) => {
      const [off, type] = DIA[n];
      const rp = (tonicPcVal + off) % 12;
      const v = voiceChord(rp, type, prev);
      prev = v;
      let bass = 36 + rp; if (bass < 40) bass += 12;
      return { m: [bass].concat(v), at: i * (dur + 0.1), d: dur };
    });
  }
  const PROGS = ['I-V-vi-IV', 'I-vi-IV-V', 'I-IV-V-I', 'I-IV-vi-V', 'I-V-IV-I', 'I-ii-V-I', 'I-iii-IV-V', 'I-vi-ii-V'];
  const progressionSkill = {
    id: 'progression', strand: 'ear', title: 'Hear the chords', icon: '⋯',
    blurb: 'Recognise I, IV, V and vi in real progressions.',
    method: 'Functional harmony by ear: every chord is heard against the home chord (I) so you learn its pull, not its pitch. This is the skill you use to work out the chords of a song.',
    round: 10,
    stages: [
      { t: 'IV or V?', lvl: 2, target: 6, items: ['IV', 'V'], names: true },
      { t: 'I, IV or V?', lvl: 3, target: 6, items: ['I', 'IV', 'V'], names: true },
      { t: 'I, IV, V or vi?', lvl: 3, target: 6, items: ['I', 'IV', 'V', 'vi'], names: true },
      { t: 'Add ii and iii', lvl: 4, target: 6, items: ['I', 'ii', 'iii', 'IV', 'V', 'vi'] },
      { t: 'Whole progressions', lvl: 5, target: 14, items: PROGS, prog: true },
    ],
    pool: (st) => st.items,
    label(item) { return item.includes('-') ? item.split('-').join(' – ') : item; },
    ask(item, st, api) {
      const keyName = st.prog ? pick(['C', 'G', 'F']) : 'C';
      const k = M.key(keyName, 'major');
      const choices = st.prog ? ['I', 'ii', 'iii', 'IV', 'V', 'vi'] : st.items;
      const chordLabel = (n) => { const [off, type] = DIA[n]; return chordName(M.midiName(60 + ((k.tonicPc + off) % 12), k.fifths), type); };
      if (!st.prog) {
        const evs = progressionEvents(k.tonicPc, ['I', item], 1.0);
        const play = () => api.Sound.seq(evs, 0.1);
        play();
        api.after(1200, () => { if (!api.clockStarted()) api.startClock(); });
        api.prompt('You hear <b>I</b> (home), then a second chord. Which is it?');
        api.sub(st.names ? 'Tip: you can also answer by playing the chord on the piano.' : 'Key of C major.');
        api.actions([{ label: 'Hear it again', fn: play }]);
        let answered = false;
        const answer = (v) => {
          if (answered) return;
          answered = true;
          api.markButton(item, 'good');
          if (v !== item) api.markButton(v, 'bad');
          api.finish({ correct: v === item, note: `It was ${item} — ${chordLabel(item)} in ${k.name}.` });
        };
        api.buttons(choices.map((n) => ({ label: n, sub: st.names ? chordLabel(n) : '', value: n })), answer);
        return {
          onNote() {
            const held = new Set(api.Input.heldMidis().map(pc));
            if (held.size < 3) return;
            for (const n of choices) {
              const [off, type] = DIA[n];
              const want = M.chordPcs((k.tonicPc + off) % 12, type);
              if (want.length === held.size && want.every((p) => held.has(p))) { answer(n); return; }
            }
          },
        };
      }
      const nums = item.split('-');
      const evs = progressionEvents(k.tonicPc, nums, 1.0);
      const play = () => api.Sound.seq(evs, 0.1);
      play();
      api.startClock();
      api.prompt(`Name the chords — key of <b>${k.name}</b>`);
      api.sub('The first chord is I. Pick chords 2, 3 and 4 in order.');
      let pos = 1, wrong = 0;
      const boxes = () => nums.map((n, i) => `<span class="pbox${i === 0 ? ' fixed' : ''}" data-i="${i}">${i === 0 ? 'I' : '?'}</span>`).join('<span class="dash">–</span>');
      api.stageHTML(`<div class="prog">${boxes()}</div>`);
      api.actions([{ label: 'Hear it again', fn: play }]);
      api.buttons(choices.map((n) => ({ label: n, value: n })), (v) => {
        if (pos >= nums.length) return;
        const box = api.root.querySelector(`.pbox[data-i="${pos}"]`);
        const ok = v === nums[pos];
        if (!ok) wrong++;
        box.textContent = nums[pos];
        box.classList.add(ok ? 'good' : 'bad');
        pos++;
        if (pos === nums.length) api.finish({ correct: wrong === 0, note: `${nums.join(' – ')} in ${k.name}: ${nums.map(chordLabel).join(', ')}.` });
      }, { keepEnabled: true });
      return {};
    },
  };

  // ---------- 11. Echo melodies ----------
  const MAJ = [0, 2, 4, 5, 7, 9, 11, 12];
  const melodySkill = {
    id: 'melody', strand: 'ear', title: 'Echo melodies', icon: '♪',
    blurb: 'Hear a short tune, play it straight back.',
    method: 'Call and response, as in Kodály and Suzuki teaching: you hear, remember and reproduce short phrases. Phrases get longer and leap further only after you echo the shorter ones reliably.',
    round: 8, generated: true,
    stages: [
      { t: '3 notes: do, re, mi', lvl: 1, target: 10, len: 3, pool: [0, 2, 4], step: 1, starts: [0] },
      { t: '4 notes: do to sol', lvl: 2, target: 12, len: 4, pool: [0, 2, 4, 5, 7], step: 0.85, starts: [0] },
      { t: '5 notes with skips', lvl: 3, target: 14, len: 5, pool: [0, 2, 4, 5, 7], step: 0.6, starts: [0, 4, 7] },
      { t: '5 notes, whole scale', lvl: 4, target: 14, len: 5, pool: MAJ, step: 0.6, starts: [0, 4, 7, 12] },
      { t: '6 notes, any key', lvl: 5, target: 16, len: 6, pool: MAJ, step: 0.5, starts: [0, 4, 7], keys: ['C', 'G', 'F', 'D'] },
    ],
    pool: () => ['a', 'b', 'c', 'd', 'e', 'f'],
    label() { return 'Melody'; },
    ask(item, st, api) {
      const k = M.key(st.keys ? pick(st.keys) : 'C', 'major');
      const t = tonicMidi(k);
      let i = st.pool.indexOf(pick(st.starts));
      if (i < 0) i = 0;
      const idxs = [i];
      while (idxs.length < st.len) {
        const big = Math.random() > st.step;
        let d = big ? pick([-3, -2, 2, 3]) : pick([-1, 1]);
        let j = Math.max(0, Math.min(st.pool.length - 1, idxs[idxs.length - 1] + d));
        if (j === idxs[idxs.length - 1]) j = Math.max(0, Math.min(st.pool.length - 1, j - d));
        idxs.push(j);
      }
      const mel = idxs.map((x) => t + st.pool[x]);
      const play = () => {
        api.Sound.seq([{ m: [t - 12, t, t + 4, t + 7], at: 0, d: 0.7 }].concat(mel.map((m, n) => ({ m, at: 1.0 + n * 0.5, d: 0.45 }))), 0.1);
      };
      play();
      api.after(1100, () => { if (!api.clockStarted()) api.startClock(); });
      const first = M.midiName(mel[0], k.fifths);
      api.prompt(`Play back the melody — key of <b>${k.name}</b>`);
      api.sub(`${mel.length} notes. It starts on <b>${M.SOLFEGE[pc(mel[0] - t)]}</b>${st.lvl <= 3 ? ` (${first})` : ''}.`);
      api.stageHTML(`<div class="seq" id="seq">${mel.map(() => '<span class="dot"></span>').join('')}</div>`);
      api.actions([{ label: 'Hear it again', fn: play }]);
      let pos = 0, mistakes = 0;
      const ds = () => api.root.querySelectorAll('#seq .dot');
      return {
        onNote(ev) {
          if (ev.type !== 'on') return;
          const d = ds();
          if (pc(ev.midi) === pc(mel[pos])) {
            d[pos].className = 'dot on';
            d[pos].textContent = M.SOLFEGE[pc(mel[pos] - t)];
            pos++;
            if (pos === mel.length) api.finish({ correct: mistakes === 0, note: mel.map((m) => `${M.SOLFEGE[pc(m - t)]} (${M.midiName(m, k.fifths)})`).join(' · ') });
          } else {
            mistakes++;
            pos = 0;
            d.forEach((x) => { x.className = 'dot'; x.textContent = ''; });
            if (mistakes >= 2) d.forEach((x, n) => { x.textContent = M.SOLFEGE[pc(mel[n] - t)]; x.classList.add('peek'); });
            api.say(mistakes >= 2 ? 'Here are the syllables. Listen again and start from the beginning.' : 'Not quite — listen again and start from the beginning.', 'bad');
            api.after(500, play);
          }
        },
      };
    },
  };

  // ---------- 12. Rhythm ----------
  const BAR = {
    a: ['q q q q', 'h q q', 'q q h', 'h h', 'w', 'q h q'],
    b: ['q qr q q', 'q q qr q', 'h qr q', 'qr q h', 'q q q qr', 'h hr'],
    c: ['e e q q q', 'q e e q q', 'q q e e q', 'e e e e h', 'q e e h', 'e e q h', 'q q e e e e'],
    d: ['dh q', 'dq e q q', 'q dq e q', 'dq e h', 'h dq e', 'q dh'],
    t3: ['q q q', 'h q', 'dh', 'e e q q', 'q e e q', 'dq e q', 'q qr q', 'h e e'],
  };
  const TOK = { q: ['q', 0], h: ['h', 0], w: ['w', 0], e: ['8', 0], s: ['16', 0], t: ['8', 0, 0, 1], qr: ['q', 0, 1], hr: ['h', 0, 1], er: ['8', 0, 1], dh: ['h', 1], dq: ['q', 1], de: ['8', 1] };
  function parseBar(str, startBeat, beamBase, compound) {
    const out = [];
    let b = startBeat;
    for (const tk of str.split(' ')) {
      const d = TOK[tk];
      if (!d) throw new Error('Unknown rhythm token ' + tk);
      const [dur, dots, rest, tup] = d;
      const beats = PP.Staff.DUR_BEATS[dur] * (dots ? 1.5 : 1) * (tup ? 2 / 3 : 1);
      out.push({ dur, dots, rest: !!rest, tup: !!tup, beat: b, beats });
      b += beats;
    }
    // beam runs of eighths/sixteenths inside one beat (a dotted-quarter group in compound time)
    const unit = compound ? 1.5 : 1;
    const grp = (e) => Math.floor((e.beat - startBeat) / unit + 1e-6);
    const beamable = (e) => !e.rest && (e.dur === '8' || e.dur === '16');
    let id = 0;
    for (let i = 0; i < out.length;) {
      if (!beamable(out[i])) { i++; continue; }
      let j = i;
      while (j + 1 < out.length && beamable(out[j + 1]) && grp(out[j + 1]) === grp(out[i])) j++;
      if (j > i) { const bid = beamBase + '-' + id++; for (let k = i; k <= j; k++) out[k].beam = bid; }
      i = j + 1;
    }
    return { evs: out, end: b };
  }
  function buildPiece(barStrs, beatsPerBar, compound) {
    const evs = [];
    let beat = 0;
    barStrs.forEach((s, bi) => {
      const { evs: e } = parseBar(s, beat, 'b' + bi, compound);
      e.forEach((x) => evs.push(x));
      beat += beatsPerBar;
    });
    return { evs, total: beat };
  }
  function perfUI(api, opts) {
    // opts: { render(stateCls[]), events, bpm, beatsPerBar, pitched, onDone }
    let run = null;
    const statusEl = api.root.querySelector('#perf-status');
    const start = () => {
      if (run) return;
      api.Keys.clearMarks();
      opts.reset && opts.reset();
      api.setActionsDisabled(true);
      run = PP.Perf.run({
        events: opts.events, bpm: opts.bpm, beatsPerBar: opts.beatsPerBar, countIn: opts.beatsPerBar, pitched: opts.pitched, clickEvery: opts.clickEvery || 1,
        onCursor: (b) => {
          if (b < 0) { statusEl.textContent = 'Count-in: ' + Math.ceil(-b); opts.cursor(null); }
          else { statusEl.textContent = 'Play!'; opts.cursor(b); }
        },
        onMark: (i, st) => opts.mark(i, st),
        onDone: (r) => { run = null; opts.cursor(null); api.setActionsDisabled(false); statusEl.textContent = ''; opts.onDone(r); },
      });
    };
    return { start, stop: () => { if (run) run.stop(); run = null; } };
  }
  const rhythmSkill = {
    id: 'rhythm', strand: 'read', title: 'Rhythm', icon: '♩',
    blurb: 'Read rhythms and play them in time.',
    method: 'Count, then play with a steady click — the same pulse-first approach used in sight-reading training. Each note is scored for timing, so you see exactly which beats rush or drag.',
    round: 4, timed: true, generated: true,
    stages: [
      { t: 'Whole, half and quarter notes', lvl: 1, bars: ['a'], n: 2, bpb: 4 },
      { t: 'Add rests', lvl: 2, bars: ['a', 'b'], n: 2, bpb: 4 },
      { t: 'Add eighth notes', lvl: 2, bars: ['a', 'b', 'c', 'c'], n: 2, bpb: 4 },
      { t: 'Dotted notes', lvl: 3, bars: ['a', 'c', 'd', 'd'], n: 2, bpb: 4 },
      { t: '3/4 time', lvl: 4, bars: ['t3'], n: 4, bpb: 3 },
    ],
    pool: () => ['a', 'b', 'c', 'd'],
    label() { return 'Rhythm'; },
    ask(item, st, api) {
      const bpm = Math.round(72 * api.tempoFactor());
      const barStrs = [];
      for (let i = 0; i < st.n; i++) barStrs.push(pick(BAR[pick(st.bars)]));
      const { evs } = buildPiece(barStrs, st.bpb, st.compound);
      const playable = evs.map((e, i) => ({ ...e, i }));
      const staffItems = [];
      let bi = 0, acc = 0;
      evs.forEach((e) => {
        staffItems.push(e.rest ? { kind: 'rest', dur: e.dur, dots: e.dots } : { kind: 'note', notes: [{ midi: 71 }], dur: e.dur, dots: e.dots, beam: e.beam, tup: e.tup, stem: 'up' });
        acc += e.beats;
        if (Math.abs(acc - st.bpb) < 1e-6) { acc = 0; bi++; staffItems.push({ kind: bi === st.n ? 'end' : 'bar' }); }
      });
      api.prompt(`Tap the rhythm on any key — <b>${bpm} beats per minute</b>`);
      api.sub(`You’ll hear ${st.bpb} count-in clicks first. Keep going even if you slip.`);
      api.stageHTML('<div class="staff-slot wide" id="rh-staff"></div><div class="perf-status" id="perf-status"></div>');
      const r = PP.Staff.render(api.root.querySelector('#rh-staff'), { clef: 'perc', time: st.compound ? [6, 8] : [st.bpb, 4], items: staffItems, beatW: 3.2 * 10, label: 'Rhythm' });
      const noteEls = r.noteEls;
      const ui = perfUI(api, {
        events: playable.map((e) => ({ beat: e.beat, dur: e.beats, rest: e.rest, midi: null })),
        bpm, beatsPerBar: st.bpb, pitched: false, clickEvery: st.compound ? 1.5 : 1,
        reset: () => noteEls.forEach((g) => g.classList.remove('ok', 'bad', 'early', 'late', 'miss')),
        cursor: (b) => r.setCursor(b),
        mark: (i, s) => { if (i !== null && noteEls[i]) noteEls[i].classList.add(s); },
        onDone: (res) => {
          const pct = Math.round(res.score * 100);
          api.finish({ correct: res.score >= 0.85, score: res.score, manual: true, note: `Timing score ${pct}%. ${res.summary}` });
          api.actions([{ label: 'Hear it', fn: hearIt }]);
        },
      });
      function hearIt() {
        const c = api.Sound.ensure(); const t0 = c.currentTime + 0.15; const sec = 60 / bpm;
        for (let b = 0; b < st.n * st.bpb; b++) api.Sound.click(t0 + b * sec, b % st.bpb === 0);
        evs.forEach((e) => { if (!e.rest) api.Sound.note(71, t0 + e.beat * sec, Math.min(0.5, e.beats * sec * 0.9), 0.7); });
      }
      api.actions([
        { label: 'Start', primary: true, fn: () => ui.start() },
        { label: 'Hear it first', fn: () => hearIt() },
      ]);
      return { cleanup: () => ui.stop() };
    },
  };

  // ---------- 13. Sight-reading ----------
  const SIGHT = [
    { t: 'Right hand, C position', lvl: 1, clef: 'treble', fifths: 0, pool: [60, 62, 64, 65, 67], bars: ['a'], n: 2, step: 0.85, bpm: 60 },
    { t: 'Left hand, C position', lvl: 2, clef: 'bass', fifths: 0, pool: [48, 50, 52, 53, 55], bars: ['a'], n: 2, step: 0.8, bpm: 60 },
    { t: 'Right hand, skips and rests', lvl: 3, clef: 'treble', fifths: 0, pool: [60, 62, 64, 65, 67, 69], bars: ['a', 'b'], n: 4, step: 0.6, bpm: 66 },
    { t: 'G major position', lvl: 4, clef: 'treble', fifths: 1, pool: [66, 67, 69, 71, 72, 74], bars: ['a', 'b', 'c'], n: 4, step: 0.65, bpm: 66, tonic: 67 },
    { t: 'F major, eighths and dots', lvl: 5, clef: 'treble', fifths: -1, pool: [60, 62, 64, 65, 67, 69, 70, 72], bars: ['a', 'c', 'd'], n: 4, step: 0.6, bpm: 72, tonic: 65 },
  ];
  const sightSkill = {
    id: 'sight', strand: 'sight', title: 'Sight-reading', icon: '👁',
    blurb: 'Play music you’ve never seen, in time, without stopping.',
    method: 'Sight-reading as it is taught for graded exams (Paul Harris’s “Improve Your Sight-Reading” approach): look first — key, time, starting note, patterns — then play with a steady pulse and keep going. Every piece is new, so you practise reading, not memorising.',
    round: 4, timed: true, generated: true,
    stages: SIGHT,
    pool: () => ['a', 'b', 'c', 'd'],
    label() { return 'Sight-reading piece'; },
    ask(item, st, api) {
      const bpm = Math.round(st.bpm * api.tempoFactor());
      const bpb = 4;
      const barStrs = [];
      for (let i = 0; i < st.n - 1; i++) barStrs.push(pick(BAR[pick(st.bars)]));
      barStrs.push(pick(['w', 'h h', 'q q h']));
      const { evs } = buildPiece(barStrs, bpb);
      // melody
      const pool = st.pool;
      const tonic = st.tonic || 60 + 12 * (st.clef === 'bass' ? -1 : 0);
      let i = Math.max(0, pool.indexOf(tonic));
      if (Math.random() < 0.4) i = Math.min(pool.length - 1, i + 2);
      const notesIdx = [];
      const playIdx = evs.map((e, n) => (e.rest ? -1 : n)).filter((n) => n >= 0);
      playIdx.forEach((n, k) => {
        if (k > 0) {
          const big = Math.random() > st.step;
          let d = big ? pick([-2, 2, -3, 3]) : pick([-1, 1, 1, -1, 0]);
          if (st.lvl <= 2 && Math.abs(d) > 2) d = d > 0 ? 2 : -2;
          let j = i + d;
          if (j < 0 || j >= pool.length) j = i - d;
          i = Math.max(0, Math.min(pool.length - 1, j));
        }
        notesIdx.push(i);
      });
      const tIdx = pool.indexOf(tonic) >= 0 ? pool.indexOf(tonic) : 0;
      if (notesIdx.length) notesIdx[notesIdx.length - 1] = tIdx;
      let q = 0;
      const events = evs.map((e) => ({ beat: e.beat, dur: e.beats, rest: e.rest, midi: e.rest ? null : pool[notesIdx[q++]] }));
      const staffItems = [];
      let acc = 0, bi = 0;
      evs.forEach((e, n) => {
        staffItems.push(e.rest ? { kind: 'rest', dur: e.dur, dots: e.dots } : { kind: 'note', notes: [M.spell(events[n].midi, st.fifths)], dur: e.dur, dots: e.dots, beam: e.beam });
        acc += e.beats;
        if (Math.abs(acc - bpb) < 1e-6) { acc = 0; bi++; staffItems.push({ kind: bi === barStrs.length ? 'end' : 'bar' }); }
      });
      const kName = Object.keys(M.MAJOR_FIFTHS).find((x) => M.MAJOR_FIFTHS[x] === st.fifths) + ' major';
      const firstMidi = events.find((e) => !e.rest).midi;
      api.prompt(`Sight-read this — <b>${bpm} beats per minute</b>`);
      api.sub(`Look first: key <b>${kName}</b> · time <b>4/4</b> · first note <b>${M.midiName(firstMidi, st.fifths, undefined, true)}</b> · spot any repeated patterns. Then press Start and keep going.`);
      api.stageHTML('<div class="staff-slot wide" id="sr-staff"></div><div class="perf-status" id="perf-status"></div>');
      const r = PP.Staff.render(api.root.querySelector('#sr-staff'), { clef: st.clef, fifths: st.fifths, time: [4, 4], items: staffItems, beatW: 3 * 10, label: 'Sight-reading piece' });
      const noteEls = r.noteEls;
      api.Keys.focus(firstMidi);
      let stepOff = null;
      const ui = perfUI(api, {
        events, bpm, beatsPerBar: bpb, pitched: true,
        reset: () => noteEls.forEach((g) => g.classList.remove('ok', 'bad', 'early', 'late', 'miss', 'cur')),
        cursor: (b) => r.setCursor(b),
        mark: (n, s) => { if (n !== null && noteEls[n]) noteEls[n].classList.add(s); },
        onDone: (res) => {
          const pct = Math.round(res.score * 100);
          api.finish({ correct: res.score >= 0.85, score: res.score, manual: true, note: `Score ${pct}%. ${res.summary} Green = right note on time, amber = right note but early/late, red = wrong note, grey = missed.` });
          api.actions([{ label: 'Practise it slowly (no clock)', fn: slow }]);
        },
      });
      function slow() {
        if (stepOff) stepOff();
        noteEls.forEach((g) => g.classList.remove('ok', 'bad', 'early', 'late', 'miss', 'cur'));
        const order = events.map((e, n) => (e.rest ? -1 : n)).filter((n) => n >= 0);
        let p = 0;
        noteEls[order[0]].classList.add('cur');
        api.say('Slow practice: play each note when you’re ready. This one doesn’t count towards your score.', 'info');
        stepOff = api.Input.on((ev) => {
          if (ev.type !== 'on' || p >= order.length) return;
          const n = order[p];
          if (ev.midi === events[n].midi) {
            noteEls[n].classList.remove('cur', 'bad'); noteEls[n].classList.add('ok');
            p++;
            if (p < order.length) noteEls[order[p]].classList.add('cur');
            else { api.say('Nice. Press Next for a new piece.', 'good'); stepOff(); stepOff = null; }
          } else noteEls[n].classList.add('bad');
        });
      }
      api.actions([
        { label: 'Start', primary: true, fn: () => ui.start() },
      ]);
      return { cleanup: () => { ui.stop(); if (stepOff) stepOff(); } };
    },
  };

  // ---------- 14. Play tunes by ear ----------
  const T = (s) => s.trim().split(/\s+/).map((tok) => { const [n, d] = tok.split('/'); return { n, d: d || 'q' }; });
  const TUNES = {
    hcb: { title: 'Hot Cross Buns', time: [4, 4], notes: T('E4 D4 C4/h E4 D4 C4/h C4/e C4/e C4/e C4/e D4/e D4/e D4/e D4/e E4 D4 C4/h') },
    mary: { title: 'Mary Had a Little Lamb', time: [4, 4], notes: T('E4 D4 C4 D4 E4 E4 E4/h D4 D4 D4/h E4 G4 G4/h E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4/w') },
    lune: { title: 'Au Clair de la Lune', time: [4, 4], notes: T('C4 C4 C4 D4 E4/h D4/h C4 E4 D4 D4 C4/w') },
    twinkle: { title: 'Twinkle Twinkle Little Star', time: [4, 4], notes: T('C4 C4 G4 G4 A4 A4 G4/h F4 F4 E4 E4 D4 D4 C4/h') },
    row: { title: 'Row, Row, Row Your Boat', time: [6, 8], notes: T('C4/dq C4/dq C4 D4/e E4/dq E4 D4/e E4 F4/e G4/dh') },
    frere: { title: 'Frère Jacques', time: [4, 4], notes: T('C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4/h E4 F4 G4/h') },
    london: { title: 'London Bridge', time: [4, 4], notes: T('G4/dq A4/e G4 F4 E4 F4 G4/h D4 E4 F4/h E4 F4 G4/h G4/dq A4/e G4 F4 E4 F4 G4/h D4/h G4 E4 C4/w') },
    ode: { title: 'Ode to Joy (Beethoven)', time: [4, 4], notes: T('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/dq D4/e D4/h') },
    macdonald: { title: 'Old MacDonald', time: [4, 4], notes: T('C4 C4 C4 G3 A3 A3 G3/h E4 E4 D4 D4 C4/w') },
    jingle: { title: 'Jingle Bells (chorus)', time: [4, 4], notes: T('E4 E4 E4/h E4 E4 E4/h E4 G4 C4/dq D4/e E4/w F4 F4 F4/dq F4/e F4 E4 E4 E4/e E4/e E4 D4 D4 E4 D4/h G4/h') },
    saints: { title: 'When the Saints Go Marching In', time: [4, 4], notes: T('C4 E4 F4 G4/w C4 E4 F4 G4/w C4 E4 F4 G4/h E4/h C4/h E4/h D4/w') },
    birthday: { title: 'Happy Birthday', time: [3, 4], notes: T('G3/de G3/s A3 G3 C4 B3/h G3/de G3/s A3 G3 D4 C4/h G3/de G3/s G4 E4 C4 B3 A3 F4/de F4/s E4 C4 D4 C4/dh') },
    grace: { title: 'Amazing Grace', time: [3, 4], notes: T('G3 C4/h E4/e C4/e E4/h D4 C4/h A3 G3/h G3 C4/h E4/e C4/e E4/h D4 G4/dh') },
  };
  // Old MacDonald in C begins C C C G(down) — keep the pitches true to the tune.
  const tunesSkill = {
    id: 'tunes', strand: 'sight', title: 'Play tunes by ear', icon: '♬',
    blurb: 'Work out tunes you know, note by note, by listening.',
    method: 'Guided discovery: you’re given only the first note, then you search for each next note by ear. Hints say “higher” or “lower”, the way a teacher would, so you build the habit of hearing direction and distance before touching a key. Later stages move the same tunes to new keys (transposing).',
    round: 3, mastery: 0.66, noRequeue: true,
    stages: [
      { t: 'First tunes', lvl: 1, items: ['hcb', 'mary', 'lune'] },
      { t: 'Nursery classics', lvl: 2, items: ['twinkle', 'row', 'frere', 'london'] },
      { t: 'Bigger leaps', lvl: 3, items: ['ode', 'macdonald', 'jingle', 'saints'] },
      { t: 'Three-time tunes and review', lvl: 4, items: ['birthday', 'grace', 'london', 'ode'] },
      { t: 'In other keys (G and F)', lvl: 5, items: ['twinkle@G', 'ode@F', 'frere@G', 'birthday@F', 'saints@G', 'jingle@F'] },
    ],
    pool: (st) => st.items,
    label(item) { const [id, kk] = item.split('@'); return TUNES[id].title + (kk ? ` in ${kk}` : ''); },
    ask(item, st, api) {
      const [id, kk] = item.split('@');
      const tune = TUNES[id];
      const shift = kk === 'G' ? 7 : kk === 'F' ? 5 : 0;
      const kObj = M.key(kk || 'C', 'major');
      const ns = tune.notes.map((x) => ({ midi: M.parse(x.n).midi + (shift === 7 ? -5 : shift), d: x.d }));
      // keep transposed tunes in a comfortable range (G down a 4th, F up a 4th)
      const durOf = (d) => (d === 'e' ? ['8', 0] : d === 'de' ? ['8', 1] : d === 's' ? ['16', 0] : d === 'dq' ? ['q', 1] : d === 'dh' ? ['h', 1] : [d, 0]);
      const bpm = 100;
      const playAll = () => {
        let at = 0;
        const evs = ns.map((x) => { const [du, dots] = durOf(x.d); const b = PP.Staff.DUR_BEATS[du] * (dots ? 1.5 : 1); const e = { m: x.midi, at, d: b * 0.6 * 0.95 }; at += b * 0.6; return e; });
        api.Sound.seq(evs, 0.1);
      };
      let pos = 0, wrongHere = 0, wrong = 0, reveals = 0;
      api.prompt(`Play <b>${tune.title}</b> by ear`);
      api.sub(`Key of ${kObj.name}. It starts on <b>${M.midiName(ns[0].midi, kObj.fifths)}</b> (do = ${kObj.tonicName}). Find each next note — wrong guesses are part of it.`);
      api.stageHTML('<div class="staff-slot wide" id="tu-staff"></div><div class="tune-count" id="tu-count"></div>');
      const draw = () => {
        const items = ns.slice(0, Math.max(1, pos)).map((x) => { const [du, dots] = durOf(x.d); return { kind: 'note', notes: [M.spell(x.midi, kObj.fifths)], dur: du, dots, cls: pos === 0 ? 'ghost' : '' }; });
        PP.Staff.render(api.root.querySelector('#tu-staff'), { clef: 'treble', fifths: kObj.fifths, items, beatW: 2.2 * 10, label: tune.title });
        api.root.querySelector('#tu-count').textContent = `${pos} of ${ns.length} notes found`;
      };
      draw();
      api.Sound.note(ns[0].midi, 0, 1, 0.8);
      api.Keys.focus(ns[0].midi);
      api.startClock();
      api.actions([
        { label: 'Hear the whole tune', fn: playAll },
        { label: 'Hear the next note', fn: () => { if (pos >= ns.length) return; if (pos > 0) reveals++; api.Sound.note(ns[pos].midi, 0, 1, 0.8); } },
      ]);
      return {
        onNote(ev) {
          if (ev.type !== 'on' || pos >= ns.length) return;
          const want = ns[pos].midi;
          if (pc(ev.midi) === pc(want)) {
            pos++; wrongHere = 0;
            draw();
            api.Keys.mark([], 'hint');
            if (pos === ns.length) {
              const ok = reveals === 0 && wrong <= Math.ceil(ns.length / 3);
              api.finish({ correct: ok, note: `You found all ${ns.length} notes with ${wrong} wrong guess${wrong === 1 ? '' : 'es'}${reveals ? ` and ${reveals} hint${reveals > 1 ? 's' : ''}` : ''}. Now play it through from the start.`, manual: true });
            }
            return;
          }
          if (pos === 0) { api.say(`Start on ${M.midiName(want, kObj.fifths)}.`, 'info'); return; }
          wrong++; wrongHere++;
          const prev = ns[pos - 1].midi;
          const diff = want - prev;
          const dir = diff === 0 ? 'the <b>same note</b> again' : `<b>${diff > 0 ? 'higher' : 'lower'}</b> than the last note, by a ${Math.abs(diff) <= 2 ? 'step' : 'skip'}`;
          if (wrongHere >= 3) {
            reveals++;
            api.Keys.markPcs([pc(want)], 'hint');
            api.say(`It’s ${M.midiName(want, kObj.fifths)} — ${dir}.`, 'bad');
          } else api.say(`Not that one. The next note is ${dir}.`, 'bad');
        },
      };
    },
  };

  // Mastery goals for shorter rounds (one slip allowed)
  chordsSkill.mastery = 0.85; keychordsSkill.mastery = 0.85; melodySkill.mastery = 0.85; scalesSkill.mastery = 0.8;

  PP.Skills = [pitchSkill, intervalsSkill, qualitySkill, progressionSkill, melodySkill,
    keysSkill, scalesSkill, chordsSkill, keychordsSkill, keysigSkill,
    trebleSkill, bassSkill, grandSkill, rhythmSkill,
    sightSkill, tunesSkill];
  PP.SkillById = Object.fromEntries(PP.Skills.map((s) => [s.id, s]));
  PP.L = { pick, shuffle, rnd, whites, parseBar, buildPiece, perfUI, chordWatcher, heldNames, placeChord, chordName, tonicMidi, voiceChord, progressionEvents, DIA, BAR, FINGERS, PROGS, MAJ_ROOTS, MIN_ROOTS };
  PP.STRANDS = [
    { id: 'ear', title: 'Ear', sub: 'Sound comes first', skills: ['pitch', 'intervals', 'quality', 'progression', 'melody'] },
    { id: 'keys', title: 'Keys, scales & chords', sub: 'Theory you can play', skills: ['keys', 'scales', 'chords', 'keychords', 'keysig'] },
    { id: 'read', title: 'Reading', sub: 'Notes and rhythm', skills: ['treble', 'bass', 'grand', 'rhythm'] },
    { id: 'sight', title: 'Sight-reading & playing by ear', sub: 'Putting it together', skills: ['sight', 'tunes'] },
  ];
})();
