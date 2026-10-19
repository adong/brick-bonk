#!/usr/bin/env node
/* Brick Bonk: the headless check. Loads the same rules the game uses (js/sim.js, no Three.js) and runs js/checks.js:
   the autopilot on every level, the top-speed tunnelling soak, the loop check and the frame-rate check, each with a
   sabotaged version that must fail.   node tools/check.js [--quick] */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Date, Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['title.js', 'sim.js', 'levels.js', 'checks.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const res = ctx.BB.checks.run({ quick: process.argv.includes('--quick') });
console.log(res.lines.join('\n'));
console.log(res.ok ? '\nALL CHECKS PASS' : `\n${res.fails.length} CHECK(S) FAILED`);
process.exit(res.ok ? 0 : 1);
