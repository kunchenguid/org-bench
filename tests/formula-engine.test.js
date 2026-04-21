const test = require('node:test');
const assert = require('node:assert/strict');

const { FormulaEngine } = require('../src/formula-engine');

function makeEngine(cells) {
  return new FormulaEngine({
    getCell(address) {
      return Object.prototype.hasOwnProperty.call(cells, address) ? cells[address] : '';
    },
  });
}

test('evaluates arithmetic with precedence and cell references', () => {
  const engine = makeEngine({ A1: '2', A2: '3', A3: '=A1+A2*4' });
  assert.equal(engine.evaluateCell('A3').value, 14);
});

test('evaluates ranges and aggregate functions', () => {
  const engine = makeEngine({
    A1: '2',
    A2: '4',
    A3: '6',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=COUNT(A1:A3)',
  });

  assert.equal(engine.evaluateCell('B1').value, 12);
  assert.equal(engine.evaluateCell('B2').value, 4);
  assert.equal(engine.evaluateCell('B3').value, 3);
});

test('supports boolean logic, comparisons, and IF', () => {
  const engine = makeEngine({
    A1: '5',
    A2: '=A1>=5',
    A3: '=IF(A2, "ok", "no")',
    A4: '=AND(TRUE, NOT(FALSE), A1<>4)',
  });

  assert.equal(engine.evaluateCell('A2').value, true);
  assert.equal(engine.evaluateCell('A3').value, 'ok');
  assert.equal(engine.evaluateCell('A4').value, true);
});

test('supports concatenation and empty-cell coercion', () => {
  const engine = makeEngine({
    A1: '=CONCAT("Total: ", B1)',
    A2: '=B2+5',
    B1: '7',
  });

  assert.equal(engine.evaluateCell('A1').value, 'Total: 7');
  assert.equal(engine.evaluateCell('A2').value, 5);
});

test('surfaces divide by zero, unknown function, and circular errors', () => {
  const engine = makeEngine({
    A1: '=1/0',
    A2: '=MISSING(1)',
    A3: '=A4',
    A4: '=A3',
  });

  assert.equal(engine.evaluateCell('A1').error, '#DIV/0!');
  assert.equal(engine.evaluateCell('A2').error, '#NAME?');
  assert.equal(engine.evaluateCell('A3').error, '#CIRC!');
});

test('preserves raw formulas while returning spreadsheet booleans for display', () => {
  const engine = makeEngine({ A1: '=1<2', A2: '=ROUND(ABS(-3.2), 0)' });

  assert.deepEqual(engine.evaluateCell('A1'), {
    value: true,
    display: 'TRUE',
    raw: '=1<2',
    error: null,
  });

  assert.deepEqual(engine.evaluateCell('A2'), {
    value: 3,
    display: '3',
    raw: '=ROUND(ABS(-3.2), 0)',
    error: null,
  });
});

test('accepts absolute references during evaluation and exposes formula dependencies', () => {
  const engine = makeEngine({
    A1: '2',
    B2: '5',
    C3: '7',
    D4: '=$A$1+B$2+$C3+SUM(A1:B2)',
  });

  assert.equal(engine.evaluateCell('D4').value, 21);
  assert.deepEqual(engine.getDependencies('D4'), ['A1', 'A2', 'B1', 'B2', 'C3']);
});
