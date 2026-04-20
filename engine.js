(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var FUNCTION_NAMES = {
    SUM: true,
    AVERAGE: true,
    MIN: true,
    MAX: true,
    COUNT: true,
    IF: true,
    AND: true,
    OR: true,
    NOT: true,
    ABS: true,
    ROUND: true,
    CONCAT: true,
  };

  function keyFromCoord(row, col) {
    return row + ',' + col;
  }

  function colToIndex(label) {
    var value = 0;
    for (var i = 0; i < label.length; i += 1) {
      value = value * 26 + (label.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToCol(index) {
    var value = index + 1;
    var result = '';
    while (value > 0) {
      var rem = (value - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function cloneCells(cells) {
    var copy = {};
    Object.keys(cells || {}).forEach(function (key) {
      copy[key] = cells[key];
    });
    return copy;
  }

  function isNumericText(value) {
    return /^\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*$/.test(String(value));
  }

  function isCellRefName(name) {
    return /^\$?[A-Z]+\$?\d+$/.test(name);
  }

  function tokenize(input) {
    var tokens = [];
    var i = 0;
    while (i < input.length) {
      var ch = input[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === '"') {
        var j = i + 1;
        var value = '';
        while (j < input.length && input[j] !== '"') {
          value += input[j];
          j += 1;
        }
        if (j >= input.length) {
          throw { code: '#ERR!' };
        }
        tokens.push({ type: 'string', value: value });
        i = j + 1;
        continue;
      }
      var two = input.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      var errorMatch = input.slice(i).match(/^#(?:REF!|ERR!|DIV\/0!|CIRC!)/);
      if (errorMatch) {
        tokens.push({ type: 'error', value: errorMatch[0] });
        i += errorMatch[0].length;
        continue;
      }
      if ('+-*/&=<>():,'.indexOf(ch) >= 0) {
        tokens.push({ type: ch === '(' || ch === ')' || ch === ',' || ch === ':' ? ch : 'op', value: ch });
        i += 1;
        continue;
      }
      var numberMatch = input.slice(i).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: parseFloat(numberMatch[0]) });
        i += numberMatch[0].length;
        continue;
      }
      var identMatch = input.slice(i).match(/^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/);
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0] });
        i += identMatch[0].length;
        continue;
      }
      throw { code: '#ERR!' };
    }
    return tokens;
  }

  function createParser(tokens) {
    var index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(type, value) {
      var token = tokens[index];
      if (!token || token.type !== type || (value && token.value !== value)) {
        throw { code: '#ERR!' };
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      var left = parseConcat();
      while (peek() && peek().type === 'op' && /^(=|<>|<|<=|>|>=)$/.test(peek().value)) {
        var op = consume('op').value;
        left = { type: 'binary', op: op, left: left, right: parseConcat() };
      }
      return left;
    }

    function parseConcat() {
      var left = parseAddSub();
      while (peek() && peek().type === 'op' && peek().value === '&') {
        consume('op', '&');
        left = { type: 'binary', op: '&', left: left, right: parseAddSub() };
      }
      return left;
    }

    function parseAddSub() {
      var left = parseMulDiv();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        var op = consume('op').value;
        left = { type: 'binary', op: op, left: left, right: parseMulDiv() };
      }
      return left;
    }

    function parseMulDiv() {
      var left = parseUnary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        var op = consume('op').value;
        left = { type: 'binary', op: op, left: left, right: parseUnary() };
      }
      return left;
    }

    function parseUnary() {
      if (peek() && peek().type === 'op' && peek().value === '-') {
        consume('op', '-');
        return { type: 'unary', op: '-', expr: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      var token = peek();
      if (!token) {
        throw { code: '#ERR!' };
      }
      if (token.type === 'number') {
        consume('number');
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        consume('string');
        return { type: 'string', value: token.value };
      }
      if (token.type === 'error') {
        consume('error');
        return { type: 'error', value: token.value };
      }
      if (token.type === '(') {
        consume('(');
        var expr = parseExpression();
        consume(')');
        return expr;
      }
      if (token.type === 'ident') {
        consume('ident');
        var name = token.value.toUpperCase();
        if (peek() && peek().type === '(') {
          consume('(');
          var args = [];
          if (!peek() || peek().type !== ')') {
            while (true) {
              args.push(parseExpression());
              if (peek() && peek().type === ',') {
                consume(',');
                continue;
              }
              break;
            }
          }
          consume(')');
          if (!FUNCTION_NAMES[name]) {
            throw { code: '#ERR!' };
          }
          return { type: 'call', name: name, args: args };
        }
        if (name === 'TRUE' || name === 'FALSE') {
          return { type: 'boolean', value: name === 'TRUE' };
        }
        if (isCellRefName(name)) {
          var refNode = { type: 'ref', ref: parseCellRef(name) };
          if (peek() && peek().type === ':') {
            consume(':');
            var end = consume('ident').value.toUpperCase();
            if (!isCellRefName(end)) {
              throw { code: '#ERR!' };
            }
            return { type: 'range', start: refNode.ref, end: parseCellRef(end) };
          }
          return refNode;
        }
      }
      throw { code: '#ERR!' };
    }

    var ast = parseExpression();
    if (index !== tokens.length) {
      throw { code: '#ERR!' };
    }
    return ast;
  }

  function parseCellRef(text) {
    var match = text.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      throw { code: '#ERR!' };
    }
    return {
      colAbs: match[1] === '$',
      col: colToIndex(match[2]),
      rowAbs: match[3] === '$',
      row: parseInt(match[4], 10) - 1,
    };
  }

  function refToText(ref) {
    return (ref.colAbs ? '$' : '') + indexToCol(ref.col) + (ref.rowAbs ? '$' : '') + String(ref.row + 1);
  }

  function shiftRef(ref, rowDelta, colDelta) {
    return {
      row: ref.rowAbs ? ref.row : Math.max(0, ref.row + rowDelta),
      col: ref.colAbs ? ref.col : Math.max(0, ref.col + colDelta),
      rowAbs: ref.rowAbs,
      colAbs: ref.colAbs,
    };
  }

  function shiftFormula(raw, rowDelta, colDelta) {
    if (!raw || raw.charAt(0) !== '=') {
      return raw;
    }
    return raw.replace(/\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, function (part) {
      if (part.indexOf(':') >= 0) {
        var halves = part.split(':');
        return refToText(shiftRef(parseCellRef(halves[0]), rowDelta, colDelta)) + ':' + refToText(shiftRef(parseCellRef(halves[1]), rowDelta, colDelta));
      }
      return refToText(shiftRef(parseCellRef(part), rowDelta, colDelta));
    });
  }

  function coerceNumber(value) {
    if (value == null || value === '') {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (isNumericText(value)) {
      return parseFloat(value);
    }
    return 0;
  }

  function coerceText(value) {
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function coerceBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (value == null || value === '') {
      return false;
    }
    return String(value).toUpperCase() !== 'FALSE';
  }

  function compareValues(left, right, op) {
    var lhs = isNumericText(left) || typeof left === 'number' ? coerceNumber(left) : coerceText(left);
    var rhs = isNumericText(right) || typeof right === 'number' ? coerceNumber(right) : coerceText(right);
    if (op === '=') {
      return lhs === rhs;
    }
    if (op === '<>') {
      return lhs !== rhs;
    }
    if (op === '<') {
      return lhs < rhs;
    }
    if (op === '<=') {
      return lhs <= rhs;
    }
    if (op === '>') {
      return lhs > rhs;
    }
    return lhs >= rhs;
  }

  function expandRange(start, end, rows, cols) {
    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);
    var items = [];
    for (var row = rowStart; row <= rowEnd; row += 1) {
      for (var col = colStart; col <= colEnd; col += 1) {
        if (row < 0 || col < 0 || row >= rows || col >= cols) {
          throw { code: '#REF!' };
        }
        items.push({ row: row, col: col });
      }
    }
    return items;
  }

  function flattenArgs(args) {
    var list = [];
    args.forEach(function (arg) {
      if (Array.isArray(arg)) {
        arg.forEach(function (value) {
          list.push(value);
        });
      } else {
        list.push(arg);
      }
    });
    return list;
  }

  function evaluateSheet(cells, options) {
    var rows = options.rows;
    var cols = options.cols;
    var cache = {};
    var visiting = {};
    var rawCells = cells || {};

    function getCellRaw(row, col) {
      return rawCells[keyFromCoord(row, col)] || '';
    }

    function evalCell(row, col) {
      if (row < 0 || col < 0 || row >= rows || col >= cols) {
        throw { code: '#REF!' };
      }
      var key = keyFromCoord(row, col);
      if (cache[key]) {
        return cache[key];
      }
      if (visiting[key]) {
        return { type: 'error', value: '#CIRC!' };
      }
      visiting[key] = true;
      var raw = getCellRaw(row, col);
      var result;
      if (!raw) {
        result = { type: 'empty', value: '' };
      } else if (raw.charAt(0) !== '=') {
        if (isNumericText(raw)) {
          result = { type: 'number', value: parseFloat(raw) };
        } else {
          result = { type: 'text', value: raw };
        }
      } else {
        try {
          var ast = createParser(tokenize(raw.slice(1)));
          var value = evalNode(ast);
          if (value && value.error) {
            result = { type: 'error', value: value.error };
          } else if (typeof value === 'number') {
            result = { type: 'number', value: value };
          } else if (typeof value === 'boolean') {
            result = { type: 'boolean', value: value };
          } else {
            result = { type: 'text', value: coerceText(value) };
          }
        } catch (error) {
          result = { type: 'error', value: error.code || '#ERR!' };
        }
      }
      visiting[key] = false;
      cache[key] = result;
      return result;
    }

    function evalNode(node) {
      if (node.type === 'number' || node.type === 'string' || node.type === 'boolean') {
        return node.value;
      }
      if (node.type === 'error') {
        throw { code: node.value };
      }
      if (node.type === 'ref') {
        var refResult = evalCell(node.ref.row, node.ref.col);
        if (refResult.type === 'error') {
          throw { code: refResult.value };
        }
        return refResult.type === 'empty' ? '' : refResult.value;
      }
      if (node.type === 'range') {
        return expandRange(node.start, node.end, rows, cols).map(function (coord) {
          var value = evalCell(coord.row, coord.col);
          if (value.type === 'error') {
            throw { code: value.value };
          }
          return value.type === 'empty' ? '' : value.value;
        });
      }
      if (node.type === 'unary') {
        return -coerceNumber(evalNode(node.expr));
      }
      if (node.type === 'binary') {
        if (node.op === '&') {
          return coerceText(evalNode(node.left)) + coerceText(evalNode(node.right));
        }
        if (/^(=|<>|<|<=|>|>=)$/.test(node.op)) {
          return compareValues(evalNode(node.left), evalNode(node.right), node.op);
        }
        var left = coerceNumber(evalNode(node.left));
        var right = coerceNumber(evalNode(node.right));
        if (node.op === '+') {
          return left + right;
        }
        if (node.op === '-') {
          return left - right;
        }
        if (node.op === '*') {
          return left * right;
        }
        if (right === 0) {
          throw { code: '#DIV/0!' };
        }
        return left / right;
      }
      if (node.type === 'call') {
        if (node.name === 'IF') {
          var condition = evalNode(node.args[0]);
          return coerceBoolean(condition) ? (node.args.length > 1 ? evalNode(node.args[1]) : true) : (node.args.length > 2 ? evalNode(node.args[2]) : false);
        }
        return evalFunction(node.name, node.args.map(evalNode));
      }
      throw { code: '#ERR!' };
    }

    function evalFunction(name, args) {
      var values = flattenArgs(args);
      if (name === 'SUM') {
        return values.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0);
      }
      if (name === 'AVERAGE') {
        return values.length ? values.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) / values.length : 0;
      }
      if (name === 'MIN') {
        return values.length ? Math.min.apply(Math, values.map(coerceNumber)) : 0;
      }
      if (name === 'MAX') {
        return values.length ? Math.max.apply(Math, values.map(coerceNumber)) : 0;
      }
      if (name === 'COUNT') {
        return values.filter(function (value) { return value !== '' && value != null; }).length;
      }
      if (name === 'AND') {
        return values.every(coerceBoolean);
      }
      if (name === 'OR') {
        return values.some(coerceBoolean);
      }
      if (name === 'NOT') {
        return !coerceBoolean(args[0]);
      }
      if (name === 'ABS') {
        return Math.abs(coerceNumber(args[0]));
      }
      if (name === 'ROUND') {
        var num = coerceNumber(args[0]);
        var digits = args.length > 1 ? coerceNumber(args[1]) : 0;
        var factor = Math.pow(10, digits);
        return Math.round(num * factor) / factor;
      }
      if (name === 'CONCAT') {
        return values.map(coerceText).join('');
      }
      throw { code: '#ERR!' };
    }

    return {
      evaluateCell: evalCell,
      snapshot: function () {
        var display = {};
        Object.keys(rawCells).forEach(function (key) {
          var parts = key.split(',');
          display[key] = evalCell(parseInt(parts[0], 10), parseInt(parts[1], 10));
        });
        return display;
      },
    };
  }

  function updateFormulasForStructure(cells, kind, index, delta) {
    var next = {};
    Object.keys(cells).forEach(function (key) {
      var raw = cells[key];
      next[key] = raw && raw.charAt(0) === '=' ? rewriteFormulaRefs(raw, kind, index, delta) : raw;
    });
    return next;
  }

  function rewriteFormulaRefs(raw, kind, index, delta) {
    return raw.replace(/\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, function (part) {
      if (part.indexOf(':') >= 0) {
        return rewriteRangeText(part, kind, index, delta);
      }
      return rewriteRefText(part, kind, index, delta);
    });
  }

  function rewriteRangeText(text, kind, index, delta) {
    var halves = text.split(':');
    var start = parseCellRef(halves[0]);
    var end = parseCellRef(halves[1]);
    var startValue = kind === 'row' ? Math.min(start.row, end.row) : Math.min(start.col, end.col);
    var endValue = kind === 'row' ? Math.max(start.row, end.row) : Math.max(start.col, end.col);

    if (delta > 0) {
      if (startValue >= index) {
        startValue += delta;
      }
      if (endValue >= index) {
        endValue += delta;
      }
    } else if (index < startValue) {
      startValue += delta;
      endValue += delta;
    } else if (index <= endValue) {
      if (startValue === endValue) {
        return '#REF!';
      }
      endValue += delta;
    }

    if (kind === 'row') {
      start.row = startValue;
      end.row = endValue;
    } else {
      start.col = startValue;
      end.col = endValue;
    }
    return refToText(start) + ':' + refToText(end);
  }

  function rewriteRefText(text, kind, index, delta) {
    var ref = parseCellRef(text);
    var value = kind === 'row' ? ref.row : ref.col;
    if (delta > 0 && value >= index) {
      value += delta;
    }
    if (delta < 0) {
      if (value === index) {
        return '#REF!';
      }
      if (value > index) {
        value += delta;
      }
    }
    if (kind === 'row') {
      ref.row = value;
    } else {
      ref.col = value;
    }
    return refToText(ref);
  }

  function shiftSelectionIndex(value, index, delta, upperBound) {
    if (delta > 0) {
      if (value >= index) {
        value += delta;
      }
    } else {
      if (value === index) {
        value = Math.max(0, value + delta);
      } else if (value > index) {
        value += delta;
      }
    }

    return Math.max(0, Math.min(upperBound, value));
  }

  function adjustSelectionForStructure(selection, kind, index, delta, dimensions) {
    var maxRow = Math.max(0, dimensions.rows - 1);
    var maxCol = Math.max(0, dimensions.cols - 1);

    function adjustCoord(coord) {
      return {
        row: kind === 'row' ? shiftSelectionIndex(coord.row, index, delta, maxRow) : coord.row,
        col: kind === 'col' ? shiftSelectionIndex(coord.col, index, delta, maxCol) : coord.col,
      };
    }

    return {
      active: adjustCoord(selection.active),
      range: {
        start: adjustCoord(selection.range.start),
        end: adjustCoord(selection.range.end),
      },
    };
  }

  return {
    cloneCells: cloneCells,
    colToIndex: colToIndex,
    indexToCol: indexToCol,
    keyFromCoord: keyFromCoord,
    evaluateSheet: evaluateSheet,
    shiftFormula: shiftFormula,
    adjustSelectionForStructure: adjustSelectionForStructure,
    updateFormulasForStructure: updateFormulasForStructure,
  };
});
