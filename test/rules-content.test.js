import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rulesHtml = readFileSync(new URL('../rules.html', import.meta.url), 'utf8');

test('rules page teaches setup turn flow card types deck rules and win condition', () => {
  assert.match(rulesHtml, /<h1[^>]*>Signal Clash Rules<\/h1>/i);
  assert.match(rulesHtml, /<h2[^>]*>Setup<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Quick Reference<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Turn Flow<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Example Turn<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>FAQ<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Card Types<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Deckbuilding Rules<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Starter Build Example<\/h2>/i);
  assert.match(rulesHtml, /<h2[^>]*>Win Condition<\/h2>/i);
  assert.match(rulesHtml, /core is your life total/i);
  assert.match(rulesHtml, /discard pile holds spent cards/i);
  assert.match(rulesHtml, /ready units can attack/i);
  assert.match(rulesHtml, /draw one card/i);
  assert.match(rulesHtml, /refresh, draw, deploy, then attack/i);
  assert.match(rulesHtml, /keep one energy open/i);
  assert.match(rulesHtml, /who goes first/i);
  assert.match(rulesHtml, /units enter exhausted/i);
  assert.match(rulesHtml, /units hold the board/i);
  assert.match(rulesHtml, /signals are one-shot effects/i);
  assert.match(rulesHtml, /12 units and 8 signals/i);
  assert.match(rulesHtml, /low-cost pressure package/i);
  assert.match(rulesHtml, /energy/i);
  assert.match(rulesHtml, /exactly 20 cards/i);
});
