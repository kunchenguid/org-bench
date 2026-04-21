(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COL_COUNT = 26;
  var ROW_COUNT = 100;
  var ERROR = {
    ERR: '#ERR!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
    CIRC: '#CIRC!',
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function columnLabelFromIndex(index) {
    var label = '';
    var current = index + 1;
    while (current > 0) {
      var remainder = (current - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      current = Math.floor((current - 1) / 26);
    }
    return label;
  }

  function columnIndexFromLabel(label) {
    var total = 0;
    for (var i = 0; i < label.length; i += 1) {
      total = total * 26 + (label.charCodeAt(i) - 64);
    }
    return total - 1;
  }

  function parseCellId(cellId) {
    var match = /^([A-Z]+)([1-9][0-9]*)$/.exec(String(cellId).toUpperCase());
    if (!match) {
      throw new Error('Invalid cell id: ' + cellId);
    }
    return {
      col: columnIndexFromLabel(match[1]),
      row: Number(match[2]) - 1,
    };
  }

  function formatCellId(col, row) {
    return columnLabelFromIndex(col) + String(row + 1);
  }

  function parseRefToken(token) {
    var match = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/i.exec(token);
    if (!match) {
      throw new Error('Invalid reference: ' + token);
    }
    return {
      colAbs: match[1] === '$',
      col: columnIndexFromLabel(match[2].toUpperCase()),
      rowAbs: match[3] === '$',
      row: Number(match[4]) - 1,
    };
  }

  function formatRefToken(ref) {
    if (ref.invalid) {
      return ERROR.REF;
    }
    return (ref.colAbs ? '$' : '') + columnLabelFromIndex(ref.col) + (ref.rowAbs ? '$' : '') + String(ref.row + 1);
  }

  function tokenizeFormula(source) {
    var tokens = [];
    var i = 0;
    while (i < source.length) {
      var char = source[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }
      var twoChar = source.slice(i, i + 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'op', value: twoChar });
        i += 2;
        continue;
      }
      if ('+-*/&(),:=<>'.indexOf(char) >= 0) {
        tokens.push({ type: 'op', value: char });
        i += 1;
        continue;
      }
      if (char === '"') {
        var value = '';
        i += 1;
        while (i < source.length) {
          if (source[i] === '"') {
            if (source[i + 1] === '"') {
              value += '"';
              i += 2;
              continue;
            }
            break;
          }
          value += source[i];
          i += 1;
        }
        if (source[i] !== '"') {
          throw new Error('Unterminated string');
        }
        tokens.push({ type: 'string', value: value });
        i += 1;
        continue;
      }
      if (char === '#') {
        var errorMatch = /^(#(?:REF!|ERR!|DIV\/0!|CIRC!))/.exec(source.slice(i).toUpperCase());
        if (!errorMatch) {
          throw new Error('Invalid error literal');
        }
        tokens.push({ type: 'error', value: errorMatch[1] });
        i += errorMatch[1].length;
        continue;
      }
      if (/[0-9.]/.test(char)) {
        var numberMatch = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(source.slice(i));
        if (!numberMatch) {
          throw new Error('Invalid number');
        }
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        i += numberMatch[0].length;
        continue;
      }
      if (char === '$' || /[A-Za-z_]/.test(char)) {
        var refMatch = /^\$?[A-Za-z]+\$?[1-9][0-9]*/.exec(source.slice(i));
        if (refMatch) {
          tokens.push({ type: 'cell', value: parseRefToken(refMatch[0].toUpperCase()) });
          i += refMatch[0].length;
          continue;
        }
        var identMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
        if (!identMatch) {
          throw new Error('Invalid identifier');
        }
        tokens.push({ type: 'ident', value: identMatch[0].toUpperCase() });
        i += identMatch[0].length;
        continue;
      }
      throw new Error('Unexpected token: ' + char);
    }
    return tokens;
  }

  function FormulaParser(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  FormulaParser.prototype.peek = function () {
    return this.tokens[this.index] || null;
  };

  FormulaParser.prototype.consume = function (type, value) {
    var token = this.peek();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error('Unexpected token');
    }
    this.index += 1;
    return token;
  };

  FormulaParser.prototype.parse = function () {
    var expression = this.parseComparison();
    if (this.peek()) {
      throw new Error('Trailing tokens');
    }
    return expression;
  };

  FormulaParser.prototype.parseComparison = function () {
    var node = this.parseConcat();
    while (this.peek() && this.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.peek().value) >= 0) {
      var operator = this.consume('op').value;
      node = { type: 'binary', operator: operator, left: node, right: this.parseConcat() };
    }
    return node;
  };

  FormulaParser.prototype.parseConcat = function () {
    var node = this.parseAddSub();
    while (this.peek() && this.peek().type === 'op' && this.peek().value === '&') {
      this.consume('op', '&');
      node = { type: 'binary', operator: '&', left: node, right: this.parseAddSub() };
    }
    return node;
  };

  FormulaParser.prototype.parseAddSub = function () {
    var node = this.parseMulDiv();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      var operator = this.consume('op').value;
      node = { type: 'binary', operator: operator, left: node, right: this.parseMulDiv() };
    }
    return node;
  };

  FormulaParser.prototype.parseMulDiv = function () {
    var node = this.parseUnary();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      var operator = this.consume('op').value;
      node = { type: 'binary', operator: operator, left: node, right: this.parseUnary() };
    }
    return node;
  };

  FormulaParser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'op' && this.peek().value === '-') {
      this.consume('op', '-');
      return { type: 'unary', operator: '-', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  FormulaParser.prototype.parsePrimary = function () {
    var token = this.peek();
    if (!token) {
      throw new Error('Expected expression');
    }
    if (token.type === 'number') {
      this.index += 1;
      return { type: 'number', value: token.value };
    }
    if (token.type === 'string') {
      this.index += 1;
      return { type: 'string', value: token.value };
    }
    if (token.type === 'error') {
      this.index += 1;
      return { type: 'error', value: token.value };
    }
    if (token.type === 'ident' && (token.value === 'TRUE' || token.value === 'FALSE')) {
      this.index += 1;
      return { type: 'boolean', value: token.value === 'TRUE' };
    }
    if (token.type === 'cell') {
      this.index += 1;
      if (this.peek() && this.peek().type === 'op' && this.peek().value === ':') {
        this.consume('op', ':');
        var end = this.consume('cell').value;
        return { type: 'range', start: token.value, end: end };
      }
      return { type: 'cell', ref: token.value };
    }
    if (token.type === 'ident') {
      this.index += 1;
      var name = token.value;
      if (this.peek() && this.peek().type === 'op' && this.peek().value === '(') {
        this.consume('op', '(');
        var args = [];
        if (!(this.peek() && this.peek().type === 'op' && this.peek().value === ')')) {
          while (true) {
            args.push(this.parseComparison());
            if (this.peek() && this.peek().type === 'op' && this.peek().value === ',') {
              this.consume('op', ',');
              continue;
            }
            break;
          }
        }
        this.consume('op', ')');
        return { type: 'func', name: name, args: args };
      }
      throw new Error('Unexpected identifier');
    }
    if (token.type === 'op' && token.value === '(') {
      this.consume('op', '(');
      var node = this.parseComparison();
      this.consume('op', ')');
      return node;
    }
    throw new Error('Expected primary');
  };

  function parseFormula(formula) {
    return new FormulaParser(tokenizeFormula(formula)).parse();
  }

  function isErrorValue(value) {
    return typeof value === 'string' && /^#/.test(value);
  }

  function toNumber(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === '' || value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : ERROR.ERR;
  }

  function toText(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function toBoolean(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return String(value || '').length > 0;
  }

  function flattenValues(values) {
    var flattened = [];
    for (var i = 0; i < values.length; i += 1) {
      if (Array.isArray(values[i])) {
        flattened = flattened.concat(flattenValues(values[i]));
      } else {
        flattened.push(values[i]);
      }
    }
    return flattened;
  }

  function evaluateFunction(name, argNodes, evaluator) {
    var upper = name.toUpperCase();
    if (upper === 'IF') {
      if (argNodes.length < 2) {
        return ERROR.ERR;
      }
      var condition = evaluator(argNodes[0]);
      if (isErrorValue(condition)) {
        return condition;
      }
      return toBoolean(condition) ? evaluator(argNodes[1]) : evaluator(argNodes[2] || { type: 'string', value: '' });
    }

    var args = [];
    for (var i = 0; i < argNodes.length; i += 1) {
      var value = evaluator(argNodes[i]);
      if (isErrorValue(value)) {
        return value;
      }
      args.push(value);
    }

    var flat = flattenValues(args);
    var numericValues;
    switch (upper) {
      case 'SUM':
        numericValues = flat.map(toNumber);
        return numericValues.some(isErrorValue) ? numericValues.find(isErrorValue) : numericValues.reduce(function (sum, value) { return sum + value; }, 0);
      case 'AVERAGE':
        numericValues = flat.map(toNumber);
        if (!numericValues.length) {
          return 0;
        }
        if (numericValues.some(isErrorValue)) {
          return numericValues.find(isErrorValue);
        }
        return numericValues.reduce(function (sum, value) { return sum + value; }, 0) / numericValues.length;
      case 'MIN':
        numericValues = flat.map(toNumber);
        return numericValues.some(isErrorValue) ? numericValues.find(isErrorValue) : Math.min.apply(Math, numericValues);
      case 'MAX':
        numericValues = flat.map(toNumber);
        return numericValues.some(isErrorValue) ? numericValues.find(isErrorValue) : Math.max.apply(Math, numericValues);
      case 'COUNT':
        return flat.filter(function (value) {
          return value !== '' && value !== null && value !== undefined;
        }).length;
      case 'AND':
        return flat.every(function (value) { return toBoolean(value); });
      case 'OR':
        return flat.some(function (value) { return toBoolean(value); });
      case 'NOT':
        return !toBoolean(flat[0]);
      case 'ABS':
        return Math.abs(toNumber(flat[0] || 0));
      case 'ROUND':
        return Number(toNumber(flat[0] || 0).toFixed(Number(flat[1] || 0)));
      case 'CONCAT':
        return flat.map(toText).join('');
      default:
        return ERROR.ERR;
    }
  }

  function formatDisplayValue(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (Object.is(value, -0)) {
        return '0';
      }
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))).replace(/\.0+$/, '');
    }
    return String(value);
  }

  function serializeStateObject(object) {
    return JSON.parse(JSON.stringify(object));
  }

  function createEmptySelection() {
    return {
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    };
  }

  function normalizeRange(selection) {
    var minRow = Math.min(selection.anchor.row, selection.focus.row);
    var maxRow = Math.max(selection.anchor.row, selection.focus.row);
    var minCol = Math.min(selection.anchor.col, selection.focus.col);
    var maxCol = Math.max(selection.anchor.col, selection.focus.col);
    return {
      top: minRow,
      bottom: maxRow,
      left: minCol,
      right: maxCol,
    };
  }

  function iterateFormulaReferences(formula, mapper) {
    if (!formula || formula.charAt(0) !== '=') {
      return formula;
    }
    var output = '=';
    var source = formula.slice(1);
    var index = 0;
    var inString = false;
    while (index < source.length) {
      var char = source[index];
      if (char === '"') {
        output += char;
        if (source[index + 1] === '"') {
          output += '"';
          index += 2;
          continue;
        }
        inString = !inString;
        index += 1;
        continue;
      }
      if (!inString) {
        var match = /^\$?[A-Za-z]+\$?[1-9][0-9]*/.exec(source.slice(index));
        if (match) {
          output += mapper(parseRefToken(match[0].toUpperCase()));
          index += match[0].length;
          continue;
        }
      }
      output += char;
      index += 1;
    }
    return output;
  }

  function shiftFormula(formula, colOffset, rowOffset) {
    return iterateFormulaReferences(formula, function (ref) {
      return formatRefToken({
        colAbs: ref.colAbs,
        rowAbs: ref.rowAbs,
        col: ref.colAbs ? ref.col : ref.col + colOffset,
        row: ref.rowAbs ? ref.row : ref.row + rowOffset,
      });
    });
  }

  function adjustFormulaForInsertRow(formula, rowIndex) {
    return iterateFormulaReferences(formula, function (ref) {
      return formatRefToken({
        colAbs: ref.colAbs,
        rowAbs: ref.rowAbs,
        col: ref.col,
        row: !ref.rowAbs && ref.row >= rowIndex ? ref.row + 1 : ref.row,
      });
    });
  }

  function adjustFormulaForInsertColumn(formula, colIndex) {
    return iterateFormulaReferences(formula, function (ref) {
      return formatRefToken({
        colAbs: ref.colAbs,
        rowAbs: ref.rowAbs,
        col: !ref.colAbs && ref.col >= colIndex ? ref.col + 1 : ref.col,
        row: ref.row,
      });
    });
  }

  function adjustFormulaForDeleteRow(formula, rowIndex) {
    return iterateFormulaReferences(formula, function (ref) {
      if (!ref.rowAbs && ref.row === rowIndex) {
        return ERROR.REF;
      }
      return formatRefToken({
        colAbs: ref.colAbs,
        rowAbs: ref.rowAbs,
        col: ref.col,
        row: !ref.rowAbs && ref.row > rowIndex ? ref.row - 1 : ref.row,
      });
    });
  }

  function adjustFormulaForDeleteColumn(formula, colIndex) {
    return iterateFormulaReferences(formula, function (ref) {
      if (!ref.colAbs && ref.col === colIndex) {
        return ERROR.REF;
      }
      return formatRefToken({
        colAbs: ref.colAbs,
        rowAbs: ref.rowAbs,
        col: !ref.colAbs && ref.col > colIndex ? ref.col - 1 : ref.col,
        row: ref.row,
      });
    });
  }

  function SpreadsheetModel(state) {
    var initialState = state || {};
    this.cells = initialState.cells || {};
    this.selection = initialState.selection || createEmptySelection();
    this.history = [];
    this.future = [];
    this.maxHistory = 50;
  }

  SpreadsheetModel.prototype.snapshot = function () {
    return serializeStateObject({ cells: this.cells, selection: this.selection });
  };

  SpreadsheetModel.prototype.restore = function (state) {
    this.cells = serializeStateObject(state.cells || {});
    this.selection = serializeStateObject(state.selection || createEmptySelection());
  };

  SpreadsheetModel.prototype.recordHistory = function () {
    this.history.push(this.snapshot());
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.future = [];
  };

  SpreadsheetModel.prototype.undo = function () {
    if (!this.history.length) {
      return false;
    }
    this.future.push(this.snapshot());
    this.restore(this.history.pop());
    return true;
  };

  SpreadsheetModel.prototype.redo = function () {
    if (!this.future.length) {
      return false;
    }
    this.history.push(this.snapshot());
    this.restore(this.future.pop());
    return true;
  };

  SpreadsheetModel.prototype.getRaw = function (cellId) {
    return Object.prototype.hasOwnProperty.call(this.cells, cellId) ? this.cells[cellId] : '';
  };

  SpreadsheetModel.prototype.setCell = function (cellId, raw, options) {
    var value = raw == null ? '' : String(raw);
    if (!(options && options.skipHistory)) {
      this.recordHistory();
    }
    if (!value) {
      delete this.cells[cellId];
      return;
    }
    this.cells[cellId] = value;
  };

  SpreadsheetModel.prototype.setCells = function (entries, options) {
    if (!(options && options.skipHistory)) {
      this.recordHistory();
    }
    for (var key in entries) {
      if (Object.prototype.hasOwnProperty.call(entries, key)) {
        if (entries[key] === '') {
          delete this.cells[key];
        } else {
          this.cells[key] = entries[key];
        }
      }
    }
  };

  SpreadsheetModel.prototype.clearRange = function (selection) {
    var range = normalizeRange(selection);
    var updates = {};
    for (var row = range.top; row <= range.bottom; row += 1) {
      for (var col = range.left; col <= range.right; col += 1) {
        updates[formatCellId(col, row)] = '';
      }
    }
    this.setCells(updates);
  };

  SpreadsheetModel.prototype.insertRow = function (rowIndex) {
    this.recordHistory();
    var nextCells = {};
    for (var cellId in this.cells) {
      if (!Object.prototype.hasOwnProperty.call(this.cells, cellId)) {
        continue;
      }
      var coord = parseCellId(cellId);
      var nextRow = coord.row >= rowIndex ? coord.row + 1 : coord.row;
      nextCells[formatCellId(coord.col, nextRow)] = adjustFormulaForInsertRow(this.cells[cellId], rowIndex);
    }
    this.cells = nextCells;
    if (this.selection.anchor.row >= rowIndex) {
      this.selection.anchor.row += 1;
    }
    if (this.selection.focus.row >= rowIndex) {
      this.selection.focus.row += 1;
    }
  };

  SpreadsheetModel.prototype.deleteRow = function (rowIndex) {
    this.recordHistory();
    var nextCells = {};
    for (var cellId in this.cells) {
      if (!Object.prototype.hasOwnProperty.call(this.cells, cellId)) {
        continue;
      }
      var coord = parseCellId(cellId);
      if (coord.row === rowIndex) {
        continue;
      }
      var nextRow = coord.row > rowIndex ? coord.row - 1 : coord.row;
      nextCells[formatCellId(coord.col, nextRow)] = adjustFormulaForDeleteRow(this.cells[cellId], rowIndex);
    }
    this.cells = nextCells;
    this.selection.anchor.row = clamp(this.selection.anchor.row > rowIndex ? this.selection.anchor.row - 1 : this.selection.anchor.row, 0, ROW_COUNT - 1);
    this.selection.focus.row = clamp(this.selection.focus.row > rowIndex ? this.selection.focus.row - 1 : this.selection.focus.row, 0, ROW_COUNT - 1);
  };

  SpreadsheetModel.prototype.insertColumn = function (colIndex) {
    this.recordHistory();
    var nextCells = {};
    for (var cellId in this.cells) {
      if (!Object.prototype.hasOwnProperty.call(this.cells, cellId)) {
        continue;
      }
      var coord = parseCellId(cellId);
      var nextCol = coord.col >= colIndex ? coord.col + 1 : coord.col;
      nextCells[formatCellId(nextCol, coord.row)] = adjustFormulaForInsertColumn(this.cells[cellId], colIndex);
    }
    this.cells = nextCells;
    if (this.selection.anchor.col >= colIndex) {
      this.selection.anchor.col += 1;
    }
    if (this.selection.focus.col >= colIndex) {
      this.selection.focus.col += 1;
    }
  };

  SpreadsheetModel.prototype.deleteColumn = function (colIndex) {
    this.recordHistory();
    var nextCells = {};
    for (var cellId in this.cells) {
      if (!Object.prototype.hasOwnProperty.call(this.cells, cellId)) {
        continue;
      }
      var coord = parseCellId(cellId);
      if (coord.col === colIndex) {
        continue;
      }
      var nextCol = coord.col > colIndex ? coord.col - 1 : coord.col;
      nextCells[formatCellId(nextCol, coord.row)] = adjustFormulaForDeleteColumn(this.cells[cellId], colIndex);
    }
    this.cells = nextCells;
    this.selection.anchor.col = clamp(this.selection.anchor.col > colIndex ? this.selection.anchor.col - 1 : this.selection.anchor.col, 0, COL_COUNT - 1);
    this.selection.focus.col = clamp(this.selection.focus.col > colIndex ? this.selection.focus.col - 1 : this.selection.focus.col, 0, COL_COUNT - 1);
  };

  SpreadsheetModel.prototype.getRangeRaw = function (selection) {
    var range = normalizeRange(selection);
    var rows = [];
    for (var row = range.top; row <= range.bottom; row += 1) {
      var cols = [];
      for (var col = range.left; col <= range.right; col += 1) {
        cols.push(this.getRaw(formatCellId(col, row)));
      }
      rows.push(cols);
    }
    return rows;
  };

  SpreadsheetModel.prototype.evaluateCell = function (cellId, stack, cache) {
    stack = stack || [];
    cache = cache || {};
    if (Object.prototype.hasOwnProperty.call(cache, cellId)) {
      return cache[cellId];
    }
    if (stack.indexOf(cellId) >= 0) {
      cache[cellId] = ERROR.CIRC;
      return ERROR.CIRC;
    }
    var raw = this.getRaw(cellId);
    if (!raw) {
      cache[cellId] = '';
      return '';
    }
    if (raw.charAt(0) !== '=') {
      var numeric = Number(raw);
      cache[cellId] = raw.trim() !== '' && Number.isFinite(numeric) ? numeric : raw;
      return cache[cellId];
    }
    try {
      var ast = parseFormula(raw.slice(1));
      var model = this;
      var nextStack = stack.concat(cellId);
      var evalNode = function (node) {
        switch (node.type) {
          case 'number':
          case 'string':
          case 'boolean':
          case 'error':
            return node.value;
          case 'cell':
            return model.evaluateCell(formatCellId(node.ref.col, node.ref.row), nextStack, cache);
          case 'range': {
            var top = Math.min(node.start.row, node.end.row);
            var bottom = Math.max(node.start.row, node.end.row);
            var left = Math.min(node.start.col, node.end.col);
            var right = Math.max(node.start.col, node.end.col);
            var values = [];
            for (var row = top; row <= bottom; row += 1) {
              for (var col = left; col <= right; col += 1) {
                values.push(model.evaluateCell(formatCellId(col, row), nextStack, cache));
              }
            }
            return values;
          }
          case 'unary': {
            var operand = evalNode(node.operand);
            return isErrorValue(operand) ? operand : -toNumber(operand);
          }
          case 'binary': {
            var leftValue = evalNode(node.left);
            var rightValue = evalNode(node.right);
            if (isErrorValue(leftValue)) {
              return leftValue;
            }
            if (isErrorValue(rightValue)) {
              return rightValue;
            }
            switch (node.operator) {
              case '+': return toNumber(leftValue) + toNumber(rightValue);
              case '-': return toNumber(leftValue) - toNumber(rightValue);
              case '*': return toNumber(leftValue) * toNumber(rightValue);
              case '/':
                if (toNumber(rightValue) === 0) {
                  return ERROR.DIV0;
                }
                return toNumber(leftValue) / toNumber(rightValue);
              case '&': return toText(leftValue) + toText(rightValue);
              case '=': return toText(leftValue) === toText(rightValue);
              case '<>': return toText(leftValue) !== toText(rightValue);
              case '<': return toNumber(leftValue) < toNumber(rightValue);
              case '<=': return toNumber(leftValue) <= toNumber(rightValue);
              case '>': return toNumber(leftValue) > toNumber(rightValue);
              case '>=': return toNumber(leftValue) >= toNumber(rightValue);
              default: return ERROR.ERR;
            }
          }
          case 'func':
            return evaluateFunction(node.name, node.args, evalNode);
          default:
            return ERROR.ERR;
        }
      };
      cache[cellId] = evalNode(ast);
      return cache[cellId];
    } catch (error) {
      cache[cellId] = ERROR.ERR;
      return ERROR.ERR;
    }
  };

  SpreadsheetModel.prototype.getDisplayValue = function (cellId) {
    return formatDisplayValue(this.evaluateCell(cellId, [], {}));
  };

  function stepAddress(cellId, direction, maxColumns, maxRows) {
    var coord = parseCellId(cellId);
    if (direction === 'left') {
      coord.col = clamp(coord.col - 1, 0, maxColumns - 1);
    } else if (direction === 'right') {
      coord.col = clamp(coord.col + 1, 0, maxColumns - 1);
    } else if (direction === 'up') {
      coord.row = clamp(coord.row - 1, 0, maxRows - 1);
    } else if (direction === 'down') {
      coord.row = clamp(coord.row + 1, 0, maxRows - 1);
    }
    return formatCellId(coord.col, coord.row);
  }

  function shouldSyncFormulaBar(activeElement, formulaBar, formulaDraft) {
    return activeElement !== formulaBar || formulaDraft === null;
  }

  return {
    COL_COUNT: COL_COUNT,
    ROW_COUNT: ROW_COUNT,
    SpreadsheetModel: SpreadsheetModel,
    parseCellId: parseCellId,
    formatCellId: formatCellId,
    normalizeRange: normalizeRange,
    shiftFormula: shiftFormula,
    stepAddress: stepAddress,
    shouldSyncFormulaBar: shouldSyncFormulaBar,
  };
});
