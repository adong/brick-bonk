/* 中文 for Brick Bonk: the words on the page, the toasts, the level and world names, the level tips, the ? panel,
   and the canvas text in the 3D scene (KABOOM!, the power-up capsules and names, wrapped in Kit.lang.t in js/art.js
   and js/view.js). Stays in English on purpose: the kids' names (TEDDY, TOMMY) and the game's name (Alan picks the
   names), and the key labels (A D, Space shows as 空格 through the kit). */
(function () {
  const L = Kit.lang;
  L.keep(['TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'Brick Bonk', BB.TITLE, 'Esc', 'TEDDY & TOMMY', '❚❚']);

  // the 18 levels: names (the banner, the level buttons' tooltips) and tips (the banner)
  const LEVELS = [
    ['Hello, Blocks!', '积木你好！', 'Bounce the ball on your trampoline and bonk every block!', '用蹦床把球弹起来，把积木全都撞掉！'],
    ['Rainbow', '彩虹', 'Catch the presents that fall out. They are power-ups!', '接住掉下来的礼物，它们是道具！'],
    ['Big Heart', '大爱心', 'Hit the ball with the end of your trampoline to send it sideways.', '用蹦床的边接球，球就会斜着飞出去。'],
    ['Tough Blocks', '硬积木', 'Shiny blocks need two bonks. Gold ones need three!', '亮亮的积木要撞两下，金色的要撞三下！'],
    ['Kaboom!', '轰隆！', 'Bonk a red TNT block and KABOOM: the blocks around it pop too!', '撞到红色的炸药积木就会轰隆一声，旁边的积木也一起炸掉！'],
    ['Smiley', '笑脸', 'Smile! Can you bonk the eyes first?', '笑一个！你能先撞掉眼睛吗？'],
    ['Steel Fence', '铁栅栏', 'Grey steel never breaks. Bounce the ball through the gaps!', '灰色的铁块撞不坏，让球从缝里钻过去！'],
    ['Rocket', '火箭', '3, 2, 1... BONK! Blast the rocket to bits.', '3、2、1……砰！把火箭撞个粉碎。'],
    ['Flower', '小花', 'A flower for the garden. The stem is tough!', '花园里的一朵小花，花茎可硬啦！'],
    ['Candy Canes', '拐杖糖', 'Stripes and sweets. Grab a MULTI-BALL present!', '条纹和糖果，快去接多球礼物！'],
    ['Fort', '城堡', 'The fort has a big door at the bottom. Get the ball inside!', '城堡下面有个大门，把球打进去！'],
    ['TNT Party', '炸药派对', 'TNT next to TNT goes off one after another. BOOM BOOM BOOM!', '炸药挨着炸药，会一个接一个地炸，轰！轰！轰！'],
    ['Flying Saucer', '飞碟', 'Tommy has this saucer on his T-shirt!', 'Tommy 的 T 恤上就有这个飞碟！'],
    ['Dino', '小恐龙', 'Roar! A dino from Tommy\'s T-shirt.', '嗷呜！Tommy T 恤上的小恐龙。'],
    ['Big TT', '大大的 TT', 'T for Teddy and T for Tommy!', 'Teddy 的 T，Tommy 的 T！'],
    ['Ringed Planet', '光环星球', 'A planet with a ring around it, far out in space.', '太空深处，一颗带着光环的星球。'],
    ['Space Maze', '太空迷宫', 'Steel walls everywhere. Find the way in!', '到处都是铁墙，找到进去的路！'],
    ['The Big Bonk', '超级大撞击', 'The last one! Everything at once. You can do it!', '最后一关！什么都有，你一定行！'],
  ];
  const dict = {};
  for (const [en, zh, tipEn, tipZh] of LEVELS) { dict[en] = zh; dict[tipEn] = tipZh; }
  const WORLDS = { 'Toy Room': '玩具房', Garden: '花园', 'Outer Space': '太空' };
  Object.assign(dict, WORLDS);

  Object.assign(dict, {
    // title screen
    'Teddy & Tommy bonk the blocks!': 'Teddy 和 Tommy 来打砖块！',
    '1 PLAYER': '单人', '2 PLAYERS': '双人', 'Teddy + Tommy together': 'Teddy 和 Tommy 一起玩',
    '🐣 EASY': '🐣 简单', '🔥 NORMAL': '🔥 普通', LEVEL: '关卡', '★': '★',
    'PICK A LEVEL': '选关卡', 'open every level': '打开所有关卡',
    // HUD
    'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'press T': '按 T', 'tap for another ball': '再点一下，再来一个球',
    'HIGH FIVE! ✋': '击掌！✋', 'HIGH FIVE': '击掌',
    '← DRAG HERE →': '← 在这里拖动 →', '← TEDDY · TOMMY →': '← TEDDY · TOMMY →',
    'TAP OR PRESS SPACE TO LAUNCH!': '点一下或按空格发球！', 'TAP TO LET GO!': '点一下放开球！',
    // power-ups (the HUD and the capsules)
    WIDE: '变宽', 'MULTI-BALL': '多球', 'SLOW BALL': '慢慢球', STICKY: '粘粘', 'BUBBLE NET': '泡泡网', 'BIG BALL': '大球',
    x3: '×3', SLOW: '慢', NET: '网', BIG: '大',
    'WIDE!': '变宽！', 'MULTI-BALL!': '多球！', 'SLOW BALL!': '慢慢球！', 'STICKY!': '粘粘！', 'BUBBLE NET!': '泡泡网！', 'BIG BALL!': '大球！',
    'KABOOM!': '轰隆！',
    // toasts
    'OOPS! 💔': '哎呀！💔', 'OUT OF HEARTS! 💔': '没有爱心了！💔', '🫧 SAVED BY THE BUBBLE NET!': '🫧 泡泡网接住啦！', '🫧 BOING!': '🫧 嘣！',
    'LEVEL CLEAR! 🎉': '过关啦！🎉', 'ALL CLEAR! 🎉': '全部通关！🎉', '✨ THE BALL IS HELPING!': '✨ 球在帮你找砖块！',
    '✋ HIGH FIVE!': '✋ 击掌！', 'HIGH FIVE BALL! 🫧': '击掌送球！🫧', 'HIGH FIVE! KEEP BONKING!': '击掌！继续撞！',
    // screens
    PAUSED: '暂停中', '▶ PLAY': '▶ 继续', '↻ START LEVEL AGAIN': '↻ 重新开始这一关', '🏠 MENU': '🏠 菜单',
    'LEVEL CLEAR!': '过关啦！', 'ALL CLEAR!': '全部通关！', 'NEXT LEVEL ▶': '下一关 ▶', 'THE END ▶': '完成 ▶', '↻ AGAIN': '↻ 再玩一次',
    'OH NO!': '哎呀！', 'KEEP GOING!': '继续加油！', 'YOU DID IT!': '你做到了！', 'PLAY AGAIN': '再玩一次', BACK: '返回',
    // the ? panel
    'move the trampoline': '移动蹦床', 'launch the ball · let go of a sticky ball': '发球 · 放开粘住的球',
    '1 player: either set of keys works, and the mouse moves the trampoline too (click to launch).': '单人时两套按键都能用，用鼠标也能移动蹦床（点一下发球）。',
    'Drag your finger along the bottom: the trampoline follows, just above it. Lift your finger to launch. 2 players: Teddy drags on the left half, Tommy on the right. The round face button (top right) calls your brother.':
      '手指在下面拖动，蹦床就跟着走，一直在手指上面。手指离开屏幕就发球。双人时 Teddy 在左半边拖，Tommy 在右半边拖。右上角的圆形头像按钮可以叫兄弟来帮忙。',
    'W or Space': 'W 或 空格', '↑ or Space': '↑ 或 空格', 'T or Enter': 'T 或 回车', 'P or Esc · M': 'P 或 Esc · M',
  });
  L.add(dict);

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', JUICE: '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  const N = '(TEDDY|TOMMY)';
  L.rule(new RegExp(`^CALL ${N}$`), '叫 $1');
  L.rule(new RegExp(`^${N} IS HERE!$`), '$1 来啦！');
  L.rule(new RegExp(`^${N} IS COMING TO HELP!$`), '$1 来帮忙啦！');
  L.rule(new RegExp(`^${N} SAYS: EXTRA BALL!$`), '$1 说：再来一个球！');
  L.rule(new RegExp(`^${N} SAYS: KEEP BONKING!$`), '$1 说：继续撞！');
  L.rule(new RegExp(`^BYE BYE, ${N}! 👋$`), '$1 拜拜！👋');
  L.rule(new RegExp(`^(\\S+) (ICE CREAM|WATER|JUICE|COOKIE|WATERMELON|BANANA) FROM ${N}!$`), (m, e, item, who) => `${e} ${who} 送来的${TREAT[item]}！`);
  L.rule(/^(\S+) (WIDE TRAMPOLINE|MULTI-BALL|SLOW BALL|STICKY|BUBBLE NET|BIG BALL)!$/, (m, e, k) => `${e} ${{ 'WIDE TRAMPOLINE': '蹦床变宽', 'MULTI-BALL': '多球', 'SLOW BALL': '慢慢球', STICKY: '粘粘', 'BUBBLE NET': '泡泡网', 'BIG BALL': '大球' }[k]}！`);
  L.rule(/^ready in (\d+)$/, '$1 秒后可以');
  L.rule(/^HIGH FIVE IN (\d+)…$/, '$1 秒后可以击掌…');
  L.rule(/^LEVEL (\d+)$/, '第 $1 关');
  L.rule(/^LEVEL (\d+) · (.+)$/, (m, n, w) => `第 ${n} 关 · ${WORLDS[w] || w}`);
  L.rule(/^SCORE ([\d,]+)$/, '得分 $1');
  L.rule(/^BEST ([\d,]+)$/, '最高分 $1');
  L.rule(/^NEW BEST! ([\d,]+)$/, '新纪录！$1');
  L.rule(/^BEST SCORE ([\d,]+) · (\d+) ⭐$/, '最高分 $1 · $2 ⭐');
  L.rule(/^Out of hearts on level (\d+)\. Keep going: the blocks you broke stay broken!$/, '第 $1 关的爱心用完了。继续加油：撞掉的积木不会回来！');
  L.rule(/^(Teddy and Tommy|Teddy|Tommy) bonked all (\d+) levels and scored ([\d,]+)!$/, (m, who, n, s) => `${who === 'Teddy and Tommy' ? 'Teddy 和 Tommy' : who} 打通了全部 ${n} 关，得了 ${s} 分！`);
})();
