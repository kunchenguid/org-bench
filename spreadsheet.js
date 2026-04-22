(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERROR = {
    CIRC: '#CIRC!',
    ERR: '#ERR!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
  };

  function createSheet(initialCells) {
    return {
      cells: Object.assign({}, initialCells || {}),
      history: {
        undoStack: [],
        redoStack: [],
      },
    };
  }

  function snapshotCells(sheet) {
    return Object.assign({}, sheet.cells);
  }

  function recordHistory(sheet) {
    sheet.history.undoStack.push(snapshotCells(sheet));
    if (sheet.history.undoStack.length > 50) {
      sheet.history.undoStack.shift();
    }
    sheet.history.redoStack = [];
  }

  function setCell(sheet, address, raw) {
    recordHistory(sheet);
    if (!raw) {
      delete sheet.cells[address];
      return;
    }
    sheet.cells[address] = String(raw);
  }

  function undo(sheet) {
    if (!sheet.history.undoStack.length) return false;
    sheet.history.redoStack.push(snapshotCells(sheet));
    sheet.cells = sheet.history.undoStack.pop();
    return true;
  }

  function redo(sheet) {
    if (!sheet.history.redoStack.length) return false;
    sheet.history.undoStack.push(snapshotCells(sheet));
    sheet.cells = sheet.history.redoStack.pop();
    return true;
  }

  function insertRow(sheet, rowIndex) {
    recordHistory(sheet);
    const nextCells = {};
    const addresses = Object.keys(sheet.cells).sort(compareAddressesDescending);
    for (let i = 0; i < addresses.length; i += 1) {
      const address = addresses[i];
      const position = splitAddress(address);
      const targetAddress = position.row >= rowIndex ? makeAddress(position.col, position.row + 1) : address;
      nextCells[targetAddress] = rewriteFormulaForStructureChange(sheet.cells[address], { type: 'row-insert', index: rowIndex });
    }
    sheet.cells = nextCells;
  }

  function deleteRow(sheet, rowIndex) {
    recordHistory(sheet);
    const nextCells = {};
    const addresses = Object.keys(sheet.cells).sort(compareAddressesAscending);
    for (let i = 0; i < addresses.length; i += 1) {
      const address = addresses[i];
      const position = splitAddress(address);
      if (position.row === rowIndex) continue;
      const targetAddress = position.row > rowIndex ? makeAddress(position.col, position.row - 1) : address;
      nextCells[targetAddress] = rewriteFormulaForStructureChange(sheet.cells[address], { type: 'row-delete', index: rowIndex });
    }
    sheet.cells = nextCells;
  }

  function insertColumn(sheet, columnIndex) {
    recordHistory(sheet);
    const nextCells = {};
    const addresses = Object.keys(sheet.cells).sort(compareAddressesDescending);
    for (let i = 0; i < addresses.length; i += 1) {
      const address = addresses[i];
      const position = splitAddress(address);
      const targetAddress = position.col >= columnIndex ? makeAddress(position.col + 1, position.row) : address;
      nextCells[targetAddress] = rewriteFormulaForStructureChange(sheet.cells[address], { type: 'column-insert', index: columnIndex });
    }
    sheet.cells = nextCells;
  }

  function deleteColumn(sheet, columnIndex) {
    recordHistory(sheet);
    const nextCells = {};
    const addresses = Object.keys(sheet.cells).sort(compareAddressesAscending);
    for (let i = 0; i < addresses.length; i += 1) {
      const address = addresses[i];
      const position = splitAddress(address);
      if (position.col === columnIndex) continue;
      const targetAddress = position.col > columnIndex ? makeAddress(position.col - 1, position.row) : address;
      nextCells[targetAddress] = rewriteFormulaForStructureChange(sheet.cells[address], { type: 'column-delete', index: columnIndex });
    }
    sheet.cells = nextCells;
  }

  function getCellRaw(sheet, address) {
    return sheet.cells[address] || '';
  }

  function getCellDisplay(sheet, address) {
    return formatValue(evaluateCell(sheet, address, {}));
  }

  function evaluateCell(sheet, address, state) {
    if (!state.memo) state.memo = {};
    if (!state.stack) state.stack = [];
    if (Object.prototype.hasOwnProperty.call(state.memo, address)) return state.memo[address];
    if (state.stack.indexOf(address) !== -1) return makeError(ERROR.CIRC);

    state.stack.push(address);
    const raw = getCellRaw(sheet, address);
    let value;
    if (!raw) {
      value = null;
    } else if (raw[0] === '=') {
      try {
        if (raw.indexOf('#REF!') !== -1) return makeError(ERROR.REF);
        value = evaluateNode(sheet, parseFormula(raw.slice(1)), state);
      } catch (error) {
        value = makeError(error && error.code ? error.code : ERROR.ERR);
      }
    } else {
      value = parseLiteral(raw);
    }
    state.stack.pop();
    state.memo[address] = value;
    return value;
  }

  function parseLiteral(raw) {
    const trimmed = raw.trim();
    if (trimmed === 'TRUE') return true;
    if (trimmed === 'FALSE') return false;
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return raw;
  }

  function parseFormula(source) {
    const tokens = tokenize(source);
    let index = 0;

    function peek() { return tokens[index]; }
    function consume(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (value && token.value !== value)) throw { code: ERROR.ERR };
      index += 1;
      return token;
    }
    function parseExpression() { return parseComparison(); }
    function parseComparison() {
      let node = parseConcat();
      while (peek() && peek().type === 'operator' && /^(=|<>|<=|>=|<|>)$/.test(peek().value)) {
        node = { type: 'binary', operator: consume('operator').value, left: node, right: parseConcat() };
      }
      return node;
    }
    function parseConcat() {
      let node = parseAdditive();
      while (peek() && peek().type === 'operator' && peek().value === '&') {
        consume('operator', '&');
        node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
      }
      return node;
    }
    function parseAdditive() {
      let node = parseMultiplicative();
      while (peek() && peek().type === 'operator' && /^(\+|-)$/.test(peek().value)) {
        node = { type: 'binary', operator: consume('operator').value, left: node, right: parseMultiplicative() };
      }
      return node;
    }
    function parseMultiplicative() {
      let node = parseUnary();
      while (peek() && peek().type === 'operator' && /^(\*|\/)$/.test(peek().value)) {
        node = { type: 'binary', operator: consume('operator').value, left: node, right: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (peek() && peek().type === 'operator' && peek().value === '-') {
        consume('operator', '-');
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }
    function parsePrimary() {
      const token = peek();
      if (!token) throw { code: ERROR.ERR };
      if (token.type === 'number') {
        consume('number');
        return { type: 'literal', value: Number(token.value) };
      }
      if (token.type === 'string') {
        consume('string');
        return { type: 'literal', value: token.value };
      }
      if (token.type === 'boolean') {
        consume('boolean');
        return { type: 'literal', value: token.value === 'TRUE' };
      }
      if (token.type === 'paren' && token.value === '(') {
        consume('paren', '(');
        const node = parseExpression();
        consume('paren', ')');
        return node;
      }
      if (token.type === 'identifier' || token.type === 'cell') {
        const item = parseIdentifierLike();
        if (peek() && peek().type === 'operator' && peek().value === ':') {
          consume('operator', ':');
          return { type: 'range', start: item, end: parseIdentifierLike() };
        }
        return item;
      }
      throw { code: ERROR.ERR };
    }
    function parseIdentifierLike() {
      const token = peek();
      if (!token) throw { code: ERROR.ERR };
      if (token.type === 'cell') {
        consume('cell');
        return { type: 'cell', ref: token.value };
      }
      if (token.type === 'identifier') {
        const name = consume('identifier').value;
        if (peek() && peek().type === 'paren' && peek().value === '(') {
          consume('paren', '(');
          const args = [];
          if (!(peek() && peek().type === 'paren' && peek().value === ')')) {
            do {
              args.push(parseExpression());
              if (!(peek() && peek().type === 'comma')) break;
              consume('comma');
            } while (true);
          }
          consume('paren', ')');
          return { type: 'call', name, args };
        }
      }
      throw { code: ERROR.ERR };
    }

    const ast = parseExpression();
    if (index !== tokens.length) throw { code: ERROR.ERR };
    return ast;
  }

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const char = source[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }
      if (char === '"') {
        let value = '';
        i += 1;
        while (i < source.length && source[i] !== '"') {
          value += source[i];
          i += 1;
        }
        if (source[i] !== '"') throw { code: ERROR.ERR };
        i += 1;
        tokens.push({ type: 'string', value });
        continue;
      }
      if (/[0-9.]/.test(char)) {
        let value = char;
        i += 1;
        while (i < source.length && /[0-9.]/.test(source[i])) {
          value += source[i];
          i += 1;
        }
        tokens.push({ type: 'number', value });
        continue;
      }
      if (/[A-Za-z$]/.test(char)) {
        let value = char;
        i += 1;
        while (i < source.length && /[A-Za-z0-9$]/.test(source[i])) {
          value += source[i];
          i += 1;
        }
        const normalized = value.toUpperCase();
        if (normalized === 'TRUE' || normalized === 'FALSE') {
          tokens.push({ type: 'boolean', value: normalized });
          continue;
        }
        if (/^\$?[A-Z]+\$?[1-9][0-9]*$/.test(normalized)) {
          tokens.push({ type: 'cell', value: normalized });
          continue;
        }
        tokens.push({ type: 'identifier', value: normalized });
        continue;
      }
      const twoChar = source.slice(i, i + 2);
      if (/^(<=|>=|<>)$/.test(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        i += 2;
        continue;
      }
      if ('+-*/&:=<>'.indexOf(char) !== -1) {
        tokens.push({ type: 'operator', value: char });
        i += 1;
        continue;
      }
      if (char === '(' || char === ')') {
        tokens.push({ type: 'paren', value: char });
        i += 1;
        continue;
      }
      if (char === ',') {
        tokens.push({ type: 'comma', value: char });
        i += 1;
        continue;
      }
      throw { code: ERROR.ERR };
    }
    return tokens;
  }

  function evaluateNode(sheet, node, state) {
    if (node.type === 'literal') return node.value;
    if (node.type === 'cell') return evaluateReference(sheet, node.ref, state);
    if (node.type === 'range') return expandRange(sheet, node, state);
    if (node.type === 'unary') {
      const value = evaluateNode(sheet, node.value, state);
      return isError(value) ? value : -coerceNumber(value);
    }
    if (node.type === 'binary') {
      const left = evaluateNode(sheet, node.left, state);
      if (isError(left)) return left;
      const right = evaluateNode(sheet, node.right, state);
      if (isError(right)) return right;
      return evaluateBinary(node.operator, left, right);
    }
    if (node.type === 'call') return callFunction(sheet, node.name, node.args, state);
    return makeError(ERROR.ERR);
  }

  function evaluateBinary(operator, left, right) {
    if (operator === '+') return coerceNumber(left) + coerceNumber(right);
    if (operator === '-') return coerceNumber(left) - coerceNumber(right);
    if (operator === '*') return coerceNumber(left) * coerceNumber(right);
    if (operator === '/') {
      const divisor = coerceNumber(right);
      if (divisor === 0) return makeError(ERROR.DIV0);
      return coerceNumber(left) / divisor;
    }
    if (operator === '&') return stringifyValue(left) + stringifyValue(right);
    if (operator === '=') return compareValues(left, right) === 0;
    if (operator === '<>') return compareValues(left, right) !== 0;
    if (operator === '<') return compareValues(left, right) < 0;
    if (operator === '<=') return compareValues(left, right) <= 0;
    if (operator === '>') return compareValues(left, right) > 0;
    if (operator === '>=') return compareValues(left, right) >= 0;
    return makeError(ERROR.ERR);
  }

  function callFunction(sheet, name, args, state) {
    const values = args.map(function (arg) { return evaluateNode(sheet, arg, state); });
    for (let i = 0; i < values.length; i += 1) if (isError(values[i])) return values[i];
    const flat = flattenValues(values);
    if (name === 'SUM') return flat.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0);
    if (name === 'AVERAGE') return flat.length ? flat.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) / flat.length : 0;
    if (name === 'MIN') return flat.length ? Math.min.apply(Math, flat.map(coerceNumber)) : 0;
    if (name === 'MAX') return flat.length ? Math.max.apply(Math, flat.map(coerceNumber)) : 0;
    if (name === 'COUNT') return flat.filter(function (value) { return value !== null && value !== ''; }).length;
    if (name === 'IF') return coerceBoolean(values[0]) ? values[1] : values[2];
    if (name === 'AND') return flat.every(coerceBoolean);
    if (name === 'OR') return flat.some(coerceBoolean);
    if (name === 'NOT') return !coerceBoolean(values[0]);
    if (name === 'ABS') return Math.abs(coerceNumber(values[0]));
    if (name === 'ROUND') {
      const places = coerceNumber(values[1] || 0);
      const factor = Math.pow(10, places);
      return Math.round(coerceNumber(values[0]) * factor) / factor;
    }
    if (name === 'CONCAT') return flat.map(stringifyValue).join('');
    return makeError(ERROR.ERR);
  }

  function evaluateReference(sheet, ref, state) {
    const normalized = normalizeReference(ref);
    return normalized ? evaluateCell(sheet, normalized, state) : makeError(ERROR.REF);
  }

  function expandRange(sheet, node, state) {
    const start = splitAddress(node.start.ref);
    const end = splitAddress(node.end.ref);
    if (!start || !end) return makeError(ERROR.REF);
    const values = [];
    for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
      for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col += 1) {
        values.push(evaluateCell(sheet, makeAddress(col, row), state));
      }
    }
    return values;
  }

  function compareValues(left, right) {
    if (typeof left === 'number' || typeof right === 'number') {
      const diff = coerceNumber(left) - coerceNumber(right);
      return diff === 0 ? 0 : diff < 0 ? -1 : 1;
    }
    const a = stringifyValue(left);
    const b = stringifyValue(right);
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  function flattenValues(values) {
    return values.reduce(function (list, value) {
      if (Array.isArray(value)) return list.concat(value);
      list.push(value);
      return list;
    }, []);
  }

  function coerceNumber(value) {
    if (value === null || value === '') return 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function coerceBoolean(value) {
    if (value === null || value === '') return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return String(value).length > 0;
  }

  function stringifyValue(value) {
    if (value === null) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    if (Array.isArray(value)) return value.map(stringifyValue).join(',');
    if (isError(value)) return value.code;
    return String(value);
  }

  function formatValue(value) {
    return isError(value) ? value.code : stringifyValue(value);
  }

  function makeError(code) { return { __error: true, code: code || ERROR.ERR }; }
  function isError(value) { return !!(value && value.__error); }
  function normalizeReference(ref) {
    const split = splitAddress(ref);
    return split ? makeAddress(split.col, split.row) : null;
  }
  function rewriteFormulaForStructureChange(raw, operation) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)([1-9][0-9]*)/g, function (_, absCol, colLabel, absRow, rowValue) {
      const reference = { col: columnToIndex(colLabel), row: Number(rowValue) };
      if (operation.type === 'row-insert') {
        if (reference.row >= operation.index) reference.row += 1;
      } else if (operation.type === 'row-delete') {
        if (reference.row === operation.index) return '#REF!';
        if (reference.row > operation.index) reference.row -= 1;
      } else if (operation.type === 'column-insert') {
        if (reference.col >= operation.index) reference.col += 1;
      } else if (operation.type === 'column-delete') {
        if (reference.col === operation.index) return '#REF!';
        if (reference.col > operation.index) reference.col -= 1;
      }
      return (absCol || '') + indexToColumn(reference.col) + (absRow || '') + String(reference.row);
    });
  }
  function compareAddressesAscending(left, right) {
    const a = splitAddress(left);
    const b = splitAddress(right);
    return a.row - b.row || a.col - b.col;
  }
  function compareAddressesDescending(left, right) {
    return compareAddressesAscending(right, left);
  }
  function splitAddress(ref) {
    const match = /^\$?([A-Z]+)\$?([1-9][0-9]*)$/.exec(String(ref).toUpperCase());
    return match ? { col: columnToIndex(match[1]), row: Number(match[2]) } : null;
  }
  function makeAddress(col, row) { return indexToColumn(col) + String(row); }
  function columnToIndex(label) {
    let value = 0;
    for (let i = 0; i < label.length; i += 1) value = value * 26 + (label.charCodeAt(i) - 64);
    return value;
  }
  function indexToColumn(index) {
    let value = index;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  return {
    ERROR: ERROR,
    createSheet: createSheet,
    setCell: setCell,
    insertRow: insertRow,
    deleteRow: deleteRow,
    insertColumn: insertColumn,
    deleteColumn: deleteColumn,
    undo: undo,
    redo: redo,
    getCellRaw: getCellRaw,
    getCellDisplay: getCellDisplay,
    evaluateCell: evaluateCell,
    splitAddress: splitAddress,
    makeAddress: makeAddress,
    columnToIndex: columnToIndex,
    indexToColumn: indexToColumn,
  };
});
