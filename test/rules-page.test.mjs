import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rules page defines deckbuilding and turn flow sections', () => {
  const html = readFileSync(new URL('../rules.html', import.meta.url), 'utf8');

  assert.match(html, /<h1[^>]*>Rules<\/h1>/i);
  assert.match(html, /Deckbuilding/i);
  assert.match(html, /Turn Flow/i);
  assert.match(html, /40-card deck/i);
  assert.match(html, /draw 1 card/i);
});
