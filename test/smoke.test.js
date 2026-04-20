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
  assert.match(html, /<script[^>]*src="\.\/src\/renderer\.js"[^>]*><\/script>/i);
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

test('boot overlay wires in the faction art pack', () => {
  const html = read('index.html');
  const css = read('styles.css');

  assert.match(html, /assets\/art\/factions\/solar-league-sigil\.svg/i);
  assert.match(html, /assets\/art\/factions\/umbral-synod-sigil\.svg/i);
  assert.match(html, /boot-status__sigil/i);
  assert.match(css, /boot-status__sigil/i);
  assert.match(css, /boot-status__eyebrow/i);
});

test('script requests a webgl context and resizes the canvas', () => {
  const js = read('script.js');

  assert.match(js, /getContext\(['"]webgl['"]/i);
  assert.match(js, /art:\s*duelGame\.art/i);
  assert.doesNotMatch(js, /gl\.clearColor/i);
  assert.match(js, /window\.addEventListener\(['"]resize['"]/i);
  assert.match(js, /requestAnimationFrame/i);
});

test('script updates overlay copy without replacing the themed overlay shell', () => {
  const js = read('script.js');

  assert.match(js, /boot-status__copy/i);
  assert.doesNotMatch(js, /status\.textContent\s*=\s*['"]Canvas shell ready/i);
});
