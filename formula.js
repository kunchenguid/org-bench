(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetFormula = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const ERR = {
    GENERIC: '#ERR!',
    CIRC: '#CIRC!',
    DIV0: '#DIV/0!',
    NAME: '#NAME?',
    REF: '#REF!',
  };

  const BINARY_PRECEDENCE = {
    '=': 1,
    '<>': 1,
    '<': 1,
    '<=': 1,
    '>': 1,
    '>=': 1,
    '&': 2,
    '+': 3,
    '-': 3,
    '*': 4,
    '/': 4,
  };

  const FUNCTION_NAMES = new Set([
    'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'IF', 'AND', 'OR', 'NOT', 'ABS', 'ROUND', 'CONCAT'
  ]);

  function createFormulaEngine(rawCells) {
    const rawMap = rawCells || {};
    const astCache = new Map();
    const valueCache = new Map();

    function getRaw(cellId) {
      return Object.prototype.hasOwnProperty.call(rawMap, cellId) ? rawMap[cellId] : '';
    }

    function getCellRecord(cellId, stack) {
      if (valueCache.has(cellId)) {
        return valueCache.get(cellId);
      }

      if (stack.has(cellId)) {
        return { type: 'error', value: ERR.CIRC };
      }

      const nextStack = new Set(stack);
      nextStack.add(cellId);
      const result = evaluateRaw(getRaw(cellId), nextStack, cellId);
      valueCache.set(cellId, result);
      return result;
    }

    function evaluateRaw(raw, stack, cellId) {
      if (raw == null || raw === '') {
        return { type: 'blank', value: '' };
      }

      if (typeof raw !== 'string') {
        raw = String(raw);
      }

      if (raw[0] !== '=') {
        const trimmed = raw.trim();
        if (trimmed === '') {
          return { type: 'blank', value: '' };
        }
        if (/^[+-]?(?:\d+\.?\d*|\d*\.\d+)$/.test(trimmed)) {
          return { type: 'number', value: Number(trimmed) };
        }
        if (trimmed.toUpperCase() === 'TRUE' || trimmed.toUpperCase() === 'FALSE') {
          return { type: 'boolean', value: trimmed.toUpperCase() === 'TRUE' };
        }
        return { type: 'text', value: raw };
      }

      try {
        let ast = astCache.get(cellId);
        if (!ast || ast.raw !== raw) {
          ast = { raw: raw, tree: parseFormula(raw.slice(1)) };
          astCache.set(cellId, ast);
        }
        return evaluateNode(ast.tree, stack);
      } catch (error) {
        if (error && error.isFormulaError) {
          return { type: 'error', value: error.code };
        }
        return { type: 'error', value: ERR.GENERIC };
      }
    }

    function evaluateNode(node, stack) {
      switch (node.type) {
        case 'number':
          return { type: 'number', value: node.value };
        case 'string':
          return { type: 'text', value: node.value };
        case 'boolean':
          return { type: 'boolean', value: node.value };
        case 'unary': {
          const value = evaluateNode(node.argument, stack);
          if (value.type === 'error') return value;
          if (node.operator === '-') {
            return { type: 'number', value: -toNumber(value) };
          }
          throw formulaError(ERR.GENERIC);
        }
        case 'binary': {
          const left = evaluateNode(node.left, stack);
          if (left.type === 'error') return left;
          const right = evaluateNode(node.right, stack);
          if (right.type === 'error') return right;
          return evaluateBinary(node.operator, left, right);
        }
        case 'cell':
          return getCellRecord(node.ref.id, stack);
        case 'range':
          return { type: 'range', value: expandRange(node.start.id, node.end.id).map(function (id) { return getCellRecord(id, stack); }) };
        case 'call':
          return evaluateCall(node, stack);
        default:
          throw formulaError(ERR.GENERIC);
      }
    }

    function evaluateBinary(operator, left, right) {
      if (operator === '&') {
        return { type: 'text', value: toText(left) + toText(right) };
      }

      if (operator === '+' || operator === '-' || operator === '*' || operator === '/') {
        const leftNumber = toNumber(left);
        const rightNumber = toNumber(right);
        if (operator === '+') return { type: 'number', value: leftNumber + rightNumber };
        if (operator === '-') return { type: 'number', value: leftNumber - rightNumber };
        if (operator === '*') return { type: 'number', value: leftNumber * rightNumber };
        if (rightNumber === 0) throw formulaError(ERR.DIV0);
        return { type: 'number', value: leftNumber / rightNumber };
      }

      const comparison = compareValues(left, right);
      if (operator === '=') return { type: 'boolean', value: comparison === 0 };
      if (operator === '<>') return { type: 'boolean', value: comparison !== 0 };
      if (operator === '<') return { type: 'boolean', value: comparison < 0 };
      if (operator === '<=') return { type: 'boolean', value: comparison <= 0 };
      if (operator === '>') return { type: 'boolean', value: comparison > 0 };
      if (operator === '>=') return { type: 'boolean', value: comparison >= 0 };

      throw formulaError(ERR.GENERIC);
    }

    function evaluateCall(node, stack) {
      const name = node.name.toUpperCase();
      if (!FUNCTION_NAMES.has(name)) {
        throw formulaError(ERR.NAME);
      }

      const args = node.args.map(function (arg) {
        return evaluateNode(arg, stack);
      });

      for (let index = 0; index < args.length; index += 1) {
        if (args[index].type === 'error') {
          return args[index];
        }
      }

      const flat = flattenArgs(args);

      switch (name) {
        case 'SUM':
          return { type: 'number', value: flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0) };
        case 'AVERAGE':
          return { type: 'number', value: flat.length ? flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / flat.length : 0 };
        case 'MIN':
          return { type: 'number', value: flat.length ? Math.min.apply(null, flat.map(toNumber)) : 0 };
        case 'MAX':
          return { type: 'number', value: flat.length ? Math.max.apply(null, flat.map(toNumber)) : 0 };
        case 'COUNT':
          return { type: 'number', value: flat.filter(function (value) { return value.type !== 'blank'; }).length };
        case 'IF':
          return args.length < 2 ? { type: 'blank', value: '' } : (toBoolean(args[0]) ? args[1] : (args[2] || { type: 'blank', value: '' }));
        case 'AND':
          return { type: 'boolean', value: flat.every(toBoolean) };
        case 'OR':
          return { type: 'boolean', value: flat.some(toBoolean) };
        case 'NOT':
          return { type: 'boolean', value: !toBoolean(args[0] || { type: 'blank', value: '' }) };
        case 'ABS':
          return { type: 'number', value: Math.abs(toNumber(args[0] || { type: 'blank', value: '' })) };
        case 'ROUND': {
          const number = toNumber(args[0] || { type: 'blank', value: '' });
          const digits = Math.max(0, Math.floor(toNumber(args[1] || { type: 'number', value: 0 })));
          const factor = Math.pow(10, digits);
          return { type: 'number', value: Math.round(number * factor) / factor };
        }
        case 'CONCAT':
          return { type: 'text', value: flat.map(toText).join('') };
        default:
          throw formulaError(ERR.NAME);
      }
    }

    function flattenArgs(args) {
      const result = [];
      args.forEach(function (arg) {
        if (arg.type === 'range') {
          arg.value.forEach(function (item) { result.push(item); });
        } else {
          result.push(arg);
        }
      });
      return result;
    }

    function toNumber(value) {
      if (value.type === 'blank') return 0;
      if (value.type === 'number') return value.value;
      if (value.type === 'boolean') return value.value ? 1 : 0;
      if (value.type === 'text') {
        const trimmed = String(value.value).trim();
        return trimmed === '' ? 0 : Number(trimmed) || 0;
      }
      if (value.type === 'range') {
        return value.value.length ? toNumber(value.value[0]) : 0;
      }
      throw formulaError(ERR.GENERIC);
    }

    function toText(value) {
      if (value.type === 'blank') return '';
      if (value.type === 'text') return String(value.value);
      if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
      if (value.type === 'number') return formatNumber(value.value);
      if (value.type === 'range') return value.value.map(toText).join(',');
      throw formulaError(ERR.GENERIC);
    }

    function toBoolean(value) {
      if (value.type === 'blank') return false;
      if (value.type === 'boolean') return value.value;
      if (value.type === 'number') return value.value !== 0;
      if (value.type === 'text') return String(value.value).trim() !== '';
      if (value.type === 'range') return value.value.some(toBoolean);
      throw formulaError(ERR.GENERIC);
    }

    function compareValues(left, right) {
      if (left.type === 'text' || right.type === 'text') {
        const a = toText(left);
        const b = toText(right);
        if (a === b) return 0;
        return a < b ? -1 : 1;
      }
      const a = toNumber(left);
      const b = toNumber(right);
      if (a === b) return 0;
      return a < b ? -1 : 1;
    }

    function getDisplayValue(cellId) {
      const value = getCellRecord(cellId, new Set());
      if (value.type === 'error') return value.value;
      if (value.type === 'number') return formatNumber(value.value);
      if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
      if (value.type === 'blank') return '';
      return String(value.value);
    }

    function getComputedCell(cellId) {
      return getCellRecord(cellId, new Set());
    }

    return {
      getDisplayValue: getDisplayValue,
      getComputedCell: getComputedCell,
      getRaw: getRaw,
    };
  }

  function parseFormula(input) {
    const tokens = tokenize(input);
    let index = 0;

    function current() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = current();
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw formulaError(ERR.GENERIC);
      }
      index += 1;
      return token;
    }

    function parseExpression(minPrecedence) {
      let left = parseUnary();
      while (true) {
        const token = current();
        if (!token || token.type !== 'operator') break;
        const precedence = BINARY_PRECEDENCE[token.value];
        if (precedence == null || precedence < minPrecedence) break;
        index += 1;
        const right = parseExpression(precedence + 1);
        left = { type: 'binary', operator: token.value, left: left, right: right };
      }
      return left;
    }

    function parseUnary() {
      const token = current();
      if (token && token.type === 'operator' && token.value === '-') {
        index += 1;
        return { type: 'unary', operator: '-', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = current();
      if (!token) {
        throw formulaError(ERR.GENERIC);
      }

      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        index += 1;
        return { type: 'string', value: token.value };
      }
      if (token.type === 'boolean') {
        index += 1;
        return { type: 'boolean', value: token.value };
      }
      if (token.type === 'paren' && token.value === '(') {
        index += 1;
        const expression = parseExpression(1);
        consume('paren', ')');
        return expression;
      }
      if (token.type === 'identifier') {
        const name = token.value;
        index += 1;
        if (current() && current().type === 'paren' && current().value === '(') {
          index += 1;
          const args = [];
          if (!current() || current().type !== 'paren' || current().value !== ')') {
            while (true) {
              args.push(parseExpression(1));
              if (current() && current().type === 'comma') {
                index += 1;
                continue;
              }
              break;
            }
          }
          consume('paren', ')');
          return { type: 'call', name: name, args: args };
        }
        if (isCellReference(name)) {
          const ref = parseCellReference(name);
          if (current() && current().type === 'colon') {
            index += 1;
            const endToken = consume('identifier');
            if (!isCellReference(endToken.value)) {
              throw formulaError(ERR.REF);
            }
            return { type: 'range', start: ref, end: parseCellReference(endToken.value) };
          }
          return { type: 'cell', ref: ref };
        }
        throw formulaError(ERR.NAME);
      }
      throw formulaError(ERR.GENERIC);
    }

    const result = parseExpression(1);
    if (index !== tokens.length) {
      throw formulaError(ERR.GENERIC);
    }
    return result;
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;
    while (index < input.length) {
      const char = input[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < input.length && input[end] !== '"') {
          value += input[end];
          end += 1;
        }
        if (end >= input.length) throw formulaError(ERR.GENERIC);
        tokens.push({ type: 'string', value: value });
        index = end + 1;
        continue;
      }
      if (/[0-9.]/.test(char)) {
        let end = index + 1;
        while (end < input.length && /[0-9.]/.test(input[end])) end += 1;
        tokens.push({ type: 'number', value: Number(input.slice(index, end)) });
        index = end;
        continue;
      }
      if (/[A-Za-z_$]/.test(char)) {
        let end = index + 1;
        while (end < input.length && /[A-Za-z0-9_$]/.test(input[end])) end += 1;
        const word = input.slice(index, end).toUpperCase();
        if (word === 'TRUE' || word === 'FALSE') {
          tokens.push({ type: 'boolean', value: word === 'TRUE' });
        } else {
          tokens.push({ type: 'identifier', value: word });
        }
        index = end;
        continue;
      }
      const pair = input.slice(index, index + 2);
      if (pair === '<=' || pair === '>=' || pair === '<>') {
        tokens.push({ type: 'operator', value: pair });
        index += 2;
        continue;
      }
      if ('+-*/&=<>'.indexOf(char) >= 0) {
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
        tokens.push({ type: 'comma', value: ',' });
        index += 1;
        continue;
      }
      if (char === ':') {
        tokens.push({ type: 'colon', value: ':' });
        index += 1;
        continue;
      }
      throw formulaError(ERR.GENERIC);
    }
    return tokens;
  }

  function parseCellReference(reference) {
    const match = /^([$]?)([A-Z]+)([$]?)([0-9]+)$/.exec(reference);
    if (!match) {
      throw formulaError(ERR.REF);
    }
    return {
      id: match[2] + match[4],
      column: match[2],
      row: Number(match[4]),
      absoluteColumn: match[1] === '$',
      absoluteRow: match[3] === '$',
    };
  }

  function isCellReference(value) {
    return /^[$]?[A-Z]+[$]?[0-9]+$/.test(value);
  }

  function expandRange(startId, endId) {
    const start = parseCellId(startId);
    const end = parseCellId(endId);
    const minColumn = Math.min(start.columnIndex, end.columnIndex);
    const maxColumn = Math.max(start.columnIndex, end.columnIndex);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const cells = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        cells.push(columnIndexToName(column) + row);
      }
    }
    return cells;
  }

  function parseCellId(cellId) {
    const match = /^([A-Z]+)([0-9]+)$/.exec(cellId);
    if (!match) throw formulaError(ERR.REF);
    return { columnName: match[1], columnIndex: columnNameToIndex(match[1]), row: Number(match[2]) };
  }

  function columnNameToIndex(name) {
    let value = 0;
    for (let index = 0; index < name.length; index += 1) {
      value = value * 26 + (name.charCodeAt(index) - 64);
    }
    return value - 1;
  }

  function columnIndexToName(index) {
    let value = index + 1;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      throw formulaError(ERR.GENERIC);
    }
    if (Object.is(value, -0)) return '0';
    const rounded = Math.round(value * 1000000000) / 1000000000;
    return String(rounded);
  }

  function formulaError(code) {
    const error = new Error(code);
    error.isFormulaError = true;
    error.code = code;
    return error;
  }

  return {
    createFormulaEngine: createFormulaEngine,
    parseCellId: parseCellId,
    columnNameToIndex: columnNameToIndex,
    columnIndexToName: columnIndexToName,
    expandRange: expandRange,
    ERR: ERR,
  };
});
