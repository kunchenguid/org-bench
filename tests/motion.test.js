const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fanCardTransform,
  damageNumberState,
  manaShimmer,
} = require('../motion.js');

test('fanCardTransform fans outer cards and lifts hovered cards', () => {
  const left = fanCardTransform(0, 5, false, 0.15);
  const middle = fanCardTransform(2, 5, false, 0.15);
  const hovered = fanCardTransform(2, 5, true, 0.15);

  assert.ok(left.offsetX < middle.offsetX);
  assert.ok(left.angle < middle.angle);
  assert.ok(hovered.lift > middle.lift);
});

test('damageNumberState rises and fades across its lifetime', () => {
  const early = damageNumberState({ x: 40, y: 60, driftX: 12 }, 0.1, 1);
  const late = damageNumberState({ x: 40, y: 60, driftX: 12 }, 0.9, 1);

  assert.ok(early.y < 60);
  assert.ok(late.y < early.y);
  assert.ok(early.alpha > late.alpha);
});

test('manaShimmer stays normalized for rendering', () => {
  const shimmer = manaShimmer(0.5, 1.2);

  assert.ok(shimmer.glow >= 0 && shimmer.glow <= 1);
  assert.ok(shimmer.spark >= 0 && shimmer.spark <= 1);
});
