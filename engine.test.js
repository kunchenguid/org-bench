const assert = require('node:assert/strict');

const {
  createSheet,
  setCell,
  getCellRaw,
  getCellDisplay,
  undo,
  redo,
  runAction,
  serializeSelection,
  parseClipboardText,
  applyClipboardMatrix,
} = require('./spreadsheet.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('stores raw values and evaluates simple formulas', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '2');
  setCell(sheet, 'A2', '3');
  setCell(sheet, 'A3', '=A1+A2');

  assert.equal(getCellRaw(sheet, 'A3'), '=A1+A2');
  assert.equal(getCellDisplay(sheet, 'A3'), '5');
});

test('recomputes dependent formulas when precedent changes', () => {
  const sheet = createSheet();
  setCell(sheet, 'B1', '10');
  setCell(sheet, 'B2', '=B1*2');

  assert.equal(getCellDisplay(sheet, 'B2'), '20');
  setCell(sheet, 'B1', '7');
  assert.equal(getCellDisplay(sheet, 'B2'), '14');
});

test('supports SUM across a range', () => {
  const sheet = createSheet();
  setCell(sheet, 'C1', '1');
  setCell(sheet, 'C2', '2');
  setCell(sheet, 'C3', '3');
  setCell(sheet, 'C4', '=SUM(C1:C3)');

  assert.equal(getCellDisplay(sheet, 'C4'), '6');
});

test('detects circular references', () => {
  const sheet = createSheet();
  setCell(sheet, 'D1', '=D2');
  setCell(sheet, 'D2', '=D1');

  assert.equal(getCellDisplay(sheet, 'D1'), '#CIRC!');
  assert.equal(getCellDisplay(sheet, 'D2'), '#CIRC!');
});

test('undo and redo restore committed cell values', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '12');
  setCell(sheet, 'A1', '18');

  undo(sheet);
  assert.equal(getCellDisplay(sheet, 'A1'), '12');

  redo(sheet);
  assert.equal(getCellDisplay(sheet, 'A1'), '18');
});

test('undo and redo restore dependent formula results', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '7');
  setCell(sheet, 'B1', '=A1*2');
  setCell(sheet, 'A1', '');

  assert.equal(getCellDisplay(sheet, 'B1'), '0');

  undo(sheet);
  assert.equal(getCellDisplay(sheet, 'A1'), '7');
  assert.equal(getCellDisplay(sheet, 'B1'), '14');

  redo(sheet);
  assert.equal(getCellDisplay(sheet, 'A1'), '');
  assert.equal(getCellDisplay(sheet, 'B1'), '0');
});

test('batched actions undo multi-cell edits in one step', () => {
  const sheet = createSheet();

  runAction(sheet, () => {
    setCell(sheet, 'A1', '1');
    setCell(sheet, 'A2', '2');
    setCell(sheet, 'A3', '=SUM(A1:A2)');
  });

  assert.equal(getCellDisplay(sheet, 'A3'), '3');

  undo(sheet);
  assert.equal(getCellDisplay(sheet, 'A1'), '');
  assert.equal(getCellDisplay(sheet, 'A2'), '');
  assert.equal(getCellDisplay(sheet, 'A3'), '');
});

test('serializes a rectangular selection to tab-delimited clipboard text', () => {
  const sheet = createSheet();
  setCell(sheet, 'A1', '1');
  setCell(sheet, 'B1', '=A1*2');
  setCell(sheet, 'A2', 'hello');
  setCell(sheet, 'B2', '');

  assert.equal(serializeSelection(sheet, ['A1', 'B1', 'A2', 'B2']), '1\t=A1*2\nhello\t');
});

test('parses clipboard text into a rectangular matrix', () => {
  assert.deepEqual(parseClipboardText('1\t2\n3\t4'), [
    ['1', '2'],
    ['3', '4'],
  ]);
});

test('applies clipboard text at a destination cell', () => {
  const sheet = createSheet();
  applyClipboardMatrix(sheet, 'B2', [
    ['1', '=B2'],
    ['hello', '4'],
  ], 'B2');

  assert.equal(getCellRaw(sheet, 'B2'), '1');
  assert.equal(getCellRaw(sheet, 'C2'), '=B2');
  assert.equal(getCellRaw(sheet, 'B3'), 'hello');
  assert.equal(getCellRaw(sheet, 'C3'), '4');
});

test('pasting shifts relative references to the new destination', () => {
  const sheet = createSheet();
  applyClipboardMatrix(sheet, 'C3', [['=A1+B1']], 'A1');

  assert.equal(getCellRaw(sheet, 'C3'), '=C3+D3');
});

test('undo reverses a pasted block as a single action', () => {
  const sheet = createSheet();
  applyClipboardMatrix(sheet, 'A1', [
    ['1', '2'],
    ['3', '4'],
  ]);

  undo(sheet);

  assert.equal(getCellRaw(sheet, 'A1'), '');
  assert.equal(getCellRaw(sheet, 'B1'), '');
  assert.equal(getCellRaw(sheet, 'A2'), '');
  assert.equal(getCellRaw(sheet, 'B2'), '');
});
