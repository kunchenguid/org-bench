const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('row and column headers expose insert and delete controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(html, /data-action="insert-row-above"/);
  assert.match(html, /data-action="insert-row-below"/);
  assert.match(html, /data-action="delete-row"/);
  assert.match(html, /data-action="insert-column-left"/);
  assert.match(html, /data-action="insert-column-right"/);
  assert.match(html, /data-action="delete-column"/);
});
