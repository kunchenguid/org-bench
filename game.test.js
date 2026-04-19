
test('hero portraits exist in DOM', () => {
  const playerPortrait = document.querySelector('.hero-portrait.player');
  const opponentPortrait = document.querySelector('.hero-portrait.opponent');
  assertExists(playerPortrait, 'player portrait should exist');
  assertExists(opponentPortrait, 'opponent portrait should exist');
});

test('HUD canvas exists', () => {
  const hudCanvas = document.getElementById('hud-canvas');
  assertExists(hudCanvas, 'hud canvas should exist');
});

test('damage canvas exists', () => {
  const damageCanvas = document.getElementById('damage-canvas');
  assertExists(damageCanvas, 'damage canvas should exist');
});

test('turn banner exists', () => {
  const banner = document.getElementById('turn-banner');
  assertExists(banner, 'turn banner should exist');
  assertExists(document.getElementById('turn-display'), 'turn display should exist');
  assertExists(document.getElementById('timer-display'), 'timer display should exist');
});

test('end turn button exists', () => {
  const btn = document.getElementById('end-turn-btn');
  assertExists(btn, 'end turn button should exist');
  assertEquals(btn.tagName, 'BUTTON', 'should be a button element');
});