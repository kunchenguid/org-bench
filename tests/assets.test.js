const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const manifestPath = path.join(assetsDir, 'manifest.json');

test('asset pack publishes a manifest with the required visual slots', () => {
  assert.equal(fs.existsSync(manifestPath), true, 'assets/manifest.json should exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const requiredEntries = [
    manifest.board,
    manifest.frames && manifest.frames.sol,
    manifest.frames && manifest.frames.luna,
    manifest.heroes && manifest.heroes.player,
    manifest.heroes && manifest.heroes.ai,
    manifest.sigils && manifest.sigils.sol,
    manifest.sigils && manifest.sigils.luna,
  ];

  assert.equal(manifest.theme, 'Ashen Duel');
  assert.equal(typeof manifest.naming.framePattern, 'string');
  assert.equal(typeof manifest.naming.heroPattern, 'string');
  assert.equal(typeof manifest.naming.sigilPattern, 'string');
  assert.equal(typeof manifest.naming.cardIllustrationPattern, 'string');
  assert.equal(Array.isArray(manifest.cards), true);
  assert.equal(manifest.cards.length >= 8, true);

  for (const entry of requiredEntries.concat(manifest.cards)) {
    assert.equal(typeof entry, 'string');
    assert.equal(fs.existsSync(path.join(root, entry)), true, `${entry} should exist`);
  }
});
