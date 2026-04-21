(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SpreadsheetApp = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const ERROR_REF = '#REF!';
  const ERROR_CIRC = '#CIRC!';
  const ERROR_DIV0 = '#DIV/0!';
  const ERROR_ERR = '#ERR!';

  function colToName(index) {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function nameToCol(name) {
    let result = 0;
    for (let i = 0; i < name.length; i += 1) {
      result = result * 26 + (name.charCodeAt(i) - 64);
    }
    return result - 1;
  }

  function addressFromCoords(row, col) {
    return colToName(col) + String(row + 1);
  }

  function parseAddress(address) {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    if (!match) {
      throw new Error('Bad address: ' + address);
    }
    return { row: Number(match[2]) - 1, col: nameToCol(match[1]) };
  }

  function createWorkbook(cols, rows) {
    return {
      cols: cols || DEFAULT_COLS,
      rows: rows || DEFAULT_ROWS,
      cells: {},
      active: { row: 0, col: 0 },
      selection: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      history: [],
      future: [],
      internalClipboard: null,
    };
  }

  function cloneSnapshot(workbook) {
    return {
      rows: workbook.rows,
      cols: workbook.cols,
      cells: JSON.parse(JSON.stringify(workbook.cells)),
      active: { row: workbook.active.row, col: workbook.active.col },
      selection: {
        startRow: workbook.selection.startRow,
        endRow: workbook.selection.endRow,
        startCol: workbook.selection.startCol,
        endCol: workbook.selection.endCol,
      },
    };
  }

  function restoreSnapshot(workbook, snapshot) {
    workbook.rows = snapshot.rows;
    workbook.cols = snapshot.cols;
    workbook.cells = JSON.parse(JSON.stringify(snapshot.cells));
    workbook.active = { row: snapshot.active.row, col: snapshot.active.col };
    workbook.selection = {
      startRow: snapshot.selection.startRow,
      endRow: snapshot.selection.endRow,
      startCol: snapshot.selection.startCol,
      endCol: snapshot.selection.endCol,
    };
  }

  function pushHistory(workbook) {
    workbook.history.push(cloneSnapshot(workbook));
    if (workbook.history.length > 50) {
      workbook.history.shift();
    }
    workbook.future = [];
  }

  function setSelection(workbook, selection) {
    workbook.selection = normalizeRange(selection);
    workbook.active = { row: selection.endRow, col: selection.endCol };
  }

  function normalizeRange(range) {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      endRow: Math.max(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endCol: Math.max(range.startCol, range.endCol),
    };
  }

  function setCellRaw(workbook, addressOrString, raw) {
    const address = typeof addressOrString === 'string'
      ? addressOrString
      : addressFromCoords(addressOrString.row, addressOrString.col);
    const value = raw == null ? '' : String(raw);
    if (!value) {
      delete workbook.cells[address];
      return;
    }
    workbook.cells[address] = { raw: value };
  }

  function getCellRaw(workbook, row, col) {
    const cell = workbook.cells[addressFromCoords(row, col)];
    return cell ? cell.raw : '';
  }

  function getCellDisplay(workbook, address) {
    const evaluation = evaluateCell(workbook, address, {}, []);
    return formatDisplay(evaluation);
  }

  function formatDisplay(result) {
    if (result && result.error) {
      return result.error;
    }
    if (Array.isArray(result.value)) {
      return '';
    }
    if (typeof result.value === 'boolean') {
      return result.value ? 'TRUE' : 'FALSE';
    }
    if (typeof result.value === 'number') {
      if (!Number.isFinite(result.value)) {
        return ERROR_ERR;
      }
      return String(Number(result.value.toFixed(10))).replace(/\.0+$/, '');
    }
    return result.value == null ? '' : String(result.value);
  }

  function evaluateCell(workbook, address, memo, stack) {
    if (memo[address]) {
      return memo[address];
    }
    if (stack.indexOf(address) !== -1) {
      memo[address] = { error: ERROR_CIRC };
      return memo[address];
    }
    const cell = workbook.cells[address];
    if (!cell || !cell.raw) {
      memo[address] = { value: '' };
      return memo[address];
    }
    if (cell.raw.charAt(0) !== '=') {
      memo[address] = parseLiteralValue(cell.raw);
      return memo[address];
    }

    const tokens = tokenize(cell.raw.slice(1));
    if (!tokens) {
      memo[address] = { error: ERROR_ERR };
      return memo[address];
    }

    const parser = createParser(tokens);
    let ast;
    try {
      ast = parser.parseExpression();
      if (!parser.isDone()) {
        memo[address] = { error: ERROR_ERR };
        return memo[address];
      }
    } catch (error) {
      memo[address] = { error: ERROR_ERR };
      return memo[address];
    }

    const nextStack = stack.concat(address);
    memo[address] = evaluateAst(workbook, ast, memo, nextStack);
    return memo[address];
  }

  function parseLiteralValue(raw) {
    const trimmed = raw.trim();
    if (trimmed === 'TRUE') {
      return { value: true };
    }
    if (trimmed === 'FALSE') {
      return { value: false };
    }
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
      return { value: Number(trimmed) };
    }
    return { value: raw };
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const char = source.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      const pair = source.slice(index, index + 2);
      if (pair === '<=' || pair === '>=' || pair === '<>') {
        tokens.push({ type: 'operator', value: pair });
        index += 2;
        continue;
      }
      if ('+-*/&=<>():,'.indexOf(char) !== -1) {
        if (char === '(' || char === ')') {
          tokens.push({ type: char === '(' ? 'lparen' : 'rparen', value: char });
        } else if (char === ',') {
          tokens.push({ type: 'comma', value: char });
        } else if (char === ':') {
          tokens.push({ type: 'colon', value: char });
        } else {
          tokens.push({ type: 'operator', value: char });
        }
        index += 1;
        continue;
      }
      if (char === '"') {
        let value = '';
        index += 1;
        while (index < source.length && source.charAt(index) !== '"') {
          value += source.charAt(index);
          index += 1;
        }
        if (source.charAt(index) !== '"') {
          return null;
        }
        tokens.push({ type: 'string', value: value });
        index += 1;
        continue;
      }
      if (source.slice(index, index + 5) === '#REF!') {
        tokens.push({ type: 'error', value: ERROR_REF });
        index += 5;
        continue;
      }
      const numberMatch = /^\d+(?:\.\d+)?/.exec(source.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const identifierMatch = /^\$?[A-Z]+\$?\d+|^[A-Z_]+/.exec(source.slice(index));
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0] });
        index += identifierMatch[0].length;
        continue;
      }
      return null;
    }
    return tokens;
  }

  function createParser(tokens) {
    let position = 0;
    return {
      parseExpression: parseComparison,
      isDone: function () {
        return position >= tokens.length;
      },
    };

    function parseExpression() {
      return parseComparison();
    }

    function peek(offset) {
      return tokens[position + (offset || 0)];
    }

    function take(type, value) {
      const token = peek();
      if (!token || token.type !== type || (value && token.value !== value)) {
        return null;
      }
      position += 1;
      return token;
    }

    function expect(type, value) {
      const token = take(type, value);
      if (!token) {
        throw new Error('Unexpected token');
      }
      return token;
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek() && peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].indexOf(peek().value) !== -1) {
        const operator = take('operator').value;
        node = { type: 'binary', operator: operator, left: node, right: parseConcat() };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAdditive();
      while (peek() && peek().type === 'operator' && peek().value === '&') {
        take('operator', '&');
        node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
        const operator = take('operator').value;
        node = { type: 'binary', operator: operator, left: node, right: parseMultiplicative() };
      }
      return node;
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (peek() && peek().type === 'operator' && (peek().value === '*' || peek().value === '/')) {
        const operator = take('operator').value;
        node = { type: 'binary', operator: operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (peek() && peek().type === 'operator' && peek().value === '-') {
        take('operator', '-');
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      if (take('lparen')) {
        const expression = parseExpression();
        expect('rparen');
        return expression;
      }

      const errorToken = take('error');
      if (errorToken) {
        return { type: 'error', value: errorToken.value };
      }

      const number = take('number');
      if (number) {
        return { type: 'literal', value: number.value };
      }

      const string = take('string');
      if (string) {
        return { type: 'literal', value: string.value };
      }

      const identifier = take('identifier');
      if (identifier) {
        const upper = identifier.value.toUpperCase();
        if (take('lparen')) {
          const args = [];
          if (!take('rparen')) {
            do {
              args.push(parseExpression());
            } while (take('comma'));
            expect('rparen');
          }
          return { type: 'function', name: upper, args: args };
        }
        if (upper === 'TRUE' || upper === 'FALSE') {
          return { type: 'literal', value: upper === 'TRUE' };
        }
        if (/^\$?[A-Z]+\$?\d+$/.test(identifier.value)) {
          const ref = { type: 'ref', ref: parseRefToken(identifier.value) };
          if (take('colon')) {
            const endToken = expect('identifier');
            if (!/^\$?[A-Z]+\$?\d+$/.test(endToken.value)) {
              throw new Error('Bad range');
            }
            return { type: 'range', start: ref.ref, end: parseRefToken(endToken.value) };
          }
          return ref;
        }
      }

      throw new Error('Unexpected end');
    }
  }

  function parseRefToken(token) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(token);
    return {
      colAbsolute: match[1] === '$',
      col: nameToCol(match[2]),
      rowAbsolute: match[3] === '$',
      row: Number(match[4]) - 1,
    };
  }

  function refTokenToString(ref) {
    return (ref.colAbsolute ? '$' : '') + colToName(ref.col) + (ref.rowAbsolute ? '$' : '') + String(ref.row + 1);
  }

  function evaluateAst(workbook, node, memo, stack) {
    if (node.type === 'error') {
      return { error: node.value };
    }
    if (node.type === 'literal') {
      return { value: node.value };
    }
    if (node.type === 'ref') {
      if (node.ref.row < 0 || node.ref.col < 0 || node.ref.row >= workbook.rows || node.ref.col >= workbook.cols) {
        return { error: ERROR_REF };
      }
      return evaluateCell(workbook, addressFromCoords(node.ref.row, node.ref.col), memo, stack);
    }
    if (node.type === 'range') {
      return evaluateRange(workbook, node, memo, stack);
    }
    if (node.type === 'unary') {
      const value = evaluateAst(workbook, node.value, memo, stack);
      if (value.error) {
        return value;
      }
      return { value: -coerceNumber(value.value) };
    }
    if (node.type === 'binary') {
      return evaluateBinary(workbook, node, memo, stack);
    }
    if (node.type === 'function') {
      return evaluateFunction(workbook, node, memo, stack);
    }
    return { error: ERROR_ERR };
  }

  function evaluateRange(workbook, node, memo, stack) {
    const startRow = Math.min(node.start.row, node.end.row);
    const endRow = Math.max(node.start.row, node.end.row);
    const startCol = Math.min(node.start.col, node.end.col);
    const endCol = Math.max(node.start.col, node.end.col);
    const values = [];
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const cell = evaluateCell(workbook, addressFromCoords(row, col), memo, stack);
        if (cell.error) {
          return cell;
        }
        values.push(cell.value);
      }
    }
    return { value: values };
  }

  function evaluateBinary(workbook, node, memo, stack) {
    const left = evaluateAst(workbook, node.left, memo, stack);
    const right = evaluateAst(workbook, node.right, memo, stack);
    if (left.error) {
      return left;
    }
    if (right.error) {
      return right;
    }
    if (node.operator === '&') {
      return { value: coerceText(left.value) + coerceText(right.value) };
    }
    if (node.operator === '+') {
      return { value: coerceNumber(left.value) + coerceNumber(right.value) };
    }
    if (node.operator === '-') {
      return { value: coerceNumber(left.value) - coerceNumber(right.value) };
    }
    if (node.operator === '*') {
      return { value: coerceNumber(left.value) * coerceNumber(right.value) };
    }
    if (node.operator === '/') {
      if (coerceNumber(right.value) === 0) {
        return { error: ERROR_DIV0 };
      }
      return { value: coerceNumber(left.value) / coerceNumber(right.value) };
    }
    return { value: compareValues(node.operator, left.value, right.value) };
  }

  function compareValues(operator, left, right) {
    const a = comparableValue(left);
    const b = comparableValue(right);
    if (operator === '=') {
      return a === b;
    }
    if (operator === '<>') {
      return a !== b;
    }
    if (operator === '<') {
      return a < b;
    }
    if (operator === '<=') {
      return a <= b;
    }
    if (operator === '>') {
      return a > b;
    }
    return a >= b;
  }

  function evaluateFunction(workbook, node, memo, stack) {
    const args = [];
    for (let i = 0; i < node.args.length; i += 1) {
      const value = evaluateAst(workbook, node.args[i], memo, stack);
      if (value.error) {
        return value;
      }
      args.push(value.value);
    }
    const flat = flattenValues(args);
    switch (node.name) {
      case 'SUM':
        return { value: flat.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) };
      case 'AVERAGE':
        return { value: flat.length ? flat.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) / flat.length : 0 };
      case 'MIN':
        return { value: flat.length ? Math.min.apply(null, flat.map(coerceNumber)) : 0 };
      case 'MAX':
        return { value: flat.length ? Math.max.apply(null, flat.map(coerceNumber)) : 0 };
      case 'COUNT':
        return { value: flat.filter(function (value) { return value !== '' && !Number.isNaN(Number(value)); }).length };
      case 'IF':
        return { value: truthy(args[0]) ? (args.length > 1 ? args[1] : '') : (args.length > 2 ? args[2] : '') };
      case 'AND':
        return { value: flat.every(truthy) };
      case 'OR':
        return { value: flat.some(truthy) };
      case 'NOT':
        return { value: !truthy(args[0]) };
      case 'ABS':
        return { value: Math.abs(coerceNumber(args[0])) };
      case 'ROUND':
        return { value: roundNumber(coerceNumber(args[0]), args.length > 1 ? coerceNumber(args[1]) : 0) };
      case 'CONCAT':
        return { value: flat.map(coerceText).join('') };
      default:
        return { error: ERROR_ERR };
    }
  }

  function flattenValues(values) {
    const result = [];
    for (let i = 0; i < values.length; i += 1) {
      if (Array.isArray(values[i])) {
        result.push.apply(result, flattenValues(values[i]));
      } else {
        result.push(values[i]);
      }
    }
    return result;
  }

  function comparableValue(value) {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '') {
      return 0;
    }
    if (!Number.isNaN(Number(value)) && value !== '') {
      return Number(value);
    }
    return String(value);
  }

  function coerceNumber(value) {
    if (Array.isArray(value)) {
      return coerceNumber(value[0] || 0);
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '' || value == null) {
      return 0;
    }
    const number = Number(value);
    return Number.isNaN(number) ? 0 : number;
  }

  function coerceText(value) {
    if (Array.isArray(value)) {
      return value.map(coerceText).join('');
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return value == null ? '' : String(value);
  }

  function truthy(value) {
    if (Array.isArray(value)) {
      return value.some(truthy);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === '' || value == null) {
      return false;
    }
    if (!Number.isNaN(Number(value))) {
      return Number(value) !== 0;
    }
    return Boolean(value);
  }

  function roundNumber(value, digits) {
    const scale = Math.pow(10, digits);
    return Math.round(value * scale) / scale;
  }

  function serializeSelection(workbook, range) {
    const rows = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      const values = [];
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        values.push(getCellRaw(workbook, row, col));
      }
      rows.push(values.join('\t'));
    }
    return rows.join('\n');
  }

  function copySelection(workbook, range, storeClipboard) {
    const normalized = normalizeRange(range);
    const matrix = [];
    for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
      const values = [];
      for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
        values.push(getCellRaw(workbook, row, col));
      }
      matrix.push(values);
    }
    const clip = {
      text: serializeSelection(workbook, normalized),
      matrix: matrix,
      sourceRange: normalized,
      internal: !!storeClipboard,
      isCut: false,
    };
    if (storeClipboard) {
      workbook.internalClipboard = clip;
    }
    return clip;
  }

  function pasteSelection(workbook, clip, target) {
    const matrix = clip.matrix || parseTextMatrix(clip.text || '');
    const rowCount = matrix.length;
    const colCount = rowCount ? matrix[0].length : 0;
    const source = clip.sourceRange || { startRow: target.row, startCol: target.col };
    for (let row = 0; row < rowCount; row += 1) {
      for (let col = 0; col < colCount; col += 1) {
        const destRow = target.row + row;
        const destCol = target.col + col;
        if (destRow >= workbook.rows || destCol >= workbook.cols) {
          continue;
        }
        const raw = matrix[row][col] || '';
        const shifted = clip.internal && raw.charAt(0) === '='
          ? shiftFormula(raw, destRow - (source.startRow + row), destCol - (source.startCol + col))
          : raw;
        setCellRaw(workbook, { row: destRow, col: destCol }, shifted);
      }
    }
    if (clip.isCut && clip.sourceRange) {
      clearRange(workbook, clip.sourceRange);
      clip.isCut = false;
    }
  }

  function parseTextMatrix(text) {
    if (!text) {
      return [['']];
    }
    return text.split(/\r?\n/).map(function (line) {
      return line.split('\t');
    });
  }

  function clearRange(workbook, range) {
    const normalized = normalizeRange(range);
    for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
      for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
        delete workbook.cells[addressFromCoords(row, col)];
      }
    }
  }

  function shiftFormula(raw, rowOffset, colOffset) {
    return rewriteFormula(raw, function (ref) {
      return {
        col: ref.colAbsolute ? ref.col : ref.col + colOffset,
        row: ref.rowAbsolute ? ref.row : ref.row + rowOffset,
        colAbsolute: ref.colAbsolute,
        rowAbsolute: ref.rowAbsolute,
      };
    });
  }

  function rewriteFormula(raw, transform) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }
    let result = '=';
    let index = 1;
    while (index < raw.length) {
      const char = raw.charAt(index);
      if (char === '"') {
        result += char;
        index += 1;
        while (index < raw.length) {
          result += raw.charAt(index);
          if (raw.charAt(index) === '"') {
            index += 1;
            break;
          }
          index += 1;
        }
        continue;
      }
      const match = /^(\$?[A-Z]+\$?\d+)/.exec(raw.slice(index));
      if (match) {
        const transformed = transform(parseRefToken(match[1]));
        result += typeof transformed === 'string' ? transformed : refTokenToString(transformed);
        index += match[1].length;
        continue;
      }
      result += char;
      index += 1;
    }
    return result;
  }

  function moveCells(workbook, axis, startIndex, amount, affectedIndex, count) {
    const moved = {};
    Object.keys(workbook.cells).forEach(function (address) {
      const coords = parseAddress(address);
      if (axis === 'row' && coords.row >= startIndex) {
        coords.row += amount;
      }
      if (axis === 'col' && coords.col >= startIndex) {
        coords.col += amount;
      }
      if (coords.row < 0 || coords.col < 0 || coords.row >= workbook.rows || coords.col >= workbook.cols) {
        return;
      }
      moved[addressFromCoords(coords.row, coords.col)] = workbook.cells[address];
    });
    workbook.cells = moved;
    Object.keys(workbook.cells).forEach(function (address) {
      const cell = workbook.cells[address];
      if (cell.raw && cell.raw.charAt(0) === '=') {
        cell.raw = rewriteFormula(cell.raw, function (ref) {
        const next = {
          row: ref.row,
          col: ref.col,
            rowAbsolute: ref.rowAbsolute,
            colAbsolute: ref.colAbsolute,
        };
        if (axis === 'row') {
          if (amount > 0 && ref.row >= affectedIndex) {
            next.row += amount;
          }
          if (amount < 0) {
            const removedStart = affectedIndex;
            const removedEnd = affectedIndex + count - 1;
            if (ref.row >= removedStart && ref.row <= removedEnd) {
              return ERROR_REF;
            }
              if (ref.row > removedEnd) {
                next.row += amount;
              }
          }
        } else {
          if (amount > 0 && ref.col >= affectedIndex) {
            next.col += amount;
          }
          if (amount < 0) {
            const removedStart = affectedIndex;
            const removedEnd = affectedIndex + count - 1;
            if (ref.col >= removedStart && ref.col <= removedEnd) {
              return ERROR_REF;
            }
              if (ref.col > removedEnd) {
                next.col += amount;
              }
            }
          }
          return next;
        });
      }
    });
  }

  function insertRow(workbook, index, count) {
    workbook.rows += count;
    moveCells(workbook, 'row', index, count, index, count);
  }

  function deleteRow(workbook, index, count) {
    Object.keys(workbook.cells).forEach(function (address) {
      const coords = parseAddress(address);
      if (coords.row >= index && coords.row < index + count) {
        delete workbook.cells[address];
      }
    });
    moveCells(workbook, 'row', index + count, -count, index, count);
    workbook.rows = Math.max(1, workbook.rows - count);
  }

  function insertColumn(workbook, index, count) {
    workbook.cols += count;
    moveCells(workbook, 'col', index, count, index, count);
  }

  function deleteColumn(workbook, index, count) {
    Object.keys(workbook.cells).forEach(function (address) {
      const coords = parseAddress(address);
      if (coords.col >= index && coords.col < index + count) {
        delete workbook.cells[address];
      }
    });
    moveCells(workbook, 'col', index + count, -count, index, count);
    workbook.cols = Math.max(1, workbook.cols - count);
  }

  function cellDisplayMeta(workbook, row, col) {
    const address = addressFromCoords(row, col);
    const evaluation = evaluateCell(workbook, address, {}, []);
    const display = formatDisplay(evaluation);
    return {
      address: address,
      raw: getCellRaw(workbook, row, col),
      display: display,
      isNumeric: display !== '' && !evaluation.error && typeof evaluation.value === 'number',
      isError: Boolean(evaluation.error),
    };
  }

  function createStorageKey() {
    const namespace = (typeof window !== 'undefined' && (window.__ORACLE_RUN_NAMESPACE__ || window.__BENCHMARK_RUN_NAMESPACE__ || window.__RUN_STORAGE_NAMESPACE__)) || 'oracle-sheet';
    return namespace + ':spreadsheet-state';
  }

  function saveWorkbook(workbook) {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(createStorageKey(), JSON.stringify({
      rows: workbook.rows,
      cols: workbook.cols,
      cells: workbook.cells,
      active: workbook.active,
      selection: workbook.selection,
    }));
  }

  function loadWorkbook() {
    const workbook = createWorkbook(DEFAULT_COLS, DEFAULT_ROWS);
    if (typeof localStorage === 'undefined') {
      return workbook;
    }
    const raw = localStorage.getItem(createStorageKey());
    if (!raw) {
      return workbook;
    }
    try {
      const parsed = JSON.parse(raw);
      workbook.rows = Math.max(DEFAULT_ROWS, parsed.rows || DEFAULT_ROWS);
      workbook.cols = Math.max(DEFAULT_COLS, parsed.cols || DEFAULT_COLS);
      workbook.cells = parsed.cells || {};
      workbook.active = parsed.active || workbook.active;
      workbook.selection = parsed.selection || workbook.selection;
    } catch (error) {
      return workbook;
    }
    return workbook;
  }

  function initBrowserApp() {
    if (typeof document === 'undefined') {
      return;
    }

    const workbook = loadWorkbook();
    const gridShell = document.getElementById('grid-shell');
    const formulaInput = document.getElementById('formula-input');
    const contextMenu = document.getElementById('context-menu');
    let editState = null;
    let dragAnchor = null;

    function render() {
      const table = document.createElement('table');
      table.className = 'sheet-table';
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'corner-cell';
      headerRow.appendChild(corner);
      for (let col = 0; col < workbook.cols; col += 1) {
        const th = document.createElement('th');
        th.textContent = colToName(col);
        th.dataset.colHeader = String(col);
        if (col >= workbook.selection.startCol && col <= workbook.selection.endCol) {
          th.classList.add('selected-header');
        }
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let row = 0; row < workbook.rows; row += 1) {
        const tr = document.createElement('tr');
        const rowHeader = document.createElement('th');
        rowHeader.className = 'row-header';
        rowHeader.textContent = String(row + 1);
        rowHeader.dataset.rowHeader = String(row);
        if (row >= workbook.selection.startRow && row <= workbook.selection.endRow) {
          rowHeader.classList.add('selected-header');
        }
        tr.appendChild(rowHeader);

        for (let col = 0; col < workbook.cols; col += 1) {
          const td = document.createElement('td');
          td.dataset.row = String(row);
          td.dataset.col = String(col);
          const selected = row >= workbook.selection.startRow && row <= workbook.selection.endRow && col >= workbook.selection.startCol && col <= workbook.selection.endCol;
          if (selected) {
            td.classList.add('selected');
          }
          if (row === workbook.active.row && col === workbook.active.col) {
            td.classList.add('active');
          }
          const meta = cellDisplayMeta(workbook, row, col);
          if (editState && editState.row === row && editState.col === col) {
            const input = document.createElement('input');
            input.className = 'cell-editor';
            input.value = editState.value;
            td.appendChild(input);
          } else {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (meta.isNumeric) {
              cell.classList.add('numeric');
            }
            if (meta.isError) {
              cell.classList.add('error');
            }
            cell.textContent = meta.display;
            td.appendChild(cell);
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      gridShell.replaceChildren(table);
      formulaInput.value = editState && editState.surface === 'formula'
        ? editState.value
        : getCellRaw(workbook, workbook.active.row, workbook.active.col);

      if (editState) {
        const input = gridShell.querySelector('.cell-editor');
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
          bindEditor(input);
        }
      }
    }

    function bindEditor(input) {
      input.addEventListener('input', function () {
        if (editState) {
          editState.value = input.value;
          formulaInput.value = input.value;
        }
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit(1, 0);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitEdit(0, 1);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
      });
    }

    function beginEdit(surface, initialValue, replaceAll) {
      editState = {
        row: workbook.active.row,
        col: workbook.active.col,
        original: getCellRaw(workbook, workbook.active.row, workbook.active.col),
        value: initialValue == null ? getCellRaw(workbook, workbook.active.row, workbook.active.col) : initialValue,
        surface: surface,
      };
      render();
      if (surface === 'formula') {
        formulaInput.focus();
        if (replaceAll) {
          formulaInput.setSelectionRange(0, formulaInput.value.length);
        } else {
          formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
        }
      }
    }

    function commitEdit(moveRow, moveCol) {
      if (!editState) {
        return;
      }
      pushHistory(workbook);
      setCellRaw(workbook, { row: editState.row, col: editState.col }, editState.value);
      editState = null;
      workbook.active = {
        row: clamp(workbook.active.row + moveRow, 0, workbook.rows - 1),
        col: clamp(workbook.active.col + moveCol, 0, workbook.cols - 1),
      };
      workbook.selection = {
        startRow: workbook.active.row,
        endRow: workbook.active.row,
        startCol: workbook.active.col,
        endCol: workbook.active.col,
      };
      saveWorkbook(workbook);
      render();
    }

    function cancelEdit() {
      editState = null;
      render();
    }

    function moveSelection(rowDelta, colDelta, extend) {
      const nextRow = clamp(workbook.active.row + rowDelta, 0, workbook.rows - 1);
      const nextCol = clamp(workbook.active.col + colDelta, 0, workbook.cols - 1);
      if (extend) {
        workbook.selection = normalizeRange({
          startRow: workbook.selection.startRow,
          startCol: workbook.selection.startCol,
          endRow: nextRow,
          endCol: nextCol,
        });
        workbook.active = { row: nextRow, col: nextCol };
      } else {
        workbook.active = { row: nextRow, col: nextCol };
        workbook.selection = { startRow: nextRow, endRow: nextRow, startCol: nextCol, endCol: nextCol };
      }
      saveWorkbook(workbook);
      render();
    }

    function performUndo() {
      if (!workbook.history.length) {
        return;
      }
      workbook.future.push(cloneSnapshot(workbook));
      restoreSnapshot(workbook, workbook.history.pop());
      editState = null;
      saveWorkbook(workbook);
      render();
    }

    function performRedo() {
      if (!workbook.future.length) {
        return;
      }
      workbook.history.push(cloneSnapshot(workbook));
      restoreSnapshot(workbook, workbook.future.pop());
      editState = null;
      saveWorkbook(workbook);
      render();
    }

    function clearSelectionAndRender() {
      pushHistory(workbook);
      clearRange(workbook, workbook.selection);
      saveWorkbook(workbook);
      render();
    }

    function showContextMenu(items, x, y) {
      contextMenu.replaceChildren();
      items.forEach(function (item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        button.addEventListener('click', function () {
          hideContextMenu();
          item.action();
        });
        contextMenu.appendChild(button);
      });
      contextMenu.style.left = x + 'px';
      contextMenu.style.top = y + 'px';
      contextMenu.classList.remove('hidden');
    }

    function hideContextMenu() {
      contextMenu.classList.add('hidden');
    }

    gridShell.addEventListener('mousedown', function (event) {
      const cell = event.target.closest('td[data-row][data-col]');
      if (!cell) {
        return;
      }
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      dragAnchor = event.shiftKey ? { row: workbook.selection.startRow, col: workbook.selection.startCol } : { row: row, col: col };
      workbook.active = { row: row, col: col };
      workbook.selection = normalizeRange({
        startRow: dragAnchor.row,
        startCol: dragAnchor.col,
        endRow: row,
        endCol: col,
      });
      hideContextMenu();
      render();
    });

    gridShell.addEventListener('mouseover', function (event) {
      if (!dragAnchor || editState) {
        return;
      }
      const cell = event.target.closest('td[data-row][data-col]');
      if (!cell) {
        return;
      }
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      workbook.active = { row: row, col: col };
      workbook.selection = normalizeRange({
        startRow: dragAnchor.row,
        startCol: dragAnchor.col,
        endRow: row,
        endCol: col,
      });
      render();
    });

    document.addEventListener('mouseup', function () {
      dragAnchor = null;
      saveWorkbook(workbook);
    });

    gridShell.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('td[data-row][data-col]');
      if (!cell) {
        return;
      }
      workbook.active = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      workbook.selection = { startRow: workbook.active.row, endRow: workbook.active.row, startCol: workbook.active.col, endCol: workbook.active.col };
      beginEdit('cell');
    });

    gridShell.addEventListener('contextmenu', function (event) {
      const rowHeader = event.target.closest('th[data-row-header]');
      const colHeader = event.target.closest('th[data-col-header]');
      if (!rowHeader && !colHeader) {
        return;
      }
      event.preventDefault();
      if (rowHeader) {
        const row = Number(rowHeader.dataset.rowHeader);
        showContextMenu([
          { label: 'Insert row above', action: function () { pushHistory(workbook); insertRow(workbook, row, 1); saveWorkbook(workbook); render(); } },
          { label: 'Insert row below', action: function () { pushHistory(workbook); insertRow(workbook, row + 1, 1); saveWorkbook(workbook); render(); } },
          { label: 'Delete row', action: function () { pushHistory(workbook); deleteRow(workbook, row, 1); saveWorkbook(workbook); render(); } },
        ], event.clientX, event.clientY);
      } else {
        const col = Number(colHeader.dataset.colHeader);
        showContextMenu([
          { label: 'Insert column left', action: function () { pushHistory(workbook); insertColumn(workbook, col, 1); saveWorkbook(workbook); render(); } },
          { label: 'Insert column right', action: function () { pushHistory(workbook); insertColumn(workbook, col + 1, 1); saveWorkbook(workbook); render(); } },
          { label: 'Delete column', action: function () { pushHistory(workbook); deleteColumn(workbook, col, 1); saveWorkbook(workbook); render(); } },
        ], event.clientX, event.clientY);
      }
    });

    document.addEventListener('click', function (event) {
      if (!contextMenu.contains(event.target)) {
        hideContextMenu();
      }
    });

    formulaInput.addEventListener('focus', function () {
      beginEdit('formula');
    });

    formulaInput.addEventListener('input', function () {
      if (!editState) {
        beginEdit('formula', formulaInput.value);
      } else {
        editState.value = formulaInput.value;
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (!editState) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(1, 0);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.target === formulaInput) {
        return;
      }
      if (editState) {
        return;
      }
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === 'c') {
        workbook.internalClipboard = copySelection(workbook, workbook.selection, true);
        return;
      }
      if (isMeta && event.key.toLowerCase() === 'x') {
        workbook.internalClipboard = copySelection(workbook, workbook.selection, true);
        workbook.internalClipboard.isCut = true;
        return;
      }
      if (isMeta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        performUndo();
        return;
      }
      if ((isMeta && event.key.toLowerCase() === 'y') || (isMeta && event.shiftKey && event.key.toLowerCase() === 'z')) {
        event.preventDefault();
        performRedo();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1, 0, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1, 0, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelection(0, -1, event.shiftKey);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(0, 1, event.shiftKey);
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        beginEdit('cell');
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearSelectionAndRender();
        return;
      }
      if (!isMeta && event.key.length === 1) {
        event.preventDefault();
        beginEdit('cell', event.key, true);
      }
    });

    document.addEventListener('copy', function (event) {
      workbook.internalClipboard = copySelection(workbook, workbook.selection, true);
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', workbook.internalClipboard.text);
        event.preventDefault();
      }
    });

    document.addEventListener('cut', function (event) {
      workbook.internalClipboard = copySelection(workbook, workbook.selection, true);
      workbook.internalClipboard.isCut = true;
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', workbook.internalClipboard.text);
        event.preventDefault();
      }
    });

    document.addEventListener('paste', function (event) {
      if (editState) {
        return;
      }
      const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
      const clip = workbook.internalClipboard && workbook.internalClipboard.text === text
        ? workbook.internalClipboard
        : { text: text, matrix: parseTextMatrix(text), internal: false };
      pushHistory(workbook);
      pasteSelection(workbook, clip, { row: workbook.selection.startRow, col: workbook.selection.startCol });
      workbook.selection = {
        startRow: workbook.selection.startRow,
        endRow: clamp(workbook.selection.startRow + clip.matrix.length - 1, 0, workbook.rows - 1),
        startCol: workbook.selection.startCol,
        endCol: clamp(workbook.selection.startCol + clip.matrix[0].length - 1, 0, workbook.cols - 1),
      };
      workbook.active = { row: workbook.selection.startRow, col: workbook.selection.startCol };
      saveWorkbook(workbook);
      render();
      event.preventDefault();
    });

    render();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBrowserApp);
    } else {
      initBrowserApp();
    }
  }

  return {
    createWorkbook: createWorkbook,
    setCellRaw: setCellRaw,
    getCellDisplay: getCellDisplay,
    copySelection: copySelection,
    pasteSelection: pasteSelection,
    insertRow: insertRow,
    deleteColumn: deleteColumn,
    shiftFormula: shiftFormula,
  };
}));
