import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const requiredHtml = [
  'class="sheet-app"',
  'class="sheet-chrome"',
  'class="formula-bar"',
  'id="grid-root"',
  'scripts/app-state.js',
  'scripts/app.js'
];

const requiredCss = [
  '.sheet-app',
  '.sheet-chrome',
  '.grid-shell',
  '.grid-root',
  '.is-active-cell',
  '.is-selected',
  '.cell-value-number',
  '.cell-value-text',
  '.cell-value-error',
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

const demoContent = ['visual-state-contract', 'renderVisualGrid', '=SUM(A1:A5)', 'Revenue', '#DIV/0!'];

for (const needle of demoContent) {
  if (html.includes(needle)) {
    throw new Error(`Demo-only content should not ship in index.html: ${needle}`);
  }
}

console.log('visual smoke contract ok');
