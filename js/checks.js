/* Brick Bonk: the headless checks, the same in Node (`node tools/check.js`) and in the page (`game.check()`).
   Each check also runs a sabotaged version that must fail, so a pass means something:

   1. autopilot: the autopilot clears every level on EASY, 1 player (three seeds) and 2 players, within 300 s (5 minutes) each.
      Sabotage: an autopilot that never moves must clear nothing.
   2. tunnelling: at top speed (and at twice top speed), with BIG BALL and MULTI-BALL mixed in, every straight piece
      of every ball's path is checked against every block still standing and the walls. Not one may overlap.
      Sabotage: a mover without the swept test (move, then look for overlaps) must get caught.
   3. loops: the dullest player (always catches the ball dead centre, so it goes straight back up) on NORMAL: never
      more than 2 straight-up-and-down bounces in a row, no flat bounces, never 30 s without a block.
      Sabotage: with the nudges and the 15-degree rule switched off, the same player must get caught.
   4. frame rate: the same launch, driven through the fixed-step runner at 30, 60 and 120 frames a second, ends the
      same way (same step, score, blocks and lives). Sabotage: stepping by the frame time instead must differ. */
(function (root) {
  'use strict';
  const BB = root.BB;

  function makeBots(sim, o) { return sim.paddles.map((p) => new BB.Bot(sim, p, Object.assign({ seed: o.seed || 1 }, o.bot))); }
  function botInput(bots, dt) { const inp = {}; for (const b of bots) inp[b.p.id] = b.input(dt); return inp; }

  // Play level i with the autopilot until it's cleared, lost or the time runs out.
  function play(i, o = {}) {
    const sim = new BB.Sim(BB.LEVELS[i], Object.assign({ index: i, seed: o.seed || 1, easy: true }, o.sim));
    const bots = makeBots(sim, o);
    const limit = o.limit || 240;
    let t = 0;
    while (t < limit) {
      if (o.each) o.each(sim, t);
      sim.step(BB.DT, botInput(bots, BB.DT));
      sim.events.length = 0;
      t += BB.DT;
      if (sim.state === 'clear' || sim.state === 'done') return { cleared: true, t, sim };
      if (sim.state === 'over') return { cleared: false, over: true, t, sim };
    }
    return { cleared: false, t, sim };
  }

  const fmt = (n) => n.toFixed(1);

  function checkLevels() {
    const errs = [];
    if (BB.LEVELS.length < 15) errs.push(`only ${BB.LEVELS.length} levels`);
    BB.LEVELS.forEach((def, i) => {
      try {
        const L = BB.parseLevel(def);
        if (!L.bricks.some((k) => k.kind !== 's')) errs.push(`level ${i + 1}: nothing to break`);
      } catch (e) { errs.push(`level ${i + 1}: ${e.message}`); }
      if (!def.name || !def.tip) errs.push(`level ${i + 1}: no name or tip`);
    });
    return errs;
  }

  function autopilot(o = {}) {
    const rows = [];
    const runs = o.quick ? [{ seed: 1 }] : [{ seed: 1 }, { seed: 2 }, { seed: 3 }, { seed: 4, mode: '2p' }];
    BB.LEVELS.forEach((def, i) => {
      for (const r of runs) {
        const res = play(i, { seed: r.seed, sim: { mode: r.mode || '1p', easy: true, noHoming: o.noHoming }, bot: o.bot, limit: o.limit || 300 });
        rows.push({ level: i + 1, seed: r.seed, mode: r.mode || '1p', cleared: res.cleared, t: res.t, misses: res.sim.misses, stars: res.sim.stars });
      }
    });
    return rows;
  }

  function tunnelling(o = {}) {
    const out = [];
    const speeds = o.speeds || [BB.DIFF.normal.max, BB.DIFF.normal.max * 2];
    for (const speed of speeds) {
      let violations = 0, segs = 0, hits = 0, first = null;
      BB.LEVELS.forEach((def, i) => {
        if (o.quick && i % 3) return;
        const res = play(i, {
          seed: 11 + i, limit: o.limit || 45,
          sim: { easy: false, audit: true, naive: !!o.naive, speed },
          each: (sim, t) => {
            const k = Math.floor(t / BB.DT);
            if (k % 960 === 480) sim.bigT = 2;                 // a BIG BALL now and then
            if (k % 1440 === 240 && sim.balls.some((b) => !b.stuck)) sim.applyPup('multi', sim.paddles[0]);
            if (sim.state === 'oops' || sim.state === 'over') { sim.lives = 9; }
          },
        });
        const v = res.sim.stats.violations;
        violations += v.length;
        if (v.length && !first) first = Object.assign({ level: i + 1 }, v[0]);
        segs += res.sim.stats.segs;
        hits += res.sim.bricks.filter((k) => !k.alive).length;
      });
      out.push({ speed, violations, segs, broken: hits, first });
    }
    return out;
  }

  function loops(o = {}) {
    const rows = [];
    BB.LEVELS.forEach((def, i) => {
      if (o.quick && i % 3) return;
      const res = play(i, {
        seed: 21 + i, limit: o.limit || 150, bot: { statue: true },
        sim: { easy: false, noNudge: !!o.sabotage, noMinAngle: !!o.sabotage },
        each: (sim) => { if (sim.state === 'oops') sim.lives = 9; },
      });
      const st = res.sim.stats;
      rows.push({ level: i + 1, cleared: res.cleared, t: res.t, maxVertRun: st.maxVertRun, flat: st.flat, maxGap: st.maxGap, bounces: st.bounces });
    });
    // a ball sent off almost flat: the first bounce must make it steeper
    const sim = new BB.Sim(BB.LEVELS[0], { seed: 5, noMinAngle: !!o.sabotage, noNudge: !!o.sabotage });
    const bots = makeBots(sim, {});
    sim.release(sim.balls[0]);
    const b = sim.balls[0];
    b.x = 6; b.y = 12; b.vx = sim.spd * 0.998; b.vy = sim.spd * 0.06;
    for (let t = 0; t < 8; t += BB.DT) { sim.step(BB.DT, botInput(bots, BB.DT)); sim.events.length = 0; if (sim.state !== 'play') break; }
    rows.flatLaunch = { flat: sim.stats.flat, bounces: sim.stats.bounces };
    return rows;
  }

  // The same launch at different frame rates. With the runner (fixed steps) the result must be identical.
  // Two players: "still" launches on the first step and never moves (it ends when the ball gets past), and the
  // autopilot, which plays for up to 60 s.
  function frameRates(o = {}) {
    const levels = o.levels || [0, 4, 10, 16];
    const out = [];
    for (const i of levels) for (const who of ['still', 'bot']) {
      const ends = [];
      for (const fps of [30, 60, 120]) {
        const sim = new BB.Sim(BB.LEVELS[i], { index: i, seed: 99, easy: false });
        const bots = makeBots(sim, { seed: 3 });
        let first = true;
        const input = (dt) => {
          if (who === 'bot') return botInput(bots, dt);
          const go = first;
          first = false;
          return { [sim.paddles[0].id]: { launch: go } };
        };
        const run = new BB.Runner(sim);
        const frame = 1 / fps;
        let end = null;
        for (let f = 0; f < fps * 60 && !end; f++) {
          if (o.sabotage) sim.step(frame, input(frame));
          else run.advance(frame, () => input(BB.DT));
          sim.events.length = 0;
          if (sim.state === 'clear' || sim.state === 'oops' || sim.state === 'over') end = sim.state;
        }
        ends.push({
          // when it ended (the state's start, not the end of the frame it happened in)
          fps, end: end || 'still playing', t: +(end ? sim.t - sim.stateT : sim.t).toFixed(4), score: sim.score, left: sim.left, lives: sim.lives,
          balls: sim.balls.map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)}`).join(' '),
        });
      }
      const key = (e) => [e.end, e.t, e.score, e.left, e.lives, e.balls].join('|');
      out.push({ level: i + 1, who, same: ends.every((e) => key(e) === key(ends[0])), ends });
    }
    return out;
  }

  // Everything, with a pass / fail line for each part and each sabotaged version.
  function run(o = {}) {
    const lines = [], fails = [];
    const say = (ok, text) => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) fails.push(text); };
    const t0 = Date.now();

    const lv = checkLevels();
    say(!lv.length, `levels: ${BB.LEVELS.length} levels, maps ok${lv.length ? ': ' + lv.join('; ') : ''}`);

    const ap = autopilot({ quick: o.quick });
    const notCleared = ap.filter((r) => !r.cleared);
    const worst = ap.reduce((m, r) => Math.max(m, r.t), 0);
    say(!notCleared.length, `autopilot: ${ap.length - notCleared.length}/${ap.length} runs cleared on EASY (slowest ${fmt(worst)} s, limit 300 s)` +
      (notCleared.length ? ' NOT: ' + notCleared.map((r) => `L${r.level}/${r.mode}/seed${r.seed}`).join(' ') : ''));
    lines.push('      per level (seed 1, s): ' + ap.filter((r) => r.seed === 1).map((r) => `${r.level}:${fmt(r.t)}`).join(' '));
    const idle = autopilot({ quick: true, bot: { idle: true }, limit: 60 });
    say(idle.every((r) => !r.cleared), `autopilot sabotage: an autopilot that never moves cleared ${idle.filter((r) => r.cleared).length}/${idle.length} (must be 0)`);

    const tn = tunnelling({ quick: o.quick });
    for (const r of tn) say(r.violations === 0 && r.segs > 20000 && r.broken > 100,
      `tunnelling at ${fmt(r.speed)} u/s: ${r.violations} overlaps in ${r.segs} pieces of path, ${r.broken} blocks broken`);
    const tnBad = tunnelling({ quick: true, naive: true, speeds: [BB.DIFF.normal.max * 2] });
    say(tnBad[0].violations > 0, `tunnelling sabotage: the mover without the sweep got caught ${tnBad[0].violations} times (must be > 0)` +
      (tnBad[0].first ? `, first on level ${tnBad[0].first.level} (${tnBad[0].first.what})` : ''));

    const lp = loops({ quick: o.quick });
    const vr = Math.max(...lp.map((r) => r.maxVertRun)), fl = lp.reduce((s, r) => s + r.flat, 0), gap = Math.max(...lp.map((r) => r.maxGap));
    say(vr <= 2 && fl === 0 && gap <= 30 && lp.flatLaunch.flat === 0,
      `loops: dead-centre player, at most ${vr} straight-up bounces in a row, ${fl} flat bounces, longest wait for a block ${fmt(gap)} s; ` +
      `flat launch: ${lp.flatLaunch.flat} flat bounces; ${lp.filter((r) => r.cleared).length}/${lp.length} levels cleared anyway`);
    const lpBad = loops({ quick: true, sabotage: true });
    const vrB = Math.max(...lpBad.map((r) => r.maxVertRun)), gapB = Math.max(...lpBad.map((r) => r.maxGap));
    say(vrB > 2 && gapB > 30 && lpBad.flatLaunch.flat > 0,
      `loops sabotage: without the nudges, ${vrB} straight-up bounces in a row and ${fmt(gapB)} s without a block; flat launch ${lpBad.flatLaunch.flat} flat bounces (all must be caught)`);

    const fr = frameRates({ levels: o.quick ? [0, 10] : undefined });
    say(fr.every((r) => r.same), `frame rate: the same launch ends the same way at 30, 60 and 120 fps (${fr.length} runs)`);
    lines.push('      ' + fr.map((r) => `L${r.level} ${r.who}: ${r.ends[0].end} at ${r.ends[0].t} s, ${r.ends[0].score} pts`).join('; '));
    const frBad = frameRates({ levels: [0, 10], sabotage: true });
    say(frBad.some((r) => !r.same), `frame rate sabotage: stepping by the frame time gave ${frBad.filter((r) => !r.same).length}/${frBad.length} different endings (must be > 0)`);

    lines.push(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    return { ok: !fails.length, fails, lines, ap, tn, lp, fr };
  }

  BB.checks = { play, checkLevels, autopilot, tunnelling, loops, frameRates, run };
})(typeof window !== 'undefined' ? window : globalThis);
