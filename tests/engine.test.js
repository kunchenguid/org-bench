const assert = require('node:assert/strict');

const { createEngine } = require('../src/engine.js');

function createGrid(cells) {
  return Object.fromEntries(Object.entries(cells).map(([key, raw]) => [key, { raw }]));
}

function evaluate(cells) {
  const engine = createEngine();
  return engine.evaluateSheet(createGrid(cells));
}

function getDisplay(result, address) {
  return result.cells[address].display;
}

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('evaluates arithmetic with precedence and parentheses', () => {
  const result = evaluate({ A1: '=1+2*3', A2: '=(1+2)*3', A3: '=-5+2' });

  assert.equal(getDisplay(result, 'A1'), '7');
  assert.equal(getDisplay(result, 'A2'), '9');
  assert.equal(getDisplay(result, 'A3'), '-3');
});

test('resolves references and recalculates dependents', () => {
  const result = evaluate({ A1: '4', A2: '6', B1: '=A1+A2', C1: '=B1*2' });

  assert.equal(getDisplay(result, 'B1'), '10');
  assert.equal(getDisplay(result, 'C1'), '20');
});

test('supports ranges and aggregate functions', () => {
  const result = evaluate({
    A1: '1',
    A2: '2',
    A3: '3',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A3)',
    B3: '=COUNT(A1:A3)',
    B4: '=MAX(A1:A3)',
    B5: '=MIN(A1:A3)',
  });

  assert.equal(getDisplay(result, 'B1'), '6');
  assert.equal(getDisplay(result, 'B2'), '2');
  assert.equal(getDisplay(result, 'B3'), '3');
  assert.equal(getDisplay(result, 'B4'), '3');
  assert.equal(getDisplay(result, 'B5'), '1');
});

test('supports logical and text functions', () => {
  const result = evaluate({
    A1: '4',
    A2: '6',
    B1: '=IF(A1<A2, TRUE, FALSE)',
    B2: '=AND(TRUE, A1<A2)',
    B3: '=OR(FALSE, FALSE, TRUE)',
    B4: '=NOT(FALSE)',
    B5: '=ROUND(ABS(-2.6), 0)',
    B6: '=CONCAT("Total: ", A1+A2)',
    B7: '="Value "&A1',
  });

  assert.equal(getDisplay(result, 'B1'), 'TRUE');
  assert.equal(getDisplay(result, 'B2'), 'TRUE');
  assert.equal(getDisplay(result, 'B3'), 'TRUE');
  assert.equal(getDisplay(result, 'B4'), 'TRUE');
  assert.equal(getDisplay(result, 'B5'), '3');
  assert.equal(getDisplay(result, 'B6'), 'Total: 10');
  assert.equal(getDisplay(result, 'B7'), 'Value 4');
});

test('treats empty references as zero in numeric expressions', () => {
  const result = evaluate({ A1: '=B1+2', A2: '=SUM(B1:B2)' });

  assert.equal(getDisplay(result, 'A1'), '2');
  assert.equal(getDisplay(result, 'A2'), '0');
});

test('reports circular references and division errors', () => {
  const result = evaluate({ A1: '=B1', B1: '=A1', C1: '=1/0' });

  assert.equal(getDisplay(result, 'A1'), '#CIRC!');
  assert.equal(getDisplay(result, 'B1'), '#CIRC!');
  assert.equal(getDisplay(result, 'C1'), '#DIV/0!');
});

test('reports syntax and unknown function errors while preserving raw values', () => {
  const result = evaluate({ A1: '=SUM(', A2: '=MISSING(1)' });

  assert.equal(getDisplay(result, 'A1'), '#ERR!');
  assert.equal(getDisplay(result, 'A2'), '#ERR!');
  assert.equal(result.cells.A1.raw, '=SUM(');
  assert.equal(result.cells.A2.raw, '=MISSING(1)');
});
