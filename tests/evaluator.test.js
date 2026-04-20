const test = require('node:test');
const assert = require('node:assert/strict');

const { createEngine } = require('../formula.js');

test('evaluates numbers, references, arithmetic, comparisons, ranges, and functions', () => {
  const engine = createEngine({
    getCellRaw(address) {
      const cells = {
        A1: '2',
        A2: '3',
        B1: '=A1+A2*4',
        B2: '=SUM(A1:A2)',
        B3: '=IF(B2>4, "ok", "no")',
      };
      return cells[address] || '';
    },
  });

  assert.equal(engine.evaluateCell('B1').display, '14');
  assert.equal(engine.evaluateCell('B2').display, '5');
  assert.equal(engine.evaluateCell('B3').display, 'ok');
});

test('detects circular references and divide-by-zero', () => {
  const engine = createEngine({
    getCellRaw(address) {
      const cells = {
        C1: '=C2',
        C2: '=C1',
        D1: '=1/0',
      };
      return cells[address] || '';
    },
  });

  assert.equal(engine.evaluateCell('C1').display, '#CIRC!');
  assert.equal(engine.evaluateCell('D1').display, '#DIV/0!');
});

test('shifts relative references when formulas are copied', () => {
  const engine = createEngine({
    getCellRaw() {
      return '';
    },
  });

  assert.equal(engine.shiftFormula('=A1+$B$2+C$3+$D4', { rows: 2, cols: 1 }), '=B3+$B$2+D$3+$D6');
});
