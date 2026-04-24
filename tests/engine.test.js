const assert = require('assert');
const Engine = require('../engine.js');

function makeEngine() {
  return new Engine.SpreadsheetEngine(26, 100);
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('evaluates arithmetic formulas and recomputes dependents', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '2');
  sheet.setCell('A2', '3');
  sheet.setCell('A3', '=A1+A2*4');
  assert.strictEqual(sheet.getDisplay('A3'), '14');
  sheet.setCell('A2', '5');
  assert.strictEqual(sheet.getDisplay('A3'), '22');
});

test('evaluates ranges and common functions', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '1');
  sheet.setCell('A2', '2');
  sheet.setCell('A3', '3');
  sheet.setCell('B1', '=SUM(A1:A3)');
  sheet.setCell('B2', '=AVERAGE(A1:A3)');
  sheet.setCell('B3', '=IF(B1>5,"big","small")');
  assert.strictEqual(sheet.getDisplay('B1'), '6');
  assert.strictEqual(sheet.getDisplay('B2'), '2');
  assert.strictEqual(sheet.getDisplay('B3'), 'big');
});

test('adjusts relative references when copying formulas', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '10');
  sheet.setCell('B1', '=A1+$A$1');
  sheet.copyCell('B1', 'B2');
  assert.strictEqual(sheet.getRaw('B2'), '=A2+$A$1');
});

test('detects circular references without crashing', () => {
  const sheet = makeEngine();
  sheet.setCell('A1', '=A2');
  sheet.setCell('A2', '=A1');
  assert.strictEqual(sheet.getDisplay('A1'), '#CIRC!');
  assert.strictEqual(sheet.getDisplay('A2'), '#CIRC!');
});
test('rewrites formula references for inserted rows and columns', () => {
  assert.strictEqual(
    Engine.transformFormulaReferences('=SUM(A1:B2)+$C$3', 'insertRow', 0),
    '=SUM(A2:B3)+$C$4'
  );
  assert.strictEqual(
    Engine.transformFormulaReferences('=SUM(A1:B2)+$C$3', 'insertCol', 1),
    '=SUM(A1:C2)+$D$3'
  );
});

test('marks deleted formula references as ref errors', () => {
  assert.strictEqual(
    Engine.transformFormulaReferences('=A1+B2+C3', 'deleteRow', 1),
    '=A1+#REF!+C2'
  );
  assert.strictEqual(
    Engine.transformFormulaReferences('=A1+B2+C3', 'deleteCol', 1),
    '=A1+#REF!+B3'
  );
});

test('action history stores each user action atomically with a 50 item limit', () => {
  const history = new Engine.ActionHistory(50);
  for (let i = 0; i < 55; i++) {
    history.push({ cells: { A1: String(i) } }, { cells: { A1: String(i + 1) } });
  }

  assert.strictEqual(history.undo.length, 50);
  assert.deepStrictEqual(history.undoLast().before, { cells: { A1: '54' } });
  assert.deepStrictEqual(history.redoLast().after, { cells: { A1: '55' } });
});

test('action history ignores no-op actions and clears redo on new actions', () => {
  const history = new Engine.ActionHistory(50);
  history.push({ cells: { A1: '1' } }, { cells: { A1: '1' } });
  assert.strictEqual(history.undo.length, 0);

  history.push({ cells: {} }, { cells: { A1: '2' } });
  history.undoLast();
  assert.strictEqual(history.redo.length, 1);
  history.push({ cells: { A2: '3' } }, { cells: { A2: '4' } });
  assert.strictEqual(history.redo.length, 0);
});
