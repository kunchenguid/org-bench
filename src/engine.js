(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.OracleSpreadsheetEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EMPTY = { kind: 'empty' };

  function SpreadsheetEngine(options) {
    options = options || {};
    this.rows = options.rows || 100;
    this.cols = options.cols || 26;
    this.cells = new Map();
    this.cache = new Map();
  }

  SpreadsheetEngine.prototype.setCell = function (address, raw) {
    var normalized = normalizeAddress(address);
    var text = raw == null ? '' : String(raw);

    if (text === '') {
      this.cells.delete(normalized);
    } else {
      this.cells.set(normalized, { raw: text });
    }

    this.cache.clear();
  };

  SpreadsheetEngine.prototype.getCellRaw = function (address) {
    var cell = this.cells.get(normalizeAddress(address));
    return cell ? cell.raw : '';
  };

  SpreadsheetEngine.prototype.getCellDisplay = function (address) {
    return displayValue(this.evaluateCell(normalizeAddress(address), []));
  };

  SpreadsheetEngine.prototype.copyRange = function (sourceRange, destinationTopLeft) {
    var source = parseRange(sourceRange);
    var dest = parseCellReference(destinationTopLeft);
    var rowOffset = dest.row - source.start.row;
    var colOffset = dest.col - source.start.col;
    var snapshot = [];
    var row;
    var col;

    for (row = source.start.row; row <= source.end.row; row += 1) {
      for (col = source.start.col; col <= source.end.col; col += 1) {
        snapshot.push({
          sourceRow: row,
          sourceCol: col,
          raw: this.getCellRaw(toAddress(row, col))
        });
      }
    }

    for (var i = 0; i < snapshot.length; i += 1) {
      var entry = snapshot[i];
      var targetRow = entry.sourceRow + rowOffset;
      var targetCol = entry.sourceCol + colOffset;

      if (entry.raw === '') {
        this.setCell(toAddress(targetRow, targetCol), '');
        continue;
      }

      this.setCell(
        toAddress(targetRow, targetCol),
        shiftFormulaForCopy(entry.raw, rowOffset, colOffset)
      );
    }

    this.cache.clear();
  };

  SpreadsheetEngine.prototype.insertRow = function (index) {
    this.rewriteGrid({ type: 'insert-row', index: index });
  };

  SpreadsheetEngine.prototype.deleteRow = function (index) {
    this.rewriteGrid({ type: 'delete-row', index: index });
  };

  SpreadsheetEngine.prototype.insertColumn = function (index) {
    this.rewriteGrid({ type: 'insert-column', index: index });
  };

  SpreadsheetEngine.prototype.deleteColumn = function (index) {
    this.rewriteGrid({ type: 'delete-column', index: index });
  };

  SpreadsheetEngine.prototype.rewriteGrid = function (operation) {
    var nextCells = new Map();
    var entries = Array.from(this.cells.entries());

    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      var location = parseCellReference(entry[0]);
      var nextLocation = shiftLocation(location, operation);

      if (!nextLocation) {
        continue;
      }

      nextCells.set(toAddress(nextLocation.row, nextLocation.col), {
        raw: rewriteFormulaForStructure(entry[1].raw, operation)
      });
    }

    this.cells = nextCells;
    this.cache.clear();
  };

  SpreadsheetEngine.prototype.evaluateCell = function (address, stack) {
    if (this.cache.has(address)) {
      return this.cache.get(address);
    }

    if (stack.indexOf(address) !== -1) {
      return makeError('#CIRC!');
    }

    var raw = this.getCellRaw(address);
    if (raw === '') {
      this.cache.set(address, EMPTY);
      return EMPTY;
    }

    if (raw.charAt(0) !== '=') {
      var literal = parseLiteral(raw);
      this.cache.set(address, literal);
      return literal;
    }

    var result;
    try {
      var parser = new Parser(raw.slice(1));
      var ast = parser.parse();
      result = evaluateAst(ast, this, stack.concat(address));
    } catch (error) {
      result = isEngineError(error) ? error : makeError('#ERR!');
    }

    this.cache.set(address, result);
    return result;
  };

  function parseLiteral(raw) {
    if (/^[-+]?\d+(?:\.\d+)?$/.test(raw.trim())) {
      return Number(raw);
    }

    return raw;
  }

  function displayValue(value) {
    if (isEngineError(value)) {
      return value.code;
    }

    if (value === EMPTY) {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return '#ERR!';
      }
      return String(value);
    }

    return String(value);
  }

  function evaluateAst(node, engine, stack) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'error':
        return makeError(node.code);
      case 'unary':
        return evaluateUnary(node, engine, stack);
      case 'binary':
        return evaluateBinary(node, engine, stack);
      case 'reference':
        return engine.evaluateCell(referenceToAddress(node.reference), stack);
      case 'range':
        return expandRange(node, engine, stack);
      case 'call':
        return evaluateFunction(node, engine, stack);
      default:
        throw makeError('#ERR!');
    }
  }

  function evaluateUnary(node, engine, stack) {
    var value = evaluateAst(node.argument, engine, stack);
    if (isEngineError(value)) {
      return value;
    }

    if (node.operator === '-') {
      return -toNumber(value);
    }

    throw makeError('#ERR!');
  }

  function evaluateBinary(node, engine, stack) {
    var left = evaluateAst(node.left, engine, stack);
    if (isEngineError(left)) {
      return left;
    }

    var right = evaluateAst(node.right, engine, stack);
    if (isEngineError(right)) {
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
          return makeError('#DIV/0!');
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
        throw makeError('#ERR!');
    }
  }

  function compareValues(left, right) {
    if (typeof left === 'string' || typeof right === 'string') {
      return toText(left).localeCompare(toText(right));
    }

    return toNumber(left) - toNumber(right);
  }

  function evaluateFunction(node, engine, stack) {
    var name = node.name;
    var args = [];
    for (var i = 0; i < node.args.length; i += 1) {
      var evaluated = evaluateAst(node.args[i], engine, stack);
      if (isEngineError(evaluated)) {
        return evaluated;
      }
      args.push(evaluated);
    }

    if (name === 'SUM') {
      return flattenValues(args).reduce(function (sum, value) {
        return sum + toNumber(value);
      }, 0);
    }

    if (name === 'AVERAGE') {
      var averageValues = flattenValues(args);
      if (averageValues.length === 0) {
        return 0;
      }
      return averageValues.reduce(function (sum, value) {
        return sum + toNumber(value);
      }, 0) / averageValues.length;
    }

    if (name === 'MIN') {
      return Math.min.apply(Math, flattenValues(args).map(toNumber));
    }

    if (name === 'MAX') {
      return Math.max.apply(Math, flattenValues(args).map(toNumber));
    }

    if (name === 'COUNT') {
      return flattenValues(args).filter(function (value) {
        return value !== EMPTY && value !== '';
      }).length;
    }

    if (name === 'IF') {
      return toBoolean(args[0]) ? args[1] : args[2];
    }

    if (name === 'AND') {
      return flattenValues(args).every(toBoolean);
    }

    if (name === 'OR') {
      return flattenValues(args).some(toBoolean);
    }

    if (name === 'NOT') {
      return !toBoolean(args[0]);
    }

    if (name === 'ABS') {
      return Math.abs(toNumber(args[0]));
    }

    if (name === 'ROUND') {
      var digits = args.length > 1 ? toNumber(args[1]) : 0;
      return roundNumber(toNumber(args[0]), digits);
    }

    if (name === 'CONCAT') {
      return flattenValues(args).map(toText).join('');
    }

    throw makeError('#ERR!');
  }

  function roundNumber(value, digits) {
    var factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function flattenValues(values) {
    var flattened = [];

    for (var i = 0; i < values.length; i += 1) {
      var value = values[i];
      if (Array.isArray(value)) {
        for (var j = 0; j < value.length; j += 1) {
          flattened.push(value[j]);
        }
      } else {
        flattened.push(value);
      }
    }

    return flattened;
  }

  function expandRange(node, engine, stack) {
    var cells = [];
    var rowStart = Math.min(node.start.row, node.end.row);
    var rowEnd = Math.max(node.start.row, node.end.row);
    var colStart = Math.min(node.start.col, node.end.col);
    var colEnd = Math.max(node.start.col, node.end.col);

    for (var row = rowStart; row <= rowEnd; row += 1) {
      for (var col = colStart; col <= colEnd; col += 1) {
        cells.push(engine.evaluateCell(toAddress(row, col), stack));
      }
    }

    return cells;
  }

  function toNumber(value) {
    if (value === EMPTY || value === '') {
      return 0;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    var parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    return 0;
  }

  function toText(value) {
    if (value === EMPTY) {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return String(value);
  }

  function toBoolean(value) {
    if (value === EMPTY) {
      return false;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    return value !== '';
  }

  function makeError(code) {
    return { kind: 'error', code: code };
  }

  function isEngineError(value) {
    return Boolean(value) && value.kind === 'error';
  }

  function shiftFormulaForCopy(raw, rowOffset, colOffset) {
    if (raw.charAt(0) !== '=') {
      return raw;
    }

    return '=' + transformFormula(raw.slice(1), function (reference) {
      return shiftReference(reference, rowOffset, colOffset, true);
    });
  }

  function rewriteFormulaForStructure(raw, operation) {
    if (raw.charAt(0) !== '=') {
      return raw;
    }

    return '=' + transformFormula(raw.slice(1), function (reference) {
      return rewriteReferenceForStructure(reference, operation);
    });
  }

  function transformFormula(formula, transformReference) {
    var parser = new Parser(formula);
    var ast = parser.parse();
    var transformed = transformAst(ast, transformReference);
    return astToFormula(transformed);
  }

  function transformAst(node, transformReference) {
    switch (node.type) {
      case 'reference':
        return {
          type: 'reference',
          reference: transformReference(node.reference)
        };
      case 'range':
        return {
          type: 'range',
          start: transformReference(node.start),
          end: transformReference(node.end)
        };
      case 'binary':
        return {
          type: 'binary',
          operator: node.operator,
          left: transformAst(node.left, transformReference),
          right: transformAst(node.right, transformReference)
        };
      case 'unary':
        return {
          type: 'unary',
          operator: node.operator,
          argument: transformAst(node.argument, transformReference)
        };
      case 'call':
        return {
          type: 'call',
          name: node.name,
          args: node.args.map(function (arg) {
            return transformAst(arg, transformReference);
          })
        };
      default:
        return node;
    }
  }

  function astToFormula(node) {
    switch (node.type) {
      case 'number':
        return String(node.value);
      case 'string':
        return '"' + String(node.value).replace(/"/g, '""') + '"';
      case 'boolean':
        return node.value ? 'TRUE' : 'FALSE';
      case 'error':
        return node.code;
      case 'reference':
        return referenceToString(node.reference);
      case 'range':
        return referenceToString(node.start) + ':' + referenceToString(node.end);
      case 'unary':
        return node.operator + astToFormula(node.argument);
      case 'binary':
        return astToFormula(node.left) + node.operator + astToFormula(node.right);
      case 'call':
        return node.name + '(' + node.args.map(astToFormula).join(',') + ')';
      default:
        throw makeError('#ERR!');
    }
  }

  function shiftReference(reference, rowOffset, colOffset, respectAbsolute) {
    if (reference.type === 'error') {
      return reference;
    }

    var nextRow = reference.row;
    var nextCol = reference.col;

    if (!respectAbsolute || !reference.rowAbs) {
      nextRow += rowOffset;
    }

    if (!respectAbsolute || !reference.colAbs) {
      nextCol += colOffset;
    }

    if (nextRow < 1 || nextCol < 1) {
      return { type: 'error', code: '#REF!' };
    }

    return {
      row: nextRow,
      col: nextCol,
      rowAbs: reference.rowAbs,
      colAbs: reference.colAbs
    };
  }

  function rewriteReferenceForStructure(reference, operation) {
    if (reference.type === 'error') {
      return reference;
    }

    if (operation.type === 'insert-row') {
      return shiftReference(reference, reference.row >= operation.index ? 1 : 0, 0, false);
    }

    if (operation.type === 'insert-column') {
      return shiftReference(reference, 0, reference.col >= operation.index ? 1 : 0, false);
    }

    if (operation.type === 'delete-row') {
      if (reference.row === operation.index) {
        return { type: 'error', code: '#REF!' };
      }
      return shiftReference(reference, reference.row > operation.index ? -1 : 0, 0, false);
    }

    if (operation.type === 'delete-column') {
      if (reference.col === operation.index) {
        return { type: 'error', code: '#REF!' };
      }
      return shiftReference(reference, 0, reference.col > operation.index ? -1 : 0, false);
    }

    return reference;
  }

  function shiftLocation(location, operation) {
    var row = location.row;
    var col = location.col;

    if (operation.type === 'insert-row' && row >= operation.index) {
      return { row: row + 1, col: col };
    }

    if (operation.type === 'delete-row') {
      if (row === operation.index) {
        return null;
      }
      if (row > operation.index) {
        return { row: row - 1, col: col };
      }
    }

    if (operation.type === 'insert-column' && col >= operation.index) {
      return { row: row, col: col + 1 };
    }

    if (operation.type === 'delete-column') {
      if (col === operation.index) {
        return null;
      }
      if (col > operation.index) {
        return { row: row, col: col - 1 };
      }
    }

    return { row: row, col: col };
  }

  function parseRange(range) {
    var parts = String(range).split(':');
    if (parts.length === 1) {
      var cell = parseCellReference(parts[0]);
      return { start: cell, end: cell };
    }

    return {
      start: parseCellReference(parts[0]),
      end: parseCellReference(parts[1])
    };
  }

  function normalizeAddress(address) {
    var parsed = parseCellReference(address);
    return toAddress(parsed.row, parsed.col);
  }

  function parseCellReference(text) {
    var match = /^\$?([A-Z]+)\$?(\d+)$/.exec(String(text).trim());
    if (!match) {
      throw new Error('Invalid cell reference: ' + text);
    }

    return {
      col: lettersToColumn(match[1]),
      row: Number(match[2]),
      colAbs: String(text).trim().indexOf('$') === 0,
      rowAbs: /\$\d+$/.test(String(text).trim())
    };
  }

  function referenceToAddress(reference) {
    return toAddress(reference.row, reference.col);
  }

  function referenceToString(reference) {
    if (reference.type === 'error') {
      return reference.code;
    }

    return (reference.colAbs ? '$' : '') + columnToLetters(reference.col) + (reference.rowAbs ? '$' : '') + String(reference.row);
  }

  function toAddress(row, col) {
    return columnToLetters(col) + String(row);
  }

  function lettersToColumn(letters) {
    var value = 0;
    for (var i = 0; i < letters.length; i += 1) {
      value = value * 26 + (letters.charCodeAt(i) - 64);
    }
    return value;
  }

  function columnToLetters(col) {
    var value = col;
    var result = '';
    while (value > 0) {
      var remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function Parser(input) {
    this.tokenizer = new Tokenizer(input);
    this.current = this.tokenizer.next();
  }

  Parser.prototype.parse = function () {
    var expression = this.parseComparison();
    if (this.current.type !== 'eof') {
      throw makeError('#ERR!');
    }
    return expression;
  };

  Parser.prototype.parseComparison = function () {
    var node = this.parseConcat();
    while (this.current.type === 'operator' && /^(=|<>|<|<=|>|>=)$/.test(this.current.value)) {
      var operator = this.current.value;
      this.advance();
      node = { type: 'binary', operator: operator, left: node, right: this.parseConcat() };
    }
    return node;
  };

  Parser.prototype.parseConcat = function () {
    var node = this.parseAdditive();
    while (this.current.type === 'operator' && this.current.value === '&') {
      this.advance();
      node = { type: 'binary', operator: '&', left: node, right: this.parseAdditive() };
    }
    return node;
  };

  Parser.prototype.parseAdditive = function () {
    var node = this.parseMultiplicative();
    while (this.current.type === 'operator' && (this.current.value === '+' || this.current.value === '-')) {
      var operator = this.current.value;
      this.advance();
      node = { type: 'binary', operator: operator, left: node, right: this.parseMultiplicative() };
    }
    return node;
  };

  Parser.prototype.parseMultiplicative = function () {
    var node = this.parseUnary();
    while (this.current.type === 'operator' && (this.current.value === '*' || this.current.value === '/')) {
      var operator = this.current.value;
      this.advance();
      node = { type: 'binary', operator: operator, left: node, right: this.parseUnary() };
    }
    return node;
  };

  Parser.prototype.parseUnary = function () {
    if (this.current.type === 'operator' && this.current.value === '-') {
      this.advance();
      return { type: 'unary', operator: '-', argument: this.parseUnary() };
    }

    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    var token = this.current;

    if (token.type === 'number') {
      this.advance();
      return { type: 'number', value: token.value };
    }

    if (token.type === 'string') {
      this.advance();
      return { type: 'string', value: token.value };
    }

    if (token.type === 'error') {
      this.advance();
      return { type: 'error', code: token.value };
    }

    if (token.type === 'identifier') {
      this.advance();

      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'boolean', value: token.value === 'TRUE' };
      }

      if (this.current.type === 'paren' && this.current.value === '(') {
        return this.finishCall(token.value);
      }

      if (isCellToken(token.value)) {
        var start = parseTokenReference(token.value);
        if (this.current.type === 'colon') {
          this.advance();
          if (this.current.type !== 'identifier' || !isCellToken(this.current.value)) {
            throw makeError('#ERR!');
          }
          var endToken = this.current.value;
          this.advance();
          return { type: 'range', start: start, end: parseTokenReference(endToken) };
        }

        return { type: 'reference', reference: start };
      }

      throw makeError('#ERR!');
    }

    if (token.type === 'paren' && token.value === '(') {
      this.advance();
      var expression = this.parseComparison();
      this.expect('paren', ')');
      return expression;
    }

    throw makeError('#ERR!');
  };

  Parser.prototype.finishCall = function (name) {
    var args = [];
    this.expect('paren', '(');

    if (!(this.current.type === 'paren' && this.current.value === ')')) {
      while (true) {
        args.push(this.parseComparison());
        if (this.current.type === 'comma') {
          this.advance();
          continue;
        }
        break;
      }
    }

    this.expect('paren', ')');
    return { type: 'call', name: name, args: args };
  };

  Parser.prototype.expect = function (type, value) {
    if (this.current.type !== type || this.current.value !== value) {
      throw makeError('#ERR!');
    }
    this.advance();
  };

  Parser.prototype.advance = function () {
    this.current = this.tokenizer.next();
  };

  function Tokenizer(input) {
    this.input = input;
    this.index = 0;
  }

  Tokenizer.prototype.next = function () {
    this.skipWhitespace();
    if (this.index >= this.input.length) {
      return { type: 'eof', value: '' };
    }

    var char = this.input.charAt(this.index);
    var two = this.input.slice(this.index, this.index + 2);

    if (two === '<=' || two === '>=' || two === '<>') {
      this.index += 2;
      return { type: 'operator', value: two };
    }

    if ('+-*/&=<>'.indexOf(char) !== -1) {
      this.index += 1;
      return { type: 'operator', value: char };
    }

    if (char === '(' || char === ')') {
      this.index += 1;
      return { type: 'paren', value: char };
    }

    if (char === ',') {
      this.index += 1;
      return { type: 'comma', value: ',' };
    }

    if (char === ':') {
      this.index += 1;
      return { type: 'colon', value: ':' };
    }

    if (char === '"') {
      return this.readString();
    }

    if (char === '#') {
      return this.readError();
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(this.input.charAt(this.index + 1)))) {
      return this.readNumber();
    }

    if (char === '$' || /[A-Za-z]/.test(char)) {
      return this.readIdentifier();
    }

    throw makeError('#ERR!');
  };

  Tokenizer.prototype.skipWhitespace = function () {
    while (this.index < this.input.length && /\s/.test(this.input.charAt(this.index))) {
      this.index += 1;
    }
  };

  Tokenizer.prototype.readNumber = function () {
    var start = this.index;
    while (this.index < this.input.length && /[\d.]/.test(this.input.charAt(this.index))) {
      this.index += 1;
    }
    return { type: 'number', value: Number(this.input.slice(start, this.index)) };
  };

  Tokenizer.prototype.readString = function () {
    this.index += 1;
    var result = '';
    while (this.index < this.input.length) {
      var char = this.input.charAt(this.index);
      if (char === '"') {
        if (this.input.charAt(this.index + 1) === '"') {
          result += '"';
          this.index += 2;
          continue;
        }
        this.index += 1;
        return { type: 'string', value: result };
      }
      result += char;
      this.index += 1;
    }

    throw makeError('#ERR!');
  };

  Tokenizer.prototype.readError = function () {
    var start = this.index;
    this.index += 1;
    while (this.index < this.input.length && /[A-Z0-9!\/]/.test(this.input.charAt(this.index))) {
      this.index += 1;
    }
    return { type: 'error', value: this.input.slice(start, this.index) };
  };

  Tokenizer.prototype.readIdentifier = function () {
    var start = this.index;
    while (this.index < this.input.length && /[$A-Za-z0-9]/.test(this.input.charAt(this.index))) {
      this.index += 1;
    }
    return { type: 'identifier', value: this.input.slice(start, this.index).toUpperCase() };
  };

  function isCellToken(token) {
    return /^\$?[A-Z]+\$?\d+$/.test(token);
  }

  function parseTokenReference(token) {
    var match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(token);
    return {
      col: lettersToColumn(match[2]),
      row: Number(match[4]),
      colAbs: match[1] === '$',
      rowAbs: match[3] === '$'
    };
  }

  return {
    SpreadsheetEngine: SpreadsheetEngine,
    EMPTY: EMPTY
  };
});
