import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rulesHtml = readFileSync(new URL('../rules.html', import.meta.url), 'utf8');

test('rules page teaches setup turn flow deck rules and win condition', () => {
  assert.match(rulesHtml, /<h1[^>]*>Signal Clash Rules<\/h1>/i);
  assert.match(rulesHtml, /<h2[^>]*>Setup<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Turn Flow<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Deckbuilding Rules<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Win Condition<\/h2>/i);
  assert.match(rulesHtml, /draw one card/i);
  assert.match(rulesHtml, /exactly 20 cards/i);
});
