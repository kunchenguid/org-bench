(function (globalScope) {
  'use strict';

  var COL_COUNT = 26;
  var ROW_COUNT = 100;
  var HISTORY_LIMIT = 50;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function colToLabel(col) {
    var value = col + 1;
    var label = '';
    while (value > 0) {
      var remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function labelToCol(label) {
    var value = 0;
    for (var i = 0; i < label.length; i += 1) {
      value = value * 26 + (label.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function coordsToRef(row, col) {
    return colToLabel(col) + String(row + 1);
  }

  function parseA1Reference(text, start) {
    var index = start;
    var colAbs = false;
    var rowAbs = false;
    if (text[index] === '$') {
      colAbs = true;
      index += 1;
    }
    var colStart = index;
    while (index < text.length && /[A-Za-z]/.test(text[index])) {
      index += 1;
    }
    if (index === colStart) {
      return null;
    }
    if (text[index] === '$') {
      rowAbs = true;
      index += 1;
    }
    var rowStart = index;
    while (index < text.length && /[0-9]/.test(text[index])) {
      index += 1;
    }
    if (index === rowStart) {
      return null;
    }
    return {
      text: text.slice(start, index),
      end: index,
      colAbs: colAbs,
      rowAbs: rowAbs,
      col: labelToCol(text.slice(colStart, rowAbs ? index - (index - rowStart + 1) : rowStart).toUpperCase()),
      row: Number(text.slice(rowStart, index)) - 1,
    };
  }

  function refToString(ref) {
    if (ref.error) {
      return '#REF!';
    }
    return (ref.colAbs ? '$' : '') + colToLabel(ref.col) + (ref.rowAbs ? '$' : '') + String(ref.row + 1);
  }

  function shiftReference(ref, rowDelta, colDelta) {
    return {
      colAbs: ref.colAbs,
      rowAbs: ref.rowAbs,
      col: ref.colAbs ? ref.col : ref.col + colDelta,
      row: ref.rowAbs ? ref.row : ref.row + rowDelta,
    };
  }

  function transformReference(ref, transform) {
    var next = transform({
      row: ref.row,
      col: ref.col,
      rowAbs: ref.rowAbs,
      colAbs: ref.colAbs,
    });
    if (!next) {
      return { error: true };
    }
    return {
      row: next.row,
      col: next.col,
      rowAbs: ref.rowAbs,
      colAbs: ref.colAbs,
    };
  }

  function remapFormula(formula, transform) {
    if (!formula || formula[0] !== '=') {
      return formula;
    }
    var result = '=';
    var body = formula.slice(1);
    var i = 0;
    while (i < body.length) {
      var char = body[i];
      if (char === '"') {
        var j = i + 1;
        while (j < body.length) {
          if (body[j] === '"' && body[j - 1] !== '\\') {
            j += 1;
            break;
          }
          j += 1;
        }
        result += body.slice(i, j);
        i = j;
        continue;
      }
      var prev = i === 0 ? '' : body[i - 1];
      if ((/[A-Za-z$]/.test(char)) && !/[A-Za-z0-9_.]/.test(prev)) {
        var parsed = parseA1Reference(body, i);
        if (parsed) {
          result += refToString(transformReference(parsed, transform));
          i = parsed.end;
          continue;
        }
      }
      result += char;
      i += 1;
    }
    return result;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createValue(type, value) {
    return { type: type, value: value };
  }

  function errorValue(code) {
    return { type: 'error', value: code };
  }

  function classifyFormulaError(raw) {
    return raw && raw.indexOf('#REF!') >= 0 ? errorValue('#REF!') : errorValue('#ERR!');
  }

  function isError(value) {
    return value && value.type === 'error';
  }

  function flattenArgs(values) {
    var flat = [];
    for (var i = 0; i < values.length; i += 1) {
      var item = values[i];
      if (Array.isArray(item)) {
        flat = flat.concat(flattenArgs(item));
      } else {
        flat.push(item);
      }
    }
    return flat;
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return toNumber(value[0] || createValue('blank', ''));
    }
    if (isError(value)) {
      return value;
    }
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
      if (value.value === '') {
        return 0;
      }
      var parsed = Number(value.value);
      return Number.isFinite(parsed) ? parsed : errorValue('#ERR!');
    }
    return errorValue('#ERR!');
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return toText(value[0] || createValue('blank', ''));
    }
    if (isError(value)) {
      return value;
    }
    if (!value || value.type === 'blank') {
      return '';
    }
    if (value.type === 'boolean') {
      return value.value ? 'TRUE' : 'FALSE';
    }
    return String(value.value);
  }

  function toBoolean(value) {
    if (Array.isArray(value)) {
      return toBoolean(value[0] || createValue('blank', ''));
    }
    if (isError(value)) {
      return value;
    }
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
      var upper = value.value.toUpperCase();
      if (upper === 'TRUE') {
        return true;
      }
      if (upper === 'FALSE' || upper === '') {
        return false;
      }
      return true;
    }
    return false;
  }

  function valuesEqual(left, right) {
    if (left.type === 'blank' && right.type === 'blank') {
      return true;
    }
    if (left.type === 'number' || right.type === 'number') {
      var leftNumber = toNumber(left);
      var rightNumber = toNumber(right);
      if (isError(leftNumber)) {
        return leftNumber;
      }
      if (isError(rightNumber)) {
        return rightNumber;
      }
      return leftNumber === rightNumber;
    }
    return toText(left) === toText(right);
  }

  function formatDisplay(value) {
    if (isError(value)) {
      return value.value;
    }
    if (!value || value.type === 'blank') {
      return '';
    }
    if (value.type === 'boolean') {
      return value.value ? 'TRUE' : 'FALSE';
    }
    if (value.type === 'number') {
      if (Number.isInteger(value.value)) {
        return String(value.value);
      }
      return String(Number(value.value.toFixed(10)));
    }
    return String(value.value);
  }

  function tokenizeFormula(input) {
    var tokens = [];
    var i = 0;
    while (i < input.length) {
      var char = input[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }
      if (char === '"') {
        var j = i + 1;
        var stringValue = '';
        while (j < input.length) {
          if (input[j] === '"') {
            j += 1;
            break;
          }
          stringValue += input[j];
          j += 1;
        }
        if (j > input.length) {
          throw new Error('Bad string');
        }
        tokens.push({ type: 'string', value: stringValue });
        i = j;
        continue;
      }
      var two = input.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      if ('+-*/()=:,&<>'.indexOf(char) >= 0) {
        tokens.push({ type: char === ',' ? 'comma' : (char === '(' || char === ')' || char === ':' ? char : 'op'), value: char });
        i += 1;
        continue;
      }
      if (/[0-9.]/.test(char)) {
        var endNumber = i + 1;
        while (endNumber < input.length && /[0-9.]/.test(input[endNumber])) {
          endNumber += 1;
        }
        tokens.push({ type: 'number', value: Number(input.slice(i, endNumber)) });
        i = endNumber;
        continue;
      }
      if (/[A-Za-z_$#]/.test(char)) {
        var parsedRef = parseA1Reference(input, i);
        if (parsedRef) {
          tokens.push({ type: 'ref', value: parsedRef });
          i = parsedRef.end;
          continue;
        }
        var endIdentifier = i + 1;
        while (endIdentifier < input.length && /[A-Za-z0-9_!]/.test(input[endIdentifier])) {
          endIdentifier += 1;
        }
        tokens.push({ type: 'identifier', value: input.slice(i, endIdentifier).toUpperCase() });
        i = endIdentifier;
        continue;
      }
      throw new Error('Bad token');
    }
    return tokens;
  }

  function FormulaParser(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  FormulaParser.prototype.peek = function () {
    return this.tokens[this.index];
  };

  FormulaParser.prototype.consume = function (type, value) {
    var token = this.tokens[this.index];
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error('Unexpected token');
    }
    this.index += 1;
    return token;
  };

  FormulaParser.prototype.parse = function () {
    var expression = this.parseComparison();
    if (this.index !== this.tokens.length) {
      throw new Error('Trailing tokens');
    }
    return expression;
  };

  FormulaParser.prototype.parseComparison = function () {
    var left = this.parseConcat();
    while (this.peek() && this.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.peek().value) >= 0) {
      var operator = this.consume('op').value;
      var right = this.parseConcat();
      left = { type: 'binary', operator: operator, left: left, right: right };
    }
    return left;
  };

  FormulaParser.prototype.parseConcat = function () {
    var left = this.parseAddSub();
    while (this.peek() && this.peek().type === 'op' && this.peek().value === '&') {
      this.consume('op', '&');
      left = { type: 'binary', operator: '&', left: left, right: this.parseAddSub() };
    }
    return left;
  };

  FormulaParser.prototype.parseAddSub = function () {
    var left = this.parseMulDiv();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      var operator = this.consume('op').value;
      left = { type: 'binary', operator: operator, left: left, right: this.parseMulDiv() };
    }
    return left;
  };

  FormulaParser.prototype.parseMulDiv = function () {
    var left = this.parseUnary();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      var operator = this.consume('op').value;
      left = { type: 'binary', operator: operator, left: left, right: this.parseUnary() };
    }
    return left;
  };

  FormulaParser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'op' && this.peek().value === '-') {
      this.consume('op', '-');
      return { type: 'unary', operator: '-', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  FormulaParser.prototype.parsePrimary = function () {
    var token = this.peek();
    if (!token) {
      throw new Error('Missing expression');
    }
    if (token.type === 'number') {
      return { type: 'literal', value: createValue('number', this.consume('number').value) };
    }
    if (token.type === 'string') {
      return { type: 'literal', value: createValue('string', this.consume('string').value) };
    }
    if (token.type === 'identifier' && (token.value === 'TRUE' || token.value === 'FALSE')) {
      return { type: 'literal', value: createValue('boolean', this.consume('identifier').value === 'TRUE') };
    }
    if (token.type === 'ref') {
      var ref = this.consume('ref').value;
      if (this.peek() && this.peek().type === ':') {
        this.consume(':', ':');
        var endRef = this.consume('ref').value;
        return { type: 'range', start: ref, end: endRef };
      }
      return { type: 'ref', ref: ref };
    }
    if (token.type === 'identifier') {
      var name = this.consume('identifier').value;
      if (name === '#REF!') {
        return { type: 'literal', value: errorValue('#REF!') };
      }
      this.consume('(', '(');
      var args = [];
      if (!this.peek() || this.peek().type !== ')') {
        do {
          args.push(this.parseComparison());
          if (!this.peek() || this.peek().type !== 'comma') {
            break;
          }
          this.consume('comma');
        } while (true);
      }
      this.consume(')', ')');
      return { type: 'call', name: name, args: args };
    }
    if (token.type === '(') {
      this.consume('(', '(');
      var expression = this.parseComparison();
      this.consume(')', ')');
      return expression;
    }
    throw new Error('Bad primary');
  };

  function parseFormula(formula) {
    return new FormulaParser(tokenizeFormula(formula)).parse();
  }

  function SpreadsheetModel(data) {
    data = data || {};
    this.rows = data.rows || ROW_COUNT;
    this.cols = data.cols || COL_COUNT;
    this.cells = Object.assign({}, data.cells || {});
    this.undoStack = data.undoStack ? deepClone(data.undoStack) : [];
    this.redoStack = data.redoStack ? deepClone(data.redoStack) : [];
    this.clipboard = data.clipboard ? deepClone(data.clipboard) : null;
  }

  SpreadsheetModel.prototype.snapshot = function () {
    return {
      rows: this.rows,
      cols: this.cols,
      cells: deepClone(this.cells),
      clipboard: deepClone(this.clipboard),
    };
  };

  SpreadsheetModel.prototype.restoreSnapshot = function (snapshot) {
    this.rows = snapshot.rows;
    this.cols = snapshot.cols;
    this.cells = deepClone(snapshot.cells || {});
    this.clipboard = deepClone(snapshot.clipboard || null);
  };

  SpreadsheetModel.prototype.recordHistory = function (before) {
    this.undoStack.push({ before: before, after: this.snapshot() });
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  };

  SpreadsheetModel.prototype.getCellRaw = function (ref) {
    return this.cells[ref] || '';
  };

  SpreadsheetModel.prototype.setCellRaw = function (ref, raw) {
    if (raw === '' || raw === null || raw === undefined) {
      delete this.cells[ref];
      return;
    }
    this.cells[ref] = String(raw);
  };

  SpreadsheetModel.prototype.getCellValue = function (ref, cache, path) {
    cache = cache || {};
    path = path || [];
    if (cache[ref]) {
      return cache[ref];
    }
    if (path.indexOf(ref) >= 0) {
      return errorValue('#CIRC!');
    }
    var raw = this.getCellRaw(ref);
    if (!raw) {
      return createValue('blank', '');
    }
    if (raw[0] !== '=') {
      if (/^[-+]?\d+(?:\.\d+)?$/.test(raw.trim())) {
        return createValue('number', Number(raw));
      }
      if (raw.toUpperCase() === 'TRUE' || raw.toUpperCase() === 'FALSE') {
        return createValue('boolean', raw.toUpperCase() === 'TRUE');
      }
      return createValue('string', raw);
    }
    try {
      var ast = parseFormula(raw.slice(1));
      var value = this.evaluateAst(ast, cache, path.concat(ref));
      cache[ref] = value;
      return value;
    } catch (error) {
      return classifyFormulaError(raw);
    }
  };

  SpreadsheetModel.prototype.evaluateAst = function (node, cache, path) {
    if (node.type === 'literal') {
      return node.value;
    }
    if (node.type === 'ref') {
      return this.getCellValue(refToString(node.ref).replace(/\$/g, ''), cache, path);
    }
    if (node.type === 'range') {
      return this.getRangeValues(node.start, node.end, cache, path);
    }
    if (node.type === 'unary') {
      var unaryValue = this.evaluateAst(node.argument, cache, path);
      if (isError(unaryValue)) {
        return unaryValue;
      }
      var unaryNumber = toNumber(unaryValue);
      if (isError(unaryNumber)) {
        return unaryNumber;
      }
      return createValue('number', -unaryNumber);
    }
    if (node.type === 'binary') {
      var left = this.evaluateAst(node.left, cache, path);
      var right = this.evaluateAst(node.right, cache, path);
      if (isError(left)) {
        return left;
      }
      if (isError(right)) {
        return right;
      }
      if (node.operator === '&') {
        var leftText = toText(left);
        var rightText = toText(right);
        if (isError(leftText)) {
          return leftText;
        }
        if (isError(rightText)) {
          return rightText;
        }
        return createValue('string', leftText + rightText);
      }
      if (['+', '-', '*', '/'].indexOf(node.operator) >= 0) {
        var leftNumber = toNumber(left);
        var rightNumber = toNumber(right);
        if (isError(leftNumber)) {
          return leftNumber;
        }
        if (isError(rightNumber)) {
          return rightNumber;
        }
        if (node.operator === '+') {
          return createValue('number', leftNumber + rightNumber);
        }
        if (node.operator === '-') {
          return createValue('number', leftNumber - rightNumber);
        }
        if (node.operator === '*') {
          return createValue('number', leftNumber * rightNumber);
        }
        if (rightNumber === 0) {
          return errorValue('#DIV/0!');
        }
        return createValue('number', leftNumber / rightNumber);
      }
      var comparison = valuesEqual(left, right);
      if (isError(comparison)) {
        return comparison;
      }
      if (node.operator === '=') {
        return createValue('boolean', comparison);
      }
      if (node.operator === '<>') {
        return createValue('boolean', !comparison);
      }
      var leftNumberCompare = toNumber(left);
      var rightNumberCompare = toNumber(right);
      if (isError(leftNumberCompare)) {
        return leftNumberCompare;
      }
      if (isError(rightNumberCompare)) {
        return rightNumberCompare;
      }
      if (node.operator === '<') {
        return createValue('boolean', leftNumberCompare < rightNumberCompare);
      }
      if (node.operator === '<=') {
        return createValue('boolean', leftNumberCompare <= rightNumberCompare);
      }
      if (node.operator === '>') {
        return createValue('boolean', leftNumberCompare > rightNumberCompare);
      }
      if (node.operator === '>=') {
        return createValue('boolean', leftNumberCompare >= rightNumberCompare);
      }
    }
    if (node.type === 'call') {
      return this.evaluateFunction(node.name, node.args, cache, path);
    }
    return errorValue('#ERR!');
  };

  SpreadsheetModel.prototype.getRangeValues = function (start, end, cache, path) {
    var minRow = Math.min(start.row, end.row);
    var maxRow = Math.max(start.row, end.row);
    var minCol = Math.min(start.col, end.col);
    var maxCol = Math.max(start.col, end.col);
    var values = [];
    for (var row = minRow; row <= maxRow; row += 1) {
      var line = [];
      for (var col = minCol; col <= maxCol; col += 1) {
        line.push(this.getCellValue(coordsToRef(row, col), cache, path));
      }
      values.push(line);
    }
    return values;
  };

  SpreadsheetModel.prototype.evaluateFunction = function (name, args, cache, path) {
    var evaluated = [];
    for (var i = 0; i < args.length; i += 1) {
      var value = this.evaluateAst(args[i], cache, path);
      if (isError(value)) {
        return value;
      }
      evaluated.push(value);
    }
    var flat = flattenArgs(evaluated);
    if (name === 'SUM') {
      var sum = 0;
      for (i = 0; i < flat.length; i += 1) {
        var itemNumber = toNumber(flat[i]);
        if (isError(itemNumber)) {
          return itemNumber;
        }
        sum += itemNumber;
      }
      return createValue('number', sum);
    }
    if (name === 'AVERAGE') {
      var total = 0;
      for (i = 0; i < flat.length; i += 1) {
        itemNumber = toNumber(flat[i]);
        if (isError(itemNumber)) {
          return itemNumber;
        }
        total += itemNumber;
      }
      return createValue('number', flat.length ? total / flat.length : 0);
    }
    if (name === 'MIN' || name === 'MAX') {
      var numbers = [];
      for (i = 0; i < flat.length; i += 1) {
        itemNumber = toNumber(flat[i]);
        if (isError(itemNumber)) {
          return itemNumber;
        }
        numbers.push(itemNumber);
      }
      return createValue('number', numbers.length ? (name === 'MIN' ? Math.min.apply(Math, numbers) : Math.max.apply(Math, numbers)) : 0);
    }
    if (name === 'COUNT') {
      var count = 0;
      for (i = 0; i < flat.length; i += 1) {
        if (flat[i] && flat[i].type === 'number') {
          count += 1;
        }
      }
      return createValue('number', count);
    }
    if (name === 'IF') {
      return toBoolean(evaluated[0]) ? evaluated[1] : (evaluated[2] || createValue('blank', ''));
    }
    if (name === 'AND') {
      for (i = 0; i < evaluated.length; i += 1) {
        if (!toBoolean(evaluated[i])) {
          return createValue('boolean', false);
        }
      }
      return createValue('boolean', true);
    }
    if (name === 'OR') {
      for (i = 0; i < evaluated.length; i += 1) {
        if (toBoolean(evaluated[i])) {
          return createValue('boolean', true);
        }
      }
      return createValue('boolean', false);
    }
    if (name === 'NOT') {
      return createValue('boolean', !toBoolean(evaluated[0] || createValue('blank', '')));
    }
    if (name === 'ABS') {
      itemNumber = toNumber(evaluated[0] || createValue('number', 0));
      return isError(itemNumber) ? itemNumber : createValue('number', Math.abs(itemNumber));
    }
    if (name === 'ROUND') {
      var roundValue = toNumber(evaluated[0] || createValue('number', 0));
      var places = toNumber(evaluated[1] || createValue('number', 0));
      if (isError(roundValue)) {
        return roundValue;
      }
      if (isError(places)) {
        return places;
      }
      var factor = Math.pow(10, places);
      return createValue('number', Math.round(roundValue * factor) / factor);
    }
    if (name === 'CONCAT') {
      var text = '';
      for (i = 0; i < flat.length; i += 1) {
        var nextText = toText(flat[i]);
        if (isError(nextText)) {
          return nextText;
        }
        text += nextText;
      }
      return createValue('string', text);
    }
    return errorValue('#ERR!');
  };

  SpreadsheetModel.prototype.getDisplayValue = function (ref) {
    return formatDisplay(this.getCellValue(ref));
  };

  SpreadsheetModel.prototype.normalizeRange = function (range) {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      endRow: Math.max(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endCol: Math.max(range.startCol, range.endCol),
    };
  };

  SpreadsheetModel.prototype.readRange = function (range) {
    var normalized = this.normalizeRange(range);
    var matrix = [];
    for (var row = normalized.startRow; row <= normalized.endRow; row += 1) {
      var line = [];
      for (var col = normalized.startCol; col <= normalized.endCol; col += 1) {
        line.push({ raw: this.getCellRaw(coordsToRef(row, col)) });
      }
      matrix.push(line);
    }
    return matrix;
  };

  SpreadsheetModel.prototype.applyMatrix = function (range, matrix) {
    var normalized = this.normalizeRange(range);
    for (var row = normalized.startRow; row <= normalized.endRow; row += 1) {
      for (var col = normalized.startCol; col <= normalized.endCol; col += 1) {
        var sourceRow = Math.min(row - normalized.startRow, matrix.length - 1);
        var sourceCol = Math.min(col - normalized.startCol, matrix[sourceRow].length - 1);
        var next = matrix[sourceRow][sourceCol];
        this.setCellRaw(coordsToRef(row, col), next && next.raw ? next.raw : '');
      }
    }
  };

  SpreadsheetModel.prototype.applyEdit = function (range, matrix, skipHistory) {
    var before = this.snapshot();
    this.applyMatrix(range, matrix);
    if (!skipHistory) {
      this.recordHistory(before);
    }
  };

  SpreadsheetModel.prototype.copyRange = function (range, cut) {
    var normalized = this.normalizeRange(range);
    var matrix = this.readRange(normalized);
    this.clipboard = {
      matrix: matrix,
      width: normalized.endCol - normalized.startCol + 1,
      height: normalized.endRow - normalized.startRow + 1,
      source: normalized,
      cut: !!cut,
    };
  };

  SpreadsheetModel.prototype.shiftFormulaForPaste = function (formula, rowDelta, colDelta) {
    return remapFormula(formula, function (ref) {
      return shiftReference(ref, rowDelta, colDelta);
    });
  };

  SpreadsheetModel.prototype.pasteRange = function (targetRange) {
    if (!this.clipboard) {
      return;
    }
    var before = this.snapshot();
    var normalized = this.normalizeRange(targetRange);
    var width = normalized.endCol - normalized.startCol + 1;
    var height = normalized.endRow - normalized.startRow + 1;
    var matrix = [];
    var source = this.clipboard.source;
    var rowDelta = normalized.startRow - source.startRow;
    var colDelta = normalized.startCol - source.startCol;
    for (var row = 0; row < height; row += 1) {
      var line = [];
      for (var col = 0; col < width; col += 1) {
        var sourceCell = this.clipboard.matrix[row % this.clipboard.height][col % this.clipboard.width];
        var raw = sourceCell.raw || '';
        if (raw[0] === '=') {
          raw = this.shiftFormulaForPaste(raw, rowDelta + (row - (row % this.clipboard.height)), colDelta + (col - (col % this.clipboard.width)));
        }
        line.push({ raw: raw });
      }
      matrix.push(line);
    }
    this.applyMatrix(normalized, matrix);
    if (this.clipboard.cut) {
      this.applyMatrix(this.clipboard.source, this.createBlankMatrix(this.clipboard.height, this.clipboard.width));
      this.clipboard.cut = false;
    }
    this.recordHistory(before);
  };

  SpreadsheetModel.prototype.createBlankMatrix = function (height, width) {
    var matrix = [];
    for (var row = 0; row < height; row += 1) {
      var line = [];
      for (var col = 0; col < width; col += 1) {
        line.push({ raw: '' });
      }
      matrix.push(line);
    }
    return matrix;
  };

  SpreadsheetModel.prototype.clearRange = function (range) {
    this.applyEdit(this.normalizeRange(range), this.createBlankMatrix(range.endRow - range.startRow + 1, range.endCol - range.startCol + 1));
  };

  SpreadsheetModel.prototype.remapAllCells = function (cellTransform, formulaTransform) {
    var next = {};
    var refs = Object.keys(this.cells);
    for (var i = 0; i < refs.length; i += 1) {
      var ref = refs[i];
      var parsed = parseA1Reference(ref, 0);
      var coords = cellTransform({ row: parsed.row, col: parsed.col });
      if (!coords) {
        continue;
      }
      var raw = this.cells[ref];
      if (raw[0] === '=') {
        raw = remapFormula(raw, formulaTransform);
      }
      next[coordsToRef(coords.row, coords.col)] = raw;
    }
    this.cells = next;
  };

  SpreadsheetModel.prototype.insertRow = function (index) {
    var before = this.snapshot();
    this.rows += 1;
    this.remapAllCells(function (coords) {
      return { row: coords.row >= index ? coords.row + 1 : coords.row, col: coords.col };
    }, function (ref) {
      return { row: ref.row >= index ? ref.row + 1 : ref.row, col: ref.col };
    });
    this.recordHistory(before);
  };

  SpreadsheetModel.prototype.deleteRow = function (index) {
    var before = this.snapshot();
    this.rows = Math.max(1, this.rows - 1);
    this.remapAllCells(function (coords) {
      if (coords.row === index) {
        return null;
      }
      return { row: coords.row > index ? coords.row - 1 : coords.row, col: coords.col };
    }, function (ref) {
      if (ref.row === index) {
        return null;
      }
      return { row: ref.row > index ? ref.row - 1 : ref.row, col: ref.col };
    });
    this.recordHistory(before);
  };

  SpreadsheetModel.prototype.insertCol = function (index) {
    var before = this.snapshot();
    this.cols += 1;
    this.remapAllCells(function (coords) {
      return { row: coords.row, col: coords.col >= index ? coords.col + 1 : coords.col };
    }, function (ref) {
      return { row: ref.row, col: ref.col >= index ? ref.col + 1 : ref.col };
    });
    this.recordHistory(before);
  };

  SpreadsheetModel.prototype.deleteCol = function (index) {
    var before = this.snapshot();
    this.cols = Math.max(1, this.cols - 1);
    this.remapAllCells(function (coords) {
      if (coords.col === index) {
        return null;
      }
      return { row: coords.row, col: coords.col > index ? coords.col - 1 : coords.col };
    }, function (ref) {
      if (ref.col === index) {
        return null;
      }
      return { row: ref.row, col: ref.col > index ? ref.col - 1 : ref.col };
    });
    this.recordHistory(before);
  };

  SpreadsheetModel.prototype.undo = function () {
    var entry = this.undoStack.pop();
    if (!entry) {
      return false;
    }
    this.redoStack.push({ before: this.snapshot(), after: entry.after });
    this.restoreSnapshot(entry.before);
    return true;
  };

  SpreadsheetModel.prototype.redo = function () {
    var entry = this.redoStack.pop();
    if (!entry) {
      return false;
    }
    this.undoStack.push({ before: this.snapshot(), after: entry.after });
    this.restoreSnapshot(entry.after);
    return true;
  };

  SpreadsheetModel.prototype.serialize = function () {
    return {
      rows: this.rows,
      cols: this.cols,
      cells: this.cells,
    };
  };

  SpreadsheetModel.fromJSON = function (data) {
    return new SpreadsheetModel(data);
  };

  function getStorageNamespace() {
    if (typeof window === 'undefined') {
      return 'spreadsheet';
    }
    return window.__BENCHMARK_STORAGE_NAMESPACE__ || window.__RUN_STORAGE_NAMESPACE__ || window.__STORAGE_NAMESPACE__ || 'spreadsheet';
  }

  function createApp() {
    if (typeof document === 'undefined') {
      return;
    }
    var namespace = getStorageNamespace();
    var storageKey = namespace + ':sheet-state';
    var selectionKey = namespace + ':sheet-selection';
    var stored = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch (error) {
      stored = null;
    }
    var model = SpreadsheetModel.fromJSON(stored ? JSON.parse(stored) : null);
    var selected = { row: 0, col: 0 };
    var range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    var dragAnchor = null;
    var editing = null;
    try {
      var storedSelection = window.localStorage.getItem(selectionKey);
      if (storedSelection) {
        selected = JSON.parse(storedSelection);
        range = { startRow: selected.row, endRow: selected.row, startCol: selected.col, endCol: selected.col };
      }
    } catch (error2) {
      selected = { row: 0, col: 0 };
    }

    var app = document.querySelector('.app');
    var formulaInput = document.querySelector('#formula-input');
    var formulaLabel = document.querySelector('#active-ref');
    var sheet = document.querySelector('#sheet');
    var editor = document.querySelector('#cell-editor');
    var menu = document.querySelector('#header-menu');

    function save() {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(model.serialize()));
        window.localStorage.setItem(selectionKey, JSON.stringify(selected));
      } catch (error3) {
        return;
      }
    }

    function isInRange(row, col, current) {
      return row >= current.startRow && row <= current.endRow && col >= current.startCol && col <= current.endCol;
    }

    function render() {
      formulaLabel.textContent = coordsToRef(selected.row, selected.col);
      formulaInput.value = model.getCellRaw(coordsToRef(selected.row, selected.col));
      sheet.innerHTML = '';

      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      var corner = document.createElement('th');
      corner.className = 'corner';
      headRow.appendChild(corner);
      for (var col = 0; col < model.cols; col += 1) {
        var header = document.createElement('th');
        header.className = 'col-header';
        header.dataset.col = String(col);
        header.textContent = colToLabel(col);
        header.title = 'Right-click for insert/delete';
        headRow.appendChild(header);
      }
      thead.appendChild(headRow);
      sheet.appendChild(thead);

      var tbody = document.createElement('tbody');
      var normalized = model.normalizeRange(range);
      for (var row = 0; row < model.rows; row += 1) {
        var tr = document.createElement('tr');
        var rowHeader = document.createElement('th');
        rowHeader.className = 'row-header';
        rowHeader.dataset.row = String(row);
        rowHeader.textContent = String(row + 1);
        rowHeader.title = 'Right-click for insert/delete';
        tr.appendChild(rowHeader);
        for (col = 0; col < model.cols; col += 1) {
          var td = document.createElement('td');
          td.className = 'cell';
          td.dataset.row = String(row);
          td.dataset.col = String(col);
          if (isInRange(row, col, normalized)) {
            td.classList.add('in-range');
          }
          if (row === selected.row && col === selected.col) {
            td.classList.add('active');
          }
          var ref = coordsToRef(row, col);
          var raw = model.getCellRaw(ref);
          var display = model.getDisplayValue(ref);
          if (display && /^[-+]?\d+(?:\.\d+)?$/.test(display)) {
            td.classList.add('numeric');
          }
          td.textContent = display;
          td.dataset.raw = raw;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      sheet.appendChild(tbody);
      if (editing) {
        positionEditor();
      }
      save();
    }

    function setSelection(row, col, extend) {
      row = clamp(row, 0, model.rows - 1);
      col = clamp(col, 0, model.cols - 1);
      selected = { row: row, col: col };
      if (extend) {
        range.endRow = row;
        range.endCol = col;
      } else {
        range = { startRow: row, endRow: row, startCol: col, endCol: col };
      }
      render();
    }

    function commitValue(raw, move) {
      model.applyEdit(range, [[{ raw: raw }]]);
      editing = null;
      editor.hidden = true;
      render();
      if (move === 'down') {
        setSelection(selected.row + 1, selected.col, false);
      } else if (move === 'right') {
        setSelection(selected.row, selected.col + 1, false);
      }
    }

    function positionEditor() {
      var cell = sheet.querySelector('td[data-row="' + selected.row + '"][data-col="' + selected.col + '"]');
      if (!cell) {
        return;
      }
      var cellBox = cell.getBoundingClientRect();
      var appBox = app.getBoundingClientRect();
      editor.hidden = false;
      editor.style.left = (cellBox.left - appBox.left + app.scrollLeft) + 'px';
      editor.style.top = (cellBox.top - appBox.top + app.scrollTop) + 'px';
      editor.style.width = cellBox.width + 'px';
      editor.style.height = cellBox.height + 'px';
      editor.value = editing.raw;
      window.requestAnimationFrame(function () {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      });
    }

    function startEdit(seed, replace) {
      var raw = model.getCellRaw(coordsToRef(selected.row, selected.col));
      editing = { raw: replace ? seed : (seed !== undefined ? raw + seed : raw), original: raw };
      positionEditor();
      formulaInput.value = editing.raw;
    }

    function copySelection(cut) {
      model.copyRange(range, cut);
    }

    function textToMatrix(text) {
      return text.split(/\r?\n/).map(function (line) {
        return line.split('\t').map(function (value) {
          return { raw: value };
        });
      });
    }

    function matrixToText(matrix) {
      return matrix.map(function (line) {
        return line.map(function (cell) { return cell.raw || ''; }).join('\t');
      }).join('\n');
    }

    sheet.addEventListener('mousedown', function (event) {
      var cell = event.target.closest('td.cell');
      if (!cell) {
        return;
      }
      dragAnchor = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      setSelection(dragAnchor.row, dragAnchor.col, false);
    });

    sheet.addEventListener('mousemove', function (event) {
      if (!dragAnchor) {
        return;
      }
      var cell = event.target.closest('td.cell');
      if (!cell) {
        return;
      }
      selected = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      range = { startRow: dragAnchor.row, endRow: selected.row, startCol: dragAnchor.col, endCol: selected.col };
      render();
    });

    window.addEventListener('mouseup', function () {
      dragAnchor = null;
    });

    sheet.addEventListener('dblclick', function (event) {
      var cell = event.target.closest('td.cell');
      if (!cell) {
        return;
      }
      setSelection(Number(cell.dataset.row), Number(cell.dataset.col), false);
      startEdit(undefined, false);
    });

    sheet.addEventListener('contextmenu', function (event) {
      var target = event.target.closest('th.row-header, th.col-header');
      if (!target) {
        return;
      }
      event.preventDefault();
      menu.hidden = false;
      menu.style.left = event.pageX + 'px';
      menu.style.top = event.pageY + 'px';
      menu.dataset.kind = target.classList.contains('row-header') ? 'row' : 'col';
      menu.dataset.index = target.dataset.row || target.dataset.col;
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('#header-menu')) {
        menu.hidden = true;
      }
    });

    menu.addEventListener('click', function (event) {
      var action = event.target.dataset.action;
      if (!action) {
        return;
      }
      var index = Number(menu.dataset.index);
      var kind = menu.dataset.kind;
      if (kind === 'row') {
        if (action === 'insert-before') {
          model.insertRow(index);
        } else if (action === 'insert-after') {
          model.insertRow(index + 1);
        } else if (action === 'delete') {
          model.deleteRow(index);
        }
      } else {
        if (action === 'insert-before') {
          model.insertCol(index);
        } else if (action === 'insert-after') {
          model.insertCol(index + 1);
        } else if (action === 'delete') {
          model.deleteCol(index);
        }
      }
      setSelection(selected.row, selected.col, false);
      menu.hidden = true;
    });

    formulaInput.addEventListener('focus', function () {
      editing = { raw: formulaInput.value, original: model.getCellRaw(coordsToRef(selected.row, selected.col)) };
    });

    formulaInput.addEventListener('input', function () {
      if (editing) {
        editing.raw = formulaInput.value;
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        commitValue(formulaInput.value, 'down');
      } else if (event.key === 'Escape') {
        editing = null;
        formulaInput.value = model.getCellRaw(coordsToRef(selected.row, selected.col));
      }
    });

    editor.addEventListener('input', function () {
      if (editing) {
        editing.raw = editor.value;
        formulaInput.value = editor.value;
      }
    });

    editor.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitValue(editor.value, 'down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitValue(editor.value, 'right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        editing = null;
        editor.hidden = true;
        render();
      }
    });

    document.addEventListener('keydown', async function (event) {
      var meta = event.metaKey || event.ctrlKey;
      if (document.activeElement === formulaInput && !meta) {
        return;
      }
      if (document.activeElement === editor) {
        return;
      }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          model.redo();
        } else {
          model.undo();
        }
        render();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        model.redo();
        render();
        return;
      }
      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection(false);
        try {
          await navigator.clipboard.writeText(matrixToText(model.readRange(range)));
        } catch (error4) {
          return;
        }
        return;
      }
      if (meta && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        copySelection(true);
        try {
          await navigator.clipboard.writeText(matrixToText(model.readRange(range)));
        } catch (error5) {
          return;
        }
        return;
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        var pasted = null;
        try {
          pasted = await navigator.clipboard.readText();
        } catch (error6) {
          pasted = model.clipboard ? matrixToText(model.clipboard.matrix) : '';
        }
        if (pasted) {
          model.clipboard = {
            matrix: textToMatrix(pasted),
            width: textToMatrix(pasted)[0].length,
            height: textToMatrix(pasted).length,
            source: range,
            cut: model.clipboard ? model.clipboard.cut : false,
          };
        }
        model.pasteRange(range);
        render();
        return;
      }
      if (event.key === 'F2' || event.key === 'Enter') {
        event.preventDefault();
        startEdit(undefined, false);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        model.clearRange(model.normalizeRange(range));
        render();
        return;
      }
      var movement = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }[event.key];
      if (movement) {
        event.preventDefault();
        if (event.shiftKey) {
          range.endRow = clamp(selected.row + movement[0], 0, model.rows - 1);
          range.endCol = clamp(selected.col + movement[1], 0, model.cols - 1);
          selected = { row: range.endRow, col: range.endCol };
          render();
        } else {
          setSelection(selected.row + movement[0], selected.col + movement[1], false);
        }
        return;
      }
      if (event.key.length === 1 && !meta && !event.altKey) {
        event.preventDefault();
        startEdit(event.key, true);
      }
    });

    render();
  }

  var api = {
    SpreadsheetModel: SpreadsheetModel,
    coordsToRef: coordsToRef,
    parseFormula: parseFormula,
    createApp: createApp,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.SpreadsheetApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
