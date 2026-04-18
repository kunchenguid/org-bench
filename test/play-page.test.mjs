import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('play page presents Division A combat loop priorities', () => {
  const html = readFileSync(new URL('../play.html', import.meta.url), 'utf8');

  assert.match(html, /<h1[^>]*>Signal Clash<\/h1>/i);
  assert.match(html, /Combat Loop/i);
  assert.match(html, /AI Opponent Read/i);
  assert.match(html, /Encounter Ladder/i);
  assert.match(html, /Play First Card/i);
  assert.match(html, /Commit Attack Lane/i);
  assert.match(html, /End Turn Clean/i);
});
