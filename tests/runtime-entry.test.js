const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gameJs = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

test('index.html loads the actual shipped browser scripts', () => {
  assert.match(indexHtml, /<script src="game-logic\.js"><\/script>/);
  assert.match(indexHtml, /<script src="game\.js"><\/script>/);
  assert.doesNotMatch(indexHtml, /src\/game-core\.js/);
  assert.doesNotMatch(indexHtml, /src\/main\.js/);
});

test('runtime code uses currentPlayer instead of the removed currentSide field', () => {
  assert.match(gameJs, /currentPlayer/);
  assert.doesNotMatch(gameJs, /currentSide/);
});
