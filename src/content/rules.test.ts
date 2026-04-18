import test from 'node:test';
import assert from 'node:assert/strict';

import { rulesSections } from './rules';

test('rules content teaches the match flow and combat timing', () => {
  assert.equal(rulesSections.length, 5);
  assert.deepEqual(
    rulesSections.map((section) => section.title),
    ['Goal', 'Turn Flow', 'Combat Resolution', 'Card Types', 'Winning Tips'],
  );
  assert.match(rulesSections[1].body, /draw 1 card/i);
  assert.match(rulesSections[2].body, /same time/i);
  assert.match(rulesSections[2].body, /momentum response window/i);
  assert.match(rulesSections[3].body, /creatures/i);
  assert.match(rulesSections[3].body, /signals/i);
});
