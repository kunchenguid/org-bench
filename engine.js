(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ERROR = {
    generic: '#ERR!',
    div0: '#DIV/0!',
    circular: '#CIRC!'
  };

  function createEngine(rawCells) {
    const cache = {};
    const visiting = new Set();
    const refs = new Set(Object.keys(rawCells || {}));

    function evaluateCell(cellId) {
      if (cache[cellId]) {
        return cache[cellId];
      }

      if (visiting.has(cellId)) {
        return makeError(ERROR.circular);
      }

      visiting.add(cellId);
      const raw = Object.prototype.hasOwnProperty.call(rawCells, cellId) ? rawCells[cellId] : '';
      refs.add(cellId);
      const result = evaluateRaw(raw, cellId);
      visiting.delete(cellId);
      cache[cellId] = result;
      return result;
    }

    function evaluateRaw(raw, cellId) {
      if (!raw) {
        return makeValue('');
      }

      if (raw.charAt(0) !== '=') {
        const trimmed = raw.trim();
        if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
          return makeValue(Number(trimmed));
        }
        return makeValue(raw);
      }

      try {
        const parser = createParser(raw.slice(1), readCell, readRange);
        const computed = parser.parse();
        if (isError(computed)) {
          return computed;
        }
        if (typeof computed === 'number' && !Number.isFinite(computed)) {
          return makeError(ERROR.div0);
        }
        return makeValue(computed);
      } catch (error) {
        return makeError(error && error.code ? error.code : ERROR.generic);
      }
    }

    function readCell(cellId) {
      refs.add(cellId);
      const result = evaluateCell(cellId);
      if (result.error) {
        throw { code: result.error };
      }
      if (result.value === '') {
        return 0;
      }
      return result.value;
    }

    function readRange(startId, endId) {
      const ids = expandRange(startId, endId);
      return ids.map(function (id) {
        return readCell(id);
      });
    }

    refs.forEach(evaluateCell);

    const values = {};
    refs.forEach(function (cellId) {
      values[cellId] = evaluateCell(cellId);
    });

    return { values: values };
  }

  function createParser(input, readCell, readRange) {
    const tokens = tokenize(input);
    let index = 0;

    function parse() {
      const value = parseComparison();
      expect('eof');
      return value;
    }

    function parseComparison() {
      let left = parseExpression();
      while (matchOp('>', '<', '>=', '<=', '=', '==', '!=', '<>')) {
        const operator = previous().value;
        const right = parseExpression();
        left = applyComparison(operator, left, right);
      }
      return left;
    }

    function parseExpression() {
      let left = parseTerm();
      while (matchOp('+', '-')) {
        const operator = previous().value;
        const right = parseTerm();
        left = operator === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
      }
      return left;
    }

    function parseTerm() {
      let left = parseFactor();
      while (matchOp('*', '/')) {
        const operator = previous().value;
        const right = parseFactor();
        if (operator === '/') {
          const divisor = toNumber(right);
          if (divisor === 0) {
            throw { code: ERROR.div0 };
          }
          left = toNumber(left) / divisor;
        } else {
          left = toNumber(left) * toNumber(right);
        }
      }
      return left;
    }

    function parseFactor() {
      if (matchOp('-')) {
        return -toNumber(parseFactor());
      }

      if (match('number')) {
        return previous().value;
      }

      if (match('identifier')) {
        const identifier = previous().value;
        if (match('paren', '(')) {
          const args = [];
          if (!check('paren', ')')) {
            do {
              args.push(parseArgument());
            } while (match('comma'));
          }
          expect('paren', ')');
          return callFunction(identifier, args);
        }
        if (isCellId(identifier)) {
          return readCell(identifier);
        }
        throw { code: ERROR.generic };
      }

      if (match('paren', '(')) {
        const value = parseComparison();
        expect('paren', ')');
        return value;
      }

      throw { code: ERROR.generic };
    }

    function parseArgument() {
      if (check('identifier') && isCellId(peek().value) && checkNext('colon')) {
        const start = advance().value;
        advance();
        if (!check('identifier') || !isCellId(peek().value)) {
          throw { code: ERROR.generic };
        }
        const end = advance().value;
        return readRange(start, end);
      }
      return parseComparison();
    }

    function callFunction(name, args) {
      const fn = name.toUpperCase();
      if (fn === 'SUM') {
        return flatten(args).reduce(function (sum, value) { return sum + toNumber(value); }, 0);
      }
      if (fn === 'AVERAGE') {
        const values = flatten(args).map(toNumber);
        return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : 0;
      }
      if (fn === 'MIN') {
        const values = flatten(args).map(toNumber);
        return values.length ? Math.min.apply(Math, values) : 0;
      }
      if (fn === 'MAX') {
        const values = flatten(args).map(toNumber);
        return values.length ? Math.max.apply(Math, values) : 0;
      }
      if (fn === 'COUNT') {
        return flatten(args).filter(function (value) { return value !== ''; }).length;
      }
      if (fn === 'IF') {
        return truthy(args[0]) ? (args[1] === undefined ? 0 : args[1]) : (args[2] === undefined ? 0 : args[2]);
      }
      throw { code: ERROR.generic };
    }

    function match(type, value) {
      if (!check(type, value)) {
        return false;
      }
      index += 1;
      return true;
    }

    function matchOp() {
      const values = Array.prototype.slice.call(arguments);
      if (!check('operator') || values.indexOf(peek().value) === -1) {
        return false;
      }
      index += 1;
      return true;
    }

    function check(type, value) {
      const token = peek();
      if (!token || token.type !== type) {
        return false;
      }
      return value === undefined || token.value === value;
    }

    function checkNext(type) {
      const token = tokens[index + 1];
      return !!token && token.type === type;
    }

    function expect(type, value) {
      if (!match(type, value)) {
        throw { code: ERROR.generic };
      }
    }

    function advance() {
      const token = tokens[index];
      index += 1;
      return token;
    }

    function previous() {
      return tokens[index - 1];
    }

    function peek() {
      return tokens[index];
    }

    return { parse: parse };
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

      const twoChar = input.slice(index, index + 2);
      if (/^(>=|<=|==|!=|<>)$/.test(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if (/^[+\-*/><=]$/.test(char)) {
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

      if (/\d|\./.test(char)) {
        let end = index + 1;
        while (end < input.length && /[\d.]/.test(input.charAt(end))) {
          end += 1;
        }
        const value = Number(input.slice(index, end));
        if (Number.isNaN(value)) {
          throw { code: ERROR.generic };
        }
        tokens.push({ type: 'number', value: value });
        index = end;
        continue;
      }

      if (/[A-Za-z]/.test(char)) {
        let end = index + 1;
        while (end < input.length && /[A-Za-z0-9]/.test(input.charAt(end))) {
          end += 1;
        }
        tokens.push({ type: 'identifier', value: input.slice(index, end).toUpperCase() });
        index = end;
        continue;
      }

      throw { code: ERROR.generic };
    }

    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function expandRange(startId, endId) {
    const start = splitCellId(startId);
    const end = splitCellId(endId);
    const fromCol = Math.min(start.col, end.col);
    const toCol = Math.max(start.col, end.col);
    const fromRow = Math.min(start.row, end.row);
    const toRow = Math.max(start.row, end.row);
    const cells = [];

    for (let row = fromRow; row <= toRow; row += 1) {
      for (let col = fromCol; col <= toCol; col += 1) {
        cells.push(toCellId(col, row));
      }
    }

    return cells;
  }

  function splitCellId(cellId) {
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    if (!match) {
      throw { code: ERROR.generic };
    }
    return {
      col: lettersToColumn(match[1]),
      row: Number(match[2])
    };
  }

  function toCellId(col, row) {
    return columnToLetters(col) + String(row);
  }

  function lettersToColumn(letters) {
    let value = 0;
    for (let index = 0; index < letters.length; index += 1) {
      value = value * 26 + (letters.charCodeAt(index) - 64);
    }
    return value;
  }

  function columnToLetters(col) {
    let value = col;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - remainder - 1) / 26);
    }
    return letters;
  }

  function flatten(values) {
    return values.reduce(function (all, value) {
      return all.concat(Array.isArray(value) ? value : [value]);
    }, []);
  }

  function toNumber(value) {
    if (typeof value === 'number') {
      return value;
    }
    if (value === '' || value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    return 0;
  }

  function truthy(value) {
    if (typeof value === 'number') {
      return value !== 0;
    }
    return !!value;
  }

  function applyComparison(operator, left, right) {
    if (operator === '>') return toNumber(left) > toNumber(right) ? 1 : 0;
    if (operator === '<') return toNumber(left) < toNumber(right) ? 1 : 0;
    if (operator === '>=') return toNumber(left) >= toNumber(right) ? 1 : 0;
    if (operator === '<=') return toNumber(left) <= toNumber(right) ? 1 : 0;
    if (operator === '=' || operator === '==') return left === right ? 1 : 0;
    if (operator === '!=' || operator === '<>') return left !== right ? 1 : 0;
    throw { code: ERROR.generic };
  }

  function isCellId(value) {
    return /^[A-Z]+\d+$/.test(value);
  }

  function isError(value) {
    return value && value.error;
  }

  function makeValue(value) {
    return {
      value: value,
      display: value === '' ? '' : String(value),
      error: null
    };
  }

  function makeError(code) {
    return {
      value: code,
      display: code,
      error: code
    };
  }

  return {
    ERROR: ERROR,
    createEngine: createEngine,
    expandRange: expandRange,
    splitCellId: splitCellId,
    toCellId: toCellId,
    columnToLetters: columnToLetters
  };
});
