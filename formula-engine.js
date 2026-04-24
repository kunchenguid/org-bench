(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FormulaEngine = api;
}(typeof self !== 'undefined' ? self : this, function () {
  var ERR = '#ERR!';
  var DIV0 = '#DIV/0!';
  var REF = '#REF!';
  var CIRC = '#CIRC!';

  function makeError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function normalizeAddress(address) {
    var ref = parseRef(address);
    if (!ref) throw makeError(REF);
    return ref.col + ref.row;
  }

  function createSheet(initialCells) {
    var sheet = { cells: {}, values: {}, dependencies: {}, precedents: {} };
    Object.keys(initialCells || {}).forEach(function (address) {
      sheet.cells[normalizeAddress(address)] = String(initialCells[address]);
    });
    return sheet;
  }

  function setCell(sheet, address, raw) {
    address = normalizeAddress(address);
    if (raw === null || raw === undefined || raw === '') delete sheet.cells[address];
    else sheet.cells[address] = String(raw);
  }

  function recalculate(sheet) {
    sheet.values = {};
    sheet.dependencies = {};
    sheet.precedents = {};
    Object.keys(sheet.cells).forEach(function (address) {
      evaluateCell(sheet, address, []);
    });
    return sheet.values;
  }

  function evaluateCell(sheet, address, stack) {
    address = normalizeAddress(address);
    if (sheet.values[address]) return sheet.values[address];
    if (stack.indexOf(address) !== -1) {
      stack.slice(stack.indexOf(address)).forEach(function (cycleAddress) {
        sheet.values[cycleAddress] = { raw: sheet.cells[cycleAddress] || '', display: CIRC, error: CIRC };
      });
      throw makeError(CIRC);
    }

    var raw = sheet.cells[address] || '';
    var state = { sheet: sheet, cell: address, precedents: {} };
    try {
      var value = raw.charAt(0) === '=' ? evaluateFormula(raw.slice(1), state, stack.concat(address)) : parseLiteral(raw);
      sheet.values[address] = { raw: raw, display: value.value, type: value.type };
    } catch (error) {
      var code = error && error.code ? error.code : ERR;
      sheet.values[address] = { raw: raw, display: code, error: code };
    }

    var precedents = Object.keys(state.precedents);
    sheet.precedents[address] = precedents;
    precedents.forEach(function (precedent) {
      if (!sheet.dependencies[precedent]) sheet.dependencies[precedent] = [];
      if (sheet.dependencies[precedent].indexOf(address) === -1) sheet.dependencies[precedent].push(address);
    });
    return sheet.values[address];
  }

  function parseLiteral(raw) {
    var trimmed = String(raw || '').trim();
    if (trimmed === '') return { type: 'blank', value: '' };
    if (/^TRUE$/i.test(trimmed)) return { type: 'boolean', value: true };
    if (/^FALSE$/i.test(trimmed)) return { type: 'boolean', value: false };
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return { type: 'number', value: Number(trimmed) };
    return { type: 'text', value: raw };
  }

  function evaluateFormula(source, state, stack) {
    var parser = new Parser(tokenize(source), state, stack);
    var value = parser.parseExpression();
    parser.expectEnd();
    return value;
  }

  function tokenize(source) {
    var tokens = [];
    var i = 0;
    while (i < source.length) {
      var ch = source.charAt(i);
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '"') {
        var text = '';
        i += 1;
        while (i < source.length) {
          ch = source.charAt(i);
          if (ch === '"' && source.charAt(i + 1) === '"') { text += '"'; i += 2; continue; }
          if (ch === '"') break;
          text += ch;
          i += 1;
        }
        if (source.charAt(i) !== '"') throw makeError(ERR);
        tokens.push({ type: 'string', value: text, raw: '"' + text.replace(/"/g, '""') + '"' });
        i += 1;
        continue;
      }
      var two = source.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two, raw: two });
        i += 2;
        continue;
      }
      if ('+-*/&=(),:<>'.indexOf(ch) !== -1) {
        tokens.push({ type: 'op', value: ch, raw: ch });
        i += 1;
        continue;
      }
      var number = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/);
      if (number) {
        tokens.push({ type: 'number', value: Number(number[0]), raw: number[0] });
        i += number[0].length;
        continue;
      }
      var word = source.slice(i).match(/^\$?[A-Za-z]+\$?\d+|^[A-Za-z_][A-Za-z0-9_]*/);
      if (word) {
        var raw = word[0];
        var ref = parseRef(raw);
        tokens.push(ref ? { type: 'ref', ref: ref, raw: raw } : { type: 'name', value: raw.toUpperCase(), raw: raw });
        i += raw.length;
        continue;
      }
      throw makeError(ERR);
    }
    return tokens;
  }

  function Parser(tokens, state, stack) {
    this.tokens = tokens;
    this.index = 0;
    this.state = state;
    this.stack = stack;
  }

  Parser.prototype.peek = function () { return this.tokens[this.index]; };
  Parser.prototype.next = function () { return this.tokens[this.index++]; };
  Parser.prototype.match = function (value) {
    var token = this.peek();
    if (token && token.value === value) { this.index += 1; return true; }
    return false;
  };
  Parser.prototype.expect = function (value) {
    if (!this.match(value)) throw makeError(ERR);
  };
  Parser.prototype.expectEnd = function () {
    if (this.peek()) throw makeError(ERR);
  };
  Parser.prototype.parseExpression = function () { return this.parseComparison(); };
  Parser.prototype.parseComparison = function () {
    var left = this.parseConcat();
    while (this.peek() && ['=', '<>', '<', '<=', '>', '>='].indexOf(this.peek().value) !== -1) {
      var op = this.next().value;
      var right = this.parseConcat();
      left = compareValues(left, right, op);
    }
    return left;
  };
  Parser.prototype.parseConcat = function () {
    var left = this.parseAdd();
    while (this.match('&')) left = { type: 'text', value: toText(left) + toText(this.parseAdd()) };
    return left;
  };
  Parser.prototype.parseAdd = function () {
    var left = this.parseMul();
    while (this.peek() && (this.peek().value === '+' || this.peek().value === '-')) {
      var op = this.next().value;
      var right = this.parseMul();
      left = { type: 'number', value: op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right) };
    }
    return left;
  };
  Parser.prototype.parseMul = function () {
    var left = this.parseUnary();
    while (this.peek() && (this.peek().value === '*' || this.peek().value === '/')) {
      var op = this.next().value;
      var right = this.parseUnary();
      if (op === '/' && toNumber(right) === 0) throw makeError(DIV0);
      left = { type: 'number', value: op === '*' ? toNumber(left) * toNumber(right) : toNumber(left) / toNumber(right) };
    }
    return left;
  };
  Parser.prototype.parseUnary = function () {
    if (this.match('+')) return { type: 'number', value: toNumber(this.parseUnary()) };
    if (this.match('-')) return { type: 'number', value: -toNumber(this.parseUnary()) };
    return this.parsePrimary();
  };
  Parser.prototype.parsePrimary = function () {
    var token = this.next();
    if (!token) throw makeError(ERR);
    if (token.type === 'number') return { type: 'number', value: token.value };
    if (token.type === 'string') return { type: 'text', value: token.value };
    if (token.type === 'name') {
      if (token.value === 'TRUE') return { type: 'boolean', value: true };
      if (token.value === 'FALSE') return { type: 'boolean', value: false };
      if (this.match('(')) return this.callFunction(token.value);
      throw makeError(ERR);
    }
    if (token.type === 'ref') {
      if (this.match(':')) {
        var end = this.next();
        if (!end || end.type !== 'ref') throw makeError(REF);
        return { type: 'range', values: this.rangeValues(token.ref, end.ref) };
      }
      return this.refValue(token.ref);
    }
    if (token.value === '(') {
      var value = this.parseExpression();
      this.expect(')');
      return value;
    }
    throw makeError(ERR);
  };
  Parser.prototype.callFunction = function (name) {
    var args = [];
    if (!this.match(')')) {
      do { args.push(this.parseExpression()); } while (this.match(','));
      this.expect(')');
    }
    if (name === 'SUM') return { type: 'number', value: flatten(args).reduce(function (sum, value) { return sum + toNumber(value); }, 0) };
    if (name === 'AVERAGE') {
      var avg = flatten(args).filter(isNumericLike);
      return { type: 'number', value: avg.length ? avg.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / avg.length : 0 };
    }
    if (name === 'MIN' || name === 'MAX') {
      var nums = flatten(args).filter(isNumericLike).map(toNumber);
      if (!nums.length) return { type: 'number', value: 0 };
      return { type: 'number', value: name === 'MIN' ? Math.min.apply(Math, nums) : Math.max.apply(Math, nums) };
    }
    if (name === 'COUNT') return { type: 'number', value: flatten(args).filter(isNumericLike).length };
    if (name === 'IF') return truthy(args[0]) ? (args[1] || blank()) : (args[2] || blank());
    if (name === 'AND') return { type: 'boolean', value: flatten(args).every(truthy) };
    if (name === 'OR') return { type: 'boolean', value: flatten(args).some(truthy) };
    if (name === 'NOT') return { type: 'boolean', value: !truthy(args[0]) };
    if (name === 'ABS') return { type: 'number', value: Math.abs(toNumber(args[0])) };
    if (name === 'ROUND') {
      var places = args.length > 1 ? toNumber(args[1]) : 0;
      var factor = Math.pow(10, places);
      return { type: 'number', value: Math.round(toNumber(args[0]) * factor) / factor };
    }
    if (name === 'CONCAT') return { type: 'text', value: flatten(args).map(toText).join('') };
    throw makeError(ERR);
  };
  Parser.prototype.refValue = function (ref) {
    var address = refAddress(ref);
    this.state.precedents[address] = true;
    if (!this.state.sheet.cells[address]) return blank();
    var evaluated = evaluateCell(this.state.sheet, address, this.stack);
    if (evaluated.error) throw makeError(evaluated.error);
    return { type: evaluated.type || valueType(evaluated.display), value: evaluated.display };
  };
  Parser.prototype.rangeValues = function (start, end) {
    var startCol = colToNumber(start.col);
    var endCol = colToNumber(end.col);
    var values = [];
    var c1 = Math.min(startCol, endCol);
    var c2 = Math.max(startCol, endCol);
    var r1 = Math.min(start.row, end.row);
    var r2 = Math.max(start.row, end.row);
    for (var row = r1; row <= r2; row += 1) {
      for (var col = c1; col <= c2; col += 1) values.push(this.refValue({ col: numberToCol(col), row: row }));
    }
    return values;
  };

  function blank() { return { type: 'blank', value: '' }; }
  function valueType(value) {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return value === '' ? 'blank' : 'text';
  }
  function flatten(values) {
    var out = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) value.forEach(function (inner) { out.push(inner); });
      else if (value && value.type === 'range') value.values.forEach(function (inner) { out.push(inner); });
      else out.push(value || blank());
    });
    return out;
  }
  function isNumericLike(value) {
    return value && value.type !== 'blank' && !isNaN(toNumber(value));
  }
  function toNumber(value) {
    value = value || blank();
    if (value.type === 'blank') return 0;
    if (value.type === 'boolean') return value.value ? 1 : 0;
    if (value.type === 'number') return value.value;
    var number = Number(value.value);
    if (isNaN(number)) throw makeError(ERR);
    return number;
  }
  function toText(value) {
    value = value || blank();
    if (value.type === 'blank') return '';
    if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
    return String(value.value);
  }
  function truthy(value) {
    value = value || blank();
    if (value.type === 'boolean') return value.value;
    if (value.type === 'number') return value.value !== 0;
    if (value.type === 'blank') return false;
    return String(value.value) !== '';
  }
  function compareValues(left, right, op) {
    var a;
    var b;
    if (left.type === 'number' || right.type === 'number' || left.type === 'blank' || right.type === 'blank') {
      a = toNumber(left);
      b = toNumber(right);
    } else {
      a = toText(left);
      b = toText(right);
    }
    var result = op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
    return { type: 'boolean', value: result };
  }

  function parseRef(raw) {
    var match = String(raw).match(/^(\$?)([A-Za-z]+)(\$?)(\d+)$/);
    if (!match) return null;
    var row = Number(match[4]);
    if (row < 1) throw makeError(REF);
    return { colAbs: !!match[1], col: match[2].toUpperCase(), rowAbs: !!match[3], row: row };
  }
  function refAddress(ref) { return ref.col + ref.row; }
  function colToNumber(col) {
    var n = 0;
    for (var i = 0; i < col.length; i += 1) n = n * 26 + col.charCodeAt(i) - 64;
    return n;
  }
  function numberToCol(number) {
    var col = '';
    while (number > 0) {
      number -= 1;
      col = String.fromCharCode(65 + (number % 26)) + col;
      number = Math.floor(number / 26);
    }
    return col;
  }

  function shiftFormula(formula, fromAddress, toAddress) {
    if (!formula || formula.charAt(0) !== '=') return formula;
    var from = parseRef(fromAddress);
    var to = parseRef(toAddress);
    var colOffset = colToNumber(to.col) - colToNumber(from.col);
    var rowOffset = to.row - from.row;
    var tokens = tokenize(formula.slice(1));
    return '=' + tokens.map(function (token) {
      if (token.type !== 'ref') return token.raw;
      var ref = token.ref;
      var col = ref.colAbs ? ref.col : numberToCol(colToNumber(ref.col) + colOffset);
      var row = ref.rowAbs ? ref.row : ref.row + rowOffset;
      if (!col || row < 1) return REF;
      return (ref.colAbs ? '$' : '') + col + (ref.rowAbs ? '$' : '') + row;
    }).join('');
  }

  return {
    createSheet: createSheet,
    setCell: setCell,
    recalculate: recalculate,
    evaluateCell: evaluateCell,
    shiftFormula: shiftFormula,
    parseRef: parseRef,
    errors: { ERR: ERR, DIV0: DIV0, REF: REF, CIRC: CIRC }
  };
}));
