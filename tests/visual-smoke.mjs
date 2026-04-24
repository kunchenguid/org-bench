import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const requiredHtml = [
  'class="app-shell"',
  'class="formula-bar"',
  'class="sheet-grid"',
  'class="cell active"',
  'class="cell range-selected"',
  'class="cell number"',
  'class="cell text"',
  'class="cell error"'
];

const requiredCss = [
  '.sheet-grid',
  '.column-header',
  '.row-header',
  '.cell.active',
  '.cell.range-selected',
  '.cell.number',
  '.cell.text',
  '.cell.error',
  '@media (max-width: 720px)'
];

for (const needle of requiredHtml) {
  if (!html.includes(needle)) {
    throw new Error(`Missing visual hook in index.html: ${needle}`);
  }
}

for (const needle of requiredCss) {
  if (!css.includes(needle)) {
    throw new Error(`Missing visual rule in styles.css: ${needle}`);
  }
}

console.log('visual smoke contract ok');
