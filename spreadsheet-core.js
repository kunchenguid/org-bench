(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERR = '#ERR!';
  const DIV_ZERO = '#DIV/0!';
  const CIRC = '#CIRC!';
  const NAME = '#NAME?';

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function parseLiteral(raw) {
    if (raw == null || raw === '') {
      return { type: 'empty', value: '', display: '' };
    }
    const trimmed = raw.trim();
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
      const value = Number(trimmed);
      return { type: 'number', value: value, display: formatValue(value) };
    }
    return { type: 'text', value: raw, display: raw };
  }

  function formatValue(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ERR;
      }
      if (Object.is(value, -0)) {
        return '0';
      }
      if (Number.isInteger(value)) {
        return String(value);
      }
      return String(Number(value.toFixed(10)));
    }
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function toNumber(value) {
    if (value && value.error) {
      throw value;
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
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    return 0;
  }

  function toBoolean(value) {
    if (value && value.error) {
      throw value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function flattenArgs(values) {
    const flattened = [];
    for (const value of values) {
      if (Array.isArray(value)) {
        flattened.push.apply(flattened, flattenArgs(value));
      } else {
        flattened.push(value);
      }
    }
    return flattened;
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
      if ('+-*/(),:'.indexOf(char) >= 0) {
        tokens.push({ type: char, value: char });
        index += 1;
        continue;
      }
      const cellMatch = source.slice(index).match(/^[A-Z]+\d+/);
      if (cellMatch) {
        tokens.push({ type: 'CELL', value: cellMatch[0] });
        index += cellMatch[0].length;
        continue;
      }
      const identMatch = source.slice(index).match(/^[A-Z_][A-Z0-9_]*/);
      if (identMatch) {
        tokens.push({ type: 'IDENT', value: identMatch[0] });
        index += identMatch[0].length;
        continue;
      }
      const numberMatch = source.slice(index).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'NUMBER', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      throw formulaError(ERR);
    }
    return tokens;
  }

  function parseFormula(source) {
    const tokens = tokenize(source);
    let position = 0;

    function peek(type) {
      const token = tokens[position];
      return Boolean(token && token.type === type);
    }

    function consume(type) {
      const token = tokens[position];
      if (!token || token.type !== type) {
        throw formulaError(ERR);
      }
      position += 1;
      return token;
    }

    function parseExpression() {
      let node = parseTerm();
      while (peek('+') || peek('-')) {
        const operator = consume(tokens[position].type).type;
        node = { type: 'binary', operator: operator, left: node, right: parseTerm() };
      }
      return node;
    }

    function parseTerm() {
      let node = parseUnary();
      while (peek('*') || peek('/')) {
        const operator = consume(tokens[position].type).type;
        node = { type: 'binary', operator: operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (peek('-')) {
        consume('-');
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parseArgs() {
      const args = [];
      if (peek(')')) {
        return args;
      }
      while (true) {
        args.push(parseExpression());
        if (!peek(',')) {
          return args;
        }
        consume(',');
      }
    }

    function parsePrimary() {
      if (peek('NUMBER')) {
        return { type: 'number', value: consume('NUMBER').value };
      }
      if (peek('CELL')) {
        const start = consume('CELL').value;
        if (peek(':')) {
          consume(':');
          return { type: 'range', start: start, end: consume('CELL').value };
        }
        return { type: 'cell', ref: start };
      }
      if (peek('IDENT')) {
        const name = consume('IDENT').value;
        consume('(');
        const args = parseArgs();
        consume(')');
        return { type: 'call', name: name, args: args };
      }
      if (peek('(')) {
        consume('(');
        const inner = parseExpression();
        consume(')');
        return inner;
      }
      throw formulaError(ERR);
    }

    const ast = parseExpression();
    if (position !== tokens.length) {
      throw formulaError(ERR);
    }
    return ast;
  }

  function formulaError(code) {
    return { error: true, code: code || ERR };
  }

  function expandRange(startRef, endRef) {
    const start = splitCellRef(startRef);
    const end = splitCellRef(endRef);
    const cells = [];
    const startColumn = Math.min(start.column, end.column);
    const endColumn = Math.max(start.column, end.column);
    const startRow = Math.min(start.row, end.row);
    const endRow = Math.max(start.row, end.row);
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        cells.push(columnLabel(column) + String(row + 1));
      }
    }
    return cells;
  }

  function splitCellRef(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!match) {
      throw formulaError(ERR);
    }
    let column = 0;
    for (let index = 0; index < match[1].length; index += 1) {
      column = column * 26 + (match[1].charCodeAt(index) - 64);
    }
    return { column: column - 1, row: Number(match[2]) - 1 };
  }

  function evaluateSheet(rawCells) {
    const cache = {};
    const visiting = new Set();

    function readCell(ref) {
      if (cache[ref]) {
        return cache[ref];
      }
      if (visiting.has(ref)) {
        return makeResult(rawCells[ref] || '', null, CIRC);
      }
      visiting.add(ref);
      let result;
      const raw = rawCells[ref] || '';
      if (raw.startsWith('=')) {
        try {
          const ast = parseFormula(raw.slice(1));
          const value = evaluateNode(ast);
          result = makeResult(raw, value, null);
        } catch (error) {
          result = makeResult(raw, null, normalizeError(error));
        }
      } else {
        const literal = parseLiteral(raw);
        result = makeResult(raw, literal.value, null, literal.display, literal.type === 'text');
      }
      visiting.delete(ref);
      cache[ref] = result;
      return result;
    }

    function evaluateNode(node) {
      switch (node.type) {
        case 'number':
          return node.value;
        case 'cell': {
          const result = readCell(node.ref);
          if (result.error) {
            throw formulaError(result.error);
          }
          return result.kind === 'text' ? result.value : toNumber(result.value);
        }
        case 'range':
          return expandRange(node.start, node.end).map(function (ref) {
            const result = readCell(ref);
            if (result.error) {
              throw formulaError(result.error);
            }
            return result.kind === 'text' ? result.value : toNumber(result.value);
          });
        case 'unary':
          return -toNumber(evaluateNode(node.value));
        case 'binary': {
          const left = toNumber(evaluateNode(node.left));
          const right = toNumber(evaluateNode(node.right));
          if (node.operator === '+') {
            return left + right;
          }
          if (node.operator === '-') {
            return left - right;
          }
          if (node.operator === '*') {
            return left * right;
          }
          if (right === 0) {
            throw formulaError(DIV_ZERO);
          }
          return left / right;
        }
        case 'call':
          return evaluateCall(node.name, node.args);
        default:
          throw formulaError(ERR);
      }
    }

    function evaluateCall(name, argNodes) {
      if (name === 'IF') {
        if (argNodes.length !== 3) {
          throw formulaError(ERR);
        }
        return toBoolean(evaluateNode(argNodes[0])) ? evaluateNode(argNodes[1]) : evaluateNode(argNodes[2]);
      }
      const values = flattenArgs(argNodes.map(evaluateNode));
      const numericValues = values.map(toNumber);
      if (name === 'SUM') {
        return numericValues.reduce(function (sum, value) { return sum + value; }, 0);
      }
      if (name === 'AVERAGE') {
        return numericValues.length ? numericValues.reduce(function (sum, value) { return sum + value; }, 0) / numericValues.length : 0;
      }
      if (name === 'MIN') {
        return numericValues.length ? Math.min.apply(Math, numericValues) : 0;
      }
      if (name === 'MAX') {
        return numericValues.length ? Math.max.apply(Math, numericValues) : 0;
      }
      if (name === 'COUNT') {
        return numericValues.filter(function (value) { return value !== 0 || Object.is(value, 0); }).length;
      }
      throw formulaError(NAME);
    }

    const results = {};
    const refs = Object.keys(rawCells);
    for (const ref of refs) {
      results[ref] = readCell(ref);
    }
    return results;
  }

  function normalizeError(error) {
    if (error && error.code) {
      return error.code;
    }
    return ERR;
  }

  function makeResult(raw, value, error, displayOverride, isText) {
    return {
      raw: raw,
      value: error ? null : value,
      error: error || null,
      display: error || (displayOverride != null ? displayOverride : formatValue(value)),
      kind: isText ? 'text' : typeof value,
    };
  }

  return {
    CIRC: CIRC,
    columnLabel: columnLabel,
    evaluateSheet: evaluateSheet,
    formatValue: formatValue,
    splitCellRef: splitCellRef,
  };
});
