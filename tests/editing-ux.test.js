const test = require('node:test');
const assert = require('node:assert/strict');

const { getCommitMoveForKey } = require('../editing-ux.js');

test('maps Enter to commit down and Tab to commit right', () => {
  assert.deepEqual(getCommitMoveForKey('Enter'), { dx: 0, dy: 1 });
  assert.deepEqual(getCommitMoveForKey('Tab'), { dx: 1, dy: 0 });
  assert.equal(getCommitMoveForKey('Escape'), null);
});
