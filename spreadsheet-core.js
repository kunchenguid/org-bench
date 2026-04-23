(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpreadsheetCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROWS = 100;
  const COLS = 26;
  const ERR = '#ERR!';
  const REF = '#REF!';
  const DIV0 = '#DIV/0!';
  const CIRC = '#CIRC!';

  function colToName(col) {
    let name = '';
    col += 1;
    while (col > 0) {
      const rem = (col - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      col = Math.floor((col - 1) / 26);
    }
    return name;
  }

  function nameToCol(name) {
    let col = 0;
    for (const ch of name) col = col * 26 + ch.charCodeAt(0) - 64;
    return col - 1;
  }

  function keyOf(row, col) {
    return `${colToName(col)}${row + 1}`;
  }

  function parseCell(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!match) return null;
    return { row: Number(match[2]) - 1, col: nameToCol(match[1]) };
  }

  function normalize(a, b) {
    return {
      r1: Math.min(a.row, b.row),
      c1: Math.min(a.col, b.col),
      r2: Math.max(a.row, b.row),
      c2: Math.max(a.col, b.col)
    };
  }

  function displayValue(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') return Number.isFinite(value) ? String(Number(value.toFixed(10))) : ERR;
    return value == null ? '' : String(value);
  }

  function rawValue(raw) {
    if (raw === '') return '';
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) return n;
    if (/^TRUE$/i.test(raw)) return true;
    if (/^FALSE$/i.test(raw)) return false;
    return raw;
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let s = '';
        i++;
        while (i < input.length && input[i] !== '"') s += input[i++];
        if (input[i] !== '"') throw new Error(ERR);
        i++;
        tokens.push({ type: 'string', value: s });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&(),:<>='.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      if (/\d|\./.test(ch)) {
        let n = '';
        while (i < input.length && /[\d.]/.test(input[i])) n += input[i++];
        tokens.push({ type: 'number', value: Number(n) });
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let id = '';
        while (i < input.length && /[A-Za-z0-9_$]/.test(input[i])) id += input[i++];
        tokens.push({ type: 'id', value: id.toUpperCase() });
        continue;
      }
      throw new Error(ERR);
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  class Parser {
    constructor(sheet, input, stack) {
      this.sheet = sheet;
      this.tokens = tokenize(input);
      this.pos = 0;
      this.stack = stack;
    }
    peek() { return this.tokens[this.pos]; }
    take(value) {
      if (this.peek().value === value) { this.pos++; return true; }
      return false;
    }
    expect(value) { if (!this.take(value)) throw new Error(ERR); }
    parse() {
      const v = this.compare();
      if (this.peek().type !== 'eof') throw new Error(ERR);
      return v;
    }
    compare() {
      let left = this.concat();
      while (['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
        const op = this.peek().value; this.pos++;
        const right = this.concat();
        const a = this.scalar(left), b = this.scalar(right);
        if (op === '=') left = a === b;
        if (op === '<>') left = a !== b;
        if (op === '<') left = a < b;
        if (op === '<=') left = a <= b;
        if (op === '>') left = a > b;
        if (op === '>=') left = a >= b;
      }
      return left;
    }
    concat() {
      let left = this.add();
      while (this.take('&')) left = String(this.scalar(left)) + String(this.scalar(this.add()));
      return left;
    }
    add() {
      let left = this.mul();
      while (['+', '-'].includes(this.peek().value)) {
        const op = this.peek().value; this.pos++;
        const right = this.mul();
        left = op === '+' ? this.num(left) + this.num(right) : this.num(left) - this.num(right);
      }
      return left;
    }
    mul() {
      let left = this.unary();
      while (['*', '/'].includes(this.peek().value)) {
        const op = this.peek().value; this.pos++;
        const right = this.unary();
        if (op === '/') {
          const n = this.num(right);
          if (n === 0) throw new Error(DIV0);
          left = this.num(left) / n;
        } else left = this.num(left) * this.num(right);
      }
      return left;
    }
    unary() {
      if (this.take('-')) return -this.num(this.unary());
      return this.primary();
    }
    primary() {
      const t = this.peek();
      if (this.take('(')) { const v = this.compare(); this.expect(')'); return v; }
      if (t.type === 'number' || t.type === 'string') { this.pos++; return t.value; }
      if (t.type === 'id') {
        this.pos++;
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        if (this.take('(')) return this.call(t.value);
        const start = parseRefToken(t.value);
        if (!start) throw new Error(ERR);
        if (this.take(':')) {
          const endToken = this.peek();
          if (endToken.type !== 'id') throw new Error(ERR);
          this.pos++;
          const end = parseRefToken(endToken.value);
          if (!end) throw new Error(ERR);
          return this.range(start, end);
        }
        return this.sheet.evaluateCell(start.key, this.stack);
      }
      throw new Error(ERR);
    }
    call(name) {
      const args = [];
      if (!this.take(')')) {
        do { args.push(this.compare()); } while (this.take(','));
        this.expect(')');
      }
      const flat = args.flatMap(v => Array.isArray(v) ? v : [v]);
      const nums = flat.map(v => Number(this.scalar(v))).filter(Number.isFinite);
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return nums.length;
      if (name === 'IF') return this.bool(args[0]) ? args[1] : args[2];
      if (name === 'AND') return flat.every(v => this.bool(v));
      if (name === 'OR') return flat.some(v => this.bool(v));
      if (name === 'NOT') return !this.bool(args[0]);
      if (name === 'ABS') return Math.abs(this.num(args[0]));
      if (name === 'ROUND') return Number(this.num(args[0]).toFixed(args[1] == null ? 0 : this.num(args[1])));
      if (name === 'CONCAT') return flat.map(v => String(this.scalar(v))).join('');
      throw new Error(ERR);
    }
    range(start, end) {
      const out = [];
      const r1 = Math.min(start.row, end.row), r2 = Math.max(start.row, end.row);
      const c1 = Math.min(start.col, end.col), c2 = Math.max(start.col, end.col);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(this.sheet.evaluateCell(keyOf(r, c), this.stack));
      return out;
    }
    scalar(v) { return Array.isArray(v) ? this.scalar(v[0]) : (v && v.error ? 0 : v); }
    num(v) { const n = Number(this.scalar(v)); return Number.isFinite(n) ? n : 0; }
    bool(v) { v = this.scalar(v); return !!(v && v !== 'FALSE'); }
  }

  function parseRefToken(token) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(token);
    if (!match) return null;
    const col = nameToCol(match[2]);
    const row = Number(match[4]) - 1;
    if (row < 0 || col < 0) return null;
    return { row, col, key: keyOf(row, col), absCol: !!match[1], absRow: !!match[3] };
  }

  function adjustRefs(raw, dr, dc, mode) {
    if (!raw.startsWith('=')) return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, ac, colName, ar, rowText) => {
      let col = nameToCol(colName), row = Number(rowText) - 1;
      if (mode === 'copy') {
        if (!ac) col += dc;
        if (!ar) row += dr;
      } else if (mode === 'rowInsert') {
        if (row >= dr) row += 1;
      } else if (mode === 'rowDelete') {
        if (row === dr) return REF;
        if (row > dr) row -= 1;
      } else if (mode === 'colInsert') {
        if (col >= dc) col += 1;
      } else if (mode === 'colDelete') {
        if (col === dc) return REF;
        if (col > dc) col -= 1;
      }
      if (row < 0 || col < 0) return REF;
      return `${ac}${colToName(col)}${ar}${row + 1}`;
    });
  }

  class SpreadsheetModel {
    constructor(data) {
      this.rows = ROWS;
      this.cols = COLS;
      this.cells = Object.assign({}, data && data.cells);
      this.cache = {};
      this.undoStack = [];
      this.redoStack = [];
      this.clipboard = null;
    }
    snapshot() { return Object.assign({}, this.cells); }
    restore(cells) { this.cells = Object.assign({}, cells); this.cache = {}; }
    record(before) { this.undoStack.push(before); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack = []; }
    getRaw(ref) { return this.cells[ref] || ''; }
    setRaw(ref, raw) { raw ? this.cells[ref] = raw : delete this.cells[ref]; this.cache = {}; }
    setCell(ref, raw, options) { const before = this.snapshot(); this.setRaw(ref, String(raw)); if (!options || !options.silent) this.record(before); }
    getDisplay(ref) { return displayValue(this.evaluateCell(ref, [])); }
    evaluateCell(ref, stack) {
      if (this.cache[ref] !== undefined) return this.cache[ref];
      if (stack.includes(ref)) return { error: CIRC };
      const raw = this.getRaw(ref);
      if (!raw.startsWith('=')) return rawValue(raw);
      try {
        const value = new Parser(this, raw.slice(1), stack.concat(ref)).parse();
        this.cache[ref] = value;
        return value;
      } catch (error) {
        const value = { error: [DIV0, REF, CIRC].includes(error.message) ? error.message : ERR };
        this.cache[ref] = value;
        return value;
      }
    }
    cellsInRange(a, b) {
      const n = normalize(a, b), cells = [];
      for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) cells.push({ row: r, col: c, ref: keyOf(r, c) });
      return cells;
    }
    clearRange(a, b) { const before = this.snapshot(); for (const cell of this.cellsInRange(a, b)) delete this.cells[cell.ref]; this.cache = {}; this.record(before); }
    copyRange(a, b, cut) {
      const n = normalize(a, b);
      const data = [];
      for (let r = n.r1; r <= n.r2; r++) {
        const row = [];
        for (let c = n.c1; c <= n.c2; c++) row.push(this.getRaw(keyOf(r, c)));
        data.push(row);
      }
      this.clipboard = { data, origin: { row: n.r1, col: n.c1 }, cut: !!cut, range: n };
      return data;
    }
    copyText(a, b, cut) { return this.copyRange(a, b, cut).map(row => row.join('\t')).join('\n'); }
    pasteAt(target, text) {
      const before = this.snapshot();
      let data, origin;
      if (text != null) { data = text.split(/\r?\n/).filter((line, i, arr) => line !== '' || i < arr.length - 1).map(line => line.split('\t')); origin = target; }
      else if (this.clipboard) { data = this.clipboard.data; origin = this.clipboard.origin; }
      else return;
      data.forEach((row, r) => row.forEach((raw, c) => {
        const adjusted = adjustRefs(raw, target.row + r - origin.row, target.col + c - origin.col, 'copy');
        this.setRaw(keyOf(target.row + r, target.col + c), adjusted);
      }));
      if (!text && this.clipboard && this.clipboard.cut) {
        for (const cell of this.cellsInRange({ row: this.clipboard.range.r1, col: this.clipboard.range.c1 }, { row: this.clipboard.range.r2, col: this.clipboard.range.c2 })) delete this.cells[cell.ref];
        this.clipboard.cut = false;
      }
      this.record(before);
    }
    undo() { if (!this.undoStack.length) return; const before = this.snapshot(); this.redoStack.push(before); this.restore(this.undoStack.pop()); }
    redo() { if (!this.redoStack.length) return; const before = this.snapshot(); this.undoStack.push(before); this.restore(this.redoStack.pop()); }
    insertRow(index) {
      const before = this.snapshot(), next = {};
      Object.keys(this.cells).forEach(ref => {
        const p = parseCell(ref); if (!p) return;
        const row = p.row >= index ? p.row + 1 : p.row;
        next[keyOf(row, p.col)] = adjustRefs(this.cells[ref], index, 0, 'rowInsert');
      });
      this.cells = next; this.cache = {}; this.record(before);
    }
    deleteRow(index) {
      const before = this.snapshot(), next = {};
      Object.keys(this.cells).forEach(ref => {
        const p = parseCell(ref); if (!p || p.row === index) return;
        const row = p.row > index ? p.row - 1 : p.row;
        next[keyOf(row, p.col)] = adjustRefs(this.cells[ref], index, 0, 'rowDelete');
      });
      this.cells = next; this.cache = {}; this.record(before);
    }
    insertCol(index) {
      const before = this.snapshot(), next = {};
      Object.keys(this.cells).forEach(ref => {
        const p = parseCell(ref); if (!p) return;
        const col = p.col >= index ? p.col + 1 : p.col;
        next[keyOf(p.row, col)] = adjustRefs(this.cells[ref], 0, index, 'colInsert');
      });
      this.cells = next; this.cache = {}; this.record(before);
    }
    deleteCol(index) {
      const before = this.snapshot(), next = {};
      Object.keys(this.cells).forEach(ref => {
        const p = parseCell(ref); if (!p || p.col === index) return;
        const col = p.col > index ? p.col - 1 : p.col;
        next[keyOf(p.row, col)] = adjustRefs(this.cells[ref], 0, index, 'colDelete');
      });
      this.cells = next; this.cache = {}; this.record(before);
    }
    toJSON() { return { cells: this.cells }; }
  }

  return { SpreadsheetModel, colToName, keyOf, parseCell, adjustRefs, displayValue };
});
