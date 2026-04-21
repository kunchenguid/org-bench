(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const ERROR = {
    generic: '#ERR!',
    div0: '#DIV/0!',
    ref: '#REF!',
    circ: '#CIRC!',
  };

  function createSheet(rows, cols) {
    return { rows: rows, cols: cols, cells: {} };
  }

  function setCell(sheet, row, col, raw) {
    const key = toCellKey(row, col);
    if (raw === '' || raw == null) {
      delete sheet.cells[key];
      return;
    }
    sheet.cells[key] = String(raw);
  }

  function toCellKey(row, col) {
    return indexToColumn(col) + String(row + 1);
  }

  function indexToColumn(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function columnToIndex(label) {
    let value = 0;
    for (let i = 0; i < label.length; i += 1) {
      value = value * 26 + (label.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function parseRef(ref) {
    const match = /^((\$)?([A-Z]+))((\$)?(\d+))$/.exec(ref);
    if (!match) {
      return null;
    }
    return {
      colAbs: Boolean(match[2]),
      colLabel: match[3],
      col: columnToIndex(match[3]),
      rowAbs: Boolean(match[5]),
      row: Number(match[6]) - 1,
    };
  }

  function formatRef(ref) {
    if (ref.error) {
      return ERROR.ref;
    }
    return (ref.colAbs ? '$' : '') + indexToColumn(ref.col) + (ref.rowAbs ? '$' : '') + String(ref.row + 1);
  }

  function copyFormula(raw, from, to) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }
    const rowDelta = to.row - from.row;
    const colDelta = to.col - from.col;
    return raw.replace(/(\$?[A-Z]+\$?\d+)(:(\$?[A-Z]+\$?\d+))?/g, function (match, first, _range, second) {
      if (second) {
        return shiftRefText(first, rowDelta, colDelta) + ':' + shiftRefText(second, rowDelta, colDelta);
      }
      return shiftRefText(first, rowDelta, colDelta);
    });
  }

  function shiftRefText(text, rowDelta, colDelta) {
    const ref = parseRef(text);
    if (!ref) {
      return text;
    }
    const next = {
      colAbs: ref.colAbs,
      rowAbs: ref.rowAbs,
      col: ref.colAbs ? ref.col : Math.max(0, ref.col + colDelta),
      row: ref.rowAbs ? ref.row : Math.max(0, ref.row + rowDelta),
    };
    return formatRef(next);
  }

  function applyStructuralChange(raw, change) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }
    return raw.replace(/(\$?[A-Z]+\$?\d+)(:(\$?[A-Z]+\$?\d+))?/g, function (match, first, _range, second) {
      if (second) {
        const left = transformRef(parseRef(first), change);
        const right = transformRef(parseRef(second), change);
        if (left.error || right.error) {
          return ERROR.ref;
        }
        return formatRef(left) + ':' + formatRef(right);
      }
      return formatRef(transformRef(parseRef(first), change));
    });
  }

  function transformRef(ref, change) {
    if (!ref) {
      return { error: true };
    }
    const next = {
      colAbs: ref.colAbs,
      rowAbs: ref.rowAbs,
      col: ref.col,
      row: ref.row,
    };
    if (change.type === 'insert-row' && ref.row >= change.index) {
      next.row += change.count;
    }
    if (change.type === 'insert-col' && ref.col >= change.index) {
      next.col += change.count;
    }
    if (change.type === 'delete-row') {
      if (ref.row >= change.index && ref.row < change.index + change.count) {
        return { error: true };
      }
      if (ref.row >= change.index + change.count) {
        next.row -= change.count;
      }
    }
    if (change.type === 'delete-col') {
      if (ref.col >= change.index && ref.col < change.index + change.count) {
        return { error: true };
      }
      if (ref.col >= change.index + change.count) {
        next.col -= change.count;
      }
    }
    return next;
  }

  function evaluateSheet(sheet) {
    const display = {};
    const computed = {};
    const visiting = {};

    function evaluateCell(cellKey) {
      if (Object.prototype.hasOwnProperty.call(computed, cellKey)) {
        return computed[cellKey];
      }
      if (visiting[cellKey]) {
        return makeError(ERROR.circ);
      }
      visiting[cellKey] = true;
      const raw = sheet.cells[cellKey] || '';
      let value;
      if (!raw) {
        value = blankValue();
      } else if (raw.charAt(0) !== '=') {
        value = parseLiteral(raw);
      } else {
        try {
          const parser = new Parser(raw.slice(1));
          const ast = parser.parse();
          value = evaluateNode(ast, sheet, evaluateCell);
        } catch (error) {
          value = makeError(error && error.code ? error.code : ERROR.generic);
        }
      }
      visiting[cellKey] = false;
      computed[cellKey] = value;
      return value;
    }

    Object.keys(sheet.cells).forEach(function (cellKey) {
      const value = evaluateCell(cellKey);
      display[cellKey] = renderValue(value);
    });

    return { values: computed, display: display };
  }

  function blankValue() {
    return { type: 'blank', value: '' };
  }

  function numberValue(value) {
    return { type: 'number', value: value };
  }

  function stringValue(value) {
    return { type: 'string', value: value };
  }

  function booleanValue(value) {
    return { type: 'boolean', value: Boolean(value) };
  }

  function makeError(code) {
    return { type: 'error', value: code || ERROR.generic };
  }

  function parseLiteral(raw) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return blankValue();
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      return numberValue(Number(trimmed));
    }
    if (trimmed.toUpperCase() === 'TRUE') {
      return booleanValue(true);
    }
    if (trimmed.toUpperCase() === 'FALSE') {
      return booleanValue(false);
    }
    return stringValue(raw);
  }

  function renderValue(value) {
    if (!value || value.type === 'blank') {
      return '';
    }
    if (value.type === 'error') {
      return value.value;
    }
    if (value.type === 'boolean') {
      return value.value ? 'TRUE' : 'FALSE';
    }
    if (value.type === 'number') {
      if (Number.isInteger(value.value)) {
        return String(value.value);
      }
      return String(Number(value.value.toFixed(10))).replace(/\.0+$/, '');
    }
    return String(value.value);
  }

  function evaluateNode(node, sheet, getCellValue) {
    if (!node) {
      return makeError(ERROR.generic);
    }
    if (node.type === 'number') {
      return numberValue(node.value);
    }
    if (node.type === 'string') {
      return stringValue(node.value);
    }
    if (node.type === 'boolean') {
      return booleanValue(node.value);
    }
    if (node.type === 'unary') {
      const inner = evaluateNode(node.value, sheet, getCellValue);
      if (inner.type === 'error') {
        return inner;
      }
      return numberValue(-coerceNumber(inner));
    }
    if (node.type === 'binary') {
      const left = evaluateNode(node.left, sheet, getCellValue);
      if (left.type === 'error') {
        return left;
      }
      const right = evaluateNode(node.right, sheet, getCellValue);
      if (right.type === 'error') {
        return right;
      }
      switch (node.operator) {
        case '+':
          return numberValue(coerceNumber(left) + coerceNumber(right));
        case '-':
          return numberValue(coerceNumber(left) - coerceNumber(right));
        case '*':
          return numberValue(coerceNumber(left) * coerceNumber(right));
        case '/':
          if (coerceNumber(right) === 0) {
            return makeError(ERROR.div0);
          }
          return numberValue(coerceNumber(left) / coerceNumber(right));
        case '&':
          return stringValue(coerceText(left) + coerceText(right));
        case '=':
          return booleanValue(compareValues(left, right) === 0);
        case '<>':
          return booleanValue(compareValues(left, right) !== 0);
        case '<':
          return booleanValue(compareValues(left, right) < 0);
        case '<=':
          return booleanValue(compareValues(left, right) <= 0);
        case '>':
          return booleanValue(compareValues(left, right) > 0);
        case '>=':
          return booleanValue(compareValues(left, right) >= 0);
        default:
          return makeError(ERROR.generic);
      }
    }
    if (node.type === 'ref') {
      const key = toCellKey(node.row, node.col);
      const value = getCellValue(key);
      return value.type === 'blank' ? blankValue() : value;
    }
    if (node.type === 'range') {
      const values = [];
      const rowStart = Math.min(node.start.row, node.end.row);
      const rowEnd = Math.max(node.start.row, node.end.row);
      const colStart = Math.min(node.start.col, node.end.col);
      const colEnd = Math.max(node.start.col, node.end.col);
      for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) {
          values.push(getCellValue(toCellKey(row, col)));
        }
      }
      return { type: 'range', value: values };
    }
    if (node.type === 'call') {
      const values = node.args.map(function (arg) {
        return evaluateNode(arg, sheet, getCellValue);
      });
      const error = values.find(function (value) { return value.type === 'error'; });
      if (error) {
        return error;
      }
      return executeFunction(node.name, values);
    }
    return makeError(ERROR.generic);
  }

  function flattenArgs(args) {
    const out = [];
    args.forEach(function (arg) {
      if (arg.type === 'range') {
        arg.value.forEach(function (entry) { out.push(entry); });
      } else {
        out.push(arg);
      }
    });
    return out;
  }

  function executeFunction(name, args) {
    const values = flattenArgs(args);
    switch (name) {
      case 'SUM':
        return numberValue(values.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0));
      case 'AVERAGE':
        return numberValue(values.length ? values.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) / values.length : 0);
      case 'MIN':
        return numberValue(values.length ? Math.min.apply(Math, values.map(coerceNumber)) : 0);
      case 'MAX':
        return numberValue(values.length ? Math.max.apply(Math, values.map(coerceNumber)) : 0);
      case 'COUNT':
        return numberValue(values.filter(function (value) { return value.type === 'number'; }).length);
      case 'IF':
        return args.length < 2 ? makeError(ERROR.generic) : (coerceBoolean(args[0]) ? args[1] : (args[2] || blankValue()));
      case 'AND':
        return booleanValue(values.every(coerceBoolean));
      case 'OR':
        return booleanValue(values.some(coerceBoolean));
      case 'NOT':
        return booleanValue(!coerceBoolean(args[0] || blankValue()));
      case 'ABS':
        return numberValue(Math.abs(coerceNumber(args[0] || blankValue())));
      case 'ROUND': {
        const digits = Math.max(0, Math.floor(coerceNumber(args[1] || numberValue(0))));
        const factor = Math.pow(10, digits);
        return numberValue(Math.round(coerceNumber(args[0] || blankValue()) * factor) / factor);
      }
      case 'CONCAT':
        return stringValue(values.map(coerceText).join(''));
      default:
        return makeError(ERROR.generic);
    }
  }

  function compareValues(left, right) {
    if (left.type === 'string' || right.type === 'string') {
      return coerceText(left).localeCompare(coerceText(right));
    }
    const l = coerceNumber(left);
    const r = coerceNumber(right);
    if (l === r) {
      return 0;
    }
    return l < r ? -1 : 1;
  }

  function coerceNumber(value) {
    if (!value || value.type === 'blank') {
      return 0;
    }
    if (value.type === 'number') {
      return value.value;
    }
    if (value.type === 'boolean') {
      return value.value ? 1 : 0;
    }
    if (value.type === 'string') {
      const parsed = Number(value.value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    throw { code: ERROR.generic };
  }

  function coerceText(value) {
    if (!value || value.type === 'blank') {
      return '';
    }
    if (value.type === 'boolean') {
      return value.value ? 'TRUE' : 'FALSE';
    }
    if (value.type === 'number') {
      return renderValue(value);
    }
    if (value.type === 'string') {
      return value.value;
    }
    throw { code: ERROR.generic };
  }

  function coerceBoolean(value) {
    if (!value || value.type === 'blank') {
      return false;
    }
    if (value.type === 'boolean') {
      return value.value;
    }
    if (value.type === 'number') {
      return value.value !== 0;
    }
    if (value.type === 'string') {
      return value.value !== '' && value.value !== '0';
    }
    throw { code: ERROR.generic };
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
      if (char === '"') {
        let end = index + 1;
        let text = '';
        while (end < input.length) {
          if (input.charAt(end) === '"') {
            if (input.charAt(end + 1) === '"') {
              text += '"';
              end += 2;
              continue;
            }
            break;
          }
          text += input.charAt(end);
          end += 1;
        }
        if (end >= input.length || input.charAt(end) !== '"') {
          throw { code: ERROR.generic };
        }
        tokens.push({ type: 'string', value: text });
        index = end + 1;
        continue;
      }
      const two = input.slice(index, index + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two });
        index += 2;
        continue;
      }
      if ('+-*/&=(),:<>'.indexOf(char) !== -1) {
        tokens.push({ type: 'op', value: char });
        index += 1;
        continue;
      }
      const numberMatch = /^[0-9]+(?:\.[0-9]+)?|^\.[0-9]+/.exec(input.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const refMatch = /^\$?[A-Z]+\$?\d+/.exec(input.slice(index).toUpperCase());
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0] });
        index += refMatch[0].length;
        continue;
      }
      const identMatch = /^[A-Z_][A-Z0-9_]*/.exec(input.slice(index).toUpperCase());
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0] });
        index += identMatch[0].length;
        continue;
      }
      throw { code: ERROR.generic };
    }
    return tokens;
  }

  function Parser(input) {
    this.tokens = tokenize(input);
    this.index = 0;
  }

  Parser.prototype.peek = function () {
    return this.tokens[this.index];
  };

  Parser.prototype.consume = function () {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  };

  Parser.prototype.expect = function (type, value) {
    const token = this.peek();
    if (!token || token.type !== type || (value && token.value !== value)) {
      throw { code: ERROR.generic };
    }
    return this.consume();
  };

  Parser.prototype.parse = function () {
    const expression = this.parseComparison();
    if (this.peek()) {
      throw { code: ERROR.generic };
    }
    return expression;
  };

  Parser.prototype.parseComparison = function () {
    let node = this.parseConcat();
    while (this.peek() && this.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.peek().value) !== -1) {
      const op = this.consume().value;
      node = { type: 'binary', operator: op, left: node, right: this.parseConcat() };
    }
    return node;
  };

  Parser.prototype.parseConcat = function () {
    let node = this.parseAddSub();
    while (this.peek() && this.peek().type === 'op' && this.peek().value === '&') {
      this.consume();
      node = { type: 'binary', operator: '&', left: node, right: this.parseAddSub() };
    }
    return node;
  };

  Parser.prototype.parseAddSub = function () {
    let node = this.parseMulDiv();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      node = { type: 'binary', operator: op, left: node, right: this.parseMulDiv() };
    }
    return node;
  };

  Parser.prototype.parseMulDiv = function () {
    let node = this.parseUnary();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value;
      node = { type: 'binary', operator: op, left: node, right: this.parseUnary() };
    }
    return node;
  };

  Parser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'op' && this.peek().value === '-') {
      this.consume();
      return { type: 'unary', value: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    const token = this.peek();
    if (!token) {
      throw { code: ERROR.generic };
    }
    if (token.type === 'number') {
      this.consume();
      return { type: 'number', value: token.value };
    }
    if (token.type === 'string') {
      this.consume();
      return { type: 'string', value: token.value };
    }
    if (token.type === 'ref') {
      const first = parseRef(this.consume().value);
      if (this.peek() && this.peek().type === 'op' && this.peek().value === ':') {
        this.consume();
        const secondToken = this.expect('ref');
        return { type: 'range', start: first, end: parseRef(secondToken.value) };
      }
      return { type: 'ref', row: first.row, col: first.col };
    }
    if (token.type === 'ident') {
      const ident = this.consume().value;
      if (ident === 'TRUE' || ident === 'FALSE') {
        return { type: 'boolean', value: ident === 'TRUE' };
      }
      this.expect('op', '(');
      const args = [];
      if (!(this.peek() && this.peek().type === 'op' && this.peek().value === ')')) {
        while (true) {
          args.push(this.parseComparison());
          if (this.peek() && this.peek().type === 'op' && this.peek().value === ',') {
            this.consume();
            continue;
          }
          break;
        }
      }
      this.expect('op', ')');
      return { type: 'call', name: ident, args: args };
    }
    if (token.type === 'op' && token.value === '(') {
      this.consume();
      const expr = this.parseComparison();
      this.expect('op', ')');
      return expr;
    }
    throw { code: ERROR.generic };
  };

  return {
    ERROR: ERROR,
    Parser: Parser,
    createSheet: createSheet,
    setCell: setCell,
    evaluateSheet: evaluateSheet,
    copyFormula: copyFormula,
    applyStructuralChange: applyStructuralChange,
    toCellKey: toCellKey,
    indexToColumn: indexToColumn,
    columnToIndex: columnToIndex,
    parseRef: parseRef,
  };
});
