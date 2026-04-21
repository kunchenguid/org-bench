(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetFormula = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERR = '#ERR!';
  const DIV0 = '#DIV/0!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';

  function evaluateFormula(raw, context) {
    if (typeof raw !== 'string' || raw.charAt(0) !== '=') {
      return coerceLiteral(raw);
    }

    try {
      const parser = createParser(raw.slice(1));
      const ast = parser.parseExpression();
      parser.expectEnd();
      const state = {
        cells: context && context.cells ? context.cells : {},
        visiting: new Set(),
        cache: new Map(),
        getCellRaw: context && context.getCellRaw,
      };
      const value = evaluateNode(ast, state, context && context.position ? context.position : { row: 0, col: 0 });
      return formatValue(value);
    } catch (error) {
      return { type: 'error', value: error && error.code ? error.code : ERR, display: error && error.code ? error.code : ERR };
    }
  }

  function createParser(input) {
    let index = 0;

    function skipSpace() {
      while (index < input.length && /\s/.test(input.charAt(index))) {
        index += 1;
      }
    }

    function match(text) {
      skipSpace();
      if (input.slice(index, index + text.length).toUpperCase() === text.toUpperCase()) {
        index += text.length;
        return true;
      }
      return false;
    }

    function peek() {
      skipSpace();
      return input.charAt(index);
    }

    function readWhile(pattern) {
      const start = index;
      while (index < input.length && pattern.test(input.charAt(index))) {
        index += 1;
      }
      return input.slice(start, index);
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let left = parseConcat();
      while (true) {
        skipSpace();
        const operators = ['<=', '>=', '<>', '<', '>', '='];
        const operator = operators.find((candidate) => input.slice(index, index + candidate.length) === candidate);
        if (!operator) {
          return left;
        }
        index += operator.length;
        left = { type: 'binary', operator, left, right: parseConcat() };
      }
    }

    function parseConcat() {
      let left = parseAddSub();
      while (match('&')) {
        left = { type: 'binary', operator: '&', left, right: parseAddSub() };
      }
      return left;
    }

    function parseAddSub() {
      let left = parseMulDiv();
      while (true) {
        if (match('+')) {
          left = { type: 'binary', operator: '+', left, right: parseMulDiv() };
          continue;
        }
        if (match('-')) {
          left = { type: 'binary', operator: '-', left, right: parseMulDiv() };
          continue;
        }
        return left;
      }
    }

    function parseMulDiv() {
      let left = parseUnary();
      while (true) {
        if (match('*')) {
          left = { type: 'binary', operator: '*', left, right: parseUnary() };
          continue;
        }
        if (match('/')) {
          left = { type: 'binary', operator: '/', left, right: parseUnary() };
          continue;
        }
        return left;
      }
    }

    function parseUnary() {
      if (match('-')) {
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      skipSpace();
      const char = input.charAt(index);
      if (char === '(') {
        index += 1;
        const expr = parseExpression();
        if (!match(')')) {
          throw { code: ERR };
        }
        return expr;
      }
      if (char === '"') {
        index += 1;
        const start = index;
        while (index < input.length && input.charAt(index) !== '"') {
          index += 1;
        }
        if (index >= input.length) {
          throw { code: ERR };
        }
        const value = input.slice(start, index);
        index += 1;
        return { type: 'literal', value };
      }
      if (/[0-9.]/.test(char)) {
        const numberText = readWhile(/[0-9.]/);
        const value = Number(numberText);
        if (Number.isNaN(value)) {
          throw { code: ERR };
        }
        return { type: 'literal', value };
      }
      if (/[A-Za-z$]/.test(char)) {
        const ident = readIdentifier();
        skipSpace();
        if (peek() === '(') {
          index += 1;
          const args = [];
          skipSpace();
          if (peek() !== ')') {
            while (true) {
              args.push(parseExpression());
              skipSpace();
              if (peek() === ')') {
                break;
              }
              if (!match(',')) {
                throw { code: ERR };
              }
            }
          }
          if (!match(')')) {
            throw { code: ERR };
          }
          return { type: 'function', name: ident.toUpperCase(), args };
        }

        const maybeRef = parseCellReference(ident);
        if (maybeRef) {
          skipSpace();
          if (match(':')) {
            const secondIdent = readIdentifier();
            const endRef = parseCellReference(secondIdent);
            if (!endRef) {
              throw { code: ERR };
            }
            return { type: 'range', start: maybeRef, end: endRef };
          }
          return { type: 'cell', ref: maybeRef };
        }

        const upper = ident.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE') {
          return { type: 'literal', value: upper === 'TRUE' };
        }
      }
      throw { code: ERR };
    }

    function readIdentifier() {
      skipSpace();
      const start = index;
      while (index < input.length && /[A-Za-z0-9$_.]/.test(input.charAt(index))) {
        index += 1;
      }
      return input.slice(start, index);
    }

    function expectEnd() {
      skipSpace();
      if (index !== input.length) {
        throw { code: ERR };
      }
    }

    return { parseExpression, expectEnd };
  }

  function parseCellReference(text) {
    const match = text.toUpperCase().match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      return null;
    }
    return {
      columnAbsolute: Boolean(match[1]),
      columnLabel: match[2],
      rowAbsolute: Boolean(match[3]),
      rowNumber: Number(match[4]),
    };
  }

  function evaluateNode(node, state, position) {
    if (node.type === 'literal') {
      return node.value;
    }
    if (node.type === 'unary') {
      return -toNumber(evaluateNode(node.value, state, position));
    }
    if (node.type === 'binary') {
      const left = evaluateNode(node.left, state, position);
      const right = evaluateNode(node.right, state, position);
      switch (node.operator) {
        case '+':
          return toNumber(left) + toNumber(right);
        case '-':
          return toNumber(left) - toNumber(right);
        case '*':
          return toNumber(left) * toNumber(right);
        case '/':
          if (toNumber(right) === 0) {
            throw { code: DIV0 };
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
      }
    }
    if (node.type === 'cell') {
      return readCell(node.ref, state);
    }
    if (node.type === 'range') {
      return collectRange(node.start, node.end, state);
    }
    if (node.type === 'function') {
      return callFunction(node.name, node.args, state, position);
    }
    throw { code: ERR };
  }

  function readCell(ref, state) {
    const address = ref.columnLabel + ref.rowNumber;
    if (state.visiting.has(address)) {
      throw { code: CIRC };
    }
    if (state.cache.has(address)) {
      return state.cache.get(address);
    }

    state.visiting.add(address);
    try {
      const raw = typeof state.getCellRaw === 'function' ? state.getCellRaw(address) : state.cells[address];
      const value = coerceRawValue(raw, state);
      state.cache.set(address, value);
      return value;
    } finally {
      state.visiting.delete(address);
    }
  }

  function coerceRawValue(raw, state) {
    if (raw === undefined || raw === null || raw === '') {
      return 0;
    }
    if (typeof raw === 'string' && raw.charAt(0) === '=') {
      const parser = createParser(raw.slice(1));
      const ast = parser.parseExpression();
      parser.expectEnd();
      return evaluateNode(ast, state, { row: 0, col: 0 });
    }
    const number = Number(raw);
    if (!Number.isNaN(number) && String(raw).trim() !== '') {
      return number;
    }
    return String(raw);
  }

  function collectRange(start, end, state) {
    const startCol = columnLabelToIndex(start.columnLabel);
    const endCol = columnLabelToIndex(end.columnLabel);
    const left = Math.min(startCol, endCol);
    const right = Math.max(startCol, endCol);
    const top = Math.min(start.rowNumber, end.rowNumber);
    const bottom = Math.max(start.rowNumber, end.rowNumber);
    const values = [];
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        values.push(readCell({ columnLabel: columnIndexToLabel(col), rowNumber: row }, state));
      }
    }
    return values;
  }

  function callFunction(name, args, state, position) {
    const values = args.map((arg) => evaluateNode(arg, state, position));
    const flat = values.flatMap((value) => Array.isArray(value) ? value : [value]);
    switch (name) {
      case 'SUM':
        return flat.reduce((sum, value) => sum + toNumber(value), 0);
      case 'AVERAGE':
        return flat.length ? flat.reduce((sum, value) => sum + toNumber(value), 0) / flat.length : 0;
      case 'MIN':
        return flat.length ? Math.min.apply(null, flat.map(toNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max.apply(null, flat.map(toNumber)) : 0;
      case 'COUNT':
        return flat.filter((value) => value !== '' && value !== null && value !== undefined).length;
      case 'IF':
        return toBoolean(values[0]) ? values[1] : values[2];
      case 'AND':
        return flat.every(toBoolean);
      case 'OR':
        return flat.some(toBoolean);
      case 'NOT':
        return !toBoolean(values[0]);
      case 'ABS':
        return Math.abs(toNumber(values[0]));
      case 'ROUND':
        return roundTo(toNumber(values[0]), values[1] === undefined ? 0 : toNumber(values[1]));
      case 'CONCAT':
        return flat.map(toText).join('');
      default:
        throw { code: ERR };
    }
  }

  function compareValues(left, right) {
    if (typeof left === 'number' && typeof right === 'number') {
      return left === right ? 0 : left < right ? -1 : 1;
    }
    const leftText = toText(left);
    const rightText = toText(right);
    if (leftText === rightText) {
      return 0;
    }
    return leftText < rightText ? -1 : 1;
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return value.length ? toNumber(value[0]) : 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '' || value === null || value === undefined) {
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
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  function toBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return toText(value).toUpperCase() === 'TRUE' || toText(value) !== '';
  }

  function roundTo(value, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function coerceLiteral(raw) {
    if (raw === undefined || raw === null || raw === '') {
      return { type: 'blank', value: '', display: '' };
    }
    const number = Number(raw);
    if (!Number.isNaN(number) && String(raw).trim() !== '') {
      return { type: 'number', value: number, display: String(number) };
    }
    return { type: 'text', value: String(raw), display: String(raw) };
  }

  function formatValue(value) {
    if (typeof value === 'boolean') {
      return { type: 'boolean', value, display: value ? 'TRUE' : 'FALSE' };
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw { code: ERR };
      }
      return { type: 'number', value, display: String(value) };
    }
    if (typeof value === 'string') {
      if (value === ERR || value === DIV0 || value === CIRC || value === REF) {
        return { type: 'error', value, display: value };
      }
      return { type: 'text', value, display: value };
    }
    return { type: 'text', value: toText(value), display: toText(value) };
  }

  function columnLabelToIndex(label) {
    let result = 0;
    for (let index = 0; index < label.length; index += 1) {
      result = result * 26 + (label.charCodeAt(index) - 64);
    }
    return result - 1;
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

  return {
    evaluateFormula,
    columnIndexToLabel,
    columnLabelToIndex,
    parseCellReference,
  };
});
