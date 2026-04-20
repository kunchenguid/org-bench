const assert = require('assert');
const clipboard = require('./clipboard.js');

function run() {
  assert.deepStrictEqual(
    clipboard.cellsToClearAfterCut(
      { row: 0, col: 0 },
      [['1'], ['=A1*2']],
      { row: 0, col: 1 }
    ),
    [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ],
    'moving a cut range should clear the original cells after paste'
  );

  assert.deepStrictEqual(
    clipboard.cellsToClearAfterCut(
      { row: 0, col: 0 },
      [['1', '2']],
      { row: 0, col: 0 }
    ),
    [],
    'pasting a cut range back onto itself should not clear anything'
  );

  assert.deepStrictEqual(
    clipboard.resolvePasteTarget(
      { start: { row: 2, col: 2 }, end: { row: 3, col: 3 } },
      { row: 3, col: 3 },
      [['1', '2'], ['3', '4']]
    ),
    { row: 2, col: 2 },
    'matching-size selections should paste into the selection top-left, not the active cell'
  );

  assert.deepStrictEqual(
    clipboard.resolvePasteTarget(
      { start: { row: 2, col: 2 }, end: { row: 4, col: 4 } },
      { row: 4, col: 4 },
      [['1', '2'], ['3', '4']]
    ),
    { row: 4, col: 4 },
    'non-matching selections should still paste from the active cell'
  );
}

run();
console.log('clipboard tests passed');
