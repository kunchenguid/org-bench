const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getContextActions,
  getAxisLabel,
} = require('../src/header-controls');

test('row header actions expose insert above, insert below, and delete affordances', () => {
  const actions = getContextActions('row', 7);

  assert.deepEqual(actions, [
    {
      action: 'insert-before',
      axis: 'row',
      index: 7,
      kind: 'insert-rows',
      label: 'Insert row above',
      shortcut: 'Shift+Enter',
    },
    {
      action: 'insert-after',
      axis: 'row',
      index: 7,
      kind: 'insert-rows',
      label: 'Insert row below',
      shortcut: 'Enter',
    },
    {
      action: 'delete',
      axis: 'row',
      index: 7,
      kind: 'delete-rows',
      label: 'Delete row',
      shortcut: 'Delete',
    },
  ]);
});

test('column header actions expose insert before, insert after, and delete affordances', () => {
  const actions = getContextActions('column', 3);

  assert.deepEqual(actions, [
    {
      action: 'insert-before',
      axis: 'column',
      index: 3,
      kind: 'insert-columns',
      label: 'Insert column left',
      shortcut: 'Shift+Enter',
    },
    {
      action: 'insert-after',
      axis: 'column',
      index: 3,
      kind: 'insert-columns',
      label: 'Insert column right',
      shortcut: 'Enter',
    },
    {
      action: 'delete',
      axis: 'column',
      index: 3,
      kind: 'delete-columns',
      label: 'Delete column',
      shortcut: 'Delete',
    },
  ]);
});

test('axis labels stay presentation-friendly for menu copy', () => {
  assert.equal(getAxisLabel('row'), 'row');
  assert.equal(getAxisLabel('column'), 'column');
  assert.equal(getAxisLabel('grid'), 'item');
});
