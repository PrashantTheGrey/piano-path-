/* Piano Path — progress, spaced repetition, timing engine, screens. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});
  const $ = (s, r = document) => r.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };

  // ---------- Storage ----------
  const KEY = 'pianopath.v1';
  const store = {
    data: { v: 1, skills: {}, items: {}, days: {}, prefs: {}, session: null },
    load() {
      try { const s = localStorage.getItem(KEY); if (s) Object.assign(this.data, JSON.parse(s)); } catch (e) { /* storage unavailable */ }
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
    skill(id) { return (this.data.skills[id] = this.data.skills[id] || { unlocked: 0, stages: {}, last: 0 }); },
    stage(id, i) { const s = this.skill(id); return (s.stages[i] = s.stages[i] || { mastered: false, best: 0, rounds: 0 }); },
    item(k) { return (this.data.items[k] = this.data.items[k] || { box: 1, due: 0, n: 0, ok: 0 }); },
    pref(k, d) { return this.data.prefs[k] !== undefined ? this.data.prefs[k] : d; },
    setPref(k, v) { this.data.prefs[k] = v; this.save(); },
    addMinutes(min) { const d = today(); this.data.days[d] = (this.data.days[d] || 0) + min; this.save(); },
    streak() {
      let n = 0, d = today();
      if (!this.data.days[d]) d--;
      while (this.data.days[d]) { n++; d--; }
      return n;
    },
    weekMinutes() { let s = 0; const t = today(); for (let d = t - 6; d <= t; d++) s += this.data.days[d] || 0; return Math.round(s); },
  };
  PP.store = store;

  // ---------- Spaced repetition (Leitner boxes) ----------
  const BOX_W = [0, 8, 5, 3, 2, 1];
  const BOX_DAYS = [0, 0, 1, 3, 7, 14];
  const SRS = {
    weight(skillId, item) {
      const r = store.data.items[skillId + ':' + item];
      if (!r) return BOX_W[1] * 1.3; // new items first
      return BOX_W[r.box] * (r.due <= today() ? 1.5 : 0.6);
    },
    pickWeighted(list, skillId, avoid) {
      const c = list.filter((x) => x !== avoid);
      const pool = c.length ? c : list;
      const ws = pool.map((x) => this.weight(skillId, x));
      let r = Math.random() * ws.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    },
    queue(skill, stageIdx, n) {
      const cur = [...new Set(skill.pool(skill.stages[stageIdx], stageIdx))];
      const prev = [];
      for (let j = 0; j < stageIdx; j++) if (store.stage(skill.id, j).mastered) prev.push(...skill.pool(skill.stages[j], j));
      const prevU = [...new Set(prev)].filter((x) => !cur.includes(x));
      const out = [];
      // make sure every current item appears when the round is long enough
      const shuffled = cur.slice().sort(() => Math.random() - 0.5);
      if (cur.length <= n && !skill.generated) shuffled.forEach((x) => out.push(x));
      while (out.length < n) {
        const fromPrev = prevU.length && Math.random() < 0.2;
        out.push(this.pickWeighted(fromPrev ? prevU : cur, skill.id, out[out.length - 1]));
      }
      // shuffle without immediate repeats
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      for (let i = 1; i < out.length; i++) if (out[i] === out[i - 1]) { const j = out.findIndex((x, k) => k > i && x !== out[i] && x !== out[i - 2]); if (j > 0) [out[i], out[j]] = [out[j], out[i]]; }
      return out.map((item) => ({ item, review: false }));
    },
    update(skillId, item, correct, fast) {
      const r = store.item(skillId + ':' + item);
      r.n++;
      if (correct) r.ok++;
      if (!correct) { r.box = 1; r.due = today(); }
      else if (fast) { r.box = Math.min(5, r.box + 1); r.due = today() + BOX_DAYS[r.box]; }
      else r.due = today() + 1;
    },
  };

  // ---------- Timed performance (rhythm & sight-reading) ----------
  PP.Perf = {
    run(o) {
      const S = PP.Sound;
      const ctx = S.ensure();
      const beatSec = 60 / o.bpm;
      const t0 = ctx.currentTime + 0.35;
      const total = o.events.reduce((m, e) => Math.max(m, e.beat + e.dur), 0);
      const nBeats = o.countIn + Math.ceil(total - 1e-6);
      const bus = ctx.createGain();
      bus.connect(S.out);
      const ce = o.clickEvery || 1;
      for (let b = 0; b < nBeats - 1e-6; b += ce) S.click(t0 + b * beatSec, Math.abs(b % o.beatsPerBar) < 1e-6, bus);
      (o.autoPlay || []).forEach((e) => S.note(e.midi, t0 + (o.countIn + e.beat) * beatSec, Math.max(0.15, e.dur * beatSec * 0.95), 0.5, bus));
      const silence = () => { try { bus.gain.setValueAtTime(0, ctx.currentTime); bus.disconnect(); } catch (e) { /* ignore */ } };
      const startPerf = S.perfAt(t0);
      const beatMs = beatSec * 1000;
      const lat = store.pref('latencyMs', 0);
      const beatAt = (t) => (t - lat - startPerf) / beatMs - o.countIn;
      const notes = o.events.map((e, i) => ({ ...e, i, status: null }));
      const playable = notes.filter((n) => !n.rest);
      let extras = 0;
      let stopped = false;
      const off = PP.Input.on((ev) => {
        if (ev.type !== 'on' || stopped) return;
        const b = beatAt(ev.t);
        // open notes whose window contains this tap, earliest first
        const cands = playable.filter((n) => {
          if (n.status) return false;
          const d = b - n.beat;
          return d >= -0.4 && d <= Math.max(0.4, Math.min(0.6, n.dur * 0.6));
        });
        let best = null;
        if (cands.length) {
          const pool = o.pitched && cands.some((n) => n.midi === ev.midi) ? cands.filter((n) => n.midi === ev.midi) : cands;
          best = pool.find((n) => Math.abs(b - n.beat) <= 0.22) || pool[0];
        }
        if (!best) { if (b > -0.5 && b < total + 0.5) extras++; return; }
        const pitchOk = !o.pitched || ev.midi === best.midi;
        const d = b - best.beat;
        best.status = !pitchOk ? 'bad' : Math.abs(d) <= 0.22 ? 'ok' : d < 0 ? 'early' : 'late';
        best.vel = ev.vel; best.src = ev.src;
        o.onMark(best.i, best.status);
      });
      let raf = 0;
      const tick = () => {
        if (stopped) return;
        const b = (performance.now() - startPerf) / beatMs - o.countIn;
        o.onCursor(b);
        for (const n of playable) if (!n.status && b - lat / beatMs > n.beat + 0.65) { n.status = 'miss'; o.onMark(n.i, 'miss'); }
        if (b - lat / beatMs > total + 0.4) { finish(); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      function finish() {
        stopped = true; off(); cancelAnimationFrame(raf); silence();
        for (const n of playable) if (!n.status) { n.status = 'miss'; o.onMark(n.i, 'miss'); }
        const c = (s) => playable.filter((n) => n.status === s).length;
        const credit = c('ok') + 0.6 * (c('early') + c('late'));
        const score = playable.length ? Math.max(0, (credit - 0.5 * extras) / playable.length) : 0;
        const parts = [`${c('ok')} of ${playable.length} notes right and on time`];
        if (c('early') + c('late')) parts.push(`${c('early')} early, ${c('late')} late`);
        if (c('bad')) parts.push(`${c('bad')} wrong note${c('bad') > 1 ? 's' : ''}`);
        if (c('miss')) parts.push(`${c('miss')} missed`);
        if (extras) parts.push(`${extras} extra`);
        o.onDone({ score, summary: parts.join(' · ') + '.', notes: playable });
      }
      return { stop() { if (!stopped) { stopped = true; off(); cancelAnimationFrame(raf); silence(); } } };
    },
  };

  // ---------- Daily plan ----------
  function nextStageIdx(skill) {
    const rec = store.skill(skill.id);
    for (let i = 0; i < skill.stages.length; i++) if (!store.stage(skill.id, i).mastered) return Math.min(i, rec.unlocked);
    return skill.stages.length - 1; // all mastered: keep reviewing the top stage
  }
  function allMastered(skill) { return skill.stages.every((_, i) => store.stage(skill.id, i).mastered); }
  function planToday() {
    const d = today();
    if (store.data.session && store.data.session.day === d) return store.data.session;
    const steps = PP.STRANDS.map((strand) => {
      const cands = strand.skills.map((id) => PP.SkillById[id]);
      let best = null, bestKey = null;
      cands.forEach((sk, order) => {
        const i = nextStageIdx(sk);
        const lvl = allMastered(sk) ? 99 : sk.stages[i].lvl;
        const key = [lvl, store.skill(sk.id).last || 0, order];
        if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) { best = sk; bestKey = key; }
      });
      return { strand: strand.id, skill: best.id, stage: nextStageIdx(best), done: false };
    });
    store.data.session = { day: d, steps };
    store.save();
    return store.data.session;
  }

  // ---------- Views ----------
  const views = ['home', 'drill', 'explore', 'settings'];
  function show(v) {
    views.forEach((x) => { $('#v-' + x).hidden = x !== v; });
    document.body.dataset.view = v;
    window.scrollTo(0, 0);
    if (v !== 'drill') { Runner.stop(); releaseWake(); }
    if (v === 'home') renderHome();
    if (v === 'explore') renderExplore();
    if (v === 'settings') renderSettings();
  }

  let wake = null;
  async function holdWake() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* optional */ } }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.body.dataset.view === 'drill') holdWake(); });

  function stageChips(sk) {
    const rec = store.skill(sk.id);
    return sk.stages.map((st, i) => {
      const m = store.stage(sk.id, i).mastered;
      const open = i <= rec.unlocked;
      return `<button class="chip${m ? ' done' : ''}${open ? '' : ' locked'}${st.lvl >= 5 ? ' inter' : ''}" data-skill="${sk.id}" data-stage="${i}" title="${st.t}${m ? ' (mastered)' : open ? '' : ' (locked: tap to take a placement test)'}"><span>${i + 1}</span></button>`;
    }).join('');
  }

  function renderHome() {
    const plan = planToday();
    const root = $('#v-home');
    const streak = store.streak();
    const mins = store.weekMinutes();
    const doneCount = plan.steps.filter((s) => s.done).length;
    const stepRow = (s, n) => {
      const sk = PP.SkillById[s.skill];
      const st = sk.stages[s.stage];
      const strand = PP.STRANDS.find((x) => x.id === s.strand);
      return `<li class="step${s.done ? ' done' : ''}">
        <span class="step-n" aria-hidden="true">${s.done ? '✓' : n + 1}</span>
        <div class="step-t"><span class="eyebrow">${strand.title}</span><b>${sk.title}</b><span class="muted">Stage ${s.stage + 1}: ${st.t}</span></div>
        <button class="btn ${s.done ? 'ghost' : 'soft'} sm" data-plan="${n}">${s.done ? 'Again' : 'Start'}</button>
      </li>`;
    };
    const conn = PP.Input.status.kind;
    root.innerHTML = `
      <div class="home">
        <section class="today">
          <div class="today-head">
            <div><p class="eyebrow">Today’s practice · about ${plan.steps.length * 5} minutes</p><h1>${doneCount === plan.steps.length ? 'Done for today' : doneCount ? 'Keep going' : 'Ready when you are'}</h1></div>
            <div class="stats"><div><b>${streak}</b><span>day streak</span></div><div><b>${mins}</b><span>min this week</span></div></div>
          </div>
          <ol class="steps">${plan.steps.map(stepRow).join('')}</ol>
          <div class="today-foot">
            <button class="btn primary" id="startSession">${doneCount === plan.steps.length ? 'Practise again' : doneCount ? 'Continue session' : 'Start session'}</button>
            <span class="muted small">Ear first, then keys, reading and sight-reading. Sound before symbol.</span>
          </div>
        </section>
        ${conn === 'bt' || conn === 'midi' ? '' : `<section class="notice"><div><b>Connect your piano</b><p class="muted">The app needs to hear which keys you press. Bluetooth digital pianos connect straight from Chrome.</p></div><button class="btn soft" data-open="connect">Connect</button></section>`}
        <details class="method-card">
          <summary><b>How Piano Path teaches</b><span class="muted"> · the methods behind every exercise</span></summary>
          <ul class="methods">
            <li><b>Sound before symbol.</b> Each session starts with ear training, and new ideas are heard and played before they are read — the order used by Kodály, Suzuki and Gordon’s Music Learning Theory.</li>
            <li><b>Spaced repetition.</b> Every note, chord and key is a card in a Leitner box: misses come back today, solid ones return after days or weeks.</li>
            <li><b>Mastery and fluency goals.</b> A stage opens the next one only at 90% accuracy within a time goal (mastery learning and precision teaching), so you move on when it’s automatic, not when you’ve merely seen it.</li>
            <li><b>Mixed practice.</b> Each daily session mixes four skills (interleaving), which builds longer-lasting skill than drilling one thing.</li>
            <li><b>Functional ear training.</b> Notes and chords are always heard in a key, as do-re-mi and I-IV-V, which is how players work out songs by ear.</li>
            <li><b>Pulse-first sight-reading.</b> Look, then play with a steady click and keep going — the approach used to prepare for graded sight-reading tests.</li>
            <li><b>Correct-response practice.</b> After a mistake you play the right answer before moving on, so the last thing your hands do is correct.</li>
          </ul>
        </details>
        <p class="muted small">Stage numbers in amber are the intermediate levels. Already know a stage? Tap a locked number to take its placement test: pass it and every stage up to it is marked as mastered.</p>
        ${PP.STRANDS.map((strand) => `
          <section class="strand">
            <div class="strand-head"><h2>${strand.title}</h2><span class="muted">${strand.sub}</span></div>
            <div class="skills">${strand.skills.map((id) => {
              const sk = PP.SkillById[id];
              const i = nextStageIdx(sk);
              const done = sk.stages.filter((_, j) => store.stage(id, j).mastered).length;
              return `<article class="skill">
                <div class="skill-top"><span class="sk-icon" aria-hidden="true">${sk.icon}</span><div><h3>${sk.title}</h3><p class="muted small">${sk.blurb}</p></div></div>
                <div class="chips" aria-label="Stages">${stageChips(sk)}</div>
                <div class="skill-foot"><span class="small muted">${done === sk.stages.length ? 'All stages mastered' : `Next: ${sk.stages[i].t}`}</span><button class="btn soft sm" data-skill="${id}" data-stage="${i}">Practise</button></div>
              </article>`;
            }).join('')}</div>
          </section>`).join('')}
        <section class="tools">
          <button class="tool" data-go="explore"><b>Free play</b><span class="muted small">See the notes and chord names of whatever you play.</span></button>
          <button class="tool" data-go="settings"><b>Settings</b><span class="muted small">Timing calibration, tempo, on-screen keys, progress.</span></button>
        </section>
      </div>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-go]');
    if (!t) return;
    PP.Sound.ensure();
    if (t.dataset.plan !== undefined) {
      const plan = planToday();
      Runner.startSession(parseInt(t.dataset.plan, 10), plan);
    } else if (t.id === 'startSession') {
      const plan = planToday();
      let i = plan.steps.findIndex((s) => !s.done);
      if (i < 0) { plan.steps.forEach((s) => { s.done = false; }); i = 0; store.save(); }
      Runner.startSession(i, plan);
    } else if (t.dataset.skill && t.dataset.stage !== undefined && !t.closest('#v-drill')) {
      Runner.start(t.dataset.skill, parseInt(t.dataset.stage, 10), t.classList.contains('locked') ? { placement: true } : {});
    } else if (t.dataset.go) show(t.dataset.go);
    else if (t.dataset.open === 'connect') openSheet();
  });

  // ---------- Drill runner ----------
  const Runner = {
    s: null,
    startSession(stepIdx, plan) {
      const step = plan.steps[stepIdx];
      if (store.stage(step.skill, step.stage).mastered) step.stage = nextStageIdx(PP.SkillById[step.skill]);
      step.stage = Math.min(step.stage, store.skill(step.skill).unlocked);
      this.start(step.skill, step.stage, { session: { plan, stepIdx } });
    },
    start(skillId, stageIdx, opts = {}) {
      const skill = PP.SkillById[skillId];
      const rec = store.skill(skillId);
      stageIdx = Math.max(0, Math.min(stageIdx, opts.placement ? skill.stages.length - 1 : rec.unlocked, skill.stages.length - 1));
      if (opts.placement && stageIdx <= rec.unlocked) opts = { ...opts, placement: false };
      this.stop();
      show('drill');
      holdWake();
      const n = skill.round || 10;
      this.s = { skill, stageIdx, stage: skill.stages[stageIdx], queue: SRS.queue(skill, stageIdx, n), results: [], qi: 0, total: n, q: null, timers: [], t0: performance.now(), opts };
      rec.last = Date.now();
      store.save();
      this.renderFrame();
      this.next();
    },
    stop() {
      if (!this.s) return;
      this.clearTimers();
      if (this.s.q && this.s.q.cleanup) try { this.s.q.cleanup(); } catch (e) { console.error(e); }
      if (this.s.releaseOff) this.s.releaseOff();
      PP.Keys.clearMarks();
      this.s = null;
    },
    clearTimers() { if (this.s) { this.s.timers.forEach(clearTimeout); this.s.timers = []; } },
    renderFrame() {
      const { skill, stageIdx, stage, opts } = this.s;
      const root = $('#v-drill');
      root.innerHTML = `
        <div class="drill">
          <div class="drill-top">
            <button class="btn ghost sm" id="d-back">← Plan</button>
            <div class="dt-title"><b>${skill.title}${opts.placement ? ' · placement test' : ''}</b><span class="muted small">Stage ${stageIdx + 1} of ${skill.stages.length} · ${stage.t}${opts.session ? ` · step ${opts.session.stepIdx + 1} of ${opts.session.plan.steps.length}` : ''}</span></div>
            <div class="rprog" id="d-prog" aria-label="Round progress"></div>
          </div>
          <div class="qcard" id="d-card">
            <h2 class="prompt" id="d-prompt"></h2>
            <p class="subp" id="d-sub"></p>
            <div class="stage" id="d-stage"></div>
            <div class="answers" id="d-answers"></div>
            <p class="feedback" id="d-feedback" aria-live="polite"></p>
            <div class="actions" id="d-actions"></div>
            <div class="nextrow" id="d-next" hidden><button class="btn primary" id="d-nextbtn">Next →</button></div>
          </div>
          <details class="method-card slim"><summary><b>Why this works</b></summary><p>${skill.method}</p>${stage.d ? `<p class="muted">${stage.d}</p>` : ''}</details>
        </div>`;
      $('#d-back').onclick = () => show('home');
      $('#d-nextbtn').onclick = () => this.next();
    },
    renderProg() {
      const s = this.s;
      const scored = s.results;
      const dots = [];
      for (let i = 0; i < s.total; i++) {
        const r = scored[i];
        dots.push(`<span class="pd${r ? (r.correct ? ' ok' : ' bad') : i === scored.length ? ' cur' : ''}"></span>`);
      }
      $('#d-prog').innerHTML = dots.join('');
    },
    next() {
      const s = this.s;
      if (!s || s.releaseOff) return;
      this.clearTimers();
      if (s.q && s.q.cleanup) try { s.q.cleanup(); } catch (e) { console.error(e); }
      s.q = null;
      PP.Keys.clearMarks();
      if (!s.queue.length) { this.summary(); return; }
      // wait until keys are released so a held chord doesn't answer the next question
      if (PP.Input.held.size) {
        $('#d-feedback').textContent = 'Release the keys…';
        $('#d-feedback').className = 'feedback info';
        $('#d-next').hidden = true;
        const t = this.timer(go, 2500);
        const off = PP.Input.on(() => { if (!PP.Input.held.size) { clearTimeout(t); go(); } });
        s.releaseOff = off;
        const self = this;
        function go() { off(); s.releaseOff = null; if (self.s === s) self.ask(s.queue.shift()); }
        return;
      }
      this.ask(s.queue.shift());
    },
    ask(entry) {
      const s = this.s;
      const card = $('#d-card');
      card.classList.remove('flash-ok', 'flash-bad');
      ['#d-prompt', '#d-sub', '#d-stage', '#d-answers', '#d-feedback', '#d-actions'].forEach((id) => { $(id).innerHTML = ''; });
      $('#d-feedback').className = 'feedback';
      $('#d-next').hidden = true;
      this.renderProg();
      const q = { done: false, entry, clock: null, hinted: false, fix: null };
      s.q = q;
      const api = this.makeApi(q);
      if (entry.review) api.say('Fix-up: this one came up earlier.', 'info');
      let handlers = {};
      try { handlers = s.skill.ask(entry.item, s.stage, api) || {}; } catch (e) { console.error(e); api.say('Something went wrong with this question. Skipping it.', 'bad'); this.timer(() => this.next(), 1200); return; }
      Object.assign(q, handlers);
    },
    timer(fn, ms) { const t = setTimeout(fn, ms); if (this.s) this.s.timers.push(t); return t; },
    makeApi(q) {
      const self = this;
      const s = this.s;
      const card = $('#d-card');
      const api = {
        root: card,
        Sound: PP.Sound, Keys: PP.Keys, Input: PP.Input,
        qIndex: s.results.length,
        prompt(html) { $('#d-prompt').innerHTML = html; },
        sub(html) { $('#d-sub').innerHTML = html; },
        stageHTML(html) { $('#d-stage').innerHTML = html; },
        staff(opts) { $('#d-stage').innerHTML = '<div class="staff-slot"></div>'; return PP.Staff.render($('#d-stage .staff-slot'), opts); },
        buttons(list, onPick, o = {}) {
          const wrap = $('#d-answers');
          wrap.innerHTML = list.map((b) => `<button class="ans" data-v="${b.value}"><b>${b.label}</b>${b.sub ? `<span>${b.sub}</span>` : ''}</button>`).join('');
          wrap.querySelectorAll('.ans').forEach((btn) => {
            btn.onclick = () => {
              if (q.done) return;
              if (!o.keepEnabled) wrap.querySelectorAll('.ans').forEach((x) => { x.disabled = true; });
              onPick(btn.dataset.v);
            };
          });
        },
        markButton(v, cls) { const b = $(`#d-answers .ans[data-v="${CSS.escape(v)}"]`); if (b) b.classList.add(cls); },
        actions(list) {
          const wrap = $('#d-actions');
          wrap.innerHTML = '';
          list.forEach((a) => {
            const b = h(`<button class="btn ${a.primary ? 'primary' : 'ghost'} sm">${a.label}</button>`);
            b.onclick = () => { PP.Sound.ensure(); a.fn(); };
            wrap.appendChild(b);
          });
        },
        setActionsDisabled(v) { $('#d-actions').querySelectorAll('button').forEach((b) => { b.disabled = v; }); },
        say(html, tone) { self.say(html, tone); },
        startClock() { q.clock = performance.now(); },
        clockStarted() { return q.clock !== null; },
        after(ms, fn) { return self.timer(() => { if (self.s === s && s.q === q) fn(); }, ms); },
        tempoFactor() { return store.pref('tempo', 1); },
        finish(res) { self.finish(q, res); },
      };
      return api;
    },
    onInput(ev) {
      const s = this.s;
      if (!s || !s.q) return;
      const q = s.q;
      if (q.done) {
        if (q.fix && q.fix(ev)) { q.fix = null; this.say('That’s it.', 'good'); this.timer(() => this.next(), 500); }
        return;
      }
      if (q.onNote) q.onNote(ev);
    },
    say(html, tone) {
      const f = $('#d-feedback');
      if (!f) return;
      f.innerHTML = html;
      f.className = 'feedback ' + (tone || '');
      requestAnimationFrame(() => { const nx = $('#d-next'); (nx && !nx.hidden ? nx : f).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    },
    finish(q, res) {
      const s = this.s;
      if (!s || q.done) return;
      q.done = true;
      const rt = q.clock !== null ? (performance.now() - q.clock) / 1000 : null;
      const target = s.stage.target;
      const fast = !target || (rt !== null && rt <= target);
      const entry = q.entry;
      if (!entry.review) {
        s.results.push({ item: entry.item, correct: !!res.correct, rt, score: res.score, hinted: !!res.hinted });
        SRS.update(s.skill.id, entry.item, res.correct && !res.hinted, fast);
        store.save();
        if (!res.correct && !s.skill.noRequeue && !s.skill.generated) s.queue.push({ item: entry.item, review: true });
      }
      this.renderProg();
      const card = $('#d-card');
      card.classList.add(res.correct ? 'flash-ok' : 'flash-bad');
      let msg;
      if (res.correct) {
        const speed = target && rt !== null ? (rt <= target ? ` <span class="pill ok">${rt.toFixed(1)} s</span>` : ` <span class="pill slow">${rt.toFixed(1)} s · goal ${target} s</span>`) : '';
        msg = `<b>${res.hinted ? 'Done' : 'Correct'}.</b>${speed} ${res.note || ''}`;
      } else msg = `<b>Not quite.</b> ${res.note || ''}`;
      this.say(msg, res.correct ? 'good' : 'bad');
      if (!res.correct && res.reveal) try { res.reveal(); } catch (e) { console.error(e); }
      if (!res.correct && res.fix && s.skill.correction) {
        q.fix = res.fix;
        $('#d-feedback').insertAdjacentHTML('beforeend', '<br><span class="small">Now play it correctly to continue.</span>');
        $('#d-next').hidden = false;
        $('#d-nextbtn').textContent = 'Skip →';
        return;
      }
      if (res.manual || !res.correct) {
        $('#d-next').hidden = false;
        $('#d-nextbtn').textContent = s.queue.length ? 'Next →' : 'See results →';
        $('#d-nextbtn').focus({ preventScroll: true });
        return;
      }
      this.timer(() => this.next(), res.delay || 900);
    },
    summary() {
      const s = this.s;
      const { skill, stageIdx, results } = s;
      const n = results.length || 1;
      const correct = results.filter((r) => r.correct).length;
      const acc = correct / n;
      const times = results.filter((r) => r.correct && r.rt !== null).map((r) => r.rt).sort((a, b) => a - b);
      const median = times.length ? times[Math.floor(times.length / 2)] : null;
      const meanScore = results.reduce((a, r) => a + (r.score || 0), 0) / n;
      const target = s.stage.target;
      let mastered, why;
      if (skill.timed) {
        mastered = meanScore >= 0.85;
        why = `Average score ${Math.round(meanScore * 100)}% (goal 85%).`;
      } else {
        const accGoal = skill.mastery || 0.9;
        const speedOk = !target || (median !== null && median <= target);
        mastered = acc >= accGoal - 1e-9 && speedOk;
        why = `${correct} of ${n} correct (goal ${Math.round(accGoal * 100)}%)` + (target ? ` · median time ${median !== null ? median.toFixed(1) + ' s' : '—'} (goal ${target} s)` : '') + '.';
      }
      const rec = store.skill(skill.id);
      const stRec = store.stage(skill.id, stageIdx);
      stRec.rounds++;
      stRec.best = Math.max(stRec.best, skill.timed ? meanScore : acc);
      const newlyMastered = mastered && !stRec.mastered;
      if (mastered) {
        stRec.mastered = true;
        if (s.opts.placement) for (let j = 0; j < stageIdx; j++) store.stage(skill.id, j).mastered = true;
        if (stageIdx >= rec.unlocked) rec.unlocked = Math.min(stageIdx + 1, skill.stages.length - 1);
      }
      if (s.opts.placement && !mastered) why += ` Placement not passed — start from stage ${rec.unlocked + 1}, or try a lower stage’s placement test.`;
      store.addMinutes((performance.now() - s.t0) / 60000);
      const sess = s.opts.session;
      if (sess) { sess.plan.steps[sess.stepIdx].done = true; if (mastered) sess.plan.steps[sess.stepIdx].stage = Math.min(rec.unlocked, skill.stages.length - 1); }
      store.save();
      const missed = [...new Set(results.filter((r) => !r.correct).map((r) => r.item))];
      const nextStep = sess ? sess.plan.steps.findIndex((x, i) => !x.done && i !== sess.stepIdx) : -1;
      const hasNextStage = mastered && stageIdx < skill.stages.length - 1;
      $('#d-card').innerHTML = `
        <div class="summary">
          <p class="eyebrow">${skill.title} · Stage ${stageIdx + 1}</p>
          <h2>${mastered ? (newlyMastered ? 'Stage mastered' : 'Still solid') : 'Good practice — not mastered yet'}</h2>
          <p>${why}</p>
          ${mastered ? (hasNextStage ? `<p class="muted">Stage ${stageIdx + 2} is open: <b>${skill.stages[stageIdx + 1].t}</b>.</p>` : '') : `<p class="muted">Mastery means it’s automatic. Repeat the round; the items you missed will come up more often.</p>`}
          ${missed.length && !skill.generated ? `<p class="small">Keep an eye on: ${missed.map((m) => `<span class="pill">${skill.label(m)}</span>`).join(' ')}</p>` : ''}
          <div class="sum-actions">
            ${sess && nextStep >= 0 ? `<button class="btn primary" id="s-next">Next: ${PP.SkillById[sess.plan.steps[nextStep].skill].title} →</button>` : ''}
            ${sess && nextStep < 0 ? `<button class="btn primary" id="s-home">Session complete — back to plan</button>` : ''}
            ${hasNextStage ? `<button class="btn ${sess ? 'soft' : 'primary'}" id="s-stage">Try stage ${stageIdx + 2}</button>` : ''}
            <button class="btn ${!sess && !hasNextStage ? 'primary' : 'soft'}" id="s-again">Another round</button>
            ${sess ? '' : '<button class="btn ghost" id="s-back">Back to plan</button>'}
          </div>
        </div>`;
      $('#d-prog').innerHTML = '';
      const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = fn; };
      on('s-next', () => this.startSession(nextStep, sess.plan));
      on('s-home', () => show('home'));
      on('s-stage', () => this.start(skill.id, stageIdx + 1, s.opts));
      on('s-again', () => this.start(skill.id, stageIdx, s.opts));
      on('s-back', () => show('home'));
      this.s.q = null;
    },
  };
  PP.Runner = Runner;
  PP.Input.on((ev) => Runner.onInput(ev));

  // ---------- Free play ----------
  let exploreOff = null;
  function renderExplore() {
    const root = $('#v-explore');
    root.innerHTML = `
      <div class="explore">
        <div class="drill-top"><button class="btn ghost sm" data-go="home">← Plan</button><div class="dt-title"><b>Free play</b><span class="muted small">Play anything. Hold several keys to name the chord.</span></div></div>
        <div class="qcard">
          <div class="ex-name" id="ex-name">Play something…</div>
          <div class="ex-notes muted" id="ex-notes"></div>
          <div class="staff-slot" id="ex-staff"></div>
          <p class="muted small">Tip for playing by ear: hum a tune, find its first note here, then hunt for each next note. When you hold a chord, its name appears above.</p>
        </div>
      </div>`;
    const draw = () => {
      if (document.body.dataset.view !== 'explore') return;
      const held = PP.Input.heldMidis();
      const M = PP.M;
      const id = M.identify(held);
      let notes;
      if (id) {
        const tones = M.chordNotes(M.parse(id.rootName + '4'), id.type);
        notes = held.map((m) => { const t = tones.find((x) => M.pc(x.midi) === M.pc(m)); return (t && M.noteFromLetterMidi(t.letter, m)) || M.spell(m, 0); });
      } else {
        notes = [];
        held.forEach((m) => { let n = M.spell(m, 0); const p = notes[notes.length - 1]; if (p && M.stepOf(p) === M.stepOf(n)) n = M.spell(m, 0, 'flat'); notes.push(n); });
      }
      $('#ex-name').textContent = id ? id.name : held.length ? notes.map((n) => M.nameOf(n, true)).join('  ') : 'Play something…';
      $('#ex-notes').textContent = id ? `${id.inversion} · ${notes.map((n) => M.nameOf(n, true)).join(' ')}` : '';
      PP.Staff.render($('#ex-staff'), { clef: 'grand', items: held.length ? [{ kind: 'note', notes, dur: 'w' }] : [], minWidth: 160, label: 'Notes you are holding' });
    };
    if (exploreOff) exploreOff();
    exploreOff = PP.Input.on(draw);
    draw();
  }

  // ---------- Settings ----------
  function renderSettings() {
    const root = $('#v-settings');
    const lat = store.pref('latencyMs', 0);
    const tempo = store.pref('tempo', 1);
    root.innerHTML = `
      <div class="settings">
        <div class="drill-top"><button class="btn ghost sm" data-go="home">← Plan</button><div class="dt-title"><b>Settings</b></div></div>
        <section class="qcard set">
          <h3>Timing calibration</h3>
          <p class="muted">Bluetooth and tablet speakers add a small delay. Tap any piano key on each of the 8 clicks, and the rhythm and sight-reading scores will allow for it.</p>
          <p>Current offset: <b id="lat-val">${Math.round(lat)} ms</b></p>
          <div class="row"><button class="btn primary" id="cal">Calibrate</button><button class="btn ghost" id="cal-reset">Reset to 0</button></div>
          <p class="feedback" id="cal-msg"></p>
        </section>
        <section class="qcard set">
          <h3>Tempo for rhythm and sight-reading</h3>
          <div class="seg" role="radiogroup">
            ${[[0.8, 'Slower'], [1, 'Normal'], [1.15, 'Faster']].map(([v, l]) => `<button class="segb${tempo === v ? ' on' : ''}" data-tempo="${v}" role="radio" aria-checked="${tempo === v}">${l}</button>`).join('')}
          </div>
        </section>
        <section class="qcard set">
          <h3>On-screen keys</h3>
          <label class="tog"><input type="checkbox" id="names" ${PP.Keys.showNames ? 'checked' : ''}> Show note names on the on-screen keys</label>
          <p class="muted small">Leave this off while you learn to read; names on the keys make the reading drills too easy.</p>
        </section>
        <section class="qcard set">
          <h3>Progress</h3>
          <p class="muted">Progress is saved on this device, in this browser.</p>
          <div class="row"><button class="btn ghost danger" id="reset">Reset all progress</button></div>
          <div class="row" id="reset-confirm" hidden><span>Delete every stage and streak? This can’t be undone.</span><button class="btn danger" id="reset-yes">Yes, reset</button><button class="btn ghost" id="reset-no">Cancel</button></div>
        </section>
      </div>`;
    $('#names').onchange = (e) => { PP.Keys.showNames = e.target.checked; store.setPref('names', e.target.checked); PP.Keys.relabel(); };
    root.querySelectorAll('[data-tempo]').forEach((b) => { b.onclick = () => { store.setPref('tempo', parseFloat(b.dataset.tempo)); renderSettings(); }; });
    $('#cal-reset').onclick = () => { store.setPref('latencyMs', 0); $('#lat-val').textContent = '0 ms'; };
    $('#reset').onclick = () => { $('#reset-confirm').hidden = false; };
    $('#reset-no').onclick = () => { $('#reset-confirm').hidden = true; };
    $('#reset-yes').onclick = () => {
      const prefs = store.data.prefs;
      store.data = { v: 1, skills: {}, items: {}, days: {}, prefs, session: null };
      store.save();
      show('home');
    };
    $('#cal').onclick = () => calibrate();
  }
  let calibrating = false;
  function calibrate() {
    if (calibrating) return;
    calibrating = true;
    const msg = $('#cal-msg');
    const S = PP.Sound; const ctx = S.ensure();
    const bpm = 90, beat = 60 / bpm, n = 8, lead = 4;
    const t0 = ctx.currentTime + 0.4;
    for (let i = 0; i < lead + n; i++) S.click(t0 + i * beat, i < lead ? i === 0 : true);
    const start = S.perfAt(t0);
    const offs = [];
    msg.textContent = 'Listen to 4 clicks, then tap along with the next 8.';
    msg.className = 'feedback info';
    $('#cal').disabled = true;
    const off = PP.Input.on((ev) => {
      if (ev.type !== 'on') return;
      const k = (ev.t - start) / (beat * 1000);
      const nearest = Math.round(k);
      if (nearest >= lead && nearest < lead + n) offs.push(ev.t - (start + nearest * beat * 1000));
    });
    setTimeout(() => {
      off();
      calibrating = false;
      if (!$('#cal')) return;
      $('#cal').disabled = false;
      if (offs.length < 5) { msg.textContent = `Only ${offs.length} taps heard. Try again and tap on every click.`; msg.className = 'feedback bad'; return; }
      offs.sort((a, b) => a - b);
      const med = offs[Math.floor(offs.length / 2)];
      const v = Math.max(-150, Math.min(400, med));
      store.setPref('latencyMs', v);
      $('#lat-val').textContent = Math.round(v) + ' ms';
      msg.textContent = `Saved. Your taps landed ${Math.round(Math.abs(med))} ms ${med >= 0 ? 'after' : 'before'} the clicks on average.`;
      msg.className = 'feedback good';
    }, ((lead + n) * beat + 1.2) * 1000);
  }

  // ---------- Connect sheet ----------
  function openSheet() {
    const sh = $('#sheet');
    sh.hidden = false;
    renderSheet();
    $('#sheet .sheet-panel').focus();
  }
  function closeSheet() { $('#sheet').hidden = true; }
  function renderSheet() {
    const st = PP.Input.status;
    const btOk = PP.Input.btSupported();
    const desktop = !/Android|iPhone|iPad/i.test(navigator.userAgent);
    const noBt = navigator.brave
      ? 'Brave turns Bluetooth off for websites. Open this page in Google Chrome or Microsoft Edge instead (or turn on “Web Bluetooth API” at brave://flags and restart Brave).'
      : desktop ? 'This browser can’t use Bluetooth. Open this page in Google Chrome or Microsoft Edge.' : 'Bluetooth isn’t available here. Use Chrome on Android and open the app from its https:// address.';
    const midiOk = PP.Input.midiSupported();
    $('#sheet-body').innerHTML = `
      <div class="conn-state ${st.kind}">
        <span class="led"></span>
        <div><b>${st.kind === 'bt' ? 'Connected over Bluetooth' : st.kind === 'midi' ? 'Connected by USB' : st.kind === 'connecting' ? 'Connecting…' : 'Not connected'}</b>
        <span class="muted small">${st.name || ''}${st.msg ? ' · ' + st.msg : ''}</span></div>
      </div>
      <div class="conn-opts">
        <div class="copt">
          <h3>Bluetooth piano</h3>
          <ol class="small muted">
            <li>Switch on the piano’s Bluetooth (MIDI) and keep it near the tablet.</li>
            <li>Don’t pair it in Android Settings — connect from here instead.</li>
            <li>If Chrome asks for “Nearby devices” or Location, allow it; that’s how Android scans for Bluetooth.</li>
          </ol>
          <div class="row">
            <button class="btn primary" id="c-bt" ${btOk ? '' : 'disabled'}>Find my piano</button>
            <button class="btn ghost sm" id="c-bt-all" ${btOk ? '' : 'disabled'}>Show all devices</button>
            ${st.kind === 'bt' ? '<button class="btn ghost sm" id="c-bt-off">Disconnect</button>' : ''}
          </div>
          ${btOk ? '' : `<p class="small bad-text">${noBt}</p>`}
          <p class="small bad-text" id="c-bt-off-msg" hidden>Bluetooth is switched off on this device. Turn it on in the system settings, then try again.</p>
        </div>
        <div class="copt">
          <h3>USB cable</h3>
          <p class="small muted">Piano’s “USB to Host” port → USB cable → OTG adapter → tablet.</p>
          <button class="btn soft" id="c-midi" ${midiOk ? '' : 'disabled'}>Connect USB MIDI</button>
        </div>
        <div class="copt">
          <h3>No piano right now?</h3>
          <p class="small muted">Use the on-screen keys at the bottom of the screen. On a laptop, the keys A W S E D F T G Y H U J K play C4 to C5 (Z and X change octave).</p>
        </div>
      </div>
      <p class="feedback" id="c-msg"></p>`;
    const msg = (t, tone) => { const m = $('#c-msg'); m.textContent = t; m.className = 'feedback ' + (tone || ''); };
    if (btOk && navigator.bluetooth.getAvailability) navigator.bluetooth.getAvailability().then((ok) => { const w = $('#c-bt-off-msg'); if (w) w.hidden = ok; }).catch(() => {});
    const bt = async (all) => {
      try { PP.Sound.ensure(); msg('Looking for your piano…', 'info'); await PP.Input.connectBluetooth(all); msg('Connected. Play a key to check.', 'good'); setTimeout(closeSheet, 900); }
      catch (e) {
        if (e && e.name === 'NotFoundError') msg(all ? 'No device chosen.' : `No Bluetooth MIDI piano chosen or found. Check that: the piano’s Bluetooth MIDI is switched on (see its manual); it isn’t connected to another phone, tablet or app, since Bluetooth MIDI talks to one device at a time; and it isn’t paired in ${desktop ? 'Windows' : 'Android'} Bluetooth settings (remove it there if it is). Then try again, or use “Show all devices”.${desktop ? ' On a computer, a USB cable is the most reliable option.' : ''}`, 'bad');
        else if (e && e.name === 'SecurityError') msg('Chrome blocked Bluetooth here. Open the app from its https:// address in Chrome (not inside another app).', 'bad');
        else msg((e && e.message) || 'Couldn’t connect.', 'bad');
        if (PP.Input.status.kind === 'connecting') PP.Input.setStatus({ kind: 'none' });
      }
    };
    const b1 = $('#c-bt'); if (b1) b1.onclick = () => bt(false);
    const b2 = $('#c-bt-all'); if (b2) b2.onclick = () => bt(true);
    const b3 = $('#c-bt-off'); if (b3) b3.onclick = () => { PP.Input.disconnectBluetooth(); renderSheet(); };
    $('#c-midi').onclick = async () => {
      try { const ok = await PP.Input.connectMidi(); msg(ok ? 'Connected. Play a key to check.' : PP.Input.status.msg, ok ? 'good' : 'bad'); if (ok) setTimeout(closeSheet, 900); }
      catch (e) { msg((e && e.message) || 'Couldn’t open MIDI.', 'bad'); }
    };
  }

  // ---------- Boot ----------
  function boot() {
    store.load();
    PP.Keys.showNames = store.pref('names', false);
    PP.Keys.mount($('#kbd'));
    setTimeout(() => PP.Keys.focus(60), 50);
    const dockOpen = store.pref('dock', true);
    document.body.classList.toggle('dock-closed', !dockOpen);
    $('#kbToggle').setAttribute('aria-expanded', String(dockOpen));
    $('#kbToggle').onclick = () => {
      const open = document.body.classList.toggle('dock-closed') === false;
      $('#kbToggle').setAttribute('aria-expanded', String(open));
      store.setPref('dock', open);
    };
    const octScroll = (dir) => { const r = $('#kbd'); r.scrollBy({ left: dir * (r.scrollWidth / 29) * 7, behavior: 'smooth' }); };
    $('#octDown').onclick = () => octScroll(-1);
    $('#octUp').onclick = () => octScroll(1);
    $('#homeBtn').onclick = () => show('home');
    $('#setBtn').onclick = () => show('settings');
    $('#connBtn').onclick = openSheet;
    $('#sheet-close').onclick = closeSheet;
    $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

    PP.Input.onStatus((st) => {
      const b = $('#connBtn');
      b.dataset.kind = st.kind;
      $('#connText').textContent = st.kind === 'bt' || st.kind === 'midi' ? (st.name || 'Piano connected') : st.kind === 'connecting' ? 'Connecting…' : 'Connect piano';
      if (!$('#sheet').hidden) renderSheet();
      if (document.body.dataset.view === 'home') renderHome();
    });
    PP.Input.on((ev) => {
      const held = PP.Input.heldMidis();
      const id = held.length >= 3 ? PP.M.identify(held) : null;
      $('#heldNames').textContent = held.length ? (id ? id.name + ' · ' : '') + held.map((m) => PP.M.midiName(m, 0, undefined, true)).join(' ') : '';
    });
    show('home');
    if (store.pref('lastConn') === 'bt') PP.Input.tryAutoReconnect();
    else if (store.pref('lastConn') === 'midi') PP.Input.connectMidi().catch(() => {});
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
