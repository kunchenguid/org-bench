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
}

run();
console.log('clipboard tests passed');
