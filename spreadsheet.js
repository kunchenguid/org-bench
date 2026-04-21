(function (global) {
  'use strict';

  const ERROR_CIRC = '#CIRC!';
  const ERROR_DIV_ZERO = '#DIV/0!';
  const ERROR_REF = '#REF!';
  const ERROR_GENERIC = '#ERR!';

  function createWorkbook(initialCells) {
    const cells = new Map(Object.entries(initialCells || {}));

    return {
      setCell(address, raw) {
        const normalized = normalizeAddress(address);
        const value = raw == null ? '' : String(raw);
        if (value === '') {
          cells.delete(normalized);
          return;
        }
        cells.set(normalized, value);
      },
      getCell(address) {
        return cells.get(normalizeAddress(address)) || '';
      },
      getCells() {
        return Object.fromEntries(cells.entries());
      },
      clear() {
        cells.clear();
      },
      insertRow(row, count) {
        transformStructure(cells, { kind: 'row', action: 'insert', index: row, count: count || 1 });
      },
      deleteRow(row, count) {
        transformStructure(cells, { kind: 'row', action: 'delete', index: row, count: count || 1 });
      },
      insertColumn(col, count) {
        transformStructure(cells, { kind: 'col', action: 'insert', index: col, count: count || 1 });
      },
      deleteColumn(col, count) {
        transformStructure(cells, { kind: 'col', action: 'delete', index: col, count: count || 1 });
      },
    };
  }

  function normalizeAddress(address) {
    return String(address || '').toUpperCase();
  }

  function parseAddress(address) {
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(normalizeAddress(address));
    if (!match) {
      return null;
    }
    return {
      col: lettersToColumn(match[1]),
      row: Number(match[2]),
    };
  }

  function columnToLetters(column) {
    let value = column;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  function lettersToColumn(letters) {
    let total = 0;
    for (let index = 0; index < letters.length; index += 1) {
      total = total * 26 + (letters.charCodeAt(index) - 64);
    }
    return total;
  }

  function formatAddress(row, col) {
    return `${columnToLetters(col)}${row}`;
  }

  function evaluateCellDisplay(workbook, address) {
    const raw = workbook.getCell(address);
    const result = evaluateRaw(workbook, raw, normalizeAddress(address), new Set());
    return displayValue(result);
  }

  function evaluateRaw(workbook, raw, address, visiting) {
    if (!raw) {
      return 0;
    }

    if (raw[0] !== '=') {
      const numeric = Number(raw);
      if (raw.trim() !== '' && !Number.isNaN(numeric)) {
        return numeric;
      }
      return raw;
    }

    if (raw.includes(ERROR_REF)) {
      return { error: ERROR_REF };
    }

    if (visiting.has(address)) {
      return { error: ERROR_CIRC };
    }

    visiting.add(address);
    try {
      const expression = raw.slice(1);
      const tokens = tokenize(expression);
      const parser = createParser(tokens);
      const ast = parser.parseExpression();
      if (!parser.isDone()) {
        return { error: ERROR_GENERIC };
      }
      return evaluateNode(workbook, ast, visiting);
    } catch (error) {
      return { error: ERROR_GENERIC };
    } finally {
      visiting.delete(address);
    }
  }

  function displayValue(value) {
    if (isError(value)) {
      return value.error;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ERROR_GENERIC;
      }
      if (Object.is(value, -0)) {
        return '0';
      }
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function createParser(tokens) {
    let index = 0;

    function current() {
      return tokens[index];
    }

    function consume(type, text) {
      const token = current();
      if (!token || token.type !== type || (text && token.text !== text)) {
        throw new Error('Unexpected token');
      }
      index += 1;
      return token;
    }

    function match(type, text) {
      const token = current();
      if (token && token.type === type && (!text || token.text === text)) {
        index += 1;
        return token;
      }
      return null;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcatenation();
      while (current() && current().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(current().text)) {
        const operator = consume('operator').text;
        node = { type: 'binary', operator, left: node, right: parseConcatenation() };
      }
      return node;
    }

    function parseConcatenation() {
      let node = parseAddition();
      while (match('operator', '&')) {
        node = { type: 'binary', operator: '&', left: node, right: parseAddition() };
      }
      return node;
    }

    function parseAddition() {
      let node = parseMultiplication();
      while (current() && current().type === 'operator' && (current().text === '+' || current().text === '-')) {
        const operator = consume('operator').text;
        node = { type: 'binary', operator, left: node, right: parseMultiplication() };
      }
      return node;
    }

    function parseMultiplication() {
      let node = parseUnary();
      while (current() && current().type === 'operator' && (current().text === '*' || current().text === '/')) {
        const operator = consume('operator').text;
        node = { type: 'binary', operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (match('operator', '-')) {
        return { type: 'unary', operator: '-', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = current();
      if (!token) {
        throw new Error('Unexpected end');
      }

      if (match('paren', '(')) {
        const node = parseExpression();
        consume('paren', ')');
        return node;
      }

      if (token.type === 'number') {
        consume('number');
        return { type: 'number', value: Number(token.text) };
      }

      if (token.type === 'string') {
        consume('string');
        return { type: 'string', value: token.text };
      }

      if (token.type === 'identifier') {
        consume('identifier');
        const upper = token.text.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE') {
          return { type: 'boolean', value: upper === 'TRUE' };
        }

        if (current() && current().type === 'paren' && current().text === '(') {
          consume('paren', '(');
          const args = [];
          if (!(current() && current().type === 'paren' && current().text === ')')) {
            do {
              args.push(parseExpression());
            } while (match('comma', ','));
          }
          consume('paren', ')');
          return { type: 'call', name: upper, args };
        }

        if (isCellReference(upper)) {
          const reference = parseReferenceToken(upper);
          if (match('colon', ':')) {
            const endToken = consume('identifier').text.toUpperCase();
            if (!isCellReference(endToken)) {
              throw new Error('Invalid range');
            }
            return { type: 'range', start: reference, end: parseReferenceToken(endToken) };
          }
          return { type: 'reference', reference };
        }
      }

      throw new Error('Unexpected token');
    }

    return {
      parseExpression,
      isDone() {
        return index >= tokens.length;
      },
    };
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
        let value = '';
        index += 1;
        while (index < source.length && source[index] !== '"') {
          value += source[index];
          index += 1;
        }
        if (source[index] !== '"') {
          throw new Error('Unterminated string');
        }
        index += 1;
        tokens.push({ type: 'string', text: value });
        continue;
      }
      if (/[0-9.]/.test(char)) {
        let value = char;
        index += 1;
        while (index < source.length && /[0-9.]/.test(source[index])) {
          value += source[index];
          index += 1;
        }
        tokens.push({ type: 'number', text: value });
        continue;
      }
      if (/[A-Za-z$]/.test(char)) {
        let value = char;
        index += 1;
        while (index < source.length && /[A-Za-z0-9$]/.test(source[index])) {
          value += source[index];
          index += 1;
        }
        tokens.push({ type: 'identifier', text: value });
        continue;
      }
      const pair = source.slice(index, index + 2);
      if (['<>', '<=', '>='].includes(pair)) {
        tokens.push({ type: 'operator', text: pair });
        index += 2;
        continue;
      }
      if ('+-*/&=<>'.includes(char)) {
        tokens.push({ type: 'operator', text: char });
        index += 1;
        continue;
      }
      if (char === '(' || char === ')') {
        tokens.push({ type: 'paren', text: char });
        index += 1;
        continue;
      }
      if (char === ',') {
        tokens.push({ type: 'comma', text: char });
        index += 1;
        continue;
      }
      if (char === ':') {
        tokens.push({ type: 'colon', text: char });
        index += 1;
        continue;
      }
      throw new Error(`Unexpected character ${char}`);
    }
    return tokens;
  }

  function isCellReference(token) {
    return /^\$?[A-Z]+\$?[1-9][0-9]*$/.test(token);
  }

  function parseReferenceToken(token) {
    const match = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(token);
    return {
      colAbsolute: Boolean(match[1]),
      col: lettersToColumn(match[2]),
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]),
    };
  }

  function referenceToAddress(reference) {
    return `${columnToLetters(reference.col)}${reference.row}`;
  }

  function evaluateNode(workbook, node, visiting) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'reference':
        return evaluateReference(workbook, node.reference, visiting);
      case 'range':
        return evaluateRange(workbook, node.start, node.end, visiting);
      case 'unary': {
        const value = evaluateNode(workbook, node.argument, visiting);
        if (isError(value)) {
          return value;
        }
        return -toNumber(value);
      }
      case 'binary':
        return evaluateBinary(workbook, node, visiting);
      case 'call':
        return evaluateCall(workbook, node, visiting);
      default:
        return { error: ERROR_GENERIC };
    }
  }

  function evaluateReference(workbook, reference, visiting) {
    const address = referenceToAddress(reference);
    const raw = workbook.getCell(address);
    const value = evaluateRaw(workbook, raw, address, visiting);
    if (raw === '') {
      return 0;
    }
    return value;
  }

  function evaluateRange(workbook, start, end, visiting) {
    const rowStart = Math.min(start.row, end.row);
    const rowEnd = Math.max(start.row, end.row);
    const colStart = Math.min(start.col, end.col);
    const colEnd = Math.max(start.col, end.col);
    const values = [];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        values.push(evaluateReference(workbook, { row, col }, visiting));
      }
    }
    return values;
  }

  function evaluateBinary(workbook, node, visiting) {
    const left = evaluateNode(workbook, node.left, visiting);
    const right = evaluateNode(workbook, node.right, visiting);
    if (isError(left)) {
      return left;
    }
    if (isError(right)) {
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
          return { error: ERROR_DIV_ZERO };
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
        return { error: ERROR_GENERIC };
    }
  }

  function compareValues(left, right) {
    if (typeof left === 'number' && typeof right === 'number') {
      return left === right ? 0 : left < right ? -1 : 1;
    }
    const leftText = toText(left);
    const rightText = toText(right);
    return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
  }

  function evaluateCall(workbook, node, visiting) {
    const values = node.args.map((arg) => evaluateNode(workbook, arg, visiting));
    const flat = flatten(values);
    if (flat.some(isError)) {
      return flat.find(isError);
    }

    switch (node.name) {
      case 'SUM':
        return flat.reduce((total, value) => total + toNumber(value), 0);
      case 'AVERAGE':
        return flat.length ? flat.reduce((total, value) => total + toNumber(value), 0) / flat.length : 0;
      case 'MIN':
        return flat.length ? Math.min(...flat.map(toNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max(...flat.map(toNumber)) : 0;
      case 'COUNT':
        return flat.filter((value) => !(value === '' || value == null)).length;
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
        return roundTo(toNumber(values[0]), values[1] == null ? 0 : toNumber(values[1]));
      case 'CONCAT':
        return flat.map(toText).join('');
      default:
        return { error: ERROR_GENERIC };
    }
  }

  function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function flatten(values) {
    return values.flatMap((value) => (Array.isArray(value) ? flatten(value) : [value]));
  }

  function toNumber(value) {
    if (isError(value)) {
      return value;
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
    return Number.isNaN(numeric) ? 0 : numeric;
  }

  function toText(value) {
    if (isError(value)) {
      return value.error;
    }
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
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
    if (value == null || value === '') {
      return false;
    }
    return String(value).toUpperCase() === 'TRUE' || Boolean(value);
  }

  function isError(value) {
    return value && typeof value === 'object' && typeof value.error === 'string';
  }

  function shiftFormulaForPaste(raw, rowDelta, colDelta) {
    if (!raw || raw[0] !== '=') {
      return raw;
    }
    return raw.replace(/\$?[A-Z]+\$?[1-9][0-9]*/g, (match) => {
      const reference = parseReferenceToken(match);
      const nextCol = reference.colAbsolute ? reference.col : reference.col + colDelta;
      const nextRow = reference.rowAbsolute ? reference.row : reference.row + rowDelta;
      if (nextCol < 1 || nextRow < 1) {
        return ERROR_REF;
      }
      return `${reference.colAbsolute ? '$' : ''}${columnToLetters(nextCol)}${reference.rowAbsolute ? '$' : ''}${nextRow}`;
    });
  }

  function transformStructure(cells, operation) {
    const nextCells = new Map();

    for (const [address, raw] of cells.entries()) {
      const parsed = parseAddress(address);
      const nextAddress = shiftAddressForStructure(parsed, operation);
      if (!nextAddress) {
        continue;
      }

      const rewritten = rewriteFormulaForStructure(raw, operation);
      if (rewritten !== '') {
        nextCells.set(formatAddress(nextAddress.row, nextAddress.col), rewritten);
      }
    }

    cells.clear();
    for (const [address, raw] of nextCells.entries()) {
      cells.set(address, raw);
    }
  }

  function shiftAddressForStructure(address, operation) {
    if (!address) {
      return null;
    }

    const next = { row: address.row, col: address.col };
    const axis = operation.kind === 'row' ? 'row' : 'col';
    const value = next[axis];
    const end = operation.index + operation.count - 1;

    if (operation.action === 'insert') {
      if (value >= operation.index) {
        next[axis] += operation.count;
      }
      return next;
    }

    if (value >= operation.index && value <= end) {
      return null;
    }
    if (value > end) {
      next[axis] -= operation.count;
    }
    return next;
  }

  function rewriteFormulaForStructure(raw, operation) {
    if (!raw || raw[0] !== '=') {
      return raw;
    }

    return raw.replace(/\$?[A-Z]+\$?[1-9][0-9]*/g, (match) => {
      const reference = parseReferenceToken(match);
      const adjusted = adjustReferenceForStructure(reference, operation);
      if (adjusted === ERROR_REF) {
        return ERROR_REF;
      }
      return `${reference.colAbsolute ? '$' : ''}${columnToLetters(adjusted.col)}${reference.rowAbsolute ? '$' : ''}${adjusted.row}`;
    });
  }

  function adjustReferenceForStructure(reference, operation) {
    const axis = operation.kind === 'row' ? 'row' : 'col';
    const end = operation.index + operation.count - 1;
    const value = reference[axis];
    const next = {
      row: reference.row,
      col: reference.col,
    };

    if (operation.action === 'insert') {
      if (value >= operation.index) {
        next[axis] += operation.count;
      }
      return next;
    }

    if (value >= operation.index && value <= end) {
      return ERROR_REF;
    }
    if (value > end) {
      next[axis] -= operation.count;
    }
    return next;
  }

  function getStorageKey(namespace, suffix) {
    return `${namespace}:${suffix}`;
  }

  const api = {
    createWorkbook,
    evaluateCellDisplay,
    shiftFormulaForPaste,
    getStorageKey,
    formatAddress,
    parseAddress,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
