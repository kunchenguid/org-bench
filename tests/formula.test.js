const assert = require('assert');
const fs = require('fs');
const path = require('path');

const formulaPath = path.join(__dirname, '..', 'formula.js');

assert.ok(fs.existsSync(formulaPath), 'expected formula.js to exist');

const { createFormulaEngine } = require(formulaPath);

function evaluate(rawCells, target) {
  const engine = createFormulaEngine(rawCells);
  return engine.getCellDisplay(target);
}

assert.equal(evaluate({ A1: '2', A2: '3', A3: '=A1+A2' }, 'A3'), '5');
assert.equal(evaluate({ A1: '2', A2: '=SUM(A1, 3, 4)' }, 'A2'), '9');
assert.equal(evaluate({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)' }, 'B1'), '6');
assert.equal(evaluate({ A1: '2', A2: '=IF(A1>1, "big", "small")' }, 'A2'), 'big');
assert.equal(evaluate({ A1: '=1/0' }, 'A1'), '#DIV/0!');
assert.equal(evaluate({ A1: '=A2', A2: '=A1' }, 'A1'), '#CIRC!');

console.log('formula tests passed');
