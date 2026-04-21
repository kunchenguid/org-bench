const test = require('node:test');
const assert = require('node:assert/strict');

const { getEditingKeyAction } = require('./app-keydown.js');

test('routes document-level Enter to commit when a cell editor is open', () => {
  assert.deepEqual(getEditingKeyAction({
    key: 'Enter',
    targetKind: 'document',
    hasCellEditor: true,
  }), {
    type: 'commit',
    dCol: 0,
    dRow: 1,
  });
});

test('routes formula Enter to commit and move down', () => {
  assert.deepEqual(getEditingKeyAction({
    key: 'Enter',
    targetKind: 'formula',
    hasCellEditor: false,
  }), {
    type: 'commit',
    dCol: 0,
    dRow: 1,
  });
});

test('routes document-level Escape to cancel when a cell editor is open', () => {
  assert.deepEqual(getEditingKeyAction({
    key: 'Escape',
    targetKind: 'document',
    hasCellEditor: true,
  }), {
    type: 'cancel',
  });
});
