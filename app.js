(function () {
  const Core = typeof require === 'function' ? require('./spreadsheet-core.js') : window.SpreadsheetCore;
  if (typeof module === 'object' && module.exports) {
    module.exports = {
      evaluateCell(raw, getRaw) {
        const sheet = Core.createSheet(26, 100);
        sheet.cells = new Proxy(Object.create(null), { get: (_, key) => key === 'Z100' ? raw : getRaw(String(key)) || '' });
        const display = Core.displayValue(sheet, 'Z100');
        return { value: display, display };
      },
      shiftFormula(raw, rowDelta, colDelta) {
        return Core.adjustFormula(raw, colDelta, rowDelta);
      },
      adjustFormulaForStructure
    };
    return;
  }

  function adjustFormulaForStructure(raw, axis, at, delta) {
    if (!raw || raw[0] !== '=') return raw || '';
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, absC, col, absR, row) => {
      let c = Core.addressToCoord(col + '1').col;
      let r = Number(row) - 1;
      if (axis === 'row' && !absR) {
        if (delta > 0 && r >= at) r += delta;
        else if (delta < 0 && r === at) return '#REF!';
        else if (delta < 0 && r > at) r += delta;
      }
      if (axis === 'col' && !absC) {
        if (delta > 0 && c >= at) c += delta;
        else if (delta < 0 && c === at) return '#REF!';
        else if (delta < 0 && c > at) c += delta;
      }
      return absC + Core.indexToCol(c) + absR + (r + 1);
    });
  }

  const COLS = 26;
  const ROWS = 100;
  const ns = window.SPREADSHEET_STORAGE_NAMESPACE || new URLSearchParams(location.search).get('storageNamespace') || 'microsoft-sheet';
  const storageKey = ns + ':state';
  const grid = document.getElementById('grid');
  const formula = document.getElementById('formula-bar');
  const cellName = document.getElementById('cell-name');
  const menu = document.getElementById('menu');
  const sheet = Core.createSheet(COLS, ROWS);
  let active = { row: 0, col: 0 };
  let anchor = { row: 0, col: 0 };
  let range = { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } };
  let editing = null;
  let drag = false;
  let clipboard = null;
  const undo = [];
  const redo = [];

  function keyOf(c) { return Core.coordToAddress(c); }
  function clamp(v, max) { return Math.max(0, Math.min(max - 1, v)); }
  function sorted(a, b) { return { start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) }, end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) } }; }
  function each(r, fn) { for (let row = r.start.row; row <= r.end.row; row++) for (let col = r.start.col; col <= r.end.col; col++) fn({ row, col }); }
  function snapshot(r) { const data = {}; each(r, c => { data[keyOf(c)] = Core.rawValue(sheet, keyOf(c)); }); return data; }
  function restore(data) { Object.keys(data).forEach(a => Core.setCell(sheet, a, data[a])); }
  function pushHistory(before, after) { undo.push({ before, after }); if (undo.length > 50) undo.shift(); redo.length = 0; }
  function persist() { localStorage.setItem(storageKey, JSON.stringify({ cells: sheet.cells, active })); }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      Object.keys(saved.cells || {}).forEach(a => Core.setCell(sheet, a, saved.cells[a]));
      if (saved.active) active = { row: clamp(saved.active.row, ROWS), col: clamp(saved.active.col, COLS) };
      anchor = active; range = sorted(active, active);
    } catch (_) {}
  }

  function build() {
    grid.appendChild(div('corner', ''));
    for (let c = 0; c < COLS; c++) {
      const h = div('col-header', Core.indexToCol(c));
      h.dataset.col = c;
      h.addEventListener('contextmenu', e => showMenu(e, 'col', c));
      grid.appendChild(h);
    }
    for (let r = 0; r < ROWS; r++) {
      const rh = div('row-header', String(r + 1));
      rh.dataset.row = r;
      rh.addEventListener('contextmenu', e => showMenu(e, 'row', r));
      grid.appendChild(rh);
      for (let c = 0; c < COLS; c++) {
        const cell = div('cell', '');
        cell.dataset.row = r; cell.dataset.col = c;
        cell.addEventListener('mousedown', e => selectMouse(e, r, c));
        cell.addEventListener('mouseenter', () => { if (drag) extendTo({ row: r, col: c }); });
        cell.addEventListener('dblclick', () => startEdit(false));
        grid.appendChild(cell);
      }
    }
    document.addEventListener('mouseup', () => { drag = false; });
    document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.hidden = true; });
  }

  function div(cls, text) { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; }
  function cellEl(c) { return grid.querySelector('.cell[data-row="' + c.row + '"][data-col="' + c.col + '"]'); }

  function render() {
    sheet.cache = Object.create(null);
    document.querySelectorAll('.col-header').forEach(h => h.classList.toggle('active', Number(h.dataset.col) === active.col));
    document.querySelectorAll('.row-header').forEach(h => h.classList.toggle('active', Number(h.dataset.row) === active.row));
    document.querySelectorAll('.cell').forEach(el => {
      const c = { row: Number(el.dataset.row), col: Number(el.dataset.col) };
      const v = Core.displayValue(sheet, keyOf(c));
      const raw = Core.rawValue(sheet, keyOf(c));
      el.textContent = editing && editing.row === c.row && editing.col === c.col ? '' : v;
      el.classList.toggle('active', c.row === active.row && c.col === active.col);
      el.classList.toggle('in-range', c.row >= range.start.row && c.row <= range.end.row && c.col >= range.start.col && c.col <= range.end.col);
      el.classList.toggle('number', raw !== '' && !raw.startsWith('=') && Number.isFinite(Number(raw)) || Number.isFinite(Number(v)));
      el.classList.toggle('error', /^#/.test(v));
    });
    cellName.textContent = keyOf(active);
    if (document.activeElement !== formula) formula.value = Core.rawValue(sheet, keyOf(active));
  }

  function select(c, extend) {
    commitEdit();
    active = { row: clamp(c.row, ROWS), col: clamp(c.col, COLS) };
    if (!extend) anchor = active;
    range = sorted(anchor, active);
    render(); persist(); cellEl(active).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function extendTo(c) { active = { row: clamp(c.row, ROWS), col: clamp(c.col, COLS) }; range = sorted(anchor, active); render(); }
  function selectMouse(e, r, c) { drag = true; select({ row: r, col: c }, e.shiftKey); grid.focus(); e.preventDefault(); }

  function startEdit(replace, initial) {
    if (editing) return;
    const el = cellEl(active);
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.value = replace ? (initial || '') : Core.rawValue(sheet, keyOf(active));
    el.classList.add('editing'); el.textContent = ''; el.appendChild(input); editing = active;
    input.focus(); input.select();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { commitEdit(); select({ row: active.row + 1, col: active.col }); e.preventDefault(); }
      if (e.key === 'Tab') { commitEdit(); select({ row: active.row, col: active.col + 1 }); e.preventDefault(); }
      if (e.key === 'Escape') { cancelEdit(); e.preventDefault(); }
    });
  }
  function commitEdit(value) {
    if (!editing && value === undefined) return;
    const addr = keyOf(active), before = snapshot(sorted(active, active));
    const v = value !== undefined ? value : cellEl(active).querySelector('input').value;
    Core.setCell(sheet, addr, v);
    const after = snapshot(sorted(active, active));
    if (before[addr] !== after[addr]) pushHistory(before, after);
    editing = null; render(); persist();
  }
  function cancelEdit() { editing = null; render(); }

  formula.addEventListener('focus', () => formula.select());
  formula.addEventListener('keydown', e => {
    if (e.key === 'Enter') { commitEdit(formula.value); select({ row: active.row + 1, col: active.col }); formula.value = Core.rawValue(sheet, keyOf(active)); grid.focus(); }
    if (e.key === 'Escape') { formula.value = Core.rawValue(sheet, keyOf(active)); grid.focus(); }
  });

  grid.addEventListener('keydown', e => {
    if (editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); historyMove(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo, e.shiftKey); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); historyMove(redo, undo, true); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(false); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(true); return; }
    if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
    if (['Delete', 'Backspace'].includes(e.key)) { clearRange(); e.preventDefault(); return; }
    if (e.key === 'F2' || e.key === 'Enter') { startEdit(false); e.preventDefault(); return; }
    if (e.key === 'Tab') { select({ row: active.row, col: active.col + 1 }); e.preventDefault(); return; }
    if (e.key.startsWith('Arrow')) {
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      e.shiftKey ? extendTo({ row: active.row + d[0], col: active.col + d[1] }) : select({ row: active.row + d[0], col: active.col + d[1] });
      e.preventDefault(); return;
    }
    if (e.key.length === 1 && !mod) { startEdit(true, e.key); e.preventDefault(); }
  });

  function clearRange() {
    const before = snapshot(range); each(range, c => Core.setCell(sheet, keyOf(c), ''));
    pushHistory(before, snapshot(range)); render(); persist();
  }
  function copy(cut) {
    clipboard = { range: JSON.parse(JSON.stringify(range)), data: snapshot(range), cut };
    if (cut) clearRange();
  }
  function paste() {
    if (!clipboard) return;
    const h = clipboard.range.end.row - clipboard.range.start.row;
    const w = clipboard.range.end.col - clipboard.range.start.col;
    const dest = { start: active, end: { row: clamp(active.row + h, ROWS), col: clamp(active.col + w, COLS) } };
    const before = snapshot(dest);
    each(clipboard.range, c => {
      const src = keyOf(c), target = { row: active.row + c.row - clipboard.range.start.row, col: active.col + c.col - clipboard.range.start.col };
      if (target.row < ROWS && target.col < COLS) Core.setCell(sheet, keyOf(target), Core.adjustFormula(clipboard.data[src] || '', target.col - c.col, target.row - c.row));
    });
    pushHistory(before, snapshot(dest)); render(); persist();
  }
  function historyMove(from, to, forward) {
    const item = from.pop(); if (!item) return;
    restore(forward ? item.after : item.before); to.push(item); render(); persist();
  }

  function showMenu(e, type, index) {
    e.preventDefault(); menu.innerHTML = ''; menu.hidden = false; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    const items = type === 'row' ? [['Insert row above', () => insertRow(index)], ['Insert row below', () => insertRow(index + 1)], ['Delete row', () => deleteRow(index)]] : [['Insert column left', () => insertCol(index)], ['Insert column right', () => insertCol(index + 1)], ['Delete column', () => deleteCol(index)]];
    items.forEach(([label, fn]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); menu.hidden = true; }; menu.appendChild(b); });
  }
  function insertRow(at) { shiftCells('row', at, 1); }
  function deleteRow(at) { shiftCells('row', at, -1); }
  function insertCol(at) { shiftCells('col', at, 1); }
  function deleteCol(at) { shiftCells('col', at, -1); }
  function shiftCells(axis, at, delta) {
    const before = Object.assign({}, sheet.cells), next = Object.create(null);
    Object.keys(sheet.cells).forEach(a => {
      const c = Core.addressToCoord(a);
      if (axis === 'row' && c.row >= at) c.row += delta;
      if (axis === 'col' && c.col >= at) c.col += delta;
      if (c.row >= 0 && c.row < ROWS && c.col >= 0 && c.col < COLS) next[keyOf(c)] = adjustFormulaForStructure(sheet.cells[a], axis, at, delta);
    });
    sheet.cells = next;
    pushHistory(before, Object.assign({}, sheet.cells));
    active = { row: clamp(active.row + (axis === 'row' && active.row >= at ? delta : 0), ROWS), col: clamp(active.col + (axis === 'col' && active.col >= at ? delta : 0), COLS) };
    anchor = active; range = sorted(active, active); render(); persist();
  }

  load(); build(); render(); grid.focus();
})();
