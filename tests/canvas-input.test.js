const test = require('node:test');
const assert = require('node:assert/strict');

const { CanvasInputController } = require('../src/canvas-input.js');

function createCanvasStub() {
  const handlers = new Map();
  return {
    width: 1280,
    height: 720,
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1280, height: 720 };
    },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    removeEventListener(type) {
      handlers.delete(type);
    },
    emit(type, event) {
      const handler = handlers.get(type);
      if (handler) {
        handler({
          clientX: 0,
          clientY: 0,
          preventDefault() {},
          ...event,
        });
      }
    },
  };
}

function region(id, x, y, width, height, zIndex = 0) {
  return { id, x, y, width, height, zIndex };
}

test('hit testing prefers highest z-index region', () => {
  const canvas = createCanvasStub();
  const controller = new CanvasInputController({
    canvas,
    getRegions: () => [
      region('board', 0, 0, 500, 500, 0),
      region('card', 100, 100, 200, 300, 10),
      region('tooltip', 120, 120, 80, 80, 20),
    ],
  });

  const hit = controller.getRegionAt({ x: 140, y: 140 });
  assert.equal(hit.id, 'tooltip');
});

test('clicking a region emits hover, press, release, and click', () => {
  const canvas = createCanvasStub();
  const events = [];
  new CanvasInputController({
    canvas,
    getRegions: () => [region('playable-card', 100, 100, 160, 220, 5)],
    onEvent(event) {
      events.push(`${event.type}:${event.regionId ?? 'none'}`);
    },
  });

  canvas.emit('pointermove', { clientX: 120, clientY: 130, pointerId: 1 });
  canvas.emit('pointerdown', { clientX: 120, clientY: 130, pointerId: 1 });
  canvas.emit('pointerup', { clientX: 120, clientY: 130, pointerId: 1 });

  assert.deepEqual(events, [
    'hoverstart:playable-card',
    'pointerdown:playable-card',
    'pointerup:playable-card',
    'click:playable-card',
  ]);
});

test('dragging past threshold emits drag lifecycle and suppresses click', () => {
  const canvas = createCanvasStub();
  const events = [];
  new CanvasInputController({
    canvas,
    dragThreshold: 8,
    getRegions: () => [region('attacker', 100, 100, 160, 220, 5)],
    onEvent(event) {
      events.push(`${event.type}:${event.regionId ?? 'none'}`);
    },
  });

  canvas.emit('pointermove', { clientX: 120, clientY: 130, pointerId: 1 });
  canvas.emit('pointerdown', { clientX: 120, clientY: 130, pointerId: 1 });
  canvas.emit('pointermove', { clientX: 145, clientY: 130, pointerId: 1 });
  canvas.emit('pointermove', { clientX: 180, clientY: 140, pointerId: 1 });
  canvas.emit('pointerup', { clientX: 180, clientY: 140, pointerId: 1 });

  assert.deepEqual(events, [
    'hoverstart:attacker',
    'pointerdown:attacker',
    'dragstart:attacker',
    'dragmove:attacker',
    'dragmove:attacker',
    'pointerup:attacker',
    'dragend:attacker',
  ]);
});
