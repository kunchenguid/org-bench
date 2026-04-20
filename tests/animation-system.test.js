const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clamp01,
  easeOutCubic,
  idleBreath,
  cardFanTransform,
  createEffectTimeline,
} = require('../animation-system.js');

test('clamp01 bounds values to the unit interval', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(9), 1);
});

test('easeOutCubic starts at zero and ends at one', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test('idleBreath returns a subtle looping scale and lift', () => {
  const pose = idleBreath(250);
  assert.ok(pose.scale > 1);
  assert.ok(pose.scale < 1.03);
  assert.ok(Math.abs(pose.y) <= 5);
});

test('cardFanTransform spreads cards around the center of a hand', () => {
  const left = cardFanTransform(0, 5, 1200, 720);
  const center = cardFanTransform(2, 5, 1200, 720);
  const right = cardFanTransform(4, 5, 1200, 720);

  assert.ok(left.x < center.x);
  assert.ok(right.x > center.x);
  assert.ok(left.rotation < 0);
  assert.ok(right.rotation > 0);
  assert.ok(center.y > left.y);
  assert.ok(center.y > right.y);
});

test('attack timeline accelerates into impact and settles back', () => {
  const timeline = createEffectTimeline('attack', {
    from: { x: 100, y: 200 },
    to: { x: 340, y: 180 },
  });

  const start = timeline.sample(0);
  const windup = timeline.sample(90);
  const impact = timeline.sample(220);
  const settle = timeline.sample(430);

  assert.equal(start.progress, 0);
  assert.ok(windup.position.x < impact.position.x);
  assert.ok(impact.impactFlash > 0.7);
  assert.ok(impact.shake > 4);
  assert.ok(settle.position.x < impact.position.x);
  assert.equal(timeline.duration, 480);
});

test('damage-number timeline rises and fades out', () => {
  const timeline = createEffectTimeline('damage-number', {
    origin: { x: 300, y: 240 },
    amount: 4,
  });

  const early = timeline.sample(60);
  const late = timeline.sample(700);

  assert.equal(early.label, '-4');
  assert.ok(early.position.y < 240);
  assert.ok(early.opacity > late.opacity);
  assert.equal(late.opacity, 0);
});

test('turn-banner timeline sweeps across the board and fades', () => {
  const timeline = createEffectTimeline('turn-banner', {
    width: 1200,
    height: 720,
    text: 'Enemy Turn',
  });

  const start = timeline.sample(0);
  const middle = timeline.sample(500);
  const end = timeline.sample(1250);

  assert.ok(start.position.x < 0);
  assert.ok(Math.abs(middle.position.x - 600) < 40);
  assert.equal(middle.text, 'Enemy Turn');
  assert.equal(end.opacity, 0);
});
