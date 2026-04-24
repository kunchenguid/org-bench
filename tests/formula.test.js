const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.join(__dirname, '..', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');
const context = { window: {}, document: { addEventListener() {}, getElementById() { return null; } }, localStorage: null, console };
vm.createContext(context);
vm.runInContext(source, context);

const { FormulaEngine, adjustFormulaReferences, adjustFormulaForStructureChange } = context.window.SpreadsheetCore;

function valueAt(cells, address) {
  return cells.get(address) || '';
}

const cells = new Map([
  ['A1', '10'],
  ['A2', '15'],
  ['B1', '=SUM(A1:A2)'],
  ['B2', '=IF(B1>20,"ok","low")'],
]);

const engine = new FormulaEngine((address) => valueAt(cells, address), 26, 100);

assert.strictEqual(engine.evaluateCell('B1', cells.get('B1')).display, '25');
assert.strictEqual(engine.evaluateCell('B2', cells.get('B2')).display, 'ok');
assert.strictEqual(engine.evaluateCell('C1', '=A1+A2*2').display, '40');
assert.strictEqual(engine.evaluateCell('C2', '=10/0').display, '#DIV/0!');
assert.strictEqual(adjustFormulaReferences('=A1+$B$2+A$3+$C4+SUM(A1:B2)', 1, 2), '=C2+$B$2+C$3+$C5+SUM(C2:D3)');
assert.strictEqual(adjustFormulaForStructureChange('=SUM(A1:A2)+B$3+$C4', 'row', 0, 1), '=SUM(A2:A3)+B$4+$C5');
assert.strictEqual(adjustFormulaForStructureChange('=A1+B1+$C1', 'col', 1, -1), '=A1+#REF!+$B1');

console.log('formula tests passed');
