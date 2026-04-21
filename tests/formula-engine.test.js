const test = require('node:test');
const assert = require('node:assert/strict');

const { createFormulaEngine } = require('../src/formula-engine.js');

test('evaluates arithmetic formulas and tracks dependent recalculation', () => {
  const engine = createFormulaEngine();

  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '=A1+A2*4');

  assert.equal(engine.getDisplayValue('A3'), 14);

  engine.setCell('A2', '5');

  assert.equal(engine.getDisplayValue('A3'), 22);
  assert.equal(engine.getRawValue('A3'), '=A1+A2*4');
});

test('evaluates comparisons, booleans, concatenation, and conditional functions', () => {
  const engine = createFormulaEngine();

  engine.setCell('A1', '10');
  engine.setCell('A2', '4');
  engine.setCell('A3', '=A1>=A2');
  engine.setCell('A4', '=IF(A1>A2, "high", "low")');
  engine.setCell('A5', '=CONCAT("Total: ", A1)');
  engine.setCell('A6', '=TRUE');
  engine.setCell('A7', '=AND(TRUE, NOT(FALSE), A1>A2)');
  engine.setCell('A8', '="cmp=" & A3');

  assert.equal(engine.getDisplayValue('A3'), true);
  assert.equal(engine.getDisplayValue('A4'), 'high');
  assert.equal(engine.getDisplayValue('A5'), 'Total: 10');
  assert.equal(engine.getDisplayValue('A6'), true);
  assert.equal(engine.getDisplayValue('A7'), true);
  assert.equal(engine.getDisplayValue('A8'), 'cmp=TRUE');
});

test('evaluates ranges and aggregate functions', () => {
  const engine = createFormulaEngine({
    A1: '2',
    A2: '4',
    A3: '6',
    B1: 'word',
    B2: '',
    B3: '8',
  });

  engine.setCell('C1', '=SUM(A1:A3)');
  engine.setCell('C2', '=AVERAGE(A1:A3)');
  engine.setCell('C3', '=MIN(A1:A3)');
  engine.setCell('C4', '=MAX(A1:A3)');
  engine.setCell('C5', '=COUNT(A1:B3)');
  engine.setCell('C6', '=ROUND(AVERAGE(A1:A3) / 4, 2)');
  engine.setCell('C7', '=ABS(-5)');

  assert.equal(engine.getDisplayValue('C1'), 12);
  assert.equal(engine.getDisplayValue('C2'), 4);
  assert.equal(engine.getDisplayValue('C3'), 2);
  assert.equal(engine.getDisplayValue('C4'), 6);
  assert.equal(engine.getDisplayValue('C5'), 4);
  assert.equal(engine.getDisplayValue('C6'), 1);
  assert.equal(engine.getDisplayValue('C7'), 5);
});

test('can read raw cells through a workbook-state style adapter', () => {
  const cells = {
    A1: '7',
    A2: '=A1+5',
  };
  const workbook = {
    getCellRaw(cellId) {
      return Object.prototype.hasOwnProperty.call(cells, cellId) ? cells[cellId] : '';
    },
    getAllCellEntries() {
      return { ...cells };
    },
  };
  const engine = createFormulaEngine({ workbook });

  assert.equal(engine.getDisplayValue('A2'), 12);

  cells.A1 = '9';
  engine.replaceCells(workbook.getAllCellEntries());

  assert.equal(engine.getDisplayValue('A2'), 14);
});

test('surfaces circular references and spreadsheet-style errors', () => {
  const engine = createFormulaEngine({
    A1: '=B1',
    B1: '=A1',
    C1: '=1/0',
    D1: '=MISSING(1)',
  });

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('C1'), '#DIV/0!');
  assert.equal(engine.getDisplayValue('D1'), '#ERR!');
});
