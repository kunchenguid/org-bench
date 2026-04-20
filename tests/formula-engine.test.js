const assert = require('assert');

const {
  evaluateSheet,
  adjustFormula,
} = require('../formula-engine.js');

function cell(raw) {
  return { raw };
}

function values(result) {
  return Object.fromEntries(
    Object.entries(result).map(([address, entry]) => [address, entry.display])
  );
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

test('evaluates literals and arithmetic formulas', () => {
  const result = evaluateSheet({
    A1: cell('2'),
    A2: cell('3'),
    A3: cell('=A1+A2*4'),
  });

  assert.deepStrictEqual(values(result), {
    A1: '2',
    A2: '3',
    A3: '14',
  });
});

test('evaluates ranges in SUM and IF', () => {
  const result = evaluateSheet({
    A1: cell('1'),
    A2: cell('2'),
    A3: cell('3'),
    B1: cell('=SUM(A1:A3)'),
    B2: cell('=IF(B1>5, "big", "small")'),
  });

  assert.deepStrictEqual(values(result), {
    A1: '1',
    A2: '2',
    A3: '3',
    B1: '6',
    B2: 'big',
  });
});

test('detects circular references', () => {
  const result = evaluateSheet({
    A1: cell('=B1'),
    B1: cell('=A1'),
  });

  assert.strictEqual(result.A1.display, '#CIRC!');
  assert.strictEqual(result.B1.display, '#CIRC!');
});

test('adjusts relative and absolute references during copy', () => {
  assert.strictEqual(adjustFormula('=A1+$B2+C$3+$D$4', 2, 1), '=B3+$B4+D$3+$D$4');
  assert.strictEqual(adjustFormula('=SUM(A1:B2)', 1, 2), '=SUM(C2:D3)');
});
