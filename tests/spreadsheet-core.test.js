const assert = require('node:assert/strict');

const { createSpreadsheetCore } = require('../app.js');

function createCore(initialCells = {}) {
  const core = createSpreadsheetCore({ rows: 100, cols: 26 });
  for (const [cellId, raw] of Object.entries(initialCells)) {
    core.setCell(cellId, raw);
  }
  return core;
}

function getDisplay(core, cellId) {
  return core.getCellDisplay(cellId);
}

function getRaw(core, cellId) {
  return core.getCellRaw(cellId);
}

function run() {
  {
    const core = createCore({ A1: '2', A2: '3', A3: '=A1+A2*4' });
    assert.equal(getDisplay(core, 'A3'), '14');
  }

  {
    const core = createCore({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)' });
    assert.equal(getDisplay(core, 'B1'), '6');
  }

  {
    const core = createCore({ A1: '1', A2: '2', B1: '=AVERAGE(A1:A2)', B2: '=COUNT(A1:B1,A2)' });
    assert.equal(getDisplay(core, 'B1'), '1.5');
    assert.equal(getDisplay(core, 'B2'), '3');
  }

  {
    const core = createCore({ A1: '5', B1: '=IF(A1>3,10,20)', B2: '=IF(A1<3,10,20)' });
    assert.equal(getDisplay(core, 'B1'), '10');
    assert.equal(getDisplay(core, 'B2'), '20');
  }

  {
    const core = createCore({ A1: '=B1', B1: '=A1' });
    assert.equal(getDisplay(core, 'A1'), '#CIRC!');
    assert.equal(getDisplay(core, 'B1'), '#CIRC!');
  }

  {
    const core = createCore({ A1: '=1/0', A2: '=NOPE(1)' });
    assert.equal(getDisplay(core, 'A1'), '#DIV/0!');
    assert.equal(getDisplay(core, 'A2'), '#ERR!');
  }

  {
    const core = createCore({ A1: '4', B1: '=A1*2' });
    assert.equal(getDisplay(core, 'B1'), '8');
    core.setCell('A1', '7');
    assert.equal(getDisplay(core, 'B1'), '14');
  }

  {
    const core = createCore({ A1: '=1+2' });
    assert.equal(getRaw(core, 'A1'), '=1+2');
  }

  console.log('spreadsheet core tests passed');
}

run();
