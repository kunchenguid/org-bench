import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rules page documents core play loop and deck rules', () => {
  const html = readFileSync(new URL('../rules.html', import.meta.url), 'utf8');

  assert.match(html, /<title>.*Rules.*<\/title>/i);
  assert.match(html, /Setup/i);
  assert.match(html, /Turn Sequence/i);
  assert.match(html, /Combat Resolution/i);
  assert.match(html, /Momentum windows let defenders blunt an attack or punish an overcommit\./i);
  assert.match(html, /Deckbuilding Rules/i);
  assert.match(html, /Win Condition/i);
});
