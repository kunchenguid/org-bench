(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpreadsheetCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function colToName(col) {
    var n = col + 1;
    var s = '';
    while (n > 0) {
      var r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function nameToCol(name) {
    var n = 0;
    for (var i = 0; i < name.length; i++) n = n * 26 + name.charCodeAt(i) - 64;
    return n - 1;
  }

  function cellKey(row, col) { return colToName(col) + (row + 1); }

  function parseCellAddress(addr) {
    var m = /^([A-Z]+)(\d+)$/.exec(addr);
    if (!m) throw new Error('bad address');
    return { col: nameToCol(m[1]), row: parseInt(m[2], 10) - 1 };
  }

  function parseRef(text) {
    var m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(text);
    if (!m) return null;
    return { absCol: !!m[1], col: nameToCol(m[2]), absRow: !!m[3], row: parseInt(m[4], 10) - 1 };
  }

  function refToText(ref) {
    if (ref.refError) return '#REF!';
    return (ref.absCol ? '$' : '') + colToName(ref.col) + (ref.absRow ? '$' : '') + (ref.row + 1);
  }

  function adjustFormula(formula, srcRow, srcCol, dstRow, dstCol) {
    if (!formula || formula.charAt(0) !== '=') return formula;
    var dr = dstRow - srcRow;
    var dc = dstCol - srcCol;
    return replaceFormulaRefs(formula, function (text) {
      var ref = parseRef(text);
      if (!ref) return text;
      if (!ref.absRow) ref.row += dr;
      if (!ref.absCol) ref.col += dc;
      if (ref.row < 0 || ref.col < 0) return '#REF!';
      return refToText(ref);
    });
  }

  function adjustFormulaForStructure(formula, type, index, delta) {
    if (!formula || formula.charAt(0) !== '=') return formula;
    var deletedRef = false;
    var adjusted = replaceFormulaRefs(formula, function (text) {
      var ref = parseRef(text);
      if (!ref) return text;
      if (type === 'row') {
        if (delta > 0 && ref.row >= index) ref.row += delta;
        if (delta < 0 && ref.row === index) { deletedRef = true; return '#REF!'; }
        if (delta < 0 && ref.row > index) ref.row += delta;
      } else {
        if (delta > 0 && ref.col >= index) ref.col += delta;
        if (delta < 0 && ref.col === index) { deletedRef = true; return '#REF!'; }
        if (delta < 0 && ref.col > index) ref.col += delta;
      }
      return refToText(ref);
    });
    return deletedRef ? '=#REF!' : adjusted;
  }

  function replaceFormulaRefs(formula, replacer) {
    var out = '';
    var segment = '';
    var inString = false;
    for (var i = 0; i < formula.length; i++) {
      var ch = formula.charAt(i);
      if (ch === '"') {
        out += inString ? segment : segment.replace(/\$?[A-Z]+\$?\d+/g, replacer);
        out += ch;
        segment = '';
        inString = !inString;
      } else {
        segment += ch;
      }
    }
    out += inString ? segment : segment.replace(/\$?[A-Z]+\$?\d+/g, replacer);
    return out;
  }

  function rawValue(sheet, row, col) {
    return sheet.cells[cellKey(row, col)] || '';
  }

  function primitive(raw) {
    if (raw === '') return { value: 0, display: '' };
    var trimmed = String(raw).trim();
    if (/^TRUE$/i.test(trimmed)) return { value: true, display: 'TRUE' };
    if (/^FALSE$/i.test(trimmed)) return { value: false, display: 'FALSE' };
    if (trimmed !== '' && !isNaN(Number(trimmed))) return { value: Number(trimmed), display: format(Number(trimmed)) };
    return { value: raw, display: String(raw) };
  }

  function format(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 10000000000) / 10000000000) : '#ERR!';
    if (value == null) return '';
    return String(value);
  }

  function evaluateCell(sheet, pos, stack) {
    stack = stack || {};
    if (pos.row < 0 || pos.col < 0 || pos.row >= sheet.rows || pos.col >= sheet.cols) return { value: { error: '#REF!' }, display: '#REF!' };
    var key = cellKey(pos.row, pos.col);
    if (stack[key]) return { value: { error: '#CIRC!' }, display: '#CIRC!' };
    var raw = rawValue(sheet, pos.row, pos.col);
    if (!String(raw).startsWith('=')) return primitive(raw);
    if (String(raw) === '=#REF!') return { value: { error: '#REF!' }, display: '#REF!' };
    stack[key] = true;
    try {
      var val = parseFormula(String(raw).slice(1), sheet, stack);
      delete stack[key];
      return { value: val, display: format(val) };
    } catch (e) {
      delete stack[key];
      return { value: { error: e.message || '#ERR!' }, display: e.message && e.message.charAt(0) === '#' ? e.message : '#ERR!' };
    }
  }

  function tokenize(input) {
    var tokens = [];
    var i = 0;
    while (i < input.length) {
      var ch = input[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        var s = '';
        i++;
        while (i < input.length && input[i] !== '"') s += input[i++];
        if (input[i] !== '"') throw new Error('#ERR!');
        i++;
        tokens.push({ type: 'string', value: s });
        continue;
      }
      var two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].indexOf(two) >= 0) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/(),:&=<>'.indexOf(ch) >= 0) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      var num = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      var id = /^\$?[A-Za-z]+\$?\d+|^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
      if (id) { tokens.push({ type: 'id', value: id[0].toUpperCase() }); i += id[0].length; continue; }
      throw new Error('#ERR!');
    }
    return tokens;
  }

  function parseFormula(expr, sheet, stack) {
    var t = tokenize(expr);
    var i = 0;
    function peek(v) { return t[i] && (v == null || t[i].value === v) ? t[i] : null; }
    function eat(v) { if (!peek(v)) throw new Error('#ERR!'); return t[i++]; }
    function toNum(v) { if (v && v.error) throw new Error(v.error); if (v === '' || v == null) return 0; var n = Number(v); if (isNaN(n)) return 0; return n; }
    function toBool(v) { if (v && v.error) throw new Error(v.error); if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; return String(v).toUpperCase() === 'TRUE'; }
    function cmp(a, b, op) {
      if (a && a.error) throw new Error(a.error); if (b && b.error) throw new Error(b.error);
      var an = Number(a), bn = Number(b), numeric = !isNaN(an) && !isNaN(bn) && a !== '' && b !== '';
      var x = numeric ? an : String(a), y = numeric ? bn : String(b);
      if (op === '=') return x === y; if (op === '<>') return x !== y; if (op === '<') return x < y; if (op === '<=') return x <= y; if (op === '>') return x > y; return x >= y;
    }
    function expression() { return comparison(); }
    function comparison() { var v = concat(); while (peek('=') || peek('<>') || peek('<') || peek('<=') || peek('>') || peek('>=')) { var op = t[i++].value; v = cmp(v, concat(), op); } return v; }
    function concat() { var v = add(); while (peek('&')) { eat('&'); v = format(v) + format(add()); } return v; }
    function add() { var v = mul(); while (peek('+') || peek('-')) { var op = t[i++].value; var r = mul(); v = op === '+' ? toNum(v) + toNum(r) : toNum(v) - toNum(r); } return v; }
    function mul() { var v = unary(); while (peek('*') || peek('/')) { var op = t[i++].value; var r = unary(); if (op === '/' && toNum(r) === 0) throw new Error('#DIV/0!'); v = op === '*' ? toNum(v) * toNum(r) : toNum(v) / toNum(r); } return v; }
    function unary() { if (peek('-')) { eat('-'); return -toNum(unary()); } if (peek('+')) { eat('+'); return toNum(unary()); } return primary(); }
    function cellOrRange(id) {
      var ref = parseRef(id);
      if (!ref) return null;
      if (ref.row < 0 || ref.col < 0 || ref.row >= sheet.rows || ref.col >= sheet.cols) throw new Error('#REF!');
      if (peek(':')) {
        eat(':');
        var endTok = eat().value;
        var end = parseRef(endTok);
        if (!end) throw new Error('#ERR!');
        if (end.row < 0 || end.col < 0 || end.row >= sheet.rows || end.col >= sheet.cols) throw new Error('#REF!');
        var out = [];
        var r1 = Math.min(ref.row, end.row), r2 = Math.max(ref.row, end.row);
        var c1 = Math.min(ref.col, end.col), c2 = Math.max(ref.col, end.col);
        for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) out.push(evaluateCell(sheet, { row: r, col: c }, stack).value);
        return out;
      }
      return evaluateCell(sheet, { row: ref.row, col: ref.col }, stack).value;
    }
    function primary() {
      var tok = t[i++];
      if (!tok) throw new Error('#ERR!');
      if (tok.type === 'number' || tok.type === 'string') return tok.value;
      if (tok.value === '(') { var v = expression(); eat(')'); return v; }
      if (tok.type === 'id') {
        if (tok.value === 'TRUE') return true;
        if (tok.value === 'FALSE') return false;
        if (peek('(')) {
          eat('(');
          var args = [];
          if (!peek(')')) { do { args.push(expression()); if (!peek(',')) break; eat(','); } while (true); }
          eat(')');
          return callFunction(tok.value, args, toNum, toBool);
        }
        var v = cellOrRange(tok.value);
        if (v !== null) return v;
      }
      throw new Error('#ERR!');
    }
    function eatAny() { return t[i++]; }
    eat = function (v) { if (v == null) return eatAny(); if (!peek(v)) throw new Error('#ERR!'); return t[i++]; };
    var result = expression();
    if (i < t.length) throw new Error('#ERR!');
    return result;
  }

  function flatten(args) {
    var out = [];
    args.forEach(function (a) { Array.isArray(a) ? out.push.apply(out, flatten(a)) : out.push(a); });
    return out;
  }

  function callFunction(name, args, toNum, toBool) {
    var vals = flatten(args);
    if (name === 'SUM') return vals.reduce(function (a, b) { return a + toNum(b); }, 0);
    if (name === 'AVERAGE') return vals.length ? vals.reduce(function (a, b) { return a + toNum(b); }, 0) / vals.length : 0;
    if (name === 'MIN') return Math.min.apply(Math, vals.map(toNum));
    if (name === 'MAX') return Math.max.apply(Math, vals.map(toNum));
    if (name === 'COUNT') return vals.filter(function (v) { return v !== '' && !isNaN(Number(v)); }).length;
    if (name === 'IF') return toBool(args[0]) ? args[1] : args[2];
    if (name === 'AND') return vals.every(toBool);
    if (name === 'OR') return vals.some(toBool);
    if (name === 'NOT') return !toBool(args[0]);
    if (name === 'ABS') return Math.abs(toNum(args[0]));
    if (name === 'ROUND') { var p = Math.pow(10, toNum(args[1] || 0)); return Math.round(toNum(args[0]) * p) / p; }
    if (name === 'CONCAT') return vals.map(format).join('');
    throw new Error('#ERR!');
  }

  return {
    colToName: colToName,
    nameToCol: nameToCol,
    cellKey: cellKey,
    parseCellAddress: parseCellAddress,
    evaluateCell: evaluateCell,
    adjustFormula: adjustFormula,
    adjustFormulaForStructure: adjustFormulaForStructure,
    format: format,
  };
});
