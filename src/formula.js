(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.FormulaEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const ERROR = '#ERR!';
  const DIV_ZERO = '#DIV/0!';
  const CIRC = '#CIRC!';

  function evaluateSheet(sheet) {
    const entries = {};
    const memo = new Map();
    const visiting = new Set();
    const cellIds = new Set(Object.keys(sheet || {}));

    for (const cellId of cellIds) {
      entries[cellId] = evaluateFormulaCell(cellId, sheet || {}, memo, visiting);
    }

    return new Proxy(entries, {
      get(target, prop) {
        if (typeof prop !== 'string') {
          return target[prop];
        }

        if (!(prop in target)) {
          target[prop] = evaluateFormulaCell(prop, sheet || {}, memo, visiting);
        }

        return target[prop];
      },
    });
  }

  function evaluateCell(cellId, sheet) {
    return evaluateFormulaCell(cellId, sheet || {}, new Map(), new Set());
  }

  function evaluateFormulaCell(cellId, sheet, memo, visiting) {
    if (memo.has(cellId)) {
      return memo.get(cellId);
    }

    if (visiting.has(cellId)) {
      return cellResult(CIRC, 'error', CIRC);
    }

    visiting.add(cellId);
    const raw = Object.prototype.hasOwnProperty.call(sheet, cellId) ? sheet[cellId] : '';
    let result;

    try {
      result = evaluateRawValue(raw, {
        evaluateReference(reference) {
          const evaluated = evaluateFormulaCell(reference, sheet, memo, visiting);
          if (evaluated.error) {
            throw spreadsheetError(evaluated.display);
          }
          if (evaluated.kind === 'blank') {
            return 0;
          }
          if (evaluated.kind === 'number') {
            return evaluated.value;
          }
          const parsed = Number(evaluated.value);
          return Number.isFinite(parsed) ? parsed : 0;
        },
        evaluateRange(start, end) {
          return expandRange(start, end).map(function (reference) {
            return this.evaluateReference(reference);
          }, this);
        },
      });
    } catch (error) {
      if (error && error.isSpreadsheetError) {
        result = cellResult(error.code, 'error', error.code);
      } else {
        result = cellResult(ERROR, 'error', ERROR);
      }
    }

    visiting.delete(cellId);
    memo.set(cellId, result);
    return result;
  }

  function evaluateRawValue(raw, context) {
    const normalized = raw == null ? '' : String(raw);
    if (!normalized) {
      return cellResult('', 'blank', '');
    }

    if (normalized.charAt(0) !== '=') {
      const trimmed = normalized.trim();
      if (trimmed && !Number.isNaN(Number(trimmed))) {
        return cellResult(formatNumber(Number(trimmed)), 'number', Number(trimmed));
      }
      return cellResult(normalized, 'text', normalized);
    }

    const ast = parseFormula(normalized.slice(1));
    const value = evaluateExpression(ast, context);

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw spreadsheetError(DIV_ZERO);
      }
      return cellResult(formatNumber(value), 'number', value);
    }

    if (typeof value === 'boolean') {
      return cellResult(value ? 'TRUE' : 'FALSE', 'boolean', value);
    }

    if (value == null) {
      return cellResult('', 'blank', '');
    }

    return cellResult(String(value), 'text', String(value));
  }

  function cellResult(display, kind, value) {
    return {
      display: display,
      kind: kind,
      value: value,
      error: kind === 'error',
    };
  }

  function spreadsheetError(code) {
    const error = new Error(code);
    error.code = code;
    error.isSpreadsheetError = true;
    return error;
  }

  function parseFormula(input) {
    const tokens = tokenize(input);
    let index = 0;

    function current() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = current();
      if (!token || token.type !== type || (value && token.value !== value)) {
        throw spreadsheetError(ERROR);
      }
      index += 1;
      return token;
    }

    function match(type, values) {
      const token = current();
      if (!token || token.type !== type) {
        return null;
      }
      if (values && values.indexOf(token.value) === -1) {
        return null;
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseAdditive();
      let operator = match('operator', ['>', '<', '>=', '<=', '==', '=', '!=', '<>']);

      while (operator) {
        node = {
          type: 'binary',
          operator: operator.value,
          left: node,
          right: parseAdditive(),
        };
        operator = match('operator', ['>', '<', '>=', '<=', '==', '=', '!=', '<>']);
      }

      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      let operator = match('operator', ['+', '-']);

      while (operator) {
        node = {
          type: 'binary',
          operator: operator.value,
          left: node,
          right: parseMultiplicative(),
        };
        operator = match('operator', ['+', '-']);
      }

      return node;
    }

    function parseMultiplicative() {
      let node = parseUnary();
      let operator = match('operator', ['*', '/']);

      while (operator) {
        node = {
          type: 'binary',
          operator: operator.value,
          left: node,
          right: parseUnary(),
        };
        operator = match('operator', ['*', '/']);
      }

      return node;
    }

    function parseUnary() {
      const operator = match('operator', ['-']);
      if (operator) {
        return {
          type: 'unary',
          operator: operator.value,
          argument: parseUnary(),
        };
      }

      return parsePrimary();
    }

    function parsePrimary() {
      const token = current();

      if (!token) {
        throw spreadsheetError(ERROR);
      }

      if (match('paren', ['('])) {
        const expression = parseExpression();
        consume('paren', ')');
        return expression;
      }

      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: Number(token.value) };
      }

      if (token.type === 'cell') {
        index += 1;
        const cellRef = token.value;
        if (match('colon')) {
          const end = consume('cell').value;
          return { type: 'range', start: cellRef, end: end };
        }
        return { type: 'cell', value: cellRef };
      }

      if (token.type === 'identifier') {
        index += 1;
        const name = token.value;
        if (!match('paren', ['('])) {
          throw spreadsheetError(ERROR);
        }
        const args = [];
        if (!match('paren', [')'])) {
          do {
            args.push(parseExpression());
          } while (match('comma'));
          consume('paren', ')');
        }
        return { type: 'call', name: name, args: args };
      }

      throw spreadsheetError(ERROR);
    }

    const ast = parseExpression();
    if (index !== tokens.length) {
      throw spreadsheetError(ERROR);
    }
    return ast;
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
      const char = input.charAt(index);

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      const remaining = input.slice(index);
      const cellMatch = remaining.match(/^[A-Z]+[1-9][0-9]*/);
      if (cellMatch) {
        tokens.push({ type: 'cell', value: cellMatch[0] });
        index += cellMatch[0].length;
        continue;
      }

      const identifierMatch = remaining.match(/^[A-Z_]+/);
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0] });
        index += identifierMatch[0].length;
        continue;
      }

      const numberMatch = remaining.match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: numberMatch[0] });
        index += numberMatch[0].length;
        continue;
      }

      const twoCharOperator = remaining.slice(0, 2);
      if (['>=', '<=', '==', '!=', '<>'].indexOf(twoCharOperator) !== -1) {
        tokens.push({ type: 'operator', value: twoCharOperator });
        index += 2;
        continue;
      }

      if ('+-*/><='.indexOf(char) !== -1) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      if (char === '(' || char === ')') {
        tokens.push({ type: 'paren', value: char });
        index += 1;
        continue;
      }

      if (char === ',') {
        tokens.push({ type: 'comma', value: char });
        index += 1;
        continue;
      }

      if (char === ':') {
        tokens.push({ type: 'colon', value: char });
        index += 1;
        continue;
      }

      throw spreadsheetError(ERROR);
    }

    return tokens;
  }

  function evaluateExpression(node, context) {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'cell':
        return context.evaluateReference(node.value);
      case 'range':
        return context.evaluateRange(node.start, node.end);
      case 'unary':
        return -toNumber(evaluateExpression(node.argument, context));
      case 'binary':
        return evaluateBinary(node, context);
      case 'call':
        return evaluateCall(node, context);
      default:
        throw spreadsheetError(ERROR);
    }
  }

  function evaluateBinary(node, context) {
    const left = evaluateExpression(node.left, context);
    const right = evaluateExpression(node.right, context);

    switch (node.operator) {
      case '+':
        return toNumber(left) + toNumber(right);
      case '-':
        return toNumber(left) - toNumber(right);
      case '*':
        return toNumber(left) * toNumber(right);
      case '/':
        if (toNumber(right) === 0) {
          throw spreadsheetError(DIV_ZERO);
        }
        return toNumber(left) / toNumber(right);
      case '>':
        return toNumber(left) > toNumber(right) ? 1 : 0;
      case '<':
        return toNumber(left) < toNumber(right) ? 1 : 0;
      case '>=':
        return toNumber(left) >= toNumber(right) ? 1 : 0;
      case '<=':
        return toNumber(left) <= toNumber(right) ? 1 : 0;
      case '=':
      case '==':
        return toNumber(left) === toNumber(right) ? 1 : 0;
      case '!=':
      case '<>':
        return toNumber(left) !== toNumber(right) ? 1 : 0;
      default:
        throw spreadsheetError(ERROR);
    }
  }

  function evaluateCall(node, context) {
    const name = node.name.toUpperCase();
    const args = node.args.map(function (argument) {
      return evaluateExpression(argument, context);
    });

    switch (name) {
      case 'SUM':
        return flattenNumbers(args).reduce(function (sum, value) { return sum + value; }, 0);
      case 'AVERAGE': {
        const values = flattenNumbers(args);
        return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : 0;
      }
      case 'MIN': {
        const values = flattenNumbers(args);
        return values.length ? Math.min.apply(Math, values) : 0;
      }
      case 'MAX': {
        const values = flattenNumbers(args);
        return values.length ? Math.max.apply(Math, values) : 0;
      }
      case 'COUNT':
        return flattenNumbers(args).length;
      case 'IF':
        if (args.length !== 3) {
          throw spreadsheetError(ERROR);
        }
        return toNumber(args[0]) !== 0 ? args[1] : args[2];
      default:
        throw spreadsheetError(ERROR);
    }
  }

  function flattenNumbers(values) {
    return values.flat ? values.flat(Infinity).map(toNumber) : flattenArray(values).map(toNumber);
  }

  function flattenArray(values) {
    const result = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        result.push.apply(result, flattenArray(value));
      } else {
        result.push(value);
      }
    });
    return result;
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return value.length ? toNumber(value[0]) : 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value == null || value === '') {
      return 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function expandRange(start, end) {
    const startRef = splitCellReference(start);
    const endRef = splitCellReference(end);
    const cells = [];
    const colStart = Math.min(startRef.col, endRef.col);
    const colEnd = Math.max(startRef.col, endRef.col);
    const rowStart = Math.min(startRef.row, endRef.row);
    const rowEnd = Math.max(startRef.row, endRef.row);

    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        cells.push(columnIndexToName(col) + String(row));
      }
    }

    return cells;
  }

  function splitCellReference(reference) {
    const match = String(reference).match(/^([A-Z]+)([1-9][0-9]*)$/);
    if (!match) {
      throw spreadsheetError(ERROR);
    }
    return {
      col: columnNameToIndex(match[1]),
      row: Number(match[2]),
    };
  }

  function columnNameToIndex(name) {
    let value = 0;
    for (let i = 0; i < name.length; i += 1) {
      value = value * 26 + (name.charCodeAt(i) - 64);
    }
    return value;
  }

  function columnIndexToName(index) {
    let current = index;
    let name = '';
    while (current > 0) {
      const remainder = (current - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      current = Math.floor((current - 1) / 26);
    }
    return name;
  }

  function formatNumber(value) {
    if (Object.is(value, -0)) {
      return '0';
    }
    const rounded = Math.round(value * 1000000000) / 1000000000;
    return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  return {
    evaluateCell: evaluateCell,
    evaluateSheet: evaluateSheet,
    expandRange: expandRange,
    columnIndexToName: columnIndexToName,
  };
});
