const assert = require('node:assert/strict');
const { evaluateFormula } = require('../src/formula.js');

function evaluate(formula, cells = {}, position = { row: 0, col: 0 }) {
  return evaluateFormula(formula, {
    cells,
    position,
    getCellRaw(address) {
      return cells[address] ?? '';
    },
  });
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

test('evaluates arithmetic precedence', () => {
  const result = evaluate('=1+2*3');
  assert.equal(result.display, '7');
});

test('reads cell references', () => {
  const result = evaluate('=A1+B1', { A1: '2', B1: '5' });
  assert.equal(result.display, '7');
});

test('supports SUM over ranges', () => {
  const result = evaluate('=SUM(A1:A3)', { A1: '2', A2: '3', A3: '5' });
  assert.equal(result.display, '10');
});

test('returns divide by zero error', () => {
  const result = evaluate('=10/0');
  assert.equal(result.display, '#DIV/0!');
});

test('detects direct circular references', () => {
  const result = evaluate('=A1', { A1: '=A1' });
  assert.equal(result.display, '#CIRC!');
});
