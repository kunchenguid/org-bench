(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CELL_RE = /^([A-Z]+)(\d+)$/;
  const RANGE_RE = /([A-Z]+\d+):([A-Z]+\d+)/g;
  const REF_RE = /\b([A-Z]+\d+)\b/g;

  function createSheet() {
    return { cells: new Map() };
  }

  function normalizeCellId(cellId) {
    return String(cellId || '').trim().toUpperCase();
  }

  function columnIndexToLabel(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function columnLabelToIndex(label) {
    let index = 0;
    for (const char of label) {
      index = index * 26 + (char.charCodeAt(0) - 64);
    }
    return index - 1;
  }

  function cellIdToPoint(cellId) {
    const match = normalizeCellId(cellId).match(CELL_RE);
    if (!match) {
      throw new Error('Invalid cell id');
    }
    return { col: columnLabelToIndex(match[1]), row: Number(match[2]) - 1 };
  }

  function pointToCellId(col, row) {
    return columnIndexToLabel(col) + String(row + 1);
  }

  function setCellRaw(sheet, cellId, raw) {
    const id = normalizeCellId(cellId);
    if (!id) {
      return;
    }
    const value = String(raw ?? '');
    if (value === '') {
      sheet.cells.delete(id);
      return;
    }
    sheet.cells.set(id, value);
  }

  function getCellRaw(sheet, cellId) {
    return sheet.cells.get(normalizeCellId(cellId)) || '';
  }

  function formatValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return '#ERR!';
      }
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))).replace(/\.0+$/, '');
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function expandRange(startId, endId) {
    const start = cellIdToPoint(startId);
    const end = cellIdToPoint(endId);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const values = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        values.push(pointToCellId(col, row));
      }
    }
    return values;
  }

  function flattenArgs(args) {
    return args.flatMap((value) => (Array.isArray(value) ? flattenArgs(value) : [value]));
  }

  function asNumber(value) {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '') {
      return 0;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function isBlank(value) {
    return value === '' || value === null || value === undefined;
  }

  function asBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return !isBlank(value) && String(value).toUpperCase() !== 'FALSE';
  }

  function evaluateFormula(sheet, formula, stack) {
    const helpers = {
      SUM: (...args) => flattenArgs(args).reduce((sum, value) => sum + asNumber(value), 0),
      AVERAGE: (...args) => {
        const values = flattenArgs(args);
        return values.length ? helpers.SUM(...values) / values.length : 0;
      },
      MIN: (...args) => Math.min(...flattenArgs(args).map(asNumber)),
      MAX: (...args) => Math.max(...flattenArgs(args).map(asNumber)),
      COUNT: (...args) => flattenArgs(args).filter((value) => !isBlank(value)).length,
      IF: (condition, whenTrue, whenFalse) => (asBoolean(condition) ? whenTrue : whenFalse),
      AND: (...args) => flattenArgs(args).every(asBoolean),
      OR: (...args) => flattenArgs(args).some(asBoolean),
      NOT: (value) => !asBoolean(value),
      ABS: (value) => Math.abs(asNumber(value)),
      ROUND: (value, digits) => {
        const precision = Math.max(0, asNumber(digits));
        const factor = 10 ** precision;
        return Math.round(asNumber(value) * factor) / factor;
      },
      CONCAT: (...args) => flattenArgs(args).join(''),
    };

    const ranges = [];
    const withRanges = formula.replace(RANGE_RE, (_, start, end) => {
      const token = `__RANGE_TOKEN_${ranges.length}__`;
      ranges.push(`__range__("${start}","${end}")`);
      return token;
    });

    const expression = withRanges
      .replace(/<>/g, '!=')
      .replace(/&/g, '+')
      .replace(/\bTRUE\b/g, 'true')
      .replace(/\bFALSE\b/g, 'false')
      .replace(REF_RE, (match) => `__cell__("${match}")`)
      .replace(/__RANGE_TOKEN_(\d+)__/g, (_, index) => ranges[Number(index)]);

    const runner = new Function(
      '__cell__',
      '__range__',
      'SUM',
      'AVERAGE',
      'MIN',
      'MAX',
      'COUNT',
      'IF',
      'AND',
      'OR',
      'NOT',
      'ABS',
      'ROUND',
      'CONCAT',
      `return (${expression});`
    );

    const value = runner(
      (cellId) => evaluateCell(sheet, cellId, stack).value,
      (start, end) => expandRange(start, end).map((cellId) => evaluateCell(sheet, cellId, stack).value),
      helpers.SUM,
      helpers.AVERAGE,
      helpers.MIN,
      helpers.MAX,
      helpers.COUNT,
      helpers.IF,
      helpers.AND,
      helpers.OR,
      helpers.NOT,
      helpers.ABS,
      helpers.ROUND,
      helpers.CONCAT
    );

    return typeof value === 'number' && !Number.isFinite(value) ? '#DIV/0!' : value;
  }

  function evaluateCell(sheet, cellId, stack) {
    const id = normalizeCellId(cellId);
    const trail = stack || new Set();
    if (trail.has(id)) {
      return { raw: getCellRaw(sheet, id), value: '#CIRC!', display: '#CIRC!' };
    }

    const raw = getCellRaw(sheet, id);
    if (raw === '') {
      return { raw: '', value: 0, display: '' };
    }

    if (!raw.startsWith('=')) {
      const numeric = Number(raw);
      const value = raw.trim() !== '' && !Number.isNaN(numeric) ? numeric : raw;
      return { raw, value, display: formatValue(value) };
    }

    const nextTrail = new Set(trail);
    nextTrail.add(id);

    try {
      const value = evaluateFormula(sheet, raw.slice(1), nextTrail);
      if (value === '#CIRC!') {
        return { raw, value, display: '#CIRC!' };
      }
      return { raw, value, display: formatValue(value) };
    } catch (_error) {
      return { raw, value: '#ERR!', display: '#ERR!' };
    }
  }

  return {
    columnIndexToLabel,
    cellIdToPoint,
    pointToCellId,
    createSheet,
    setCellRaw,
    getCellRaw,
    evaluateCell,
  };
});
