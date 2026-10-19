/* Brick Bonk: poses on top of Kit.people.pose. Exposes BB.pose(p, phase, mode, k, opts).
   Extra modes: 'carry' (both arms straight up, holding the trampoline over his head; walks when opts.moving),
   'oops' (hands on his head), 'cheer' (both fists up), 'hold' (the buddy's bubble wand held up in one hand),
   'stand'. Standing signature moves ('peace', 'wave') keep their legs still. */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const People = Kit.people;
  const STILL_LEGS = { peace: 1, wave: 1, give: 1 };
  const ease = (o, prop, v, k) => { o[prop] += (v - o[prop]) * k; };

  BB.pose = function (p, ph, mode, k, opts = {}) {
    if (mode === 'carry') {
      People.pose(p, ph, opts.moving ? 'walk' : 'idle', k);
      ease(p.armL.rotation, 'x', 3.0, k);
      ease(p.armR.rotation, 'x', 3.0, k);
      ease(p.armL.rotation, 'z', -0.22, k);
      ease(p.armR.rotation, 'z', 0.22, k);
      ease(p.hips.rotation, 'x', 0.04, k);
      ease(p.head.rotation, 'x', -0.12, k);
      if (!opts.moving) p.hips.position.y = p.hipY + Math.sin(ph * 0.6) * 0.012;
      return;
    }
    if (mode === 'oops') {
      People.pose(p, ph, 'idle', k);
      ease(p.armL.rotation, 'x', 2.7, k);
      ease(p.armR.rotation, 'x', 2.7, k);
      ease(p.armL.rotation, 'z', -0.85, k);
      ease(p.armR.rotation, 'z', 0.85, k);
      ease(p.head.rotation, 'x', 0.3, k);
      ease(p.hips.rotation, 'x', -0.1, k);
      return;
    }
    if (mode === 'cheer') {
      People.pose(p, ph, 'jump', k);
      ease(p.armL.rotation, 'x', 2.9, k);
      ease(p.armR.rotation, 'x', 2.9, k);
      ease(p.armL.rotation, 'z', -0.35, k);
      ease(p.armR.rotation, 'z', 0.35, k);
      ease(p.legL.rotation, 'x', 0, k);
      ease(p.legR.rotation, 'x', 0, k);
      return;
    }
    if (mode === 'hold') {
      People.pose(p, ph, opts.moving ? 'walk' : 'idle', k);
      ease(p.armR.rotation, 'x', 2.5, k);
      ease(p.armR.rotation, 'z', 0.15, k);
      ease(p.armL.rotation, 'x', 0.2 + Math.sin(ph) * 0.1, k);
      return;
    }
    if (mode === 'stand') {
      People.pose(p, ph, 'idle', k);
      ease(p.armL.rotation, 'z', -0.1, k);
      ease(p.armR.rotation, 'z', 0.1, k);
      return;
    }
    People.pose(p, ph, mode, k);
    if (STILL_LEGS[mode] && !opts.moving) {
      p.legL.rotation.x *= 0.25;
      p.legR.rotation.x *= 0.25;
      p.hips.position.y = p.hipY + Math.abs(Math.sin(ph)) * 0.03;
    }
  };
})();
