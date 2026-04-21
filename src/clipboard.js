function serializeClipboardRows(rows) {
  return rows.map(function (row) {
    return row.map(function (cell) { return cell == null ? '' : String(cell); }).join('\t');
  }).join('\n');
}

function parseClipboardText(text) {
  return String(text).replace(/\r/g, '').split('\n').map(function (row) {
    return row.split('\t');
  });
}

function shiftFormulaReferences(formula, rowDelta, colDelta) {
  if (!formula || formula[0] !== '=') {
    return formula;
  }
  return '=' + formula.slice(1).replace(/(\$?)([A-Z]+)(\$?)([1-9][0-9]*)/g, function (_, absCol, colLabel, absRow, rowLabel) {
    const nextCol = absCol ? columnToIndex(colLabel) : columnToIndex(colLabel) + colDelta;
    const nextRow = absRow ? Number(rowLabel) : Number(rowLabel) + rowDelta;
    return (absCol ? '$' : '') + indexToColumn(nextCol) + (absRow ? '$' : '') + String(nextRow);
  });
}

function columnToIndex(label) {
  let value = 0;
  for (let i = 0; i < label.length; i += 1) value = value * 26 + (label.charCodeAt(i) - 64);
  return value;
}

function indexToColumn(index) {
  let value = index;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

module.exports = {
  serializeClipboardRows,
  parseClipboardText,
  shiftFormulaReferences,
};
