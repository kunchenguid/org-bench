const assert = require('node:assert/strict');

const { createEngine } = require('./engine.js');

function makeEngine(cells) {
  return createEngine(cells || {});
}

function valuesOf(cells) {
  return makeEngine(cells).values;
}

{
  const values = valuesOf({ A1: '2', A2: '3', A3: '=A1+A2*4' });
  assert.equal(values.A3.value, 14);
}

{
  const values = valuesOf({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)' });
  assert.equal(values.B1.value, 6);
}

{
  const values = valuesOf({ A1: '2', A2: '4', A3: '=AVERAGE(A1:A2)', A4: '=COUNT(A1:A3)' });
  assert.equal(values.A3.value, 3);
  assert.equal(values.A4.value, 3);
}

{
  const values = valuesOf({ A1: '7', A2: '=IF(A1>3, 11, 0)', A3: '=MIN(A1, A2, 9)', A4: '=MAX(A1, A2, 9)' });
  assert.equal(values.A2.value, 11);
  assert.equal(values.A3.value, 7);
  assert.equal(values.A4.value, 11);
}

{
  const values = valuesOf({ A1: '=B1+2' });
  assert.equal(values.A1.value, 2);
}

{
  const values = valuesOf({ A1: '=1/0', A2: '=NOPE(1)' });
  assert.equal(values.A1.display, '#DIV/0!');
  assert.equal(values.A2.display, '#ERR!');
}

{
  const values = valuesOf({ A1: '=B1', B1: '=A1' });
  assert.equal(values.A1.display, '#CIRC!');
  assert.equal(values.B1.display, '#CIRC!');
}

console.log('engine tests passed');
