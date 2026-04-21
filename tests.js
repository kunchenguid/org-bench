const assert = require('assert');

const {
  createWorkbook,
  setCellRaw,
  getCellDisplay,
  copySelection,
  pasteSelection,
  insertRow,
  deleteColumn,
} = require('./app.js');

function makeBook(entries) {
  const workbook = createWorkbook(8, 8);
  for (const [address, raw] of Object.entries(entries)) {
    setCellRaw(workbook, address, raw);
  }
  return workbook;
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

test('evaluates arithmetic and ranges', () => {
  const workbook = makeBook({
    A1: '10',
    A2: '5',
    A3: '=A1+A2*2',
    A4: '=SUM(A1:A3)',
  });

  assert.strictEqual(getCellDisplay(workbook, 'A3'), '20');
  assert.strictEqual(getCellDisplay(workbook, 'A4'), '35');
});

test('recalculates dependent formulas', () => {
  const workbook = makeBook({
    A1: '7',
    B1: '=A1*3',
    C1: '=B1+1',
  });

  assert.strictEqual(getCellDisplay(workbook, 'C1'), '22');
  setCellRaw(workbook, 'A1', '8');
  assert.strictEqual(getCellDisplay(workbook, 'C1'), '25');
});

test('shifts relative references when pasting formulas', () => {
  const workbook = makeBook({
    A1: '2',
    B1: '=A1+1',
  });

  const clip = copySelection(workbook, {
    startRow: 0,
    endRow: 0,
    startCol: 1,
    endCol: 1,
  }, true);

  pasteSelection(workbook, clip, { row: 1, col: 2 });

  assert.strictEqual(getCellDisplay(workbook, 'C2'), '1');
  assert.strictEqual(workbook.cells.C2.raw, '=B2+1');
});

test('preserves absolute references when pasting formulas', () => {
  const workbook = makeBook({
    A1: '4',
    B1: '9',
    C1: '=$A$1+B1',
  });

  const clip = copySelection(workbook, {
    startRow: 0,
    endRow: 0,
    startCol: 2,
    endCol: 2,
  }, true);

  pasteSelection(workbook, clip, { row: 1, col: 2 });

  assert.strictEqual(workbook.cells.C2.raw, '=$A$1+B2');
});

test('updates formulas when inserting rows', () => {
  const workbook = makeBook({
    A1: '1',
    A2: '2',
    B3: '=SUM(A1:A2)',
  });

  insertRow(workbook, 1, 1);

  assert.strictEqual(workbook.cells.B4.raw, '=SUM(A1:A3)');
});

test('marks deleted references as ref errors', () => {
  const workbook = makeBook({
    A1: '3',
    B1: '=A1+2',
  });

  deleteColumn(workbook, 0, 1);

  assert.strictEqual(getCellDisplay(workbook, 'A1'), '#REF!');
});

test('detects circular references', () => {
  const workbook = makeBook({
    A1: '=B1',
    B1: '=A1',
  });

  assert.strictEqual(getCellDisplay(workbook, 'A1'), '#CIRC!');
  assert.strictEqual(getCellDisplay(workbook, 'B1'), '#CIRC!');
});

console.log('All tests completed');
