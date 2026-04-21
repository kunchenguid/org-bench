const assert = require('node:assert/strict');

const { evaluateFormula, shiftFormula } = require('../formula-engine.js');

function value(cells, id, context) {
  return evaluateFormula(cells[id], {
    cellId: id,
    getCellRaw(ref) {
      return cells[ref] || '';
    },
    context,
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
  assert.equal(value({ A1: '=1+2*3' }, 'A1').display, '7');
});

test('evaluates references and ranges', () => {
  const cells = { A1: '2', A2: '3', A3: '=SUM(A1:A2)' };
  assert.equal(value(cells, 'A3').display, '5');
});

test('supports comparison and IF', () => {
  const cells = { A1: '10', A2: '=IF(A1>=10, "ok", "no")' };
  assert.equal(value(cells, 'A2').display, 'ok');
});

test('supports concatenation with empty references', () => {
  const cells = { A1: '=CONCAT("Total: ", B1)' };
  assert.equal(value(cells, 'A1').display, 'Total: ');
});

test('detects circular references', () => {
  const cells = { A1: '=B1', B1: '=A1' };
  assert.equal(value(cells, 'A1').display, '#CIRC!');
});

test('shifts relative references on copy', () => {
  assert.equal(shiftFormula('=A1+$B2+C$3+$D$4', 1, 2), '=C2+$B3+E$3+$D$4');
});
