const assert = require('node:assert/strict');
const { SpreadsheetModel, HistoryManager } = require('../spreadsheet.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('evaluates arithmetic with references and precedence', () => {
  const model = new SpreadsheetModel();
  model.setRaw('A1', '5');
  model.setRaw('A2', '7');
  model.setRaw('B1', '=A1+A2*2');
  assert.equal(model.getDisplayValue('B1'), '19');
});

test('supports range functions and boolean display', () => {
  const model = new SpreadsheetModel();
  model.setRaw('A1', '2');
  model.setRaw('A2', '3');
  model.setRaw('A3', '5');
  model.setRaw('B1', '=SUM(A1:A3)');
  model.setRaw('B2', '=AVERAGE(A1:A3)>=3');
  assert.equal(model.getDisplayValue('B1'), '10');
  assert.equal(model.getDisplayValue('B2'), 'TRUE');
});

test('returns spreadsheet style errors for divide by zero and circular references', () => {
  const model = new SpreadsheetModel();
  model.setRaw('A1', '=1/0');
  model.setRaw('B1', '=C1');
  model.setRaw('C1', '=B1');
  assert.equal(model.getDisplayValue('A1'), '#DIV/0!');
  assert.equal(model.getDisplayValue('B1'), '#CIRC!');
});

test('treats empty references as zero in numeric formulas', () => {
  const model = new SpreadsheetModel();
  model.setRaw('A1', '=B1+2');
  assert.equal(model.getDisplayValue('A1'), '2');
});

test('shifts relative references when a formula is copied', () => {
  const model = new SpreadsheetModel();
  assert.equal(model.shiftFormula('=A1+$B2+C$3+$D$4', 2, 1), '=B3+$B4+D$3+$D$4');
});

test('pastes a copied block and rewrites relative formulas from the source offset', () => {
  const model = new SpreadsheetModel();
  model.setRaw('A1', '5');
  model.setRaw('B1', '=A1+1');
  const block = model.copyBlock({ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 });
  model.pasteBlock(1, 0, block);
  assert.equal(model.getRaw('A2'), '5');
  assert.equal(model.getRaw('B2'), '=A2+1');
  assert.equal(model.getDisplayValue('B2'), '6');
});

test('clears every cell inside a rectangular range', () => {
  const model = new SpreadsheetModel();
  model.setRaw('A1', '1');
  model.setRaw('B1', '2');
  model.setRaw('A2', '3');
  model.clearRange({ startRow: 0, startColumn: 0, endRow: 1, endColumn: 1 });
  assert.equal(model.getRaw('A1'), '');
  assert.equal(model.getRaw('B1'), '');
  assert.equal(model.getRaw('A2'), '');
});

test('undo and redo restore whole-sheet snapshots in order', () => {
  const history = new HistoryManager(3);
  history.record({ cells: { A1: '1' } }, { cells: { A1: '2' } });
  history.record({ cells: { A1: '2' } }, { cells: { A1: '3' } });
  assert.deepEqual(history.undo({ cells: { A1: '3' } }), { cells: { A1: '2' } });
  assert.deepEqual(history.undo({ cells: { A1: '2' } }), { cells: { A1: '1' } });
  assert.deepEqual(history.redo({ cells: { A1: '1' } }), { cells: { A1: '2' } });
});

test('redo is dropped after recording a new action from an undone state', () => {
  const history = new HistoryManager(5);
  history.record({ cells: { A1: '1' } }, { cells: { A1: '2' } });
  history.record({ cells: { A1: '2' } }, { cells: { A1: '3' } });
  history.undo({ cells: { A1: '3' } });
  history.record({ cells: { A1: '2' } }, { cells: { A1: '9' } });
  assert.equal(history.redo({ cells: { A1: '9' } }), null);
});
