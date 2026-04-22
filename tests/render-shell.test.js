const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('spreadsheet shell files exist and are wired with relative paths', () => {
  const expectedFiles = ['index.html', 'styles.css', path.join('src', 'view.js')];

  for (const relativePath of expectedFiles) {
    assert.equal(
      fs.existsSync(path.join(rootDir, relativePath)),
      true,
      `${relativePath} should exist`
    );
  }

  const html = readFile('index.html');
  assert.match(html, /href="styles\.css"/, 'index should link the stylesheet with a relative path');
  assert.match(html, /src="src\/view\.js"/, 'index should load the view script with a relative path');
});

test('spreadsheet shell exposes the chrome Quinn asked for', () => {
  const html = readFile('index.html');

  assert.match(html, /data-name-box/, 'index should expose a name box');
  assert.match(html, /data-formula-input/, 'index should expose a formula bar input');
  assert.match(html, /data-grid-root/, 'index should expose a grid root');
  assert.match(html, /data-column-actions/, 'index should expose discoverable column actions');
  assert.match(html, /data-row-actions/, 'index should expose discoverable row actions');
});

test('view layer exposes data-driven render hooks', () => {
  const viewSource = readFile(path.join('src', 'view.js'));

  assert.match(viewSource, /function createGridModel\(/, 'view should build a grid model from data');
  assert.match(viewSource, /function renderSpreadsheet\(/, 'view should render the spreadsheet shell');
  assert.match(viewSource, /window\.SpreadsheetView\s*=\s*\{/, 'view should expose hooks on window for the integrator');
});
