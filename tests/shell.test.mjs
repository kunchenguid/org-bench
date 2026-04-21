import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('html links the spreadsheet shell stylesheet', async () => {
  const html = await read('index.html');

  assert.match(html, /<link[^>]+href="styles\.css"/i);
  assert.match(html, /class="app-shell"/i);
});

test('html exposes the shell hooks for the formula bar and spreadsheet grid', async () => {
  const html = await read('index.html');

  assert.match(html, /data-formula-input/i);
  assert.match(html, /data-grid-corner/i);
  assert.match(html, /data-column-headers/i);
  assert.match(html, /data-row-headers/i);
  assert.match(html, /data-cell-grid/i);
});

test('styles define the key spreadsheet visual states', async () => {
  const css = await read('styles.css');

  assert.match(css, /\.cell\.is-active/);
  assert.match(css, /\.cell\.is-in-range/);
  assert.match(css, /\.cell\.is-editing/);
  assert.match(css, /\.sheet-context-menu/);
  assert.match(css, /position:\s*sticky/);
});
