const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAnimationState,
  queueCardMotion,
  queueDamageNumber,
  queueSweep,
  queueFlash,
  queueGhost,
  stepAnimationState,
} = require('../src/animation.js');

test('card motion interpolates and completes after its duration', () => {
  const fx = createAnimationState();

  queueCardMotion(fx, {
    card: { name: 'Ember Fox', type: 'unit' },
    from: { x: 10, y: 20, w: 100, h: 140 },
    to: { x: 210, y: 120, w: 120, h: 168 },
    duration: 0.4,
  });

  stepAnimationState(fx, 0.2);

  assert.equal(fx.motions.length, 1);
  assert.equal(Math.round(fx.motions[0].rect.x), 110);
  assert.equal(Math.round(fx.motions[0].rect.y), 70);

  stepAnimationState(fx, 0.25);

  assert.equal(fx.motions.length, 0);
});

test('damage numbers rise upward and expire cleanly', () => {
  const fx = createAnimationState();

  queueDamageNumber(fx, { x: 100, y: 240, text: '-2', life: 1 });
  stepAnimationState(fx, 0.5);

  assert.equal(fx.damageNumbers.length, 1);
  assert.equal(fx.damageNumbers[0].y < 240, true);
  assert.equal(fx.damageNumbers[0].alpha < 1, true);

  stepAnimationState(fx, 0.6);

  assert.equal(fx.damageNumbers.length, 0);
});

test('sweeps, flashes, and ghosts share the same lifecycle stepping', () => {
  const fx = createAnimationState();

  queueSweep(fx, { text: 'Enemy Turn', life: 1.1 });
  queueFlash(fx, { x: 40, y: 50, w: 80, h: 90, life: 0.3 });
  queueGhost(fx, {
    card: { name: 'Mist Wisp', type: 'unit' },
    rect: { x: 20, y: 30, w: 100, h: 140 },
    life: 0.4,
  });

  stepAnimationState(fx, 0.2);
  assert.equal(fx.sweeps.length, 1);
  assert.equal(fx.flashes.length, 1);
  assert.equal(fx.ghosts.length, 1);
  assert.equal(fx.ghosts[0].alpha < 1, true);

  stepAnimationState(fx, 0.25);
  assert.equal(fx.flashes.length, 0);
  assert.equal(fx.ghosts.length, 0);

  stepAnimationState(fx, 0.7);
  assert.equal(fx.sweeps.length, 0);
});
