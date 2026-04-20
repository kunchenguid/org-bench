const test = require('node:test');
const assert = require('node:assert/strict');

const { SpreadsheetModel } = require('../src/model.js');

test('evaluates literal values and simple formulas', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCellRaw('A1', '2');
  sheet.setCellRaw('A2', '3');
  sheet.setCellRaw('A3', '=A1+A2*2');

  assert.equal(sheet.getCellDisplay('A1'), '2');
  assert.equal(sheet.getCellDisplay('A2'), '3');
  assert.equal(sheet.getCellDisplay('A3'), '8');
});

test('recalculates dependents when precedent cells change', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCellRaw('A1', '4');
  sheet.setCellRaw('A2', '=A1*2');
  assert.equal(sheet.getCellDisplay('A2'), '8');

  sheet.setCellRaw('A1', '10');
  assert.equal(sheet.getCellDisplay('A2'), '20');
});

test('supports ranges and aggregate functions', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCellRaw('A1', '1');
  sheet.setCellRaw('A2', '2');
  sheet.setCellRaw('A3', '3');
  sheet.setCellRaw('B1', '=SUM(A1:A3)');
  sheet.setCellRaw('B2', '=AVERAGE(A1:A3)');

  assert.equal(sheet.getCellDisplay('B1'), '6');
  assert.equal(sheet.getCellDisplay('B2'), '2');
});

test('returns clear errors for circular references and divide by zero', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCellRaw('A1', '=B1');
  sheet.setCellRaw('B1', '=A1');
  sheet.setCellRaw('C1', '=1/0');

  assert.equal(sheet.getCellDisplay('A1'), '#CIRC!');
  assert.equal(sheet.getCellDisplay('B1'), '#CIRC!');
  assert.equal(sheet.getCellDisplay('C1'), '#DIV/0!');
});

test('persists raw cells and active selection state', () => {
  const sheet = new SpreadsheetModel();

  sheet.setCellRaw('C3', '=1+1');
  sheet.setActiveCell('C3');

  const snapshot = sheet.serialize();
  const restored = SpreadsheetModel.deserialize(snapshot);

  assert.equal(restored.getCellRaw('C3'), '=1+1');
  assert.equal(restored.getCellDisplay('C3'), '2');
  assert.equal(restored.activeCell, 'C3');
});
