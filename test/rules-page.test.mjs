import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rules page defines the fuller div b rules sections', () => {
  const html = readFileSync(new URL('../rules.html', import.meta.url), 'utf8');

  assert.match(html, /<h1[^>]*>Signal Clash Rules<\/h1>/i);
  assert.match(html, /Setup/i);
  assert.match(html, /Turn Flow/i);
  assert.match(html, /Card Types/i);
  assert.match(html, /Deckbuilding Rules/i);
  assert.match(html, /exactly 20 cards/i);
  assert.match(html, /draw one card/i);
});
