const assert = require('assert');
const {
  buildClipboardPayload,
  translatePaste,
} = require('../clipboard-utils.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('buildClipboardPayload captures a rectangular selection as TSV', () => {
  const payload = buildClipboardPayload({
    minRow: 0,
    maxRow: 1,
    minCol: 0,
    maxCol: 1,
  }, function getRaw(row, col) {
    return {
      '0,0': '1',
      '0,1': '=A1',
      '1,0': 'hello',
      '1,1': '',
    }[`${row},${col}`] || '';
  });

  assert.strictEqual(payload.originRow, 0);
  assert.strictEqual(payload.originCol, 0);
  assert.strictEqual(payload.width, 2);
  assert.strictEqual(payload.height, 2);
  assert.strictEqual(payload.text, '1\t=A1\nhello\t');
  assert.deepStrictEqual(payload.rawCells, [
    { row: 0, col: 0, raw: '1' },
    { row: 0, col: 1, raw: '=A1' },
    { row: 1, col: 0, raw: 'hello' },
    { row: 1, col: 1, raw: '' },
  ]);
});

test('translatePaste shifts formulas relative to the copied source on single-cell paste', () => {
  const payload = buildClipboardPayload({
    minRow: 0,
    maxRow: 0,
    minCol: 0,
    maxCol: 0,
  }, function getRaw() {
    return '=A1+$B$2';
  });

  const result = translatePaste({
    text: payload.text,
    targetRow: 2,
    targetCol: 1,
    sourcePayload: payload,
    pendingCut: null,
  });

  assert.deepStrictEqual(result.writes, [
    { row: 2, col: 1, raw: '=B3+$B$2' },
  ]);
  assert.deepStrictEqual(result.clears, []);
  assert.deepStrictEqual(result.selection, {
    minRow: 2,
    maxRow: 2,
    minCol: 1,
    maxCol: 1,
  });
});

test('translatePaste applies per-cell offsets across a matching-size pasted range', () => {
  const payload = buildClipboardPayload({
    minRow: 0,
    maxRow: 1,
    minCol: 0,
    maxCol: 1,
  }, function getRaw(row, col) {
    return {
      '0,0': '=A1',
      '0,1': '=B1',
      '1,0': '=A2',
      '1,1': '=B2',
    }[`${row},${col}`];
  });

  const result = translatePaste({
    text: payload.text,
    targetRow: 3,
    targetCol: 2,
    sourcePayload: payload,
    pendingCut: null,
  });

  assert.deepStrictEqual(result.writes, [
    { row: 3, col: 2, raw: '=C4' },
    { row: 3, col: 3, raw: '=D4' },
    { row: 4, col: 2, raw: '=C5' },
    { row: 4, col: 3, raw: '=D5' },
  ]);
  assert.deepStrictEqual(result.selection, {
    minRow: 3,
    maxRow: 4,
    minCol: 2,
    maxCol: 3,
  });
});

test('translatePaste keeps formulas intact for cut-paste and clears the old block', () => {
  const payload = buildClipboardPayload({
    minRow: 1,
    maxRow: 1,
    minCol: 1,
    maxCol: 2,
  }, function getRaw(row, col) {
    return {
      '1,1': '=A1+B1',
      '1,2': '7',
    }[`${row},${col}`] || '';
  });

  const result = translatePaste({
    text: payload.text,
    targetRow: 4,
    targetCol: 4,
    sourcePayload: payload,
    pendingCut: payload,
  });

  assert.deepStrictEqual(result.writes, [
    { row: 4, col: 4, raw: '=A1+B1' },
    { row: 4, col: 5, raw: '7' },
  ]);
  assert.deepStrictEqual(result.clears, [
    { row: 1, col: 1 },
    { row: 1, col: 2 },
  ]);
});

test('translatePaste uses the top-left of a matching destination selection', () => {
  const payload = buildClipboardPayload({
    minRow: 0,
    maxRow: 1,
    minCol: 0,
    maxCol: 1,
  }, function getRaw(row, col) {
    return {
      '0,0': '=A1',
      '0,1': '=B1',
      '1,0': '=A2',
      '1,1': '=B2',
    }[`${row},${col}`];
  });

  const result = translatePaste({
    text: payload.text,
    targetRow: 7,
    targetCol: 7,
    selection: {
      minRow: 4,
      maxRow: 5,
      minCol: 3,
      maxCol: 4,
    },
    sourcePayload: payload,
    pendingCut: null,
  });

  assert.deepStrictEqual(result.writes, [
    { row: 4, col: 3, raw: '=D5' },
    { row: 4, col: 4, raw: '=E5' },
    { row: 5, col: 3, raw: '=D6' },
    { row: 5, col: 4, raw: '=E6' },
  ]);
  assert.deepStrictEqual(result.selection, {
    minRow: 4,
    maxRow: 5,
    minCol: 3,
    maxCol: 4,
  });
});
