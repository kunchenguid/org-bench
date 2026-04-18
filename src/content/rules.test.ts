import test from 'node:test';
import assert from 'node:assert/strict';

import { rulesSections } from './rules';

test('rules content teaches the match flow and core card types', () => {
  assert.equal(rulesSections.length, 4);
  assert.deepEqual(
    rulesSections.map((section) => section.title),
    ['Goal', 'Turn Flow', 'Card Types', 'Winning Tips'],
  );
  assert.match(rulesSections[1].body, /draw 1 card/i);
  assert.match(rulesSections[2].body, /creatures/i);
  assert.match(rulesSections[2].body, /signals/i);
});
