const assert = require('assert');
const {
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
} = require('../structural-utils.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('insertRow shifts cells downward and rewrites row references', () => {
  const result = insertRow({
    A1: '10',
    A2: '20',
    B2: '=SUM(A1:A2)',
    C3: '=A2',
  }, 1);

  assert.deepStrictEqual(result, {
    A1: '10',
    A3: '20',
    B3: '=SUM(A1:A3)',
    C4: '=A3',
  });
});

test('deleteRow shifts rows upward and turns deleted references into #REF!', () => {
  const result = deleteRow({
    A1: '10',
    A2: '20',
    B3: '=A2+A3',
    C4: '=SUM(A1:A3)',
  }, 1);

  assert.deepStrictEqual(result, {
    A1: '10',
    B2: '=#REF!+A2',
    C3: '=SUM(A1:A2)',
  });
});

test('insertColumn shifts cells rightward and rewrites column references', () => {
  const result = insertColumn({
    A1: '10',
    B1: '20',
    C2: '=SUM(A1:B1)',
    D3: '=B1',
  }, 1);

  assert.deepStrictEqual(result, {
    A1: '10',
    C1: '20',
    D2: '=SUM(A1:C1)',
    E3: '=C1',
  });
});

test('deleteColumn shifts columns leftward and marks deleted references', () => {
  const result = deleteColumn({
    A1: '10',
    B1: '20',
    C2: '=A1+B1+C1',
    D3: '=SUM(A1:C1)',
  }, 1);

  assert.deepStrictEqual(result, {
    A1: '10',
    B2: '=A1+#REF!+B1',
    C3: '=SUM(A1:B1)',
  });
});
