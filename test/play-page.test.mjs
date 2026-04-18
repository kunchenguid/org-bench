import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('play page presents Division A combat loop priorities', () => {
  const html = readFileSync(new URL('../play.html', import.meta.url), 'utf8');

  assert.match(html, /<h1[^>]*>Signal Clash<\/h1>/i);
  assert.match(html, /Combat Loop/i);
  assert.match(html, /Encounter Flow/i);
  assert.match(html, /Scout the opener/i);
  assert.match(html, /Win the tempo pivot/i);
  assert.match(html, /Secure the finisher/i);
  assert.match(html, /AI Opponent Read/i);
  assert.match(html, /Counter Window/i);
  assert.match(html, /Bait the shield first/i);
  assert.match(html, /Punish the heavy swing/i);
  assert.match(html, /Encounter Ladder/i);
  assert.match(html, /Turn State/i);
  assert.match(html, /Player priority - Turn 3/i);
  assert.match(html, /2 actions banked/i);
  assert.match(html, /Play First Card/i);
  assert.match(html, /Commit Attack Lane/i);
  assert.match(html, /End Turn Clean/i);
});
