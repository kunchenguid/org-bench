(function (global) {
  var COLUMN_COUNT = 26;
  var ROW_COUNT = 100;
  var ERROR_MESSAGES = {
    ERR: '#ERR!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
    CIRC: '#CIRC!'
  };

  function SpreadsheetModel(options) {
    options = options || {};
    this.columnCount = options.columnCount || COLUMN_COUNT;
    this.rowCount = options.rowCount || ROW_COUNT;
    this.cells = {};
    this.cache = {};
  }

  function HistoryManager(limit) {
    this.limit = limit || 50;
    this.undoStack = [];
    this.redoStack = [];
  }

  HistoryManager.prototype.record = function (before, after) {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    this.undoStack.push({ before: cloneSnapshot(before), after: cloneSnapshot(after) });
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  };

  HistoryManager.prototype.undo = function () {
    if (!this.undoStack.length) {
      return null;
    }
    var action = this.undoStack.pop();
    this.redoStack.push({ before: cloneSnapshot(action.before), after: cloneSnapshot(action.after) });
    return cloneSnapshot(action.before);
  };

  HistoryManager.prototype.redo = function () {
    if (!this.redoStack.length) {
      return null;
    }
    var action = this.redoStack.pop();
    this.undoStack.push({ before: cloneSnapshot(action.before), after: cloneSnapshot(action.after) });
    return cloneSnapshot(action.after);
  };

  SpreadsheetModel.prototype.cloneCells = function () {
    return JSON.parse(JSON.stringify(this.cells));
  };

  SpreadsheetModel.prototype.load = function (cells) {
    this.cells = {};
    var keys = Object.keys(cells || {});
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (cells[key] !== '') {
        this.cells[key] = String(cells[key]);
      }
    }
    this.invalidate();
  };

  SpreadsheetModel.prototype.invalidate = function () {
    this.cache = {};
  };

  SpreadsheetModel.prototype.getRaw = function (address) {
    return this.cells[address] || '';
  };

  SpreadsheetModel.prototype.setRaw = function (address, raw) {
    if (raw === '') {
      delete this.cells[address];
    } else {
      this.cells[address] = raw;
    }
    this.invalidate();
  };

  SpreadsheetModel.prototype.copyBlock = function (range) {
    var normalized = normalizeRange(range);
    var rows = [];
    for (var row = normalized.startRow; row <= normalized.endRow; row += 1) {
      var currentRow = [];
      for (var column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
        currentRow.push(this.getRaw(indexToColumn(column) + String(row + 1)));
      }
      rows.push(currentRow);
    }
    return {
      sourceRow: normalized.startRow,
      sourceColumn: normalized.startColumn,
      cells: rows
    };
  };

  SpreadsheetModel.prototype.pasteBlock = function (targetRow, targetColumn, block) {
    for (var rowOffset = 0; rowOffset < block.cells.length; rowOffset += 1) {
      for (var columnOffset = 0; columnOffset < block.cells[rowOffset].length; columnOffset += 1) {
        var raw = block.cells[rowOffset][columnOffset];
        var shifted = this.shiftFormula(raw, targetRow + rowOffset - (block.sourceRow + rowOffset), targetColumn + columnOffset - (block.sourceColumn + columnOffset));
        this.setRaw(indexToColumn(targetColumn + columnOffset) + String(targetRow + rowOffset + 1), shifted);
      }
    }
    this.invalidate();
  };

  SpreadsheetModel.prototype.clearRange = function (range) {
    var normalized = normalizeRange(range);
    for (var row = normalized.startRow; row <= normalized.endRow; row += 1) {
      for (var column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
        this.setRaw(indexToColumn(column) + String(row + 1), '');
      }
    }
    this.invalidate();
  };

  SpreadsheetModel.prototype.shiftFormula = function (raw, rowDelta, columnDelta) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw || '';
    }
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, columnDollar, letters, rowDollar, rowNumber) {
      var column = lettersToIndex(letters);
      var row = Number(rowNumber) - 1;
      var nextColumn = columnDollar ? column : column + columnDelta;
      var nextRow = rowDollar ? row : row + rowDelta;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= COLUMN_COUNT || nextRow >= ROW_COUNT) {
        return '#REF!';
      }
      return (columnDollar ? '$' : '') + indexToColumn(nextColumn) + (rowDollar ? '$' : '') + String(nextRow + 1);
    });
  };

  SpreadsheetModel.prototype.getDisplayValue = function (address) {
    var result = this.evaluateCell(address, {});
    if (result.error) {
      return result.error;
    }
    if (typeof result.value === 'boolean') {
      return result.value ? 'TRUE' : 'FALSE';
    }
    if (result.value === null || result.value === undefined) {
      return '';
    }
    return String(result.value);
  };

  SpreadsheetModel.prototype.getCellMeta = function (address) {
    var result = this.evaluateCell(address, {});
    return {
      raw: this.getRaw(address),
      display: result.error ? result.error : result.value,
      type: result.error ? 'error' : inferType(result.value),
      error: result.error || null
    };
  };

  SpreadsheetModel.prototype.evaluateCell = function (address, trail) {
    trail = trail || {};
    if (trail[address]) {
      return { error: ERROR_MESSAGES.CIRC };
    }
    if (this.cache[address]) {
      return this.cache[address];
    }
    var raw = this.getRaw(address);
    if (!raw) {
      var empty = { value: '' };
      this.cache[address] = empty;
      return empty;
    }
    if (raw.charAt(0) !== '=') {
      var literal = parseLiteral(raw);
      this.cache[address] = literal;
      return literal;
    }

    var nextTrail = shallowCopy(trail);
    nextTrail[address] = true;
    try {
      var parser = new FormulaParser(raw.slice(1));
      var ast = parser.parseExpression();
      if (!parser.isDone()) {
        throw new FormulaError(ERROR_MESSAGES.ERR);
      }
      var value = evaluateAst(ast, this, nextTrail);
      var success = { value: value };
      this.cache[address] = success;
      return success;
    } catch (error) {
      var failure = { error: error && error.code ? error.code : ERROR_MESSAGES.ERR };
      this.cache[address] = failure;
      return failure;
    }
  };

  function FormulaParser(source) {
    this.source = source;
    this.index = 0;
  }

  FormulaParser.prototype.isDone = function () {
    this.skipWhitespace();
    return this.index >= this.source.length;
  };

  FormulaParser.prototype.skipWhitespace = function () {
    while (this.index < this.source.length && /\s/.test(this.source.charAt(this.index))) {
      this.index += 1;
    }
  };

  FormulaParser.prototype.parseExpression = function () {
    return this.parseComparison();
  };

  FormulaParser.prototype.parseComparison = function () {
    var left = this.parseConcat();
    this.skipWhitespace();
    var operator = this.matchOperators(['<=', '>=', '<>', '<', '>', '=']);
    if (!operator) {
      return left;
    }
    var right = this.parseConcat();
    return { type: 'binary', operator: operator, left: left, right: right };
  };

  FormulaParser.prototype.parseConcat = function () {
    var node = this.parseAddSubtract();
    this.skipWhitespace();
    while (this.peek() === '&') {
      this.index += 1;
      var right = this.parseAddSubtract();
      node = { type: 'binary', operator: '&', left: node, right: right };
      this.skipWhitespace();
    }
    return node;
  };

  FormulaParser.prototype.parseAddSubtract = function () {
    var node = this.parseMultiplyDivide();
    this.skipWhitespace();
    while (this.peek() === '+' || this.peek() === '-') {
      var operator = this.peek();
      this.index += 1;
      var right = this.parseMultiplyDivide();
      node = { type: 'binary', operator: operator, left: node, right: right };
      this.skipWhitespace();
    }
    return node;
  };

  FormulaParser.prototype.parseMultiplyDivide = function () {
    var node = this.parseUnary();
    this.skipWhitespace();
    while (this.peek() === '*' || this.peek() === '/') {
      var operator = this.peek();
      this.index += 1;
      var right = this.parseUnary();
      node = { type: 'binary', operator: operator, left: node, right: right };
      this.skipWhitespace();
    }
    return node;
  };

  FormulaParser.prototype.parseUnary = function () {
    this.skipWhitespace();
    if (this.peek() === '-') {
      this.index += 1;
      return { type: 'unary', operator: '-', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  FormulaParser.prototype.parsePrimary = function () {
    this.skipWhitespace();
    var current = this.peek();
    if (current === '(') {
      this.index += 1;
      var nested = this.parseExpression();
      this.expect(')');
      return nested;
    }
    if (current === '"') {
      return this.parseString();
    }
    if (/[0-9.]/.test(current)) {
      return this.parseNumber();
    }
    return this.parseIdentifierLike();
  };

  FormulaParser.prototype.parseString = function () {
    this.expect('"');
    var start = this.index;
    while (this.index < this.source.length && this.source.charAt(this.index) !== '"') {
      this.index += 1;
    }
    if (this.index >= this.source.length) {
      throw new FormulaError(ERROR_MESSAGES.ERR);
    }
    var value = this.source.slice(start, this.index);
    this.expect('"');
    return { type: 'string', value: value };
  };

  FormulaParser.prototype.parseNumber = function () {
    var start = this.index;
    while (this.index < this.source.length && /[0-9.]/.test(this.source.charAt(this.index))) {
      this.index += 1;
    }
    var raw = this.source.slice(start, this.index);
    var value = Number(raw);
    if (!isFinite(value)) {
      throw new FormulaError(ERROR_MESSAGES.ERR);
    }
    return { type: 'number', value: value };
  };

  FormulaParser.prototype.parseIdentifierLike = function () {
    var start = this.index;
    while (this.index < this.source.length && /[A-Za-z0-9_$]/.test(this.source.charAt(this.index))) {
      this.index += 1;
    }
    if (start === this.index) {
      throw new FormulaError(ERROR_MESSAGES.ERR);
    }
    var token = this.source.slice(start, this.index);
    this.skipWhitespace();
    if (this.peek() === '(') {
      this.index += 1;
      var args = [];
      this.skipWhitespace();
      if (this.peek() !== ')') {
        while (true) {
          args.push(this.parseExpression());
          this.skipWhitespace();
          if (this.peek() === ',') {
            this.index += 1;
            continue;
          }
          break;
        }
      }
      this.expect(')');
      return { type: 'call', name: token.toUpperCase(), args: args };
    }

    var reference = parseReference(token);
    if (reference) {
      this.skipWhitespace();
      if (this.peek() === ':') {
        this.index += 1;
        var rightTokenStart = this.index;
        while (this.index < this.source.length && /[A-Za-z0-9_$]/.test(this.source.charAt(this.index))) {
          this.index += 1;
        }
        var rightToken = this.source.slice(rightTokenStart, this.index);
        var endReference = parseReference(rightToken);
        if (!endReference) {
          throw new FormulaError(ERROR_MESSAGES.REF);
        }
        return { type: 'range', start: reference, end: endReference };
      }
      return { type: 'reference', reference: reference };
    }
    if (token.toUpperCase() === 'TRUE') {
      return { type: 'boolean', value: true };
    }
    if (token.toUpperCase() === 'FALSE') {
      return { type: 'boolean', value: false };
    }
    throw new FormulaError(ERROR_MESSAGES.ERR);
  };

  FormulaParser.prototype.matchOperators = function (operators) {
    this.skipWhitespace();
    for (var i = 0; i < operators.length; i += 1) {
      if (this.source.slice(this.index, this.index + operators[i].length) === operators[i]) {
        this.index += operators[i].length;
        return operators[i];
      }
    }
    return '';
  };

  FormulaParser.prototype.expect = function (character) {
    this.skipWhitespace();
    if (this.peek() !== character) {
      throw new FormulaError(ERROR_MESSAGES.ERR);
    }
    this.index += 1;
  };

  FormulaParser.prototype.peek = function () {
    return this.source.charAt(this.index);
  };

  function evaluateAst(node, model, trail) {
    if (node.type === 'number' || node.type === 'string' || node.type === 'boolean') {
      return node.value;
    }
    if (node.type === 'reference') {
      return coerceReferenceValue(model.evaluateCell(referenceToAddress(node.reference), trail));
    }
    if (node.type === 'range') {
      return expandRange(node.start, node.end).map(function (reference) {
        return coerceReferenceValue(model.evaluateCell(referenceToAddress(reference), trail));
      });
    }
    if (node.type === 'unary') {
      return -toNumber(evaluateAst(node.argument, model, trail));
    }
    if (node.type === 'binary') {
      return evaluateBinary(node, model, trail);
    }
    if (node.type === 'call') {
      return evaluateFunction(node, model, trail);
    }
    throw new FormulaError(ERROR_MESSAGES.ERR);
  }

  function evaluateBinary(node, model, trail) {
    if (node.operator === '&') {
      return toText(evaluateAst(node.left, model, trail)) + toText(evaluateAst(node.right, model, trail));
    }
    var left = evaluateAst(node.left, model, trail);
    var right = evaluateAst(node.right, model, trail);
    if (node.operator === '+') {
      return toNumber(left) + toNumber(right);
    }
    if (node.operator === '-') {
      return toNumber(left) - toNumber(right);
    }
    if (node.operator === '*') {
      return toNumber(left) * toNumber(right);
    }
    if (node.operator === '/') {
      if (toNumber(right) === 0) {
        throw new FormulaError(ERROR_MESSAGES.DIV0);
      }
      return toNumber(left) / toNumber(right);
    }
    return compareValues(left, right, node.operator);
  }

  function evaluateFunction(node, model, trail) {
    var name = node.name;
    var args = node.args.map(function (argument) {
      return evaluateAst(argument, model, trail);
    });
    var values = flatten(args);
    if (name === 'SUM') {
      return values.reduce(function (sum, value) { return sum + toNumber(value); }, 0);
    }
    if (name === 'AVERAGE') {
      return values.length ? values.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / values.length : 0;
    }
    if (name === 'MIN') {
      return values.length ? Math.min.apply(Math, values.map(toNumber)) : 0;
    }
    if (name === 'MAX') {
      return values.length ? Math.max.apply(Math, values.map(toNumber)) : 0;
    }
    if (name === 'COUNT') {
      return values.filter(function (value) {
        return value !== '' && !isNaN(Number(value));
      }).length;
    }
    if (name === 'IF') {
      return toBoolean(args[0]) ? args[1] : args[2];
    }
    if (name === 'AND') {
      return values.every(toBoolean);
    }
    if (name === 'OR') {
      return values.some(toBoolean);
    }
    if (name === 'NOT') {
      return !toBoolean(args[0]);
    }
    if (name === 'ABS') {
      return Math.abs(toNumber(args[0]));
    }
    if (name === 'ROUND') {
      var value = toNumber(args[0]);
      var digits = args.length > 1 ? toNumber(args[1]) : 0;
      var factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    }
    if (name === 'CONCAT') {
      return flatten(args).map(toText).join('');
    }
    throw new FormulaError(ERROR_MESSAGES.ERR);
  }

  function compareValues(left, right, operator) {
    var a = normalizeComparable(left);
    var b = normalizeComparable(right);
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
    if (operator === '>=') {
      return a >= b;
    }
    throw new FormulaError(ERROR_MESSAGES.ERR);
  }

  function normalizeComparable(value) {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '') {
      return 0;
    }
    if (!isNaN(Number(value))) {
      return Number(value);
    }
    return String(value);
  }

  function flatten(values) {
    var result = [];
    for (var i = 0; i < values.length; i += 1) {
      if (Array.isArray(values[i])) {
        result = result.concat(flatten(values[i]));
      } else {
        result.push(values[i]);
      }
    }
    return result;
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return value.length ? toNumber(value[0]) : 0;
    }
    if (value === '' || value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    var numeric = Number(value);
    if (isNaN(numeric)) {
      return 0;
    }
    return numeric;
  }

  function toBoolean(value) {
    if (Array.isArray(value)) {
      return value.some(toBoolean);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (value === '') {
      return false;
    }
    return String(value).toUpperCase() !== 'FALSE';
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return flatten(value).map(toText).join('');
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function coerceReferenceValue(result) {
    if (result.error) {
      throw new FormulaError(result.error);
    }
    return result.value === '' ? 0 : result.value;
  }

  function inferType(value) {
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    return 'text';
  }

  function parseLiteral(raw) {
    var trimmed = raw.trim();
    if (trimmed === '') {
      return { value: '' };
    }
    if (trimmed.toUpperCase() === 'TRUE') {
      return { value: true };
    }
    if (trimmed.toUpperCase() === 'FALSE') {
      return { value: false };
    }
    if (!isNaN(Number(trimmed))) {
      return { value: Number(trimmed) };
    }
    return { value: raw };
  }

  function parseReference(token) {
    var match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(token.toUpperCase());
    if (!match) {
      return null;
    }
    return {
      columnAbsolute: !!match[1],
      column: lettersToIndex(match[2]),
      rowAbsolute: !!match[3],
      row: Number(match[4]) - 1
    };
  }

  function referenceToAddress(reference) {
    if (reference.column < 0 || reference.row < 0 || reference.column >= COLUMN_COUNT || reference.row >= ROW_COUNT) {
      throw new FormulaError(ERROR_MESSAGES.REF);
    }
    return indexToColumn(reference.column) + String(reference.row + 1);
  }

  function expandRange(start, end) {
    var minColumn = Math.min(start.column, end.column);
    var maxColumn = Math.max(start.column, end.column);
    var minRow = Math.min(start.row, end.row);
    var maxRow = Math.max(start.row, end.row);
    var values = [];
    for (var row = minRow; row <= maxRow; row += 1) {
      for (var column = minColumn; column <= maxColumn; column += 1) {
        values.push({ column: column, row: row });
      }
    }
    return values;
  }

  function indexToColumn(index) {
    return String.fromCharCode(65 + index);
  }

  function lettersToIndex(letters) {
    var sum = 0;
    for (var i = 0; i < letters.length; i += 1) {
      sum = sum * 26 + (letters.charCodeAt(i) - 64);
    }
    return sum - 1;
  }

  function shallowCopy(object) {
    var next = {};
    var keys = Object.keys(object);
    for (var i = 0; i < keys.length; i += 1) {
      next[keys[i]] = object[keys[i]];
    }
    return next;
  }

  function cloneSnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
  }

  function normalizeRange(range) {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      startColumn: Math.min(range.startColumn, range.endColumn),
      endRow: Math.max(range.startRow, range.endRow),
      endColumn: Math.max(range.startColumn, range.endColumn)
    };
  }

  function FormulaError(code) {
    this.code = code;
  }

  global.SpreadsheetModel = SpreadsheetModel;
  global.HistoryManager = HistoryManager;
  global.indexToColumn = indexToColumn;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SpreadsheetModel: SpreadsheetModel,
      HistoryManager: HistoryManager,
      indexToColumn: indexToColumn
    };
  }
}(typeof window !== 'undefined' ? window : globalThis));
