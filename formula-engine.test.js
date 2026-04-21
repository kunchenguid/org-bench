const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSpreadsheetEngine,
  evaluateFormula,
  rebaseFormula,
  updateFormulaReferences,
} = require('./formula-engine.js');

test('evaluateFormula handles arithmetic precedence and parentheses', () => {
  const result = evaluateFormula('=1+2*3-(4/2)');
  assert.equal(result.type, 'number');
  assert.equal(result.value, 5);
});

test('evaluateFormula handles booleans, comparison, and concatenation', () => {
  const comparison = evaluateFormula('=1+1=2');
  assert.equal(comparison.type, 'boolean');
  assert.equal(comparison.value, true);

  const text = evaluateFormula('="Total: "&ROUND(2.345, 2)');
  assert.equal(text.type, 'text');
  assert.equal(text.value, 'Total: 2.35');
});

test('evaluateFormula resolves references, ranges, and functions', () => {
  const result = evaluateFormula('=SUM(A1:B2)+COUNT(A1:B2)', {
    getCellValue(address) {
      return {
        A1: 1,
        A2: 2,
        B1: 3,
        B2: 4,
      }[address] ?? 0;
    },
  });

  assert.equal(result.type, 'number');
  assert.equal(result.value, 14);
  assert.deepEqual(result.dependencies.sort(), ['A1', 'A2', 'B1', 'B2']);
});

test('evaluateFormula treats empty cells as zero or empty string based on context', () => {
  const numeric = evaluateFormula('=A1+2', {
    getCellValue() {
      return null;
    },
  });
  assert.equal(numeric.value, 2);

  const text = evaluateFormula('="x"&A1', {
    getCellValue() {
      return null;
    },
  });
  assert.equal(text.value, 'x');
});

test('rebaseFormula shifts relative references and preserves absolute components', () => {
  assert.equal(rebaseFormula('=A1+$B2+C$3+$D$4', 'A1', 'C3'), '=C3+$B4+E$3+$D$4');
  assert.equal(rebaseFormula('=SUM(A1:B2)', 'B2', 'C4'), '=SUM(B3:C4)');
});

test('updateFormulaReferences adjusts references for inserted rows and deleted columns', () => {
  assert.equal(
    updateFormulaReferences('=SUM(A1:B2)+C3', {
      type: 'insert-row',
      index: 2,
      count: 1,
    }),
    '=SUM(A1:B3)+C4'
  );

  assert.equal(
    updateFormulaReferences('=A1+B2+C3', {
      type: 'delete-column',
      index: 2,
      count: 1,
    }),
    '=A1+#REF!+B3'
  );
});

test('engine recomputes dependents when precedent cells change', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('B1', '=A1+A2');

  assert.equal(engine.getDisplayValue('B1'), '5');

  engine.setCell('A2', '10');
  assert.equal(engine.getDisplayValue('B1'), '12');
});

test('engine returns raw formula separately from evaluated value', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=1+2');

  assert.equal(engine.getCell('A1').raw, '=1+2');
  assert.equal(engine.getCell('A1').value, 3);
  assert.equal(engine.getDisplayValue('A1'), '3');
});

test('engine detects circular references', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');

  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

test('engine reports divide by zero and unknown function errors', () => {
  const engine = createSpreadsheetEngine();
  engine.setCell('A1', '=1/0');
  engine.setCell('A2', '=MISSING(1)');

  assert.equal(engine.getDisplayValue('A1'), '#DIV/0!');
  assert.equal(engine.getDisplayValue('A2'), '#ERR!');
});
