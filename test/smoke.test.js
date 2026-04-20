const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('index boots a classic script canvas shell', () => {
  const html = read('index.html');

  assert.match(html, /<canvas[^>]*id="game-canvas"/i);
  assert.match(html, /<script[^>]*src="\.\/art-config\.js"[^>]*><\/script>/i);
  assert.match(html, /<script[^>]*src="\.\/script\.js"[^>]*><\/script>/i);
  assert.doesNotMatch(html, /type="module"/i);
  assert.match(html, /<link[^>]*href="\.\/styles\.css"/i);
});

test('styles make the app fullscreen', () => {
  const css = read('styles.css');

  assert.match(css, /min-height:\s*100vh/i);
  assert.match(css, /width:\s*100%/i);
  assert.match(css, /height:\s*100%/i);
});

test('script requests a webgl context and resizes the canvas', () => {
  const js = read('script.js');

  assert.match(js, /getContext\(['"]webgl['"]/i);
  assert.match(js, /window\.addEventListener\(['"]resize['"]/i);
  assert.match(js, /requestAnimationFrame/i);
});
