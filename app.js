(function () {
  'use strict';

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const ERROR = { ERR: '#ERR!', REF: '#REF!', DIV: '#DIV/0!', CIRC: '#CIRC!' };

  function storagePrefix(ns) {
    const injected = window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_STORAGE_NAMESPACE__ || window.__BENCH_STORAGE_NAMESPACE__ || window.__STORAGE_NAMESPACE__ || window.STORAGE_NAMESPACE || '';
    return (ns || injected || 'facebook-sheet') + ':';
  }

  function colToName(col) {
    let n = col + 1, out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }
  function nameToCol(name) {
    let n = 0;
    for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }
  function addr(row, col) { return colToName(col) + (row + 1); }
  function parseAddr(text) {
    const m = /^([A-Z]+)(\d+)$/.exec(text);
    if (!m) return null;
    return { row: Number(m[2]) - 1, col: nameToCol(m[1]) };
  }
  function normalizeRange(r) {
    return {
      row: Math.min(r.row, r.row2 == null ? r.row : r.row2),
      col: Math.min(r.col, r.col2 == null ? r.col : r.col2),
      row2: Math.max(r.row, r.row2 == null ? r.row : r.row2),
      col2: Math.max(r.col, r.col2 == null ? r.col : r.col2)
    };
  }
  function hasError(v) {
    if (v && v.error) return v;
    if (Array.isArray(v)) {
      for (const item of v.flat(Infinity)) if (item && item.error) return item;
    }
    return null;
  }
  function scalar(v) { return Array.isArray(v) ? v.flat(Infinity)[0] ?? 0 : v; }
  function asNumber(v) {
    v = scalar(v);
    if (v === true) return 1;
    if (v === false || v === '' || v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function asBool(v) {
    v = scalar(v);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return String(v || '').toUpperCase() === 'TRUE';
  }
  function displayValue(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    return value == null ? '' : String(value);
  }

  class FormulaParser {
    constructor(text, model, origin, stack) {
      this.text = text;
      this.model = model;
      this.origin = origin;
      this.stack = stack;
      this.i = 0;
    }
    parse() {
      const v = this.compare();
      this.ws();
      if (this.i < this.text.length) throw new Error('syntax');
      return v;
    }
    ws() { while (/\s/.test(this.text[this.i])) this.i++; }
    peek(s) { this.ws(); return this.text.slice(this.i, this.i + s.length).toUpperCase() === s; }
    take(s) { if (this.peek(s)) { this.i += s.length; return true; } return false; }
    compare() {
      let left = this.concat();
      for (const op of ['>=', '<=', '<>', '>', '<', '=']) {
        if (this.take(op)) {
          const right = this.concat();
          const err = hasError(left) || hasError(right);
          if (err) return err;
          if (op === '=') return scalar(left) == scalar(right);
          if (op === '<>') return scalar(left) != scalar(right);
          const a = asNumber(left), b = asNumber(right);
          if (op === '>=') return a >= b;
          if (op === '<=') return a <= b;
          if (op === '>') return a > b;
          return a < b;
        }
      }
      return left;
    }
    concat() {
      let left = this.add();
      while (this.take('&')) {
        const right = this.add();
        const err = hasError(left) || hasError(right);
        if (err) return err;
        left = displayValue(left) + displayValue(right);
      }
      return left;
    }
    add() {
      let left = this.mul();
      while (true) {
        if (this.take('+')) { const right = this.mul(); const err = hasError(left) || hasError(right); if (err) return err; left = asNumber(left) + asNumber(right); }
        else if (this.take('-')) { const right = this.mul(); const err = hasError(left) || hasError(right); if (err) return err; left = asNumber(left) - asNumber(right); }
        else return left;
      }
    }
    mul() {
      let left = this.unary();
      while (true) {
        if (this.take('*')) { const right = this.unary(); const err = hasError(left) || hasError(right); if (err) return err; left = asNumber(left) * asNumber(right); }
        else if (this.take('/')) {
          const right = this.unary();
          const err = hasError(left) || hasError(right);
          if (err) return err;
          const d = asNumber(right);
          if (d === 0) return { error: ERROR.DIV };
          left = asNumber(left) / d;
        } else return left;
      }
    }
    unary() {
      if (this.take('-')) { const v = this.unary(); const err = hasError(v); return err || -asNumber(v); }
      return this.primary();
    }
    primary() {
      this.ws();
      const ch = this.text[this.i];
      if (ch === '(') { this.i++; const v = this.compare(); if (!this.take(')')) throw new Error('paren'); return v; }
      if (ch === '"') return this.string();
      if (/\d|\./.test(ch)) return this.number();
      if (/[A-Z_$]/i.test(ch)) return this.identifier();
      throw new Error('primary');
    }
    string() {
      this.i++;
      let out = '';
      while (this.i < this.text.length && this.text[this.i] !== '"') out += this.text[this.i++];
      if (this.text[this.i] !== '"') throw new Error('string');
      this.i++;
      return out;
    }
    number() {
      const m = /^\d+(?:\.\d+)?|^\.\d+/.exec(this.text.slice(this.i));
      if (!m) throw new Error('number');
      this.i += m[0].length;
      return Number(m[0]);
    }
    identifier() {
      const m = /^(\$?)([A-Z]+)(\$?)(\d+)/i.exec(this.text.slice(this.i));
      if (m) {
        this.i += m[0].length;
        const first = { row: Number(m[4]) - 1, col: nameToCol(m[2].toUpperCase()) };
        if (this.take(':')) {
          const end = /^(\$?)([A-Z]+)(\$?)(\d+)/i.exec(this.text.slice(this.i));
          if (!end) throw new Error('range');
          this.i += end[0].length;
          return this.model.rangeValues(first, { row: Number(end[4]) - 1, col: nameToCol(end[2].toUpperCase()) }, this.stack);
        }
        return this.model.valueAt(first.row, first.col, this.stack);
      }
      const id = /^[A-Z_][A-Z0-9_]*/i.exec(this.text.slice(this.i));
      if (!id) throw new Error('id');
      const name = id[0].toUpperCase();
      this.i += id[0].length;
      if (name === 'TRUE') return true;
      if (name === 'FALSE') return false;
      if (!this.take('(')) throw new Error('call');
      const args = [];
      if (!this.peek(')')) {
        do { args.push(this.compare()); } while (this.take(','));
      }
      if (!this.take(')')) throw new Error('call-end');
      return this.call(name, args);
    }
    flatten(args) { return args.flat(Infinity).filter(v => !(v && v.error)); }
    call(name, args) {
      const vals = this.flatten(args);
      const nums = vals.map(asNumber);
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return vals.filter(v => v !== '' && Number.isFinite(Number(v))).length;
      if (name === 'IF') return asBool(args[0]) ? args[1] : args[2];
      if (name === 'AND') return vals.every(asBool);
      if (name === 'OR') return vals.some(asBool);
      if (name === 'NOT') return !asBool(args[0]);
      if (name === 'ABS') return Math.abs(asNumber(args[0]));
      if (name === 'ROUND') return Number(asNumber(args[0]).toFixed(args[1] == null ? 0 : asNumber(args[1])));
      if (name === 'CONCAT') return vals.map(displayValue).join('');
      throw new Error('fn');
    }
  }

  class SpreadsheetModel {
    constructor(rows = DEFAULT_ROWS, cols = DEFAULT_COLS, namespace) {
      this.rows = rows;
      this.cols = cols;
      this.prefix = storagePrefix(namespace);
      this.cells = new Map();
      this.selection = { row: 0, col: 0, row2: 0, col2: 0 };
      this.undoStack = [];
      this.redoStack = [];
      this.copySource = null;
      this.cutSource = null;
      this.load();
    }
    key(row, col) { return row + ',' + col; }
    inBounds(row, col) { return row >= 0 && col >= 0 && row < this.rows && col < this.cols; }
    getRaw(ref) { const p = typeof ref === 'string' ? parseAddr(ref) : ref; return p && this.cells.get(this.key(p.row, p.col)) || ''; }
    setCell(ref, raw, record = true) {
      const p = typeof ref === 'string' ? parseAddr(ref) : ref;
      if (!p || !this.inBounds(p.row, p.col)) return;
      const before = this.snapshot();
      this.write(p.row, p.col, raw);
      if (record) this.record(before);
      this.save();
    }
    write(row, col, raw) {
      const k = this.key(row, col);
      raw = raw == null ? '' : String(raw);
      if (raw === '') this.cells.delete(k); else this.cells.set(k, raw);
    }
    getDisplay(ref) { const p = typeof ref === 'string' ? parseAddr(ref) : ref; return displayValue(this.valueAt(p.row, p.col, [])); }
    valueAt(row, col, stack) {
      if (!this.inBounds(row, col)) return { error: ERROR.REF };
      const k = this.key(row, col);
      if (stack.includes(k)) return { error: ERROR.CIRC };
      const raw = this.cells.get(k) || '';
      if (raw === '') return '';
      if (raw[0] !== '=') {
        const n = Number(raw);
        return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
      }
      try {
        return new FormulaParser(raw.slice(1), this, { row, col }, stack.concat(k)).parse();
      } catch (e) {
        return { error: ERROR.ERR };
      }
    }
    rangeValues(a, b, stack) {
      const out = [];
      const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
      const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
      for (let r = r1; r <= r2; r++) {
        const row = [];
        for (let c = c1; c <= c2; c++) row.push(this.valueAt(r, c, stack));
        out.push(row);
      }
      return out;
    }
    snapshot() { return { cells: Array.from(this.cells.entries()), selection: { ...this.selection }, rows: this.rows, cols: this.cols }; }
    restore(s) { this.cells = new Map(s.cells); this.selection = { ...s.selection }; this.rows = s.rows; this.cols = s.cols; this.save(); }
    record(before) { this.undoStack.push(before); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack = []; }
    undo() { const s = this.undoStack.pop(); if (!s) return false; this.redoStack.push(this.snapshot()); this.restore(s); return true; }
    redo() { const s = this.redoStack.pop(); if (!s) return false; this.undoStack.push(this.snapshot()); this.restore(s); return true; }
    clearRange(range) {
      const before = this.snapshot(), r = normalizeRange(range);
      for (let row = r.row; row <= r.row2; row++) for (let col = r.col; col <= r.col2; col++) this.write(row, col, '');
      this.record(before); this.save();
    }
    copyPaste(source, dest, cut = false) {
      const before = this.snapshot(), s = normalizeRange(source);
      const block = [];
      for (let r = s.row; r <= s.row2; r++) {
        const row = [];
        for (let c = s.col; c <= s.col2; c++) row.push(this.shiftFormula(this.getRaw({ row: r, col: c }), dest.row + r - s.row - r, dest.col + c - s.col - c));
        block.push(row);
      }
      for (let r = 0; r < block.length; r++) for (let c = 0; c < block[r].length; c++) if (this.inBounds(dest.row + r, dest.col + c)) this.write(dest.row + r, dest.col + c, block[r][c]);
      if (cut) for (let r = s.row; r <= s.row2; r++) for (let c = s.col; c <= s.col2; c++) this.write(r, c, '');
      this.record(before); this.save();
    }
    shiftFormula(raw, dRow, dCol) {
      if (!raw || raw[0] !== '=') return raw;
      return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (all, absC, letters, absR, rowText) => {
        const col = nameToCol(letters);
        const row = Number(rowText) - 1;
        const nextCol = absC ? col : col + dCol;
        const nextRow = absR ? row : row + dRow;
        if (nextCol < 0 || nextRow < 0) return '#REF!';
        return absC + colToName(nextCol) + absR + (nextRow + 1);
      });
    }
    serializeRange(range) {
      const r = normalizeRange(range), lines = [];
      for (let row = r.row; row <= r.row2; row++) {
        const parts = [];
        for (let col = r.col; col <= r.col2; col++) parts.push(this.getRaw({ row, col }));
        lines.push(parts.join('\t'));
      }
      return lines.join('\n');
    }
    pasteText(text, dest) {
      const before = this.snapshot();
      const rows = text.replace(/\r/g, '').split('\n').map(line => line.split('\t'));
      rows.forEach((line, r) => line.forEach((raw, c) => { if (this.inBounds(dest.row + r, dest.col + c)) this.write(dest.row + r, dest.col + c, raw); }));
      this.record(before); this.save();
    }
    insertRow(index) { const before = this.snapshot(), next = new Map(); this.cells.forEach((v, k) => { const [r, c] = k.split(',').map(Number); next.set(this.key(r >= index ? r + 1 : r, c), this.adjustForRow(v, index, 1)); }); this.rows++; this.cells = next; this.record(before); this.save(); }
    deleteRow(index) { const before = this.snapshot(), next = new Map(); this.cells.forEach((v, k) => { const [r, c] = k.split(',').map(Number); if (r !== index) next.set(this.key(r > index ? r - 1 : r, c), this.adjustForRow(v, index, -1)); }); this.rows = Math.max(1, this.rows - 1); this.cells = next; this.record(before); this.save(); }
    insertCol(index) { const before = this.snapshot(), next = new Map(); this.cells.forEach((v, k) => { const [r, c] = k.split(',').map(Number); next.set(this.key(r, c >= index ? c + 1 : c), this.adjustForCol(v, index, 1)); }); this.cols++; this.cells = next; this.record(before); this.save(); }
    deleteCol(index) { const before = this.snapshot(), next = new Map(); this.cells.forEach((v, k) => { const [r, c] = k.split(',').map(Number); if (c !== index) next.set(this.key(r, c > index ? c - 1 : c), this.adjustForCol(v, index, -1)); }); this.cols = Math.max(1, this.cols - 1); this.cells = next; this.record(before); this.save(); }
    adjustForRow(raw, index, delta) { return this.adjustRefs(raw, (row, col, absR, absC) => delta > 0 ? { row: row >= index ? row + 1 : row, col } : row === index ? null : { row: row > index ? row - 1 : row, col }); }
    adjustForCol(raw, index, delta) { return this.adjustRefs(raw, (row, col) => delta > 0 ? { row, col: col >= index ? col + 1 : col } : col === index ? null : { row, col: col > index ? col - 1 : col }); }
    adjustRefs(raw, fn) {
      if (!raw || raw[0] !== '=') return raw;
      return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (all, absC, letters, absR, rowText) => {
        const next = fn(Number(rowText) - 1, nameToCol(letters), absR, absC);
        if (!next) return '#REF!';
        return absC + colToName(next.col) + absR + (next.row + 1);
      });
    }
    save() { try { localStorage.setItem(this.prefix + 'state', JSON.stringify(this.snapshot())); } catch (_) {} }
    load() { try { const s = JSON.parse(localStorage.getItem(this.prefix + 'state') || 'null'); if (s) { this.cells = new Map(s.cells || []); this.selection = s.selection || this.selection; this.rows = s.rows || this.rows; this.cols = s.cols || this.cols; } } catch (_) {} }
  }

  class SpreadsheetUI {
    constructor() {
      this.model = new SpreadsheetModel(DEFAULT_ROWS, DEFAULT_COLS);
      this.table = document.getElementById('sheet');
      this.wrap = document.getElementById('sheet-wrap');
      this.formula = document.getElementById('formula-bar');
      this.name = document.getElementById('cell-name');
      this.menu = document.getElementById('context-menu');
      this.editing = null;
      this.dragging = false;
      this.render();
      this.bind();
      this.refresh();
    }
    render() {
      this.table.innerHTML = '';
      const head = document.createElement('tr');
      head.innerHTML = '<th class="corner"></th>';
      for (let c = 0; c < this.model.cols; c++) head.appendChild(this.th(colToName(c), 'col-head', -1, c));
      this.table.appendChild(head);
      for (let r = 0; r < this.model.rows; r++) {
        const tr = document.createElement('tr');
        tr.appendChild(this.th(String(r + 1), 'row-head', r, -1));
        for (let c = 0; c < this.model.cols; c++) {
          const td = document.createElement('td');
          td.dataset.row = r; td.dataset.col = c;
          tr.appendChild(td);
        }
        this.table.appendChild(tr);
      }
    }
    th(text, cls, row, col) { const th = document.createElement('th'); th.className = cls; th.textContent = text; th.dataset.row = row; th.dataset.col = col; th.title = 'Right-click for insert/delete'; return th; }
    bind() {
      this.table.addEventListener('mousedown', e => {
        const cell = e.target.closest('td');
        if (!cell) return;
        const row = Number(cell.dataset.row), col = Number(cell.dataset.col);
        if (e.shiftKey) this.extend(row, col); else this.select(row, col);
        this.dragging = true; e.preventDefault();
      });
      this.table.addEventListener('mouseover', e => { if (!this.dragging) return; const cell = e.target.closest('td'); if (cell) this.extend(Number(cell.dataset.row), Number(cell.dataset.col)); });
      document.addEventListener('mouseup', () => this.dragging = false);
      this.table.addEventListener('dblclick', e => { const cell = e.target.closest('td'); if (cell) this.startEdit(true); });
      document.addEventListener('keydown', e => this.keydown(e));
      this.formula.addEventListener('focus', () => this.formula.select());
      this.formula.addEventListener('keydown', e => { if (e.key === 'Enter') { this.model.setCell(this.model.selection, this.formula.value); this.move(1, 0); this.refresh(); e.preventDefault(); } else if (e.key === 'Escape') { this.refresh(); this.table.focus(); } });
      this.table.addEventListener('contextmenu', e => this.context(e));
      document.addEventListener('click', e => { if (!this.menu.contains(e.target)) this.menu.hidden = true; });
    }
    select(row, col) { this.model.selection = { row, col, row2: row, col2: col }; this.model.save(); this.refresh(); }
    extend(row, col) { this.model.selection.row2 = row; this.model.selection.col2 = col; this.model.save(); this.refresh(); }
    move(dr, dc, extend) {
      const s = this.model.selection;
      const row = Math.max(0, Math.min(this.model.rows - 1, s.row + dr));
      const col = Math.max(0, Math.min(this.model.cols - 1, s.col + dc));
      if (extend) this.extend(row, col); else this.select(row, col);
    }
    refresh() {
      const r = normalizeRange(this.model.selection);
      this.name.value = addr(this.model.selection.row, this.model.selection.col);
      this.formula.value = this.model.getRaw(this.model.selection);
      this.table.querySelectorAll('td').forEach(td => {
        const row = Number(td.dataset.row), col = Number(td.dataset.col);
        const text = this.model.getDisplay({ row, col });
        td.textContent = text;
        td.className = '';
        if (row >= r.row && row <= r.row2 && col >= r.col && col <= r.col2) td.classList.add('in-range');
        if (row === this.model.selection.row && col === this.model.selection.col) td.classList.add('active');
        if (/^-?\d+(\.\d+)?$/.test(text)) td.classList.add('number');
        if (text[0] === '#') td.classList.add('error');
      });
    }
    activeTd() { return this.table.querySelector(`td[data-row="${this.model.selection.row}"][data-col="${this.model.selection.col}"]`); }
    startEdit(preserve, initial) {
      if (this.editing) return;
      const td = this.activeTd();
      const raw = preserve ? this.model.getRaw(this.model.selection) : (initial || '');
      td.innerHTML = '';
      const input = document.createElement('input'); input.className = 'cell-editor'; input.value = raw; td.appendChild(input); this.editing = { input, original: this.model.getRaw(this.model.selection) };
      input.focus(); input.select();
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { this.commitEdit(); this.move(1, 0); e.preventDefault(); e.stopPropagation(); }
        else if (e.key === 'Tab') { this.commitEdit(); this.move(0, 1); e.preventDefault(); e.stopPropagation(); }
        else if (e.key === 'Escape') { this.cancelEdit(); e.preventDefault(); e.stopPropagation(); }
      });
      input.addEventListener('blur', () => this.commitEdit());
    }
    commitEdit() { if (!this.editing) return; const v = this.editing.input.value; this.editing = null; this.model.setCell(this.model.selection, v); this.refresh(); }
    cancelEdit() { if (!this.editing) return; this.editing = null; this.refresh(); }
    keydown(e) {
      if (document.activeElement === this.formula || this.editing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.shiftKey ? this.model.redo() : this.model.undo(); this.render(); this.refresh(); e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'y') { this.model.redo(); this.render(); this.refresh(); e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'c') { navigator.clipboard && navigator.clipboard.writeText(this.model.serializeRange(this.model.selection)); this.model.copySource = { ...this.model.selection }; this.model.cutSource = null; e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'x') { navigator.clipboard && navigator.clipboard.writeText(this.model.serializeRange(this.model.selection)); this.model.copySource = null; this.model.cutSource = { ...this.model.selection }; e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'v') { if (navigator.clipboard) navigator.clipboard.readText().then(t => { if (this.model.cutSource) { this.model.copyPaste(this.model.cutSource, this.model.selection, true); this.model.cutSource = null; } else if (this.model.copySource) this.model.copyPaste(this.model.copySource, this.model.selection, false); else this.model.pasteText(t, this.model.selection); this.refresh(); }); e.preventDefault(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { this.model.clearRange(this.model.selection); this.refresh(); e.preventDefault(); return; }
      if (e.key === 'Enter' || e.key === 'F2') { this.startEdit(true); e.preventDefault(); return; }
      if (e.key === 'Tab') { this.move(0, e.shiftKey ? -1 : 1); e.preventDefault(); return; }
      const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (arrows[e.key]) { this.move(arrows[e.key][0], arrows[e.key][1], e.shiftKey); e.preventDefault(); return; }
      if (e.key.length === 1 && !mod) { this.startEdit(false, e.key); e.preventDefault(); }
    }
    context(e) {
      const th = e.target.closest('th');
      if (!th || th.classList.contains('corner')) return;
      e.preventDefault(); this.menu.innerHTML = '';
      const row = Number(th.dataset.row), col = Number(th.dataset.col);
      const items = col >= 0 ? [
        ['Insert column left', () => this.model.insertCol(col)], ['Insert column right', () => this.model.insertCol(col + 1)], ['Delete column', () => this.model.deleteCol(col)]
      ] : [
        ['Insert row above', () => this.model.insertRow(row)], ['Insert row below', () => this.model.insertRow(row + 1)], ['Delete row', () => this.model.deleteRow(row)]
      ];
      items.forEach(([label, fn]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); this.render(); this.refresh(); this.menu.hidden = true; }; this.menu.appendChild(b); });
      this.menu.style.left = e.clientX + 'px'; this.menu.style.top = e.clientY + 'px'; this.menu.hidden = false;
    }
  }

  window.SpreadsheetModel = SpreadsheetModel;
  window.SpreadsheetUI = SpreadsheetUI;
  if (document.getElementById('sheet')) new SpreadsheetUI();
})();
