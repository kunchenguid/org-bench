const assert = require('assert');
const fs = require('fs');

const css = fs.readFileSync('styles.css', 'utf8');

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector} rule`);
  return match[1];
}

function run() {
  const topRule = ruleFor('.cell.selection-top');
  const bottomRule = ruleFor('.cell.selection-bottom');
  assert.ok(/border-top-color:\s*var\(--accent\)/.test(topRule), 'top range edge uses border color');
  assert.ok(/border-bottom-color:\s*var\(--accent\)/.test(bottomRule), 'bottom range edge uses border color');
  assert.ok(!/box-shadow/.test(topRule + bottomRule), 'range edge rules do not overwrite active-cell shadows');
}

run();
console.log('range visual css tests passed');
