const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gamePath = path.join(__dirname, '..', 'src', 'game.js');

test('game bootstrap derives local-storage keys from the shared namespace reader', () => {
  const source = fs.readFileSync(gamePath, 'utf8');

  assert.match(source, /readStorageNamespace\(/);
  assert.match(source, /createStorageKey\(storageNamespace, 'save'\)/);
});
