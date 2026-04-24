(function (root) {
  'use strict';

  const COLS = 26;
  const ROWS = 100;
  const ERROR = { CIRC: '#CIRC!', ERR: '#ERR!', DIV0: '#DIV/0!', REF: '#REF!' };

  function colToIndex(col) {
    let value = 0;
    for (let i = 0; i < col.length; i += 1) value = value * 26 + col.charCodeAt(i) - 64;
    return value;
  }

  function indexToCol(index) {
    let col = '';
    while (index > 0) {
      const rem = (index - 1) % 26;
      col = String.fromCharCode(65 + rem) + col;
      index = Math.floor((index - 1) / 26);
    }
    return col;
  }

  function parseAddress(address) {
    const match = /^([$]?)([A-Z]+)([$]?)(\d+)$/.exec(String(address).toUpperCase());
    if (!match) return null;
    return { colAbs: !!match[1], col: colToIndex(match[2]), rowAbs: !!match[3], row: Number(match[4]) };
  }

  function formatAddress(pos) {
    return `${pos.colAbs ? '$' : ''}${indexToCol(pos.col)}${pos.rowAbs ? '$' : ''}${pos.row}`;
  }

  function key(row, col) { return `${row},${col}`; }
  function addressKey(address) { const p = parseAddress(address); return p ? key(p.row, p.col) : ''; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function createSpreadsheetModel(rows, cols) {
    return { rows: rows || ROWS, cols: cols || COLS, cells: Object.create(null) };
  }

  function getCellRaw(sheet, address) {
    const pos = parseAddress(address);
    return pos ? (sheet.cells[key(pos.row, pos.col)] || '') : '';
  }

  function setCellRaw(sheet, address, raw) {
    const pos = parseAddress(address);
    if (!pos) return;
    const cellKey = key(pos.row, pos.col);
    if (raw === '') delete sheet.cells[cellKey];
    else sheet.cells[cellKey] = String(raw);
  }

  function parseLiteral(raw) {
    if (raw === '') return { type: 'blank', value: '' };
    if (/^[-+]?\d+(\.\d+)?$/.test(raw.trim())) return { type: 'number', value: Number(raw) };
    if (/^TRUE$/i.test(raw.trim())) return { type: 'boolean', value: true };
    if (/^FALSE$/i.test(raw.trim())) return { type: 'boolean', value: false };
    return { type: 'text', value: raw };
  }

  function isError(value) { return typeof value === 'string' && value[0] === '#'; }
  function toNumber(value) {
    if (isError(value)) return value;
    if (value === '' || value === null || value === false) return 0;
    if (value === true) return 1;
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
  function truthy(value) { return !!(isError(value) ? false : value); }

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '"') {
        let text = '';
        i += 1;
        while (i < source.length && source[i] !== '"') { text += source[i]; i += 1; }
        if (source[i] !== '"') throw new Error(ERROR.ERR);
        i += 1;
        tokens.push({ type: 'string', value: text });
        continue;
      }
      const two = source.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/()&,:<>='.includes(ch)) { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
      const ref = /^\$?[A-Z]+\$?\d+/.exec(source.slice(i));
      if (ref) { tokens.push({ type: 'ref', value: ref[0] }); i += ref[0].length; continue; }
      const number = /^\d+(\.\d+)?/.exec(source.slice(i));
      if (number) { tokens.push({ type: 'number', value: Number(number[0]) }); i += number[0].length; continue; }
      const ident = /^[A-Z_][A-Z0-9_]*/i.exec(source.slice(i));
      if (ident) { tokens.push({ type: 'ident', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      throw new Error(ERROR.ERR);
    }
    return tokens;
  }

  function evaluateFormula(sheet, formula, address, visiting) {
    const tokens = tokenize(formula.slice(1));
    let index = 0;
    const current = () => tokens[index];
    const eat = value => current() && current().value === value && (index += 1);
    const expect = value => { if (!eat(value)) throw new Error(ERROR.ERR); };

    function parseExpression() { return parseComparison(); }
    function parseComparison() {
      let left = parseConcat();
      while (current() && ['=', '<>', '<', '<=', '>', '>='].includes(current().value)) {
        const op = current().value; index += 1;
        const right = parseConcat();
        if (op === '=') left = left === right;
        else if (op === '<>') left = left !== right;
        else if (op === '<') left = left < right;
        else if (op === '<=') left = left <= right;
        else if (op === '>') left = left > right;
        else left = left >= right;
      }
      return left;
    }
    function parseConcat() {
      let left = parseAdd();
      while (eat('&')) left = String(left) + String(parseAdd());
      return left;
    }
    function parseAdd() {
      let left = parseMul();
      while (current() && ['+', '-'].includes(current().value)) {
        const op = current().value; index += 1;
        const right = parseMul();
        if (isError(left)) return left;
        if (isError(right)) return right;
        left = op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
      }
      return left;
    }
    function parseMul() {
      let left = parseUnary();
      while (current() && ['*', '/'].includes(current().value)) {
        const op = current().value; index += 1;
        const right = parseUnary();
        if (isError(left)) return left;
        if (isError(right)) return right;
        if (op === '/' && toNumber(right) === 0) return ERROR.DIV0;
        left = op === '*' ? toNumber(left) * toNumber(right) : toNumber(left) / toNumber(right);
      }
      return left;
    }
    function parseUnary() {
      if (eat('-')) return -toNumber(parseUnary());
      return parsePrimary();
    }
    function parsePrimary() {
      const token = current();
      if (!token) throw new Error(ERROR.ERR);
      if (eat('(')) { const value = parseExpression(); expect(')'); return value; }
      if (token.type === 'number' || token.type === 'string') { index += 1; return token.value; }
      if (token.type === 'ref') {
        index += 1;
        const start = token.value;
        if (eat(':')) {
          const end = current();
          if (!end || end.type !== 'ref') throw new Error(ERROR.ERR);
          index += 1;
          return expandRange(sheet, start, end.value, address, visiting);
        }
        return evaluateCell(sheet, start, visiting);
      }
      if (token.type === 'ident') {
        index += 1;
        if (token.value === 'TRUE') return true;
        if (token.value === 'FALSE') return false;
        if (!eat('(')) throw new Error(ERROR.ERR);
        const args = [];
        if (!eat(')')) {
          do { args.push(parseExpression()); } while (eat(','));
          expect(')');
        }
        return callFunction(token.value, args);
      }
      throw new Error(ERROR.ERR);
    }

    const value = parseExpression();
    if (index !== tokens.length) throw new Error(ERROR.ERR);
    return value;
  }

  function expandRange(sheet, start, end, currentAddress, visiting) {
    const a = parseAddress(start);
    const b = parseAddress(end);
    if (!a || !b) return ERROR.REF;
    const values = [];
    for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row += 1) {
      for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col += 1) {
        values.push(evaluateCell(sheet, `${indexToCol(col)}${row}`, visiting));
      }
    }
    return values;
  }

  function flatten(args) { return args.flatMap(value => Array.isArray(value) ? flatten(value) : [value]); }
  function numericArgs(args) { return flatten(args).map(toNumber).filter(value => !isError(value)); }

  function callFunction(name, args) {
    const nums = numericArgs(args);
    if (name === 'SUM') return nums.reduce((sum, value) => sum + value, 0);
    if (name === 'AVERAGE') return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
    if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
    if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
    if (name === 'COUNT') return nums.length;
    if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
    if (name === 'AND') return flatten(args).every(truthy);
    if (name === 'OR') return flatten(args).some(truthy);
    if (name === 'NOT') return !truthy(args[0]);
    if (name === 'ABS') return Math.abs(toNumber(args[0]));
    if (name === 'ROUND') return Number(toNumber(args[0]).toFixed(args[1] === undefined ? 0 : toNumber(args[1])));
    if (name === 'CONCAT') return flatten(args).join('');
    return ERROR.ERR;
  }

  function evaluateCell(sheet, address, visiting) {
    const pos = parseAddress(address);
    if (!pos || pos.row < 1 || pos.col < 1 || pos.row > sheet.rows || pos.col > sheet.cols) return ERROR.REF;
    const cellKey = key(pos.row, pos.col);
    const stack = visiting || new Set();
    if (stack.has(cellKey)) return ERROR.CIRC;
    const raw = sheet.cells[cellKey] || '';
    if (!raw.startsWith('=')) return parseLiteral(raw).value;
    stack.add(cellKey);
    try {
      const result = evaluateFormula(sheet, raw, address, stack);
      stack.delete(cellKey);
      return result;
    } catch (error) {
      stack.delete(cellKey);
      return error.message && error.message[0] === '#' ? error.message : ERROR.ERR;
    }
  }

  function formatCellValue(value) {
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    return String(value);
  }

  function adjustFormulaReferences(raw, fromAddress, toAddress) {
    if (!raw.startsWith('=')) return raw;
    const from = parseAddress(fromAddress);
    const to = parseAddress(toAddress);
    if (!from || !to) return raw;
    const dRow = to.row - from.row;
    const dCol = to.col - from.col;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, colAbs, colText, rowAbs, rowText) => {
      const col = colAbs ? colToIndex(colText) : colToIndex(colText) + dCol;
      const row = rowAbs ? Number(rowText) : Number(rowText) + dRow;
      if (col < 1 || row < 1) return '#REF!';
      return `${colAbs}${indexToCol(col)}${rowAbs}${row}`;
    });
  }

  function updateFormulaRows(raw, atRow, count, mode) {
    if (!raw.startsWith('=')) return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, colAbs, colText, rowAbs, rowText) => {
      const row = Number(rowText);
      if (mode === 'insert' && row >= atRow) return `${colAbs}${colText}${rowAbs}${row + count}`;
      if (mode === 'delete') {
        if (row >= atRow && row < atRow + count) return '#REF!';
        if (row >= atRow + count) return `${colAbs}${colText}${rowAbs}${row - count}`;
      }
      return match;
    });
  }

  function updateFormulaCols(raw, atCol, count, mode) {
    if (!raw.startsWith('=')) return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, colAbs, colText, rowAbs, rowText) => {
      const col = colToIndex(colText);
      if (mode === 'insert' && col >= atCol) return `${colAbs}${indexToCol(col + count)}${rowAbs}${rowText}`;
      if (mode === 'delete') {
        if (col >= atCol && col < atCol + count) return '#REF!';
        if (col >= atCol + count) return `${colAbs}${indexToCol(col - count)}${rowAbs}${rowText}`;
      }
      return match;
    });
  }

  function insertRows(sheet, atRow, count) {
    const next = Object.create(null);
    Object.keys(sheet.cells).forEach(cellKey => {
      const [row, col] = cellKey.split(',').map(Number);
      next[key(row >= atRow ? row + count : row, col)] = updateFormulaRows(sheet.cells[cellKey], atRow, count, 'insert');
    });
    sheet.cells = next;
    sheet.rows += count;
  }

  function deleteRows(sheet, atRow, count) {
    const next = Object.create(null);
    Object.keys(sheet.cells).forEach(cellKey => {
      const [row, col] = cellKey.split(',').map(Number);
      if (row >= atRow && row < atRow + count) return;
      next[key(row > atRow ? row - count : row, col)] = updateFormulaRows(sheet.cells[cellKey], atRow, count, 'delete');
    });
    sheet.cells = next;
    sheet.rows = Math.max(1, sheet.rows - count);
  }

  function insertCols(sheet, atCol, count) {
    const next = Object.create(null);
    Object.keys(sheet.cells).forEach(cellKey => {
      const [row, col] = cellKey.split(',').map(Number);
      next[key(row, col >= atCol ? col + count : col)] = updateFormulaCols(sheet.cells[cellKey], atCol, count, 'insert');
    });
    sheet.cells = next;
    sheet.cols += count;
  }

  function deleteCols(sheet, atCol, count) {
    const next = Object.create(null);
    Object.keys(sheet.cells).forEach(cellKey => {
      const [row, col] = cellKey.split(',').map(Number);
      if (col >= atCol && col < atCol + count) return;
      next[key(row, col > atCol ? col - count : col)] = updateFormulaCols(sheet.cells[cellKey], atCol, count, 'delete');
    });
    sheet.cells = next;
    sheet.cols = Math.max(1, sheet.cols - count);
  }

  const api = { createSpreadsheetModel, getCellRaw, setCellRaw, evaluateCell, formatCellValue, adjustFormulaReferences, insertRows, deleteRows, insertCols, deleteCols, parseAddress, indexToCol };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpreadsheetEngine = api;

  if (!root.document) return;

  const grid = document.getElementById('grid');
  const formulaBar = document.getElementById('formulaBar');
  const nameBox = document.getElementById('nameBox');
  const menu = document.getElementById('contextMenu');
  const namespace = String(root.SPREADSHEET_STORAGE_NAMESPACE || root.__SPREADSHEET_STORAGE_NAMESPACE__ || root.__RUN_STORAGE_NAMESPACE__ || 'spreadsheet');
  const storageKey = `${namespace}:state`;
  let sheet = createSpreadsheetModel(ROWS, COLS);
  let active = { row: 1, col: 1 };
  let anchor = { row: 1, col: 1 };
  let selection = { r1: 1, c1: 1, r2: 1, c2: 1 };
  let editing = null;
  let clipboard = null;
  const undo = [];
  const redo = [];

  function address(row, col) { return `${indexToCol(col)}${row}`; }
  function snapshot() { return { cells: Object.assign({}, sheet.cells), rows: sheet.rows, cols: sheet.cols, active: Object.assign({}, active) }; }
  function restore(state) { sheet.rows = state.rows; sheet.cols = state.cols; sheet.cells = Object.assign(Object.create(null), state.cells); active = Object.assign({}, state.active); anchor = Object.assign({}, active); setSelection(active.row, active.col, active.row, active.col); render(); save(); }
  function pushHistory() { undo.push(snapshot()); if (undo.length > 50) undo.shift(); redo.length = 0; }
  function save() { localStorage.setItem(storageKey, JSON.stringify(snapshot())); }
  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const state = JSON.parse(raw);
      sheet = createSpreadsheetModel(state.rows || ROWS, state.cols || COLS);
      sheet.cells = Object.assign(Object.create(null), state.cells || {});
      active = state.active || active;
      anchor = Object.assign({}, active);
      setSelection(active.row, active.col, active.row, active.col);
    } catch (error) { /* Ignore corrupt local state. */ }
  }

  function setSelection(r1, c1, r2, c2) {
    selection = { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
  }

  function render() {
    grid.style.gridTemplateColumns = `48px repeat(${sheet.cols}, 104px)`;
    grid.innerHTML = '';
    const corner = document.createElement('div');
    corner.className = 'corner';
    grid.appendChild(corner);
    for (let col = 1; col <= sheet.cols; col += 1) {
      const header = document.createElement('div');
      header.className = 'col-header';
      header.textContent = indexToCol(col);
      header.dataset.col = col;
      header.addEventListener('contextmenu', showColMenu);
      grid.appendChild(header);
    }
    for (let row = 1; row <= sheet.rows; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.textContent = row;
      rowHeader.dataset.row = row;
      rowHeader.addEventListener('contextmenu', showRowMenu);
      grid.appendChild(rowHeader);
      for (let col = 1; col <= sheet.cols; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = row;
        cell.dataset.col = col;
        const value = evaluateCell(sheet, address(row, col));
        const shown = formatCellValue(value);
        cell.textContent = shown;
        if (typeof value === 'number') cell.classList.add('number');
        if (typeof value === 'boolean') cell.classList.add('boolean');
        if (isError(shown)) cell.classList.add('error');
        if (row >= selection.r1 && row <= selection.r2 && col >= selection.c1 && col <= selection.c2) cell.classList.add('in-range');
        if (row === active.row && col === active.col) cell.classList.add('active');
        cell.addEventListener('mousedown', onCellMouseDown);
        cell.addEventListener('dblclick', () => startEdit(true));
        grid.appendChild(cell);
      }
    }
    updateFormulaBar();
  }

  function updateFormulaBar() {
    nameBox.textContent = address(active.row, active.col);
    formulaBar.value = getCellRaw(sheet, address(active.row, active.col));
  }

  function selectCell(row, col, extend) {
    active = { row: clamp(row, 1, sheet.rows), col: clamp(col, 1, sheet.cols) };
    if (!extend) anchor = Object.assign({}, active);
    setSelection(anchor.row, anchor.col, active.row, active.col);
    render();
    grid.focus();
    save();
  }

  function onCellMouseDown(event) {
    hideMenu();
    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);
    selectCell(row, col, event.shiftKey);
    if (event.shiftKey) return;
    const move = moveEvent => {
      const target = moveEvent.target.closest('.cell');
      if (!target) return;
      active = { row: Number(target.dataset.row), col: Number(target.dataset.col) };
      setSelection(anchor.row, anchor.col, active.row, active.col);
      render();
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); save(); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function startEdit(preserve, firstChar) {
    if (editing) return;
    const cell = grid.querySelector(`.cell[data-row="${active.row}"][data-col="${active.col}"]`);
    if (!cell) return;
    const input = document.createElement('input');
    const previous = getCellRaw(sheet, address(active.row, active.col));
    input.value = preserve ? previous : (firstChar || '');
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    editing = { input, previous };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); commitEdit(1, 0); }
      else if (event.key === 'Tab') { event.preventDefault(); commitEdit(0, 1); }
      else if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
    });
    input.addEventListener('blur', () => { if (editing) commitEdit(0, 0); });
  }

  function commitEdit(moveRow, moveCol) {
    if (!editing) return;
    const value = editing.input.value;
    const addr = address(active.row, active.col);
    if (value !== editing.previous) { pushHistory(); setCellRaw(sheet, addr, value); }
    editing = null;
    save();
    selectCell(active.row + moveRow, active.col + moveCol, false);
  }

  function cancelEdit() { editing = null; render(); grid.focus(); }

  function clearSelection() {
    pushHistory();
    for (let row = selection.r1; row <= selection.r2; row += 1) for (let col = selection.c1; col <= selection.c2; col += 1) setCellRaw(sheet, address(row, col), '');
    render(); save();
  }

  function selectedMatrix(clearSource) {
    const cells = [];
    for (let row = selection.r1; row <= selection.r2; row += 1) {
      const line = [];
      for (let col = selection.c1; col <= selection.c2; col += 1) line.push({ raw: getCellRaw(sheet, address(row, col)), from: address(row, col) });
      cells.push(line);
    }
    clipboard = { cells, cut: clearSource };
  }

  function pasteClipboard() {
    if (!clipboard) return;
    pushHistory();
    clipboard.cells.forEach((rowCells, rOffset) => rowCells.forEach((cell, cOffset) => {
      const dest = address(active.row + rOffset, active.col + cOffset);
      setCellRaw(sheet, dest, adjustFormulaReferences(cell.raw, cell.from, dest));
    }));
    if (clipboard.cut) clipboard.cells.forEach(rowCells => rowCells.forEach(cell => setCellRaw(sheet, cell.from, '')));
    clipboard.cut = false;
    render(); save();
  }

  function showRowMenu(event) {
    event.preventDefault();
    const row = Number(event.currentTarget.dataset.row);
    showMenu(event.clientX, event.clientY, [
      ['Insert row above', () => mutate(() => insertRows(sheet, row, 1))],
      ['Insert row below', () => mutate(() => insertRows(sheet, row + 1, 1))],
      ['Delete row', () => mutate(() => deleteRows(sheet, row, 1))]
    ]);
  }

  function showColMenu(event) {
    event.preventDefault();
    const col = Number(event.currentTarget.dataset.col);
    showMenu(event.clientX, event.clientY, [
      ['Insert column left', () => mutate(() => insertCols(sheet, col, 1))],
      ['Insert column right', () => mutate(() => insertCols(sheet, col + 1, 1))],
      ['Delete column', () => mutate(() => deleteCols(sheet, col, 1))]
    ]);
  }

  function mutate(fn) { pushHistory(); fn(); hideMenu(); render(); save(); }
  function showMenu(x, y, items) {
    menu.innerHTML = '';
    items.forEach(([label, fn]) => { const button = document.createElement('button'); button.textContent = label; button.onclick = fn; menu.appendChild(button); });
    menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.hidden = false;
  }
  function hideMenu() { menu.hidden = true; }

  formulaBar.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); pushHistory(); setCellRaw(sheet, address(active.row, active.col), formulaBar.value); selectCell(active.row + 1, active.col, false); save(); }
    if (event.key === 'Escape') updateFormulaBar();
  });
  formulaBar.addEventListener('change', () => { pushHistory(); setCellRaw(sheet, address(active.row, active.col), formulaBar.value); render(); save(); });

  grid.addEventListener('keydown', event => {
    if (editing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); const prev = undo.pop(); if (prev) { redo.push(snapshot()); restore(prev); } return; }
    if ((mod && event.key.toLowerCase() === 'y') || (mod && event.shiftKey && event.key.toLowerCase() === 'z')) { event.preventDefault(); const next = redo.pop(); if (next) { undo.push(snapshot()); restore(next); } return; }
    if (mod && event.key.toLowerCase() === 'c') { selectedMatrix(false); return; }
    if (mod && event.key.toLowerCase() === 'x') { selectedMatrix(true); return; }
    if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteClipboard(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearSelection(); return; }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit(true); return; }
    if (event.key === 'Tab') { event.preventDefault(); selectCell(active.row, active.col + 1, event.shiftKey); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[event.key]) { event.preventDefault(); const [dr, dc] = arrows[event.key]; selectCell(active.row + dr, active.col + dc, event.shiftKey); return; }
    if (!mod && event.key.length === 1) { event.preventDefault(); startEdit(false, event.key); }
  });

  document.addEventListener('click', event => { if (!menu.contains(event.target)) hideMenu(); });
  load();
  render();
  grid.focus();
})(typeof window !== 'undefined' ? window : globalThis);
