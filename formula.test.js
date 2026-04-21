const assert = require('node:assert/strict');
const { createEngine, shiftFormula, createHistoryManager, applyStructureChange } = require('./app.js');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('evaluates arithmetic with precedence', () => {
  const engine = createEngine();
  engine.setCell('A1', '=1+2*3');
  assert.equal(engine.getDisplayValue('A1'), '7');
});

run('resolves references and recomputes dependents', () => {
  const engine = createEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('B1', '=A1+A2');
  assert.equal(engine.getDisplayValue('B1'), '5');
  engine.setCell('A2', '5');
  assert.equal(engine.getDisplayValue('B1'), '7');
});

run('supports SUM over a range', () => {
  const engine = createEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '5');
  engine.setCell('B1', '=SUM(A1:A3)');
  assert.equal(engine.getDisplayValue('B1'), '10');
});

run('renders circular references as #CIRC!', () => {
  const engine = createEngine();
  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');
  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

run('supports IF and concatenation', () => {
  const engine = createEngine();
  engine.setCell('A1', '4');
  engine.setCell('B1', '=IF(A1>3,"ok","no")&"!"');
  assert.equal(engine.getDisplayValue('B1'), 'ok!');
});

run('supports absolute and mixed references in formulas', () => {
  const engine = createEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '5');
  engine.setCell('B1', '7');
  engine.setCell('B2', '=A$1+$A2+$B$1');
  assert.equal(engine.getDisplayValue('B2'), '14');
});

run('shifts only relative parts when copying formulas', () => {
  assert.equal(
    shiftFormula('=SUM(A1:B2)+$C$3+C$4+$D5', 1, 2),
    '=SUM(B3:C4)+$C$3+D$4+$D7'
  );
});

run('undo returns the previous snapshot and redo reapplies it', () => {
  const history = createHistoryManager(50);
  const start = { selected: 'A1', cells: { A1: '1' } };
  const next = { selected: 'A2', cells: { A1: '1', A2: '2' } };

  history.record(start);

  assert.deepEqual(history.undo(next), start);
  assert.deepEqual(history.redo(start), next);
});

run('new edits clear the redo stack and enforce the history limit', () => {
  const history = createHistoryManager(2);
  const first = { selected: 'A1', cells: { A1: '1' } };
  const second = { selected: 'A2', cells: { A1: '1', A2: '2' } };
  const third = { selected: 'A3', cells: { A1: '1', A2: '2', A3: '3' } };
  const current = { selected: 'A4', cells: { A1: '1', A2: '2', A3: '3', A4: '4' } };

  history.record(first);
  history.record(second);
  history.record(third);

  assert.deepEqual(history.undo(current), third);
  assert.deepEqual(history.undo(third), second);
  assert.equal(history.undo(second), null);

  history.record(second);
  assert.equal(history.redo(second), null);
});

run('inserting a row shifts cells and rewrites formula references', () => {
  const result = applyStructureChange(
    {
      A1: '1',
      A2: '2',
      B1: '=A2',
      B2: '=SUM(A1:A2)',
      C2: '=$A$2'
    },
    { type: 'insert-row', index: 2 }
  );

  assert.deepEqual(result, {
    A1: '1',
    A3: '2',
    B1: '=A3',
    B3: '=SUM(A1:A3)',
    C3: '=$A$3'
  });
});

run('deleting a column invalidates references into the deleted cells', () => {
  const result = applyStructureChange(
    {
      A1: '1',
      B1: '=A1',
      C1: '=$B$1',
      D1: '=SUM(A1:B1)'
    },
    { type: 'delete-column', index: 1 }
  );

  assert.deepEqual(result, {
    A1: '=#REF!',
    B1: '=$A$1',
    C1: '=SUM(#REF!:A1)'
  });
});
