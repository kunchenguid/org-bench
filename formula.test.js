const assert = require('node:assert/strict');
const { createEngine } = require('./app.js');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('evaluates arithmetic with precedence', () => {
  const engine = createEngine();
  engine.setCell('A1', '=1+2*3');
  assert.equal(engine.getDisplayValue('A1'), '7');
});

run('resolves references and recomputes dependents', () => {
  const engine = createEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('B1', '=A1+A2');
  assert.equal(engine.getDisplayValue('B1'), '5');
  engine.setCell('A2', '5');
  assert.equal(engine.getDisplayValue('B1'), '7');
});

run('supports SUM over a range', () => {
  const engine = createEngine();
  engine.setCell('A1', '2');
  engine.setCell('A2', '3');
  engine.setCell('A3', '5');
  engine.setCell('B1', '=SUM(A1:A3)');
  assert.equal(engine.getDisplayValue('B1'), '10');
});

run('renders circular references as #CIRC!', () => {
  const engine = createEngine();
  engine.setCell('A1', '=B1');
  engine.setCell('B1', '=A1');
  assert.equal(engine.getDisplayValue('A1'), '#CIRC!');
  assert.equal(engine.getDisplayValue('B1'), '#CIRC!');
});

run('supports IF and concatenation', () => {
  const engine = createEngine();
  engine.setCell('A1', '4');
  engine.setCell('B1', '=IF(A1>3,"ok","no")&"!"');
  assert.equal(engine.getDisplayValue('B1'), 'ok!');
});
