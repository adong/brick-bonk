/* Brick Bonk: everything painted on a canvas. The three worlds' backdrops and floors, the toy-block faces (plain,
   tough, gold, steel, TNT, present), cracks, the bouncy ball, the trampoline's padding, the bubble net, the power-up
   capsules and floating text. No image files. Exposes BB.art. */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const G = Kit.gfx;
  const { makeCanvas, toTexture, shade, roundRect } = G;
  const cache = {};
  const once = (key, make) => cache[key] || (cache[key] = make());

  const THEMES = {
    room: { sky: ['#ffcf8f', '#ff9fc4'], dots: '#ffffff', floor: '#c98a4b', floorLine: '#9d6431', wall: ['#ff6b6b', '#ffd93b', '#3d8bff', '#4fcf5a'] },
    garden: { sky: ['#6fd0ff', '#c9f3ff'], dots: '#ffffff', floor: '#5ccf55', floorLine: '#3c9e3a', wall: ['#ff9a2e', '#ffffff', '#ff7ab8', '#ffd93b'] },
    space: { sky: ['#1b1d4a', '#3a2a6e'], dots: '#ffffff', floor: '#9a95b8', floorLine: '#6f6a92', wall: ['#8f9bff', '#c3a6ff', '#5ef2ff', '#ffffff'] },
  };

  // ---------------------------------------------------------------- backdrops
  function backdrop(id) {
    return once('bg' + id, () => {
      const th = THEMES[id];
      const BW = 700, BH = 600;
      const [c, g] = makeCanvas(BW, BH);
      const gr = g.createLinearGradient(0, 0, 0, BH);
      gr.addColorStop(0, th.sky[0]);
      gr.addColorStop(1, th.sky[1]);
      g.fillStyle = gr;
      g.fillRect(0, 0, BW, BH);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      if (id === 'room') {
        // wallpaper: soft stripes, polka dots and little toys
        g.fillStyle = 'rgba(255,255,255,0.2)';
        for (let x = 0; x < BW; x += 40) g.fillRect(x, 0, 18, BH);
        for (let i = 0; i < 110; i++) {
          g.fillStyle = ['rgba(255,90,140,0.3)', 'rgba(90,160,255,0.3)', 'rgba(255,220,90,0.45)'][i % 3];
          g.beginPath();
          g.arc(rnd() * BW, rnd() * BH, 3 + rnd() * 5, 0, Math.PI * 2);
          g.fill();
        }
        g.font = `20px ${G.EMOJI_FONT}`;
        g.globalAlpha = 0.55;
        const toys = ['🧸', '🚂', '🪁', '🎈', '🦖', '🚀', '🏀', '🛸'];
        for (let i = 0; i < 24; i++) g.fillText(toys[i % toys.length], 20 + (i % 6) * 112 + rnd() * 40, 40 + Math.floor(i / 6) * 140 + rnd() * 50);
        g.globalAlpha = 1;
      } else if (id === 'garden') {
        // clouds, hills and flowers
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 9; i++) {
          const x = rnd() * BW, y = 30 + rnd() * 330;
          for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(x + j * 14, y + (j % 2) * -6, 13 + rnd() * 5, 0, Math.PI * 2); g.fill(); }
        }
        g.fillStyle = '#8fe07a';
        g.beginPath(); g.moveTo(0, BH); g.quadraticCurveTo(180, 440, 380, 520); g.quadraticCurveTo(560, 470, BW, 500); g.lineTo(BW, BH); g.fill();
        g.fillStyle = '#6fcf5c';
        g.beginPath(); g.moveTo(0, 560); g.quadraticCurveTo(320, 500, BW, 575); g.lineTo(BW, BH); g.lineTo(0, BH); g.fill();
        g.font = `14px ${G.EMOJI_FONT}`;
        for (let i = 0; i < 26; i++) g.fillText(['🌼', '🌷', '🌸'][i % 3], rnd() * (BW - 20), 540 + rnd() * 50);
        g.font = `18px ${G.EMOJI_FONT}`;
        for (const [e, x, y] of [['🦋', 560, 180], ['🐝', 110, 300], ['🦋', 230, 120], ['🐞', 620, 420]]) g.fillText(e, x, y);
      } else {
        // stars, a moon and a ringed planet
        for (let i = 0; i < 260; i++) {
          g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
          const r = rnd() < 0.1 ? 1.8 : 0.9;
          g.beginPath(); g.arc(rnd() * BW, rnd() * BH, r, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#ffe9a8';
        g.beginPath(); g.arc(600, 90, 28, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(200,170,90,0.5)';
        [[590, 80, 6], [612, 102, 8], [606, 74, 4]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = '#ff9a6b';
        g.beginPath(); g.arc(100, 430, 22, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,230,160,0.9)';
        g.lineWidth = 4;
        g.beginPath(); g.ellipse(100, 430, 40, 9, -0.3, 0, Math.PI * 2); g.stroke();
      }
      return toTexture(c);
    });
  }

  function floorTexture(id) {
    return once('floor' + id, () => {
      const th = THEMES[id];
      const [c, g] = makeCanvas(256, 64);
      g.fillStyle = th.floor;
      g.fillRect(0, 0, 256, 64);
      g.strokeStyle = th.floorLine;
      g.lineWidth = 3;
      if (id === 'room') for (let x = 0; x < 256; x += 64) { g.strokeRect(x + (x % 128 ? 0 : 20), 0, 64, 32); g.strokeRect(x, 32, 64, 32); }
      else if (id === 'garden') for (let x = 0; x < 256; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 4, 14); g.stroke(); }
      else for (let i = 0; i < 18; i++) { g.beginPath(); g.arc((i * 53) % 256, (i * 29) % 64, 6 + (i % 3) * 3, 0, Math.PI * 2); g.stroke(); }
      const t = toTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    });
  }

  // ---------------------------------------------------------------- block faces (white, tinted per block)
  function bevel(g, w, h, r) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.75, 'rgba(0,0,0,0.06)');
    gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    roundRect(g, r, r * 0.7, w * 0.42, h * 0.16, h * 0.08);
    g.fill();
  }

  function blockTexture(kind) {
    return once('block' + kind, () => {
      const W = 128, H = 64;
      const [c, g] = makeCanvas(W, H);
      if (kind === 'plain') bevel(g, W, H, 10);
      else if (kind === 'tough' || kind === 'gold') {
        bevel(g, W, H, 10);
        g.strokeStyle = 'rgba(0,0,0,0.28)';
        g.lineWidth = 5;
        roundRect(g, 9, 9, W - 18, H - 18, 8);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 3;
        roundRect(g, 15, 15, W - 30, H - 30, 6);
        g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (const [x, y] of [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]]) { g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
        if (kind === 'gold') {
          g.fillStyle = '#ffffff';
          for (const [x, y, s] of [[34, 30, 7], [92, 38, 5], [64, 24, 4]]) {
            g.beginPath();
            for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? s * 0.35 : s; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
            g.fill();
          }
        }
      } else if (kind === 'steel') {
        const gr = g.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, '#d9dee6');
        gr.addColorStop(0.5, '#a3abb8');
        gr.addColorStop(1, '#7d8594');
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 6;
        for (let x = -40; x < W + 40; x += 26) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 40, 0); g.stroke(); }
        g.strokeStyle = '#5b6270';
        g.lineWidth = 4;
        g.strokeRect(3, 3, W - 6, H - 6);
        for (const [x, y] of [[12, 12], [W - 12, 12], [12, H - 12], [W - 12, H - 12]]) {
          g.fillStyle = '#626a78'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#e8ecf2'; g.beginPath(); g.arc(x - 1.5, y - 1.5, 2.5, 0, Math.PI * 2); g.fill();
        }
      } else if (kind === 'tnt') {
        g.fillStyle = '#e8352e';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#b71f1a';
        for (let x = 6; x < W; x += 24) g.fillRect(x, 0, 4, H);
        g.fillStyle = '#ffffff';
        g.fillRect(0, 18, W, 28);
        g.fillStyle = '#e8352e';
        g.font = `900 26px ${G.FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TNT', W / 2, 33);
      } else if (kind === 'gift') {
        bevel(g, W, H, 10);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = '#ff6fb5';
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#ffd93b';
        g.fillRect(W / 2 - 8, 0, 16, H);
        g.fillRect(0, H / 2 - 7, W, 14);
        g.fillStyle = '#ff9a2e';
        g.beginPath(); g.ellipse(W / 2 - 14, H / 2 - 4, 13, 8, -0.5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(W / 2 + 14, H / 2 - 4, 13, 8, 0.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffd93b';
        g.beginPath(); g.arc(W / 2, H / 2, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = `bold 18px ${G.FONT}`;
        for (const [x, y] of [[18, 16], [108, 50], [20, 52], [106, 14]]) g.fillText('✦', x - 6, y + 6);
      }
      const t = toTexture(c);
      return t;
    });
  }

  function crackTexture() {
    return once('crack', () => {
      const [c, g] = makeCanvas(128, 64);
      g.strokeStyle = 'rgba(30,20,40,0.75)';
      g.lineWidth = 3;
      g.lineCap = 'round';
      const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
      line([[60, 0], [56, 14], [66, 24], [58, 38], [70, 50], [64, 64]]);
      line([[66, 24], [84, 28], [96, 20]]);
      line([[58, 38], [40, 44], [30, 40]]);
      g.lineWidth = 2;
      line([[70, 50], [88, 56]]);
      return toTexture(c);
    });
  }

  // ---------------------------------------------------------------- the ball, the trampoline, the net
  function ballTexture(big) {
    return once('ball' + (big ? 'B' : ''), () => {
      const [c, g] = makeCanvas(256, 128);
      g.fillStyle = big ? '#ff6b2e' : '#ffd23f';
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = big ? '#ffd23f' : '#ff4b6b';
      g.fillRect(0, 52, 256, 24);
      g.fillStyle = '#ffffff';
      for (const x of [40, 168]) {
        g.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 9 : 22; g.lineTo(x + Math.cos(a) * r, 30 + Math.sin(a) * r); }
        g.fill();
      }
      return toTexture(c);
    });
  }

  function padTexture(color) {
    return once('pad' + color, () => {
      const [c, g] = makeCanvas(128, 64);
      g.fillStyle = color;
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = '#1d2140';
      g.fillRect(0, 0, 128, 14);
      g.fillStyle = shade(color, 0.35);
      g.fillRect(0, 14, 128, 8);
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 4;
      g.lineJoin = 'round';
      g.beginPath();
      for (let x = 0; x <= 128; x += 16) g.lineTo(x, x % 32 ? 30 : 50);
      g.stroke();
      g.fillStyle = shade(color, -0.3);
      g.fillRect(0, 58, 128, 6);
      const t = toTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      return t;
    });
  }

  function netTexture() {
    return once('net', () => {
      const [c, g] = makeCanvas(512, 64);
      const gr = g.createLinearGradient(0, 0, 512, 0);
      ['#7ef6ff', '#c3a6ff', '#ff9ad1', '#ffe58a', '#9dffb8', '#7ef6ff'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
      g.fillStyle = gr;
      g.globalAlpha = 0.55;
      g.fillRect(0, 22, 512, 20);
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 3;
      for (let x = 16; x < 512; x += 34) { g.beginPath(); g.arc(x, 32, 12 + ((x / 34) % 3) * 2, 0, Math.PI * 2); g.stroke(); }
      const t = toTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      return t;
    });
  }

  // ---------------------------------------------------------------- power-ups
  const PUP = {
    wide: { color: '#3d8bff', icon: '↔️', label: 'WIDE' },
    multi: { color: '#ff9a2e', icon: 'balls', label: 'x3' },
    slow: { color: '#4fcf5a', icon: '🐢', label: 'SLOW' },
    sticky: { color: '#c58b2a', icon: '🍯', label: 'STICKY' },
    net: { color: '#2fc6e8', icon: '🫧', label: 'NET' },
    big: { color: '#ff4b4b', icon: 'big', label: 'BIG' },
  };
  // the names in the HUD (DOM text, translated by Kit.lang)
  const PUP_NAME = { wide: 'WIDE', multi: 'MULTI-BALL', slow: 'SLOW BALL', sticky: 'STICKY', net: 'BUBBLE NET', big: 'BIG BALL' };

  function drawBall(g, x, y, r, big) {
    g.fillStyle = big ? '#ff6b2e' : '#ffd23f';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = big ? '#ffd23f' : '#ff4b6b';
    g.fillRect(x - r, y - r * 0.18, r * 2, r * 0.36);
    g.strokeStyle = '#14121f';
    g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  }

  // A capsule: rounded pill with the icon and a short word. The word is canvas text, so it's translated here and the
  // texture is made again in the other language (the cache key has the language in it).
  function pupTexture(kind) {
    const lang = Kit.lang ? Kit.lang.get() : 'en';
    return once('pup' + kind + lang, () => {
      const s = PUP[kind];
      const [c, g] = makeCanvas(256, 128);
      g.fillStyle = '#14121f';
      roundRect(g, 4, 14, 248, 100, 50);
      g.fill();
      g.fillStyle = s.color;
      roundRect(g, 10, 20, 236, 88, 44);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(g, 26, 26, 204, 22, 11);
      g.fill();
      if (s.icon === 'balls') { drawBall(g, 52, 64, 13); drawBall(g, 74, 52, 13); drawBall(g, 74, 78, 13); }
      else if (s.icon === 'big') drawBall(g, 66, 64, 30, true);
      else { g.font = `54px ${G.EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.icon, 66, 68); }
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#14121f';
      g.lineWidth = 7;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const label = Kit.lang ? Kit.lang.t(s.label) : s.label;
      let size = 40;
      g.font = `${size}px ${G.FONT}`;
      while (g.measureText(label).width > 128 && size > 18) { size -= 2; g.font = `${size}px ${G.FONT}`; }
      g.strokeText(label, 172, 67);
      g.fillText(label, 172, 67);
      return toTexture(c);
    });
  }

  // Floating text ("+50", "KABOOM!"): drawn wide, the sprite is scaled 4:1.
  function textTexture(text, color) {
    return once('txt' + text + color, () => {
      const [c, g] = makeCanvas(512, 128);
      g.font = `72px ${G.FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 12;
      g.strokeStyle = '#14121f';
      g.lineJoin = 'round';
      g.strokeText(text, 256, 66);
      g.fillStyle = color;
      g.fillText(text, 256, 66);
      return toTexture(c);
    });
  }

  BB.art = { THEMES, PUP, PUP_NAME, backdrop, floorTexture, blockTexture, crackTexture, ballTexture, padTexture, netTexture, pupTexture, textTexture };
})();
