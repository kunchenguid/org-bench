const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fanCardTransform,
  attackLungeOffset,
  damageNumberState,
  bannerSweep,
  manaShimmer,
  stepParticles,
} = require('../motion.js');

test('fanCardTransform widens the outer cards and lifts hovered cards', () => {
  const left = fanCardTransform(0, 5, false, 0.2);
  const middle = fanCardTransform(2, 5, false, 0.2);
  const hovered = fanCardTransform(2, 5, true, 0.2);

  assert.ok(left.offsetX < middle.offsetX);
  assert.ok(left.angle < middle.angle);
  assert.ok(hovered.lift > middle.lift);
});

test('attackLungeOffset peaks midway and resolves to rest', () => {
  const half = attackLungeOffset({ x: 100, y: -40 }, 0.5);
  const end = attackLungeOffset({ x: 100, y: -40 }, 1);

  assert.ok(half.x > 25);
  assert.ok(half.y < -8);
  assert.deepEqual(end, { x: 0, y: 0 });
});

test('damageNumberState rises and fades over time', () => {
  const early = damageNumberState({ x: 40, y: 60, driftX: 10 }, 0.1, 1);
  const late = damageNumberState({ x: 40, y: 60, driftX: 10 }, 0.9, 1);

  assert.ok(early.y < 60);
  assert.ok(late.y < early.y);
  assert.ok(early.alpha > late.alpha);
});

test('bannerSweep and manaShimmer stay normalized for rendering', () => {
  const banner = bannerSweep(0.4, 1.2);
  const shimmer = manaShimmer(0.5, 1.3);

  assert.ok(banner.alpha >= 0 && banner.alpha <= 1);
  assert.ok(banner.x >= -1 && banner.x <= 1);
  assert.ok(shimmer.glow >= 0 && shimmer.glow <= 1);
  assert.ok(shimmer.spark >= 0 && shimmer.spark <= 1);
});

test('stepParticles advances particles and wraps them inside bounds', () => {
  const particles = [{ x: 98, y: 3, vx: 10, vy: -8, size: 2, alpha: 0.5, phase: 1.25 }];
  const next = stepParticles(particles, 0.5, 100, 80);

  assert.equal(next.length, 1);
  assert.ok(next[0].x >= 0 && next[0].x <= 100);
  assert.ok(next[0].y >= 0 && next[0].y <= 80);
  assert.notEqual(next[0].x, particles[0].x);
  assert.equal(next[0].phase, 1.25);
});
