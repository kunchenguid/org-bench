(function (root) {
  'use strict';

  const DEFAULT_COLS = 26;
  const DEFAULT_ROWS = 100;
  const ERROR = '#ERR!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';
  const DIV0 = '#DIV/0!';

  function colToLabel(col) {
    let label = '';
    let n = col + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      label = String.fromCharCode(65 + r) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label;
  }

  function labelToCol(label) {
    let col = 0;
    for (const ch of label) col = col * 26 + ch.charCodeAt(0) - 64;
    return col - 1;
  }

  function addr(row, col) { return `${colToLabel(col)}${row + 1}`; }

  function parseAddr(value) {
    const m = String(value).match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    return { col: labelToCol(m[1]), row: Number(m[2]) - 1 };
  }

  function displayValue(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value == null) return '';
    return String(value);
  }

  function toNumber(value) {
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + toNumber(item), 0);
    if (value && value.error) return value;
    if (value === true) return 1;
    if (value === false || value == null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function toText(value) {
    if (value && value.error) return value;
    return displayValue(value);
  }

  function flat(values) {
    return values.flat(Infinity).filter((v) => !(v && v.error));
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
        if (input[i] !== '"') throw new Error(ERROR);
        i++;
        tokens.push({ type: 'string', value: s });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/()&,.:=<>'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      const num = input.slice(i).match(/^\d+(?:\.\d+)?/);
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const ref = input.slice(i).match(/^\$?[A-Z]+\$?\d+/);
      if (ref) { tokens.push({ type: 'ref', value: ref[0].replace(/\$/g, '') }); i += ref[0].length; continue; }
      const ident = input.slice(i).match(/^[A-Z_][A-Z0-9_]*/i);
      if (ident) { tokens.push({ type: 'ident', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      throw new Error(ERROR);
    }
    return tokens;
  }

  function makeParser(tokens, workbook, stack) {
    let pos = 0;
    const peek = () => tokens[pos];
    const take = (value) => peek() && peek().value === value ? tokens[pos++] : null;
    const need = (value) => { if (!take(value)) throw new Error(ERROR); };

    function parseExpression() { return parseComparison(); }

    function parseComparison() {
      let left = parseConcat();
      while (peek() && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const op = tokens[pos++].value;
        const right = parseConcat();
        const a = typeof left === 'number' && typeof right === 'number' ? left : toText(left);
        const b = typeof left === 'number' && typeof right === 'number' ? right : toText(right);
        if (a && a.error) return a;
        if (b && b.error) return b;
        left = op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
      }
      return left;
    }

    function parseConcat() {
      let left = parseAdd();
      while (take('&')) {
        const right = parseAdd();
        if (left && left.error) return left;
        if (right && right.error) return right;
        left = toText(left) + toText(right);
      }
      return left;
    }

    function parseAdd() {
      let left = parseMul();
      while (peek() && ['+', '-'].includes(peek().value)) {
        const op = tokens[pos++].value;
        const right = parseMul();
        const a = toNumber(left); const b = toNumber(right);
        if (a && a.error) return a;
        if (b && b.error) return b;
        left = op === '+' ? a + b : a - b;
      }
      return left;
    }

    function parseMul() {
      let left = parseUnary();
      while (peek() && ['*', '/'].includes(peek().value)) {
        const op = tokens[pos++].value;
        const right = parseUnary();
        const a = toNumber(left); const b = toNumber(right);
        if (a && a.error) return a;
        if (b && b.error) return b;
        if (op === '/' && b === 0) return { error: DIV0 };
        left = op === '*' ? a * b : a / b;
      }
      return left;
    }

    function parseUnary() {
      if (take('-')) {
        const v = toNumber(parseUnary());
        return v && v.error ? v : -v;
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = tokens[pos++];
      if (!token) throw new Error(ERROR);
      if (token.type === 'number' || token.type === 'string') return token.value;
      if (token.type === 'ref') {
        if (take(':')) return rangeValues(token.value, expectRef());
        return workbook.evaluate(token.value, stack);
      }
      if (token.type === 'ident') {
        if (token.value === 'TRUE') return true;
        if (token.value === 'FALSE') return false;
        if (!take('(')) throw new Error(ERROR);
        const args = [];
        if (!take(')')) {
          do { args.push(parseExpression()); } while (take(','));
          need(')');
        }
        return callFn(token.value, args);
      }
      if (token.value === '(') {
        const value = parseExpression();
        need(')');
        return value;
      }
      throw new Error(ERROR);
    }

    function expectRef() {
      const token = tokens[pos++];
      if (!token || token.type !== 'ref') throw new Error(REF);
      return token.value;
    }

    function rangeValues(a, b) {
      const start = parseAddr(a); const end = parseAddr(b);
      if (!start || !end) return { error: REF };
      const values = [];
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          values.push(workbook.evaluate(addr(r, c), stack));
        }
      }
      return values;
    }

    function callFn(name, args) {
      const vals = flat(args);
      const nums = vals.map(toNumber).filter((v) => !(v && v.error));
      if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
      if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      if (name === 'MIN') return nums.length ? Math.min(...nums) : 0;
      if (name === 'MAX') return nums.length ? Math.max(...nums) : 0;
      if (name === 'COUNT') return vals.filter((v) => Number.isFinite(Number(v))).length;
      if (name === 'IF') return args[0] ? args[1] : args[2];
      if (name === 'AND') return vals.every(Boolean);
      if (name === 'OR') return vals.some(Boolean);
      if (name === 'NOT') return !args[0];
      if (name === 'ABS') return Math.abs(toNumber(args[0]));
      if (name === 'ROUND') return Number(toNumber(args[0]).toFixed(args[1] == null ? 0 : toNumber(args[1])));
      if (name === 'CONCAT') return vals.map(toText).join('');
      return { error: ERROR };
    }

    const value = parseExpression();
    if (pos !== tokens.length) throw new Error(ERROR);
    return value;
  }

  function createWorkbook(cols = DEFAULT_COLS, rows = DEFAULT_ROWS) {
    return {
      cols, rows, cells: {}, cache: {},
      setCell(id, raw) { raw = String(raw || ''); raw ? this.cells[id] = raw : delete this.cells[id]; this.cache = {}; },
      getRaw(id) { return this.cells[id] || ''; },
      getDisplay(id) { return displayValue(this.evaluate(id, [])); },
      evaluate(id, stack) {
        if (this.cache[id] !== undefined) return this.cache[id];
        const pos = parseAddr(id);
        if (!pos || pos.row < 0 || pos.col < 0 || pos.row >= this.rows || pos.col >= this.cols) return { error: REF };
        if (stack.includes(id)) return { error: CIRC };
        const raw = this.getRaw(id);
        let value;
        if (!raw) value = '';
        else if (raw[0] === '=') {
          try { value = makeParser(tokenize(raw.slice(1)), this, stack.concat(id)); }
          catch (e) { value = { error: e.message || ERROR }; }
        } else {
          const n = Number(raw);
          value = raw.trim() !== '' && Number.isFinite(n) ? n : raw;
        }
        this.cache[id] = value;
        return value;
      },
      snapshot() { return JSON.stringify({ cols: this.cols, rows: this.rows, cells: this.cells }); },
      restore(json) { const data = JSON.parse(json); this.cols = data.cols; this.rows = data.rows; this.cells = data.cells || {}; this.cache = {}; }
    };
  }

  function shiftFormula(raw, rowOffset, colOffset) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absCol, colLabel, absRow, rowText) => {
      const col = absCol ? labelToCol(colLabel) : Math.max(0, labelToCol(colLabel) + colOffset);
      const row = absRow ? Number(rowText) - 1 : Math.max(0, Number(rowText) - 1 + rowOffset);
      return `${absCol}${colToLabel(col)}${absRow}${row + 1}`;
    });
  }

  function adjustFormulaForStructureChange(raw, kind, index, delta) {
    if (!raw || raw[0] !== '=') return raw;
    let invalid = false;
    const adjusted = raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absCol, colLabel, absRow, rowText) => {
      let col = labelToCol(colLabel);
      let row = Number(rowText) - 1;
      if (kind === 'row' && !absRow) {
        if (delta < 0 && row === index) invalid = true;
        else if (row >= index) row += delta;
      }
      if (kind === 'col' && !absCol) {
        if (delta < 0 && col === index) invalid = true;
        else if (col >= index) col += delta;
      }
      return `${absCol}${colToLabel(Math.max(0, col))}${absRow}${Math.max(1, row + 1)}`;
    });
    return invalid ? '#REF!' : adjusted;
  }

  function shiftFormulasForInsertDelete(cells, kind, index, delta) {
    const out = {};
    for (const [id, raw] of Object.entries(cells)) {
      const p = parseAddr(id);
      if (!p) continue;
      if (kind === 'row') {
        if (delta < 0 && p.row === index) continue;
        if (p.row >= index) p.row += delta;
      } else {
        if (delta < 0 && p.col === index) continue;
        if (p.col >= index) p.col += delta;
      }
      if (p.row >= 0 && p.col >= 0) out[addr(p.row, p.col)] = adjustFormulaForStructureChange(raw, kind, index, delta);
    }
    return out;
  }

  function initUI() {
    const table = document.getElementById('grid');
    if (!table) return;
    const wrap = document.getElementById('gridWrap');
    const formulaBar = document.getElementById('formulaBar');
    const cellName = document.getElementById('cellName');
    const menu = document.getElementById('contextMenu');
    const ns = root.__STORAGE_NAMESPACE__ || root.BENCH_STORAGE_NAMESPACE || root.localStorageNamespace || 'sheet:';
    const storeKey = `${ns}:workbook`;
    const selKey = `${ns}:selection`;
    const book = createWorkbook();
    let active = { row: 0, col: 0 };
    let anchor = { row: 0, col: 0 };
    let editing = null;
    let undo = [];
    let redo = [];
    let copied = null;

    try { const saved = localStorage.getItem(storeKey); if (saved) book.restore(saved); } catch (_) {}
    try { const savedSel = JSON.parse(localStorage.getItem(selKey) || 'null'); if (savedSel) active = anchor = savedSel; } catch (_) {}

    function save() {
      localStorage.setItem(storeKey, book.snapshot());
      localStorage.setItem(selKey, JSON.stringify(active));
    }

    function pushHistory() {
      undo.push({ cells: { ...book.cells }, active: { ...active }, anchor: { ...anchor } });
      if (undo.length > 50) undo.shift();
      redo = [];
    }

    function restoreState(state) {
      book.cells = { ...state.cells }; book.cache = {}; active = { ...state.active }; anchor = { ...state.anchor };
      renderValues(); updateSelection(); save();
    }

    function buildGrid() {
      table.innerHTML = '';
      const head = document.createElement('tr');
      const corner = document.createElement('th'); corner.className = 'corner'; head.appendChild(corner);
      for (let c = 0; c < book.cols; c++) {
        const th = document.createElement('th'); th.className = 'col-header'; th.textContent = colToLabel(c); th.dataset.col = c; head.appendChild(th);
      }
      table.appendChild(head);
      for (let r = 0; r < book.rows; r++) {
        const tr = document.createElement('tr');
        const rh = document.createElement('th'); rh.className = 'row-header'; rh.textContent = r + 1; rh.dataset.row = r; tr.appendChild(rh);
        for (let c = 0; c < book.cols; c++) {
          const td = document.createElement('td'); td.className = 'cell'; td.dataset.row = r; td.dataset.col = c; tr.appendChild(td);
        }
        table.appendChild(tr);
      }
    }

    function cellEl(r, c) { return table.querySelector(`td[data-row="${r}"][data-col="${c}"]`); }
    function selectionBounds() { return { r1: Math.min(active.row, anchor.row), r2: Math.max(active.row, anchor.row), c1: Math.min(active.col, anchor.col), c2: Math.max(active.col, anchor.col) }; }

    function renderValues() {
      book.cache = {};
      table.querySelectorAll('td.cell').forEach((td) => {
        const id = addr(Number(td.dataset.row), Number(td.dataset.col));
        const value = book.getDisplay(id);
        td.textContent = value;
        td.classList.toggle('number', value !== '' && Number.isFinite(Number(value)));
        td.classList.toggle('error', value[0] === '#');
      });
    }

    function updateSelection() {
      const b = selectionBounds();
      table.querySelectorAll('td.cell').forEach((td) => {
        const r = Number(td.dataset.row), c = Number(td.dataset.col);
        td.classList.toggle('active', r === active.row && c === active.col);
        td.classList.toggle('selected-range', r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2);
      });
      const id = addr(active.row, active.col);
      cellName.textContent = id;
      formulaBar.value = book.getRaw(id);
      cellEl(active.row, active.col)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function commit(id, raw) {
      pushHistory(); book.setCell(id, raw); renderValues(); updateSelection(); save();
    }

    function startEdit(seed, preserve) {
      stopEdit(false);
      const td = cellEl(active.row, active.col); if (!td) return;
      const id = addr(active.row, active.col);
      const original = book.getRaw(id);
      const input = document.createElement('input');
      input.value = preserve ? original : seed;
      td.textContent = ''; td.appendChild(input); input.focus(); input.select();
      editing = { input, id, original };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); stopEdit(true); move(1, 0, false); }
        if (e.key === 'Tab') { e.preventDefault(); stopEdit(true); move(0, 1, false); }
        if (e.key === 'Escape') { e.preventDefault(); stopEdit(false); }
      });
      input.addEventListener('blur', () => stopEdit(true));
    }

    function stopEdit(apply) {
      if (!editing) return;
      const { input, id, original } = editing;
      const value = input.value;
      editing = null;
      if (apply && value !== original) commit(id, value); else { renderValues(); updateSelection(); }
    }

    function move(dr, dc, extend) {
      active = { row: Math.max(0, Math.min(book.rows - 1, active.row + dr)), col: Math.max(0, Math.min(book.cols - 1, active.col + dc)) };
      if (!extend) anchor = { ...active };
      updateSelection(); save();
    }

    function clearSelection() {
      const b = selectionBounds(); pushHistory();
      for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) book.setCell(addr(r, c), '');
      renderValues(); updateSelection(); save();
    }

    function copySelection(cut) {
      const b = selectionBounds(); const rows = [];
      for (let r = b.r1; r <= b.r2; r++) {
        const row = [];
        for (let c = b.c1; c <= b.c2; c++) row.push(book.getRaw(addr(r, c)));
        rows.push(row);
      }
      copied = { rows, origin: { row: b.r1, col: b.c1 }, cut };
      navigator.clipboard?.writeText(rows.map((row) => row.join('\t')).join('\n')).catch(() => {});
      if (cut) clearSelection();
    }

    function pasteText(text) {
      const rows = copied ? copied.rows : text.split(/\r?\n/).map((line) => line.split('\t'));
      pushHistory();
      rows.forEach((row, r) => row.forEach((raw, c) => {
        const targetR = active.row + r, targetC = active.col + c;
        if (targetR < book.rows && targetC < book.cols) {
          const shifted = copied && raw[0] === '=' ? shiftFormula(raw, targetR - copied.origin.row - r, targetC - copied.origin.col - c) : raw;
          book.setCell(addr(targetR, targetC), shifted);
        }
      }));
      copied = null; renderValues(); updateSelection(); save();
    }

    function alter(kind, index, delta) {
      pushHistory();
      book.cells = shiftFormulasForInsertDelete(book.cells, kind, index, delta);
      if (kind === 'row') book.rows = Math.max(1, book.rows + delta); else book.cols = Math.max(1, book.cols + delta);
      active.row = Math.min(active.row, book.rows - 1); active.col = Math.min(active.col, book.cols - 1); anchor = { ...active };
      buildGrid(); renderValues(); updateSelection(); save();
    }

    table.addEventListener('mousedown', (e) => {
      const td = e.target.closest('td.cell'); if (!td) return;
      const r = Number(td.dataset.row), c = Number(td.dataset.col);
      active = { row: r, col: c }; if (!e.shiftKey) anchor = { ...active };
      updateSelection(); wrap.focus();
      const onMove = (ev) => {
        const over = ev.target.closest && ev.target.closest('td.cell'); if (!over) return;
        active = { row: Number(over.dataset.row), col: Number(over.dataset.col) }; updateSelection();
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); save(); };
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
    table.addEventListener('dblclick', (e) => { if (e.target.closest('td.cell')) startEdit('', true); });
    table.addEventListener('contextmenu', (e) => {
      const h = e.target.closest('th'); if (!h || h.classList.contains('corner')) return;
      e.preventDefault();
      const isRow = h.dataset.row !== undefined; const index = Number(isRow ? h.dataset.row : h.dataset.col);
      const noun = isRow ? 'row' : 'column';
      menu.innerHTML = `<button data-act="insert-before">Insert ${noun} before</button><button data-act="insert-after">Insert ${noun} after</button><button data-act="delete">Delete ${noun}</button>`;
      menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`; menu.hidden = false;
      menu.onclick = (ev) => {
        const act = ev.target.dataset.act; if (!act) return;
        if (act === 'insert-before') alter(isRow ? 'row' : 'col', index, 1);
        if (act === 'insert-after') alter(isRow ? 'row' : 'col', index + 1, 1);
        if (act === 'delete') alter(isRow ? 'row' : 'col', index, -1);
        menu.hidden = true;
      };
    });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });

    wrap.addEventListener('keydown', async (e) => {
      if (editing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); const from = undo.pop(); if (from) { redo.push({ cells: { ...book.cells }, active: { ...active }, anchor: { ...anchor } }); restoreState(from); } return; }
      if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); const state = redo.pop(); if (state) { undo.push({ cells: { ...book.cells }, active: { ...active }, anchor: { ...anchor } }); restoreState(state); } return; }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(false); return; }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copySelection(true); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteText(await navigator.clipboard?.readText().catch(() => '') || ''); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSelection(); return; }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit('', true); return; }
      if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1, 0, e.shiftKey); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1, 0, e.shiftKey); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); move(0, 1, e.shiftKey); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(0, -1, e.shiftKey); return; }
      if (!mod && e.key.length === 1) { e.preventDefault(); startEdit(e.key, false); }
    });

    formulaBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(addr(active.row, active.col), formulaBar.value); move(1, 0, false); wrap.focus(); }
      if (e.key === 'Escape') { formulaBar.value = book.getRaw(addr(active.row, active.col)); wrap.focus(); }
    });
    formulaBar.addEventListener('change', () => commit(addr(active.row, active.col), formulaBar.value));

    buildGrid(); renderValues(); updateSelection(); setTimeout(() => wrap.focus(), 0);
  }

  root.SpreadsheetCore = { createWorkbook, shiftFormula, adjustFormulaForStructureChange, colToLabel, labelToCol };
  if (typeof module !== 'undefined') module.exports = root.SpreadsheetCore;
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initUI);
})(typeof globalThis !== 'undefined' ? globalThis : this);
