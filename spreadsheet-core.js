(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERR = '#ERR!';
  const CIRC = '#CIRC!';
  const DIV0 = '#DIV/0!';
  const REF = '#REF!';

  function createSheet(cols, rows) {
    const sheet = { cols, rows, cells: Object.create(null), cache: Object.create(null) };
    sheet.setCell = (addr, raw) => setCell(sheet, addr, raw);
    sheet.getRaw = (addr) => rawValue(sheet, addr);
    sheet.getDisplayValue = (addr) => displayValue(sheet, addr);
    sheet.insertRows = (row, count) => insertRows(sheet, row, count);
    sheet.deleteRows = (row, count) => deleteRows(sheet, row, count);
    return sheet;
  }

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.replace(/\$/g, '')) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function indexToCol(index) {
    let n = index + 1, out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function addressToCoord(addr) {
    const m = String(addr).match(/^\$?([A-Z]+)\$?(\d+)$/i);
    if (!m) throw new Error('bad address');
    return { col: colToIndex(m[1].toUpperCase()), row: Number(m[2]) - 1 };
  }

  function coordToAddress(coord) {
    return indexToCol(coord.col) + (coord.row + 1);
  }

  function normalizeAddress(addr) {
    return coordToAddress(addressToCoord(addr.toUpperCase()));
  }

  function rangeFromA1(a1) {
    const parts = String(a1).split(':');
    const a = addressToCoord(parts[0]);
    const b = addressToCoord(parts[1] || parts[0]);
    return {
      start: { col: Math.min(a.col, b.col), row: Math.min(a.row, b.row) },
      end: { col: Math.max(a.col, b.col), row: Math.max(a.row, b.row) },
    };
  }

  function setCell(sheet, addr, raw) {
    sheet.cells[normalizeAddress(addr)] = String(raw ?? '');
    sheet.cache = Object.create(null);
  }

  function rawValue(sheet, addr) {
    return sheet.cells[normalizeAddress(addr)] || '';
  }

  function displayValue(sheet, addr) {
    if (rawValue(sheet, addr) === '') return '';
    const v = evaluateCell(sheet, normalizeAddress(addr), []);
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (v == null) return '';
    return String(v);
  }

  function scalar(raw) {
    if (raw === '') return 0;
    const n = Number(raw);
    return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
  }

  function evaluateCell(sheet, addr, stack) {
    if (sheet.cache[addr] !== undefined) return sheet.cache[addr];
    if (stack.includes(addr)) return CIRC;
    const raw = sheet.cells[addr] || '';
    let value;
    if (!raw.startsWith('=')) value = scalar(raw);
    else value = evaluateFormula(sheet, raw.slice(1), stack.concat(addr));
    sheet.cache[addr] = value;
    return value;
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let s = '', j = i + 1;
        while (j < input.length && input[j] !== '"') s += input[j++];
        tokens.push({ type: 'str', value: s }); i = j + 1; continue;
      }
      const two = input.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&=<>():,'.includes(ch)) { tokens.push({ type: ch === '(' || ch === ')' || ch === ':' || ch === ',' ? ch : 'op', value: ch }); i++; continue; }
      const num = input.slice(i).match(/^\d+(?:\.\d+)?/);
      if (num) { tokens.push({ type: 'num', value: Number(num[0]) }); i += num[0].length; continue; }
      const word = input.slice(i).match(/^\$?[A-Z]+\$?\d+|^[A-Z_]+/i);
      if (word) { tokens.push({ type: 'id', value: word[0].toUpperCase() }); i += word[0].length; continue; }
      throw new Error('bad token');
    }
    return tokens;
  }

  function evaluateFormula(sheet, formula, stack) {
    try {
      const p = parser(sheet, tokenize(formula), stack);
      const v = p.expression();
      if (p.peek()) return ERR;
      return v;
    } catch (e) {
      return e.message === DIV0 || e.message === CIRC || e.message === REF ? e.message : ERR;
    }
  }

  function parser(sheet, tokens, stack) {
    let pos = 0;
    const peek = () => tokens[pos];
    const take = () => tokens[pos++];
    const eat = (type, value) => peek() && peek().type === type && (value === undefined || peek().value === value) ? take() : null;
    const num = v => {
      if (v === CIRC || v === REF || v === ERR || v === DIV0) throw new Error(v);
      if (v === true) return 1;
      if (v === false || v === '') return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const txt = v => v === true ? 'TRUE' : v === false ? 'FALSE' : (v == null ? '' : String(v));
    const compare = (a, op, b) => {
      const an = Number(a), bn = Number(b);
      const bothNum = Number.isFinite(an) && Number.isFinite(bn);
      const x = bothNum ? an : txt(a), y = bothNum ? bn : txt(b);
      if (op === '=') return x === y;
      if (op === '<>') return x !== y;
      if (op === '<') return x < y;
      if (op === '<=') return x <= y;
      if (op === '>') return x > y;
      return x >= y;
    };
    function expression() { return comparison(); }
    function comparison() {
      let v = concat();
      while (peek() && peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) v = compare(v, take().value, concat());
      return v;
    }
    function concat() {
      let v = add();
      while (eat('op', '&')) v = txt(v) + txt(add());
      return v;
    }
    function add() {
      let v = mul();
      while (peek() && peek().type === 'op' && ['+', '-'].includes(peek().value)) {
        const op = take().value, r = mul();
        v = op === '+' ? num(v) + num(r) : num(v) - num(r);
      }
      return v;
    }
    function mul() {
      let v = unary();
      while (peek() && peek().type === 'op' && ['*', '/'].includes(peek().value)) {
        const op = take().value, r = unary();
        if (op === '/' && num(r) === 0) throw new Error(DIV0);
        v = op === '*' ? num(v) * num(r) : num(v) / num(r);
      }
      return v;
    }
    function unary() {
      if (eat('op', '-')) return -num(unary());
      return primary();
    }
    function primary() {
      const t = take();
      if (!t) throw new Error(ERR);
      if (t.type === 'num' || t.type === 'str') return t.value;
      if (t.type === '(') { const v = expression(); if (!eat(')')) throw new Error(ERR); return v; }
      if (t.type === 'id') {
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        if (/^\$?[A-Z]+\$?\d+$/.test(t.value)) {
          if (eat(':')) return makeRange(t.value, take());
          const c = addressToCoord(t.value);
          if (c.row < 0 || c.col < 0 || c.row >= sheet.rows || c.col >= sheet.cols) throw new Error(REF);
          return evaluateCell(sheet, coordToAddress(c), stack);
        }
        if (eat('(')) {
          const args = [];
          if (!eat(')')) {
            do { args.push(expression()); } while (eat(','));
            if (!eat(')')) throw new Error(ERR);
          }
          return callFn(t.value, args);
        }
      }
      throw new Error(ERR);
    }
    function makeRange(start, endTok) {
      if (!endTok || endTok.type !== 'id' || !/^\$?[A-Z]+\$?\d+$/.test(endTok.value)) throw new Error(ERR);
      const r = rangeFromA1(start + ':' + endTok.value), vals = [];
      for (let row = r.start.row; row <= r.end.row; row++) for (let col = r.start.col; col <= r.end.col; col++) vals.push(evaluateCell(sheet, coordToAddress({ row, col }), stack));
      return vals;
    }
    function flat(args) { return args.flat(Infinity); }
    function callFn(name, args) {
      const values = flat(args);
      if (name === 'SUM') return values.reduce((a, b) => a + num(b), 0);
      if (name === 'AVERAGE') return values.length ? values.reduce((a, b) => a + num(b), 0) / values.length : 0;
      if (name === 'MIN') return Math.min(...values.map(num));
      if (name === 'MAX') return Math.max(...values.map(num));
      if (name === 'COUNT') return values.filter(v => Number.isFinite(Number(v)) && v !== '').length;
      if (name === 'IF') return args[0] ? args[1] : args[2];
      if (name === 'AND') return values.every(Boolean);
      if (name === 'OR') return values.some(Boolean);
      if (name === 'NOT') return !args[0];
      if (name === 'ABS') return Math.abs(num(args[0]));
      if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
      if (name === 'CONCAT') return values.map(txt).join('');
      throw new Error(ERR);
    }
    return { expression, peek };
  }

  function adjustFormula(raw, dCol, dRow) {
    if (!raw.startsWith('=')) return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, absC, col, absR, row) => {
      const c = absC ? col : indexToCol(Math.max(0, colToIndex(col) + dCol));
      const r = absR ? row : Math.max(1, Number(row) + dRow);
      return absC + c + absR + r;
    });
  }

  function pasteCells(sheet, range, target, cut) {
    const writes = [];
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let col = range.start.col; col <= range.end.col; col++) {
        const src = coordToAddress({ row, col });
        const dst = coordToAddress({ row: target.row + row - range.start.row, col: target.col + col - range.start.col });
        writes.push([dst, adjustFormula(sheet.cells[src] || '', target.col - range.start.col, target.row - range.start.row)]);
        if (cut) sheet.cells[src] = '';
      }
    }
    writes.forEach(([a, v]) => { sheet.cells[a] = v; });
    sheet.cache = Object.create(null);
  }

  function adjustFormulaForInsertDelete(raw, change) {
    if (!raw || raw[0] !== '=') return raw || '';
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, absC, col, absR, row) => {
      let c = colToIndex(col), r = Number(row) - 1;
      if (change.type === 'row' && !absR) {
        if (change.delta < 0 && r >= change.index && r < change.index - change.delta) return REF;
        if (r >= change.index) r += change.delta;
      }
      if (change.type === 'col' && !absC) {
        if (change.delta < 0 && c >= change.index && c < change.index - change.delta) return REF;
        if (c >= change.index) c += change.delta;
      }
      return absC + indexToCol(c) + absR + (r + 1);
    });
  }

  function insertRows(sheet, row, count) {
    const next = Object.create(null);
    Object.keys(sheet.cells).forEach((addr) => {
      const c = addressToCoord(addr);
      if (c.row >= row) c.row += count;
      if (c.row < sheet.rows) next[coordToAddress(c)] = adjustFormulaForInsertDelete(sheet.cells[addr], { type: 'row', index: row, delta: count });
    });
    sheet.cells = next;
    sheet.cache = Object.create(null);
  }

  function deleteRows(sheet, row, count) {
    const next = Object.create(null);
    Object.keys(sheet.cells).forEach((addr) => {
      const c = addressToCoord(addr);
      if (c.row >= row && c.row < row + count) return;
      if (c.row >= row + count) c.row -= count;
      next[coordToAddress(c)] = adjustFormulaForInsertDelete(sheet.cells[addr], { type: 'row', index: row, delta: -count });
    });
    sheet.cells = next;
    sheet.cache = Object.create(null);
  }

  function shiftFormula(raw, fromRow, fromCol, toRow, toCol) {
    return adjustFormula(raw, toCol - fromCol, toRow - fromRow);
  }

  return { createSheet, setCell, rawValue, displayValue, addressToCoord, coordToAddress, rangeFromA1, pasteCells, adjustFormula, shiftFormula, adjustFormulaForInsertDelete, indexToCol };
});
