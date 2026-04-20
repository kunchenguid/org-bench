const assert = require('node:assert/strict');

const { evaluateSheet } = require('./spreadsheet-core.js');

function getDisplay(results, cellId) {
  return results[cellId] ? results[cellId].display : '';
}

function run() {
  const arithmetic = evaluateSheet({
    A1: '2',
    A2: '3',
    A3: '=A1 + A2 * 4',
  });
  assert.equal(getDisplay(arithmetic, 'A3'), '14');

  const ranges = evaluateSheet({
    A1: '1',
    A2: '2',
    A3: '3',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=COUNT(A1:A3)',
    B4: '=MIN(A1:A3)',
    B5: '=MAX(A1:A3)',
  });
  assert.equal(getDisplay(ranges, 'B1'), '6');
  assert.equal(getDisplay(ranges, 'B2'), '2');
  assert.equal(getDisplay(ranges, 'B3'), '3');
  assert.equal(getDisplay(ranges, 'B4'), '1');
  assert.equal(getDisplay(ranges, 'B5'), '3');

  const branching = evaluateSheet({
    A1: '10',
    A2: '=IF(A1 - 10, 1, 99)',
    A3: '=IF(A1, 7, 8)',
  });
  assert.equal(getDisplay(branching, 'A2'), '99');
  assert.equal(getDisplay(branching, 'A3'), '7');

  const circular = evaluateSheet({
    C1: '=C2',
    C2: '=C1',
  });
  assert.equal(getDisplay(circular, 'C1'), '#CIRC!');
  assert.equal(getDisplay(circular, 'C2'), '#CIRC!');

  const errors = evaluateSheet({
    D1: '=1/0',
    D2: '=MISSING(1)',
    D3: '=(',
  });
  assert.equal(getDisplay(errors, 'D1'), '#DIV/0!');
  assert.equal(getDisplay(errors, 'D2'), '#NAME?');
  assert.equal(getDisplay(errors, 'D3'), '#ERR!');

  const empties = evaluateSheet({
    E1: '=Z99 + 5',
  });
  assert.equal(getDisplay(empties, 'E1'), '5');

  console.log('formula-engine tests passed');
}

run();
