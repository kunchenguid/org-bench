import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rules page defines deckbuilding, turn flow, and combat response sections', () => {
  const html = readFileSync(new URL('../rules.html', import.meta.url), 'utf8');

  assert.match(html, /<h1[^>]*>Rules<\/h1>/i);
  assert.match(html, /Deckbuilding/i);
  assert.match(html, /Turn Flow/i);
  assert.match(html, /Combat Resolution/i);
  assert.match(html, /Momentum Response Window/i);
  assert.match(html, /40-card deck/i);
  assert.match(html, /draw 1 card/i);
  assert.match(html, /Both sides deal damage at the same time/i);
  assert.match(html, /bank shield charge or punish an overcommit/i);
});
