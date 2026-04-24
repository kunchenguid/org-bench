(function () {
  'use strict';

  const COLS = 26;
  const ROWS = 100;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const storagePrefix = (window.SPREADSHEET_STORAGE_NAMESPACE || window.__STORAGE_NAMESPACE__ || 'amazon-sheet') + ':';

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function colToName(index) { return letters[index] || ''; }
  function nameToCol(name) { return letters.indexOf(name.toUpperCase()); }
  function addr(row, col) { return colToName(col) + (row + 1); }
  function parseAddr(address) {
    const match = /^([A-Z])(\d{1,3})$/i.exec(address);
    if (!match) return null;
    const col = nameToCol(match[1]);
    const row = Number(match[2]) - 1;
    if (col < 0 || row < 0) return null;
    return { row, col };
  }
  function rectFrom(a, b) {
    return { top: Math.min(a.row, b.row), left: Math.min(a.col, b.col), bottom: Math.max(a.row, b.row), right: Math.max(a.col, b.col) };
  }

  function parseTokenRef(text) {
    const match = /^(\$?)([A-Z])(\$?)(\d+)$/i.exec(text);
    if (!match) return null;
    return { colAbs: !!match[1], col: nameToCol(match[2]), rowAbs: !!match[3], row: Number(match[4]) - 1 };
  }
  function formatTokenRef(ref) {
    if (ref.row < 0 || ref.row >= ROWS || ref.col < 0 || ref.col >= COLS) return '#REF!';
    return (ref.colAbs ? '$' : '') + colToName(ref.col) + (ref.rowAbs ? '$' : '') + (ref.row + 1);
  }
  function shiftRefToken(token, dRow, dCol) {
    const ref = parseTokenRef(token);
    if (!ref) return token;
    if (!ref.rowAbs) ref.row += dRow;
    if (!ref.colAbs) ref.col += dCol;
    return formatTokenRef(ref);
  }
  function shiftFormulaForPaste(raw, from, to) {
    if (!raw.startsWith('=')) return raw;
    const dRow = to.row - from.row;
    const dCol = to.col - from.col;
    return raw.replace(/\$?[A-Z]\$?\d+/gi, function (token) { return shiftRefToken(token, dRow, dCol); });
  }

  function retargetFormula(raw, type, at, delta) {
    if (!raw.startsWith('=')) return raw;
    return raw.replace(/\$?[A-Z]\$?\d+/gi, function (token) {
      const ref = parseTokenRef(token);
      if (!ref) return token;
      if (type === 'row') {
        if (delta > 0 && ref.row >= at) ref.row += delta;
        if (delta < 0 && ref.row === at) return '#REF!';
        if (delta < 0 && ref.row > at) ref.row += delta;
      } else {
        if (delta > 0 && ref.col >= at) ref.col += delta;
        if (delta < 0 && ref.col === at) return '#REF!';
        if (delta < 0 && ref.col > at) ref.col += delta;
      }
      return formatTokenRef(ref);
    });
  }

  class FormulaParser {
    constructor(sheet, source, visiting) {
      this.sheet = sheet;
      this.source = source;
      this.visiting = visiting;
      this.tokens = source.match(/<>|<=|>=|[A-Z]+\d+|\$?[A-Z]\$?\d+|\d+(?:\.\d+)?|"(?:[^"]|"")*"|[A-Z_]+|[()+\-*\/:,&=<>]/gi) || [];
      this.index = 0;
    }
    peek() { return this.tokens[this.index]; }
    take(value) {
      if (value === undefined || String(this.peek()).toUpperCase() === value) return this.tokens[this.index++];
      return null;
    }
    parse() {
      const value = this.comparison();
      if (this.index < this.tokens.length) throw new Error('#ERR!');
      return value;
    }
    comparison() {
      let left = this.concat();
      while (/^(=|<>|<|<=|>|>=)$/.test(this.peek() || '')) {
        const op = this.take();
        const right = this.concat();
        if (op === '=') left = left == right;
        if (op === '<>') left = left != right;
        if (op === '<') left = Number(left) < Number(right);
        if (op === '<=') left = Number(left) <= Number(right);
        if (op === '>') left = Number(left) > Number(right);
        if (op === '>=') left = Number(left) >= Number(right);
      }
      return left;
    }
    concat() {
      let left = this.add();
      while (this.peek() === '&') {
        this.take('&');
        left = this.asText(left) + this.asText(this.add());
      }
      return left;
    }
    add() {
      let left = this.multiply();
      while (this.peek() === '+' || this.peek() === '-') {
        const op = this.take();
        const right = this.multiply();
        left = op === '+' ? this.asNumber(left) + this.asNumber(right) : this.asNumber(left) - this.asNumber(right);
      }
      return left;
    }
    multiply() {
      let left = this.unary();
      while (this.peek() === '*' || this.peek() === '/') {
        const op = this.take();
        const right = this.asNumber(this.unary());
        if (op === '/' && right === 0) throw new Error('#DIV/0!');
        left = op === '*' ? this.asNumber(left) * right : this.asNumber(left) / right;
      }
      return left;
    }
    unary() {
      if (this.peek() === '-') { this.take('-'); return -this.asNumber(this.unary()); }
      return this.primary();
    }
    primary() {
      const token = this.peek();
      if (!token) throw new Error('#ERR!');
      if (this.take('(')) { const value = this.comparison(); if (!this.take(')')) throw new Error('#ERR!'); return value; }
      if (/^"/.test(token)) return this.take().slice(1, -1).replace(/""/g, '"');
      if (/^\d/.test(token)) return Number(this.take());
      if (/^(TRUE|FALSE)$/i.test(token)) return this.take().toUpperCase() === 'TRUE';
      if (/^\$?[A-Z]\$?\d+$/i.test(token)) {
        const first = this.take();
        if (this.peek() === ':') {
          this.take(':');
          const second = this.take();
          return this.rangeValues(first, second);
        }
        return this.sheet.valueForRef(first, this.visiting);
      }
      if (/^[A-Z_]+$/i.test(token)) return this.functionCall(this.take().toUpperCase());
      throw new Error('#ERR!');
    }
    functionCall(name) {
      if (!this.take('(')) throw new Error('#ERR!');
      const args = [];
      if (this.peek() !== ')') {
        do { args.push(this.comparison()); } while (this.take(','));
      }
      if (!this.take(')')) throw new Error('#ERR!');
      const flat = args.flat(Infinity);
      const nums = flat.map((v) => this.asNumber(v)).filter((v) => !Number.isNaN(v));
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min.apply(null, nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max.apply(null, nums) : 0;
      if (name === 'COUNT') return nums.length;
      if (name === 'IF') return args[0] ? args[1] : args[2];
      if (name === 'AND') return flat.every(Boolean);
      if (name === 'OR') return flat.some(Boolean);
      if (name === 'NOT') return !args[0];
      if (name === 'ABS') return Math.abs(this.asNumber(args[0]));
      if (name === 'ROUND') return Number(this.asNumber(args[0]).toFixed(args[1] === undefined ? 0 : this.asNumber(args[1])));
      if (name === 'CONCAT') return flat.map((v) => this.asText(v)).join('');
      throw new Error('#NAME?');
    }
    rangeValues(a, b) {
      const start = parseTokenRef(a);
      const end = parseTokenRef(b);
      if (!start || !end) throw new Error('#REF!');
      const rect = rectFrom(start, end);
      const values = [];
      for (let row = rect.top; row <= rect.bottom; row++) {
        for (let col = rect.left; col <= rect.right; col++) values.push(this.sheet.valueAt(row, col, this.visiting));
      }
      return values;
    }
    asNumber(value) {
      if (value === '' || value === false || value === null || value === undefined) return 0;
      if (value === true) return 1;
      const number = Number(value);
      if (Number.isNaN(number)) throw new Error('#VALUE!');
      return number;
    }
    asText(value) { return value === true ? 'TRUE' : value === false ? 'FALSE' : String(value ?? ''); }
  }

  class SpreadsheetCore {
    constructor(cols, rows, namespace) {
      this.cols = cols || COLS;
      this.rows = rows || ROWS;
      this.namespace = namespace || 'default';
      this.cells = new Map();
      this.undoStack = [];
      this.redoStack = [];
      this.clipboard = null;
    }
    key(address) { const pos = typeof address === 'string' ? parseAddr(address) : address; return addr(pos.row, pos.col); }
    getRaw(address) { return this.cells.get(this.key(address)) || ''; }
    setCellRaw(address, raw, skipHistory) {
      const key = this.key(address);
      const before = this.getRaw(key);
      if (before === raw) return;
      if (!skipHistory) this.record([{ key, before, after: raw }]);
      raw ? this.cells.set(key, raw) : this.cells.delete(key);
    }
    record(changes) {
      this.undoStack.push(changes);
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }
    apply(changes, direction) {
      changes.forEach((change) => {
        const raw = direction === 'undo' ? change.before : change.after;
        raw ? this.cells.set(change.key, raw) : this.cells.delete(change.key);
      });
    }
    undo() { const changes = this.undoStack.pop(); if (changes) { this.apply(changes, 'undo'); this.redoStack.push(changes); } }
    redo() { const changes = this.redoStack.pop(); if (changes) { this.apply(changes, 'redo'); this.undoStack.push(changes); } }
    valueForRef(token, visiting) {
      const ref = parseTokenRef(token);
      if (!ref || ref.row >= this.rows || ref.col >= this.cols) throw new Error('#REF!');
      return this.valueAt(ref.row, ref.col, visiting);
    }
    valueAt(row, col, visiting) {
      const key = addr(row, col);
      if (visiting.has(key)) throw new Error('#CIRC!');
      const raw = this.getRaw(key);
      if (raw === '') return 0;
      if (!raw.startsWith('=')) {
        const number = Number(raw);
        return raw.trim() !== '' && !Number.isNaN(number) ? number : raw;
      }
      visiting.add(key);
      try { return new FormulaParser(this, raw.slice(1), visiting).parse(); }
      finally { visiting.delete(key); }
    }
    getDisplayValue(address) {
      try {
        const raw = this.getRaw(address);
        const value = raw.startsWith('=') ? this.valueAt(parseAddr(this.key(address)).row, parseAddr(this.key(address)).col, new Set()) : this.valueAt(parseAddr(this.key(address)).row, parseAddr(this.key(address)).col, new Set());
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
        return String(value);
      } catch (error) {
        return /^#/.test(error.message) ? error.message : '#ERR!';
      }
    }
    copyRange(startAddress, endAddress, cut) {
      const rect = rectFrom(parseAddr(startAddress), parseAddr(endAddress || startAddress));
      const data = [];
      for (let row = rect.top; row <= rect.bottom; row++) {
        const line = [];
        for (let col = rect.left; col <= rect.right; col++) line.push(this.getRaw(addr(row, col)));
        data.push(line);
      }
      this.clipboard = { rect, data, cut: !!cut };
      return data.map((line) => line.join('\t')).join('\n');
    }
    pasteRange(targetAddress, text) {
      const target = parseAddr(targetAddress);
      const clip = text ? { rect: target, data: text.split(/\r?\n/).map((line) => line.split('\t')), cut: false } : this.clipboard;
      if (!clip) return;
      const changes = [];
      clip.data.forEach((line, r) => line.forEach((raw, c) => {
        const row = target.row + r;
        const col = target.col + c;
        if (row >= this.rows || col >= this.cols) return;
        const key = addr(row, col);
        const source = { row: clip.rect.top + r, col: clip.rect.left + c };
        const next = text ? raw : shiftFormulaForPaste(raw, source, { row, col });
        changes.push({ key, before: this.getRaw(key), after: next });
      }));
      if (clip.cut) {
        clip.data.forEach((line, r) => line.forEach((_raw, c) => {
          const key = addr(clip.rect.top + r, clip.rect.left + c);
          changes.push({ key, before: this.getRaw(key), after: '' });
        }));
        this.clipboard.cut = false;
      }
      this.record(changes);
      this.apply(changes, 'redo');
    }
    clearRange(rect) {
      const changes = [];
      for (let row = rect.top; row <= rect.bottom; row++) for (let col = rect.left; col <= rect.right; col++) {
        const key = addr(row, col);
        changes.push({ key, before: this.getRaw(key), after: '' });
      }
      this.record(changes);
      this.apply(changes, 'redo');
    }
    shiftStructure(type, at, delta) {
      const next = new Map();
      const changes = [];
      this.cells.forEach((raw, key) => {
        const pos = parseAddr(key);
        let row = pos.row;
        let col = pos.col;
        if (type === 'row') { if (delta < 0 && row === at) return; if (row >= at) row += delta; }
        if (type === 'col') { if (delta < 0 && col === at) return; if (col >= at) col += delta; }
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) next.set(addr(row, col), retargetFormula(raw, type, at, delta));
      });
      this.cells.forEach((raw, key) => changes.push({ key, before: raw, after: '' }));
      next.forEach((raw, key) => changes.push({ key, before: '', after: raw }));
      this.record(changes);
      this.cells = next;
    }
    serialize(selection) { return JSON.stringify({ cells: Array.from(this.cells.entries()), selection }); }
    restore(payload) {
      if (!payload) return null;
      try {
        const parsed = JSON.parse(payload);
        this.cells = new Map(parsed.cells || []);
        return parsed.selection || null;
      } catch (_error) { return null; }
    }
  }

  window.SpreadsheetCore = SpreadsheetCore;

  function startUi() {
    const wrap = document.getElementById('gridWrap');
    if (!wrap) return;
    const formula = document.getElementById('formulaInput');
    const nameBox = document.getElementById('nameBox');
    const sheet = new SpreadsheetCore(COLS, ROWS, 'ui');
    const restoredSelection = sheet.restore(localStorage.getItem(storagePrefix + 'state'));
    let active = restoredSelection?.active || { row: 0, col: 0 };
    let anchor = restoredSelection?.anchor || active;
    let range = rectFrom(anchor, active);
    let editor = null;

    function save() { localStorage.setItem(storagePrefix + 'state', sheet.serialize({ active, anchor })); }
    function render() {
      for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
        const cell = wrap.querySelector('[data-row="' + row + '"][data-col="' + col + '"]');
        if (!cell || cell.contains(editor)) continue;
        const key = addr(row, col);
        const raw = sheet.getRaw(key);
        const display = raw === '' ? '' : sheet.getDisplayValue(key);
        cell.textContent = display;
        cell.className = '';
        if (row >= range.top && row <= range.bottom && col >= range.left && col <= range.right) cell.classList.add('in-range');
        if (row === active.row && col === active.col) cell.classList.add('active');
        if (/^#/.test(display)) cell.classList.add('error');
        if (raw !== '' && !raw.startsWith('=') && !Number.isNaN(Number(raw))) cell.classList.add('number');
      }
      nameBox.textContent = addr(active.row, active.col);
      formula.value = sheet.getRaw(active);
      save();
    }
    function select(row, col, extend) {
      active = { row: clamp(row, 0, ROWS - 1), col: clamp(col, 0, COLS - 1) };
      if (!extend) anchor = active;
      range = rectFrom(anchor, active);
      render();
    }
    function commit(value, move) {
      sheet.setCellRaw(active, value);
      editor = null;
      if (move) select(active.row + move.row, active.col + move.col, false); else render();
    }
    function edit(initial, replace) {
      if (editor) return;
      const cell = wrap.querySelector('[data-row="' + active.row + '"][data-col="' + active.col + '"]');
      cell.classList.add('editing');
      cell.textContent = '';
      editor = document.createElement('input');
      editor.className = 'cell-editor';
      editor.value = replace ? initial : sheet.getRaw(active);
      cell.appendChild(editor);
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
      editor.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); commit(editor.value, { row: 1, col: 0 }); }
        if (event.key === 'Tab') { event.preventDefault(); commit(editor.value, { row: 0, col: 1 }); }
        if (event.key === 'Escape') { event.preventDefault(); editor = null; render(); wrap.focus(); }
      });
      editor.addEventListener('blur', function () { if (editor) commit(editor.value); });
    }
    function buildGrid() {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th'));
      for (let col = 0; col < COLS; col++) { const th = document.createElement('th'); th.textContent = colToName(col); headRow.appendChild(th); }
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (let row = 0; row < ROWS; row++) {
        const tr = document.createElement('tr');
        const th = document.createElement('th'); th.textContent = row + 1; tr.appendChild(th);
        for (let col = 0; col < COLS; col++) {
          const td = document.createElement('td'); td.dataset.row = row; td.dataset.col = col;
          td.addEventListener('mousedown', function (event) { select(row, col, event.shiftKey); wrap.focus(); });
          td.addEventListener('mouseenter', function (event) { if (event.buttons === 1) select(row, col, true); });
          td.addEventListener('dblclick', function () { edit('', false); });
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
    }
    buildGrid();
    wrap.addEventListener('keydown', function (event) {
      if (editor) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? sheet.redo() : sheet.undo(); render(); return; }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); sheet.redo(); render(); return; }
      if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); navigator.clipboard?.writeText(sheet.copyRange(addr(range.top, range.left), addr(range.bottom, range.right))); return; }
      if (mod && event.key.toLowerCase() === 'x') { event.preventDefault(); navigator.clipboard?.writeText(sheet.copyRange(addr(range.top, range.left), addr(range.bottom, range.right), true)); render(); return; }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        if (sheet.clipboard) { sheet.pasteRange(addr(active.row, active.col)); render(); return; }
        navigator.clipboard?.readText().then((text) => { sheet.pasteRange(addr(active.row, active.col), text); render(); });
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); sheet.clearRange(range); render(); return; }
      if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); edit('', false); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); select(active.row - 1, active.col, event.shiftKey); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); select(active.row + 1, active.col, event.shiftKey); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); select(active.row, active.col - 1, event.shiftKey); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); select(active.row, active.col + 1, event.shiftKey); return; }
      if (event.key.length === 1 && !mod) { event.preventDefault(); edit(event.key, true); }
    });
    formula.addEventListener('input', function () { sheet.setCellRaw(active, formula.value); render(); formula.focus(); });
    formula.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); select(active.row + 1, active.col, false); wrap.focus(); } });
    document.getElementById('insertRow').onclick = function () { sheet.shiftStructure('row', active.row, 1); render(); };
    document.getElementById('deleteRow').onclick = function () { sheet.shiftStructure('row', active.row, -1); render(); };
    document.getElementById('insertCol').onclick = function () { sheet.shiftStructure('col', active.col, 1); render(); };
    document.getElementById('deleteCol').onclick = function () { sheet.shiftStructure('col', active.col, -1); render(); };
    select(active.row, active.col, false);
    wrap.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startUi); else startUi();
})();
