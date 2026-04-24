(function (root) {
  function createSheet(rows, columns) {
    return { rows, columns, cells: Object.create(null) };
  }

  function columnNameToIndex(name) {
    let index = 0;
    for (let i = 0; i < name.length; i += 1) {
      index = index * 26 + (name.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  function indexToColumnName(index) {
    let name = '';
    let value = index + 1;
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function parseAddress(address) {
    const match = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(address);
    if (!match) throw new Error('Invalid cell address: ' + address);
    return {
      columnAbsolute: match[1] === '$',
      column: columnNameToIndex(match[2]),
      rowAbsolute: match[3] === '$',
      row: Number(match[4]) - 1,
    };
  }

  function formatAddress(parts) {
    return (parts.columnAbsolute ? '$' : '') + indexToColumnName(parts.column) + (parts.rowAbsolute ? '$' : '') + String(parts.row + 1);
  }

  function getCell(sheet, address) {
    return sheet.cells[normalizeAddress(address)] || '';
  }

  function setCell(sheet, address, value) {
    const key = normalizeAddress(address);
    if (value === '') delete sheet.cells[key];
    else sheet.cells[key] = String(value);
  }

  function normalizeAddress(address) {
    const parsed = parseAddress(address.replace(/\$/g, ''));
    return formatAddress({ column: parsed.column, row: parsed.row, columnAbsolute: false, rowAbsolute: false });
  }

  function remapCells(sheet, mapper) {
    const nextCells = Object.create(null);
    for (const address of Object.keys(sheet.cells)) {
      const next = mapper(parseAddress(address));
      if (next) nextCells[formatAddress(next)] = sheet.cells[address];
    }
    sheet.cells = nextCells;
  }

  function rewriteAllFormulas(sheet, rewriter) {
    for (const address of Object.keys(sheet.cells)) {
      const value = sheet.cells[address];
      if (value.charAt(0) === '=') sheet.cells[address] = rewriteFormula(value, rewriter);
    }
  }

  function rewriteFormula(formula, rewriter) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)([1-9][0-9]*)/g, function (_match, columnAbs, columnName, rowAbs, rowNumber) {
      const next = rewriter({
        columnAbsolute: columnAbs === '$',
        column: columnNameToIndex(columnName),
        rowAbsolute: rowAbs === '$',
        row: Number(rowNumber) - 1,
      });
      return next === null ? '#REF!' : formatAddress(next);
    });
  }

  function collectRows(sheet, index, count) {
    const deleted = [];
    for (const address of Object.keys(sheet.cells)) {
      const parsed = parseAddress(address);
      if (parsed.row >= index && parsed.row < index + count) {
        deleted.push({ address, value: sheet.cells[address] });
      }
    }
    return deleted;
  }

  function collectColumns(sheet, index, count) {
    const deleted = [];
    for (const address of Object.keys(sheet.cells)) {
      const parsed = parseAddress(address);
      if (parsed.column >= index && parsed.column < index + count) {
        deleted.push({ address, value: sheet.cells[address] });
      }
    }
    return deleted;
  }

  function insertRows(sheet, index, count) {
    remapCells(sheet, function (cell) {
      return cell.row >= index ? Object.assign({}, cell, { row: cell.row + count }) : cell;
    });
    sheet.rows += count;
    rewriteAllFormulas(sheet, function (ref) {
      return ref.row >= index ? Object.assign({}, ref, { row: ref.row + count }) : ref;
    });
    return { type: 'insertRows', index, count, undo: { type: 'deleteRows', index, count } };
  }

  function deleteRows(sheet, index, count) {
    const deletedCells = collectRows(sheet, index, count);
    remapCells(sheet, function (cell) {
      if (cell.row >= index && cell.row < index + count) return null;
      return cell.row >= index + count ? Object.assign({}, cell, { row: cell.row - count }) : cell;
    });
    sheet.rows = Math.max(0, sheet.rows - count);
    rewriteAllFormulas(sheet, function (ref) {
      if (ref.row >= index && ref.row < index + count) return null;
      return ref.row >= index + count ? Object.assign({}, ref, { row: ref.row - count }) : ref;
    });
    return { type: 'deleteRows', index, count, deletedCells, undo: { type: 'insertRows', index, count, restore: deletedCells } };
  }

  function insertColumns(sheet, index, count) {
    remapCells(sheet, function (cell) {
      return cell.column >= index ? Object.assign({}, cell, { column: cell.column + count }) : cell;
    });
    sheet.columns += count;
    rewriteAllFormulas(sheet, function (ref) {
      return ref.column >= index ? Object.assign({}, ref, { column: ref.column + count }) : ref;
    });
    return { type: 'insertColumns', index, count, undo: { type: 'deleteColumns', index, count } };
  }

  function deleteColumns(sheet, index, count) {
    const deletedCells = collectColumns(sheet, index, count);
    remapCells(sheet, function (cell) {
      if (cell.column >= index && cell.column < index + count) return null;
      return cell.column >= index + count ? Object.assign({}, cell, { column: cell.column - count }) : cell;
    });
    sheet.columns = Math.max(0, sheet.columns - count);
    rewriteAllFormulas(sheet, function (ref) {
      if (ref.column >= index && ref.column < index + count) return null;
      return ref.column >= index + count ? Object.assign({}, ref, { column: ref.column - count }) : ref;
    });
    return { type: 'deleteColumns', index, count, deletedCells, undo: { type: 'insertColumns', index, count, restore: deletedCells } };
  }

  const api = {
    createSheet,
    setCell,
    getCell,
    insertRows,
    deleteRows,
    insertColumns,
    deleteColumns,
    rewriteFormula,
    columnNameToIndex,
    indexToColumnName,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RowColumnOperations = api;
})(typeof window !== 'undefined' ? window : globalThis);
