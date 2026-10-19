/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: BB.TITLE,
  cols: ['Teddy', 'Tommy'],
  keys: [
    ['move the trampoline', 'A D', '← →'],
    ['launch the ball · let go of a sticky ball', 'W or Space', '↑ or Space'],
    ['call your brother · high five', 'T or Enter', 'T or Enter'],
    ['pause · sound', 'P or Esc · M', ''],
  ],
  note: '1 player: either set of keys works, and the mouse moves the trampoline too (click to launch).',
  touch: 'Drag your finger along the bottom: the trampoline follows, just above it. Lift your finger to launch. 2 players: Teddy drags on the left half, Tommy on the right. The round face button (top right) calls your brother.',
});
