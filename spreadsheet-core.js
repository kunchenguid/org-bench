(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const COLUMN_COUNT = 26;
  const ROW_COUNT = 100;
  const CIRCULAR = { kind: 'error', code: '#CIRC!' };

  function columnLabel(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function columnIndex(label) {
    let result = 0;
    for (let i = 0; i < label.length; i += 1) {
      result = result * 26 + (label.charCodeAt(i) - 64);
    }
    return result - 1;
  }

  function clampCellPosition(position) {
    return {
      col: Math.max(0, Math.min(COLUMN_COUNT - 1, position.col)),
      row: Math.max(0, Math.min(ROW_COUNT - 1, position.row)),
    };
  }

  function cellIdFromPosition(position) {
    return columnLabel(position.col) + String(position.row + 1);
  }

  function parseCellId(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(String(cellId || '').toUpperCase());
    if (!match) {
      return null;
    }
    return clampCellPosition({
      col: columnIndex(match[1]),
      row: Number(match[2]) - 1,
    });
  }

  function normalizeRaw(raw) {
    return raw == null ? '' : String(raw);
  }

  function asNumber(value) {
    if (!value) return 0;
    if (value.kind === 'number') return value.value;
    if (value.kind === 'boolean') return value.value ? 1 : 0;
    if (value.kind === 'text') {
      const parsed = Number(value.value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  function asText(value) {
    if (!value) return '';
    if (value.kind === 'text') return value.value;
    if (value.kind === 'number') return String(value.value);
    if (value.kind === 'boolean') return value.value ? 'TRUE' : 'FALSE';
    return value.code || '#ERR!';
  }

  function asBoolean(value) {
    if (!value) return false;
    if (value.kind === 'boolean') return value.value;
    if (value.kind === 'number') return value.value !== 0;
    if (value.kind === 'text') return value.value !== '';
    return false;
  }

  function makeNumber(value) {
    return { kind: 'number', value };
  }

  function makeText(value) {
    return { kind: 'text', value };
  }

  function makeBoolean(value) {
    return { kind: 'boolean', value: Boolean(value) };
  }

  function makeError(code) {
    return { kind: 'error', code };
  }

  function isError(value) {
    return value && value.kind === 'error';
  }

  function compareValues(left, right) {
    if (left.kind === 'text' || right.kind === 'text') {
      const a = asText(left);
      const b = asText(right);
      return a < b ? -1 : a > b ? 1 : 0;
    }
    const a = asNumber(left);
    const b = asNumber(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function tokenize(formula) {
    const tokens = [];
    let index = 0;
    while (index < formula.length) {
      const char = formula[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"') {
        let value = '';
        index += 1;
        while (index < formula.length && formula[index] !== '"') {
          value += formula[index];
          index += 1;
        }
        if (formula[index] !== '"') throw new Error('Unterminated string');
        index += 1;
        tokens.push({ type: 'string', value });
        continue;
      }
      const two = formula.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        tokens.push({ type: 'operator', value: two });
        index += 2;
        continue;
      }
      if ('+-*/&(),:=<>'.includes(char)) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? char : 'operator', value: char });
        index += 1;
        continue;
      }
      const numberMatch = /^(\d+(?:\.\d+)?)/.exec(formula.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[1]) });
        index += numberMatch[1].length;
        continue;
      }
      const identMatch = /^\$?[A-Z]+\$?\d+|^[A-Z_]+/.exec(formula.slice(index).toUpperCase());
      if (identMatch) {
        tokens.push({ type: 'identifier', value: identMatch[0].toUpperCase() });
        index += identMatch[0].length;
        continue;
      }
      throw new Error('Unexpected token');
    }
    return tokens;
  }

  function parseFormula(formula) {
    const tokens = tokenize(formula);
    let index = 0;

    function peek(offset) {
      return tokens[index + (offset || 0)];
    }

    function consume(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw new Error('Unexpected token');
      }
      index += 1;
      return token;
    }

    function parsePrimary() {
      const token = peek();
      if (!token) throw new Error('Unexpected end');
      if (token.type === 'number') {
        consume('number');
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        consume('string');
        return { type: 'string', value: token.value };
      }
      if (token.type === 'identifier') {
        consume('identifier');
        if (peek() && peek().type === '(') {
          consume('(');
          const args = [];
          if (!peek() || peek().type !== ')') {
            while (true) {
              args.push(parseExpression());
              if (peek() && peek().type === ',') {
                consume(',');
                continue;
              }
              break;
            }
          }
          consume(')');
          return { type: 'call', name: token.value, args };
        }
        if (/^\$?[A-Z]+\$?\d+$/.test(token.value)) {
          const start = token.value;
          if (peek() && peek().type === ':') {
            consume(':');
            const end = consume('identifier').value;
            return { type: 'range', start, end };
          }
          return { type: 'ref', ref: start };
        }
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'boolean', value: token.value === 'TRUE' };
        }
        throw new Error('Unknown identifier');
      }
      if (token.type === '(') {
        consume('(');
        const expression = parseExpression();
        consume(')');
        return expression;
      }
      if (token.type === 'operator' && token.value === '-') {
        consume('operator', '-');
        return { type: 'unary', operator: '-', value: parsePrimary() };
      }
      throw new Error('Unexpected token');
    }

    function parseProduct() {
      let expression = parsePrimary();
      while (peek() && peek().type === 'operator' && (peek().value === '*' || peek().value === '/')) {
        const operator = consume('operator').value;
        expression = { type: 'binary', operator, left: expression, right: parsePrimary() };
      }
      return expression;
    }

    function parseSum() {
      let expression = parseProduct();
      while (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
        const operator = consume('operator').value;
        expression = { type: 'binary', operator, left: expression, right: parseProduct() };
      }
      return expression;
    }

    function parseConcat() {
      let expression = parseSum();
      while (peek() && peek().type === 'operator' && peek().value === '&') {
        consume('operator', '&');
        expression = { type: 'binary', operator: '&', left: expression, right: parseSum() };
      }
      return expression;
    }

    function parseComparison() {
      let expression = parseConcat();
      while (peek() && peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = consume('operator').value;
        expression = { type: 'binary', operator, left: expression, right: parseConcat() };
      }
      return expression;
    }

    function parseExpression() {
      return parseComparison();
    }

    const ast = parseExpression();
    if (index !== tokens.length) throw new Error('Unexpected trailing tokens');
    return ast;
  }

  function expandRange(startRef, endRef) {
    const start = parseMixedRef(startRef);
    const end = parseMixedRef(endRef);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const result = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        result.push(cellIdFromPosition({ col, row }));
      }
    }
    return result;
  }

  function flattenArgs(values) {
    const result = [];
    values.forEach((value) => {
      if (Array.isArray(value)) {
        result.push.apply(result, flattenArgs(value));
      } else {
        result.push(value);
      }
    });
    return result;
  }

  function applyFunction(name, args) {
    const values = flattenArgs(args);
    const firstError = values.find(isError);
    if (firstError) return firstError;
    switch (name) {
      case 'SUM':
        return makeNumber(values.reduce((sum, value) => sum + asNumber(value), 0));
      case 'AVERAGE':
        return makeNumber(values.length ? values.reduce((sum, value) => sum + asNumber(value), 0) / values.length : 0);
      case 'MIN':
        return makeNumber(values.length ? Math.min.apply(null, values.map(asNumber)) : 0);
      case 'MAX':
        return makeNumber(values.length ? Math.max.apply(null, values.map(asNumber)) : 0);
      case 'COUNT':
        return makeNumber(values.filter((value) => asText(value) !== '').length);
      case 'IF':
        return asBoolean(args[0]) ? args[1] : args[2];
      case 'AND':
        return makeBoolean(values.every(asBoolean));
      case 'OR':
        return makeBoolean(values.some(asBoolean));
      case 'NOT':
        return makeBoolean(!asBoolean(args[0]));
      case 'ABS':
        return makeNumber(Math.abs(asNumber(args[0])));
      case 'ROUND':
        return makeNumber(Number(asNumber(args[0]).toFixed(args[1] ? asNumber(args[1]) : 0)));
      case 'CONCAT':
        return makeText(values.map(asText).join(''));
      default:
        return makeError('#ERR!');
    }
  }

  function parseMixedRef(ref) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref.toUpperCase());
    if (!match) throw new Error('Bad reference');
    return {
      colAbsolute: Boolean(match[1]),
      col: columnIndex(match[2]),
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function stringifyMixedRef(ref) {
    return (ref.colAbsolute ? '$' : '') + columnLabel(ref.col) + (ref.rowAbsolute ? '$' : '') + String(ref.row + 1);
  }

  function shiftReference(ref, rowOffset, colOffset) {
    const parsed = parseMixedRef(ref);
    if (!parsed.colAbsolute) parsed.col += colOffset;
    if (!parsed.rowAbsolute) parsed.row += rowOffset;
    parsed.col = Math.max(0, parsed.col);
    parsed.row = Math.max(0, parsed.row);
    return stringifyMixedRef(parsed);
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    return String(formula).replace(/\$?[A-Z]+\$?\d+/g, function (match) {
      return shiftReference(match, rowOffset, colOffset);
    });
  }

  function copyRange(cells, bounds) {
    const rows = [];
    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      const values = [];
      for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
        values.push(normalizeRaw(cells[cellIdFromPosition({ row, col })]));
      }
      rows.push(values.join('\t'));
    }
    return rows.join('\n');
  }

  function parseClipboardMatrix(text) {
    return String(text || '')
      .split(/\r?\n/)
      .filter(function (row) {
        return row !== '';
      })
      .map(function (row) {
        return row.split('\t');
      });
  }

  function pasteRange(cells, target, text, sourceBounds, clearSource) {
    const next = Object.assign({}, cells);
    const rows = parseClipboardMatrix(text);
    if (!rows.length) return next;

    if (clearSource && sourceBounds) {
      for (let row = sourceBounds.minRow; row <= sourceBounds.maxRow; row += 1) {
        for (let col = sourceBounds.minCol; col <= sourceBounds.maxCol; col += 1) {
          delete next[cellIdFromPosition({ row, col })];
        }
      }
    }

    const sourceOrigin = sourceBounds
      ? { row: sourceBounds.minRow, col: sourceBounds.minCol }
      : { row: 0, col: 0 };

    rows.forEach(function (values, rowIndex) {
      values.forEach(function (raw, colIndex) {
        const destination = {
          row: target.row + rowIndex,
          col: target.col + colIndex,
        };
        const destinationId = cellIdFromPosition(destination);
        const rowOffset = destination.row - (sourceOrigin.row + rowIndex);
        const colOffset = destination.col - (sourceOrigin.col + colIndex);
        const shifted = raw && raw[0] === '=' ? shiftFormula(raw, rowOffset, colOffset) : raw;
        if (shifted) {
          next[destinationId] = shifted;
        } else {
          delete next[destinationId];
        }
      });
    });

    return next;
  }

  function evaluateAst(node, context) {
    if (!node) return makeError('#ERR!');
    if (node.type === 'number') return makeNumber(node.value);
    if (node.type === 'string') return makeText(node.value);
    if (node.type === 'boolean') return makeBoolean(node.value);
    if (node.type === 'unary') {
      const value = evaluateAst(node.value, context);
      if (isError(value)) return value;
      return makeNumber(-asNumber(value));
    }
    if (node.type === 'ref') {
      return context.getCell(node.ref);
    }
    if (node.type === 'range') {
      return expandRange(node.start, node.end).map(context.getCell);
    }
    if (node.type === 'call') {
      const args = node.args.map(function (arg) {
        return evaluateAst(arg, context);
      });
      return applyFunction(node.name, args);
    }
    if (node.type === 'binary') {
      const left = evaluateAst(node.left, context);
      if (isError(left)) return left;
      const right = evaluateAst(node.right, context);
      if (isError(right)) return right;
      switch (node.operator) {
        case '+':
          return makeNumber(asNumber(left) + asNumber(right));
        case '-':
          return makeNumber(asNumber(left) - asNumber(right));
        case '*':
          return makeNumber(asNumber(left) * asNumber(right));
        case '/':
          return asNumber(right) === 0 ? makeError('#DIV/0!') : makeNumber(asNumber(left) / asNumber(right));
        case '&':
          return makeText(asText(left) + asText(right));
        case '=':
          return makeBoolean(compareValues(left, right) === 0);
        case '<>':
          return makeBoolean(compareValues(left, right) !== 0);
        case '<':
          return makeBoolean(compareValues(left, right) < 0);
        case '<=':
          return makeBoolean(compareValues(left, right) <= 0);
        case '>':
          return makeBoolean(compareValues(left, right) > 0);
        case '>=':
          return makeBoolean(compareValues(left, right) >= 0);
        default:
          return makeError('#ERR!');
      }
    }
    return makeError('#ERR!');
  }

  function evaluateSpreadsheet(rawCells) {
    const cells = rawCells || {};
    const cache = {};
    const inProgress = {};

    function evaluateCell(cellId) {
      const normalizedId = String(cellId || '').toUpperCase();
      if (cache[normalizedId]) return cache[normalizedId];
      if (inProgress[normalizedId]) return CIRCULAR;
      inProgress[normalizedId] = true;

      const raw = normalizeRaw(cells[normalizedId]);
      let value;
      if (!raw) {
        value = makeText('');
      } else if (raw[0] === '=') {
        try {
          const ast = parseFormula(raw.slice(1));
          value = evaluateAst(ast, { getCell: evaluateCell });
        } catch (error) {
          value = makeError('#ERR!');
        }
      } else {
        const parsed = Number(raw);
        value = raw.trim() !== '' && !Number.isNaN(parsed) ? makeNumber(parsed) : makeText(raw);
      }

      delete inProgress[normalizedId];
      cache[normalizedId] = value;
      return value;
    }

    const result = {};
    Object.keys(cells).forEach(function (cellId) {
      const normalizedId = cellId.toUpperCase();
      const value = evaluateCell(normalizedId);
      result[normalizedId] = {
        raw: normalizeRaw(cells[normalizedId]),
        value,
        display: isError(value) ? value.code : asText(value),
      };
    });
    return result;
  }

  return {
    COLUMN_COUNT,
    ROW_COUNT,
    columnLabel,
    columnIndex,
    cellIdFromPosition,
    parseCellId,
    clampCellPosition,
    copyRange,
    evaluateSpreadsheet,
    pasteRange,
    shiftFormula,
  };
});
