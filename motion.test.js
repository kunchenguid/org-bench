const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MotionTimeline,
  createCardFlyIn,
  createPlayToBoard,
  createAttackLunge,
  createHitFlash,
  createFloatingDamage,
  createDissolveDeath,
  createTurnBannerSweep,
  eases,
} = require('./motion.js');

test('card fly-in starts at source and settles at destination', () => {
  const clip = createCardFlyIn({
    fromX: -140,
    fromY: 520,
    toX: 220,
    toY: 340,
    fromRotation: -0.5,
    toRotation: 0.1,
    fromScale: 0.8,
    toScale: 1,
    lift: 48,
    duration: 600,
    delay: 100,
  });

  const start = clip.sample(100);
  const middle = clip.sample(400);
  const end = clip.sample(700);

  assert.equal(start.x, -140);
  assert.equal(start.y, 520);
  assert.equal(start.rotation, -0.5);
  assert.equal(start.scale, 0.8);
  assert.equal(end.x, 220);
  assert.equal(end.y, 340);
  assert.equal(end.rotation, 0.1);
  assert.equal(end.scale, 1);
  assert.ok(middle.y < 520);
  assert.ok(middle.y < 340);
});

test('attack lunge overshoots then returns home', () => {
  const clip = createAttackLunge({
    fromX: 180,
    fromY: 260,
    targetX: 480,
    targetY: 220,
    impactDistance: 0.28,
    duration: 420,
  });

  const start = clip.sample(0);
  const impact = clip.sample(250);
  const finish = clip.sample(420);

  assert.deepEqual({ x: start.x, y: start.y }, { x: 180, y: 260 });
  assert.ok(impact.x > 180);
  assert.ok(impact.x < 480);
  assert.equal(finish.x, 180);
  assert.equal(finish.y, 260);
  assert.equal(finish.progress, 1);
});

test('hit flash decays alpha and shake to zero', () => {
  const clip = createHitFlash({ amplitude: 18, duration: 240, flashes: 3 });

  const start = clip.sample(0);
  const middle = clip.sample(120);
  const end = clip.sample(240);

  assert.equal(start.alpha, 1);
  assert.equal(start.shakeX, 0);
  assert.ok(middle.alpha < 1);
  assert.ok(Math.abs(middle.shakeX) <= 18);
  assert.equal(end.alpha, 0);
  assert.equal(end.shakeX, 0);
});

test('floating damage rises, scales, and fades out', () => {
  const clip = createFloatingDamage({ x: 320, y: 180, amount: 5, duration: 900, rise: 72 });

  const start = clip.sample(0);
  const peak = clip.sample(300);
  const end = clip.sample(900);

  assert.equal(start.text, '-5');
  assert.equal(start.y, 180);
  assert.ok(peak.y < 180);
  assert.ok(peak.scale > start.scale);
  assert.equal(end.alpha, 0);
});

test('dissolve death completes with zero alpha and full dissolve', () => {
  const clip = createDissolveDeath({ duration: 500, spin: 0.35, shrink: 0.2 });
  const end = clip.sample(500);

  assert.equal(end.alpha, 0);
  assert.equal(end.dissolve, 1);
  assert.equal(end.scale, 0.2);
  assert.equal(end.rotation, 0.35);
});

test('turn banner sweep travels across screen and fades at the edges', () => {
  const clip = createTurnBannerSweep({ width: 1280, height: 720, duration: 1100, label: 'Enemy Turn' });

  const start = clip.sample(0);
  const center = clip.sample(550);
  const end = clip.sample(1100);

  assert.equal(start.label, 'Enemy Turn');
  assert.equal(start.centerX, -256);
  assert.ok(center.centerX > 300 && center.centerX < 980);
  assert.equal(end.centerX, 1536);
  assert.equal(end.alpha, 0);
});

test('play to board keeps card lifted early and lands flat', () => {
  const clip = createPlayToBoard({
    fromX: 210,
    fromY: 650,
    toX: 500,
    toY: 330,
    arcHeight: 120,
    fromRotation: -0.3,
    toRotation: 0,
    duration: 700,
  });

  const early = clip.sample(150);
  const end = clip.sample(700);

  assert.ok(early.y < 650);
  assert.equal(end.x, 500);
  assert.equal(end.y, 330);
  assert.equal(end.rotation, 0);
});

test('timeline composes clips at offsets', () => {
  const timeline = new MotionTimeline();
  timeline.add(createHitFlash({ duration: 200 }), 0);
  timeline.add(createFloatingDamage({ x: 0, y: 0, amount: 2, duration: 300 }), 120);

  const start = timeline.sample(0);
  const overlap = timeline.sample(150);
  const end = timeline.sample(500);

  assert.equal(start.length, 1);
  assert.equal(overlap.length, 2);
  assert.equal(end.length, 0);
  assert.equal(timeline.duration, 420);
});

test('ease helpers clamp outside the unit interval', () => {
  assert.equal(eases.clamp01(-1.2), 0);
  assert.equal(eases.clamp01(2.4), 1);
  assert.equal(eases.outCubic(1), 1);
});
