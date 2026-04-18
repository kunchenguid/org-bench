import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('play page frames divB lane play and command queue', () => {
  const html = readFileSync(new URL('../play.html', import.meta.url), 'utf8');

  assert.match(html, /<title>.*Play.*<\/title>/i);
  assert.match(html, /Match Status/i);
  assert.match(html, /Tempo Lead/i);
  assert.match(html, /Command Queue/i);
  assert.match(html, /Three lanes/i);
  assert.match(html, /Target Priority/i);
  assert.match(html, /The AI strikes the lane with the weakest blocker first, then converts overflow into face pressure\./i);
  assert.match(html, /Resolve Command/i);
  assert.match(html, /Pressure favors efficient trades over random burst turns\./i);
});
