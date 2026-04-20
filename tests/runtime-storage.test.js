const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gamePath = path.join(__dirname, '..', 'src', 'game.js');

test('runtime save path uses DuelState namespace helpers', () => {
  const source = fs.readFileSync(gamePath, 'utf8');

  assert.match(source, /DuelState\.readStorageNamespace\(/);
  assert.match(source, /DuelState\.createStorageKey\(/);
});
