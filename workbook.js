(function (root) {
  const ERR = '#ERR!';
  const REF = '#REF!';
  const CIRC = '#CIRC!';
  const DIV0 = '#DIV/0!';

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function indexToCol(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function parseRef(ref) {
    const m = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i);
    if (!m) return null;
    return { colAbs: !!m[1], col: colToIndex(m[2]), rowAbs: !!m[3], row: Number(m[4]) - 1 };
  }

  function refToString(ref) {
    if (ref.refError) return REF;
    return `${ref.colAbs ? '$' : ''}${indexToCol(ref.col)}${ref.rowAbs ? '$' : ''}${ref.row + 1}`;
  }

  function normalizeAddress(addr) {
    const ref = parseRef(addr);
    if (!ref || ref.row < 0 || ref.col < 0) throw new Error('bad address');
    return `${indexToCol(ref.col)}${ref.row + 1}`;
  }

  function splitRange(range) {
    const [a, b = a] = range.split(':');
    const start = parseRef(a);
    const end = parseRef(b);
    return {
      top: Math.min(start.row, end.row),
      bottom: Math.max(start.row, end.row),
      left: Math.min(start.col, end.col),
      right: Math.max(start.col, end.col)
    };
  }

  function rewriteFormulaReferences(formula, rowDelta, colDelta) {
    return rewriteFormula(formula, (ref) => ({
      ...ref,
      row: ref.rowAbs ? ref.row : ref.row + rowDelta,
      col: ref.colAbs ? ref.col : ref.col + colDelta
    }));
  }

  function rewriteFormula(formula, mapper) {
    let out = '';
    let i = 0;
    let inString = false;
    while (i < formula.length) {
      const ch = formula[i];
      if (ch === '"') {
        inString = !inString;
        out += ch;
        i++;
        continue;
      }
      if (!inString) {
        const m = formula.slice(i).match(/^(\$?[A-Z]+\$?\d+)/i);
        if (m) {
          const ref = parseRef(m[1]);
          out += refToString(mapper(ref));
          i += m[1].length;
          continue;
        }
      }
      out += ch;
      i++;
    }
    return out;
  }

  function adjustForRows(formula, index, count, deleting) {
    return rewriteFormula(formula, (ref) => {
      if (deleting) {
        if (ref.row >= index && ref.row < index + count) return { refError: true };
        return { ...ref, row: ref.row >= index + count ? ref.row - count : ref.row };
      }
      return { ...ref, row: ref.row >= index ? ref.row + count : ref.row };
    });
  }

  function adjustForCols(formula, index, count, deleting) {
    return rewriteFormula(formula, (ref) => {
      if (deleting) {
        if (ref.col >= index && ref.col < index + count) return { refError: true };
        return { ...ref, col: ref.col >= index + count ? ref.col - count : ref.col };
      }
      return { ...ref, col: ref.col >= index ? ref.col + count : ref.col };
    });
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
      if (['<=', '>=', '<>'].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&=<>(),:'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      const num = input.slice(i).match(/^\d+(?:\.\d+)?/);
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const ref = input.slice(i).match(/^\$?[A-Z]+\$?\d+/i);
      if (ref) { tokens.push({ type: 'ref', value: ref[0].toUpperCase() }); i += ref[0].length; continue; }
      const ident = input.slice(i).match(/^[A-Z_][A-Z0-9_]*/i);
      if (ident) { tokens.push({ type: 'ident', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      if (input.slice(i, i + 5) === REF) { tokens.push({ type: 'error', value: REF }); i += 5; continue; }
      throw new Error(ERR);
    }
    return tokens;
  }

  class Parser {
    constructor(tokens, workbook, stack) {
      this.tokens = tokens;
      this.workbook = workbook;
      this.stack = stack;
      this.i = 0;
    }
    peek(value) { return this.tokens[this.i] && (!value || this.tokens[this.i].value === value); }
    take(value) { if (this.peek(value)) return this.tokens[this.i++]; return null; }
    expect(value) { const t = this.take(value); if (!t) throw new Error(ERR); return t; }
    parse() { const value = this.compare(); if (this.i !== this.tokens.length) throw new Error(ERR); return value; }
    compare() {
      let left = this.concat();
      while (this.peek() && ['=', '<>', '<', '<=', '>', '>='].includes(this.tokens[this.i].value)) {
        const op = this.tokens[this.i++].value;
        const right = this.concat();
        const a = scalar(left);
        const b = scalar(right);
        if (op === '=') left = a == b;
        if (op === '<>') left = a != b;
        if (op === '<') left = a < b;
        if (op === '<=') left = a <= b;
        if (op === '>') left = a > b;
        if (op === '>=') left = a >= b;
      }
      return left;
    }
    concat() {
      let left = this.add();
      while (this.take('&')) left = String(scalar(left)) + String(scalar(this.add()));
      return left;
    }
    add() {
      let left = this.mul();
      while (this.peek('+') || this.peek('-')) {
        const op = this.tokens[this.i++].value;
        const right = this.mul();
        left = op === '+' ? num(left) + num(right) : num(left) - num(right);
      }
      return left;
    }
    mul() {
      let left = this.unary();
      while (this.peek('*') || this.peek('/')) {
        const op = this.tokens[this.i++].value;
        const right = this.unary();
        if (op === '/' && num(right) === 0) throw new Error(DIV0);
        left = op === '*' ? num(left) * num(right) : num(left) / num(right);
      }
      return left;
    }
    unary() {
      if (this.take('-')) return -num(this.unary());
      return this.primary();
    }
    primary() {
      const t = this.tokens[this.i++];
      if (!t) throw new Error(ERR);
      if (t.type === 'number' || t.type === 'string') return t.value;
      if (t.type === 'error') throw new Error(t.value);
      if (t.value === '(') { const v = this.compare(); this.expect(')'); return v; }
      if (t.type === 'ident') {
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        this.expect('(');
        if (t.value === 'IF') return this.ifFunction();
        const args = [];
        if (!this.peek(')')) {
          do { args.push(this.compare()); } while (this.take(','));
        }
        this.expect(')');
        return callFunction(t.value, args);
      }
      if (t.type === 'ref') {
        if (this.take(':')) {
          const end = this.tokens[this.i++];
          if (!end || end.type !== 'ref') throw new Error(ERR);
          return this.workbook.rangeValues(t.value, end.value, this.stack);
        }
        return this.workbook.valueAt(t.value, this.stack);
      }
      throw new Error(ERR);
    }
    ifFunction() {
      const condition = this.compare();
      this.expect(',');
      const thenTokens = this.collectBranch(',');
      this.expect(',');
      const elseTokens = this.collectBranch(')');
      this.expect(')');
      return new Parser(truthy(condition) ? thenTokens : elseTokens, this.workbook, this.stack).parse();
    }
    collectBranch(stop) {
      const start = this.i;
      let depth = 0;
      while (this.i < this.tokens.length) {
        const t = this.tokens[this.i];
        if (depth === 0 && t.value === stop) return this.tokens.slice(start, this.i);
        if (t.value === '(') depth++;
        if (t.value === ')') depth--;
        if (depth < 0) throw new Error(ERR);
        this.i++;
      }
      throw new Error(ERR);
    }
  }

  function flatten(args) { return args.flat(Infinity); }
  function scalar(v) { return Array.isArray(v) ? scalar(v[0] ?? 0) : v; }
  function num(v) {
    v = scalar(v);
    if (v === '' || v === null || v === undefined || v === false) return 0;
    if (v === true) return 1;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  function truthy(v) { return !!num(v) || v === true || (typeof v === 'string' && v.length > 0); }
  function callFunction(name, args) {
    const vals = flatten(args);
    if (name === 'SUM') return vals.reduce((a, b) => a + num(b), 0);
    if (name === 'AVERAGE') return vals.length ? vals.reduce((a, b) => a + num(b), 0) / vals.length : 0;
    if (name === 'MIN') return Math.min(...vals.map(num));
    if (name === 'MAX') return Math.max(...vals.map(num));
    if (name === 'COUNT') return vals.filter((v) => !Number.isNaN(Number(v)) && v !== '').length;
    if (name === 'AND') return vals.every(truthy);
    if (name === 'OR') return vals.some(truthy);
    if (name === 'NOT') return !truthy(args[0]);
    if (name === 'ABS') return Math.abs(num(args[0]));
    if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : Math.trunc(num(args[1]))));
    if (name === 'CONCAT') return vals.map((v) => String(scalar(v))).join('');
    throw new Error(ERR);
  }

  function display(v) {
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v * 100000000) / 100000000);
    return String(v ?? '');
  }

  class Workbook {
    constructor(options = {}) {
      this.rows = options.rows || 100;
      this.cols = options.cols || 26;
      this.cells = new Map();
      this.selection = { row: 0, col: 0 };
      this.undoStack = [];
      this.redoStack = [];
      this.clipboard = null;
    }
    static restore(data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const book = new Workbook({ rows: parsed.rows, cols: parsed.cols });
      book.cells = new Map(parsed.cells || []);
      book.selection = parsed.selection || { row: 0, col: 0 };
      return book;
    }
    serialize() { return JSON.stringify({ rows: this.rows, cols: this.cols, cells: [...this.cells], selection: this.selection }); }
    setSelection(addr) { const ref = parseRef(addr); this.selection = { row: ref.row, col: ref.col }; }
    getSelection() { return { ...this.selection }; }
    getCell(addr) { return this.cells.get(normalizeAddress(addr)) || ''; }
    setCell(addr, raw) { this.applyCells([[normalizeAddress(addr), String(raw)]], true); }
    clearRange(range) {
      const changes = [];
      const r = splitRange(range);
      for (let row = r.top; row <= r.bottom; row++) for (let col = r.left; col <= r.right; col++) changes.push([`${indexToCol(col)}${row + 1}`, '']);
      this.applyCells(changes, true);
    }
    applyCells(changes, record) {
      const before = changes.map(([addr]) => [addr, this.getCell(addr)]);
      for (const [addr, raw] of changes) raw ? this.cells.set(addr, raw) : this.cells.delete(addr);
      if (record) this.record({ before, after: changes });
    }
    record(action) {
      this.undoStack.push(action);
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }
    undo() { const a = this.undoStack.pop(); if (!a) return; this.applyCells(a.before, false); this.redoStack.push(a); }
    redo() { const a = this.redoStack.pop(); if (!a) return; this.applyCells(a.after, false); this.undoStack.push(a); }
    copyRange(range, cut = false) {
      const r = splitRange(range);
      const cells = [];
      for (let row = r.top; row <= r.bottom; row++) for (let col = r.left; col <= r.right; col++) cells.push({ row: row - r.top, col: col - r.left, raw: this.getCell(`${indexToCol(col)}${row + 1}`) });
      this.clipboard = { top: r.top, left: r.left, rows: r.bottom - r.top + 1, cols: r.right - r.left + 1, cells, cut };
    }
    pasteRange(addr) {
      if (!this.clipboard) return;
      const dest = parseRef(addr);
      const changes = [];
      for (const cell of this.clipboard.cells) {
        let raw = cell.raw;
        if (raw.startsWith('=')) raw = rewriteFormulaReferences(raw, dest.row - this.clipboard.top, dest.col - this.clipboard.left);
        changes.push([`${indexToCol(dest.col + cell.col)}${dest.row + cell.row + 1}`, raw]);
      }
      if (this.clipboard.cut) {
        for (const cell of this.clipboard.cells) changes.push([`${indexToCol(this.clipboard.left + cell.col)}${this.clipboard.top + cell.row + 1}`, '']);
      }
      this.applyCells(changes, true);
    }
    insertRows(index, count = 1) { this.structuralRows(index, count, false); }
    deleteRows(index, count = 1) { this.structuralRows(index, count, true); }
    insertCols(index, count = 1) { this.structuralCols(index, count, false); }
    deleteCols(index, count = 1) { this.structuralCols(index, count, true); }
    structuralRows(index, count, deleting) {
      const before = [...this.cells];
      const next = new Map();
      for (const [addr, raw] of this.cells) {
        const ref = parseRef(addr);
        if (deleting && ref.row >= index && ref.row < index + count) continue;
        const row = deleting ? (ref.row >= index + count ? ref.row - count : ref.row) : (ref.row >= index ? ref.row + count : ref.row);
        const rewritten = raw.startsWith('=') ? adjustForRows(raw, index, count, deleting) : raw;
        next.set(`${indexToCol(ref.col)}${row + 1}`, rewritten);
      }
      this.cells = next;
      this.record({ before, after: [...this.cells] });
    }
    structuralCols(index, count, deleting) {
      const before = [...this.cells];
      const next = new Map();
      for (const [addr, raw] of this.cells) {
        const ref = parseRef(addr);
        if (deleting && ref.col >= index && ref.col < index + count) continue;
        const col = deleting ? (ref.col >= index + count ? ref.col - count : ref.col) : (ref.col >= index ? ref.col + count : ref.col);
        const rewritten = raw.startsWith('=') ? adjustForCols(raw, index, count, deleting) : raw;
        next.set(`${indexToCol(col)}${ref.row + 1}`, rewritten);
      }
      this.cells = next;
      this.record({ before, after: [...this.cells] });
    }
    getDisplay(addr) {
      try { return display(this.valueAt(addr, [])); }
      catch (error) { return error.message || ERR; }
    }
    valueAt(addr, stack) {
      const key = normalizeAddress(addr);
      if (stack.includes(key)) throw new Error(CIRC);
      const raw = this.getCell(key);
      if (!raw) return 0;
      if (!raw.startsWith('=')) {
        const n = Number(raw);
        return raw.trim() !== '' && !Number.isNaN(n) ? n : raw;
      }
      if (raw.includes(REF)) throw new Error(REF);
      try { return new Parser(tokenize(raw.slice(1)), this, [...stack, key]).parse(); }
      catch (error) { throw new Error(error.message || ERR); }
    }
    rangeValues(start, end, stack) {
      const a = parseRef(start);
      const b = parseRef(end);
      const values = [];
      for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) {
        for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) values.push(this.valueAt(`${indexToCol(col)}${row + 1}`, stack));
      }
      return values;
    }
  }

  const api = { Workbook, rewriteFormulaReferences, colToIndex, indexToCol };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpreadsheetModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
