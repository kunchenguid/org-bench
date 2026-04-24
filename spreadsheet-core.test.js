const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SpreadsheetCore,
  adjustFormulaForMove,
  adjustFormulaForRowInsert,
  adjustFormulaForColumnDelete,
} = require('./spreadsheet-core.js');

test('evaluates arithmetic, ranges, functions, comparisons, booleans, and strings', () => {
  const sheet = new SpreadsheetCore({ rows: 100, cols: 26 });

  sheet.setCell('A1', '10');
  sheet.setCell('A2', '5');
  sheet.setCell('A3', '=SUM(A1:A2)');
  sheet.setCell('B1', '=A3*2+ROUND(2.6,0)');
  sheet.setCell('B2', '=IF(B1>=30,"Total: "&B1,"low")');
  sheet.setCell('B3', '=AND(TRUE, NOT(FALSE), A1<>A2)');

  assert.equal(sheet.getDisplayValue('A3'), '15');
  assert.equal(sheet.getDisplayValue('B1'), '33');
  assert.equal(sheet.getDisplayValue('B2'), 'Total: 33');
  assert.equal(sheet.getDisplayValue('B3'), 'TRUE');

  sheet.setCell('A1', '20');

  assert.equal(sheet.getDisplayValue('A3'), '25');
  assert.equal(sheet.getDisplayValue('B1'), '53');
});

test('reports formula errors without losing raw cell contents', () => {
  const sheet = new SpreadsheetCore();

  sheet.setCell('A1', '=1/0');
  sheet.setCell('A2', '=NOPE(1)');
  sheet.setCell('A3', '=B9999');

  assert.equal(sheet.getRawCell('A1'), '=1/0');
  assert.equal(sheet.getDisplayValue('A1'), '#DIV/0!');
  assert.equal(sheet.getDisplayValue('A2'), '#ERR!');
  assert.equal(sheet.getDisplayValue('A3'), '#REF!');
});

test('detects circular references', () => {
  const sheet = new SpreadsheetCore();

  sheet.setCell('A1', '=A2+1');
  sheet.setCell('A2', '=A1+1');

  assert.equal(sheet.getDisplayValue('A1'), '#CIRC!');
  assert.equal(sheet.getDisplayValue('A2'), '#CIRC!');
});

test('IF evaluates only the selected branch', () => {
  const sheet = new SpreadsheetCore();

  sheet.setCell('A1', '=IF(FALSE,1/0,42)');
  sheet.setCell('A2', '=IF(TRUE,"ok",NOPE(1))');

  assert.equal(sheet.getDisplayValue('A1'), '42');
  assert.equal(sheet.getDisplayValue('A2'), 'ok');
});

test('provides row and column adapter methods for UI actions', () => {
  const sheet = new SpreadsheetCore({ rows: 10, cols: 5 });

  sheet.setCell(0, 0, '12');
  sheet.setCell(1, 0, '=A1*2');
  sheet.setActive(1, 0);

  assert.equal(sheet.getCell(0, 0), '12');
  assert.equal(sheet.getCell(1, 0), '=A1*2');
  assert.equal(sheet.getDisplayValue('A2'), '24');
  assert.deepEqual(sheet.snapshot(), {
    '0,0': '12',
    '1,0': '=A1*2',
  });

  sheet.clearCell(0, 0);
  assert.equal(sheet.getCell(0, 0), '');

  sheet.resize(12, 6);
  sheet.load({ cells: { '2,3': '=D1' }, rows: 12, cols: 6, active: { row: 2, col: 3 } });

  assert.equal(sheet.getCell(2, 3), '=D1');
  assert.equal(sheet.rows, 12);
  assert.equal(sheet.cols, 6);
  assert.deepEqual(sheet.active, { row: 2, col: 3 });
});

test('exposes UI formula movement helpers with zero-based coordinates', () => {
  const sheet = new SpreadsheetCore();

  assert.equal(
    sheet.shiftFormulaReferences('=A1+$B1', { row: 0, col: 0 }, { row: 2, col: 2 }),
    '=C3+$B3',
  );
  assert.equal(
    sheet.transformFormulaForStructureChange('=A1+B2', { type: 'insert-row', index: 1, count: 1 }),
    '=A1+B3',
  );
  assert.equal(
    sheet.transformFormulaForStructureChange('=A1+B2', { type: 'delete-col', index: 1, count: 1 }),
    '=A1+#REF!',
  );
});

test('adjusts relative and absolute references when formulas are moved', () => {
  assert.equal(
    adjustFormulaForMove('=A1+$B1+C$2+$D$4+SUM(A1:B2)', 'A1', 'C3'),
    '=C3+$B3+E$2+$D$4+SUM(C3:D4)',
  );
});

test('adjusts references for row insert and column delete', () => {
  assert.equal(adjustFormulaForRowInsert('=A1+A2+$B$3+SUM(A1:A3)', 2, 1), '=A1+A3+$B$4+SUM(A1:A4)');
  assert.equal(adjustFormulaForColumnDelete('=A1+B1+C1+$C$2', 2, 1), '=A1+#REF!+B1+$B$2');
});
