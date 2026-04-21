const test = require('node:test');
const assert = require('node:assert/strict');

const {
  coordsToRef,
  refToCoords,
  evaluateSheet,
  moveSelection,
} = require('../core.js');

test('coordsToRef and refToCoords round-trip basic positions', () => {
  assert.equal(coordsToRef(0, 0), 'A1');
  assert.equal(coordsToRef(25, 99), 'Z100');
  assert.deepEqual(refToCoords('C7'), { col: 2, row: 6 });
});

test('evaluateSheet resolves arithmetic formulas and references', () => {
  const cells = {
    A1: '4',
    A2: '6',
    A3: '=A1+A2*2',
  };

  const evaluated = evaluateSheet(cells);

  assert.equal(evaluated.A3.display, '16');
});

test('evaluateSheet resolves SUM over a range', () => {
  const cells = {
    A1: '1',
    A2: '2',
    A3: '3',
    B1: '=SUM(A1:A3)',
  };

  const evaluated = evaluateSheet(cells);

  assert.equal(evaluated.B1.display, '6');
});

test('evaluateSheet reports circular references', () => {
  const cells = {
    A1: '=B1',
    B1: '=A1',
  };

  const evaluated = evaluateSheet(cells);

  assert.equal(evaluated.A1.display, '#CIRC!');
  assert.equal(evaluated.B1.display, '#CIRC!');
});

test('moveSelection clamps at the grid edges', () => {
  assert.deepEqual(moveSelection({ col: 0, row: 0 }, { col: -1, row: -1 }), {
    col: 0,
    row: 0,
  });
  assert.deepEqual(moveSelection({ col: 25, row: 99 }, { col: 1, row: 1 }), {
    col: 25,
    row: 99,
  });
});
