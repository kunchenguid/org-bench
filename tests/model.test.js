const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../src/engine.js');
const model = require('../src/model.js');

test('insertColumn shifts cells and formula references to preserve pointed data', () => {
  const sheet = model.createSheet({
    A1: '1',
    B1: '2',
    C1: '=A1+B1',
  });

  model.insertColumn(sheet, 1);

  assert.equal(model.getCellRaw(sheet, 'A1'), '1');
  assert.equal(model.getCellRaw(sheet, 'C1'), '2');
  assert.equal(model.getCellRaw(sheet, 'D1'), '=A1+C1');
  assert.equal(engine.evaluateCellMap(sheet.cells).D1.display, '3');
});

test('deleteRow shifts lower rows up and turns references to deleted cells into #REF!', () => {
  const sheet = model.createSheet({
    A1: '5',
    A2: '7',
    B1: '=A2',
    B3: '=A3',
    A3: '9',
  });

  model.deleteRow(sheet, 1);

  assert.equal(model.getCellRaw(sheet, 'A1'), '5');
  assert.equal(model.getCellRaw(sheet, 'A2'), '9');
  assert.equal(model.getCellRaw(sheet, 'B1'), '=#REF!');
  assert.equal(model.getCellRaw(sheet, 'B2'), '=A2');
  assert.equal(engine.evaluateCellMap(sheet.cells).B1.display, '#REF!');
  assert.equal(engine.evaluateCellMap(sheet.cells).B2.display, '9');
});
