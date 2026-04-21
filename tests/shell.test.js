const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');

assert(fs.existsSync(htmlPath), 'index.html should exist');

const html = fs.readFileSync(htmlPath, 'utf8');

assert(html.includes('data-formula-bar'), 'shell should include a formula bar');

const columnMatches = html.match(/data-column-header=/g) || [];
assert(columnMatches.length === 26, `expected 26 column headers, got ${columnMatches.length}`);

const rowMatches = html.match(/data-row-header=/g) || [];
assert(rowMatches.length === 100, `expected 100 row headers, got ${rowMatches.length}`);

const cellMatches = html.match(/data-cell=/g) || [];
assert(cellMatches.length === 2600, `expected 2600 grid cells, got ${cellMatches.length}`);

assert(html.includes('data-active-cell="A1"'), 'shell should mark A1 as the active cell');

console.log('shell structure looks correct');
