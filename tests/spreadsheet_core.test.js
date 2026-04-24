const assert = require('assert');
const { SpreadsheetEngine, adjustFormulaReferences } = require('../app.js');

const sheet = new SpreadsheetEngine(26, 100);

sheet.setCell(0, 0, '10');
sheet.setCell(1, 0, '15');
sheet.setCell(2, 0, '=SUM(A1:A2) + 5');
assert.strictEqual(sheet.getDisplay(2, 0), '30');

sheet.setCell(0, 0, '20');
assert.strictEqual(sheet.getDisplay(2, 0), '40');

sheet.setCell(0, 1, '=A1+$A$1+A$1+$A1');
assert.strictEqual(adjustFormulaReferences(sheet.getRaw(0, 1), 0, 1, 1, 2), '=B2+$A$1+B$1+$A2');

sheet.setCell(0, 0, '=B1');
sheet.setCell(0, 1, '=A1');
assert.strictEqual(sheet.getDisplay(0, 0), '#CIRC!');

const structured = new SpreadsheetEngine(26, 100);
structured.setCell(0, 0, '5');
structured.setCell(1, 0, '7');
structured.setCell(2, 1, '=SUM(A1:A2)');
structured.insertRows(1, 1);
assert.strictEqual(structured.getRaw(2, 0), '7');
assert.strictEqual(structured.getRaw(3, 1), '=SUM(A1:A3)');
assert.strictEqual(structured.getDisplay(3, 1), '12');
structured.deleteCols(0, 1);
assert.strictEqual(structured.getRaw(3, 0), '=SUM(#REF!:#REF!)');
assert.strictEqual(structured.getDisplay(3, 0), '#ERR!');

console.log('spreadsheet core tests passed');
