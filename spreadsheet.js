(function () {
  'use strict';

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const MAX_HISTORY = 50;
  const ERR = '#ERR!';
  const DIV0 = '#DIV/0!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';

  function colName(index) {
    let name = '';
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function colIndex(name) {
    let n = 0;
    for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function addr(row, col) { return `${colName(col)}${row + 1}`; }
  function cellKey(row, col) { return `${row},${col}`; }
  function makeCell(raw) { return { raw: raw || '', value: '', error: '' }; }

  function createSheet(rows, cols) {
    return {
      rows,
      cols,
      cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => makeCell(''))),
      history: [],
      future: []
    };
  }

  function ensureSize(sheet, rows, cols) {
    while (sheet.rows < rows) {
      sheet.cells.push(Array.from({ length: sheet.cols }, () => makeCell('')));
      sheet.rows += 1;
    }
    while (sheet.cols < cols) {
      for (const row of sheet.cells) row.push(makeCell(''));
      sheet.cols += 1;
    }
  }

  function rawValue(sheet, row, col) {
    if (!sheet.cells[row] || !sheet.cells[row][col]) return '';
    return sheet.cells[row][col].raw;
  }

  function displayValue(sheet, row, col) {
    const cell = sheet.cells[row] && sheet.cells[row][col];
    if (!cell) return REF;
    if (cell.error) return cell.error;
    if (typeof cell.value === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
    if (typeof cell.value === 'number') return Number.isFinite(cell.value) ? String(roundForDisplay(cell.value)) : ERR;
    return cell.value == null ? '' : String(cell.value);
  }

  function roundForDisplay(value) {
    return Math.abs(value - Math.round(value)) < 1e-10 ? Math.round(value) : Number(value.toPrecision(12));
  }

  function setCell(sheet, row, col, raw) {
    ensureSize(sheet, row + 1, col + 1);
    sheet.cells[row][col].raw = raw == null ? '' : String(raw);
  }

  function cloneCells(cells) {
    return cells.map(row => row.map(cell => ({ raw: cell.raw, value: cell.value, error: cell.error })));
  }

  function snapshot(sheet) { return { rows: sheet.rows, cols: sheet.cols, cells: cloneCells(sheet.cells) }; }
  function restore(sheet, snap) { sheet.rows = snap.rows; sheet.cols = snap.cols; sheet.cells = cloneCells(snap.cells); }
  function pushHistory(sheet, before) {
    sheet.history.push(before);
    if (sheet.history.length > MAX_HISTORY) sheet.history.shift();
    sheet.future = [];
  }
  function undo(sheet) {
    const prev = sheet.history.pop();
    if (!prev) return false;
    sheet.future.push(snapshot(sheet));
    restore(sheet, prev);
    recalculate(sheet);
    return true;
  }
  function redo(sheet) {
    const next = sheet.future.pop();
    if (!next) return false;
    sheet.history.push(snapshot(sheet));
    restore(sheet, next);
    recalculate(sheet);
    return true;
  }

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '"') {
        let s = '';
        i += 1;
        while (i < expr.length && expr[i] !== '"') s += expr[i++];
        if (expr[i] !== '"') throw new Error(ERR);
        i += 1;
        tokens.push({ type: 'string', value: s });
        continue;
      }
      const two = expr.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/()&,:=<>'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
      if (/\d|\./.test(ch)) {
        let s = '';
        while (i < expr.length && /\d|\./.test(expr[i])) s += expr[i++];
        tokens.push({ type: 'number', value: Number(s) });
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let s = '';
        while (i < expr.length && /[A-Za-z0-9_$]/.test(expr[i])) s += expr[i++];
        tokens.push({ type: 'ident', value: s.toUpperCase() });
        continue;
      }
      throw new Error(ERR);
    }
    return tokens;
  }

  function parseRef(text) {
    const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(text);
    if (!m) return null;
    return { colAbs: !!m[1], col: colIndex(m[2]), rowAbs: !!m[3], row: Number(m[4]) - 1 };
  }

  function refToText(ref) {
    return `${ref.colAbs ? '$' : ''}${colName(ref.col)}${ref.rowAbs ? '$' : ''}${ref.row + 1}`;
  }

  function makeParser(tokens, context) {
    let pos = 0;
    const peek = () => tokens[pos];
    const take = value => {
      const t = tokens[pos];
      if (t && (!value || t.value === value)) { pos += 1; return t; }
      return null;
    };
    const expect = value => { if (!take(value)) throw new Error(ERR); };

    function parseExpression() { return parseComparison(); }
    function parseComparison() {
      let left = parseConcat();
      while (peek() && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const op = take().value;
        const right = parseConcat();
        left = compareValues(left, right, op);
      }
      return left;
    }
    function parseConcat() {
      let left = parseAdd();
      while (take('&')) left = asText(left) + asText(parseAdd());
      return left;
    }
    function parseAdd() {
      let left = parseMul();
      while (peek() && ['+', '-'].includes(peek().value)) {
        const op = take().value;
        const right = parseMul();
        left = op === '+' ? asNumber(left) + asNumber(right) : asNumber(left) - asNumber(right);
      }
      return left;
    }
    function parseMul() {
      let left = parseUnary();
      while (peek() && ['*', '/'].includes(peek().value)) {
        const op = take().value;
        const right = parseUnary();
        if (op === '/' && asNumber(right) === 0) throw new Error(DIV0);
        left = op === '*' ? asNumber(left) * asNumber(right) : asNumber(left) / asNumber(right);
      }
      return left;
    }
    function parseUnary() {
      if (take('-')) return -asNumber(parseUnary());
      return parsePrimary();
    }
    function parsePrimary() {
      const t = peek();
      if (!t) throw new Error(ERR);
      if (take('(')) { const v = parseExpression(); expect(')'); return v; }
      if (t.type === 'number') { pos += 1; return t.value; }
      if (t.type === 'string') { pos += 1; return t.value; }
      if (t.type === 'ident') {
        pos += 1;
        if (t.value === 'TRUE') return true;
        if (t.value === 'FALSE') return false;
        const ref = parseRef(t.value);
        if (ref) {
          if (take(':')) {
            const next = take();
            const end = next && next.type === 'ident' ? parseRef(next.value) : null;
            if (!end) throw new Error(ERR);
            return rangeValues(context.sheet, ref, end, context.stack);
          }
          return refValue(context.sheet, ref.row, ref.col, context.stack);
        }
        if (take('(')) {
          const args = [];
          if (!take(')')) {
            do { args.push(parseExpression()); } while (take(','));
            expect(')');
          }
          return callFunction(t.value, args);
        }
      }
      throw new Error(ERR);
    }
    return { parseExpression, done: () => pos === tokens.length };
  }

  function flatten(args) { return args.flatMap(v => Array.isArray(v) ? flatten(v) : [v]); }
  function asNumber(v) {
    if (Array.isArray(v)) return asNumber(flatten(v)[0]);
    if (v === '' || v == null) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function asText(v) {
    if (Array.isArray(v)) return asText(flatten(v)[0]);
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function compareValues(a, b, op) {
    const leftNum = Number(a);
    const rightNum = Number(b);
    const numeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);
    const left = numeric ? leftNum : asText(a);
    const right = numeric ? rightNum : asText(b);
    if (op === '=') return left === right;
    if (op === '<>') return left !== right;
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === '>') return left > right;
    if (op === '>=') return left >= right;
    return false;
  }
  function callFunction(name, args) {
    const values = flatten(args);
    const nums = values.map(asNumber);
    if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
    if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
    if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
    if (name === 'COUNT') return values.filter(v => v !== '' && Number.isFinite(Number(v))).length;
    if (name === 'IF') return args.length >= 2 ? (asNumber(args[0]) || args[0] === true ? args[1] : args[2] || '') : ERR;
    if (name === 'AND') return values.every(v => !!asNumber(v) || v === true);
    if (name === 'OR') return values.some(v => !!asNumber(v) || v === true);
    if (name === 'NOT') return !(!!asNumber(values[0]) || values[0] === true);
    if (name === 'ABS') return Math.abs(asNumber(values[0]));
    if (name === 'ROUND') return Number(asNumber(values[0]).toFixed(args.length > 1 ? asNumber(args[1]) : 0));
    if (name === 'CONCAT') return values.map(asText).join('');
    throw new Error(ERR);
  }
  function refValue(sheet, row, col, stack) {
    if (row < 0 || col < 0 || row >= sheet.rows || col >= sheet.cols) throw new Error(REF);
    evaluateCell(sheet, row, col, stack);
    const cell = sheet.cells[row][col];
    if (cell.error) throw new Error(cell.error);
    return cell.value;
  }
  function rangeValues(sheet, start, end, stack) {
    const r1 = Math.min(start.row, end.row), r2 = Math.max(start.row, end.row);
    const c1 = Math.min(start.col, end.col), c2 = Math.max(start.col, end.col);
    const values = [];
    for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) values.push(refValue(sheet, r, c, stack));
    return values;
  }

  function evaluateCell(sheet, row, col, stack) {
    const cell = sheet.cells[row][col];
    if (cell._done) return;
    const key = cellKey(row, col);
    if (stack.has(key)) { cell.error = CIRC; cell.value = ''; throw new Error(CIRC); }
    cell.error = '';
    const raw = cell.raw.trim();
    if (!raw) { cell.value = ''; cell._done = true; return; }
    if (raw[0] !== '=') {
      const n = Number(raw);
      cell.value = raw !== '' && Number.isFinite(n) ? n : cell.raw;
      cell._done = true;
      return;
    }
    stack.add(key);
    try {
      const parser = makeParser(tokenize(raw.slice(1)), { sheet, stack });
      cell.value = parser.parseExpression();
      if (!parser.done()) throw new Error(ERR);
    } catch (error) {
      cell.error = error.message === CIRC ? CIRC : (error.message || ERR);
      cell.value = '';
      if (cell.error === CIRC) {
        for (const item of stack) {
          const parts = item.split(',').map(Number);
          sheet.cells[parts[0]][parts[1]].error = CIRC;
        }
      }
    } finally {
      stack.delete(key);
      cell._done = true;
    }
  }

  function recalculate(sheet) {
    for (const row of sheet.cells) for (const cell of row) { cell._done = false; cell.error = ''; }
    for (let r = 0; r < sheet.rows; r += 1) for (let c = 0; c < sheet.cols; c += 1) evaluateCell(sheet, r, c, new Set());
    for (const row of sheet.cells) for (const cell of row) delete cell._done;
  }

  function adjustFormulaReferences(raw, srcRow, srcCol, dstRow, dstCol) {
    if (!raw || raw[0] !== '=') return raw;
    const dr = dstRow - srcRow;
    const dc = dstCol - srcCol;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, colAbs, col, rowAbs, row) => {
      const ref = { colAbs: !!colAbs, col: colIndex(col), rowAbs: !!rowAbs, row: Number(row) - 1 };
      if (!ref.colAbs) ref.col += dc;
      if (!ref.rowAbs) ref.row += dr;
      if (ref.row < 0 || ref.col < 0) return REF;
      return refToText(ref);
    });
  }

  function shiftFormulaRows(raw, at, delta) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, colAbs, col, rowAbs, row) => {
      const ref = { colAbs: !!colAbs, col: colIndex(col), rowAbs: !!rowAbs, row: Number(row) - 1 };
      if (ref.row >= at) ref.row += delta;
      if (ref.row < 0) return REF;
      return refToText(ref);
    });
  }
  function shiftFormulaCols(raw, at, delta) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, colAbs, col, rowAbs, row) => {
      const ref = { colAbs: !!colAbs, col: colIndex(col), rowAbs: !!rowAbs, row: Number(row) - 1 };
      if (ref.col >= at) ref.col += delta;
      if (ref.col < 0) return REF;
      return refToText(ref);
    });
  }
  function insertRow(sheet, index) {
    sheet.cells.splice(index, 0, Array.from({ length: sheet.cols }, () => makeCell('')));
    sheet.rows += 1;
    for (const row of sheet.cells) for (const cell of row) cell.raw = shiftFormulaRows(cell.raw, index, 1);
  }
  function deleteRow(sheet, index) {
    if (sheet.rows <= 1) return;
    sheet.cells.splice(index, 1);
    sheet.rows -= 1;
    for (const row of sheet.cells) for (const cell of row) cell.raw = shiftFormulaRows(cell.raw, index + 1, -1);
  }
  function insertCol(sheet, index) {
    for (const row of sheet.cells) row.splice(index, 0, makeCell(''));
    sheet.cols += 1;
    for (const row of sheet.cells) for (const cell of row) cell.raw = shiftFormulaCols(cell.raw, index, 1);
  }
  function deleteCol(sheet, index) {
    if (sheet.cols <= 1) return;
    for (const row of sheet.cells) row.splice(index, 1);
    sheet.cols -= 1;
    for (const row of sheet.cells) for (const cell of row) cell.raw = shiftFormulaCols(cell.raw, index + 1, -1);
  }

  const SpreadsheetCore = { createSheet, setCell, rawValue, displayValue, recalculate, adjustFormulaReferences, insertRow, deleteRow, insertCol, deleteCol, snapshot, restore, pushHistory, undo, redo, colName, addr };
  window.SpreadsheetCore = SpreadsheetCore;

  function initApp() {
    const root = document.getElementById('app');
    if (!root) return;
    const ns = window.SPREADSHEET_STORAGE_NAMESPACE || window.__STORAGE_NAMESPACE__ || 'google-sheet-v1';
    const key = `${ns}:sheet`;
    const gridShell = document.getElementById('gridShell');
    const formulaBar = document.getElementById('formulaBar');
    const cellName = document.getElementById('cellName');
    let sheet = createSheet(DEFAULT_ROWS, DEFAULT_COLS);
    let active = { row: 0, col: 0 };
    let anchor = { row: 0, col: 0 };
    let selection = { r1: 0, c1: 0, r2: 0, c2: 0 };
    let editing = null;
    let clipboard = null;

    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && saved.cells) {
        sheet = createSheet(saved.rows || DEFAULT_ROWS, saved.cols || DEFAULT_COLS);
        sheet.cells = saved.cells.map(row => row.map(raw => makeCell(raw)));
        active = saved.active || active;
        anchor = active;
        selection = saved.selection || selection;
      }
    } catch (_) {}
    recalculate(sheet);

    function save() {
      const cells = sheet.cells.map(row => row.map(cell => cell.raw));
      localStorage.setItem(key, JSON.stringify({ rows: sheet.rows, cols: sheet.cols, cells, active, selection }));
    }
    function normalizeRange(a, b) {
      return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) };
    }
    function render() {
      const table = document.createElement('table');
      table.className = 'sheet';
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'corner';
      hr.appendChild(corner);
      for (let c = 0; c < sheet.cols; c += 1) {
        const th = document.createElement('th');
        th.className = 'col-head';
        th.textContent = colName(c);
        th.title = 'Use toolbar to insert or delete columns';
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (let r = 0; r < sheet.rows; r += 1) {
        const tr = document.createElement('tr');
        const rh = document.createElement('th');
        rh.className = 'row-head';
        rh.textContent = r + 1;
        rh.title = 'Use toolbar to insert or delete rows';
        tr.appendChild(rh);
        for (let c = 0; c < sheet.cols; c += 1) {
          const td = document.createElement('td');
          td.dataset.row = r;
          td.dataset.col = c;
          td.textContent = displayValue(sheet, r, c);
          if (typeof sheet.cells[r][c].value === 'number' && !sheet.cells[r][c].error) td.classList.add('number');
          if (sheet.cells[r][c].error) td.classList.add('error');
          if (r >= selection.r1 && r <= selection.r2 && c >= selection.c1 && c <= selection.c2) td.classList.add('in-range');
          if (r === active.row && c === active.col) td.classList.add('active');
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      gridShell.replaceChildren(table);
      cellName.textContent = addr(active.row, active.col);
      formulaBar.value = rawValue(sheet, active.row, active.col);
    }
    function commitChange(row, col, raw) {
      const before = snapshot(sheet);
      setCell(sheet, row, col, raw);
      pushHistory(sheet, before);
      recalculate(sheet);
      save();
      render();
    }
    function selectCell(row, col, extend) {
      active = { row: Math.max(0, Math.min(sheet.rows - 1, row)), col: Math.max(0, Math.min(sheet.cols - 1, col)) };
      if (!extend) anchor = active;
      selection = normalizeRange(anchor, active);
      save();
      render();
    }
    function startEdit(seed, preserve) {
      if (editing) return;
      const td = gridShell.querySelector(`td[data-row="${active.row}"][data-col="${active.col}"]`);
      if (!td) return;
      editing = { row: active.row, col: active.col, original: rawValue(sheet, active.row, active.col) };
      td.classList.add('editing');
      const input = document.createElement('input');
      input.className = 'cell-editor';
      input.value = preserve ? editing.original : seed;
      td.replaceChildren(input);
      input.focus();
      input.select();
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); finishEdit(true, 1, 0); }
        if (event.key === 'Tab') { event.preventDefault(); finishEdit(true, 0, event.shiftKey ? -1 : 1); }
        if (event.key === 'Escape') { event.preventDefault(); finishEdit(false, 0, 0); }
      });
      input.addEventListener('blur', () => finishEdit(true, 0, 0));
    }
    function finishEdit(commit, dr, dc) {
      if (!editing) return;
      const input = gridShell.querySelector('.cell-editor');
      const edit = editing;
      editing = null;
      if (commit && input && input.value !== edit.original) commitChange(edit.row, edit.col, input.value);
      else render();
      if (dr || dc) selectCell(edit.row + dr, edit.col + dc, false);
    }
    function selectedCells() {
      const rows = [];
      for (let r = selection.r1; r <= selection.r2; r += 1) {
        const row = [];
        for (let c = selection.c1; c <= selection.c2; c += 1) row.push(rawValue(sheet, r, c));
        rows.push(row);
      }
      return rows;
    }
    function copySelection(cut) {
      clipboard = { rows: selectedCells(), source: { row: selection.r1, col: selection.c1 }, cut };
      const text = clipboard.rows.map(row => row.join('\t')).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
      if (cut) clearSelection(true);
    }
    async function pasteSelection() {
      let rows = clipboard && clipboard.rows;
      let source = clipboard && clipboard.source;
      try {
        const text = await navigator.clipboard.readText();
        if (text) rows = text.split(/\r?\n/).map(line => line.split('\t'));
      } catch (_) {}
      if (!rows) return;
      const before = snapshot(sheet);
      for (let r = 0; r < rows.length; r += 1) for (let c = 0; c < rows[r].length; c += 1) {
        const raw = source ? adjustFormulaReferences(rows[r][c], source.row + r, source.col + c, active.row + r, active.col + c) : rows[r][c];
        setCell(sheet, active.row + r, active.col + c, raw);
      }
      pushHistory(sheet, before);
      recalculate(sheet); save(); render();
    }
    function clearSelection(fromCut) {
      const before = snapshot(sheet);
      for (let r = selection.r1; r <= selection.r2; r += 1) for (let c = selection.c1; c <= selection.c2; c += 1) setCell(sheet, r, c, '');
      pushHistory(sheet, before);
      recalculate(sheet); save(); render();
      if (!fromCut) clipboard = null;
    }

    gridShell.addEventListener('mousedown', event => {
      const td = event.target.closest('td');
      if (!td) return;
      const row = Number(td.dataset.row), col = Number(td.dataset.col);
      selectCell(row, col, event.shiftKey);
      if (event.detail === 2) startEdit('', true);
    });
    formulaBar.addEventListener('input', () => commitChange(active.row, active.col, formulaBar.value));
    gridShell.addEventListener('keydown', event => {
      if (editing) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo(sheet) : undo(sheet); recalculate(sheet); save(); render(); return; }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(sheet); save(); render(); return; }
      if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(false); return; }
      if (mod && event.key.toLowerCase() === 'x') { event.preventDefault(); copySelection(true); return; }
      if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelection(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearSelection(false); return; }
      if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit('', true); return; }
      if (event.key === 'Tab') { event.preventDefault(); selectCell(active.row, active.col + (event.shiftKey ? -1 : 1), false); return; }
      const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (moves[event.key]) { event.preventDefault(); selectCell(active.row + moves[event.key][0], active.col + moves[event.key][1], event.shiftKey); return; }
      if (event.key.length === 1 && !mod) { event.preventDefault(); startEdit(event.key, false); }
    });
    document.getElementById('insertRow').onclick = () => { const before = snapshot(sheet); insertRow(sheet, active.row); pushHistory(sheet, before); active.row += 1; anchor = active; selection = normalizeRange(active, active); recalculate(sheet); save(); render(); };
    document.getElementById('deleteRow').onclick = () => { const before = snapshot(sheet); deleteRow(sheet, active.row); pushHistory(sheet, before); active.row = Math.min(active.row, sheet.rows - 1); anchor = active; selection = normalizeRange(active, active); recalculate(sheet); save(); render(); };
    document.getElementById('insertCol').onclick = () => { const before = snapshot(sheet); insertCol(sheet, active.col); pushHistory(sheet, before); active.col += 1; anchor = active; selection = normalizeRange(active, active); recalculate(sheet); save(); render(); };
    document.getElementById('deleteCol').onclick = () => { const before = snapshot(sheet); deleteCol(sheet, active.col); pushHistory(sheet, before); active.col = Math.min(active.col, sheet.cols - 1); anchor = active; selection = normalizeRange(active, active); recalculate(sheet); save(); render(); };
    render();
    gridShell.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
  else initApp();
})();
