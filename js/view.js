/* Brick Bonk: the Three.js scene. Builds each level (backdrop, toy-block frame, floor, the blocks as instanced
   meshes), keeps a model for every ball, trampoline, kid, buddy and power-up in the simulation, and plays the effects
   (block debris, KABOOM, bubble nets, confetti, floating scores). Exposes BB.View. The rules live in js/sim.js. */
(function () {
  'use strict';
  const T = THREE, G = Kit.gfx, BB = window.BB;
  const { W, H, PADDLE_Y, NET_Y } = BB;
  const KID = { teddy: 1.14, tommy: 1.08 };       // so their raised hands reach the trampoline
  const TINT = { teddy: '#3d9bff', tommy: '#2fd6a2' };
  const PAD_H = 0.5;
  const BOX = { x0: -1.2, x1: W + 1.2, y0: -1, y1: H + 1.2 }; // what the camera frames

  function View(canvas) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = T.sRGBEncoding;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer = r;
    this.canvas = canvas;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(22, 1, 1, 600);
    this.hemi = new T.HemisphereLight('#ffffff', '#8a7a9a', 0.95);
    this.scene.add(this.hemi);
    const sun = new T.DirectionalLight('#fff4e2', 1.05);
    sun.position.set(W / 2 - 8, H + 14, 26);
    sun.target.position.set(W / 2, H / 2, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
    sun.shadow.bias = -0.001;
    this.scene.add(sun, sun.target);
    this.level = null;
    this.actors = new Map();
    this.fx = [];
    this.margins = { top: 64, bottom: 8, left: 8, right: 8 };
    this.size = [0, 0];
    this.shake = 0;
    this.t = 0;
    this.m4 = new T.Matrix4();
    this.col = new T.Color();
    this.white = new T.Color('#ffffff');
    this.lastBoom = -1;
  }

  // ---------------------------------------------------------------- the level

  View.prototype.setLevel = function (sim) {
    if (this.level) { this.scene.remove(this.level); disposeTree(this.level); }
    for (const v of this.actors.values()) this.drop(v);
    this.actors.clear();
    for (const f of this.fx) { this.scene.remove(f.obj); f.obj.material.dispose(); }
    this.fx = [];
    const world = BB.WORLDS[Math.min(BB.WORLDS.length - 1, Math.floor(sim.index / 6))].id;
    this.world = world;
    const th = BB.art.THEMES[world];
    const dark = world === 'space';
    this.hemi.intensity = dark ? 1.1 : 0.95;
    const g = new T.Group();
    // the wall behind
    const sky = BB.art.backdrop(world);
    const back = new T.Mesh(new T.PlaneGeometry(70, 60), new T.MeshLambertMaterial({ map: sky, emissive: '#ffffff', emissiveMap: sky, emissiveIntensity: dark ? 0.6 : 0.12 }));
    back.position.set(W / 2, H / 2 - 1, -1.6);
    back.receiveShadow = true;
    g.add(back);
    // the frame: chunky toy cubes down both sides and along the top
    const cells = [];
    for (let y = 0; y <= H; y++) { cells.push([-0.5, y + 0.5]); cells.push([W + 0.5, y + 0.5]); }
    for (let x = 0; x < W; x++) cells.push([x + 0.5, H + 0.5]);
    const frame = new T.InstancedMesh(new T.BoxGeometry(0.96, 0.96, 1.3), new T.MeshStandardMaterial({ roughness: 0.45 }), cells.length);
    cells.forEach(([x, y], i) => {
      this.m4.makeTranslation(x, y, 0);
      frame.setMatrixAt(i, this.m4);
      frame.setColorAt(i, this.col.set(th.wall[(Math.floor(x + 1) + Math.floor(y)) % th.wall.length]));
    });
    frame.castShadow = frame.receiveShadow = true;
    g.add(frame);
    // the floor the kids walk on
    const ft = BB.art.floorTexture(world).clone();
    ft.needsUpdate = true;
    ft.repeat.set((W + 60) / 4, 1);
    const floor = new T.Mesh(new T.BoxGeometry(W + 60, 1, 4), new T.MeshStandardMaterial({ map: ft, roughness: 0.8 }));
    floor.position.set(W / 2, -0.5, 0.5);
    // under the floor, and the sky beyond the backdrop (a tall phone shows more than the backdrop covers)
    const under = new T.Mesh(new T.PlaneGeometry(W + 60, 30), new T.MeshBasicMaterial({ color: G.shade(th.floor, -0.25) }));
    under.position.set(W / 2, -16, 2.4);
    g.add(under);
    this.scene.background = new T.Color(th.sky[0]);
    floor.receiveShadow = true;
    g.add(floor);
    this.buildBricks(sim, g);
    // the bubble net, across the bottom
    const nt = BB.art.netTexture().clone();
    nt.needsUpdate = true;
    nt.repeat.set(3, 1);
    this.netTex = nt;
    this.net = new T.Mesh(new T.PlaneGeometry(W, 0.9), new T.MeshBasicMaterial({ map: nt, transparent: true, depthWrite: false, opacity: 0.9 }));
    this.net.position.set(W / 2, NET_Y, 0.9);
    this.net.renderOrder = 2;
    g.add(this.net);
    this.level = g;
    this.scene.add(g);
    this.fit(true);
  };

  const KIND_TEX = { n: 'plain', s: 'steel', x: 'tnt', g: 'gift' };
  const texKind = (k) => (k.kind === 't' ? (k.color === 'gold' ? 'gold' : 'tough') : KIND_TEX[k.kind]);

  View.prototype.buildBricks = function (sim, g) {
    const groups = {};
    for (const k of sim.bricks) (groups[texKind(k)] = groups[texKind(k)] || []).push(k);
    this.bv = [];
    this.brickMeshes = [];
    const geo = new T.BoxGeometry(1.86, 0.8, 1.0);
    for (const kind in groups) {
      const list = groups[kind];
      const mat = new T.MeshStandardMaterial({
        map: BB.art.blockTexture(kind), roughness: kind === 'steel' ? 0.35 : 0.42,
        metalness: kind === 'steel' ? 0.45 : kind === 'gold' ? 0.3 : 0,
      });
      const m = new T.InstancedMesh(geo, mat, list.length);
      m.castShadow = m.receiveShadow = true;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      list.forEach((k, i) => {
        const tinted = kind === 'plain' || kind === 'tough' || kind === 'gold';
        this.bv[k.id] = { mesh: m, i, flash: 0, wob: 0, base: new T.Color(tinted ? BB.COLORS[k.color] : '#ffffff'), stud: new T.Color(BB.COLORS[k.color]), hp: k.hp };
        m.setColorAt(i, this.bv[k.id].base);
      });
      this.brickMeshes.push(m);
      g.add(m);
    }
    // two studs on top of each block, and a crack decal for the damaged tough ones
    const n = sim.bricks.length;
    this.studs = new T.InstancedMesh(new T.CylinderGeometry(0.24, 0.26, 0.16, 14), new T.MeshStandardMaterial({ roughness: 0.4 }), Math.max(1, n * 2));
    this.studs.castShadow = true;
    this.studs.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.cracks = new T.InstancedMesh(new T.PlaneGeometry(1.8, 0.78), new T.MeshBasicMaterial({ map: BB.art.crackTexture(), transparent: true, depthWrite: false }), Math.max(1, n));
    this.cracks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    sim.bricks.forEach((k, i) => {
      const c = this.col.copy(this.bv[k.id].stud);
      if (k.kind === 's') c.set('#c3c9d3');
      this.studs.setColorAt(i * 2, c);
      this.studs.setColorAt(i * 2 + 1, c);
    });
    g.add(this.studs, this.cracks);
    this.syncBricks(sim, 0);
  };

  View.prototype.syncBricks = function (sim, dt) {
    const m4 = this.m4, s = new T.Vector3(), p = new T.Vector3(), q = new T.Quaternion();
    sim.bricks.forEach((k, i) => {
      const v = this.bv[k.id];
      v.flash = Math.max(0, v.flash - dt * 4);
      v.wob = Math.max(0, v.wob - dt * 3);
      const on = k.alive;
      const sc = on ? 1 + Math.sin(v.wob * 18) * v.wob * 0.12 : 0;
      p.set(k.cx, k.cy - 0.06, 0);
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      v.mesh.setMatrixAt(v.i, m4);
      const c = this.col.copy(v.base);
      if (k.kind === 't' && k.hp < k.maxHp) c.offsetHSL(0, -0.05, -0.08 * (k.maxHp - k.hp));
      if (v.flash > 0) c.lerp(this.white, v.flash * 0.8);
      v.mesh.setColorAt(v.i, c);
      for (const side of [0, 1]) {
        p.set(k.cx + (side ? 0.48 : -0.48), k.cy + 0.42, 0);
        m4.compose(p, q, s);
        this.studs.setMatrixAt(i * 2 + side, m4);
      }
      const cracked = on && k.kind === 't' && k.hp < k.maxHp;
      p.set(k.cx, k.cy - 0.06, 0.505);
      s.setScalar(cracked ? sc : 0);
      if (cracked && k.hp < k.maxHp - 1) s.x = -sc; // a second crack, mirrored
      m4.compose(p, q, s);
      this.cracks.setMatrixAt(i, m4);
    });
    for (const m of this.brickMeshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.studs.instanceMatrix.needsUpdate = true;
    this.cracks.instanceMatrix.needsUpdate = true;
  };

  function disposeTree(o) {
    o.traverse((n) => {
      if (n.geometry && !n.isSprite) n.geometry.dispose();
      if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((mt) => mt.dispose());
    });
  }

  // Frame the field between the HUD at the top and the finger strip at the bottom (and beside the kit's buttons).
  View.prototype.fit = function (force) {
    const c = this.canvas, w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    const key = JSON.stringify(this.margins);
    if (!force && w === this.size[0] && h === this.size[1] && this.marginKey === key) return;
    this.size = [w, h];
    this.marginKey = key;
    this.renderer.setSize(w, h, false);
    const mg = this.margins;
    const bw = BOX.x1 - BOX.x0, bh = BOX.y1 - BOX.y0;
    const availW = Math.max(100, w - mg.left - mg.right), availH = Math.max(100, h - mg.top - mg.bottom);
    const ppu = Math.min(availW / bw, availH / bh);
    // the band the field sits in; if it's narrower than the space, centre it on the screen when that still clears the margins
    let cx = mg.left + availW / 2;
    if (Math.abs(cx - w / 2) > 1 && w / 2 - (bw * ppu) / 2 >= mg.left && w / 2 + (bw * ppu) / 2 <= w - mg.right) cx = w / 2;
    let cy = mg.top + availH / 2;
    if (this.alignBottom) cy = Math.max(cy, mg.top + availH - (bh * ppu) / 2);
    const vh = h / ppu;
    const d = vh / 2 / Math.tan(T.MathUtils.degToRad(this.camera.fov / 2));
    this.camX = (BOX.x0 + BOX.x1) / 2 - (cx - w / 2) / ppu;
    this.camY = (BOX.y0 + BOX.y1) / 2 + (cy - h / 2) / ppu;
    this.camera.aspect = w / h;
    this.camera.position.set(this.camX, this.camY, d);
    this.camera.lookAt(this.camX, this.camY, 0);
    this.camera.updateProjectionMatrix();
    this.ppu = ppu;
    this.dist = d;
    this.screenW = w;
    this.screenH = h;
  };

  // screen pixels <-> the field (on the z = 0 plane)
  View.prototype.worldX = function (clientX) { return this.camX + (clientX - this.screenW / 2) / this.ppu; };
  View.prototype.screenY = function (y) { return this.screenH / 2 - (y - this.camY) * this.ppu; };
  View.prototype.screenX = function (x) { return this.screenW / 2 + (x - this.camX) * this.ppu; };
  View.prototype.fieldRect = function () {
    return { left: this.screenX(0), right: this.screenX(W), top: this.screenY(H), bottom: this.screenY(0) };
  };

  // ---------------------------------------------------------------- models

  function sprite(map, w, h, o) {
    const s = new T.Sprite(new T.SpriteMaterial(Object.assign({ map, transparent: true, depthWrite: false }, o)));
    s.scale.set(w, h || w, 1);
    return s;
  }

  View.prototype.makePaddle = function (p) {
    const color = TINT[p.id];
    const root = new T.Group();
    const pad = new T.Group();
    const tex = BB.art.padTexture(color).clone();
    tex.needsUpdate = true;
    const side = new T.MeshStandardMaterial({ color, roughness: 0.5 });
    const mats = [side, side, new T.MeshStandardMaterial({ color: '#1d2140', roughness: 0.7 }), side, new T.MeshStandardMaterial({ map: tex, roughness: 0.55 }), side];
    const body = new T.Mesh(new T.BoxGeometry(1, PAD_H, 1.4), mats);
    body.castShadow = true;
    pad.add(body);
    const capGeo = new T.CylinderGeometry(PAD_H * 0.62, PAD_H * 0.62, 1.5, 16);
    const capMat = new T.MeshStandardMaterial({ color: G.shade(color, -0.15), roughness: 0.45 });
    const capL = new T.Mesh(capGeo, capMat), capR = new T.Mesh(capGeo, capMat);
    capL.rotation.x = capR.rotation.x = Math.PI / 2;
    capL.castShadow = capR.castShadow = true;
    pad.add(capL, capR);
    root.add(pad);
    const entry = Kit.roster.get(p.id);
    const person = Kit.people.build(entry.look);
    person.root.scale.setScalar(KID[p.id] || 0.9);
    const kid = new T.Group();
    kid.add(person.root);
    person.root.traverse((n) => { if (n.isMesh) n.castShadow = true; });
    this.scene.add(root, kid);
    return { kind: 'paddle', root, pad, body, capL, capR, tex, kid, p: person, ph: Math.random() * 6, yaw: Math.PI, celebT: 0, ballT: 0, padY: PADDLE_Y - PAD_H / 2, padZ: 0, kidZ: 0.2 };
  };

  View.prototype.makeBall = function () {
    const mesh = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshStandardMaterial({ map: BB.art.ballTexture(false), roughness: 0.3 }));
    mesh.castShadow = true;
    const glow = sprite(G.glowTexture(), 3, 3, { color: '#ff9a2e', blending: T.AdditiveBlending, opacity: 0.8 });
    glow.visible = false;
    this.scene.add(mesh, glow);
    return { kind: 'ball', root: mesh, glow, big: false, trailT: 0 };
  };

  View.prototype.makeBuddy = function (B) {
    const entry = Kit.roster.get(B.id);
    const person = Kit.people.build(entry.look);
    const scale = (KID.teddy) * (entry.buddyScale || 0.8);
    person.root.scale.setScalar(scale);
    const root = new T.Group(), turn = new T.Group();
    turn.add(person.root);
    root.add(turn);
    const tag = G.nameTag(entry.name, entry.tag);
    tag.scale.multiplyScalar(0.8);
    tag.position.y = 2.15 * scale + 0.45;
    root.add(tag);
    const wand = sprite(G.emojiTexture('🫧'), 0.9);
    root.add(wand);
    person.root.traverse((n) => { if (n.isMesh) n.castShadow = true; });
    this.scene.add(root);
    return { kind: 'buddy', root, turn, p: person, tag, wand, scale, ph: 0, yaw: Math.PI, pop: 0, ballT: 0 };
  };

  View.prototype.get = function (o, make) {
    let v = this.actors.get(o);
    if (!v) { v = make(); this.actors.set(o, v); }
    v.seen = true;
    return v;
  };

  View.prototype.drop = function (v) {
    for (const o of [v.root, v.kid, v.glow]) if (o) { this.scene.remove(o); disposeTree(o); }
  };

  // ---------------------------------------------------------------- every frame

  View.prototype.update = function (sim, dt) {
    this.t += dt;
    this.sim = sim;
    for (const v of this.actors.values()) v.seen = false;
    this.syncBricks(sim, dt);
    for (const p of sim.paddles) this.syncPaddle(this.get(p, () => this.makePaddle(p)), p, sim, dt);
    for (const b of sim.balls) this.syncBall(this.get(b, () => this.makeBall()), b, sim, dt);
    for (const u of sim.pups) this.syncPup(this.get(u, () => ({ kind: 'pup', root: this.addSprite(BB.art.pupTexture(u.kind), 2.6, 1.3), lang: Kit.lang.get() })), u, dt);
    if (sim.buddy) this.syncBuddy(this.get(sim.buddy, () => this.makeBuddy(sim.buddy)), sim.buddy, sim, dt);
    for (const [o, v] of this.actors) if (!v.seen) { this.drop(v); this.actors.delete(o); }
    // the bubble net: shimmering while it's up, brighter while the buddy holds it
    const on = sim.netOn() && sim.state !== 'clear' && sim.state !== 'done';
    this.net.visible = on;
    if (on) {
      this.netTex.offset.x = (this.netTex.offset.x + dt * 0.12) % 1;
      this.net.material.opacity = (sim.netT > 0 ? 0.95 : 0.75) + Math.sin(this.t * 5) * 0.08;
      this.net.scale.y = 1 + Math.sin(this.t * 3) * 0.06 + (this.netPop || 0) * 0.5;
    }
    this.netPop = Math.max(0, (this.netPop || 0) - dt * 3);
    this.stepFx(dt);
    this.fit();
    const sh = this.shake > 0 ? (this.shake -= dt) * 0.5 : 0;
    const pk = this.peekAt;
    this.camera.position.set(
      (pk ? pk.x : this.camX) + (sh ? (Math.random() - 0.5) * sh : 0),
      (pk ? pk.y : this.camY) + (sh ? (Math.random() - 0.5) * sh : 0),
      pk ? this.dist / pk.zoom : this.dist);
  };

  View.prototype.addSprite = function (map, w, h) {
    const s = sprite(map, w, h);
    this.scene.add(s);
    return s;
  };

  const SIG_T = 2.4; // Teddy switches between boxing and the jump shot this often

  View.prototype.syncPaddle = function (v, p, sim, dt) {
    const k = 1 - Math.exp(-16 * dt);
    const celebrate = p.pose === 'celebrate';
    // the trampoline: put down on the floor behind him while he celebrates
    const ty = celebrate ? 0.35 : PADDLE_Y - PAD_H / 2 - p.bonk * 0.12, tz = celebrate ? -0.9 : 0;
    v.padY += (ty - v.padY) * Math.min(1, dt * 10);
    v.padZ += (tz - v.padZ) * Math.min(1, dt * 10);
    v.root.position.set(p.x, v.padY, v.padZ);
    v.body.scale.set(p.w, 1 - p.bonk * 0.35, 1);
    v.capL.position.x = -p.w / 2;
    v.capR.position.x = p.w / 2;
    v.tex.repeat.x = Math.max(1, p.w / 2);
    // the kid underneath
    const moving = Math.abs(p.vx) > 1;
    let mode = 'carry', lift = 0, faceCam = true;
    const entry = Kit.roster.get(p.id);
    if (celebrate || p.pose === 'hi5') {
      v.celebT += dt;
      const sig = entry.signature || ['wave'];
      mode = sig[Math.floor(v.celebT / SIG_T) % sig.length];
      if (p.pose === 'hi5') mode = sig[0];
    } else v.celebT = 0;
    if (p.pose === 'oops') mode = 'oops';
    if (mode === 'jumpshot') {
      const c = (this.t * 1.1) % 1;
      lift = Math.sin(Math.min(1, c / 0.6) * Math.PI) * 0.7;
      v.ballT -= dt;
      if (c > 0.3 && v.ballT <= 0) {
        v.ballT = 0.85;
        this.emojiFly('🏀', p.x + 0.3, 2.6, p.x + (p.x < W / 2 ? 4 : -4), 9, 0.9, 2);
      }
    } else if (mode === 'peace' && celebrate) lift = Math.abs(Math.sin(this.t * 4)) * 0.3;
    v.ph += dt * (moving ? 10 : mode === 'boxing' ? 7.5 : 5);
    BB.pose(v.p, v.ph, mode, k, { moving: moving && mode === 'carry' });
    const tiptoe = 0;
    v.kidZ += ((celebrate ? 0.9 : 0.2) - v.kidZ) * Math.min(1, dt * 8);
    v.kid.position.set(p.x, lift + tiptoe, v.kidZ);
    const yawTo = Math.PI + (faceCam && mode === 'carry' ? Math.max(-0.5, Math.min(0.5, -p.vx * 0.02)) : 0);
    v.yaw += (yawTo - v.yaw) * Math.min(1, dt * 10);
    v.kid.rotation.y = v.yaw;
  };

  View.prototype.syncBall = function (v, b, sim, dt) {
    const big = b.r > BB.BALL_R + 0.01;
    if (big !== v.big) {
      v.big = big;
      v.root.material.map = BB.art.ballTexture(big);
      v.root.material.needsUpdate = true;
    }
    v.root.position.set(b.x, b.y, 0);
    v.root.scale.setScalar(b.r);
    if (!b.stuck) {
      v.root.rotation.z -= (b.vx * dt) / b.r;
      v.root.rotation.x -= (b.vy * dt) / b.r;
    }
    v.glow.visible = big || b.homing;
    if (v.glow.visible) {
      v.glow.position.set(b.x, b.y, -0.2);
      v.glow.material.color.set(big ? '#ff8a2e' : '#9fe8ff');
      v.glow.scale.setScalar((big ? 3.2 : 2) + Math.sin(this.t * 14) * 0.2);
    }
    // a little trail
    v.trailT -= dt;
    if (!b.stuck && v.trailT <= 0) {
      v.trailT = 0.03;
      this.particle({ x: b.x, y: b.y, z: -0.1, life: 0.22, size: b.r * 1.6, color: big ? '#ffb02e' : b.homing ? '#bff4ff' : '#fff6c8', grow: -0.6 });
      if (b.homing && Math.random() < 0.3) this.particle({ x: b.x, y: b.y, z: 0.6, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 0.5, size: 0.35, map: G.emojiTexture('✨') });
    }
  };

  View.prototype.syncPup = function (v, u, dt) {
    if (v.lang !== Kit.lang.get()) { v.lang = Kit.lang.get(); v.root.material.map = BB.art.pupTexture(u.kind); v.root.material.needsUpdate = true; }
    v.root.position.set(u.x, u.y, 1);
    v.root.material.rotation = Math.sin(u.t * 5) * 0.12;
    const s = 1 + Math.sin(u.t * 9) * 0.05;
    v.root.scale.set(2.6 * s, 1.3 * s, 1);
  };

  View.prototype.syncBuddy = function (v, B, sim, dt) {
    const k = 1 - Math.exp(-16 * dt);
    const entry = Kit.roster.get(B.id);
    let mode = 'hold', faceCam = true, lift = 0;
    const st = B.state;
    if (sim.state === 'clear' || sim.state === 'done') mode = Kit.roster.signature(entry, 'hello');
    else if (st === 'enter' || st === 'hello') mode = Kit.roster.signature(entry, 'hello');
    else if (st === 'bye' || st === 'leave') mode = Kit.roster.signature(entry, 'goodbye');
    else if (st === 'give') mode = 'give';
    if (mode === 'jumpshot') {
      const c = (this.t * 1.1) % 1;
      lift = Math.sin(Math.min(1, c / 0.6) * Math.PI) * 0.6;
      v.ballT -= dt;
      if (c > 0.3 && v.ballT <= 0) { v.ballT = 0.85; this.emojiFly('🏀', B.x, 2.2, B.x + (B.x < W / 2 ? 3 : -3), 8, 0.9, 1.6); }
    }
    v.ph += dt * (mode === 'boxing' ? 7.5 : 6);
    BB.pose(v.p, v.ph, mode, k, { moving: Math.abs(B.vx) > 1 });
    // pops in and out with a little bounce
    const target = st === 'leave' ? 0 : 1;
    v.pop += (target - v.pop) * Math.min(1, dt * (st === 'leave' ? 9 : 7));
    const s = Math.max(0.001, v.pop * (1 + Math.sin(Math.min(1, B.t * 2) * Math.PI) * (st === 'enter' ? 0.18 : 0)));
    v.root.scale.setScalar(s);
    v.root.position.set(B.x, lift, 0.7);
    v.yaw += ((faceCam ? Math.PI : Math.PI / 2) - v.yaw) * Math.min(1, dt * 10);
    v.turn.rotation.y = v.yaw;
    v.wand.visible = mode === 'hold';
    v.wand.position.set(-0.55 * v.scale, 2.0 * v.scale + Math.sin(this.t * 3) * 0.05, 0.4);
  };

  // ---------------------------------------------------------------- effects

  View.prototype.particle = function (o) {
    const map = o.map || G.dotTexture();
    const s = sprite(map, o.size || 0.3, o.size || 0.3, { color: o.color || '#ffffff', blending: o.add ? T.AdditiveBlending : T.NormalBlending });
    s.position.set(o.x, o.y, o.z ?? 1.2);
    this.scene.add(s);
    this.fx.push({ obj: s, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.6, max: o.life || 0.6, size: o.size || 0.3,
      grow: o.grow || 0, grav: o.grav || 0, spin: o.spin || 0, fade: o.fade ?? true, path: o.path, sx: o.sx, sy: o.sy, done: o.done });
  };

  View.prototype.stepFx = function (dt) {
    for (const f of this.fx) {
      f.life -= dt;
      const s = f.obj, a = Math.max(0, f.life / f.max);
      if (f.path) {
        const u = 1 - a, P = f.path;
        s.position.x = P.x0 + (P.x1 - P.x0) * u;
        s.position.y = P.y0 + (P.y1 - P.y0) * u + Math.sin(u * Math.PI) * P.arc;
        s.material.rotation += dt * 8;
      } else {
        f.vy -= f.grav * dt;
        s.position.x += f.vx * dt;
        s.position.y += f.vy * dt;
        s.material.rotation += f.spin * dt;
      }
      const sz = Math.max(0.01, f.size * (1 + f.grow * (1 - a)));
      s.scale.set(sz * (f.sx || 1), sz * (f.sy || 1), 1);
      if (f.fade) s.material.opacity = Math.min(1, a * 2.2);
      if (f.life <= 0) {
        this.scene.remove(s);
        s.material.dispose();
        if (f.done) f.done();
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
    if (this.fx.length > 500) { for (const f of this.fx.splice(0, this.fx.length - 500)) { this.scene.remove(f.obj); f.obj.material.dispose(); } }
  };

  View.prototype.burst = function (x, y, color, n, speed, size, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = speed * (0.5 + Math.random() * 0.7);
      this.particle(Object.assign({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.up || 0), life: 0.45 + Math.random() * 0.25, size: size || 0.28, color, grav: o.grav ?? 4 }, o.p));
    }
  };

  // Floating text ("+150", "KABOOM!") that rises and fades.
  View.prototype.popup = function (text, x, y, color, big) {
    const s = sprite(BB.art.textTexture(text, color || '#ffffff'), 1, 1);
    s.position.set(x, y, 1.6);
    this.scene.add(s);
    const w = big ? 7 : 3.4;
    this.fx.push({ obj: s, vx: 0, vy: big ? 1 : 1.8, life: big ? 1.3 : 0.9, max: big ? 1.3 : 0.9, size: w, grow: 0.12, grav: 0, spin: 0, fade: true, sx: 1, sy: 0.25 });
  };

  View.prototype.emojiFly = function (emoji, x0, y0, x1, y1, time, arc, done) {
    const s = sprite(G.emojiTexture(emoji), 1);
    s.position.set(x0, y0, 1.4);
    this.scene.add(s);
    this.fx.push({ obj: s, life: time, max: time, size: 1.1, grow: 0.2, fade: false, path: { x0, y0, x1, y1, arc: arc ?? 2 }, done });
  };

  View.prototype.confetti = function (n) {
    const cols = ['#ff4b4b', '#ffd93b', '#3d8bff', '#2fd6b0', '#a066e8', '#ffffff', '#ff7ab8'];
    for (let i = 0; i < n; i++) {
      this.particle({ x: Math.random() * W, y: H - 1 + Math.random() * 4, vx: (Math.random() - 0.5) * 3, vy: -1.5 - Math.random() * 3,
        life: 3 + Math.random() * 1.5, size: 0.4, color: cols[i % cols.length], spin: (Math.random() - 0.5) * 10, map: squareTexture(), fade: true, z: 2 });
    }
  };

  let squareTex = null;
  function squareTexture() {
    if (squareTex) return squareTex;
    const [c, g] = G.makeCanvas(16, 16);
    g.fillStyle = '#fff';
    g.fillRect(2, 4, 12, 8);
    return (squareTex = G.toTexture(c));
  }

  View.prototype.kidAt = function (id) {
    const p = this.sim && this.sim.player(id);
    return p ? { x: p.x, y: 1.6 } : { x: W / 2, y: 1.6 };
  };

  // What happened in the rules this step.
  View.prototype.onEvent = function (ev, sim) {
    const bv = ev.brick && this.bv[ev.brick.id];
    const colorOf = (k) => BB.COLORS[k.color] || '#ffffff';
    switch (ev.type) {
      case 'hit':
        if (bv) { bv.flash = 1; bv.wob = 1; }
        this.burst(ev.x, ev.y - 0.3, colorOf(ev.brick), 5, 3, 0.22);
        break;
      case 'break': {
        const c = colorOf(ev.brick);
        this.burst(ev.x, ev.y, c, 10, 5, 0.34, { p: { map: squareTexture(), spin: 8 }, grav: 14, up: 2 });
        this.burst(ev.x, ev.y, '#ffffff', 4, 2, 0.25);
        this.particle({ x: ev.x, y: ev.y, life: 0.18, size: 2.4, grow: 0.6, map: G.glowTexture(), color: c, add: true });
        break;
      }
      case 'score':
        if (ev.pts >= 80) this.popup('+' + ev.pts, ev.x, ev.y + 0.6, ev.pts >= 150 ? '#ffd23f' : '#ffffff');
        break;
      case 'steel':
        if (bv) bv.flash = 0.6;
        this.burst(ev.x, ev.y - 0.3, '#fff3a0', 6, 4, 0.16, { grav: 6 });
        break;
      case 'boom':
        this.particle({ x: ev.x, y: ev.y, life: 0.35, size: 7, grow: 0.5, map: G.glowTexture(), color: '#ffb02e', add: true });
        this.burst(ev.x, ev.y, '#ff7a1f', 18, 8, 0.4, { grav: 3 });
        this.burst(ev.x, ev.y, '#ffe46a', 10, 5, 0.3, { grav: 2 });
        this.shake = Math.max(this.shake, 0.35);
        if (this.t - this.lastBoom > 0.5) { this.lastBoom = this.t; this.popup(Kit.lang.t('KABOOM!'), ev.x, ev.y + 1, '#ffb02e', true); }
        break;
      case 'paddle':
        this.burst(ev.x, ev.y + 0.3, '#ffffff', 5, 2.5, 0.2, { up: 1.5 });
        break;
      case 'launch':
        this.burst(ev.x, ev.y, '#ffffff', 6, 2.5, 0.2);
        break;
      case 'drop':
        this.burst(ev.x, ev.y + 0.2, '#ffd23f', 12, 4, 0.3, { up: 2 });
        this.particle({ x: ev.x, y: ev.y + 0.4, life: 0.4, size: 1.6, grow: 1, map: G.glowTexture(), color: '#ffffff', add: true });
        break;
      case 'netSave':
        this.netPop = 1;
        this.burst(ev.x, ev.y + 0.3, '#9ff4ff', 14, 4, 0.3, { up: 2 });
        this.particle({ x: ev.x, y: ev.y + 0.3, life: 0.5, size: 1.4, grow: 1, map: G.emojiTexture('🫧') });
        break;
      case 'pupDrop':
        this.burst(ev.x, ev.y, '#ffffff', 10, 4, 0.25, { p: { map: G.emojiTexture('✨') }, grav: 2 });
        break;
      case 'pup':
        this.burst(ev.x, BB.PADDLE_Y + 0.5, BB.art.PUP[ev.kind].color, 16, 5, 0.3, { up: 3 });
        this.popup(Kit.lang.t(BB.art.PUP_NAME[ev.kind] + '!'), ev.x, BB.PADDLE_Y + 2.5, '#ffffff');
        break;
      case 'clear':
        this.confetti(140);
        break;
      case 'ballPop':
        this.burst(ev.x, ev.y, '#ffd23f', 10, 4, 0.28);
        break;
      case 'buddyIn':
        this.burst(ev.x, 1.2, TINT[ev.who] || '#fff', 16, 4, 0.3, { up: 2 });
        break;
      case 'gift': {
        const to = this.kidAt(ev.to);
        this.emojiFly(ev.emoji, ev.x, ev.y + 0.8, to.x, to.y + 0.6, 0.8, 2.6, () => this.burst(to.x, to.y + 0.6, '#fff27a', 10, 3, 0.22));
        break;
      }
      case 'extraBall':
        if (!ev.full) this.burst(ev.x, ev.y, '#ffffff', 12, 4, 0.25, { p: { map: G.emojiTexture('✨') }, grav: 1 });
        break;
      case 'highfive': {
        const s = sprite(G.emojiTexture('✋'), 1.8);
        s.position.set(ev.x, 4.6, 1.6);
        this.scene.add(s);
        this.fx.push({ obj: s, vx: 0, vy: 0.8, life: 1.4, max: 1.4, size: 1.8, grow: 0.6, grav: 0, spin: 0, fade: true });
        this.confetti(40);
        break;
      }
      case 'homing':
        this.burst(ev.x, ev.y, '#bff4ff', 10, 3, 0.25, { p: { map: G.emojiTexture('✨') }, grav: 0 });
        break;
    }
  };

  View.prototype.render = function () {
    this.renderer.render(this.scene, this.camera);
  };

  BB.View = View;
})();
