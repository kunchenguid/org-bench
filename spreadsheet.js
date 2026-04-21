(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetApp = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var REF_ERROR = { type: 'error', code: '#REF!' };
  var CIRC_ERROR = { type: 'error', code: '#CIRC!' };
  var DIV0_ERROR = { type: 'error', code: '#DIV/0!' };
  var GENERIC_ERROR = { type: 'error', code: '#ERR!' };

  function columnLabelToIndex(label) {
    var value = 0;
    var upper = String(label || '').toUpperCase();
    var i;
    for (i = 0; i < upper.length; i += 1) {
      value = (value * 26) + (upper.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToColumnLabel(index) {
    var label = '';
    var value = index + 1;
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  }

  function makeCellKey(row, col) {
    return row + ',' + col;
  }

  function parseAddress(address) {
    var match = /^([A-Z]+)(\d+)$/i.exec(String(address || '').trim());
    if (!match) {
      throw new Error('Invalid cell address: ' + address);
    }
    return {
      row: Number(match[2]) - 1,
      col: columnLabelToIndex(match[1]),
    };
  }

  function formatAddress(row, col) {
    return indexToColumnLabel(col) + String(row + 1);
  }

  function cloneCells(cells) {
    return JSON.parse(JSON.stringify(cells));
  }

  function createSnapshot(state) {
    return {
      cells: cloneCells(state.cells),
      rowCount: state.rowCount,
      colCount: state.colCount,
    };
  }

  function restoreSnapshot(state, snapshot) {
    state.cells = cloneCells(snapshot.cells);
    state.rowCount = snapshot.rowCount;
    state.colCount = snapshot.colCount;
  }

  function createSpreadsheet(options) {
    var state = {
      cells: {},
      rowCount: (options && options.rowCount) || 100,
      colCount: (options && options.colCount) || 26,
      history: [],
      future: [],
      clipboard: null,
    };

    function pushHistory() {
      state.history.push(createSnapshot(state));
      if (state.history.length > 50) {
        state.history.shift();
      }
      state.future = [];
    }

    function setRawCell(row, col, raw) {
      var key = makeCellKey(row, col);
      if (raw === '' || raw == null) {
        delete state.cells[key];
        return;
      }
      state.cells[key] = String(raw);
    }

    function getRawCell(row, col) {
      return state.cells[makeCellKey(row, col)] || '';
    }

    function listRange(startRow, startCol, endRow, endCol) {
      var cells = [];
      var row;
      var col;
      for (row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row += 1) {
        for (col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col += 1) {
          cells.push({ row: row, col: col });
        }
      }
      return cells;
    }

    function tokenize(formula) {
      var tokens = [];
      var i = 0;
      while (i < formula.length) {
        var char = formula[i];
        var next = formula[i + 1];
        if (/\s/.test(char)) {
          i += 1;
          continue;
        }
        if (char === '"') {
          var text = '';
          i += 1;
          while (i < formula.length && formula[i] !== '"') {
            text += formula[i];
            i += 1;
          }
          if (formula[i] !== '"') {
            throw new Error('Unterminated string');
          }
          i += 1;
          tokens.push({ type: 'string', value: text });
          continue;
        }
        if (char === '#') {
          var errorToken = '';
          while (i < formula.length && /[#A-Z0-9!/]/i.test(formula[i])) {
            errorToken += formula[i];
            i += 1;
          }
          tokens.push({ type: 'error', value: errorToken.toUpperCase() });
          continue;
        }
        if (/[0-9.]/.test(char)) {
          var number = char;
          i += 1;
          while (i < formula.length && /[0-9.]/.test(formula[i])) {
            number += formula[i];
            i += 1;
          }
          tokens.push({ type: 'number', value: Number(number) });
          continue;
        }
        if ((char === '<' || char === '>') && next === '=') {
          tokens.push({ type: 'operator', value: char + '=' });
          i += 2;
          continue;
        }
        if (char === '<' && next === '>') {
          tokens.push({ type: 'operator', value: '<>' });
          i += 2;
          continue;
        }
        if ('+-*/&=<>(),:'.indexOf(char) >= 0) {
          tokens.push({ type: 'operator', value: char });
          i += 1;
          continue;
        }
        if (/[A-Za-z_$]/.test(char)) {
          var ident = char;
          i += 1;
          while (i < formula.length && /[A-Za-z0-9_$]/.test(formula[i])) {
            ident += formula[i];
            i += 1;
          }
          tokens.push({ type: 'identifier', value: ident.toUpperCase() });
          continue;
        }
        throw new Error('Unexpected token: ' + char);
      }
      return tokens;
    }

    function parseFormula(formula) {
      var tokens = tokenize(formula);
      var index = 0;

      function peek(value) {
        var token = tokens[index];
        return token && token.value === value;
      }

      function consume(value) {
        var token = tokens[index];
        if (!token || token.value !== value) {
          throw new Error('Expected ' + value);
        }
        index += 1;
        return token;
      }

      function isCellIdentifier(value) {
        return /^\$?[A-Z]+\$?\d+$/.test(value);
      }

      function parseExpression() {
        return parseComparison();
      }

      function parseComparison() {
        var expr = parseConcat();
        while (tokens[index] && ['=', '<>', '<', '<=', '>', '>='].indexOf(tokens[index].value) >= 0) {
          var op = tokens[index].value;
          index += 1;
          expr = { type: 'binary', op: op, left: expr, right: parseConcat() };
        }
        return expr;
      }

      function parseConcat() {
        var expr = parseAdditive();
        while (peek('&')) {
          consume('&');
          expr = { type: 'binary', op: '&', left: expr, right: parseAdditive() };
        }
        return expr;
      }

      function parseAdditive() {
        var expr = parseMultiplicative();
        while (tokens[index] && (tokens[index].value === '+' || tokens[index].value === '-')) {
          var op = tokens[index].value;
          index += 1;
          expr = { type: 'binary', op: op, left: expr, right: parseMultiplicative() };
        }
        return expr;
      }

      function parseMultiplicative() {
        var expr = parseUnary();
        while (tokens[index] && (tokens[index].value === '*' || tokens[index].value === '/')) {
          var op = tokens[index].value;
          index += 1;
          expr = { type: 'binary', op: op, left: expr, right: parseUnary() };
        }
        return expr;
      }

      function parseUnary() {
        if (peek('-')) {
          consume('-');
          return { type: 'unary', op: '-', value: parseUnary() };
        }
        return parsePrimary();
      }

      function parsePrimary() {
        var token = tokens[index];
        var expr;
        if (!token) {
          throw new Error('Unexpected end of formula');
        }
        if (token.type === 'error') {
          index += 1;
          return { type: 'error', value: token.value };
        }
        if (token.type === 'number') {
          index += 1;
          return { type: 'number', value: token.value };
        }
        if (token.type === 'string') {
          index += 1;
          return { type: 'string', value: token.value };
        }
        if (peek('(')) {
          consume('(');
          expr = parseExpression();
          consume(')');
          return expr;
        }
        if (token.type === 'identifier') {
          index += 1;
          if (token.value === 'TRUE' || token.value === 'FALSE') {
            return { type: 'boolean', value: token.value === 'TRUE' };
          }
          if (peek('(')) {
            var args = [];
            consume('(');
            if (!peek(')')) {
              args.push(parseExpression());
              while (peek(',')) {
                consume(',');
                args.push(parseExpression());
              }
            }
            consume(')');
            return { type: 'call', name: token.value, args: args };
          }
          if (isCellIdentifier(token.value)) {
            if (peek(':')) {
              consume(':');
              var endToken = tokens[index];
              if (!endToken || endToken.type !== 'identifier' || !isCellIdentifier(endToken.value)) {
                throw new Error('Expected range endpoint');
              }
              index += 1;
              return { type: 'range', start: parseRef(token.value), end: parseRef(endToken.value) };
            }
            return { type: 'ref', ref: parseRef(token.value) };
          }
          return { type: 'name', value: token.value };
        }
        throw new Error('Unexpected token');
      }

      var ast = parseExpression();
      if (index !== tokens.length) {
        throw new Error('Unexpected trailing token');
      }
      return ast;
    }

    function parseRef(value) {
      var match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(value);
      return {
        colAbs: Boolean(match[1]),
        col: columnLabelToIndex(match[2]),
        rowAbs: Boolean(match[3]),
        row: Number(match[4]) - 1,
      };
    }

    function refToString(ref) {
      return (ref.colAbs ? '$' : '') + indexToColumnLabel(ref.col) + (ref.rowAbs ? '$' : '') + String(ref.row + 1);
    }

    function isError(value) {
      return value && typeof value === 'object' && value.type === 'error';
    }

    function toNumber(value) {
      if (isError(value)) {
        return value;
      }
      if (value == null || value === '') {
        return 0;
      }
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      var num = Number(value);
      return Number.isFinite(num) ? num : GENERIC_ERROR;
    }

    function toText(value) {
      if (isError(value)) {
        return value;
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
      if (isError(value)) {
        return value;
      }
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
      if (value == null || value === '') {
        return false;
      }
      if (typeof value === 'string') {
        var upper = value.toUpperCase();
        if (upper === 'TRUE') {
          return true;
        }
        if (upper === 'FALSE') {
          return false;
        }
      }
      return Boolean(value);
    }

    function flattenArgs(values) {
      return values.reduce(function (acc, item) {
        if (Array.isArray(item)) {
          return acc.concat(flattenArgs(item));
        }
        acc.push(item);
        return acc;
      }, []);
    }

    function evaluateFunction(name, args) {
      var flat = flattenArgs(args);
      var nums;
      switch (name) {
        case 'SUM':
          nums = flat.map(toNumber);
          if (nums.some(isError)) {
            return nums.find(isError);
          }
          return nums.reduce(function (sum, value) { return sum + value; }, 0);
        case 'AVERAGE':
          nums = flat.map(toNumber);
          if (nums.some(isError)) {
            return nums.find(isError);
          }
          return nums.length ? nums.reduce(function (sum, value) { return sum + value; }, 0) / nums.length : 0;
        case 'MIN':
          nums = flat.map(toNumber);
          if (nums.some(isError)) {
            return nums.find(isError);
          }
          return nums.length ? Math.min.apply(Math, nums) : 0;
        case 'MAX':
          nums = flat.map(toNumber);
          if (nums.some(isError)) {
            return nums.find(isError);
          }
          return nums.length ? Math.max.apply(Math, nums) : 0;
        case 'COUNT':
          return flat.filter(function (value) {
            return value !== '' && value != null && !isError(value);
          }).length;
        case 'IF':
          return toBoolean(args[0]) ? args[1] : args[2];
        case 'AND':
          return flat.every(function (value) { return toBoolean(value); });
        case 'OR':
          return flat.some(function (value) { return toBoolean(value); });
        case 'NOT':
          return !toBoolean(args[0]);
        case 'ABS':
          return Math.abs(toNumber(args[0]));
        case 'ROUND':
          return Number(toNumber(args[0]).toFixed(args[1] == null ? 0 : toNumber(args[1])));
        case 'CONCAT':
          return flat.map(toText).join('');
        default:
          return GENERIC_ERROR;
      }
    }

    function evaluateExpression(ast, memo, stack) {
      function visit(node) {
        var left;
        var right;
        var numLeft;
        var numRight;
        var row;
        var col;
        switch (node.type) {
          case 'error':
            return { type: 'error', code: node.value };
          case 'number':
          case 'string':
            return node.value;
          case 'boolean':
            return node.value;
          case 'unary':
            numLeft = toNumber(visit(node.value));
            return isError(numLeft) ? numLeft : -numLeft;
          case 'binary':
            left = visit(node.left);
            right = visit(node.right);
            if (isError(left)) {
              return left;
            }
            if (isError(right)) {
              return right;
            }
            if (node.op === '&') {
              return toText(left) + toText(right);
            }
            if (['=', '<>', '<', '<=', '>', '>='].indexOf(node.op) >= 0) {
              switch (node.op) {
                case '=': return left === right;
                case '<>': return left !== right;
                case '<': return left < right;
                case '<=': return left <= right;
                case '>': return left > right;
                case '>=': return left >= right;
              }
            }
            numLeft = toNumber(left);
            numRight = toNumber(right);
            if (isError(numLeft)) {
              return numLeft;
            }
            if (isError(numRight)) {
              return numRight;
            }
            if (node.op === '+') {
              return numLeft + numRight;
            }
            if (node.op === '-') {
              return numLeft - numRight;
            }
            if (node.op === '*') {
              return numLeft * numRight;
            }
            if (node.op === '/') {
              return numRight === 0 ? DIV0_ERROR : numLeft / numRight;
            }
            return GENERIC_ERROR;
          case 'ref':
            return evaluateCell(node.ref.row, node.ref.col, memo, stack);
          case 'range':
            var values = [];
            for (row = Math.min(node.start.row, node.end.row); row <= Math.max(node.start.row, node.end.row); row += 1) {
              for (col = Math.min(node.start.col, node.end.col); col <= Math.max(node.start.col, node.end.col); col += 1) {
                values.push(evaluateCell(row, col, memo, stack));
              }
            }
            return values;
          case 'call':
            return evaluateFunction(node.name, node.args.map(visit));
          default:
            return GENERIC_ERROR;
        }
      }
      return visit(ast);
    }

    function evaluateLiteral(raw) {
      if (raw === '') {
        return null;
      }
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw.trim())) {
        return Number(raw);
      }
      return raw;
    }

    function evaluateCell(row, col, memo, stack) {
      var key = makeCellKey(row, col);
      var raw = getRawCell(row, col);
      if (memo[key] !== undefined) {
        return memo[key];
      }
      if (stack[key]) {
        memo[key] = CIRC_ERROR;
        return memo[key];
      }
      if (!raw) {
        memo[key] = null;
        return memo[key];
      }
      if (raw[0] !== '=') {
        memo[key] = evaluateLiteral(raw);
        return memo[key];
      }
      try {
        stack[key] = true;
        memo[key] = evaluateExpression(parseFormula(raw.slice(1)), memo, stack);
        delete stack[key];
        return memo[key];
      } catch (error) {
        delete stack[key];
        memo[key] = GENERIC_ERROR;
        return memo[key];
      }
    }

    function formatDisplay(value) {
      if (isError(value)) {
        return value.code;
      }
      if (value == null) {
        return '';
      }
      if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(Number(value.toFixed(10))).replace(/\.0+$/, '');
      }
      return String(value);
    }

    function rewriteFormula(raw, transform) {
      if (!raw || raw[0] !== '=') {
        return raw;
      }
      return '=' + raw.slice(1).replace(/\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g, function (match) {
        if (match.indexOf(':') >= 0) {
          var parts = match.split(':');
          return transform(parseRef(parts[0])) + ':' + transform(parseRef(parts[1]));
        }
        return transform(parseRef(match));
      });
    }

    function shiftFormula(raw, rowDelta, colDelta) {
      return rewriteFormula(raw, function (ref) {
        return refToString({
          row: ref.rowAbs ? ref.row : ref.row + rowDelta,
          col: ref.colAbs ? ref.col : ref.col + colDelta,
          rowAbs: ref.rowAbs,
          colAbs: ref.colAbs,
        });
      });
    }

    function rewriteForInsertedRow(raw, rowIndex) {
      return rewriteFormula(raw, function (ref) {
        return refToString({
          row: ref.row >= rowIndex ? ref.row + 1 : ref.row,
          col: ref.col,
          rowAbs: ref.rowAbs,
          colAbs: ref.colAbs,
        });
      });
    }

    function rewriteForDeletedRow(raw, rowIndex) {
      return rewriteFormula(raw, function (ref) {
        if (ref.row === rowIndex) {
          return '#REF!';
        }
        return refToString({
          row: ref.row > rowIndex ? ref.row - 1 : ref.row,
          col: ref.col,
          rowAbs: ref.rowAbs,
          colAbs: ref.colAbs,
        });
      });
    }

    function rewriteForInsertedColumn(raw, colIndex) {
      return rewriteFormula(raw, function (ref) {
        return refToString({
          row: ref.row,
          col: ref.col >= colIndex ? ref.col + 1 : ref.col,
          rowAbs: ref.rowAbs,
          colAbs: ref.colAbs,
        });
      });
    }

    function rewriteForDeletedColumn(raw, colIndex) {
      return rewriteFormula(raw, function (ref) {
        if (ref.col === colIndex) {
          return '#REF!';
        }
        return refToString({
          row: ref.row,
          col: ref.col > colIndex ? ref.col - 1 : ref.col,
          rowAbs: ref.rowAbs,
          colAbs: ref.colAbs,
        });
      });
    }

    function mutateCells(mutator) {
      var next = {};
      Object.keys(state.cells).forEach(function (key) {
        var coords = key.split(',');
        var result = mutator({ row: Number(coords[0]), col: Number(coords[1]), raw: state.cells[key] });
        if (result) {
          next[makeCellKey(result.row, result.col)] = result.raw;
        }
      });
      state.cells = next;
    }

    return {
      getState: function () {
        return createSnapshot(state);
      },
      loadState: function (snapshot) {
        restoreSnapshot(state, snapshot);
      },
      setCell: function (address, raw, options) {
        var point = parseAddress(address);
        if (!options || !options.skipHistory) {
          pushHistory();
        }
        setRawCell(point.row, point.col, raw);
      },
      getRawValue: function (address) {
        var point = parseAddress(address);
        return getRawCell(point.row, point.col);
      },
      getDisplayValue: function (address) {
        var point = parseAddress(address);
        return formatDisplay(evaluateCell(point.row, point.col, {}, {}));
      },
      copyRange: function (range, cut) {
        var rows = [];
        var row;
        var col;
        for (row = range.startRow; row <= range.endRow; row += 1) {
          var cols = [];
          for (col = range.startCol; col <= range.endCol; col += 1) {
            cols.push(getRawCell(row, col));
          }
          rows.push(cols);
        }
        state.clipboard = { rows: rows, cut: Boolean(cut), source: range };
      },
      pasteRange: function (range) {
        var clip = state.clipboard;
        var targetHeight;
        var targetWidth;
        var row;
        var col;
        if (!clip) {
          return;
        }
        pushHistory();
        targetHeight = (range.endRow - range.startRow) + 1;
        targetWidth = (range.endCol - range.startCol) + 1;
        for (row = 0; row < clip.rows.length; row += 1) {
          for (col = 0; col < clip.rows[row].length; col += 1) {
            if ((targetHeight !== 1 || targetWidth !== 1) && (row >= targetHeight || col >= targetWidth)) {
              continue;
            }
            setRawCell(
              range.startRow + row,
              range.startCol + col,
              shiftFormula(
                clip.rows[row][col],
                (range.startRow + row) - (clip.source.startRow + row),
                (range.startCol + col) - (clip.source.startCol + col)
              )
            );
          }
        }
        if (clip.cut) {
          listRange(clip.source.startRow, clip.source.startCol, clip.source.endRow, clip.source.endCol).forEach(function (cell) {
            setRawCell(cell.row, cell.col, '');
          });
          state.clipboard = null;
        }
      },
      insertRow: function (rowIndex) {
        pushHistory();
        mutateCells(function (cell) {
          return {
            row: cell.row >= rowIndex ? cell.row + 1 : cell.row,
            col: cell.col,
            raw: rewriteForInsertedRow(cell.raw, rowIndex),
          };
        });
        state.rowCount += 1;
      },
      deleteRow: function (rowIndex) {
        pushHistory();
        mutateCells(function (cell) {
          if (cell.row === rowIndex) {
            return null;
          }
          return {
            row: cell.row > rowIndex ? cell.row - 1 : cell.row,
            col: cell.col,
            raw: rewriteForDeletedRow(cell.raw, rowIndex),
          };
        });
        state.rowCount = Math.max(1, state.rowCount - 1);
      },
      insertColumn: function (colIndex) {
        pushHistory();
        mutateCells(function (cell) {
          return {
            row: cell.row,
            col: cell.col >= colIndex ? cell.col + 1 : cell.col,
            raw: rewriteForInsertedColumn(cell.raw, colIndex),
          };
        });
        state.colCount += 1;
      },
      deleteColumn: function (colIndex) {
        pushHistory();
        mutateCells(function (cell) {
          if (cell.col === colIndex) {
            return null;
          }
          return {
            row: cell.row,
            col: cell.col > colIndex ? cell.col - 1 : cell.col,
            raw: rewriteForDeletedColumn(cell.raw, colIndex),
          };
        });
        state.colCount = Math.max(1, state.colCount - 1);
      },
      undo: function () {
        if (!state.history.length) {
          return;
        }
        state.future.push(createSnapshot(state));
        restoreSnapshot(state, state.history.pop());
      },
      redo: function () {
        if (!state.future.length) {
          return;
        }
        state.history.push(createSnapshot(state));
        restoreSnapshot(state, state.future.pop());
      },
    };
  }

  return {
    createSpreadsheet: createSpreadsheet,
    indexToColumnLabel: indexToColumnLabel,
    columnLabelToIndex: columnLabelToIndex,
    formatAddress: formatAddress,
    parseAddress: parseAddress,
  };
});
