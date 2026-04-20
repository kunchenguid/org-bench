const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gamePath = path.join(__dirname, '..', 'src', 'game.js');

test('game bootstrap wires the tutorial helper into the live board', () => {
  const source = fs.readFileSync(gamePath, 'utf8');

  assert.match(source, /DuelTutorial/);
  assert.match(source, /getTutorialState\(/);
});
