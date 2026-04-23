(function () {
  'use strict';

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const ERROR = { ERR: '#ERR!', DIV: '#DIV/0!', REF: '#REF!', CIRC: '#CIRC!' };
  const storageNamespace = String(window.SPREADSHEET_STORAGE_NAMESPACE || window.__SPREADSHEET_NAMESPACE__ || window.__STORAGE_NAMESPACE__ || 'local') + ':';
  const storageKey = storageNamespace + 'spreadsheet-state-v1';

  const state = {
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    cells: {},
    active: { row: 1, col: 1 },
    anchor: { row: 1, col: 1 },
    range: { r1: 1, c1: 1, r2: 1, c2: 1 },
    undo: [],
    redo: [],
    cutRange: null,
    internalClipboard: ''
  };

  let grid, formulaBar, nameBox, menu, editingCell, editOriginal = '';

  function colName(n) {
    let s = '';
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }
  function colIndex(name) {
    let n = 0;
    for (let i = 0; i < name.length; i++) n = n * 26 + name.charCodeAt(i) - 64;
    return n;
  }
  function addr(row, col) { return colName(col) + row; }
  function parseAddr(a) {
    const m = /^([A-Z]+)(\d+)$/.exec(a);
    return m ? { col: colIndex(m[1]), row: Number(m[2]) } : null;
  }
  function normalizeRange(a, b) {
    return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) };
  }
  function isError(v) { return typeof v === 'string' && /^#/.test(v); }
  function displayValue(v) {
    if (isError(v)) return v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
    if (v == null) return '';
    return String(v);
  }
  function num(v) {
    if (Array.isArray(v)) return num(v[0]);
    if (isError(v)) return v;
    if (v === '' || v == null) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function text(v) {
    if (Array.isArray(v)) return text(v[0]);
    if (isError(v)) return v;
    if (v == null) return '';
    return displayValue(v);
  }
  function truthy(v) {
    if (isError(v)) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return String(v || '').length > 0;
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let s = ''; i++;
        while (i < src.length && src[i] !== '"') s += src[i++];
        if (src[i] !== '"') throw ERROR.ERR;
        i++; tokens.push({ type: 'string', value: s }); continue;
      }
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '<>'].indexOf(two) >= 0) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&(),:<>= '.indexOf(ch) >= 0 && ch !== ' ') { tokens.push({ type: ch === '(' || ch === ')' || ch === ',' || ch === ':' ? ch : 'op', value: ch }); i++; continue; }
      const numMatch = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      if (numMatch) { tokens.push({ type: 'number', value: Number(numMatch[0]) }); i += numMatch[0].length; continue; }
      const idMatch = /^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/.exec(src.slice(i).toUpperCase());
      if (idMatch) { tokens.push({ type: 'id', value: idMatch[0] }); i += idMatch[0].length; continue; }
      throw ERROR.ERR;
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function evaluateCell(cells, address, stack) {
    stack = stack || [];
    if (stack.indexOf(address) >= 0) return { value: ERROR.CIRC, display: ERROR.CIRC };
    const raw = cells[address] || '';
    let value;
    if (raw.charAt(0) === '=') value = evaluateFormula(cells, raw.slice(1), stack.concat(address));
    else if (raw.trim() === '') value = '';
    else if (Number.isFinite(Number(raw))) value = Number(raw);
    else value = raw;
    return { value: value, display: displayValue(value) };
  }

  function evaluateFormula(cells, src, stack) {
    let tokens, pos = 0;
    try { tokens = tokenize(src); } catch (e) { return e || ERROR.ERR; }
    function peek() { return tokens[pos]; }
    function take(type, value) {
      const t = peek();
      if (t.type === type && (value == null || t.value === value)) { pos++; return t; }
      return null;
    }
    function expect(type, value) { const t = take(type, value); if (!t) throw ERROR.ERR; return t; }
    function refValue(ref) {
      const clean = ref.replace(/\$/g, '');
      const p = parseAddr(clean);
      if (!p || p.row < 1 || p.col < 1) return ERROR.REF;
      return evaluateCell(cells, clean, stack).value;
    }
    function rangeValues(a, b) {
      const pa = parseAddr(a.replace(/\$/g, ''));
      const pb = parseAddr(b.replace(/\$/g, ''));
      if (!pa || !pb) return ERROR.REF;
      const r = normalizeRange(pa, pb), values = [];
      for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) values.push(refValue(addr(row, col)));
      return values;
    }
    function flatten(args) { return args.reduce(function (a, v) { return a.concat(Array.isArray(v) ? flatten(v) : [v]); }, []); }
    function call(name, args) {
      args = flatten(args);
      const bad = args.find(isError); if (bad) return bad;
      if (name === 'SUM') return args.reduce(function (s, v) { return s + num(v); }, 0);
      if (name === 'AVERAGE') return args.length ? call('SUM', args) / args.length : 0;
      if (name === 'MIN') return Math.min.apply(null, args.map(num));
      if (name === 'MAX') return Math.max.apply(null, args.map(num));
      if (name === 'COUNT') return args.filter(function (v) { return Number.isFinite(Number(v)); }).length;
      if (name === 'AND') return args.every(function (v) { return truthy(v) === true; });
      if (name === 'OR') return args.some(function (v) { return truthy(v) === true; });
      if (name === 'NOT') return !truthy(args[0]);
      if (name === 'ABS') return Math.abs(num(args[0]));
      if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
      if (name === 'CONCAT') return args.map(text).join('');
      return ERROR.ERR;
    }
    function primary() {
      if (take('(')) { const v = comparison(); expect(')'); return v; }
      const n = take('number'); if (n) return n.value;
      const s = take('string'); if (s) return s.value;
      const id = take('id');
      if (!id) throw ERROR.ERR;
      const name = id.value;
      if (take('(')) {
        const args = [];
        if (!take(')')) {
          do { args.push(comparison()); } while (take(','));
          expect(')');
        }
        if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
        return call(name, args);
      }
      if (name === 'TRUE') return true;
      if (name === 'FALSE') return false;
      if (/^\$?[A-Z]+\$?\d+$/.test(name)) {
        if (take(':')) { const other = expect('id').value; return rangeValues(name, other); }
        return refValue(name);
      }
      return ERROR.ERR;
    }
    function unary() { if (take('op', '-')) return -num(unary()); return primary(); }
    function mult() {
      let v = unary();
      while (peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const op = tokens[pos++].value, r = unary();
        if (isError(v) || isError(r)) return isError(v) ? v : r;
        if (op === '/' && num(r) === 0) v = ERROR.DIV; else v = op === '*' ? num(v) * num(r) : num(v) / num(r);
      }
      return v;
    }
    function add() {
      let v = mult();
      while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = tokens[pos++].value, r = mult();
        if (isError(v) || isError(r)) return isError(v) ? v : r;
        v = op === '+' ? num(v) + num(r) : num(v) - num(r);
      }
      return v;
    }
    function concat() {
      let v = add();
      while (take('op', '&')) {
        const r = add();
        if (isError(v) || isError(r)) return isError(v) ? v : r;
        v = text(v) + text(r);
      }
      return v;
    }
    function comparison() {
      let v = concat();
      while (peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(peek().value) >= 0) {
        const op = tokens[pos++].value, r = concat();
        if (isError(v) || isError(r)) return isError(v) ? v : r;
        const a = typeof v === 'number' && typeof r === 'number' ? v : text(v);
        const b = typeof v === 'number' && typeof r === 'number' ? r : text(r);
        v = op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
      }
      return v;
    }
    try {
      const result = comparison();
      if (peek().type !== 'eof') return ERROR.ERR;
      return result;
    } catch (e) { return e || ERROR.ERR; }
  }

  function transformFormula(formula, cb) {
    let out = '', i = 0;
    while (i < formula.length) {
      if (formula[i] === '"') {
        let j = i + 1;
        while (j < formula.length && formula[j] !== '"') j++;
        out += formula.slice(i, Math.min(j + 1, formula.length)); i = Math.min(j + 1, formula.length); continue;
      }
      const m = /^\$?([A-Z]+)\$?(\d+)/.exec(formula.slice(i));
      if (m) { out += cb(m[0]); i += m[0].length; continue; }
      out += formula[i++];
    }
    return out;
  }
  function parseRef(ref) {
    const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
    return { absCol: !!m[1], col: colIndex(m[2]), absRow: !!m[3], row: Number(m[4]) };
  }
  function formatRef(p) { return (p.absCol ? '$' : '') + colName(p.col) + (p.absRow ? '$' : '') + p.row; }
  function adjustFormula(formula, from, to) {
    const a = parseAddr(from), b = parseAddr(to), dr = b.row - a.row, dc = b.col - a.col;
    return transformFormula(formula, function (ref) {
      const p = parseRef(ref);
      if (!p.absCol) p.col += dc;
      if (!p.absRow) p.row += dr;
      return p.col < 1 || p.row < 1 ? ERROR.REF : formatRef(p);
    });
  }
  function shiftFormulaForInsert(formula, axis, index, count) {
    return transformFormula(formula, function (ref) {
      const p = parseRef(ref);
      if (axis === 'row' && p.row >= index) p.row += count;
      if (axis === 'col' && p.col >= index) p.col += count;
      return formatRef(p);
    });
  }
  function shiftFormulaForDelete(formula, axis, index, count) {
    return transformFormula(formula, function (ref) {
      const p = parseRef(ref), end = index + count - 1;
      if (axis === 'row') {
        if (p.row >= index && p.row <= end) return ERROR.REF;
        if (p.row > end) p.row -= count;
      } else {
        if (p.col >= index && p.col <= end) return ERROR.REF;
        if (p.col > end) p.col -= count;
      }
      return formatRef(p);
    });
  }

  function serializeState(source) { return JSON.stringify({ rows: source.rows, cols: source.cols, cells: source.cells, active: source.active, range: source.range }); }
  function snapshot() { return serializeState(state); }
  function restore(snap) {
    const s = JSON.parse(snap);
    state.rows = s.rows; state.cols = s.cols; state.cells = s.cells || {}; state.active = s.active; state.anchor = s.active; state.range = s.range || normalizeRange(s.active, s.active);
    save(); renderAll();
  }
  function pushUndo() { state.undo.push(snapshot()); if (state.undo.length > 50) state.undo.shift(); state.redo = []; }
  function save() { localStorage.setItem(storageKey, snapshot()); }
  function load() {
    try { const raw = localStorage.getItem(storageKey); if (raw) { const s = JSON.parse(raw); Object.assign(state, s); state.anchor = state.active; } } catch (_) {}
  }

  function renderGrid() {
    grid.textContent = '';
    const thead = document.createElement('thead'), hr = document.createElement('tr'), corner = document.createElement('th');
    corner.className = 'corner'; hr.appendChild(corner);
    for (let c = 1; c <= state.cols; c++) {
      const th = document.createElement('th'); th.className = 'col-header'; th.textContent = colName(c); th.dataset.col = c; bindHeader(th, 'col', c); hr.appendChild(th);
    }
    thead.appendChild(hr); grid.appendChild(thead);
    const body = document.createElement('tbody');
    for (let r = 1; r <= state.rows; r++) {
      const tr = document.createElement('tr'), th = document.createElement('th');
      th.className = 'row-header'; th.textContent = r; th.dataset.row = r; bindHeader(th, 'row', r); tr.appendChild(th);
      for (let c = 1; c <= state.cols; c++) {
        const td = document.createElement('td'); td.className = 'cell'; td.tabIndex = 0; td.dataset.row = r; td.dataset.col = c;
        td.addEventListener('mousedown', cellMouseDown); td.addEventListener('dblclick', function () { startEdit(false); });
        td.addEventListener('blur', function () { if (editingCell === td) commitEdit(false); });
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    grid.appendChild(body);
  }
  function bindHeader(th, axis, index) {
    th.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(e.clientX, e.clientY, axis, index); });
    th.title = 'Right-click for insert/delete';
  }
  function renderAll() {
    for (let r = 1; r <= state.rows; r++) for (let c = 1; c <= state.cols; c++) renderCell(r, c);
    updateSelection();
  }
  function renderCell(row, col) {
    const td = cellEl(row, col); if (!td || td === editingCell) return;
    const raw = state.cells[addr(row, col)] || '', ev = evaluateCell(state.cells, addr(row, col));
    td.textContent = ev.display; td.classList.toggle('number', typeof ev.value === 'number'); td.classList.toggle('error', isError(ev.display)); td.title = raw.charAt(0) === '=' ? raw : '';
  }
  function cellEl(row, col) { return grid.querySelector('td[data-row="' + row + '"][data-col="' + col + '"]'); }
  function updateSelection() {
    nameBox.textContent = addr(state.active.row, state.active.col);
    formulaBar.value = state.cells[addr(state.active.row, state.active.col)] || '';
    grid.querySelectorAll('.cell.active,.cell.in-range').forEach(function (el) { el.classList.remove('active', 'in-range'); });
    for (let r = state.range.r1; r <= state.range.r2; r++) for (let c = state.range.c1; c <= state.range.c2; c++) {
      const el = cellEl(r, c); if (el) el.classList.add('in-range');
    }
    const active = cellEl(state.active.row, state.active.col); if (active) active.classList.add('active');
  }
  function selectCell(row, col, extend) {
    row = Math.max(1, Math.min(state.rows, row)); col = Math.max(1, Math.min(state.cols, col));
    state.active = { row: row, col: col };
    if (!extend) state.anchor = { row: row, col: col };
    state.range = normalizeRange(state.anchor, state.active);
    save(); updateSelection();
    const activeEl = cellEl(row, col);
    if (activeEl && document.activeElement !== formulaBar) activeEl.focus();
  }
  function cellMouseDown(e) {
    if (editingCell) commitEdit(true);
    const start = { row: Number(this.dataset.row), col: Number(this.dataset.col) };
    selectCell(start.row, start.col, e.shiftKey);
    this.focus();
    const move = function (ev) {
      const target = ev.target.closest && ev.target.closest('.cell');
      if (target) selectCell(Number(target.dataset.row), Number(target.dataset.col), true);
    };
    const up = function () { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }
  function setCell(address, raw) { if (raw) state.cells[address] = raw; else delete state.cells[address]; }
  function commitCell(address, raw) { pushUndo(); setCell(address, raw); save(); renderAll(); }
  function startEdit(replaceText) {
    const td = cellEl(state.active.row, state.active.col); if (!td) return;
    editingCell = td; editOriginal = state.cells[addr(state.active.row, state.active.col)] || '';
    td.contentEditable = 'true'; td.classList.add('editing'); td.textContent = replaceText || editOriginal; td.focus();
    const sel = window.getSelection(), range = document.createRange(); range.selectNodeContents(td); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
  }
  function commitEdit(move) {
    if (!editingCell) return;
    const raw = editingCell.textContent;
    editingCell.contentEditable = 'false'; editingCell.classList.remove('editing'); editingCell = null;
    if (raw !== editOriginal) commitCell(addr(state.active.row, state.active.col), raw); else renderAll();
    if (move) selectCell(state.active.row + 1, state.active.col, false);
  }
  function cancelEdit() { if (!editingCell) return; editingCell.contentEditable = 'false'; editingCell.classList.remove('editing'); editingCell = null; renderAll(); }

  function selectedAddresses() {
    const out = [];
    for (let r = state.range.r1; r <= state.range.r2; r++) for (let c = state.range.c1; c <= state.range.c2; c++) out.push(addr(r, c));
    return out;
  }
  function clearRange() { pushUndo(); selectedAddresses().forEach(function (a) { delete state.cells[a]; }); save(); renderAll(); }
  function copyRange(cut) {
    const lines = [];
    for (let r = state.range.r1; r <= state.range.r2; r++) {
      const row = [];
      for (let c = state.range.c1; c <= state.range.c2; c++) row.push(state.cells[addr(r, c)] || '');
      lines.push(row.join('\t'));
    }
    state.internalClipboard = lines.join('\n'); state.cutRange = cut ? Object.assign({}, state.range) : null;
    if (navigator.clipboard) navigator.clipboard.writeText(state.internalClipboard).catch(function () {});
  }
  function pasteText(textValue) {
    if (textValue == null) textValue = state.internalClipboard;
    if (!textValue) return;
    pushUndo();
    const rows = textValue.split(/\r?\n/).map(function (line) { return line.split('\t'); });
    const sourceTop = state.cutRange || { r1: state.active.row, c1: state.active.col };
    rows.forEach(function (row, r) { row.forEach(function (raw, c) {
      const target = addr(state.active.row + r, state.active.col + c);
      const source = addr(sourceTop.r1 + r, sourceTop.c1 + c);
      setCell(target, raw.charAt(0) === '=' ? adjustFormula(raw, source, target) : raw);
    }); });
    if (state.cutRange) {
      for (let r = state.cutRange.r1; r <= state.cutRange.r2; r++) for (let c = state.cutRange.c1; c <= state.cutRange.c2; c++) delete state.cells[addr(r, c)];
      state.cutRange = null;
    }
    save(); renderAll();
  }
  function undo() { if (!state.undo.length) return; state.redo.push(snapshot()); restore(state.undo.pop()); }
  function redo() { if (!state.redo.length) return; state.undo.push(snapshot()); restore(state.redo.pop()); }

  function showMenu(x, y, axis, index) {
    menu.innerHTML = '';
    const labels = axis === 'row' ? [['Insert row above', 'insertBefore'], ['Insert row below', 'insertAfter'], ['Delete row', 'delete']] : [['Insert column left', 'insertBefore'], ['Insert column right', 'insertAfter'], ['Delete column', 'delete']];
    labels.forEach(function (item) {
      const b = document.createElement('button'); b.textContent = item[0]; b.onclick = function () { menu.hidden = true; mutateAxis(axis, index, item[1]); }; menu.appendChild(b);
    });
    menu.style.left = x + 'px'; menu.style.top = y + 'px'; menu.hidden = false;
  }
  function mutateAxis(axis, index, op) {
    pushUndo();
    const next = {};
    Object.keys(state.cells).forEach(function (a) {
      const p = parseAddr(a); let row = p.row, col = p.col, deleted = false;
      if (axis === 'row') {
        if (op === 'delete' && row === index) deleted = true; else if (op === 'delete' && row > index) row--; else if (op !== 'delete' && row >= (op === 'insertBefore' ? index : index + 1)) row++;
      } else {
        if (op === 'delete' && col === index) deleted = true; else if (op === 'delete' && col > index) col--; else if (op !== 'delete' && col >= (op === 'insertBefore' ? index : index + 1)) col++;
      }
      if (!deleted) {
        let raw = state.cells[a];
        if (raw.charAt(0) === '=') raw = op === 'delete' ? shiftFormulaForDelete(raw, axis, index, 1) : shiftFormulaForInsert(raw, axis, op === 'insertBefore' ? index : index + 1, 1);
        next[addr(row, col)] = raw;
      }
    });
    state.cells = next;
    if (axis === 'row') state.rows += op === 'delete' ? -1 : 1; else state.cols += op === 'delete' ? -1 : 1;
    state.rows = Math.max(DEFAULT_ROWS, state.rows); state.cols = Math.max(DEFAULT_COLS, state.cols);
    renderGrid(); save(); renderAll(); selectCell(Math.min(state.active.row, state.rows), Math.min(state.active.col, state.cols), false);
  }

  function onKey(e) {
    if (e.target === formulaBar) return;
    if (editingCell) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(true); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      if (e.key === 'Tab') { e.preventDefault(); commitEdit(false); selectCell(state.active.row, state.active.col + 1, false); }
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copyRange(false); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copyRange(true); return; }
    if (mod && e.key.toLowerCase() === 'v') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearRange(); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(false); return; }
    if (e.key === 'Tab') { e.preventDefault(); selectCell(state.active.row, state.active.col + 1, false); return; }
    const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (move) { e.preventDefault(); selectCell(state.active.row + move[0], state.active.col + move[1], e.shiftKey); return; }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(e.key); }
  }

  function init() {
    grid = document.getElementById('grid'); formulaBar = document.getElementById('formulaBar'); nameBox = document.getElementById('nameBox'); menu = document.getElementById('menu');
    if (!grid || !formulaBar || !nameBox || !menu) return;
    load(); renderGrid(); renderAll();
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) menu.hidden = true; });
    document.addEventListener('paste', function (e) { if (e.target === formulaBar) return; e.preventDefault(); pasteText(e.clipboardData.getData('text/plain')); });
    formulaBar.addEventListener('keydown', function (e) { if (e.key === 'Enter') { commitCell(addr(state.active.row, state.active.col), formulaBar.value); grid.focus(); } });
    formulaBar.addEventListener('change', function () { commitCell(addr(state.active.row, state.active.col), formulaBar.value); });
    const active = cellEl(state.active.row, state.active.col); if (active) active.focus();
  }

  window.SpreadsheetInternals = { evaluateCell: evaluateCell, adjustFormula: adjustFormula, shiftFormulaForInsert: shiftFormulaForInsert, shiftFormulaForDelete: shiftFormulaForDelete, storageKey: storageKey, serializeState: serializeState };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
