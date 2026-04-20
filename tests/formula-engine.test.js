const assert = require('assert');
const {
  evaluateFormula,
  shiftFormula,
  createCellId,
} = require('../formula-engine.js');

function evalInGrid(formula, cells) {
  return evaluateFormula(formula, {
    getCellRaw(cellId) {
      return cells[cellId] ?? '';
    },
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('createCellId builds spreadsheet coordinates', () => {
  assert.strictEqual(createCellId(0, 0), 'A1');
  assert.strictEqual(createCellId(25, 99), 'Z100');
});

test('evaluateFormula resolves arithmetic with references', () => {
  const result = evalInGrid('=A1+B2*2', {
    A1: '3',
    B2: '4',
  });

  assert.strictEqual(result.value, 11);
  assert.strictEqual(result.display, '11');
});

test('evaluateFormula supports aggregate functions over ranges', () => {
  const result = evalInGrid('=SUM(A1:A3)', {
    A1: '3',
    A2: '4',
    A3: '5',
  });

  assert.strictEqual(result.value, 12);
  assert.strictEqual(result.display, '12');
});

test('evaluateFormula handles string concatenation', () => {
  const result = evalInGrid('="Total: "&SUM(A1:A2)', {
    A1: '2',
    A2: '8',
  });

  assert.strictEqual(result.value, 'Total: 10');
  assert.strictEqual(result.display, 'Total: 10');
});

test('evaluateFormula detects circular references', () => {
  const result = evalInGrid('=B1', {
    B1: '=A1',
    A1: '=B1',
  });

  assert.strictEqual(result.error, '#CIRC!');
  assert.strictEqual(result.display, '#CIRC!');
});

test('shiftFormula updates relative references for paste', () => {
  assert.strictEqual(
    shiftFormula('=A1+$B$2+C$3+$D4', 2, 1),
    '=B3+$B$2+D$3+$D6'
  );
});
