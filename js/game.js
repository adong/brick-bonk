/* Brick Bonk: everything around the simulation. Screens, keyboard, mouse and finger input, the HUD, the companion
   button, toasts, saving progress and stars, the title-screen demo, and test hooks on window.game. */
(function () {
  'use strict';
  const BB = window.BB, S = Kit.sound;
  const { DT, W } = BB;
  const $ = (id) => document.getElementById(id);
  const NAME = { teddy: 'TEDDY', tommy: 'TOMMY', both: 'TEDDY & TOMMY' };
  const cls = (who) => (who === 'tommy' ? 'm' : 't');
  const PUP_ICON = { wide: '↔️', multi: '✨', slow: '🐢', sticky: '🍯', net: '🫧', big: '💥' };
  const PUP_TOAST = { wide: 'WIDE TRAMPOLINE!', multi: 'MULTI-BALL!', slow: 'SLOW BALL!', sticky: 'STICKY!', net: 'BUBBLE NET!', big: 'BIG BALL!' };

  // ---------------------------------------------------------------- saving
  const SAVE_KEY = 'brickBonk.v1';
  const save = { reached: { easy: 1, normal: 1 }, stars: { easy: {}, normal: {} }, best: { easy: 0, normal: 0 }, hero: 'teddy', easy: true, all: false };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
  const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } };
  const dkey = () => (G.easy ? 'easy' : 'normal');

  const view = new BB.View($('scene'));
  const faces = Kit.portraits([Kit.roster.get('teddy'), Kit.roster.get('tommy')], { size: 160 });

  const G = {
    screen: 'title', mode: '1p', hero: save.hero === 'tommy' ? 'tommy' : 'teddy', easy: save.easy !== false,
    level: 0, startLevel: 0, sim: null, runner: null, demo: null, held: false, keepAwake: false,
    toasts: [], fade: null, overT: 0, carry: null, touchOn: false, bannerT: 0, auto: null, stars: null,
  };

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const tapped = new Set(); // keys pressed since the last step: a quick tap still counts even if released before the next frame
  const aim = { teddy: null, tommy: null };   // where a finger or the mouse wants each trampoline (field units)
  const letGo = { teddy: false, tommy: false }; // a finger lifted: launch (or let go of a sticky ball)
  const ptrs = new Map();

  addEventListener('keydown', (e) => {
    S.init();
    if (/^Arrow|^Space$/.test(e.code)) e.preventDefault();
    const fresh = !keys.has(e.code);
    keys.add(e.code);
    tapped.add(e.code);
    if (fresh && !e.repeat) onKey(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  function onKey(code) {
    const sc = G.screen;
    if (code === 'KeyM') return toggleMute();
    if (sc === 'play') {
      if (code === 'KeyT' || code === 'Enter' || code === 'NumpadEnter') callBuddy();
      else if (code === 'KeyP' || code === 'Escape') pause();
    } else if (sc === 'pause') {
      if (code === 'KeyP' || code === 'Escape' || code === 'Space' || code === 'Enter') resume();
    } else if (sc === 'title') {
      if (code === 'Enter' || code === 'Space') startGame('1p', G.hero);
      else if (code === 'Digit2' || code === 'Numpad2') startGame('2p');
      else if (code === 'Digit1' || code === 'Numpad1') startGame('1p', G.hero);
      else if (code === 'ArrowLeft' || code === 'KeyA') pickHero('teddy');
      else if (code === 'ArrowRight' || code === 'KeyD') pickHero('tommy');
      else if (code === 'KeyE') setEasy(!G.easy);
    } else if (sc === 'clear') {
      if (code === 'Enter' || code === 'Space') nextLevel();
      else if (code === 'Escape') toTitle();
    } else if (sc === 'over') {
      if (code === 'Enter' || code === 'Space') keepGoing();
      else if (code === 'Escape') toTitle();
    } else if (sc === 'win') {
      if (code === 'Enter' || code === 'Space') startGame(G.mode, G.hero, 0);
      else if (code === 'Escape') toTitle();
    } else if (sc === 'levels' && code === 'Escape') show('title');
  }

  function inputs() {
    const k = (c) => (keys.has(c) || tapped.has(c) ? 1 : 0);
    const out = {};
    const one = (id, ax, launch) => {
      if (ax) aim[id] = null; // keys take over from the mouse until it moves again
      out[id] = { ax, x: aim[id], launch: !!(launch || letGo[id]) };
    };
    if (G.mode === '2p') {
      one('teddy', k('KeyD') - k('KeyA'), k('Space') || k('KeyW'));
      one('tommy', k('ArrowRight') - k('ArrowLeft'), k('Space') || k('ArrowUp'));
    } else {
      one(G.hero, (k('KeyD') || k('ArrowRight')) - (k('KeyA') || k('ArrowLeft')), k('Space') || k('KeyW') || k('ArrowUp'));
    }
    // game.autopilot(): the bot drives the real players (screenshots and demos)
    if (G.auto && G.auto.length && G.auto[0].sim === G.sim) for (const b of G.auto) out[b.p.id] = b.input(DT);
    return out;
  }

  // Fingers and the mouse. 1 player: the trampoline goes where the finger is (only sideways: it stays above the
  // finger, so the finger never hides it). 2 players: the left half of the screen is Teddy's, the right half Tommy's,
  // and each drags his own (a little faster than the finger, so half a screen reaches all the way across).
  // Lifting the finger (or a click) launches a waiting ball.
  function setupPointer() {
    const cv = $('scene');
    const clampX = (x) => Math.max(0, Math.min(W, x));
    cv.addEventListener('pointerdown', (e) => {
      S.init();
      if (e.pointerType === 'touch' && !G.touchOn) { G.touchOn = true; layoutHud(); }
      if (G.screen !== 'play' || !G.sim) return;
      const who = G.mode === '2p' ? (e.clientX < innerWidth / 2 ? 'teddy' : 'tommy') : G.hero;
      const p = G.sim.player(who);
      if (!p) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      ptrs.set(e.pointerId, { who, x0: e.clientX, px0: p.x });
      if (G.mode !== '2p') aim[who] = clampX(view.worldX(e.clientX));
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      const q = ptrs.get(e.pointerId);
      if (q) {
        aim[q.who] = clampX(G.mode === '2p' ? q.px0 + ((e.clientX - q.x0) / view.ppu) * 1.6 : view.worldX(e.clientX));
      } else if (e.pointerType === 'mouse' && G.mode === '1p' && G.screen === 'play') aim[G.hero] = clampX(view.worldX(e.clientX));
    });
    const end = (e, up) => {
      const q = ptrs.get(e.pointerId);
      if (!q) return;
      ptrs.delete(e.pointerId);
      if (up && G.screen === 'play') letGo[q.who] = true;
      if (e.pointerType !== 'mouse') aim[q.who] = null;
    };
    cv.addEventListener('pointerup', (e) => end(e, true));
    cv.addEventListener('pointercancel', (e) => end(e, false));
    if (matchMedia('(pointer: coarse)').matches) G.touchOn = true;
  }

  // ---------------------------------------------------------------- flow

  const SCREENS = ['title', 'levels', 'pause', 'clear', 'over', 'win'];
  function show(screen) {
    G.screen = screen;
    for (const id of SCREENS) $(id).classList.toggle('hidden', id !== screen);
    const playing = screen === 'play' || screen === 'pause' || screen === 'clear' || screen === 'over' || screen === 'win';
    $('hud').classList.toggle('hidden', !playing);
    S.music(screen === 'play' ? 'play' : screen === 'pause' ? 'pause' : screen === 'over' ? 'over' : 'title');
    if (screen !== 'play') { ptrs.clear(); aim.teddy = aim.tommy = null; }
    layoutHud();
  }

  function startGame(mode, hero, level) {
    S.init();
    BB.sfx.start();
    G.mode = mode;
    if (hero) { G.hero = hero; save.hero = hero; }
    save.easy = G.easy;
    store();
    G.carry = null;
    G.demo = null;
    G.auto = null;
    clearToasts();
    newLevel(level ?? G.startLevel);
    show('play');
  }

  function newLevel(i) {
    G.level = i;
    const c = G.carry || {};
    G.sim = new BB.Sim(BB.LEVELS[i], {
      index: i, mode: G.mode, hero: G.hero, easy: G.easy, seed: (Math.random() * 1e9) | 0,
      score: c.score || 0, lives: c.lives, giftIx: c.giftIx || 0,
    });
    G.levelStart = { score: c.score || 0, lives: c.lives, giftIx: c.giftIx || 0 };
    G.runner = new BB.Runner(G.sim);
    G.overT = 0;
    G.bannerT = 0;
    G.stars = null;
    letGo.teddy = letGo.tommy = false;
    view.setLevel(G.sim);
    view.update(G.sim, 0);
    const world = BB.WORLDS[Math.min(BB.WORLDS.length - 1, Math.floor(i / 6))];
    $('bnNum').textContent = `LEVEL ${i + 1} · ${world.name}`;
    $('bnName').textContent = BB.LEVELS[i].name;
    $('bnTip').textContent = BB.LEVELS[i].tip;
    setupHud();
  }

  // The level is clear and the celebration has played: stars, score, best.
  function levelDone() {
    const sim = G.sim, k = dkey();
    G.carry = { score: sim.score, lives: G.easy ? Math.max(sim.lives, BB.DIFF.easy.lives) : sim.lives, giftIx: sim.giftIx };
    save.reached[k] = Math.max(save.reached[k] || 1, Math.min(BB.LEVELS.length, G.level + 2));
    save.stars[k][G.level] = Math.max(save.stars[k][G.level] || 0, sim.stars);
    const newBest = sim.score > (save.best[k] || 0);
    save.best[k] = Math.max(save.best[k] || 0, sim.score);
    store();
    const last = G.level + 1 >= BB.LEVELS.length;
    $('clear').querySelector('h2').textContent = last ? 'ALL CLEAR!' : 'LEVEL CLEAR!';
    $('btnNext').textContent = last ? 'THE END ▶' : 'NEXT LEVEL ▶';
    $('clrScore').textContent = `SCORE ${sim.score.toLocaleString('en-US')}`;
    $('clrBest').textContent = newBest ? `NEW BEST! ${save.best[k].toLocaleString('en-US')}` : `BEST ${save.best[k].toLocaleString('en-US')}`;
    for (const s of $('clrStars').children) { s.classList.remove('on'); s.style.transform = ''; }
    G.stars = { n: sim.stars, t: 0, shown: 0 };
    show('clear');
  }

  function nextLevel() {
    if (G.screen !== 'clear') return;
    if (G.level + 1 >= BB.LEVELS.length) return win();
    clearToasts();
    show('play');
    G.fade = { t: 0, mid: () => newLevel(G.level + 1), called: false };
  }

  function replay() {
    G.carry = Object.assign({}, G.levelStart);
    clearToasts();
    newLevel(G.level);
    show('play');
  }

  function win() {
    const who = G.mode === '2p' ? 'Teddy and Tommy' : G.hero === 'tommy' ? 'Tommy' : 'Teddy';
    $('winText').textContent = `${who} bonked all ${BB.LEVELS.length} levels and scored ${G.sim.score.toLocaleString('en-US')}!`;
    show('win');
    view.confetti(160);
  }

  // Out of hearts: full hearts again, right where you are (the blocks you broke stay broken).
  function keepGoing() {
    const sim = G.sim;
    if (!sim || G.screen !== 'over') return;
    sim.lives = sim.D.lives;
    sim.state = 'play';
    sim.stateT = 0;
    for (const p of sim.paddles) p.pose = 'carry';
    sim.serve();
    clearToasts();
    show('play');
  }

  function pause() { if (G.screen === 'play') show('pause'); }
  function resume() { if (G.screen === 'pause') show('play'); }

  function toTitle() {
    clearToasts();
    G.sim = null;
    G.auto = null;
    startDemo();
    show('title');
    refreshTitle();
  }

  function callBuddy() {
    const sim = G.sim;
    if (!sim || G.screen !== 'play') return;
    S.init();
    if (!sim.callBuddy() && G.mode === '2p' && sim.hi5Cd > 0) toast(`HIGH FIVE IN ${Math.ceil(sim.hi5Cd)}…`, { life: 0.9 });
  }

  // ---------------------------------------------------------------- the simulation and its events

  function afterSteps() {
    const sim = G.sim;
    if (tapped.size) tapped.clear();
    letGo.teddy = letGo.tommy = false;
    for (const ev of sim.events) handle(ev, sim);
    sim.events.length = 0;
    if (sim.state === 'done' && G.screen === 'play') levelDone();
    if (sim.state === 'over' && G.screen === 'play') {
      G.overT += DT;
      if (G.overT > 0.3) {
        $('overText').textContent = `Out of hearts on level ${G.level + 1}. Keep going: the blocks you broke stay broken!`;
        G.overT = 0;
        show('over');
      }
    }
  }

  function handle(ev, sim, quiet) {
    view.onEvent(ev, sim);
    if (quiet) return;
    const fx = BB.sfx;
    switch (ev.type) {
      case 'paddle': fx.paddle(ev.u); break;
      case 'hit': fx.tough(); break;
      case 'break': if (ev.cause !== 'boom') fx.brick(ev.combo || 1); break;
      case 'steel': fx.steel(); break;
      case 'wall': fx.wall(); break;
      case 'boom': fx.boom(); break;
      case 'launch': fx.launch(); break;
      case 'stick': fx.stick(); break;
      case 'pupDrop': fx.pupDrop(); break;
      case 'pup': fx.pup(); toast(`${PUP_ICON[ev.kind]} ${PUP_TOAST[ev.kind]}`, { life: 1.6 }); break;
      case 'drop': fx.drop(); break;
      case 'lost': fx.lost(); toast(sim.lives > 0 ? 'OOPS! 💔' : 'OUT OF HEARTS! 💔', { big: true, life: 1.4 }); break;
      case 'netSave': fx.netSave(); toast(ev.buddy ? '🫧 BOING!' : '🫧 SAVED BY THE BUBBLE NET!', { life: 1.3 }); break;
      case 'over': fx.over(); break;
      case 'clear': fx.clear(); toast(G.level + 1 >= BB.LEVELS.length ? 'ALL CLEAR! 🎉' : 'LEVEL CLEAR! 🎉', { big: true, life: 2.2 }); break;
      case 'homing': fx.homing(); toast('✨ THE BALL IS HELPING!', { life: 1.8 }); break;
      case 'buddyIn': fx.buddyIn(); toast(`${NAME[ev.who]} IS COMING TO HELP!`, { cls: cls(ev.who), life: 1.8 }); break;
      case 'gift': fx.gift(); toast(`${ev.emoji} ${ev.name} FROM ${NAME[ev.from]}!`, { cls: cls(ev.from), life: 2 }); break;
      case 'extraBall':
        fx.extraBall();
        if (ev.who === 'both') toast(ev.full ? 'HIGH FIVE! KEEP BONKING!' : 'HIGH FIVE BALL! 🫧', { big: true, life: 2 });
        else toast(ev.full ? `${NAME[ev.who]} SAYS: KEEP BONKING!` : `${NAME[ev.who]} SAYS: EXTRA BALL!`, { big: true, cls: cls(ev.who), life: 2.2 });
        break;
      case 'buddyOut': fx.buddyOut(); toast(`BYE BYE, ${NAME[ev.who]}! 👋`, { cls: cls(ev.who), life: 1.4 }); break;
      case 'highfive': fx.highfive(); toast('✋ HIGH FIVE!', { big: true, life: 1.6 }); break;
    }
  }

  // ---------------------------------------------------------------- the title-screen demo

  function startDemo(ix) {
    ix = ix ?? Math.floor(Math.random() * 9);
    const sim = new BB.Sim(BB.LEVELS[ix], { index: ix, mode: '2p', seed: (Math.random() * 1e9) | 0, easy: false });
    G.demo = { sim, ix, t: 0, runner: new BB.Runner(sim), bots: sim.paddles.map((p) => new BB.Bot(sim, p, { seed: ix + 3 })) };
    view.setLevel(sim);
  }

  function demoInput() {
    const inp = {};
    for (const b of G.demo.bots) inp[b.p.id] = b.input(DT);
    return inp;
  }

  function demoAfter() {
    const d = G.demo;
    for (const ev of d.sim.events) handle(ev, d.sim, true);
    d.sim.events.length = 0;
    if (d.sim.state === 'oops') d.sim.lives = 3;
    if (d.sim.state === 'done' || d.sim.state === 'over' || d.t > 70) startDemo((d.ix + 1 + Math.floor(Math.random() * 4)) % 12);
  }

  // ---------------------------------------------------------------- HUD

  function setupHud() {
    const sim = G.sim, two = G.mode === '2p';
    const card = $('pcard');
    card.className = 'pcard' + (two ? ' two' : G.hero === 'tommy' ? ' m' : '');
    $('faceA').src = two ? faces.teddy : faces[G.hero];
    $('faceA').className = 'face' + (!two && G.hero === 'tommy' ? ' m' : '');
    $('faceB').src = faces.tommy;
    $('faceB').classList.toggle('hidden', !two);
    const btn = $('callBtn'), bud = Kit.roster.buddyFor(G.hero);
    btn.classList.toggle('t', !two && bud === 'teddy');
    btn.querySelector('img').src = faces[bud];
    btn.querySelector('img').classList.toggle('hidden', two);
    btn.querySelector('.five').classList.toggle('hidden', !two);
    G.hudCache = {};
    if (sim) updateHud();
    layoutHud();
  }

  function layoutHud() {
    const playing = !$('hud').classList.contains('hidden');
    const h = innerHeight, w = innerWidth;
    const short = h <= 520;
    const top = document.querySelector('#hud .top');
    if (playing) {
      view.margins.top = short ? 6 : Math.min(h * 0.22, top.getBoundingClientRect().bottom + 6);
      view.margins.bottom = G.touchOn ? (short ? 34 : Math.max(56, Math.min(96, h * 0.1))) : 10;
    } else {
      view.margins.top = 8;
      view.margins.bottom = 8;
    }
    // keep clear of the kit's round buttons in the middle of the left edge
    view.margins.left = 58; // the field is still centred on the screen when it fits
    view.alignBottom = playing; // in a tall window the field sits right on the finger strip
    view.margins.right = w < 900 ? 8 : 12;
    view.fit(true);
    const strip = $('strip');
    strip.classList.toggle('hidden', !(playing && G.touchOn && G.screen === 'play'));
    strip.style.height = view.margins.bottom + 'px';
    $('stripText').textContent = G.mode === '2p' ? '← TEDDY · TOMMY →' : '← DRAG HERE →';
    document.body.classList.toggle('touch', G.touchOn);
    const bb = $('buddyBar');
    bb.style.top = (short ? 66 : top.getBoundingClientRect().bottom + 6) + 'px';
  }
  addEventListener('resize', () => setTimeout(layoutHud, 50));

  function setText(key, el, text, html) {
    if (G.hudCache[key] === text) return;
    G.hudCache[key] = text;
    if (html) el.innerHTML = text; else el.textContent = text;
  }

  function updateHud() {
    const sim = G.sim;
    if (!sim || !G.hudCache) return;
    setText('score', $('score'), sim.score.toLocaleString('en-US'));
    const narrow = innerWidth < 480;
    const hearts = sim.lives <= 0 ? '💔' : narrow && sim.lives > 2 ? `❤️×${sim.lives}` : '❤️'.repeat(Math.min(sim.lives, 6));
    setText('hearts', $('hearts'), hearts + (sim.nets > 0 ? ` <em>🫧×${sim.nets}</em>` : ''), true);
    setText('lv', $('lvlNum'), String(G.level + 1));
    // the power-ups that are on, with a bar running down
    const on = [];
    if (sim.wideT > 0) on.push(['wide', sim.wideT / 15]);
    if (sim.slowT > 0) on.push(['slow', sim.slowT / 12]);
    if (sim.stickyT > 0) on.push(['sticky', sim.stickyT / 15]);
    if (sim.bigT > 0) on.push(['big', sim.bigT / 10]);
    if (sim.balls.length > 1) on.push(['multi', 1]);
    const key = on.map((o) => o[0]).join();
    if (G.hudCache.pups !== key) {
      G.hudCache.pups = key;
      $('pups').innerHTML = on.map(([k]) => `<span class="chip2" data-k="${k}">${PUP_ICON[k]} <span>${BB.art.PUP_NAME[k]}</span><i></i></span>`).join('');
    }
    for (const [k, f] of on) { const el = $('pups').querySelector(`[data-k="${k}"] i`); if (el) el.style.width = (f * 100).toFixed(1) + '%'; }
    // the companion
    const B = sim.buddy, here = !!B && B.state !== 'leave';
    const btn = $('callBtn');
    btn.classList.toggle('here', here || sim.netT > 0);
    const bud = Kit.roster.buddyFor(G.hero);
    let label;
    if (G.mode === '2p') {
      const cd = sim.hi5Cd;
      btn.querySelector('.cool').style.background = cd > 0 ? `conic-gradient(rgba(10,8,25,0.65) ${(cd / 20) * 360}deg, transparent 0)` : 'none';
      label = cd > 0 ? `HIGH FIVE<small>ready in ${Math.ceil(cd)}</small>` : 'HIGH FIVE! ✋<small>press T</small>';
    } else {
      btn.querySelector('.cool').style.background = 'none';
      label = here ? `${NAME[bud]} IS HERE!<small>tap for another ball</small>` : `CALL ${NAME[bud]}<small>press T</small>`;
    }
    setText('call', btn.querySelector('em'), label, true);
    $('buddyBar').classList.toggle('hidden', !(sim.netT > 0));
    if (sim.netT > 0) $('buddyBar').querySelector('b').style.transform = `scaleX(${Math.max(0, Math.min(1, sim.netT / 10))})`;
    // the launch hint, just above the trampoline
    const waiting = G.screen === 'play' && sim.state === 'play' && sim.balls.some((b) => b.stuck);
    const hint = $('hint');
    hint.classList.toggle('hidden', !waiting);
    if (waiting) {
      const sticky = !sim.balls.some((b) => b.stuck && b.stuckT === Infinity);
      setText('hint', hint, sticky ? 'TAP TO LET GO!' : G.mode === '2p' ? 'TAP OR PRESS SPACE TO LAUNCH!' : 'TAP OR PRESS SPACE TO LAUNCH!');
      hint.style.top = Math.max(0, view.screenY(BB.PADDLE_Y + 4.2)) + 'px';
    }
  }

  // ---------------------------------------------------------------- toasts, banner, fade, stars (game time)

  function toast(text, o = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (o.big ? ' huge' : '') + (o.cls ? ' ' + o.cls : '');
    el.textContent = text;
    $('toasts').appendChild(el);
    G.toasts.push({ el, t: 0, life: o.life || 1.6 });
    const live = G.toasts.filter((q) => q.el);
    if (live.length > 3) live[0].life = 0;
  }

  function clearToasts() {
    for (const q of G.toasts) q.el.remove();
    G.toasts = [];
  }

  function updateToasts(dt) {
    for (const q of G.toasts) {
      q.t += dt;
      const a = Math.min(1, q.t * 6, (q.life - q.t) * 4);
      q.el.style.opacity = Math.max(0, a);
      q.el.style.transform = `scale(${0.7 + 0.3 * Math.min(1, q.t * 6) + (q.t < 0.25 ? Math.sin(q.t * 12.5) * 0.08 : 0)})`;
      if (q.t >= q.life) { q.el.remove(); q.done = true; }
    }
    G.toasts = G.toasts.filter((q) => !q.done);
  }

  function updateBanner(dt) {
    const sim = G.sim;
    if (G.screen === 'play' && sim) G.bannerT += dt;
    const on = G.screen === 'play' && sim && sim.state === 'play' && G.bannerT < 3.2 && !G.fade && (!sim.launched || G.bannerT < 1.2);
    $('banner').classList.toggle('hidden', !on);
    if (on) $('banner').style.opacity = Math.min(1, (3.2 - G.bannerT) * 3);
  }

  function updateFade(dt) {
    const f = G.fade;
    if (!f) return;
    f.t += dt;
    $('fade').style.opacity = f.t < 0.35 ? f.t / 0.35 : f.t < 0.5 ? 1 : Math.max(0, 1 - (f.t - 0.5) / 0.35);
    if (f.t >= 0.4 && !f.called) { f.called = true; f.mid(); }
    if (f.t > 0.9) { G.fade = null; $('fade').style.opacity = 0; }
  }

  // the stars on the results card light up one by one, each with a ding
  function updateStars(dt) {
    const s = G.stars;
    if (!s || G.screen !== 'clear') return;
    s.t += dt;
    const els = $('clrStars').children;
    while (s.shown < s.n && s.t > 0.35 + s.shown * 0.35) {
      els[s.shown].classList.add('on');
      BB.sfx.star(s.shown);
      s.shown++;
    }
    for (let i = 0; i < s.shown; i++) {
      const age = s.t - (0.35 + i * 0.35);
      els[i].style.transform = `scale(${(1 + Math.max(0, 0.4 - age) * 1.2).toFixed(3)})`;
    }
  }

  // ---------------------------------------------------------------- the loop

  function tick(dt) {
    if ((G.screen === 'play' || G.screen === 'clear') && G.sim && !G.fade) {
      // the rules always step by DT; leftover time waits for the next frame (BB.Runner)
      if (G.screen === 'play') { G.runner.advance(dt, inputs); afterSteps(); }
      else { G.runner.advance(dt, () => ({})); for (const ev of G.sim.events) handle(ev, G.sim, true); G.sim.events.length = 0; }
    } else if ((G.screen === 'title' || G.screen === 'levels') && G.demo) {
      const d = G.demo;
      d.t += dt;
      d.runner.advance(dt, demoInput);
      demoAfter();
    }
    const sim = activeSim();
    if (sim) view.update(sim, dt);
    updateHud();
    updateToasts(dt);
    updateFade(dt);
    updateBanner(dt);
    updateStars(dt);
    view.render();
  }

  const activeSim = () => (G.screen === 'title' || G.screen === 'levels' ? G.demo && G.demo.sim : G.sim);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.held) { view.render(); return; }
    tick(dt);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!G.keepAwake) { pause(); S.suspend(); }
    } else S.resume();
  });

  // ---------------------------------------------------------------- title screen

  function refreshTitle() {
    $('logo').innerHTML = BB.TITLE.replace(/^(\S+) (\S+)$/, '<span class="a">$1</span> <span class="b">$2</span>');
    $('subtitle').textContent = BB.SUBTITLE;
    for (const b of document.querySelectorAll('.kid')) {
      b.querySelector('img').src = faces[b.dataset.hero];
      b.style.transform = b.dataset.hero === G.hero ? 'scale(1.05)' : '';
    }
    $('img2pT').src = faces.teddy;
    $('img2pM').src = faces.tommy;
    for (const b of document.querySelectorAll('#segEasy button')) b.classList.toggle('on', (b.dataset.easy === '1') === G.easy);
    const max = maxLevel();
    if (G.startLevel >= max) G.startLevel = max - 1;
    $('startNum').textContent = String(G.startLevel + 1);
    const best = save.best[dkey()] || 0;
    const stars = Object.values(save.stars[dkey()] || {}).reduce((a, b) => a + b, 0);
    $('bestLine').textContent = best ? `BEST SCORE ${best.toLocaleString('en-US')} · ${stars} ⭐` : '';
    muteIcons();
  }

  const maxLevel = () => (save.all ? BB.LEVELS.length : Math.max(1, Math.min(BB.LEVELS.length, save.reached[dkey()] || 1)));

  function pickHero(id) { G.hero = id; refreshTitle(); }

  function setEasy(on) {
    G.easy = on;
    save.easy = on;
    store();
    refreshTitle();
  }

  function buildLevelGrid() {
    const grid = $('levelGrid');
    grid.innerHTML = '';
    const max = maxLevel();
    const got = save.stars[dkey()] || {};
    BB.LEVELS.forEach((def, i) => {
      if (i % 6 === 0) {
        const w = document.createElement('div');
        w.className = 'w';
        w.textContent = BB.WORLDS[i / 6].name;
        grid.appendChild(w);
      }
      const b = document.createElement('button');
      const locked = i >= max;
      const n = got[i] || 0;
      b.innerHTML = locked ? '🔒' : `${i + 1}<small>${'★'.repeat(n)}${'☆'.repeat(3 - n)}</small>`;
      b.title = def.name;
      b.className = locked ? 'lock' : '';
      b.style.background = BB.WORLDS[Math.floor(i / 6)].ui;
      b.disabled = locked;
      b.onclick = () => { G.startLevel = i; BB.sfx.click(); show('title'); refreshTitle(); };
      grid.appendChild(b);
    });
  }

  function toggleMute() {
    S.init();
    S.toggleMute();
    muteIcons();
  }

  function muteIcons() {
    const m = S.isMuted() ? '🔇' : '🔊';
    $('btnMute').textContent = m;
    $('btnMute2').textContent = m;
  }
  S.onMute(muteIcons);

  function wire() {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { S.init(); BB.sfx.click(); fn(e); });
    for (const b of document.querySelectorAll('.kid')) b.addEventListener('click', () => startGame('1p', b.dataset.hero));
    click('btn2p', () => startGame('2p'));
    for (const b of document.querySelectorAll('#segEasy button')) b.addEventListener('click', () => { S.init(); BB.sfx.click(); setEasy(b.dataset.easy === '1'); });
    click('btnLevel', () => { buildLevelGrid(); show('levels'); });
    click('btnLevelsBack', () => show('title'));
    click('btnAll', () => { save.all = true; store(); buildLevelGrid(); });
    click('btnMute', toggleMute);
    click('btnMute2', toggleMute);
    click('btnPause', pause);
    click('btnResume', resume);
    click('btnRestart', replay);
    click('btnMenu', toTitle);
    click('btnNext', nextLevel);
    click('btnReplay', replay);
    click('btnClrMenu', toTitle);
    click('btnKeep', keepGoing);
    click('btnOverMenu', toTitle);
    click('btnAgain', () => startGame(G.mode, G.hero, 0));
    click('btnWinMenu', toTitle);
    $('callBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); callBuddy(); });
  }

  // ---------------------------------------------------------------- start

  setupPointer();
  wire();
  const q = new URLSearchParams(location.search);
  if (q.has('level')) {
    if (q.has('easy')) G.easy = q.get('easy') === '1';
    startGame(q.get('mode') === '2p' ? '2p' : '1p', q.get('hero') === 'tommy' ? 'tommy' : G.hero, Math.max(0, Math.min(BB.LEVELS.length - 1, (+q.get('level') || 1) - 1)));
  } else {
    startDemo();
    show('title');
    refreshTitle();
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- test hooks
  // The Browser pane throttles requestAnimationFrame while hidden, so tests drive the game with step().
  window.game = {
    G, view, faces, save,
    get sim() { return G.sim; },
    step(seconds = 0.5) {
      const n = Math.max(1, Math.round(seconds / DT));
      for (let i = 0; i < n; i++) {
        if ((G.screen === 'play' || G.screen === 'clear') && G.sim && !G.fade) {
          if (G.screen === 'play') { G.sim.step(DT, inputs()); afterSteps(); }
          else { G.sim.step(DT, {}); for (const ev of G.sim.events) handle(ev, G.sim, true); G.sim.events.length = 0; }
        } else if ((G.screen === 'title' || G.screen === 'levels') && G.demo) {
          G.demo.t += DT;
          G.demo.sim.step(DT, demoInput());
          demoAfter();
        }
        const s = activeSim();
        if (s) view.update(s, DT);
        updateToasts(DT);
        updateFade(DT);
        updateBanner(DT);
        updateStars(DT);
      }
      updateHud();
      view.render();
      return this.state();
    },
    hold(on = true) { G.held = on; },
    keepAwake() { G.keepAwake = true; },
    calm() { document.body.classList.add('calm'); },
    start(level = 1, mode = '1p', hero = 'teddy', easy = true) { G.easy = easy; startGame(mode, hero, level - 1); return this.state(); },
    title() { toTitle(); },
    press(code, down = true) { if (down) { if (!keys.has(code)) { keys.add(code); tapped.add(code); onKey(code); } } else keys.delete(code); },
    // a finger: game.drag('teddy', 20) moves Teddy's trampoline toward x = 20; game.drag('teddy', null, true) lifts it
    drag(id, x, lift) { aim[id] = x; if (lift) letGo[id] = true; },
    launch(id) { letGo[id || G.hero] = true; },
    call() { callBuddy(); },
    pause, resume, nextLevel, keepGoing,
    peek(x, y, zoom) { view.peekAt = x === undefined ? null : { x, y, zoom: zoom || 2 }; view.fit(true); },
    showTouch(on = true) { G.touchOn = on; layoutHud(); setupHud(); },
    state() {
      const s = G.sim;
      return {
        screen: G.screen, level: G.level + 1, mode: G.mode, hero: G.hero, easy: G.easy,
        sim: s && { state: s.state, t: +s.t.toFixed(2), left: s.left, lives: s.lives, nets: s.nets, score: s.score, misses: s.misses, stars: s.stars,
          balls: s.balls.map((b) => `${b.x.toFixed(1)},${b.y.toFixed(1)}${b.stuck ? ' stuck' : ''}`), pups: s.pups.map((u) => u.kind),
          paddles: s.paddles.map((p) => `${p.id}@${p.x.toFixed(1)} w${p.w.toFixed(1)} ${p.pose}`), buddy: s.buddy && `${s.buddy.id}:${s.buddy.state}`, netT: +s.netT.toFixed(1) },
      };
    },
    // the headless checks (js/checks.js), the same as `node tools/check.js`; quick = a sample of levels
    check(quick = true) { const r = BB.checks.run({ quick }); return { ok: r.ok, lines: r.lines }; },
    // let the autopilot play (screenshots and demos)
    autopilot(on = true) {
      if (!on) { G.auto = null; return; }
      G.auto = G.sim.paddles.map((p) => new BB.Bot(G.sim, p));
    },
  };
})();
