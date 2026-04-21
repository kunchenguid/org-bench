const fs = require('fs');
const path = require('path');

function assertIncludes(source, snippet, message) {
  if (!source.includes(snippet)) {
    throw new Error(message + `\nMissing snippet: ${snippet}`);
  }
}

const cssPath = path.join(__dirname, '..', 'styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

assertIncludes(css, '.status-pill {', 'status pill styles should exist');
assertIncludes(css, 'border: 1px solid rgba(37, 99, 235, 0.18);', 'status pill should get a lighter blue bordered treatment');
assertIncludes(css, 'box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);', 'formula inputs should get subtle inset polish');
assertIncludes(css, '.cell.active::before {', 'active cells should render a fill handle');

console.log('visual polish contract looks correct');
