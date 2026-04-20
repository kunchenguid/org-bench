const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createClipboardPayload,
  createTextClipboardPayload,
  applyClipboardPayload,
} = require('../src/clipboard.js');
const formulaApi = require('../formula.js');

test('pasting a copied formula shifts relative references by destination offset', () => {
  const cells = {
    A1: '5',
    B1: '=A1',
  };

  const payload = createClipboardPayload(cells, 'B1', 'B1', formulaApi, false);
  const nextCells = applyClipboardPayload(cells, payload, 'B2', 'B2', formulaApi, 26, 100);

  assert.equal(nextCells.B2, '=A2');
});

test('cut paste clears the source block after writing the destination', () => {
  const cells = {
    A1: '1',
    B1: '=A1',
  };

  const payload = createClipboardPayload(cells, 'A1', 'B1', formulaApi, true);
  const nextCells = applyClipboardPayload(cells, payload, 'A2', 'B2', formulaApi, 26, 100);

  assert.deepEqual(nextCells, {
    A2: '1',
    B2: '=A2',
  });
});

test('external text payload pastes into a matching-size destination rectangle cell by cell', () => {
  const payload = createTextClipboardPayload('1\t2');
  const nextCells = applyClipboardPayload({}, payload, 'C3', 'D3', formulaApi, 26, 100);

  assert.deepEqual(nextCells, {
    C3: '1',
    D3: '2',
  });
});
