/* Brick Bonk: the rules. Balls, trampolines (the paddles), blocks, TNT, presents and power-ups, the bubble nets,
   lives and stars, the companion and the high five, plus the autopilot (BB.Bot) and the fixed-step runner (BB.Runner).
   No Three.js here, so the same file runs in Node for tools/check.js. js/view.js only draws what happens here.

   Units: the field is W = 26 wide (13 blocks of 2) and H = 30 tall, y up, the floor at y = 0.
   Time: the rules always step by DT = 1/120 s, whatever the screen's frame rate (BB.Runner), so the same launch ends
   the same way at 30, 60 or 120 fps.
   Collisions are swept: each step the ball finds the first thing it would touch along its path (a wall, a block's
   face or corner, a trampoline, a net, the floor), stops there, bounces and carries on with the time that's left.
   So it can't jump through a block or a wall, however fast it goes. */
(function (root) {
  'use strict';
  const BB = (root.BB = root.BB || {});

  const DT = 1 / 120;
  const COLS = 13, MAX_ROWS = 14, BW = 2, BH = 1;
  const W = COLS * BW, H = 30, TOP_GAP = 2, BRICK_TOP = H - TOP_GAP;
  const PADDLE_Y = 3.0;     // the trampoline's mat
  const NET_Y = 1.3;        // the bubble net, under the trampoline
  const FLOOR_Y = 0;
  const BALL_R = 0.42, BIG_R = 0.8;
  const MAX_ANGLE = (60 * Math.PI) / 180;          // off the very end of the trampoline
  const MIN_VERT = Math.sin((15 * Math.PI) / 180);  // a bounce never leaves flatter than 15 degrees
  const VERT_EPS = 0.1;                             // |vx| below 10% of the speed counts as straight up and down
  const MAX_BALLS = 9;
  const PADDLE_MAX_SPEED = 80;                      // following a finger or the mouse
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const PUPS = ['wide', 'multi', 'slow', 'sticky', 'net', 'big'];
  const PUP_WEIGHTS = { easy: [3, 2, 2, 2, 3, 2], normal: [2, 2, 2, 2, 2, 2] };
  const COLORS = {
    r: '#ff4b4b', o: '#ff9a2e', y: '#ffd93b', g: '#4fcf5a', b: '#3d8bff', p: '#a066e8', k: '#ff7ab8',
    c: '#2fd6b0', w: '#f3efe6', n: '#2c3150', gold: '#ffc21f', steel: '#9aa3b2', tnt: '#e8352e', gift: '#ff6fb5',
  };
  const DIFF = {
    easy: { spd: 14, max: 15, up: 0.05, brickUp: 0, w: 6.6, lives: 5, nets: 3, keySpd: 22, pupVy: -5, homing: true },
    normal: { spd: 16, max: 24, up: 0.25, brickUp: 0.04, w: 5, lives: 3, nets: 0, keySpd: 26, pupVy: -6.5, homing: false },
  };
  const WALL = { type: 'wall' }, NET = { type: 'net' }, FLOOR = { type: 'floor' };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const buddyFor = (id) => (root.Kit && root.Kit.roster ? root.Kit.roster.buddyFor(id) : id === 'tommy' ? 'teddy' : 'tommy');

  function mulberry(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Reflect x into [lo, hi], like a ball bouncing between two walls.
  function fold(x, lo, hi) {
    const span = hi - lo, period = span * 2;
    let u = (x - lo) % period;
    if (u < 0) u += period;
    return lo + (u > span ? period - u : u);
  }

  // ---------------------------------------------------------------- the swept test
  // When does a circle (radius r) moving from (px, py) by (dx, dy) first touch the box? Only faces open to the air
  // count (open: 1 left, 2 right, 4 bottom, 8 top), and a corner only where both its faces are open, so two blocks
  // side by side behave like one flat surface. Returns { t (0..1), nx, ny } or null.
  function sweepBox(px, py, dx, dy, r, x0, y0, x1, y1, open) {
    let best = 1.0000001, nx = 0, ny = 0;
    const T0 = -1e-6;
    if (open & 1 && dx > 0) { const t = (x0 - r - px) / dx; if (t >= T0 && t < best) { const y = py + dy * t; if (y >= y0 && y <= y1) { best = t; nx = -1; ny = 0; } } }
    if (open & 2 && dx < 0) { const t = (x1 + r - px) / dx; if (t >= T0 && t < best) { const y = py + dy * t; if (y >= y0 && y <= y1) { best = t; nx = 1; ny = 0; } } }
    if (open & 4 && dy > 0) { const t = (y0 - r - py) / dy; if (t >= T0 && t < best) { const x = px + dx * t; if (x >= x0 && x <= x1) { best = t; nx = 0; ny = -1; } } }
    if (open & 8 && dy < 0) { const t = (y1 + r - py) / dy; if (t >= T0 && t < best) { const x = px + dx * t; if (x >= x0 && x <= x1) { best = t; nx = 0; ny = 1; } } }
    const a = dx * dx + dy * dy;
    if (a > 0) {
      const corner = (cx, cy) => {
        const ox = px - cx, oy = py - cy;
        const b = 2 * (ox * dx + oy * dy), c = ox * ox + oy * oy - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < T0 || t >= best) return;
        const hx = (ox + dx * t) / r, hy = (oy + dy * t) / r;
        if (hx * dx + hy * dy >= 0) return; // moving away
        best = t; nx = hx; ny = hy;
      };
      if ((open & 5) === 5) corner(x0, y0);
      if ((open & 6) === 6) corner(x1, y0);
      if ((open & 9) === 9) corner(x0, y1);
      if ((open & 10) === 10) corner(x1, y1);
    }
    return best <= 1 ? { t: Math.max(0, best), nx, ny } : null;
  }

  // ---------------------------------------------------------------- a level

  function parseLevel(def) {
    const bricks = [];
    const grid = [];
    for (let r = 0; r < MAX_ROWS; r++) grid.push(new Array(COLS).fill(null));
    def.map.forEach((line, r) => {
      if (line.length !== COLS) throw new Error(`${def.name}: row ${r + 1} is ${line.length} blocks wide, not ${COLS}`);
      if (r >= MAX_ROWS) throw new Error(`${def.name}: more than ${MAX_ROWS} rows`);
      [...line].forEach((ch, c) => {
        if (ch === '.') return;
        let kind, hp = 1, color;
        if (ch === '#') { kind = 's'; hp = Infinity; color = 'steel'; }
        else if (ch === 'x') { kind = 'x'; color = 'tnt'; }
        else if (ch === '*') { kind = 'g'; color = 'gift'; }
        else if (ch === '3') { kind = 't'; hp = 3; color = 'gold'; }
        else if (COLORS[ch]) { kind = 'n'; color = ch; }
        else if (COLORS[ch.toLowerCase()]) { kind = 't'; hp = 2; color = ch.toLowerCase(); }
        else throw new Error(`${def.name}: unknown block "${ch}" in row ${r + 1}`);
        const x0 = c * BW, y1 = BRICK_TOP - r * BH;
        const k = { type: 'brick', id: bricks.length, c, r, kind, hp, maxHp: hp, color, x0, x1: x0 + BW, y0: y1 - BH, y1, cx: x0 + BW / 2, cy: y1 - BH / 2, alive: true, fuse: 0 };
        bricks.push(k);
        grid[r][c] = k;
      });
    });
    return { bricks, grid, rows: def.map.length };
  }

  // ---------------------------------------------------------------- the simulation

  function Sim(def, o = {}) {
    this.def = def;
    this.o = o;
    this.index = o.index || 0;
    this.mode = o.mode === '2p' ? '2p' : '1p';
    this.easy = !!o.easy;
    this.D = this.easy ? DIFF.easy : DIFF.normal;
    if (o.speed) this.D = Object.assign({}, this.D, { spd: o.speed, max: o.speed }); // the checks' top-speed soak
    this.rand = mulberry(o.seed ?? 1);
    this.t = 0;
    this.state = 'play';
    this.stateT = 0;
    this.events = [];
    this.score = o.score || 0;
    this.startScore = this.score;
    this.lives = o.lives ?? this.D.lives;
    this.misses = 0;
    this.stars = 0;
    this.nets = this.D.nets;
    this.netT = 0;
    this.wideT = this.slowT = this.stickyT = this.bigT = 0;
    this.slowMul = 1;
    this.spd = this.D.spd;
    this.sinceBrick = 0;
    this.homingOn = false;
    this.hi5Cd = 0;
    this.hi5T = 0;
    this.buddy = null;
    this.giftIx = o.giftIx || 0;
    this.pups = [];
    this.balls = [];
    this.fuses = [];
    this.nextId = 1;
    this.lastPup = '';
    this.launched = false;
    this.stats = { maxVertRun: 0, flat: 0, bounces: 0, maxGap: 0, gap: 0, segs: 0, violations: [] };
    const L = parseLevel(def);
    this.bricks = L.bricks;
    this.grid = L.grid;
    this.rows = L.rows;
    this.left = this.bricks.filter((k) => k.kind !== 's').length;
    const ids = this.mode === '2p' ? ['teddy', 'tommy'] : [o.hero === 'tommy' ? 'tommy' : 'teddy'];
    const w = this.D.w * (this.mode === '2p' ? 0.85 : 1);
    this.paddles = ids.map((id, i) => ({
      type: 'paddle', id, i, x: ids.length === 1 ? W / 2 : i === 0 ? W * 0.3 : W * 0.7, w, baseW: w, vx: 0,
      pose: 'carry', poseT: 0, bonk: 0,
    }));
    this.serve();
  }
  const P = Sim.prototype;

  P.ev = function (type, o = {}) {
    o.type = type;
    this.events.push(o);
  };

  P.player = function (id) { return this.paddles.find((p) => p.id === id) || null; };
  P.netOn = function () { return this.nets > 0 || this.netT > 0; };
  P.cell = function (c, r) { return c >= 0 && c < COLS && r >= 0 && r < MAX_ROWS ? this.grid[r][c] : null; };
  P.aliveAt = function (c, r) { const k = this.cell(c, r); return !!(k && k.alive); };

  // Which faces of a block the ball can touch: not the ones against the side walls or against another block.
  P.openFaces = function (k) {
    let m = 0;
    if (k.c > 0 && !this.aliveAt(k.c - 1, k.r)) m |= 1;
    if (k.c < COLS - 1 && !this.aliveAt(k.c + 1, k.r)) m |= 2;
    if (!this.aliveAt(k.c, k.r + 1)) m |= 4;
    if (!this.aliveAt(k.c, k.r - 1)) m |= 8;
    return m;
  };

  P.newBall = function (x, y, vx, vy) {
    const b = { id: this.nextId++, x, y, vx, vy, r: this.bigT > 0 ? BIG_R : BALL_R, stuck: null, off: 0, stuckT: 0,
      vertN: 0, vertRun: 0, sinceHit: 0, combo: 0, homing: false, lost: false };
    this.balls.push(b);
    return b;
  };

  // A new ball resting on each trampoline (two in 2 players), waiting for a tap or Space.
  P.serve = function () {
    for (const p of this.paddles) {
      const b = this.newBall(p.x, PADDLE_Y + BALL_R, 0, 0);
      b.stuck = p;
      b.off = (this.rand() < 0.5 ? -1 : 1) * (0.35 + this.rand() * 0.35);
      b.stuckT = Infinity;
    }
    this.launched = false;
  };

  P.release = function (b) {
    const p = b.stuck;
    if (!p) return;
    let a = clamp(b.off / (p.w / 2), -1, 1) * MAX_ANGLE * 0.85;
    if (Math.abs(a) < 0.17) a = (b.off >= 0 ? 1 : -1) * 0.17;
    const s = this.spd * this.slowMul;
    b.vx = Math.sin(a) * s;
    b.vy = Math.cos(a) * s;
    b.stuck = null;
    b.y = PADDLE_Y + b.r;
    this.launched = true;
    this.ev('launch', { id: p.id, x: b.x, y: b.y });
  };

  P.launch = function (p) {
    for (const b of this.balls) if (b.stuck === p) this.release(b);
  };

  // ---------------------------------------------------------------- one step

  P.step = function (dt, input = {}) {
    this.t += dt;
    this.stateT += dt;
    const st = this.state;
    if (st === 'play' || st === 'oops') this.movePaddles(dt, input);
    for (const p of this.paddles) {
      p.bonk = Math.max(0, p.bonk - dt * 4);
      if (p.poseT > 0 && (p.poseT -= dt) <= 0 && (p.pose === 'hi5')) p.pose = 'carry';
    }
    if (st === 'play') {
      this.timers(dt);
      this.updateBalls(dt, input);
      this.updatePups(dt);
      this.updateFuses(dt);
      this.updateBuddy(dt);
      this.sinceBrick += dt;
      if (this.launched) { this.stats.gap += dt; if (this.stats.gap > this.stats.maxGap) this.stats.maxGap = this.stats.gap; }
      if (this.left === 0 && !this.fuses.length) this.clear();
      else if (!this.balls.length) this.miss();
    } else if (st === 'oops') {
      if (this.stateT > 1.2) {
        if (this.lives <= 0) { this.state = 'over'; this.stateT = 0; this.ev('over'); }
        else {
          this.state = 'play';
          this.stateT = 0;
          for (const p of this.paddles) p.pose = 'carry';
          this.serve();
        }
      }
    } else if (st === 'clear') {
      this.updateBuddy(dt);
      if (this.stateT > 2.6) { this.state = 'done'; this.stateT = 0; this.ev('done'); }
    }
  };

  P.timers = function (dt) {
    const dn = (k) => { if (this[k] > 0) this[k] = Math.max(0, this[k] - dt); };
    const wasSticky = this.stickyT > 0;
    dn('wideT'); dn('slowT'); dn('stickyT'); dn('bigT'); dn('netT'); dn('hi5Cd');
    if (wasSticky && !this.stickyT) for (const b of this.balls) if (b.stuck && b.stuckT !== Infinity) this.release(b);
    const want = this.slowT > 0 ? 0.62 : 1;
    this.slowMul += clamp(want - this.slowMul, -2 * dt, 2 * dt);
    if (this.hi5T > 0 && (this.hi5T -= dt) <= 0) {
      this.netT = 10;
      const mid = (this.paddles[0].x + this.paddles[this.paddles.length - 1].x) / 2;
      this.extraBall(mid, 'both');
    }
  };

  P.movePaddles = function (dt, input) {
    for (const p of this.paddles) {
      const inp = input[p.id] || {};
      const tw = p.baseW * (this.wideT > 0 ? 1.5 : 1);
      p.w += clamp(tw - p.w, -8 * dt, 8 * dt);
      const x0 = p.x;
      if (inp.x != null) p.x += clamp(inp.x - p.x, -PADDLE_MAX_SPEED * dt, PADDLE_MAX_SPEED * dt);
      else if (inp.ax) p.x += clamp(inp.ax, -1, 1) * this.D.keySpd * dt;
      p.x = clamp(p.x, p.w / 2, W - p.w / 2);
      p.vx = (p.x - x0) / dt;
    }
  };

  P.updateBalls = function (dt, input) {
    if (this.state !== 'play') return;
    for (const p of this.paddles) if ((input[p.id] || {}).launch) this.launch(p);
    for (const b of this.balls) {
      if (b.stuck) {
        const p = b.stuck;
        b.r = this.bigT > 0 ? BIG_R : BALL_R;
        b.off = clamp(b.off, -p.w / 2 + 0.3, p.w / 2 - 0.3);
        b.x = p.x + b.off;
        b.y = PADDLE_Y + b.r;
        if (b.stuckT !== Infinity && (b.stuckT -= dt) <= 0) this.release(b);
        continue;
      }
      b.sinceHit += dt;
      this.moveBall(b, dt);
    }
    this.balls = this.balls.filter((b) => !b.lost);
  };

  P.rotate = function (b, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const vx = b.vx * c + b.vy * s, vy = -b.vx * s + b.vy * c; // positive a turns clockwise (toward +x when going up)
    b.vx = vx;
    b.vy = vy;
  };

  // Never flatter than 15 degrees: no endless side-to-side bouncing.
  P.clampDir = function (b) {
    if (this.o.noMinAngle) return;
    const s = Math.hypot(b.vx, b.vy);
    if (Math.abs(b.vy) < MIN_VERT * s) {
      const vy = (b.vy > 0 ? 1 : -1) * MIN_VERT * s;
      b.vx = (b.vx >= 0 ? 1 : -1) * Math.sqrt(s * s - vy * vy);
      b.vy = vy;
    }
  };

  // After every bounce: keep it out of dull loops. Straight up and down twice in a row, or 10 s without a block:
  // a little nudge sideways.
  P.bounced = function (b, kind) {
    this.clampDir(b);
    const s = Math.hypot(b.vx, b.vy);
    if (!this.o.noNudge) {
      if (b.sinceHit > 10 && b.sinceHit - (b.nudgedAt || 0) > 4 && kind !== 'brick') {
        this.rotate(b, (this.rand() < 0.5 ? -1 : 1) * (0.15 + this.rand() * 0.15));
        this.clampDir(b);
        b.nudgedAt = b.sinceHit;
        this.ev('nudge', { x: b.x, y: b.y });
      }
      if (Math.abs(b.vx) < VERT_EPS * s) {
        if (++b.vertN >= 2) {
          // turn it 11-20 degrees, keeping it heading the same way up or down
          this.rotate(b, (this.rand() < 0.5 ? -1 : 1) * (0.2 + this.rand() * 0.15));
          b.vertN = 0;
          this.ev('nudge', { x: b.x, y: b.y });
        }
      } else b.vertN = 0;
    }
    // what the loop check measures
    const st = this.stats;
    st.bounces++;
    if (Math.abs(b.vy) < 0.2 * s) st.flat++;
    if (Math.abs(b.vx) < VERT_EPS * s) { if (++b.vertRun > st.maxVertRun) st.maxVertRun = b.vertRun; } else b.vertRun = 0;
  };

  // Easy: after 20 s without a block, a ball on its way up curves gently toward the nearest block it can see
  // (not one hiding behind steel). The target is picked again twice a second.
  P.steer = function (b, dt) {
    b.homing = false;
    if (!this.D.homing || this.o.noHoming || this.sinceBrick < 20 || b.vy <= 0) return;
    if (!b.aimAt || !b.aimAt.alive || (b.aimT -= dt) <= 0) {
      b.aimT = 0.5;
      b.aimAt = null;
      let bd = Infinity;
      for (const k of this.bricks) {
        if (!k.alive || k.kind === 's') continue;
        const d = (k.cx - b.x) ** 2 + (k.cy - b.y) ** 2;
        if (d >= bd) continue;
        const L = Math.sqrt(d) || 1;
        if (this.firstBrick(b.x, b.y, (k.cx - b.x) / L, (k.cy - b.y) / L, b.r) !== k) continue;
        bd = d;
        b.aimAt = k;
      }
    }
    const best = b.aimAt;
    if (!best) return;
    const want = Math.atan2(best.cx - b.x, best.cy - b.y), have = Math.atan2(b.vx, b.vy);
    let d = want - have;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.rotate(b, clamp(d, -0.9 * dt, 0.9 * dt));
    b.homing = true;
    if (!this.homingOn) { this.homingOn = true; this.ev('homing', { x: b.x, y: b.y }); }
  };

  // Push a ball out of anything it overlaps (it can only happen when it grows into a BIG BALL next to a block).
  P.unstick = function (b) {
    const r = b.r;
    if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); }
    if (b.x > W - r) { b.x = W - r; b.vx = -Math.abs(b.vx); }
    if (b.y > H - r) { b.y = H - r; b.vy = -Math.abs(b.vy); }
    const c0 = Math.max(0, Math.floor((b.x - r) / BW)), c1 = Math.min(COLS - 1, Math.floor((b.x + r) / BW));
    const r0 = Math.max(0, Math.floor((BRICK_TOP - (b.y + r)) / BH)), r1 = Math.min(MAX_ROWS - 1, Math.floor((BRICK_TOP - (b.y - r)) / BH));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const k = this.grid[rr][cc];
      if (!k || !k.alive) continue;
      const qx = clamp(b.x, k.x0, k.x1), qy = clamp(b.y, k.y0, k.y1);
      let dx = b.x - qx, dy = b.y - qy;
      const d = Math.hypot(dx, dy);
      if (d >= r - 1e-9) continue;
      if (this.bigT > 0 && k.kind !== 's') { this.hitBrick(k, b, true); continue; }
      if (d > 1e-9) { dx /= d; dy /= d; b.x = qx + dx * r; b.y = qy + dy * r; }
      else { // centre inside: out through the nearest face
        const opts = [[k.x0 - r - b.x, 0], [k.x1 + r - b.x, 0], [0, k.y0 - r - b.y], [0, k.y1 + r - b.y]];
        opts.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
        b.x += opts[0][0]; b.y += opts[0][1];
        dx = Math.sign(opts[0][0]); dy = Math.sign(opts[0][1]);
      }
      const vn = b.vx * dx + b.vy * dy;
      if (vn < 0) { b.vx -= 2 * vn * dx; b.vy -= 2 * vn * dy; }
    }
  };

  P.moveBall = function (b, dt) {
    b.r = this.bigT > 0 ? BIG_R : BALL_R;
    const s = this.spd * this.slowMul, m = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= s / m;
    b.vy *= s / m;
    this.steer(b, dt);
    this.unstick(b);
    if (this.o.naive) return this.moveNaive(b, dt);
    let rem = 1;
    for (let it = 0; it < 12 && rem > 1e-9; it++) {
      const r = b.r, dx = b.vx * dt * rem, dy = b.vy * dt * rem;
      let bt = 1.0000001, hit = null, nx = 0, ny = 0;
      // the walls
      if (dx < 0) { const t = (r - b.x) / dx; if (t < bt) { bt = t; hit = WALL; nx = 1; ny = 0; } }
      if (dx > 0) { const t = (W - r - b.x) / dx; if (t < bt) { bt = t; hit = WALL; nx = -1; ny = 0; } }
      if (dy > 0) { const t = (H - r - b.y) / dy; if (t < bt) { bt = t; hit = WALL; nx = 0; ny = -1; } }
      if (dy < 0) {
        // the trampolines (from above only), the bubble net, the floor
        const pl = PADDLE_Y + r;
        if (b.y >= pl - 1e-6) {
          const t = (pl - b.y) / dy;
          if (t < bt) {
            const hx = b.x + dx * t;
            let near = Infinity;
            for (const p of this.paddles) {
              const d = Math.abs(hx - p.x);
              if (d <= p.w / 2 + r * 0.6 && d < near) { near = d; bt = t; hit = p; nx = 0; ny = 1; }
            }
          }
        }
        if (this.netOn()) {
          const nl = NET_Y + r;
          if (b.y >= nl - 1e-6) { const t = (nl - b.y) / dy; if (t < bt) { bt = t; hit = NET; nx = 0; ny = 1; } }
        }
        const fl = FLOOR_Y + r;
        if (b.y >= fl - 1e-6) { const t = (fl - b.y) / dy; if (t < bt) { bt = t; hit = FLOOR; nx = 0; ny = 1; } }
      }
      // the blocks near the path
      const xa = Math.min(b.x, b.x + dx) - r, xb = Math.max(b.x, b.x + dx) + r;
      const ya = Math.min(b.y, b.y + dy) - r, yb = Math.max(b.y, b.y + dy) + r;
      if (ya < BRICK_TOP && yb > BRICK_TOP - this.rows * BH) {
        const c0 = Math.max(0, Math.floor(xa / BW)), c1 = Math.min(COLS - 1, Math.floor(xb / BW));
        const r0 = Math.max(0, Math.floor((BRICK_TOP - yb) / BH)), r1 = Math.min(this.rows - 1, Math.floor((BRICK_TOP - ya) / BH));
        for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
          const k = this.grid[rr][cc];
          if (!k || !k.alive) continue;
          const h = sweepBox(b.x, b.y, dx, dy, r, k.x0, k.y0, k.x1, k.y1, this.openFaces(k));
          if (h && h.t < bt) { bt = h.t; hit = k; nx = h.nx; ny = h.ny; }
        }
      }
      const ox = b.x, oy = b.y;
      if (!hit) {
        b.x += dx;
        b.y += dy;
        this.audit(b, ox, oy);
        break;
      }
      bt = Math.max(0, bt);
      b.x += dx * bt;
      b.y += dy * bt;
      this.audit(b, ox, oy);
      rem *= 1 - bt;
      if (hit === FLOOR) { this.drop(b); return; }
      if (hit === NET) { this.netBounce(b); continue; }
      if (hit.type === 'paddle') { if (this.paddleBounce(b, hit)) return; continue; }
      if (hit.type === 'brick') {
        const smash = this.bigT > 0 && hit.kind !== 's';
        this.hitBrick(hit, b, smash);
        if (smash) continue;
      }
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
      if (hit === WALL) this.ev('wall', { x: b.x, y: b.y });
      this.bounced(b, hit === WALL ? 'wall' : hit.kind === 's' ? 'steel' : 'brick');
    }
  };

  // The check's sabotaged version: move, then look for overlaps (no sweep). It tunnels at speed.
  P.moveNaive = function (b, dt) {
    const ox = b.x, oy = b.y, r = b.r;
    this.stats.segs++;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    this.audit(b, ox, oy);
    if (b.x < r || b.x > W - r) { b.vx = -b.vx; b.x = clamp(b.x, r, W - r); this.bounced(b, 'wall'); }
    if (b.y > H - r) { b.vy = -Math.abs(b.vy); b.y = H - r; this.bounced(b, 'wall'); }
    const pl = PADDLE_Y + r;
    if (b.vy < 0 && oy >= pl && b.y < pl) for (const p of this.paddles) if (Math.abs(b.x - p.x) <= p.w / 2 + r * 0.6) { b.y = pl; this.paddleBounce(b, p); return; }
    if (b.y <= FLOOR_Y + r) { if (this.netOn()) { b.y = FLOOR_Y + r; this.netBounce(b); } else this.drop(b); return; }
    for (const k of this.bricks) {
      if (!k.alive) continue;
      const qx = clamp(b.x, k.x0, k.x1), qy = clamp(b.y, k.y0, k.y1);
      if ((b.x - qx) ** 2 + (b.y - qy) ** 2 < r * r) {
        if (Math.abs(b.x - qx) > Math.abs(b.y - qy)) b.vx = -b.vx; else b.vy = -b.vy;
        this.hitBrick(k, b, false);
        this.bounced(b, 'brick');
        break;
      }
    }
  };

  // The tunnelling check (opts.audit): the straight piece of path the ball just moved along must not have gone
  // into any block that's still there, or past a wall.
  P.audit = function (b, ox, oy) {
    if (!this.o.audit) return;
    this.stats.segs++;
    const r = b.r, v = this.stats.violations;
    const tol = 0.01;
    if (b.x < r - tol || b.x > W - r + tol || b.y > H - r + tol) v.push({ what: 'wall', x: b.x, y: b.y, t: this.t });
    const len = Math.hypot(b.x - ox, b.y - oy), n = Math.max(1, Math.ceil(len / 0.04));
    const xa = Math.min(ox, b.x) - r, xb = Math.max(ox, b.x) + r, ya = Math.min(oy, b.y) - r, yb = Math.max(oy, b.y) + r;
    for (const k of this.bricks) {
      if (!k.alive || k.x1 < xa || k.x0 > xb || k.y1 < ya || k.y0 > yb) continue;
      for (let i = 0; i <= n; i++) {
        const px = ox + ((b.x - ox) * i) / n, py = oy + ((b.y - oy) * i) / n;
        const qx = clamp(px, k.x0, k.x1), qy = clamp(py, k.y0, k.y1);
        if ((px - qx) ** 2 + (py - qy) ** 2 < (r - tol) ** 2) { v.push({ what: 'brick', brick: k.id, x: px, y: py, t: this.t }); break; }
      }
    }
  };

  // The first block a ball would touch going from (x, y) along (ux, uy), or null if it reaches a side wall first.
  P.firstBrick = function (x, y, ux, uy, r) {
    const L = 60;
    let bt = 1.01, hit = null;
    for (const k of this.bricks) {
      if (!k.alive) continue;
      const h = sweepBox(x, y, ux * L, uy * L, r, k.x0, k.y0, k.x1, k.y1, this.openFaces(k));
      if (h && h.t < bt) { bt = h.t; hit = k; }
    }
    if (hit) {
      const hx = x + ux * L * bt;
      if (hx < r || hx > W - r) return null;
    }
    return hit;
  };

  P.paddleBounce = function (b, p) {
    const s = this.spd * this.slowMul;
    const u = clamp((b.x - p.x) / (p.w / 2), -1, 1);
    const a = u * MAX_ANGLE;
    b.vx = Math.sin(a) * s;
    b.vy = Math.cos(a) * s;
    b.y = PADDLE_Y + b.r;
    this.spd = Math.min(this.D.max, this.spd + this.D.up);
    p.bonk = 1;
    b.combo = 0;
    this.ev('paddle', { id: p.id, x: b.x, y: PADDLE_Y, u });
    // 15 s without a block (a dull loop the nudges didn't break): this bounce heads for a block it can see
    if (!this.o.noNudge && b.sinceHit > 15) {
      let best = null, bd = Infinity;
      for (const k of this.bricks) {
        if (!k.alive || k.kind === 's') continue;
        const ang = Math.atan2(k.cx - b.x, k.cy - b.y);
        if (Math.abs(ang) > MAX_ANGLE * 0.9) continue;
        const d = (k.cx - b.x) ** 2 + (k.cy - b.y) ** 2;
        if (d >= bd || this.firstBrick(b.x, b.y, Math.sin(ang), Math.cos(ang), b.r) !== k) continue;
        bd = d;
        best = ang;
      }
      if (best !== null) {
        b.vx = Math.sin(best) * s;
        b.vy = Math.cos(best) * s;
        this.ev('nudge', { x: b.x, y: b.y });
      }
    }
    if (this.stickyT > 0) {
      b.stuck = p;
      b.off = b.x - p.x;
      b.stuckT = 2.5;
      this.ev('stick', { id: p.id, x: b.x });
      return true;
    }
    this.bounced(b, 'paddle');
    return false;
  };

  P.netBounce = function (b) {
    const last = this.balls.filter((q) => !q.lost && !q.stuck).length <= 1 && !this.balls.some((q) => q.stuck);
    b.vy = Math.abs(b.vy);
    this.rotate(b, (this.rand() - 0.5) * 0.3);
    this.clampDir(b);
    b.y = NET_Y + b.r;
    const buddy = this.netT > 0;
    if (!buddy) { this.nets--; if (last) this.misses++; }
    this.ev('netSave', { x: b.x, y: NET_Y, buddy, left: this.nets });
    this.bounced(b, 'net');
  };

  P.drop = function (b) {
    b.lost = true;
    this.ev('drop', { x: b.x, y: FLOOR_Y + 0.3, last: this.balls.filter((q) => !q.lost).length === 0 });
  };

  P.addScore = function (pts, x, y) {
    this.score += pts;
    if (x !== undefined) this.ev('score', { pts, x, y });
  };

  P.hitBrick = function (k, b, smash) {
    if (k.kind === 's') { this.ev('steel', { x: k.cx, y: k.cy, brick: k }); return; }
    if (b) { b.sinceHit = 0; b.nudgedAt = 0; b.vertN = 0; b.vertRun = 0; }
    this.sinceBrick = 0;
    this.homingOn = false;
    this.stats.gap = 0;
    if (b) b.combo++;
    k.hp = smash ? 0 : k.hp - 1;
    if (k.hp > 0) {
      this.addScore(10);
      this.ev('hit', { brick: k, hp: k.hp, combo: b ? b.combo : 0, x: k.cx, y: k.cy });
      return;
    }
    this.breakBrick(k, b ? b.combo : 0, smash ? 'big' : 'ball');
  };

  P.breakBrick = function (k, combo, cause) {
    if (!k.alive) return;
    k.alive = false;
    this.left--;
    const fi = this.fuses.indexOf(k);
    if (fi >= 0) this.fuses.splice(fi, 1);
    const base = { n: 50, t: 50 * k.maxHp, x: 80, g: 75 }[k.kind] || 50;
    this.addScore(base + Math.min(Math.max(0, combo - 1), 10) * 10, k.cx, k.cy);
    this.spd = Math.min(this.D.max, this.spd + this.D.brickUp);
    this.ev('break', { brick: k, combo, cause, x: k.cx, y: k.cy });
    if (k.kind === 'g') this.dropPup(k);
    if (k.kind === 'x') this.explode(k);
  };

  // TNT: every block around it pops, and TNT next to it goes off a moment later (a chain).
  P.explode = function (k) {
    this.ev('boom', { x: k.cx, y: k.cy });
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const n = this.cell(k.c + dc, k.r + dr);
      if (!n || !n.alive || n === k || n.kind === 's') continue;
      if (n.kind === 'x') { if (!n.fuse) { n.fuse = 0.14; this.fuses.push(n); } }
      else this.breakBrick(n, 0, 'boom');
    }
  };

  P.updateFuses = function (dt) {
    for (const k of this.fuses.slice()) {
      k.fuse -= dt;
      if (k.fuse <= 0) this.breakBrick(k, 0, 'boom');
    }
  };

  P.dropPup = function (k) {
    const wts = PUP_WEIGHTS[this.easy ? 'easy' : 'normal'].map((w, i) => (PUPS[i] === this.lastPup ? 0 : w));
    let r = this.rand() * wts.reduce((a, b) => a + b, 0), kind = PUPS[0];
    for (let i = 0; i < PUPS.length; i++) { if ((r -= wts[i]) < 0) { kind = PUPS[i]; break; } }
    this.lastPup = kind;
    this.pups.push({ id: this.nextId++, kind, x: k.cx, y: k.cy, vy: this.D.pupVy, t: 0 });
    this.ev('pupDrop', { kind, x: k.cx, y: k.cy });
  };

  P.updatePups = function (dt) {
    for (const u of this.pups) {
      u.t += dt;
      u.y += u.vy * dt;
      for (const p of this.paddles) {
        if (Math.abs(u.x - p.x) <= p.w / 2 + 0.8 && u.y - 0.5 <= PADDLE_Y + 0.2 && u.y + 0.5 >= PADDLE_Y - 0.8) {
          this.applyPup(u.kind, p, u);
          u.gone = true;
          break;
        }
      }
      if (u.y < -1) u.gone = true;
    }
    this.pups = this.pups.filter((u) => !u.gone);
  };

  P.applyPup = function (kind, p, u) {
    if (kind === 'wide') this.wideT = 15;
    else if (kind === 'slow') this.slowT = 12;
    else if (kind === 'sticky') this.stickyT = 15;
    else if (kind === 'big') this.bigT = 10;
    else if (kind === 'net') this.nets = Math.min(5, this.nets + 1);
    else if (kind === 'multi') {
      let base = this.balls.find((b) => !b.stuck);
      if (!base) { for (const b of this.balls) this.release(b); base = this.balls[0]; }
      if (base) {
        for (const a of [-0.45, 0.45]) {
          if (this.balls.length >= MAX_BALLS) break;
          const nb = this.newBall(base.x, base.y, base.vx, base.vy);
          this.rotate(nb, a);
          this.clampDir(nb);
          if (nb.y < PADDLE_Y + nb.r + 0.05 && nb.vy < 0) nb.vy = -nb.vy;
        }
      }
    }
    this.addScore(100);
    this.ev('pup', { kind, id: p.id, x: u ? u.x : p.x, y: PADDLE_Y });
  };

  P.miss = function () {
    this.lives--;
    this.misses++;
    this.wideT = this.slowT = this.stickyT = this.bigT = 0;
    this.slowMul = 1;
    this.pups = [];
    this.spd = this.D.spd;
    this.state = 'oops';
    this.stateT = 0;
    for (const p of this.paddles) { p.pose = 'oops'; p.poseT = 1.2; }
    this.ev('lost', { lives: this.lives });
  };

  P.clear = function () {
    this.state = 'clear';
    this.stateT = 0;
    for (const b of this.balls) this.ev('ballPop', { x: b.x, y: b.y });
    this.balls = [];
    this.pups = [];
    this.stars = this.misses <= 1 ? 3 : this.misses <= 3 ? 2 : 1;
    this.bonus = 500 + 250 * this.stars;
    this.score += this.bonus;
    for (const p of this.paddles) { p.pose = 'celebrate'; p.poseT = 0; }
    this.ev('clear', { stars: this.stars, bonus: this.bonus });
  };

  // ---------------------------------------------------------------- the companion and the high five

  P.callBuddy = function () {
    if (this.state !== 'play' && this.state !== 'oops') return false;
    if (this.mode === '2p') return this.highFive();
    const hero = this.paddles[0];
    let B = this.buddy;
    if (!B || B.state === 'leave') {
      const side = hero.x > W / 2 ? -1 : 1;
      const x = clamp(hero.x + side * (hero.w / 2 + 1.3), 0.8, W - 0.8);
      B = this.buddy = { id: buddyFor(hero.id), state: 'enter', t: 0, x, vx: 0, side, pending: 0, gave: false, threw: false };
      this.ev('buddyIn', { who: B.id, x });
    }
    B.pending++;
    return true;
  };

  P.highFive = function () {
    if (this.hi5Cd > 0 || this.hi5T > 0) return false;
    this.hi5Cd = 20;
    this.hi5T = 0.7;
    for (const p of this.paddles) { p.pose = 'hi5'; p.poseT = 1.3; }
    const mid = (this.paddles[0].x + this.paddles[1].x) / 2;
    this.ev('highfive', { x: mid, y: 2.4 });
    return true;
  };

  P.extraBall = function (x, who) {
    if (this.balls.length >= MAX_BALLS) { this.ev('extraBall', { who, full: true, x }); return; }
    const a = (x < W / 2 ? 1 : -1) * (0.15 + this.rand() * 0.3), s = this.spd * this.slowMul;
    this.newBall(clamp(x, 1, W - 1), PADDLE_Y + 1.2, Math.sin(a) * s, Math.cos(a) * s);
    this.launched = true;
    this.ev('extraBall', { who, x, y: PADDLE_Y + 1.2 });
  };

  P.updateBuddy = function (dt) {
    const B = this.buddy;
    if (!B) return;
    B.t += dt;
    const hero = this.paddles[0];
    if (hero.x > W * 0.62) B.side = -1;
    else if (hero.x < W * 0.38) B.side = 1;
    const tx = clamp(hero.x + B.side * (hero.w / 2 + 1.3), 0.8, W - 0.8);
    B.vx = clamp((tx - B.x) * 8, -20, 20);
    B.x += B.vx * dt;
    const go = (s) => { B.state = s; B.t = 0; B.gave = B.threw = false; };
    if (this.state === 'clear') return;
    switch (B.state) {
      case 'enter': if (B.t > 0.5) go('hello'); break;
      case 'hello': if (B.t > 1.1) go('give'); break;
      case 'give':
        if (!B.gave && B.t > 0.3) {
          B.gave = true;
          const [emoji, name] = TREATS[this.giftIx++ % TREATS.length];
          this.addScore(100);
          this.ev('gift', { emoji, name, from: B.id, to: hero.id, x: B.x, y: 1.7 });
        }
        if (!B.threw && B.t > 0.65) {
          B.threw = true;
          B.pending = Math.max(0, B.pending - 1);
          this.netT = 10;
          this.extraBall(B.x, B.id);
        }
        if (B.t > 0.95) go('help');
        break;
      case 'help':
        if (B.pending > 0) go('give');
        else if (this.netT <= 0) go('bye');
        break;
      case 'bye':
        if (B.pending > 0) go('give');
        else if (B.t > 1.2) go('leave');
        break;
      case 'leave':
        if (B.pending > 0) go('give');
        else if (B.t > 0.5) { this.buddy = null; this.ev('buddyOut', { who: B.id }); }
        break;
    }
  };

  // ---------------------------------------------------------------- the autopilot
  // Watches the ball that will land soonest, works out where (bouncing off the side walls), and stands so the ball
  // hits the trampoline at the spot that sends it at a block it can see. Drives the title demo and the checks.
  //   o.statue: always catch the ball dead centre (straight back up: the dullest possible player, for the loop check)
  //   o.idle:   never move (for the checks' sabotaged runs)
  function Bot(sim, p, o = {}) {
    this.sim = sim;
    this.p = p;
    this.o = o;
    this.plan = null;
    this.wait = 0;
    this.rand = mulberry((o.seed ?? 7) + p.i * 101);
  }

  Bot.prototype.input = function (dt) {
    const sim = this.sim, p = this.p, o = this.o;
    if (o.idle) return {};
    const out = { x: p.x, launch: false };
    if (sim.state !== 'play') return out;
    if (sim.balls.some((b) => b.stuck === p)) {
      this.wait += dt;
      if (this.wait > (o.statue ? 0.05 : 0.3)) { out.launch = true; this.wait = 0; }
    }
    const other = sim.paddles.find((q) => q !== p);
    let best = null, bt = Infinity, bx = 0;
    for (const b of sim.balls) {
      if (b.stuck || b.vy >= 0) continue;
      const plane = PADDLE_Y + b.r;
      if (b.y < plane) continue;
      const t = (b.y - plane) / -b.vy;
      const x = fold(b.x + b.vx * t, b.r, W - b.r);
      if (other && Math.abs(x - other.x) < Math.abs(x - p.x)) continue;
      if (t < bt) { bt = t; best = b; bx = x; }
    }
    if (best) {
      if (o.statue) { out.x = bx; return out; }
      const pl = this.plan;
      if (!pl || pl.ball !== best || Math.sign(pl.vx) !== Math.sign(best.vx) || Math.abs(pl.vx - best.vx) > 0.5) {
        this.plan = { ball: best, vx: best.vx, u: this.aim(bx, best) };
      }
      out.x = bx - this.plan.u * (p.w / 2);
      if (Math.abs(out.x - p.x) > PADDLE_MAX_SPEED * bt * 0.8) out.x = bx; // can't make it: just catch it
      // a present that lands first, with time to get back under the ball: grab it on the way
      const spare = PADDLE_MAX_SPEED * 0.6;
      for (const u of sim.pups) {
        if (other && Math.abs(u.x - other.x) < Math.abs(u.x - p.x)) continue;
        const tp = (u.y - PADDLE_Y) / -u.vy;
        if (tp < 0 || tp > bt - 0.15) continue;
        if (Math.abs(u.x - p.x) / spare < tp && Math.abs(out.x - u.x) / spare < bt - tp) { out.x = u.x; break; }
      }
      return out;
    }
    // nothing coming: catch a present, or wait under the highest ball
    const u = sim.pups.filter((q) => !(other && Math.abs(q.x - other.x) < Math.abs(q.x - p.x))).sort((a, b) => a.y - b.y)[0];
    if (u && !o.statue) { out.x = u.x; return out; }
    const rising = sim.balls.filter((b) => !b.stuck && !(other && Math.abs(b.x - other.x) < Math.abs(b.x - p.x)));
    if (rising.length) out.x = rising[0].x;
    return out;
  };

  // Where on the trampoline to hit the ball (-1 left end .. 1 right end) to send it at a block it can see.
  Bot.prototype.aim = function (lx, ball) {
    const sim = this.sim, r = ball.r, y = PADDLE_Y + r;
    const alive = sim.bricks.filter((k) => k.alive && k.kind !== 's');
    if (!alive.length) return 0;
    alive.sort((a, b) => a.cy - b.cy);
    const picks = alive.slice(0, 12).concat(alive.slice(12).filter(() => this.rand() < 0.15));
    let best = null, score = Infinity;
    for (const k of picks) {
      const a = Math.atan2(k.cx - lx, k.cy - y);
      if (Math.abs(a) > MAX_ANGLE * 0.9) continue;
      const first = sim.firstBrick(lx, y, Math.sin(a), Math.cos(a), r);
      if (!first || first.kind === 's') continue;
      const sc = Math.abs(a) * 0.6 + (k.cy - y) * 0.02 + this.rand() * 0.5;
      if (sc < score) { score = sc; best = a; }
    }
    if (best === null) return (this.rand() - 0.5) * 1.4;
    return clamp(best / MAX_ANGLE, -0.95, 0.95);
  };

  // ---------------------------------------------------------------- the fixed-step runner
  // The screen's frames come at any rate; the rules always move in steps of DT. Leftover time waits for the next
  // frame. After a long stall (a hidden tab) the backlog is dropped instead of fast-forwarding.
  function Runner(sim) { this.sim = sim; this.acc = 0; this.steps = 0; }
  Runner.prototype.advance = function (frameDt, inputFn) {
    this.acc += frameDt;
    let n = 0;
    while (this.acc >= DT - 1e-9 && n < 8) {
      this.sim.step(DT, inputFn ? inputFn(this.sim) : {});
      this.acc -= DT;
      n++;
      this.steps++;
    }
    if (this.acc > DT) this.acc = 0;
    return n;
  };

  Object.assign(BB, {
    DT, COLS, MAX_ROWS, BW, BH, W, H, TOP_GAP, BRICK_TOP, PADDLE_Y, NET_Y, FLOOR_Y, BALL_R, BIG_R, MAX_ANGLE, MAX_BALLS,
    COLORS, PUPS, TREATS, DIFF, Sim, Bot, Runner, parseLevel, sweepBox, fold, mulberry,
  });
})(typeof window !== 'undefined' ? window : globalThis);
