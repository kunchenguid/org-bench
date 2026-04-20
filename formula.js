(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetFormula = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const MAX_COLS = 26;
  const MAX_ROWS = 100;

  function columnToIndex(label) {
    let index = 0;
    for (let i = 0; i < label.length; i += 1) {
      index = index * 26 + (label.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  function indexToColumn(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function parseCellId(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(String(cellId).toUpperCase());
    if (!match) {
      throw new Error('Invalid cell id');
    }
    return {
      col: columnToIndex(match[1]),
      row: Number(match[2]) - 1,
    };
  }

  function toCellId(row, col) {
    return indexToColumn(col) + String(row + 1);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function createWorkbook(initialCells) {
    const raw = new Map(Object.entries(initialCells || {}));

    function setCell(cellId, value) {
      const nextValue = String(value || '');
      if (nextValue) {
        raw.set(cellId, nextValue);
      } else {
        raw.delete(cellId);
      }
    }

    function getCell(cellId) {
      return raw.get(cellId) || '';
    }

    function evaluateCell(cellId, trail, cache) {
      if (cache.has(cellId)) {
        return cache.get(cellId);
      }
      if (trail.has(cellId)) {
        return { error: '#CIRC!' };
      }

      trail.add(cellId);
      const rawValue = getCell(cellId);
      let result;
      if (!rawValue.startsWith('=')) {
        result = parseLiteral(rawValue);
      } else {
        try {
          const tokens = tokenize(rawValue.slice(1));
          const parser = createParser(tokens);
          const expression = parser.parseExpression();
          parser.expectEnd();
          result = evaluateExpression(expression, {
            getReference(refCellId) {
              return evaluateCell(refCellId, trail, cache);
            },
          });
        } catch (error) {
          result = { error: error && error.code ? error.code : '#ERR!' };
        }
      }

      trail.delete(cellId);
      cache.set(cellId, result);
      return result;
    }

    function getComputed(cellId) {
      return evaluateCell(cellId, new Set(), new Map());
    }

    function getDisplayValue(cellId) {
      return formatDisplayValue(getComputed(cellId));
    }

    function getSnapshot() {
      return Object.fromEntries(raw.entries());
    }

    return {
      setCell,
      getCell,
      getDisplayValue,
      getComputed,
      getSnapshot,
    };
  }

  function parseLiteral(rawValue) {
    if (!rawValue) {
      return '';
    }
    if (/^[-+]?\d+(\.\d+)?$/.test(rawValue.trim())) {
      return Number(rawValue);
    }
    if (/^TRUE$/i.test(rawValue.trim())) {
      return true;
    }
    if (/^FALSE$/i.test(rawValue.trim())) {
      return false;
    }
    return rawValue;
  }

  function formatDisplayValue(value) {
    if (value && value.error) {
      return value.error;
    }
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      const char = source[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (char === '"') {
        let end = index + 1;
        let text = '';
        while (end < source.length && source[end] !== '"') {
          text += source[end];
          end += 1;
        }
        if (source[end] !== '"') {
          throw { code: '#ERR!' };
        }
        tokens.push({ type: 'string', value: text });
        index = end + 1;
        continue;
      }

      const numberMatch = /^\d+(?:\.\d+)?/.exec(source.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }

      const refMatch = /^\$?[A-Z]+\$?\d+/.exec(source.slice(index));
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0] });
        index += refMatch[0].length;
        continue;
      }

      const wordMatch = /^[A-Z_]+/.exec(source.slice(index));
      if (wordMatch) {
        tokens.push({ type: 'word', value: wordMatch[0] });
        index += wordMatch[0].length;
        continue;
      }

      const twoChar = source.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'op', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=(),:<>'.includes(char)) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? char : 'op', value: char });
        index += 1;
        continue;
      }

      throw { code: '#ERR!' };
    }

    return tokens;
  }

  function createParser(tokens) {
    let position = 0;

    function peek() {
      return tokens[position];
    }

    function consume(type, value) {
      const token = tokens[position];
      if (!token || token.type !== type || (value && token.value !== value)) {
        return null;
      }
      position += 1;
      return token;
    }

    function expectEnd() {
      if (position !== tokens.length) {
        throw { code: '#ERR!' };
      }
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let left = parseConcat();
      while (peek() && peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = tokens[position].value;
        position += 1;
        left = { type: 'binary', operator, left, right: parseConcat() };
      }
      return left;
    }

    function parseConcat() {
      let left = parseAdditive();
      while (consume('op', '&')) {
        left = { type: 'binary', operator: '&', left, right: parseAdditive() };
      }
      return left;
    }

    function parseAdditive() {
      let left = parseMultiplicative();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const operator = tokens[position].value;
        position += 1;
        left = { type: 'binary', operator, left, right: parseMultiplicative() };
      }
      return left;
    }

    function parseMultiplicative() {
      let left = parseUnary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const operator = tokens[position].value;
        position += 1;
        left = { type: 'binary', operator, left, right: parseUnary() };
      }
      return left;
    }

    function parseUnary() {
      if (consume('op', '-')) {
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw { code: '#ERR!' };
      }

      if (consume('(')) {
        const expression = parseExpression();
        if (!consume(')')) {
          throw { code: '#ERR!' };
        }
        return expression;
      }

      if (token.type === 'number') {
        position += 1;
        return { type: 'literal', value: token.value };
      }

      if (token.type === 'string') {
        position += 1;
        return { type: 'literal', value: token.value };
      }

      if (token.type === 'word') {
        position += 1;
        if (/^(TRUE|FALSE)$/i.test(token.value)) {
          return { type: 'literal', value: /^TRUE$/i.test(token.value) };
        }
        if (!consume('(')) {
          throw { code: '#ERR!' };
        }
        const args = [];
        if (!consume(')')) {
          do {
            args.push(parseExpression());
          } while (consume(','));
          if (!consume(')')) {
            throw { code: '#ERR!' };
          }
        }
        return { type: 'call', name: token.value, args };
      }

      if (token.type === 'ref') {
        position += 1;
        const leftRef = token.value;
        if (consume(':')) {
          const rightRef = consume('ref');
          if (!rightRef) {
            throw { code: '#ERR!' };
          }
          return { type: 'range', start: leftRef, end: rightRef.value };
        }
        return { type: 'ref', value: leftRef };
      }

      throw { code: '#ERR!' };
    }

    return {
      parseExpression,
      expectEnd,
    };
  }

  function evaluateExpression(node, context) {
    if (!node) {
      throw { code: '#ERR!' };
    }

    if (node.type === 'literal') {
      return node.value;
    }

    if (node.type === 'ref') {
      return normalizeReferenceValue(context.getReference(normalizeRef(node.value)));
    }

    if (node.type === 'range') {
      return getRangeValues(node.start, node.end, context.getReference);
    }

    if (node.type === 'unary') {
      const value = evaluateExpression(node.value, context);
      if (value && value.error) {
        return value;
      }
      return -toNumber(value);
    }

    if (node.type === 'binary') {
      const left = evaluateExpression(node.left, context);
      const right = evaluateExpression(node.right, context);
      if (left && left.error) {
        return left;
      }
      if (right && right.error) {
        return right;
      }
      switch (node.operator) {
        case '+':
          return toNumber(left) + toNumber(right);
        case '-':
          return toNumber(left) - toNumber(right);
        case '*':
          return toNumber(left) * toNumber(right);
        case '/':
          if (toNumber(right) === 0) {
            return { error: '#DIV/0!' };
          }
          return toNumber(left) / toNumber(right);
        case '&':
          return toText(left) + toText(right);
        case '=':
          return compareValues(left, right) === 0;
        case '<>':
          return compareValues(left, right) !== 0;
        case '<':
          return compareValues(left, right) < 0;
        case '<=':
          return compareValues(left, right) <= 0;
        case '>':
          return compareValues(left, right) > 0;
        case '>=':
          return compareValues(left, right) >= 0;
        default:
          throw { code: '#ERR!' };
      }
    }

    if (node.type === 'call') {
      const args = node.args.map(function (arg) {
        return evaluateExpression(arg, context);
      });
      return applyFunction(node.name, args);
    }

    throw { code: '#ERR!' };
  }

  function normalizeReferenceValue(value) {
    if (value && value.error) {
      return value;
    }
    return value === '' ? 0 : value;
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return value.reduce(function (sum, entry) {
        return sum + toNumber(entry);
      }, 0);
    }
    if (value === '' || value == null) {
      return 0;
    }
    if (value === true) {
      return 1;
    }
    if (value === false) {
      return 0;
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      return 0;
    }
    return number;
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.map(toText).join('');
    }
    if (value == null || value === '') {
      return '';
    }
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (value && value.error) {
      return value.error;
    }
    return String(value);
  }

  function compareValues(left, right) {
    if (typeof left === 'number' || typeof right === 'number') {
      return toNumber(left) - toNumber(right);
    }
    return toText(left).localeCompare(toText(right));
  }

  function flattenValues(values) {
    return values.flatMap(function (value) {
      return Array.isArray(value) ? flattenValues(value) : [value];
    });
  }

  function applyFunction(name, args) {
    const upperName = name.toUpperCase();
    const flat = flattenValues(args);

    switch (upperName) {
      case 'SUM':
        return flat.reduce(function (sum, value) {
          return sum + toNumber(value);
        }, 0);
      case 'AVERAGE':
        return flat.length ? applyFunction('SUM', args) / flat.length : 0;
      case 'MIN':
        return flat.length ? Math.min.apply(null, flat.map(toNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max.apply(null, flat.map(toNumber)) : 0;
      case 'COUNT':
        return flat.filter(function (value) {
          return value !== '' && value != null;
        }).length;
      case 'IF':
        return truthy(args[0]) ? args[1] : args[2];
      case 'AND':
        return flat.every(truthy);
      case 'OR':
        return flat.some(truthy);
      case 'NOT':
        return !truthy(args[0]);
      case 'ABS':
        return Math.abs(toNumber(args[0]));
      case 'ROUND':
        return Number(toNumber(args[0]).toFixed(args[1] == null ? 0 : toNumber(args[1])));
      case 'CONCAT':
        return flat.map(toText).join('');
      default:
        return { error: '#ERR!' };
    }
  }

  function truthy(value) {
    if (value === '' || value == null) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return String(value).length > 0;
  }

  function normalizeRef(ref) {
    return ref.replace(/\$/g, '');
  }

  function getRangeValues(startRef, endRef, getReference) {
    const start = parseCellId(normalizeRef(startRef));
    const end = parseCellId(normalizeRef(endRef));
    const top = Math.min(start.row, end.row);
    const bottom = Math.max(start.row, end.row);
    const left = Math.min(start.col, end.col);
    const right = Math.max(start.col, end.col);
    const values = [];

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        values.push(normalizeReferenceValue(getReference(toCellId(row, col))));
      }
    }

    return values;
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    if (!String(formula).startsWith('=')) {
      return formula;
    }

    return formula.replace(/\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, function (match) {
      if (match.includes(':')) {
        const parts = match.split(':');
        return shiftRef(parts[0], rowOffset, colOffset) + ':' + shiftRef(parts[1], rowOffset, colOffset);
      }
      return shiftRef(match, rowOffset, colOffset);
    });
  }

  function shiftRef(ref, rowOffset, colOffset) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
    if (!match) {
      return ref;
    }

    const nextCol = match[1] ? columnToIndex(match[2]) : columnToIndex(match[2]) + colOffset;
    const nextRow = match[3] ? Number(match[4]) - 1 : Number(match[4]) - 1 + rowOffset;

    return (match[1] ? '$' : '') + indexToColumn(clamp(nextCol, 0, MAX_COLS - 1)) + (match[3] ? '$' : '') + String(clamp(nextRow, 0, MAX_ROWS - 1) + 1);
  }

  return {
    MAX_COLS,
    MAX_ROWS,
    createWorkbook,
    parseCellId,
    toCellId,
    shiftFormula,
    indexToColumn,
  };
});
