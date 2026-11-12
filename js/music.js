/* Piano Path — music theory, notation (SVG staff) and sound. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});

  // ---------- Theory ----------
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const ACC_SYM = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
  const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F
  const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  const pc = (m) => ((m % 12) + 12) % 12;

  function note(letter, acc, oct) {
    return { letter, acc, oct, midi: (oct + 1) * 12 + LETTER_PC[letter] + acc };
  }
  function noteFromLetterMidi(letter, midi) {
    // spell `midi` using the given letter, picking the octave that keeps the accidental small
    for (const a of [0, 1, -1, 2, -2]) {
      const base = midi - LETTER_PC[letter] - a;
      if (base % 12 === 0) return note(letter, a, base / 12 - 1);
    }
    return null;
  }
  const stepOf = (n) => n.oct * 7 + n.letter;
  const nameOf = (n, withOct) => LETTERS[n.letter] + ACC_SYM[n.acc] + (withOct ? n.oct : '');

  function parse(str) {
    const m = /^([A-G])(𝄫|bb|♭|b|𝄪|x|♯|#)?(-?\d)?$/.exec(String(str).trim());
    if (!m) throw new Error('Bad note: ' + str);
    const letter = LETTERS.indexOf(m[1]);
    const accMap = { '𝄫': -2, bb: -2, '♭': -1, b: -1, '𝄪': 2, x: 2, '♯': 1, '#': 1 };
    const acc = m[2] ? accMap[m[2]] : 0;
    const oct = m[3] !== undefined ? parseInt(m[3], 10) : 4;
    return note(letter, acc, oct);
  }

  function keyAcc(fifths, letter) {
    if (fifths > 0 && SHARP_ORDER.indexOf(letter) < fifths) return 1;
    if (fifths < 0 && FLAT_ORDER.indexOf(letter) < -fifths) return -1;
    return 0;
  }

  /** Spell a MIDI number for a key signature. prefer: 'sharp' | 'flat' for notes outside the key. */
  function spell(midi, fifths = 0, prefer) {
    for (let L = 0; L < 7; L++) {
      const a = keyAcc(fifths, L);
      if (pc(LETTER_PC[L] + a) === pc(midi)) return note(L, a, (midi - LETTER_PC[L] - a) / 12 - 1);
    }
    for (let L = 0; L < 7; L++) if (pc(LETTER_PC[L]) === pc(midi)) return note(L, 0, (midi - LETTER_PC[L]) / 12 - 1);
    const useFlat = prefer ? prefer === 'flat' : fifths < 0;
    const a = useFlat ? -1 : 1;
    for (let L = 0; L < 7; L++) if (pc(LETTER_PC[L] + a) === pc(midi)) return note(L, a, (midi - LETTER_PC[L] - a) / 12 - 1);
    return note(0, 0, 4);
  }
  const midiName = (midi, fifths = 0, prefer, withOct) => nameOf(spell(midi, fifths, prefer), withOct);

  const MAJOR_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F♯': 6, 'C♯': 7, F: -1, 'B♭': -2, 'E♭': -3, 'A♭': -4, 'D♭': -5, 'G♭': -6, 'C♭': -7 };
  const MINOR_FIFTHS = { A: 0, E: 1, B: 2, 'F♯': 3, 'C♯': 4, 'G♯': 5, 'D♯': 6, 'A♯': 7, D: -1, G: -2, C: -3, F: -4, 'B♭': -5, 'E♭': -6, 'A♭': -7 };

  const SCALE_STEPS = {
    major: [2, 2, 1, 2, 2, 2, 1],
    minor: [2, 1, 2, 2, 1, 2, 2],
    harmonic: [2, 1, 2, 2, 1, 3, 1],
  };

  function key(tonicName, mode = 'major') {
    const fifths = (mode === 'major' ? MAJOR_FIFTHS : MINOR_FIFTHS)[tonicName];
    if (fifths === undefined) throw new Error('Unknown key ' + tonicName + ' ' + mode);
    return { tonicName, mode, fifths, name: tonicName + (mode === 'major' ? ' major' : ' minor'), tonicPc: pc(parse(tonicName + '4').midi) };
  }

  /** Correctly spelled scale from a tonic note object. */
  function buildScale(tonic, steps) {
    const out = [tonic];
    let midi = tonic.midi, letter = tonic.letter, oct = tonic.oct;
    for (const s of steps) {
      midi += s; letter++;
      if (letter > 6) { letter = 0; oct++; }
      out.push(note(letter, midi - ((oct + 1) * 12 + LETTER_PC[letter]), oct));
    }
    return out;
  }
  function scaleOf(k, oct = 4, type) {
    const steps = SCALE_STEPS[type || (k.mode === 'major' ? 'major' : 'minor')];
    return buildScale(parse(k.tonicName + oct), steps);
  }
  /** Seven pitch classes of a key (natural minor for minor keys). */
  const keyPcs = (k) => scaleOf(k, 4).slice(0, 7).map((n) => pc(n.midi));

  const CHORDS = {
    maj: { iv: [0, 4, 7], label: 'major', short: '' },
    min: { iv: [0, 3, 7], label: 'minor', short: 'm' },
    dim: { iv: [0, 3, 6], label: 'diminished', short: 'dim' },
    aug: { iv: [0, 4, 8], label: 'augmented', short: 'aug' },
    dom7: { iv: [0, 4, 7, 10], label: 'dominant 7th', short: '7' },
    maj7: { iv: [0, 4, 7, 11], label: 'major 7th', short: 'maj7' },
    min7: { iv: [0, 3, 7, 10], label: 'minor 7th', short: 'm7' },
  };
  /** Spelled chord tones (root position) from a root note object. */
  function chordNotes(root, type) {
    return CHORDS[type].iv.map((iv, i) => {
      const letterOff = i * 2; // stacked thirds
      let L = root.letter + letterOff, oct = root.oct;
      while (L > 6) { L -= 7; oct++; }
      const midi = root.midi + iv;
      return note(L, midi - ((oct + 1) * 12 + LETTER_PC[L]), oct);
    });
  }
  function chordPcs(rootPc, type) { return CHORDS[type].iv.map((i) => pc(rootPc + i)); }

  /** Identify a chord from held MIDI notes (for free play). */
  function identify(midis) {
    if (!midis.length) return null;
    const sorted = [...midis].sort((a, b) => a - b);
    const set = [...new Set(sorted.map(pc))];
    if (set.length < 3) return null;
    const bass = pc(sorted[0]);
    const order = ['maj', 'min', 'dom7', 'maj7', 'min7', 'dim', 'aug'];
    for (const t of order) {
      const size = CHORDS[t].iv.length;
      if (size !== set.length) continue;
      for (const r of set) {
        const tones = chordPcs(r, t);
        if (tones.every((x) => set.includes(x))) {
          const inv = tones.indexOf(bass);
          const MAJ_N = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
          const MIN_N = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
          const rootName = (t === 'min' || t === 'min7' ? MIN_N : t === 'dim' ? SHARP_NAMES : MAJ_N)[r];
          const invName = ['root position', '1st inversion', '2nd inversion', '3rd inversion'][inv] || '';
          return { root: r, rootName, type: t, name: rootName + ' ' + CHORDS[t].label, inversion: invName };
        }
      }
    }
    return null;
  }

  const SOLFEGE = ['do', 'ra', 're', 'me', 'mi', 'fa', 'fi', 'sol', 'le', 'la', 'te', 'ti'];
  const DEGREE_NAMES = ['1st', '♭2nd', '2nd', '♭3rd', '3rd', '4th', '♯4th', '5th', '♭6th', '6th', '♭7th', '7th'];
  const INTERVALS = {
    1: { name: 'Minor 2nd', hook: '“Jaws” theme' },
    2: { name: 'Major 2nd', hook: 'Happy Birthday (“Hap-py Birth-”)' },
    3: { name: 'Minor 3rd', hook: 'Greensleeves (first two notes)' },
    4: { name: 'Major 3rd', hook: 'When the Saints (“Oh when”)' },
    5: { name: 'Perfect 4th', hook: 'Here Comes the Bride' },
    6: { name: 'Tritone', hook: 'The Simpsons theme (“The Simp-”)' },
    7: { name: 'Perfect 5th', hook: 'Twinkle Twinkle (“Twin-kle, twin-”)' },
    8: { name: 'Minor 6th', hook: 'The Entertainer (the jump up)' },
    9: { name: 'Major 6th', hook: 'My Bonnie Lies Over the Ocean' },
    10: { name: 'Minor 7th', hook: 'Star Trek original theme' },
    11: { name: 'Major 7th', hook: 'Take On Me (chorus jump)' },
    12: { name: 'Octave', hook: 'Somewhere Over the Rainbow (“Some-where”)' },
  };

  PP.M = {
    LETTERS, LETTER_PC, ACC_SYM, SHARP_NAMES, FLAT_NAMES, SOLFEGE, DEGREE_NAMES, INTERVALS, CHORDS,
    MAJOR_FIFTHS, MINOR_FIFTHS, SCALE_STEPS,
    pc, note, noteFromLetterMidi, stepOf, nameOf, parse, keyAcc, spell, midiName, key, buildScale, scaleOf, keyPcs,
    chordNotes, chordPcs, identify,
  };

  // ---------- Notation ----------
  const NS = 'http://www.w3.org/2000/svg';
  const S = 10; // one staff space in SVG units
  const DUR_BEATS = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25 };
  const beatsOf = (it) => DUR_BEATS[it.dur] * (it.dots === 1 ? 1.5 : it.dots === 2 ? 1.75 : 1) * (it.tup ? 2 / 3 : 1);

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, size, cls) {
    const t = el('text', { x, y, 'font-size': size, class: cls || 'glyph' }, parent);
    t.textContent = s;
    return t;
  }

  const TREBLE_TOP = 38; // F5
  const BASS_TOP = 26; // A3
  const KS_SHARP_T = [38, 35, 39, 36, 33, 37, 34];
  const KS_FLAT_T = [34, 37, 33, 36, 32, 35, 31];

  /**
   * Render a staff into `container`.
   * opt: { clef: 'treble'|'bass'|'grand'|'perc', fifths, time:[n,d], items:[...], beatW, compact }
   * items: {kind:'note', notes:[noteObj|{midi}], dur, dots, beam, cls}
   *        {kind:'rest', dur, dots}   {kind:'bar'}   {kind:'end'}
   * returns { svg, noteEls, anchors, setCursor(beat), totalBeats }
   */
  function renderStaff(container, opt) {
    const clef = opt.clef || 'treble';
    const fifths = opt.fifths || 0;
    const items = opt.items || [];
    const grand = clef === 'grand';
    const perc = clef === 'perc';

    // vertical layout
    const top = perc ? 5 * S : 6 * S; // y of top line (perc: the single line is at top+2S)
    const bTop = grand ? top + 4 * S + 7 * S : top;
    const height = perc ? 10.2 * S :(grand ? bTop + 4 * S + 6 * S : top + 4 * S + 6 * S);

    const staffOf = (n) => {
      if (perc) return 'p';
      if (grand) return n.staff || (n.midi >= 60 ? 't' : 'b');
      return clef === 'bass' ? 'b' : 't';
    };
    const yOf = (step, st) => {
      if (st === 'p') return top + 2 * S;
      return st === 'b' ? bTop + (BASS_TOP - step) * S / 2 : top + (TREBLE_TOP - step) * S / 2;
    };
    const staffTopY = (st) => (st === 'b' ? bTop : top);
    const midStep = (st) => (st === 'b' ? 22 : 34);

    // horizontal layout
    let x = S * 0.5;
    const headerStart = x;
    x += perc ? 2.6 * S : 3.6 * S;
    const ksStart = x;
    const nAcc = Math.abs(fifths);
    x += nAcc ? nAcc * 1.05 * S + 0.6 * S : 0;
    const timeX = x + 1.1 * S;
    if (opt.time) x += 2.8 * S;
    x += 1.2 * S;

    const beatW = opt.beatW || 2.6 * S;
    const layout = [];
    let beat = 0;
    let barAcc = {};
    for (const it of items) {
      if (it.kind === 'bar' || it.kind === 'end') {
        layout.push({ it, x: x + 0.9 * S, beat });
        x += 1.8 * S;
        barAcc = {};
        continue;
      }
      const b = it.adv !== undefined ? it.adv : beatsOf(it);
      let accW = 0;
      const heads = [];
      if (it.kind === 'note') {
        for (const raw of it.notes) {
          if (raw.rest) { heads.push({ rest: true, raw, st: perc ? 'p' : grand ? raw.staff || 't' : clef === 'bass' ? 'b' : 't', step: 0, showAcc: null }); continue; }
          const n = raw.letter !== undefined ? raw : spell(raw.midi, fifths);
          const st = staffOf(raw.staff ? { ...n, staff: raw.staff } : n);
          const step = perc ? 0 : stepOf(n);
          const key = st + step;
          const expected = barAcc[key] !== undefined ? barAcc[key] : keyAcc(fifths, n.letter);
          const showAcc = !perc && n.acc !== expected ? n.acc : null;
          if (!perc) barAcc[key] = n.acc;
          heads.push({ n, st, step, showAcc, raw });
        }
        // accidental columns: highest first; a column is reused only 6+ steps lower
        const withAcc = heads.filter((x) => x.showAcc !== null).sort((a, b) => (a.st === b.st ? b.step - a.step : a.st === 't' ? -1 : 1));
        const cols = [];
        for (const x of withAcc) {
          let c = cols.findIndex((last) => last.st !== x.st || last.step - x.step >= 6);
          if (c < 0) { cols.push(x); c = cols.length - 1; } else cols[c] = x;
          x.accCol = c;
        }
        if (cols.length) accW = (1.5 + (cols.length - 1) * 1.1) * S;
      }
      x += accW;
      const cx = x + 0.9 * S;
      layout.push({ it, x: cx, beat, heads, beats: b });
      beat += b;
      x += Math.max(3.2 * S, 1.6 * S + b * beatW);
    }
    const width = Math.max(x + S * 0.5, opt.minWidth || 0);

    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'stf' + (grand ? ' grand' : '') + (opt.compact ? ' compact' : ''), role: 'img' });
    if (opt.label) el('title', {}, svg).textContent = opt.label;

    // staff lines
    const staves = perc ? ['p'] : grand ? ['t', 'b'] : [clef === 'bass' ? 'b' : 't'];
    for (const st of staves) {
      if (st === 'p') {
        el('line', { x1: headerStart, x2: width - S * 0.5, y1: top + 2 * S, y2: top + 2 * S, class: 'ln' }, svg);
        continue;
      }
      const t0 = staffTopY(st);
      for (let i = 0; i < 5; i++) el('line', { x1: headerStart, x2: width - S * 0.5, y1: t0 + i * S, y2: t0 + i * S, class: 'ln' }, svg);
    }
    if (grand) {
      el('line', { x1: headerStart, x2: headerStart, y1: top, y2: bTop + 4 * S, class: 'ln bar' }, svg);
      el('path', { d: `M${headerStart - 2},${top} q-6,${(bTop + 4 * S - top) / 4} 0,${(bTop + 4 * S - top) / 2} q6,${(bTop + 4 * S - top) / 4} 0,${(bTop + 4 * S - top) / 2}`, class: 'brace' }, svg);
    }

    // clefs
    for (const st of staves) {
      if (st === 'p') {
        el('rect', { x: headerStart + 0.9 * S, y: top + 1 * S, width: 0.35 * S, height: 2 * S, class: 'fill' }, svg);
        el('rect', { x: headerStart + 1.55 * S, y: top + 1 * S, width: 0.35 * S, height: 2 * S, class: 'fill' }, svg);
      } else if (st === 't') {
        txt(svg, headerStart + 0.35 * S, top + 3 * S, '𝄞', 4 * S);
      } else {
        txt(svg, headerStart + 0.35 * S, bTop + 3.9 * S, '𝄢', 4 * S);
      }
    }

    // key signature
    if (!perc && nAcc) {
      for (const st of staves) {
        for (let i = 0; i < nAcc; i++) {
          const stepT = fifths > 0 ? KS_SHARP_T[i] : KS_FLAT_T[i];
          const step = st === 'b' ? stepT - 14 : stepT;
          const y = yOf(step, st);
          txt(svg, ksStart + i * 1.05 * S, y, fifths > 0 ? '♯' : '♭', 3 * S, 'glyph acc');
        }
      }
    }
    // time signature
    if (opt.time) {
      for (const st of staves) {
        const t0 = st === 'p' ? top : staffTopY(st);
        txt(svg, timeX, t0 + 1 * S, String(opt.time[0]), 2.9 * S, 'tsig');
        txt(svg, timeX, t0 + 3 * S, String(opt.time[1]), 2.9 * S, 'tsig');
      }
    }

    // notes
    const noteEls = [];
    const anchors = [];
    const beamGroups = {};
    for (const L of layout) {
      const it = L.it;
      if (it.kind === 'bar' || it.kind === 'end') {
        const g = el('g', {}, svg);
        for (const st of staves) {
          const y1 = st === 'p' ? top + 1 * S : staffTopY(st);
          const y2 = st === 'p' ? top + 3 * S : staffTopY(st) + 4 * S;
          el('line', { x1: L.x, x2: L.x, y1, y2, class: 'ln bar' }, g);
          if (it.kind === 'end') el('rect', { x: L.x + 0.35 * S, y: y1, width: 0.45 * S, height: y2 - y1, class: 'fill' }, g);
        }
        if (grand) el('line', { x1: L.x, x2: L.x, y1: top + 4 * S, y2: bTop, class: 'ln bar' }, g);
        anchors.push({ beat: L.beat, x: L.x });
        continue;
      }
      anchors.push({ beat: L.beat, x: L.x - 1.2 * S });
      const g = el('g', { class: 'nt ' + (it.cls || '') }, svg);
      noteEls.push(g);
      if (it.kind === 'rest') { drawRest(g, L.x, it, perc ? top : staffTopY(staves[0])); continue; }

      const byStaff = {};
      for (const h of L.heads) (byStaff[h.st] = byStaff[h.st] || []).push(h);
      const outer = it;
      for (const st in byStaff) {
        const hs = byStaff[st].filter((x) => !x.rest).sort((a, b) => a.step - b.step);
        const r0 = (hs[0] || byStaff[st][0]).raw;
        const it = r0 && r0.dur ? { ...outer, dur: r0.dur, dots: r0.dots, beam: r0.beam, tup: r0.tup } : outer;
        if (!hs.length) { drawRest(g, L.x, it, staffTopY(st === 'p' ? 't' : st)); continue; }
        const hollow = it.dur === 'w' || it.dur === 'h';
        // seconds (adjacent steps) get offset heads
        let prev = null;
        for (const h of hs) {
          h.dx = 0;
          if (prev && h.step - prev.step <= 1 && prev.dx === 0) h.dx = 1.25 * S;
          prev = h;
          const y = yOf(h.step, st);
          h.y = y;
          drawLedgers(g, L.x + h.dx, h.step, st);
          const head = el('ellipse', { cx: L.x + h.dx, cy: y, rx: it.dur === 'w' ? 0.72 * S : 0.62 * S, ry: 0.45 * S, transform: `rotate(-20 ${L.x + h.dx} ${y})`, class: 'head' + (hollow ? ' open' : '') }, g);
          if (hollow) head.setAttribute('stroke-width', it.dur === 'w' ? 2.4 : 1.8);
          if (h.showAcc !== null) txt(g, L.x - (1.75 + (h.accCol || 0) * 1.1) * S, y, ACC_SYM[h.showAcc] || '♮', 2.9 * S, 'glyph acc');
          if (it.dots) {
            const onLine = st === 'p' ? true : ((st === 'b' ? BASS_TOP : TREBLE_TOP) - h.step) % 2 === 0;
            el('circle', { cx: L.x + h.dx + 1.25 * S, cy: y - (onLine ? S / 2 : 0), r: 0.18 * S, class: 'fill' }, g);
          }
        }
        if (it.dur === 'w') continue;
        const minY = Math.min(...hs.map((h) => h.y)), maxY = Math.max(...hs.map((h) => h.y));
        const avg = hs.reduce((s, h) => s + h.step, 0) / hs.length;
        let up = st === 'p' ? true : avg < midStep(st);
        if (it.stem) up = it.stem === 'up';
        const stem = { g, x: up ? L.x + 0.58 * S : L.x - 0.58 * S, from: up ? maxY : minY, to: up ? minY - 3.4 * S : maxY + 3.4 * S, up };
        if (st !== 'p') { const midY = yOf(midStep(st), st); stem.to = up ? Math.min(stem.to, midY) : Math.max(stem.to, midY); }
        if (it.beam !== undefined && (it.dur === '8' || it.dur === '16')) {
          (beamGroups[it.beam] = beamGroups[it.beam] || []).push({ stem, st, minY, maxY, dur: it.dur, tup: it.tup });
        } else {
          el('line', { x1: stem.x, x2: stem.x, y1: stem.from, y2: stem.to, class: 'stem' }, g);
          if (it.dur === '8' || it.dur === '16') drawFlag(g, stem, it.dur === '16' ? 2 : 1);
        }
      }
    }
    // beams: horizontal beam at the extreme stem end, shared direction
    for (const id in beamGroups) {
      const grp = beamGroups[id];
      const st0 = grp[0].st;
      let up;
      if (st0 === 'p') up = grp[0].stem.up;
      else {
        const midY = yOf(midStep(st0), st0);
        up = Math.max(...grp.map((b) => b.maxY)) - midY > midY - Math.min(...grp.map((b) => b.minY));
      }
      let yEnd = up ? Math.min(...grp.map((b) => b.minY)) - 3.4 * S : Math.max(...grp.map((b) => b.maxY)) + 3.4 * S;
      if (st0 !== 'p') { const midY = yOf(midStep(st0), st0); yEnd = up ? Math.min(yEnd, midY) : Math.max(yEnd, midY); }
      grp.forEach((b) => {
        const x0 = b.stem.x + (up === b.stem.up ? 0 : up ? 1.16 * S : -1.16 * S);
        const from = up ? b.maxY : b.minY;
        el('line', { x1: x0, x2: x0, y1: from, y2: yEnd, class: 'stem' }, b.stem.g);
        b.bx = x0;
      });
      const x1 = grp[0].bx, x2 = grp[grp.length - 1].bx;
      const th = 0.5 * S;
      el('rect', { x: Math.min(x1, x2) - 0.07 * S, y: up ? yEnd : yEnd - th, width: Math.abs(x2 - x1) + 0.14 * S, height: th, class: 'fill' }, grp[0].stem.g);
      // second beam for runs of sixteenths (a stub for a lone one)
      for (let i = 0; i < grp.length; i++) {
        if (grp[i].dur !== '16') continue;
        let j = i;
        while (j + 1 < grp.length && grp[j + 1].dur === '16') j++;
        let xa = grp[i].bx, xb = grp[j].bx;
        if (i === j) { if (i > 0) xa = xb - 1.1 * S; else xb = xa + 1.1 * S; }
        el('rect', { x: Math.min(xa, xb) - 0.07 * S, y: up ? yEnd + 0.8 * S : yEnd - th - 0.8 * S, width: Math.abs(xb - xa) + 0.14 * S, height: th, class: 'fill' }, grp[0].stem.g);
        i = j;
      }
      if (grp[0].tup) txt(grp[0].stem.g, (x1 + x2) / 2, up ? yEnd - 0.8 * S : yEnd + 0.8 * S, '3', 1.5 * S, 'tsig');
    }

    function drawLedgers(g, cx, step, st) {
      if (st === 'p') return;
      const topStep = st === 'b' ? BASS_TOP : TREBLE_TOP;
      const botStep = topStep - 8;
      for (let s = botStep - 2; s >= step; s -= 2) { const y = yOf(s, st); el('line', { x1: cx - 1.05 * S, x2: cx + 1.05 * S, y1: y, y2: y, class: 'ln ledger' }, g); }
      for (let s = topStep + 2; s <= step; s += 2) { const y = yOf(s, st); el('line', { x1: cx - 1.05 * S, x2: cx + 1.05 * S, y1: y, y2: y, class: 'ln ledger' }, g); }
    }
    function drawFlag(g, stem, count) {
      for (let i = 0; i < count; i++) {
        const y0 = stem.to + (stem.up ? i * 0.8 * S : -i * 0.8 * S);
        const d = stem.up
          ? `M${stem.x},${y0} c${0.2 * S},${1.3 * S} ${1.6 * S},${1.6 * S} ${1.1 * S},${3.2 * S} c${0.25 * S},${-1.2 * S} ${-0.6 * S},${-1.9 * S} ${-1.1 * S},${-2.2 * S} z`
          : `M${stem.x},${y0} c${0.2 * S},${-1.3 * S} ${1.6 * S},${-1.6 * S} ${1.1 * S},${-3.2 * S} c${0.25 * S},${1.2 * S} ${-0.6 * S},${1.9 * S} ${-1.1 * S},${2.2 * S} z`;
        el('path', { d, class: 'fill' }, g);
      }
    }
    function drawRest(g, cx, it, t0) {
      if (it.dur === 'w') el('rect', { x: cx - 0.65 * S, y: t0 + 1 * S, width: 1.3 * S, height: 0.55 * S, class: 'fill' }, g);
      else if (it.dur === 'h') el('rect', { x: cx - 0.65 * S, y: t0 + 2 * S - 0.55 * S, width: 1.3 * S, height: 0.55 * S, class: 'fill' }, g);
      else if (it.dur === 'q') {
        const d = `M${cx - 0.25 * S},${t0 + 0.55 * S} l${0.75 * S},${0.95 * S} l${-0.6 * S},${0.75 * S} l${0.7 * S},${0.95 * S} c${-0.7 * S},${-0.3 * S} ${-1.2 * S},${0.1 * S} ${-0.55 * S},${0.95 * S} c${-1.2 * S},${-0.7 * S} ${-0.9 * S},${-1.55 * S} ${0.1 * S},${-1.25 * S} l${-0.75 * S},${-0.9 * S} l${0.6 * S},${-0.75 * S} z`;
        el('path', { d, class: 'fill' }, g);
      } else {
        el('circle', { cx: cx - 0.2 * S, cy: t0 + 1.6 * S, r: 0.32 * S, class: 'fill' }, g);
        el('path', { d: `M${cx - 0.3 * S},${t0 + 1.85 * S} q${0.7 * S},${0.15 * S} ${1.0 * S},${-0.35 * S} l${-0.9 * S},${2.4 * S}`, class: 'stem' }, g);
      }
      if (it.dots) el('circle', { cx: cx + 1.1 * S, cy: t0 + 1.5 * S, r: 0.18 * S, class: 'fill' }, g);
    }

    // cursor
    const endX = layout.length ? layout[layout.length - 1].x : width;
    anchors.push({ beat, x: endX });
    const cursor = el('rect', { x: 0, y: (perc ? top : top) - 2.2 * S, width: 2.4 * S, height: (grand ? bTop + 4 * S : top + 4 * S) - top + 4.4 * S, rx: 0.6 * S, class: 'cursor', visibility: 'hidden' }, svg);
    svg.insertBefore(cursor, svg.firstChild);

    function setCursor(b) {
      if (b === null || b === undefined) { cursor.setAttribute('visibility', 'hidden'); return; }
      let a = anchors[0], c = anchors[anchors.length - 1];
      for (let i = 0; i < anchors.length - 1; i++) {
        if (b >= anchors[i].beat && b <= anchors[i + 1].beat) { a = anchors[i]; c = anchors[i + 1]; break; }
      }
      const f = c.beat === a.beat ? 0 : (b - a.beat) / (c.beat - a.beat);
      const cx = a.x + (c.x - a.x) * Math.max(0, Math.min(1, f));
      cursor.setAttribute('x', cx - 0.2 * S);
      cursor.setAttribute('visibility', 'visible');
    }

    container.innerHTML = '';
    container.appendChild(svg);
    return { svg, noteEls, setCursor, totalBeats: beat, width, height };
  }

  PP.Staff = { render: renderStaff, beatsOf, DUR_BEATS };

  // ---------- Sound ----------
  const Sound = {
    ctx: null,
    out: null,
    ensure() {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        this.ctx = new C({ latencyHint: 'interactive' });
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 3;
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.9;
        this.out.connect(comp); comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    now() { const c = this.ensure(); return c ? c.currentTime : 0; },
    /** Seconds until audio scheduled at `ctxTime` is actually heard, in performance.now() ms. */
    perfAt(ctxTime) {
      const c = this.ctx;
      if (c && c.getOutputTimestamp) {
        const ts = c.getOutputTimestamp();
        if (ts && ts.performanceTime) return ts.performanceTime + (ctxTime - ts.contextTime) * 1000;
      }
      const lat = c ? (c.outputLatency || c.baseLatency || 0) : 0;
      return performance.now() + (ctxTime - (c ? c.currentTime : 0) + lat) * 1000;
    },
    note(midi, when, dur = 1.1, vel = 0.7, dest) {
      const c = this.ensure(); if (!c) return;
      const t = Math.max(c.currentTime + 0.005, when || 0);
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(14000, f * 9), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2.5), t + 1.4);
      lp.connect(g); g.connect(dest || this.out);
      const peak = 0.32 * vel;
      const tau = Math.max(0.35, 1.4 - (midi - 60) / 50);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.setTargetAtTime(peak * 0.12, t + 0.01, tau);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.07);
      const parts = [[1, 'triangle', 0.7], [2, 'sine', 0.28], [3, 'sine', 0.1], [4.01, 'sine', 0.05], [1.0015, 'sine', 0.35]];
      for (const [mul, type, amp] of parts) {
        const o = c.createOscillator();
        o.type = type; o.frequency.value = f * mul;
        const pg = c.createGain(); pg.gain.value = amp;
        o.connect(pg); pg.connect(lp);
        o.start(t); o.stop(t + dur + 0.6);
      }
    },
    chord(midis, when, dur = 1.2, vel = 0.6) { midis.forEach((m) => this.note(m, when, dur, vel * 0.85)); },
    click(when, accent, dest) {
      const c = this.ensure(); if (!c) return;
      const t = Math.max(c.currentTime, when);
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'square'; o.frequency.value = accent ? 1760 : 1175;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.13, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g); g.connect(dest || this.out);
      o.start(t); o.stop(t + 0.06);
    },
    /** Play a list of events [{m: midi|[midis], at: sec, d: sec}] starting after `delay` seconds. Returns end time in sec from now. */
    seq(events, delay = 0.08) {
      const c = this.ensure(); if (!c) return 0;
      const t0 = c.currentTime + delay;
      let end = 0;
      for (const e of events) {
        const ms = Array.isArray(e.m) ? e.m : [e.m];
        ms.forEach((m) => this.note(m, t0 + e.at, e.d || 0.8, e.v || (ms.length > 1 ? 0.5 : 0.7)));
        end = Math.max(end, e.at + (e.d || 0.8));
      }
      return delay + end;
    },
  };
  PP.Sound = Sound;
})();
