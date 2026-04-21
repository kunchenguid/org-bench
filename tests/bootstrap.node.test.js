const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScript(fileName, context) {
  const filePath = path.join(__dirname, '..', 'js', fileName);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(source, context, { filename: filePath });
}

const rootNode = {
  innerHTML: '',
  dataset: {},
};

const context = vm.createContext({
  window: {},
  document: {
    documentElement: {
      getAttribute() {
        return null;
      },
    },
    querySelector() {
      return null;
    },
    getElementById(id) {
      if (id === 'app') {
        return rootNode;
      }
      return null;
    },
  },
  console,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  },
  setTimeout,
  clearTimeout,
});

context.window.window = context.window;
context.window.document = context.document;
context.window.localStorage = context.localStorage;
context.window.console = context.console;

loadScript('storage.js', context);
loadScript('app.js', context);

assert.ok(context.window.SpreadsheetStorage, 'SpreadsheetStorage should be defined');
assert.equal(typeof context.window.SpreadsheetStorage.getNamespace, 'function');
assert.equal(typeof context.window.SpreadsheetStorage.makeKey, 'function');

context.window.__BENCHMARK_RUN_NAMESPACE__ = 'apple-test';
assert.equal(context.window.SpreadsheetStorage.getNamespace(), 'apple-test');
assert.equal(context.window.SpreadsheetStorage.makeKey('cells'), 'apple-test:cells');

assert.ok(context.window.SpreadsheetApp, 'SpreadsheetApp should be defined');
assert.equal(typeof context.window.SpreadsheetApp.boot, 'function');

const bootResult = context.window.SpreadsheetApp.boot();
assert.equal(rootNode.dataset.booted, 'true');
assert.match(rootNode.innerHTML, /formula-bar/);
assert.match(rootNode.innerHTML, /sheet-surface/);
assert.equal(bootResult.storageNamespace, 'apple-test');
