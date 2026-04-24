(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const ERROR = Object.freeze({ err: '#ERR!', div: '#DIV/0!', ref: '#REF!', circ: '#CIRC!' });

  function storagePrefix(namespace) {
    const injected = root.SPREADSHEET_STORAGE_NAMESPACE || root.__SPREADSHEET_STORAGE_NAMESPACE__ || root.__BENCHMARK_STORAGE_NAMESPACE__ || '';
    return String(namespace || injected || 'facebook-sheet') + ':';
  }
  function colName(col) {
    let n = col + 1;
    let out = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }
  function colIndex(name) {
    let n = 0;
    for (let i = 0; i < name.length; i++) n = n * 26 + name.charCodeAt(i) - 64;
    return n - 1;
  }
  function addr(row, col) { return colName(col) + (row + 1); }
  function key(row, col) { return row + ',' + col; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function isError(v) { return typeof v === 'string' && /^#/.test(v); }
  function asNumber(v) {
    if (isError(v)) return v;
    if (v === '' || v == null) return 0;
    if (v === true) return 1;
    if (v === false) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function asText(v) {
    if (isError(v)) return v;
    if (v == null) return '';
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    return String(v);
  }
  function canCompareAsNumber(v) {
    if (v === '' || v == null || typeof v === 'number' || typeof v === 'boolean') return true;
    return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));
  }
  function formatFormulaStatus(raw, shown, type) {
    if (!raw && !shown) return { label: 'Ready', text: 'Blank', state: 'blank' };
    if (type === 'error') return { label: 'Value', text: shown || 'Error', state: 'error' };
    if (raw && raw[0] === '=') return { label: 'Value', text: shown || 'Blank', state: 'formula' };
    return { label: 'Value', text: shown || 'Blank', state: type || 'text' };
  }
  function display(v) {
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (v == null) return '';
    if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v * 10000000000) / 10000000000);
    return String(v);
  }

  class FormulaParser {
    constructor(model, row, col, stack) {
      this.model = model;
      this.row = row;
      this.col = col;
      this.stack = stack;
      this.tokens = [];
      this.pos = 0;
    }
    parse(src) {
      this.tokens = this.tokenize(src);
      this.pos = 0;
      const value = this.comparison();
      if (this.peek()) return ERROR.err;
      return value;
    }
    tokenize(src) {
      const tokens = [];
      let i = 0;
      while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '"') {
          let j = i + 1, text = '';
          while (j < src.length && src[j] !== '"') text += src[j++];
          if (src[j] !== '"') return [{ type: 'bad' }];
          tokens.push({ type: 'str', value: text }); i = j + 1; continue;
        }
        const two = src.slice(i, i + 2);
        if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
        if ('+-*/&(),:=<>'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
        const num = src.slice(i).match(/^\d+(?:\.\d+)?/);
        if (num) { tokens.push({ type: 'num', value: Number(num[0]) }); i += num[0].length; continue; }
        const ident = src.slice(i).match(/^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/i);
        if (ident) { tokens.push({ type: 'id', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
        if (ch === '#') { tokens.push({ type: 'referr', value: ERROR.ref }); i += 5; continue; }
        return [{ type: 'bad' }];
      }
      return tokens;
    }
    peek(value) { const t = this.tokens[this.pos]; return value === undefined ? t : t && t.value === value; }
    take(value) { if (this.peek(value)) return this.tokens[this.pos++]; return null; }
    comparison() {
      let left = this.concat();
      const t = this.peek();
      if (t && t.type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(t.value)) {
        this.pos++;
        const right = this.concat();
        if (isError(left)) return left;
        if (isError(right)) return right;
        const numeric = canCompareAsNumber(left) && canCompareAsNumber(right);
        const l = numeric ? asNumber(left) : asText(left);
        const r = numeric ? asNumber(right) : asText(right);
        if (t.value === '=') return l === r;
        if (t.value === '<>') return l !== r;
        if (t.value === '<') return l < r;
        if (t.value === '<=') return l <= r;
        if (t.value === '>') return l > r;
        return l >= r;
      }
      return left;
    }
    concat() {
      let left = this.add();
      while (this.take('&')) {
        const right = this.add();
        if (isError(left)) return left;
        if (isError(right)) return right;
        left = asText(left) + asText(right);
      }
      return left;
    }
    add() {
      let left = this.mul();
      while (this.peek('+') || this.peek('-')) {
        const op = this.tokens[this.pos++].value;
        const right = this.mul();
        if (isError(left)) return left;
        if (isError(right)) return right;
        left = op === '+' ? asNumber(left) + asNumber(right) : asNumber(left) - asNumber(right);
      }
      return left;
    }
    mul() {
      let left = this.unary();
      while (this.peek('*') || this.peek('/')) {
        const op = this.tokens[this.pos++].value;
        const right = this.unary();
        if (isError(left)) return left;
        if (isError(right)) return right;
        const r = asNumber(right);
        if (op === '/' && r === 0) return ERROR.div;
        left = op === '*' ? asNumber(left) * r : asNumber(left) / r;
      }
      return left;
    }
    unary() {
      if (this.take('-')) {
        const v = this.unary();
        return isError(v) ? v : -asNumber(v);
      }
      return this.primary();
    }
    primary() {
      const t = this.tokens[this.pos++];
      if (!t || t.type === 'bad') return ERROR.err;
      if (t.type === 'num' || t.type === 'str') return t.value;
      if (t.type === 'referr') return ERROR.ref;
      if (t.type === 'id') {
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        if (this.peek('(')) return this.call(t.value);
        const first = this.parseRef(t.value);
        if (!first) return ERROR.err;
        if (this.take(':')) {
          const end = this.tokens[this.pos++];
          const second = end && this.parseRef(end.value);
          if (!second) return ERROR.ref;
          return this.range(first, second);
        }
        return this.model.evaluateCell(first.row, first.col, this.stack);
      }
      if (t.value === '(') {
        const v = this.comparison();
        if (!this.take(')')) return ERROR.err;
        return v;
      }
      return ERROR.err;
    }
    call(name) {
      this.take('(');
      if (name === 'IF') return this.lazyIf();
      const args = [];
      if (!this.peek(')')) {
        do { args.push(this.comparison()); } while (this.take(','));
      }
      if (!this.take(')')) return ERROR.err;
      const flat = args.flat(Infinity);
      if (flat.find(isError)) return flat.find(isError);
      const nums = flat.map(asNumber).filter(Number.isFinite);
      switch (name) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVERAGE': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'MIN': return nums.length ? Math.min.apply(null, nums) : 0;
        case 'MAX': return nums.length ? Math.max.apply(null, nums) : 0;
        case 'COUNT': return nums.length;
        case 'IF': return args.length >= 2 ? (args[0] ? args[1] : args[2] || '') : ERROR.err;
        case 'AND': return flat.every(Boolean);
        case 'OR': return flat.some(Boolean);
        case 'NOT': return !flat[0];
        case 'ABS': return Math.abs(asNumber(flat[0]));
        case 'ROUND': return Math.round(asNumber(flat[0]) * Math.pow(10, asNumber(flat[1] || 0))) / Math.pow(10, asNumber(flat[1] || 0));
        case 'CONCAT': return flat.map(asText).join('');
        default: return ERROR.err;
      }
    }
    lazyIf() {
      const condition = this.comparison();
      if (!this.take(',')) return ERROR.err;
      if (isError(condition)) return this.skipRestOfCall(condition);
      if (condition) {
        const value = this.comparison();
        if (this.take(',')) this.skipArgument();
        return this.take(')') ? value : ERROR.err;
      }
      this.skipArgument();
      if (!this.take(',')) return this.take(')') ? '' : ERROR.err;
      const value = this.comparison();
      return this.take(')') ? value : ERROR.err;
    }
    skipArgument() {
      let depth = 0;
      while (this.pos < this.tokens.length) {
        const t = this.tokens[this.pos];
        if (t.value === '(') depth++;
        else if (t.value === ')') {
          if (depth === 0) return;
          depth--;
        } else if (t.value === ',' && depth === 0) return;
        this.pos++;
      }
    }
    skipRestOfCall(value) {
      let depth = 0;
      while (this.pos < this.tokens.length) {
        const t = this.tokens[this.pos++];
        if (t.value === '(') depth++;
        else if (t.value === ')') {
          if (depth === 0) return value;
          depth--;
        }
      }
      return ERROR.err;
    }
    parseRef(text) {
      const m = String(text).match(/^\$?([A-Z]+)\$?(\d+)$/);
      if (!m) return null;
      const row = Number(m[2]) - 1, col = colIndex(m[1]);
      if (row < 0 || col < 0 || row >= this.model.rows || col >= this.model.cols) return null;
      return { row, col };
    }
    range(a, b) {
      const values = [];
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) values.push(this.model.evaluateCell(r, c, this.stack));
      }
      return values;
    }
  }

  class SpreadsheetModel {
    constructor(rows, cols, namespace) {
      this.rows = rows || DEFAULT_ROWS;
      this.cols = cols || DEFAULT_COLS;
      this.prefix = storagePrefix(namespace);
      this.cells = new Map();
      this.cache = new Map();
      this.load();
    }
    getCell(row, col) { return this.cells.get(key(row, col)) || ''; }
    setCell(row, col, raw) {
      const k = key(row, col);
      raw = String(raw || '');
      if (raw) this.cells.set(k, raw); else this.cells.delete(k);
      this.recalculate();
      this.save();
    }
    setMany(changes) {
      changes.forEach(change => {
        const k = key(change.row, change.col);
        const raw = String(change.raw || '');
        if (raw) this.cells.set(k, raw); else this.cells.delete(k);
      });
      this.recalculate();
      this.save();
    }
    evaluateCell(row, col, stack) {
      if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return ERROR.ref;
      const k = key(row, col);
      if (this.cache.has(k)) return this.cache.get(k);
      if (stack.has(k)) return ERROR.circ;
      stack.add(k);
      const raw = this.getCell(row, col);
      let value;
      if (!raw) value = '';
      else if (raw[0] === '=') value = new FormulaParser(this, row, col, stack).parse(raw.slice(1));
      else if (/^-?\d+(?:\.\d+)?$/.test(raw.trim())) value = Number(raw);
      else value = raw;
      stack.delete(k);
      this.cache.set(k, value);
      return value;
    }
    recalculate() {
      this.cache.clear();
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.evaluateCell(r, c, new Set());
    }
    getDisplay(row, col) { return display(this.evaluateCell(row, col, new Set())); }
    getType(row, col) {
      const v = this.evaluateCell(row, col, new Set());
      if (isError(v)) return 'error';
      if (typeof v === 'number') return 'number';
      if (typeof v === 'boolean') return 'bool';
      return 'text';
    }
    save(extra) {
      try {
        localStorage.setItem(this.prefix + 'cells', JSON.stringify(Array.from(this.cells.entries())));
        if (extra) localStorage.setItem(this.prefix + 'ui', JSON.stringify(extra));
      } catch (_) {}
    }
    load() {
      try {
        const raw = localStorage.getItem(this.prefix + 'cells');
        if (raw) this.cells = new Map(JSON.parse(raw));
      } catch (_) { this.cells = new Map(); }
      this.recalculate();
    }
    loadUi() {
      try { return JSON.parse(localStorage.getItem(this.prefix + 'ui') || '{}'); }
      catch (_) { return {}; }
    }
    snapshot() { return new Map(this.cells); }
    restore(snapshot) { this.cells = new Map(snapshot); this.recalculate(); this.save(); }
    insertRow(index) {
      const next = new Map();
      this.cells.forEach((raw, k) => {
        const [r, c] = k.split(',').map(Number);
        next.set(key(r >= index ? r + 1 : r, c), this.adjustStructure(raw, 'row', index, 1));
      });
      this.rows++;
      this.cells = next; this.recalculate(); this.save();
    }
    deleteRow(index) {
      const next = new Map();
      this.cells.forEach((raw, k) => {
        const [r, c] = k.split(',').map(Number);
        if (r !== index) next.set(key(r > index ? r - 1 : r, c), this.adjustStructure(raw, 'row', index, -1));
      });
      this.rows = Math.max(1, this.rows - 1);
      this.cells = next; this.recalculate(); this.save();
    }
    insertCol(index) {
      const next = new Map();
      this.cells.forEach((raw, k) => {
        const [r, c] = k.split(',').map(Number);
        next.set(key(r, c >= index ? c + 1 : c), this.adjustStructure(raw, 'col', index, 1));
      });
      this.cols++;
      this.cells = next; this.recalculate(); this.save();
    }
    deleteCol(index) {
      const next = new Map();
      this.cells.forEach((raw, k) => {
        const [r, c] = k.split(',').map(Number);
        if (c !== index) next.set(key(r, c > index ? c - 1 : c), this.adjustStructure(raw, 'col', index, -1));
      });
      this.cols = Math.max(1, this.cols - 1);
      this.cells = next; this.recalculate(); this.save();
    }
    adjustStructure(raw, axis, index, delta) {
      if (!raw || raw[0] !== '=') return raw;
      return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absC, letters, absR, rowText) => {
        let row = Number(rowText) - 1, col = colIndex(letters);
        if (axis === 'row') {
          if (delta > 0 && row >= index) row += 1;
          if (delta < 0 && row === index) return '#REF!';
          if (delta < 0 && row > index) row -= 1;
        }
        if (axis === 'col') {
          if (delta > 0 && col >= index) col += 1;
          if (delta < 0 && col === index) return '#REF!';
          if (delta < 0 && col > index) col -= 1;
        }
        return absC + colName(col) + absR + (row + 1);
      });
    }
    static adjustFormula(raw, rowOffset, colOffset) {
      if (!raw || raw[0] !== '=') return raw;
      return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absC, letters, absR, rowText) => {
        const col = colIndex(letters) + (absC ? 0 : colOffset);
        const row = Number(rowText) - 1 + (absR ? 0 : rowOffset);
        if (row < 0 || col < 0) return '#REF!';
        return absC + colName(col) + absR + (row + 1);
      });
    }
  }
  root.SpreadsheetModel = SpreadsheetModel;

  class SpreadsheetApp {
    constructor() {
      this.model = new SpreadsheetModel(DEFAULT_ROWS, DEFAULT_COLS);
      this.grid = document.getElementById('grid');
      if (!this.grid) return;
      this.viewport = document.getElementById('viewport');
      this.formula = document.getElementById('formula-bar');
      this.formulaStatus = document.getElementById('formula-status');
      this.nameBox = document.getElementById('name-box');
      const ui = this.model.loadUi();
      this.active = { row: ui.row || 0, col: ui.col || 0 };
      this.anchor = { ...this.active };
      this.selection = { r1: this.active.row, c1: this.active.col, r2: this.active.row, c2: this.active.col };
      this.undo = [];
      this.redo = [];
      this.clipboard = null;
      this.editing = null;
      this.dragging = false;
      this.renderShell();
      this.bind();
      this.refresh();
      this.select(this.active.row, this.active.col);
    }
    renderShell() {
      this.grid.innerHTML = '';
      this.grid.style.gridTemplateColumns = '52px repeat(' + this.model.cols + ', 110px)';
      const corner = document.createElement('div'); corner.className = 'corner'; this.grid.appendChild(corner);
      for (let c = 0; c < this.model.cols; c++) this.grid.appendChild(this.header('col-head', colName(c), c));
      for (let r = 0; r < this.model.rows; r++) {
        this.grid.appendChild(this.header('row-head', r + 1, r));
        for (let c = 0; c < this.model.cols; c++) this.grid.appendChild(this.cell(r, c));
      }
    }
    header(cls, text, index) { const d = document.createElement('div'); d.className = cls; d.textContent = text; d.dataset.index = index; return d; }
    cell(row, col) {
      const d = document.createElement('div');
      d.className = 'cell'; d.tabIndex = 0; d.dataset.row = row; d.dataset.col = col; d.setAttribute('role', 'gridcell');
      return d;
    }
    bind() {
      this.grid.addEventListener('mousedown', e => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const row = Number(cell.dataset.row), col = Number(cell.dataset.col);
        this.select(row, col, e.shiftKey); cell.focus({ preventScroll: true }); this.dragging = true; e.preventDefault();
      });
      this.grid.addEventListener('mouseover', e => {
        if (!this.dragging) return;
        const cell = e.target.closest('.cell');
        if (cell) this.extend(Number(cell.dataset.row), Number(cell.dataset.col));
      });
      document.addEventListener('mouseup', () => { this.dragging = false; });
      this.grid.addEventListener('dblclick', e => { const cell = e.target.closest('.cell'); if (cell) this.startEdit(false); });
      document.addEventListener('keydown', e => this.onKey(e));
      this.formula.addEventListener('focus', () => { this.formula.value = this.model.getCell(this.active.row, this.active.col); });
      this.formula.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); this.commitCell(this.formula.value, true); }
        if (e.key === 'Escape') { this.formula.value = this.model.getCell(this.active.row, this.active.col); this.grid.focus(); }
      });
      this.formula.addEventListener('change', () => this.commitCell(this.formula.value, false));
      document.getElementById('insert-row-above').onclick = () => this.structure(() => this.model.insertRow(this.active.row));
      document.getElementById('insert-row-below').onclick = () => this.structure(() => this.model.insertRow(this.active.row + 1));
      document.getElementById('delete-row').onclick = () => this.structure(() => { this.model.deleteRow(this.active.row); this.select(clamp(this.active.row, 0, this.model.rows - 1), this.active.col); this.renderShell(); });
      document.getElementById('insert-col-left').onclick = () => this.structure(() => this.model.insertCol(this.active.col));
      document.getElementById('insert-col-right').onclick = () => this.structure(() => this.model.insertCol(this.active.col + 1));
      document.getElementById('delete-col').onclick = () => this.structure(() => { this.model.deleteCol(this.active.col); this.select(this.active.row, clamp(this.active.col, 0, this.model.cols - 1)); this.renderShell(); });
    }
    onKey(e) {
      if (document.activeElement === this.formula) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redoAction() : this.undoAction(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redoAction(); return; }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(false); return; }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); this.copy(true); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }
      if (this.editing) return;
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); this.startEdit(false); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.clearSelection(); return; }
      const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (arrows[e.key]) { e.preventDefault(); const [dr, dc] = arrows[e.key]; this.move(dr, dc, e.shiftKey); return; }
      if (e.key === 'Tab') { e.preventDefault(); this.move(0, 1, false); return; }
      if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); this.startEdit(true, e.key); }
    }
    select(row, col, extend) {
      row = clamp(row, 0, this.model.rows - 1); col = clamp(col, 0, this.model.cols - 1);
      this.active = { row, col };
      if (!extend) this.anchor = { row, col };
      this.selection = { r1: Math.min(this.anchor.row, row), c1: Math.min(this.anchor.col, col), r2: Math.max(this.anchor.row, row), c2: Math.max(this.anchor.col, col) };
      this.model.save(this.active);
      this.refresh();
      this.scrollActiveIntoView();
    }
    extend(row, col) { this.select(row, col, true); }
    move(dr, dc, extend) { this.select(this.active.row + dr, this.active.col + dc, extend); }
    startEdit(replace, initial) {
      const el = this.getCellEl(this.active.row, this.active.col);
      if (!el) return;
      const old = this.model.getCell(this.active.row, this.active.col);
      el.classList.add('editing'); el.textContent = '';
      const input = document.createElement('input'); input.className = 'cell-input'; input.value = replace ? (initial || '') : old;
      el.appendChild(input); this.editing = { input, old };
      input.focus(); input.select();
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); this.commitCell(input.value, true); }
        if (e.key === 'Tab') { e.preventDefault(); this.commitCell(input.value, false); this.move(0, 1, false); }
        if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); }
      });
      input.addEventListener('blur', () => { if (this.editing && this.editing.input === input) this.commitCell(input.value, false); });
    }
    cancelEdit() { this.editing = null; this.refresh(); }
    commitCell(raw, moveDown) {
      const before = this.model.snapshot();
      this.model.setCell(this.active.row, this.active.col, raw);
      this.pushHistory(before);
      this.editing = null;
      if (moveDown) this.move(1, 0, false); else this.refresh();
    }
    clearSelection() {
      const before = this.model.snapshot(), changes = [];
      for (let r = this.selection.r1; r <= this.selection.r2; r++) for (let c = this.selection.c1; c <= this.selection.c2; c++) changes.push({ row: r, col: c, raw: '' });
      this.model.setMany(changes); this.pushHistory(before); this.refresh();
    }
    copy(cut) {
      const block = [];
      for (let r = this.selection.r1; r <= this.selection.r2; r++) {
        const row = [];
        for (let c = this.selection.c1; c <= this.selection.c2; c++) row.push(this.model.getCell(r, c));
        block.push(row);
      }
      this.clipboard = { block, cut, src: { ...this.selection } };
      const text = block.map(row => row.join('\t')).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    }
    async paste() {
      let block = this.clipboard && this.clipboard.block;
      if (!block && navigator.clipboard) {
        try { block = (await navigator.clipboard.readText()).split(/\r?\n/).map(line => line.split('\t')); } catch (_) {}
      }
      if (!block) return;
      const before = this.model.snapshot(), changes = [];
      for (let r = 0; r < block.length; r++) for (let c = 0; c < block[r].length; c++) {
        const destR = this.selection.r1 + r, destC = this.selection.c1 + c;
        if (destR < this.model.rows && destC < this.model.cols) {
          let raw = block[r][c];
          if (raw && raw[0] === '=' && this.clipboard) raw = SpreadsheetModel.adjustFormula(raw, destR - this.clipboard.src.r1 - r, destC - this.clipboard.src.c1 - c);
          changes.push({ row: destR, col: destC, raw });
        }
      }
      if (this.clipboard && this.clipboard.cut) {
        for (let r = this.clipboard.src.r1; r <= this.clipboard.src.r2; r++) for (let c = this.clipboard.src.c1; c <= this.clipboard.src.c2; c++) changes.push({ row: r, col: c, raw: '' });
        this.clipboard = null;
      }
      this.model.setMany(changes); this.pushHistory(before); this.refresh();
    }
    structure(fn) { const before = this.model.snapshot(); fn(); this.renderShell(); this.pushHistory(before); this.refresh(); }
    pushHistory(before) { this.undo.push(before); if (this.undo.length > 50) this.undo.shift(); this.redo = []; }
    undoAction() { if (!this.undo.length) return; const current = this.model.snapshot(); this.redo.push(current); this.model.restore(this.undo.pop()); this.refresh(); }
    redoAction() { if (!this.redo.length) return; const current = this.model.snapshot(); this.undo.push(current); this.model.restore(this.redo.pop()); this.refresh(); }
    refresh() {
      if (!this.grid) return;
      this.nameBox.textContent = addr(this.active.row, this.active.col);
      this.formula.value = this.model.getCell(this.active.row, this.active.col);
      const raw = this.model.getCell(this.active.row, this.active.col);
      const shown = this.model.getDisplay(this.active.row, this.active.col);
      const type = this.model.getType(this.active.row, this.active.col);
      const status = formatFormulaStatus(raw, shown, type);
      if (this.formulaStatus) {
        this.formulaStatus.className = 'formula-status ' + status.state;
        this.formulaStatus.querySelector('.formula-status-label').textContent = status.label;
        this.formulaStatus.querySelector('.formula-status-value').textContent = status.text;
      }
      this.grid.querySelectorAll('.cell').forEach(el => {
        const r = Number(el.dataset.row), c = Number(el.dataset.col);
        const inRange = r >= this.selection.r1 && r <= this.selection.r2 && c >= this.selection.c1 && c <= this.selection.c2;
        el.className = 'cell ' + this.model.getType(r, c) + (inRange ? ' in-range' : '') + (r === this.active.row && c === this.active.col ? ' active' : '');
        el.textContent = this.model.getDisplay(r, c);
      });
      this.grid.querySelectorAll('.col-head').forEach(el => el.classList.toggle('active', Number(el.dataset.index) === this.active.col));
      this.grid.querySelectorAll('.row-head').forEach(el => el.classList.toggle('active', Number(el.dataset.index) === this.active.row));
    }
    scrollActiveIntoView() {
      const el = this.getCellEl(this.active.row, this.active.col);
      if (!el || !this.viewport) return;
      const cellWidth = el.offsetWidth || 110;
      const cellHeight = el.offsetHeight || 26;
      const rowHeaderWidth = 52;
      const headerHeight = 26;
      const left = rowHeaderWidth + this.active.col * cellWidth;
      const right = left + cellWidth;
      const top = headerHeight + this.active.row * cellHeight;
      const bottom = top + cellHeight;
      if (left < this.viewport.scrollLeft) this.viewport.scrollLeft = left;
      else if (right > this.viewport.scrollLeft + this.viewport.clientWidth) this.viewport.scrollLeft = right - this.viewport.clientWidth;
      if (top < this.viewport.scrollTop) this.viewport.scrollTop = top;
      else if (bottom > this.viewport.scrollTop + this.viewport.clientHeight) this.viewport.scrollTop = bottom - this.viewport.clientHeight;
    }
    getCellEl(row, col) { return this.grid.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]'); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new SpreadsheetApp());
  else new SpreadsheetApp();
})();
