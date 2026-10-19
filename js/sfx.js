/* Brick Bonk: sound effects, all synthesised with Kit.sound.tone and Kit.sound.hiss (no audio files), so they follow
   the kit's one sound switch. Exposes BB.sfx. Every effect is silent until Kit.sound.init() runs on the first tap or key.
   Blocks play notes: each block in a run (before the ball comes back to the trampoline) is one step up a happy
   scale, so a ball bouncing around up top plays a little tune. */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const S = Kit.sound;
  const { tone, hiss } = S;
  const notes = (list, o = {}) => list.forEach((f, i) => tone({ type: o.type || 'triangle', f, at: (o.at || 0) + i * (o.gap || 0.07), dur: o.dur || 0.16, vol: o.vol || 0.12 }));
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
  let lastBoom = 0;

  BB.sfx = {
    // the trampoline: a springy boing
    paddle(u) {
      const f = 190 + Math.abs(u) * 60;
      tone({ type: 'sine', f, to: f * 2.6, dur: 0.18, vol: 0.22 });
      tone({ type: 'triangle', f: f * 2, to: f * 4, dur: 0.08, vol: 0.05, at: 0.02 });
    },
    // a toy block: a woody "tok" on the next note up
    brick(combo) {
      const f = SCALE[Math.min(SCALE.length - 1, Math.max(0, combo - 1))];
      tone({ type: 'square', f, dur: 0.07, vol: 0.06, lp: 2600 });
      tone({ type: 'triangle', f: f / 2, to: f / 2.4, dur: 0.1, vol: 0.12 });
      hiss({ filter: 'bandpass', f: 1800, q: 3, dur: 0.03, vol: 0.06 });
    },
    // a tough block that isn't broken yet: a duller clunk
    tough() {
      tone({ type: 'triangle', f: 220, to: 160, dur: 0.12, vol: 0.18 });
      hiss({ filter: 'bandpass', f: 900, q: 2, dur: 0.05, vol: 0.08 });
    },
    // steel: clang
    steel() {
      tone({ type: 'square', f: 1250, to: 1180, dur: 0.22, vol: 0.035, lp: 4200 });
      tone({ type: 'sine', f: 2520, dur: 0.3, vol: 0.04 });
      tone({ type: 'sine', f: 3770, dur: 0.18, vol: 0.02 });
    },
    wall() { tone({ type: 'triangle', f: 330, to: 300, dur: 0.05, vol: 0.04 }); },
    boom() {
      const now = performance.now();
      if (now - lastBoom < 90) return; // a chain of TNT: not all at once
      lastBoom = now;
      hiss({ filter: 'lowpass', f: 2600, to: 160, dur: 0.6, vol: 0.4 });
      tone({ type: 'sine', f: 140, to: 40, dur: 0.45, vol: 0.4 });
      tone({ type: 'sawtooth', f: 90, to: 50, dur: 0.25, vol: 0.06, lp: 600 });
    },
    launch() { tone({ type: 'sine', f: 300, to: 900, dur: 0.14, vol: 0.12 }); },
    stick() { tone({ type: 'sine', f: 500, to: 260, dur: 0.12, vol: 0.12 }); hiss({ filter: 'lowpass', f: 700, dur: 0.08, vol: 0.06 }); },
    pupDrop() { notes([1319, 1568], { gap: 0.06, vol: 0.06 }); },
    pup() { S.powerup(); },
    // the ball got past: a slide whistle down and a soft pop
    drop() {
      tone({ type: 'sine', f: 900, to: 220, dur: 0.45, vol: 0.12 });
      hiss({ filter: 'highpass', f: 2500, dur: 0.06, vol: 0.08, at: 0.42 });
    },
    lost() {
      tone({ type: 'triangle', f: 392, dur: 0.18, vol: 0.12 });
      tone({ type: 'triangle', f: 330, dur: 0.18, vol: 0.12, at: 0.2 });
      tone({ type: 'triangle', f: 262, dur: 0.35, vol: 0.12, at: 0.4 });
    },
    netSave() {
      tone({ type: 'sine', f: 240, to: 700, dur: 0.25, vol: 0.18 });
      tone({ type: 'sine', f: 700, to: 1100, dur: 0.12, vol: 0.06, at: 0.08 });
      hiss({ filter: 'highpass', f: 3500, dur: 0.05, vol: 0.06 });
    },
    clear() { notes([523, 659, 784, 1047, 784, 1047, 1319], { gap: 0.1, dur: 0.24, vol: 0.13 }); },
    star(i) { tone({ type: 'triangle', f: [1047, 1319, 1568][i] || 1568, dur: 0.3, vol: 0.12 }); tone({ type: 'sine', f: ([1047, 1319, 1568][i] || 1568) * 2, dur: 0.2, vol: 0.04 }); },
    homing() { notes([1568, 1760, 2093], { gap: 0.05, vol: 0.05, type: 'sine' }); },
    highfive() {
      hiss({ f: 1800, q: 1.2, dur: 0.07, vol: 0.4 });
      hiss({ f: 2400, q: 1.2, dur: 0.05, vol: 0.2, at: 0.05 });
      notes([659, 880, 1109, 1319], { gap: 0.06, vol: 0.1, at: 0.12 });
    },
    buddyIn() { tone({ type: 'sine', f: 400, to: 1200, dur: 0.35, vol: 0.1 }); hiss({ f: 1200, to: 3000, dur: 0.35, vol: 0.05 }); },
    buddyOut() { tone({ type: 'sine', f: 1200, to: 400, dur: 0.35, vol: 0.08 }); },
    gift() { S.coin(4); notes([1047, 1319], { gap: 0.08, vol: 0.08, at: 0.15 }); },
    extraBall() { notes([784, 1047, 1319], { gap: 0.06, vol: 0.1 }); },
    over() { notes([392, 370, 349, 330], { gap: 0.22, dur: 0.3, vol: 0.1 }); },
    click() { S.click(); },
    start() { S.powerup(); },
  };
})();
