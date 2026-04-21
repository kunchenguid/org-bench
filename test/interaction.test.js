const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePasteTarget } = require('../interaction.js');

test('paste expands from the active cell when a single cell is selected', () => {
  const target = resolvePasteTarget(
    { top: 4, left: 2, bottom: 4, right: 2 },
    { height: 2, width: 3 }
  );

  assert.deepEqual(target, { top: 4, left: 2, bottom: 5, right: 4 });
});

test('paste fills the current selection when its size matches the copied block', () => {
  const target = resolvePasteTarget(
    { top: 10, left: 5, bottom: 11, right: 7 },
    { height: 2, width: 3 }
  );

  assert.deepEqual(target, { top: 10, left: 5, bottom: 11, right: 7 });
});

test('paste falls back to the active cell when the selected range size does not match', () => {
  const target = resolvePasteTarget(
    { top: 10, left: 5, bottom: 13, right: 8 },
    { height: 2, width: 3 }
  );

  assert.deepEqual(target, { top: 10, left: 5, bottom: 11, right: 7 });
});
