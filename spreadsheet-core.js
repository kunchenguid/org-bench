(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpreadsheetCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = 26;
  const ROWS = 100;

  function colToIndex(col) {
    let n = 0;
    for (let i = 0; i < col.length; i++) n = n * 26 + col.charCodeAt(i) - 64;
    return n - 1;
  }

  function indexToCol(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function addrToCoord(addr) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(addr);
    if (!m) return null;
    return { col: colToIndex(m[1].toUpperCase()), row: Number(m[2]) - 1 };
  }

  function coordToAddr(row, col) {
    return indexToCol(col) + (row + 1);
  }

  function adjustFormulaReferences(formula, rowDelta, colDelta) {
    if (!formula || formula[0] !== '=') return formula;
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (all, absCol, col, absRow, row) => {
      const newCol = absCol ? col.toUpperCase() : indexToCol(colToIndex(col.toUpperCase()) + colDelta);
      const newRow = absRow ? Number(row) : Number(row) + rowDelta;
      if (colToIndex(newCol) < 0 || newRow < 1) return '#REF!';
      return `${absCol}${newCol}${absRow}${newRow}`;
    });
  }

  function shiftFormulaForInsertDelete(formula, type, index, delta) {
    if (!formula || formula[0] !== '=') return formula;
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (all, absCol, col, absRow, row) => {
      let c = colToIndex(col.toUpperCase());
      let r = Number(row) - 1;
      if (type === 'row') {
        if (delta < 0 && r === index) return '#REF!';
        if (r >= index) r += delta;
      } else {
        if (delta < 0 && c === index) return '#REF!';
        if (c >= index) c += delta;
      }
      if (r < 0 || c < 0) return '#REF!';
      return `${absCol}${indexToCol(c)}${absRow}${r + 1}`;
    });
  }

  class Parser {
    constructor(text, model, visiting) {
      this.text = text;
      this.i = 0;
      this.model = model;
      this.visiting = visiting;
    }
    parse() {
      const value = this.comparison();
      this.ws();
      if (this.i < this.text.length) throw new Error('syntax');
      return value;
    }
    ws() { while (/\s/.test(this.text[this.i])) this.i++; }
    eat(s) { this.ws(); if (this.text.slice(this.i, this.i + s.length).toUpperCase() === s) { this.i += s.length; return true; } return false; }
    comparison() {
      let left = this.concat();
      for (const op of ['<>', '<=', '>=', '=', '<', '>']) {
        if (this.eat(op)) {
          const right = this.concat();
          if (op === '=') left = left == right;
          if (op === '<>') left = left != right;
          if (op === '<') left = Number(left) < Number(right);
          if (op === '<=') left = Number(left) <= Number(right);
          if (op === '>') left = Number(left) > Number(right);
          if (op === '>=') left = Number(left) >= Number(right);
          break;
        }
      }
      return left;
    }
    concat() {
      let left = this.add();
      while (this.eat('&')) left = String(this.textValue(left)) + String(this.textValue(this.add()));
      return left;
    }
    add() {
      let left = this.mul();
      while (true) {
        if (this.eat('+')) left = Number(left || 0) + Number(this.mul() || 0);
        else if (this.eat('-')) left = Number(left || 0) - Number(this.mul() || 0);
        else return left;
      }
    }
    mul() {
      let left = this.unary();
      while (true) {
        if (this.eat('*')) left = Number(left || 0) * Number(this.unary() || 0);
        else if (this.eat('/')) {
          const right = Number(this.unary() || 0);
          if (right === 0) throw new Error('DIV/0');
          left = Number(left || 0) / right;
        } else return left;
      }
    }
    unary() { return this.eat('-') ? -Number(this.unary() || 0) : this.primary(); }
    primary() {
      this.ws();
      if (this.eat('(')) { const v = this.comparison(); if (!this.eat(')')) throw new Error('syntax'); return v; }
      if (this.text[this.i] === '"') return this.string();
      const num = /^\d+(?:\.\d+)?/.exec(this.text.slice(this.i));
      if (num) { this.i += num[0].length; return Number(num[0]); }
      const id = /^[A-Z_]+/i.exec(this.text.slice(this.i));
      if (!id) throw new Error('syntax');
      const name = id[0].toUpperCase();
      this.i += id[0].length;
      const save = this.i;
      const row = /^\$?\d+/.exec(this.text.slice(this.i));
      if (row && /^[A-Z]+$/.test(name)) {
        this.i += row[0].length;
        const a = addrToCoord(name + row[0].replace('$', ''));
        if (this.eat(':')) {
          const ref = /^(\$?[A-Z]+\$?\d+)/i.exec(this.text.slice(this.i));
          if (!ref) throw new Error('syntax');
          this.i += ref[0].length;
          return this.model.rangeValues(a, addrToCoord(ref[0].replace(/\$/g, '')), this.visiting);
        }
        return this.model.valueAt(a.row, a.col, this.visiting);
      }
      this.i = save;
      if (name === 'TRUE') return true;
      if (name === 'FALSE') return false;
      if (!this.eat('(')) throw new Error('unknown');
      const args = [];
      if (!this.eat(')')) {
        do { args.push(this.comparison()); } while (this.eat(','));
        if (!this.eat(')')) throw new Error('syntax');
      }
      return this.fn(name, args);
    }
    string() {
      this.i++;
      let out = '';
      while (this.i < this.text.length && this.text[this.i] !== '"') out += this.text[this.i++];
      if (this.text[this.i] !== '"') throw new Error('syntax');
      this.i++;
      return out;
    }
    flat(args) { return args.flat(Infinity).map(v => v === '' ? 0 : v); }
    textValue(v) { return v === true ? 'TRUE' : v === false ? 'FALSE' : v == null ? '' : v; }
    fn(name, args) {
      const vals = this.flat(args).filter(v => typeof v !== 'string' || v.trim() !== '');
      const nums = vals.map(Number).filter(Number.isFinite);
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return nums.length;
      if (name === 'IF') return args[0] ? args[1] : args[2];
      if (name === 'AND') return args.every(Boolean);
      if (name === 'OR') return args.some(Boolean);
      if (name === 'NOT') return !args[0];
      if (name === 'ABS') return Math.abs(Number(args[0] || 0));
      if (name === 'ROUND') return Number(Number(args[0] || 0).toFixed(Number(args[1] || 0)));
      if (name === 'CONCAT') return args.flat(Infinity).map(v => this.textValue(v)).join('');
      throw new Error('unknown');
    }
  }

  class SpreadsheetModel {
    constructor(rows = ROWS, cols = COLS) {
      this.rows = rows;
      this.cols = cols;
      this.cells = Object.create(null);
      this.version = 0;
    }
    key(row, col) { return `${row},${col}`; }
    addr(row, col) { return coordToAddr(row, col); }
    coord(addr) { return addrToCoord(addr); }
    setCell(addr, raw) { const c = addrToCoord(addr); this.setAt(c.row, c.col, raw); }
    setAt(row, col, raw) { if (raw == null || raw === '') delete this.cells[this.key(row, col)]; else this.cells[this.key(row, col)] = String(raw); this.version++; }
    getRaw(addr) { const c = addrToCoord(addr); return this.rawAt(c.row, c.col); }
    rawAt(row, col) { return this.cells[this.key(row, col)] || ''; }
    getDisplay(addr) { const c = addrToCoord(addr); return format(this.valueAt(c.row, c.col, new Set())); }
    displayAt(row, col) { return format(this.valueAt(row, col, new Set())); }
    valueAt(row, col, visiting) {
      if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return '#REF!';
      const key = this.key(row, col);
      if (visiting.has(key)) return '#CIRC!';
      const raw = this.rawAt(row, col);
      if (raw === '') return '';
      if (raw[0] !== '=') {
        const n = Number(raw);
        return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
      }
      visiting.add(key);
      try {
        const v = new Parser(raw.slice(1), this, visiting).parse();
        visiting.delete(key);
        return v;
      } catch (e) {
        visiting.delete(key);
        if (e.message === 'DIV/0') return '#DIV/0!';
        return '#ERR!';
      }
    }
    rangeValues(a, b, visiting) {
      if (!a || !b) return '#REF!';
      const out = [];
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(this.valueAt(r, c, visiting));
      }
      return out;
    }
    snapshot() { return JSON.stringify(this.cells); }
    restore(json) { this.cells = json ? JSON.parse(json) : Object.create(null); this.version++; }
    insertRow(index) { this.shift('row', index, 1); }
    deleteRow(index) { this.shift('row', index, -1); }
    insertCol(index) { this.shift('col', index, 1); }
    deleteCol(index) { this.shift('col', index, -1); }
    shift(type, index, delta) {
      const next = Object.create(null);
      for (const key of Object.keys(this.cells)) {
        let [r, c] = key.split(',').map(Number);
        if (type === 'row') {
          if (delta < 0 && r === index) continue;
          if (r >= index) r += delta;
        } else {
          if (delta < 0 && c === index) continue;
          if (c >= index) c += delta;
        }
        if (r >= 0 && c >= 0 && r < this.rows && c < this.cols) next[this.key(r, c)] = shiftFormulaForInsertDelete(this.cells[key], type, index, delta);
      }
      this.cells = next;
      this.version++;
    }
  }

  function format(v) {
    if (v === '#CIRC!' || v === '#ERR!' || v === '#DIV/0!' || v === '#REF!') return v;
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
    return v == null ? '' : String(v);
  }

  return { SpreadsheetModel, adjustFormulaReferences, shiftFormulaForInsertDelete, colToIndex, indexToCol, coordToAddr, addrToCoord, format };
});
