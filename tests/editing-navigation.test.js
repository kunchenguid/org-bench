const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.join(__dirname, '..', 'app.js');
const code = fs.readFileSync(appPath, 'utf8');
const context = {
  window: {},
  document: { addEventListener() {} },
  localStorage: {
    getItem() { return null; },
    setItem() {},
  },
};
context.globalThis = context.window;
vm.createContext(context);
vm.runInContext(code, context);

const core = context.window.SpreadsheetCore;
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.ok(core, 'SpreadsheetCore is exposed for behavior tests');

const model = core.createModel();
model.cells.A1 = '42';

assert.deepStrictEqual(plain(core.moveSelection({ row: 1, col: 1 }, 'ArrowLeft')), { row: 1, col: 1 });
assert.deepStrictEqual(plain(core.moveSelection({ row: 100, col: 26 }, 'ArrowDown')), { row: 100, col: 26 });
assert.deepStrictEqual(plain(core.moveSelection({ row: 1, col: 1 }, 'ArrowRight')), { row: 1, col: 2 });

let edit = core.beginEdit(model, { row: 1, col: 1 }, false);
assert.strictEqual(edit.value, '42', 'Enter/F2 edit preserves existing contents');

edit = core.beginEdit(model, { row: 1, col: 1 }, true);
assert.strictEqual(edit.value, '', 'typing into a selected cell starts replacement edit');
core.commitEdit(model, edit, '99');
assert.strictEqual(model.cells.A1, '99');

const cancelEdit = core.beginEdit(model, { row: 1, col: 1 }, false);
core.commitEdit(model, cancelEdit, '123');
core.cancelEdit(model, cancelEdit);
assert.strictEqual(model.cells.A1, '99', 'Escape cancel restores previous contents');

assert.deepStrictEqual(plain(core.nextAfterCommit({ row: 1, col: 1 }, 'Enter')), { row: 2, col: 1 });
assert.deepStrictEqual(plain(core.nextAfterCommit({ row: 1, col: 1 }, 'Tab')), { row: 1, col: 2 });

console.log('editing-navigation behavior passed');
