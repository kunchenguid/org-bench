const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const requiredAssets = [
  'assets/sigils/solar-order.svg',
  'assets/sigils/lunar-covenant.svg',
  'assets/icons/health-gem.svg',
  'assets/icons/deck-stack.svg',
  'assets/icons/attack-burst.svg',
  'assets/icons/end-turn-rune.svg',
  'assets/effects/hit-flash.svg',
  'assets/effects/slash-wave.svg',
  'assets/effects/ember-sparks.svg',
  'assets/effects/death-dissolve.svg',
];

test('art bundle includes sigils, hud icons, and combat sprites', () => {
  requiredAssets.forEach((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    assert.equal(fs.existsSync(absolutePath), true, `${relativePath} should exist`);

    const content = fs.readFileSync(absolutePath, 'utf8');
    assert.match(content, /<svg[\s>]/, `${relativePath} should be an SVG asset`);
    assert.ok(content.length > 300, `${relativePath} should contain real authored art`);
  });
});
