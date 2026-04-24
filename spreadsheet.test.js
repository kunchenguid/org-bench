const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('app.js', 'utf8');
const sandbox = { window: {}, document: { addEventListener() {}, getElementById() { return null; }, createElement() { return {}; } }, localStorage: null, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const api = sandbox.window.SpreadsheetCore;

function makeSheet(cells) {
  return {
    getRaw(addr) {
      return cells[addr] || '';
    }
  };
}

assert.strictEqual(api.evaluateCell('C1', makeSheet({ A1: '10', A2: '5', C1: '=A1+A2*2' })).display, '20');
assert.strictEqual(api.evaluateCell('B1', makeSheet({ A1: 'Hello', B1: '="Total: "&A1' })).display, 'Total: Hello');
assert.strictEqual(api.evaluateCell('A3', makeSheet({ A1: '1', A2: '2', A3: '=SUM(A1:A2)' })).display, '3');
assert.strictEqual(api.evaluateCell('A1', makeSheet({ A1: '=A1+1' })).display, '#CIRC!');
assert.strictEqual(api.shiftFormula('=A1+$B$2+C$3+$D4+SUM(A1:B2)', 1, 2), '=C2+$B$2+E$3+$D5+SUM(C2:D3)');

console.log('spreadsheet core tests passed');
