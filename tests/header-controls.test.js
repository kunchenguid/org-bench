const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('row and column headers expose insert and delete controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'app.js'), 'utf8');

  assert.match(html, /<script src="rowColumnOperations\.js"><\/script>/);
  assert.match(app, /setAttribute\("data-action", action\.name\)/);
  assert.match(app, /"insert-row-above"/);
  assert.match(app, /"insert-row-below"/);
  assert.match(app, /"delete-row"/);
  assert.match(app, /"insert-column-left"/);
  assert.match(app, /"insert-column-right"/);
  assert.match(app, /"delete-column"/);
});
