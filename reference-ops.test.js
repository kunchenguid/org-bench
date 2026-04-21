const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rewriteFormulaReferences,
} = require('./reference-ops.js');

test('inserting a row shifts references at or below the insertion point', () => {
  assert.equal(
    rewriteFormulaReferences('=SUM(A1,$B$2,C$3,$D4)', {
      type: 'insert-row',
      index: 2,
      count: 1,
    }),
    '=SUM(A1,$B$3,C$4,$D5)'
  );
});

test('inserting a column shifts references at or to the right of the insertion point', () => {
  assert.equal(
    rewriteFormulaReferences('=A1+B$2+$C3+$D$4', {
      type: 'insert-column',
      index: 2,
      count: 2,
    }),
    '=A1+D$2+$E3+$F$4'
  );
});

test('deleting a row preserves surviving references and marks deleted targets', () => {
  assert.equal(
    rewriteFormulaReferences('=SUM(A1,B2,C3,D4)', {
      type: 'delete-row',
      index: 2,
      count: 2,
    }),
    '=SUM(A1,#REF!,#REF!,D2)'
  );
});

test('deleting a column preserves surviving references and marks deleted targets', () => {
  assert.equal(
    rewriteFormulaReferences('=SUM(A1,B2,C3,D4,E5)', {
      type: 'delete-column',
      index: 2,
      count: 2,
    }),
    '=SUM(A1,#REF!,#REF!,B4,C5)'
  );
});

test('range endpoints update independently during structural edits', () => {
  assert.equal(
    rewriteFormulaReferences('=SUM(A1:B3)+SUM($C$2:D$4)', {
      type: 'insert-column',
      index: 2,
      count: 1,
    }),
    '=SUM(A1:C3)+SUM($D$2:E$4)'
  );
});

test('non-reference text remains unchanged', () => {
  assert.equal(
    rewriteFormulaReferences('="Row 2"&"-"&TRUE', {
      type: 'delete-row',
      index: 2,
      count: 1,
    }),
    '="Row 2"&"-"&TRUE'
  );
});
