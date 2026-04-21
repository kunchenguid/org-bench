const assert = require('assert');
const {
  createSheetModel,
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

test('evaluateFormula supports comparisons and boolean literals', () => {
  const result = evalInGrid('=IF(A1>=B1,TRUE,FALSE)', {
    A1: '4',
    B1: '3',
  });

  assert.strictEqual(result.value, true);
  assert.strictEqual(result.display, 'TRUE');
});

test('evaluateFormula returns spreadsheet-style errors', () => {
  assert.strictEqual(evalInGrid('=1/0', {}).error, '#DIV/0!');
  assert.strictEqual(evalInGrid('=MISSING(A1)', { A1: '1' }).error, '#ERR!');
});

test('createSheetModel stores raw cells and recomputes dependents', () => {
  const sheet = createSheetModel();
  sheet.setCellRaw('A1', '2');
  sheet.setCellRaw('A2', '=A1*3');
  sheet.setCellRaw('B1', '=A2&" units"');

  assert.strictEqual(sheet.getCellRaw('A2'), '=A1*3');
  assert.strictEqual(sheet.getCell('A2').value, 6);
  assert.strictEqual(sheet.getCell('B1').display, '6 units');

  sheet.setCellRaw('A1', '4');

  assert.strictEqual(sheet.getCell('A2').value, 12);
  assert.strictEqual(sheet.getCell('B1').display, '12 units');
});
