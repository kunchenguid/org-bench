const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('index.html provides a canvas-first entrypoint with classic scripts', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /<canvas[^>]*id="game-canvas"/i);
  assert.match(html, /<script\s+src="src\/state\.js"><\/script>/i);
  assert.match(html, /<script\s+src="src\/tutorial\.js"><\/script>/i);
  assert.match(html, /<script\s+src="src\/game\.js"><\/script>/i);
  assert.doesNotMatch(html, /type="module"/i);
});

test('the integrated renderer ships authored svg assets and references them from src/game.js', () => {
  const gameJs = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');

  assert.equal(fs.existsSync(path.join(root, 'assets', 'board-bg.svg')), true);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'hero-player.svg')), true);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'hero-ai.svg')), true);
  assert.match(gameJs, /assets\/board-bg\.svg/);
  assert.match(gameJs, /assets\/hero-player\.svg/);
  assert.match(gameJs, /assets\/hero-ai\.svg/);
});
