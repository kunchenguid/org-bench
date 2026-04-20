const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('index.html loads the standalone game core before main', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /<script src="src\/game-core\.js"><\/script>/);
  assert.match(html, /<script src="src\/main\.js"><\/script>/);
  assert.ok(html.indexOf('src/game-core.js') < html.indexOf('src/main.js'));
});

test('main runtime consumes the standalone game core globals', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

  assert.match(source, /AppleDuelGameCore/);
  assert.match(source, /createInitialState/);
});
