const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('formula bar has a visible fx affordance and selected range status', () => {
  assert.match(html, /class="fx-badge"[^>]*>fx</);
  assert.match(html, /id="selection-status"/);
  assert.match(app, /selectionStatus\.textContent/);
});

test('active cell remains distinct inside a selected range', () => {
  assert.match(css, /\.cell\.selected[\s\S]*box-shadow/);
  assert.match(css, /\.cell\.active-in-range[\s\S]*background:\s*#fff/);
});

test('mobile toolbar keeps the formula input readable', () => {
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.toolbar[\s\S]*grid-template-columns:\s*64px minmax\(180px, 1fr\)/);
  assert.match(css, /\.brand\s*\{[\s\S]*display:\s*none/);
});
