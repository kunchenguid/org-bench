const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetEngine,
} = require('../src/spreadsheet-engine.js');

test('evaluates arithmetic formulas with operator precedence', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '=A1+A2*4');

  assert.equal(engine.getDisplayValue('A3'), '14');
});

test('evaluates ranges with SUM and AVERAGE', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '1');
  engine.setCell('A2', '2');
  engine.setCell('A3', '3');
  engine.setCell('B1', '=SUM(A1:A3)');
  engine.setCell('B2', '=AVERAGE(A1:A3)');

  assert.equal(engine.getDisplayValue('B1'), '6');
  assert.equal(engine.getDisplayValue('B2'), '2');
});

test('treats empty references as zero in numeric formulas', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=B1+5');

  assert.equal(engine.getDisplayValue('A1'), '5');
});

test('updates dependent formulas when precedent cells change', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '10');
  engine.setCell('B1', '=A1*2');
  assert.equal(engine.getDisplayValue('B1'), '20');

  engine.setCell('A1', '7');
  assert.equal(engine.getDisplayValue('B1'), '14');
});

test('detects circular references', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

test('copies formulas with relative references shifted to destination', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '5');
  engine.setCell('B1', '=A1');

  engine.copyRange({ startRow: 0, startCol: 1, endRow: 0, endCol: 1 });
  engine.pasteRange({ row: 1, col: 1 });

  assert.equal(engine.getRawValue('B2'), '=A2');
});

test('persists and restores raw contents and selection', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('C3', '=SUM(A1:A2)');
  engine.setSelection({ row: 2, col: 2 });

  const snapshot = engine.serialize();
  const restored = createSpreadsheetEngine();
  restored.deserialize(snapshot);

  assert.equal(restored.getRawValue('C3'), '=SUM(A1:A2)');
  assert.deepEqual(restored.getSelection(), { row: 2, col: 2 });
});

test('inserting a row updates formulas to keep pointing at moved data', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '10');
  engine.setCell('A2', '20');
  engine.setCell('B1', '=SUM(A1:A2)');

  engine.insertRow(0);

  assert.equal(engine.getRawValue('A2'), '10');
  assert.equal(engine.getRawValue('A3'), '20');
  assert.equal(engine.getRawValue('B2'), '=SUM(A2:A3)');
  assert.equal(engine.getDisplayValue('B2'), '30');
});

test('deleting a referenced row produces #REF! for removed cells', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '10');
  engine.setCell('B1', '=A1');

  engine.deleteRow(0);

  assert.equal(engine.getRawValue('B1'), '=#REF!');
  assert.equal(engine.getDisplayValue('B1'), '#REF!');
});
