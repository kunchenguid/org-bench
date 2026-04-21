(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const COL_COUNT = 26;
  const ROW_COUNT = 100;
  const ERR = '#ERR!';
  const DIV0 = '#DIV/0!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';

  function colToIndex(col) {
    let value = 0;
    for (let i = 0; i < col.length; i += 1) {
      value = value * 26 + (col.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToCol(index) {
    let current = index + 1;
    let result = '';
    while (current > 0) {
      const remainder = (current - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      current = Math.floor((current - 1) / 26);
    }
    return result;
  }

  function cellId(col, row) {
    return indexToCol(col) + String(row + 1);
  }

  function parseCellId(id) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(id);
    if (!match) {
      return null;
    }
    return {
      colAbs: Boolean(match[1]),
      col: colToIndex(match[2]),
      rowAbs: Boolean(match[3]),
      row: Number(match[4]) - 1,
      colLabel: match[2],
    };
  }

  function normalizeSelection(selection) {
    const startCol = Math.min(selection.anchorCol, selection.focusCol);
    const endCol = Math.max(selection.anchorCol, selection.focusCol);
    const startRow = Math.min(selection.anchorRow, selection.focusRow);
    const endRow = Math.max(selection.anchorRow, selection.focusRow);
    return { startCol, endCol, startRow, endRow };
  }

  function cloneCells(cells) {
    return Object.assign({}, cells);
  }

  function isNumericString(value) {
    return /^[-+]?\d+(?:\.\d+)?$/.test(value.trim());
  }

  function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return ERR;
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    }
    return String(value);
  }

  function tokenizer(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      const refErr = input.slice(i).match(/^#REF!/);
      if (refErr) {
        tokens.push({ type: 'referr', value: REF });
        i += 5;
        continue;
      }
      if (ch === '"') {
        let value = '';
        i += 1;
        while (i < input.length && input[i] !== '"') {
          value += input[i];
          i += 1;
        }
        if (input[i] !== '"') throw new Error('Unterminated string');
        i += 1;
        tokens.push({ type: 'string', value });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      if ('+-*/&=<>(),:'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i += 1;
        continue;
      }
      const refMatch = input.slice(i).match(/^\$?[A-Z]+\$?\d+/);
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0] });
        i += refMatch[0].length;
        continue;
      }
      const numMatch = input.slice(i).match(/^\d+(?:\.\d+)?/);
      if (numMatch) {
        tokens.push({ type: 'number', value: Number(numMatch[0]) });
        i += numMatch[0].length;
        continue;
      }
      const identMatch = input.slice(i).match(/^[A-Z_][A-Z0-9_]*/);
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0] });
        i += identMatch[0].length;
        continue;
      }
      throw new Error('Unexpected token');
    }
    return tokens;
  }

  function parseFormula(source) {
    const tokens = tokenizer(source);
    let index = 0;

    function peek(value, type) {
      const token = tokens[index];
      if (!token) return false;
      if (value !== undefined && token.value !== value) return false;
      if (type !== undefined && token.type !== type) return false;
      return true;
    }

    function consume(value, type) {
      if (!peek(value, type)) throw new Error('Unexpected token');
      const token = tokens[index];
      index += 1;
      return token;
    }

    function parsePrimary() {
      if (peek(undefined, 'number')) return { type: 'number', value: consume(undefined, 'number').value };
      if (peek(undefined, 'string')) return { type: 'string', value: consume(undefined, 'string').value };
      if (peek(undefined, 'referr')) return { type: 'error', value: REF };
      if (peek(undefined, 'ident')) {
        const ident = consume(undefined, 'ident').value;
        if (ident === 'TRUE' || ident === 'FALSE') {
          return { type: 'boolean', value: ident === 'TRUE' };
        }
        if (peek('(', 'op')) {
          consume('(', 'op');
          const args = [];
          if (!peek(')', 'op')) {
            while (true) {
              args.push(parseComparison());
              if (peek(')', 'op')) break;
              consume(',', 'op');
            }
          }
          consume(')', 'op');
          return { type: 'call', name: ident, args };
        }
        throw new Error('Unknown identifier');
      }
      if (peek(undefined, 'ref')) {
        const start = consume(undefined, 'ref').value;
        if (peek(':', 'op')) {
          consume(':', 'op');
          const end = consume(undefined, 'ref').value;
          return { type: 'range', start, end };
        }
        return { type: 'ref', value: start };
      }
      if (peek('(', 'op')) {
        consume('(', 'op');
        const expr = parseComparison();
        consume(')', 'op');
        return expr;
      }
      throw new Error('Expected value');
    }

    function parseUnary() {
      if (peek('-', 'op')) {
        consume('-', 'op');
        return { type: 'unary', op: '-', expr: parseUnary() };
      }
      return parsePrimary();
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (peek('*', 'op') || peek('/', 'op')) {
        const op = consume(undefined, 'op').value;
        node = { type: 'binary', op, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (peek('+', 'op') || peek('-', 'op')) {
        const op = consume(undefined, 'op').value;
        node = { type: 'binary', op, left: node, right: parseMultiplicative() };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAdditive();
      while (peek('&', 'op')) {
        consume('&', 'op');
        node = { type: 'binary', op: '&', left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek('=', 'op') || peek('<>', 'op') || peek('<', 'op') || peek('<=', 'op') || peek('>', 'op') || peek('>=', 'op')) {
        const op = consume(undefined, 'op').value;
        node = { type: 'binary', op, left: node, right: parseConcat() };
      }
      return node;
    }

    const result = parseComparison();
    if (index !== tokens.length) throw new Error('Trailing tokens');
    return result;
  }

  function flattenArgs(values) {
    const result = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        value.forEach(function (nested) {
          result.push(nested);
        });
      } else {
        result.push(value);
      }
    });
    return result;
  }

  function toNumber(value) {
    if (value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string' && isNumericString(value)) return Number(value);
    return Number.NaN;
  }

  function toText(value) {
    if (value === null || value === undefined) return '';
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    return String(value);
  }

  function toBoolean(value) {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      if (value.toUpperCase() === 'TRUE') return true;
      if (value.toUpperCase() === 'FALSE') return false;
      if (isNumericString(value)) return Number(value) !== 0;
      return value.length > 0;
    }
    return Boolean(value);
  }

  function compareValues(left, right, op) {
    const leftNum = toNumber(left);
    const rightNum = toNumber(right);
    const useNumbers = !Number.isNaN(leftNum) && !Number.isNaN(rightNum);
    const a = useNumbers ? leftNum : toText(left);
    const b = useNumbers ? rightNum : toText(right);
    switch (op) {
      case '=': return a === b;
      case '<>': return a !== b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default: throw new Error('Unknown comparison');
    }
  }

  function createFunctionTable() {
    return {
      SUM: function (args) {
        return flattenArgs(args).reduce(function (sum, value) {
          const num = toNumber(value);
          return sum + (Number.isNaN(num) ? 0 : num);
        }, 0);
      },
      AVERAGE: function (args) {
        const nums = flattenArgs(args).map(toNumber).filter(function (value) { return !Number.isNaN(value); });
        return nums.length ? nums.reduce(function (sum, value) { return sum + value; }, 0) / nums.length : 0;
      },
      MIN: function (args) {
        const nums = flattenArgs(args).map(toNumber).filter(function (value) { return !Number.isNaN(value); });
        return nums.length ? Math.min.apply(Math, nums) : 0;
      },
      MAX: function (args) {
        const nums = flattenArgs(args).map(toNumber).filter(function (value) { return !Number.isNaN(value); });
        return nums.length ? Math.max.apply(Math, nums) : 0;
      },
      COUNT: function (args) {
        return flattenArgs(args).filter(function (value) { return !Number.isNaN(toNumber(value)); }).length;
      },
      IF: function (args) {
        return toBoolean(args[0]) ? (args[1] === undefined ? '' : args[1]) : (args[2] === undefined ? '' : args[2]);
      },
      AND: function (args) {
        return flattenArgs(args).every(toBoolean);
      },
      OR: function (args) {
        return flattenArgs(args).some(toBoolean);
      },
      NOT: function (args) {
        return !toBoolean(args[0]);
      },
      ABS: function (args) {
        const num = toNumber(args[0]);
        return Number.isNaN(num) ? 0 : Math.abs(num);
      },
      ROUND: function (args) {
        const num = toNumber(args[0]);
        const places = Math.max(0, Math.floor(toNumber(args[1] === undefined ? 0 : args[1])));
        if (Number.isNaN(num)) return 0;
        const factor = Math.pow(10, places);
        return Math.round(num * factor) / factor;
      },
      CONCAT: function (args) {
        return flattenArgs(args).map(toText).join('');
      },
    };
  }

  function expandRange(startRef, endRef) {
    const start = parseCellId(startRef);
    const end = parseCellId(endRef);
    if (!start || !end) throw new Error(REF);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const ids = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        ids.push(cellId(col, row));
      }
    }
    return ids;
  }

  function evaluateSheet(cells) {
    const cache = {};
    const functions = createFunctionTable();

    function evaluateCell(id, stack) {
      if (cache[id]) return cache[id];
      const raw = Object.prototype.hasOwnProperty.call(cells, id) ? cells[id] : '';
      if (stack.indexOf(id) !== -1) {
        cache[id] = { value: CIRC, display: CIRC, raw };
        return cache[id];
      }
      if (!raw || raw[0] !== '=') {
        let value = raw;
        if (typeof raw === 'string' && raw.trim() !== '' && isNumericString(raw)) value = Number(raw);
        cache[id] = { value: raw === '' ? null : value, display: formatValue(raw === '' ? null : value), raw };
        return cache[id];
      }

      try {
        const ast = parseFormula(raw.slice(1));
        const value = evalNode(ast, stack.concat(id));
        cache[id] = { value, display: formatValue(value), raw };
      } catch (error) {
        const message = error && error.message ? error.message : '';
        const display = message === CIRC ? CIRC : message === DIV0 ? DIV0 : message === REF ? REF : ERR;
        cache[id] = { value: display, display, raw };
      }
      return cache[id];
    }

    function evalNode(node, stack) {
      switch (node.type) {
        case 'number': return node.value;
        case 'string': return node.value;
        case 'boolean': return node.value;
        case 'error': throw new Error(node.value);
        case 'ref': {
          const parsed = parseCellId(node.value);
          if (!parsed || parsed.col < 0 || parsed.col >= COL_COUNT || parsed.row < 0) throw new Error(REF);
          const result = evaluateCell(cellId(parsed.col, parsed.row), stack);
          if (result.display === CIRC) throw new Error(CIRC);
          if (result.display === REF) throw new Error(REF);
          if (result.display === DIV0) throw new Error(DIV0);
          if (result.display === ERR) throw new Error(ERR);
          return result.value;
        }
        case 'range': {
          return expandRange(node.start, node.end).map(function (id) {
            return evaluateCell(id, stack).value;
          });
        }
        case 'unary': {
          const value = toNumber(evalNode(node.expr, stack));
          if (Number.isNaN(value)) throw new Error(ERR);
          return -value;
        }
        case 'binary': {
          const left = evalNode(node.left, stack);
          const right = evalNode(node.right, stack);
          switch (node.op) {
            case '+': {
              const leftNum = toNumber(left);
              const rightNum = toNumber(right);
              if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) throw new Error(ERR);
              return leftNum + rightNum;
            }
            case '-': {
              const leftNum = toNumber(left);
              const rightNum = toNumber(right);
              if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) throw new Error(ERR);
              return leftNum - rightNum;
            }
            case '*': {
              const leftNum = toNumber(left);
              const rightNum = toNumber(right);
              if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) throw new Error(ERR);
              return leftNum * rightNum;
            }
            case '/': {
              const leftNum = toNumber(left);
              const rightNum = toNumber(right);
              if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) throw new Error(ERR);
              if (rightNum === 0) throw new Error(DIV0);
              return leftNum / rightNum;
            }
            case '&': return toText(left) + toText(right);
            default: return compareValues(left, right, node.op);
          }
        }
        case 'call': {
          const fn = functions[node.name];
          if (!fn) throw new Error(ERR);
          return fn(node.args.map(function (arg) { return evalNode(arg, stack); }));
        }
        default:
          throw new Error(ERR);
      }
    }

    const results = {};
    Object.keys(cells).forEach(function (id) {
      results[id] = evaluateCell(id, []);
    });
    return results;
  }

  function replaceRefsInFormula(formula, mapper) {
    let result = '';
    let i = 0;
    while (i < formula.length) {
      if (formula[i] === '"') {
        let end = i + 1;
        while (end < formula.length && formula[end] !== '"') end += 1;
        result += formula.slice(i, Math.min(end + 1, formula.length));
        i = end + 1;
        continue;
      }
      const match = formula.slice(i).match(/^\$?[A-Z]+\$?\d+/);
      if (match) {
        result += mapper(match[0]);
        i += match[0].length;
        continue;
      }
      result += formula[i];
      i += 1;
    }
    return result;
  }

  function formatRef(parsed) {
    if (parsed.refError) return REF;
    return (parsed.colAbs ? '$' : '') + indexToCol(parsed.col) + (parsed.rowAbs ? '$' : '') + String(parsed.row + 1);
  }

  function adjustFormulaForMove(formula, rowOffset, colOffset) {
    if (!formula || formula[0] !== '=') return formula;
    return replaceRefsInFormula(formula, function (ref) {
      const parsed = parseCellId(ref);
      if (!parsed) return ref;
      const next = {
        colAbs: parsed.colAbs,
        rowAbs: parsed.rowAbs,
        col: parsed.colAbs ? parsed.col : parsed.col + colOffset,
        row: parsed.rowAbs ? parsed.row : parsed.row + rowOffset,
      };
      if (next.col < 0 || next.row < 0) return REF;
      return formatRef(next);
    });
  }

  function transformFormulaRefs(formula, transform) {
    if (!formula || formula[0] !== '=') return formula;
    return replaceRefsInFormula(formula, function (ref) {
      const parsed = parseCellId(ref);
      if (!parsed) return ref;
      const next = transform(parsed);
      return formatRef(next || parsed);
    });
  }

  function applyRowInsertionToFormula(formula, rowIndex, count) {
    return transformFormulaRefs(formula, function (parsed) {
      if (parsed.row >= rowIndex) {
        return { colAbs: parsed.colAbs, col: parsed.col, rowAbs: parsed.rowAbs, row: parsed.row + count };
      }
      return parsed;
    });
  }

  function applyRowDeletionToFormula(formula, rowIndex, count) {
    return transformFormulaRefs(formula, function (parsed) {
      if (parsed.row >= rowIndex && parsed.row < rowIndex + count) {
        return { refError: true };
      }
      if (parsed.row >= rowIndex + count) {
        return { colAbs: parsed.colAbs, col: parsed.col, rowAbs: parsed.rowAbs, row: parsed.row - count };
      }
      return parsed;
    });
  }

  function applyColInsertionToFormula(formula, colIndex, count) {
    return transformFormulaRefs(formula, function (parsed) {
      if (parsed.col >= colIndex) {
        return { colAbs: parsed.colAbs, col: parsed.col + count, rowAbs: parsed.rowAbs, row: parsed.row };
      }
      return parsed;
    });
  }

  function applyColDeletionToFormula(formula, colIndex, count) {
    return transformFormulaRefs(formula, function (parsed) {
      if (parsed.col >= colIndex && parsed.col < colIndex + count) {
        return { refError: true };
      }
      if (parsed.col >= colIndex + count) {
        return { colAbs: parsed.colAbs, col: parsed.col - count, rowAbs: parsed.rowAbs, row: parsed.row };
      }
      return parsed;
    });
  }

  function makeEmptySelection() {
    return { anchorRow: 0, anchorCol: 0, focusRow: 0, focusCol: 0 };
  }

  function serializeRange(cells, selection) {
    const bounds = normalizeSelection(selection);
    const rows = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      const cols = [];
      for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
        cols.push(cells[cellId(col, row)] || '');
      }
      rows.push(cols.join('\t'));
    }
    return rows.join('\n');
  }

  function parseClipboard(text) {
    return text.replace(/\r/g, '').split('\n').map(function (line) { return line.split('\t'); });
  }

  function insertRow(cells, rowIndex, count) {
    const next = {};
    Object.keys(cells).forEach(function (id) {
      const parsed = parseCellId(id);
      const targetRow = parsed.row >= rowIndex ? parsed.row + count : parsed.row;
      next[cellId(parsed.col, targetRow)] = cells[id][0] === '=' ? applyRowInsertionToFormula(cells[id], rowIndex, count) : cells[id];
    });
    return next;
  }

  function deleteRow(cells, rowIndex, count) {
    const next = {};
    Object.keys(cells).forEach(function (id) {
      const parsed = parseCellId(id);
      if (parsed.row >= rowIndex && parsed.row < rowIndex + count) return;
      const targetRow = parsed.row >= rowIndex + count ? parsed.row - count : parsed.row;
      next[cellId(parsed.col, targetRow)] = cells[id][0] === '=' ? applyRowDeletionToFormula(cells[id], rowIndex, count) : cells[id];
    });
    return next;
  }

  function insertCol(cells, colIndex, count) {
    const next = {};
    Object.keys(cells).forEach(function (id) {
      const parsed = parseCellId(id);
      const targetCol = parsed.col >= colIndex ? parsed.col + count : parsed.col;
      next[cellId(targetCol, parsed.row)] = cells[id][0] === '=' ? applyColInsertionToFormula(cells[id], colIndex, count) : cells[id];
    });
    return next;
  }

  function deleteCol(cells, colIndex, count) {
    const next = {};
    Object.keys(cells).forEach(function (id) {
      const parsed = parseCellId(id);
      if (parsed.col >= colIndex && parsed.col < colIndex + count) return;
      const targetCol = parsed.col >= colIndex + count ? parsed.col - count : parsed.col;
      next[cellId(targetCol, parsed.row)] = cells[id][0] === '=' ? applyColDeletionToFormula(cells[id], colIndex, count) : cells[id];
    });
    return next;
  }

  return {
    COL_COUNT,
    ROW_COUNT,
    ERR,
    DIV0,
    CIRC,
    REF,
    cellId,
    colToIndex,
    indexToCol,
    parseCellId,
    normalizeSelection,
    cloneCells,
    evaluateSheet,
    adjustFormulaForMove,
    applyRowInsertionToFormula,
    applyRowDeletionToFormula,
    applyColInsertionToFormula,
    applyColDeletionToFormula,
    makeEmptySelection,
    serializeRange,
    parseClipboard,
    insertRow,
    deleteRow,
    insertCol,
    deleteCol,
  };
});
