(function (root) {
  'use strict';

  const COLS = 26;
  const ROWS = 100;
  const ERR = '#ERR!';
  const CIRC = '#CIRC!';
  const DIV0 = '#DIV/0!';
  const REF = '#REF!';

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.replace(/\$/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
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

  function addr(row, col) { return indexToCol(col) + (row + 1); }
  function parseAddr(ref) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref);
    if (!m) return null;
    return { row: Number(m[2]) - 1, col: colToIndex(m[1]) };
  }

  function adjustFormulaForPaste(raw, rowOffset, colOffset) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, function (_, absCol, col, absRow, row) {
      const nextCol = absCol ? colToIndex(col) : colToIndex(col) + colOffset;
      const nextRow = absRow ? Number(row) - 1 : Number(row) - 1 + rowOffset;
      if (nextCol < 0 || nextRow < 0) return REF;
      return absCol + indexToCol(nextCol) + absRow + (nextRow + 1);
    });
  }

  function transformFormula(rawText, change) {
    if (!rawText || rawText[0] !== '=') return rawText;
    return rawText.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, function (match, absCol, col, absRow, row) {
      let c = colToIndex(col);
      let r = Number(row) - 1;
      if (change.type === 'insertRow' && r >= change.index) r++;
      if (change.type === 'deleteRow') {
        if (r === change.index) return REF;
        if (r > change.index) r--;
      }
      if (change.type === 'insertColumn' && c >= change.index) c++;
      if (change.type === 'deleteColumn') {
        if (c === change.index) return REF;
        if (c > change.index) c--;
      }
      return absCol + indexToCol(c) + absRow + (r + 1);
    });
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let value = '';
        i++;
        while (i < input.length && input[i] !== '"') value += input[i++];
        if (input[i] !== '"') throw new Error(ERR);
        i++;
        tokens.push({ type: 'string', value });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/(),:&=<>'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      const num = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const ref = /^\$?[A-Z]+\$?\d+/i.exec(input.slice(i));
      if (ref) { tokens.push({ type: 'ref', value: ref[0].toUpperCase() }); i += ref[0].length; continue; }
      const ident = /^[A-Z_][A-Z0-9_]*/i.exec(input.slice(i));
      if (ident) { tokens.push({ type: 'ident', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      throw new Error(ERR);
    }
    return tokens;
  }

  function createEngine(rows, cols) {
    const raw = new Map();

    function setCell(a, value) {
      const text = String(value || '');
      if (text) raw.set(a.toUpperCase(), text); else raw.delete(a.toUpperCase());
    }

    function getRaw(a) { return raw.get(a.toUpperCase()) || ''; }

    function getValue(a, stack) {
      a = a.toUpperCase();
      if (stack.includes(a)) return { value: CIRC, error: CIRC };
      const text = getRaw(a);
      if (!text) return { value: 0 };
      if (text[0] !== '=') {
        const n = Number(text);
        return text.trim() !== '' && Number.isFinite(n) ? { value: n } : { value: text };
      }
      try {
        return { value: evaluate(text.slice(1), stack.concat(a)) };
      } catch (error) {
        const message = error && error.message ? error.message : ERR;
        return { value: message, error: message };
      }
    }

    function rangeValues(start, end, stack) {
      const a = parseAddr(start), b = parseAddr(end);
      if (!a || !b) throw new Error(REF);
      const values = [];
      for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
        for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
          values.push(getValue(addr(r, c), stack).value);
        }
      }
      return values;
    }

    function evaluate(expr, stack) {
      const tokens = tokenize(expr);
      let pos = 0;
      const peek = () => tokens[pos];
      const take = value => peek() && peek().value === value && tokens[pos++];
      const expect = value => { if (!take(value)) throw new Error(ERR); };
      const numeric = v => {
        if (v === CIRC || String(v).startsWith('#')) throw new Error(v);
        if (v === true) return 1;
        if (v === false || v === '') return 0;
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const text = v => v === true ? 'TRUE' : v === false ? 'FALSE' : String(v ?? '');
      const truthy = v => typeof v === 'boolean' ? v : numeric(v) !== 0 || (typeof v === 'string' && v !== '');

      function parseExpression() { return parseComparison(); }
      function parseComparison() {
        let left = parseConcat();
        while (peek() && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
          const op = tokens[pos++].value;
          const right = parseConcat();
          if (op === '=') left = left == right;
          if (op === '<>') left = left != right;
          if (op === '<') left = numeric(left) < numeric(right);
          if (op === '<=') left = numeric(left) <= numeric(right);
          if (op === '>') left = numeric(left) > numeric(right);
          if (op === '>=') left = numeric(left) >= numeric(right);
        }
        return left;
      }
      function parseConcat() {
        let left = parseAdd();
        while (take('&')) left = text(left) + text(parseAdd());
        return left;
      }
      function parseAdd() {
        let left = parseMul();
        while (peek() && ['+', '-'].includes(peek().value)) {
          const op = tokens[pos++].value;
          const right = parseMul();
          left = op === '+' ? numeric(left) + numeric(right) : numeric(left) - numeric(right);
        }
        return left;
      }
      function parseMul() {
        let left = parseUnary();
        while (peek() && ['*', '/'].includes(peek().value)) {
          const op = tokens[pos++].value;
          const right = parseUnary();
          if (op === '/' && numeric(right) === 0) throw new Error(DIV0);
          left = op === '*' ? numeric(left) * numeric(right) : numeric(left) / numeric(right);
        }
        return left;
      }
      function parseUnary() {
        if (take('-')) return -numeric(parseUnary());
        return parsePrimary();
      }
      function parsePrimary() {
        const t = peek();
        if (!t) throw new Error(ERR);
        if (take('(')) { const v = parseExpression(); expect(')'); return v; }
        if (t.type === 'number' || t.type === 'string') { pos++; return t.value; }
        if (t.type === 'ref') {
          pos++;
          if (take(':')) {
            const end = tokens[pos++];
            if (!end || end.type !== 'ref') throw new Error(ERR);
            return rangeValues(t.value, end.value, stack);
          }
          return getValue(t.value.replace(/\$/g, ''), stack).value;
        }
        if (t.type === 'ident') {
          pos++;
          if (t.value === 'TRUE') return true;
          if (t.value === 'FALSE') return false;
          expect('(');
          const args = [];
          if (!take(')')) {
            do { args.push(parseExpression()); } while (take(','));
            expect(')');
          }
          return callFunction(t.value, args);
        }
        throw new Error(ERR);
      }
      function flat(args) { return args.flat(Infinity); }
      function numbers(args) { return flat(args).map(numeric); }
      function callFunction(name, args) {
        const nums = numbers(args);
        if (name === 'SUM') return nums.reduce((a, b) => a + b, 0);
        if (name === 'AVERAGE') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        if (name === 'MIN') return Math.min(...nums);
        if (name === 'MAX') return Math.max(...nums);
        if (name === 'COUNT') return nums.filter(Number.isFinite).length;
        if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
        if (name === 'AND') return flat(args).every(truthy);
        if (name === 'OR') return flat(args).some(truthy);
        if (name === 'NOT') return !truthy(args[0]);
        if (name === 'ABS') return Math.abs(numeric(args[0]));
        if (name === 'ROUND') return Number(numeric(args[0]).toFixed(args[1] == null ? 0 : numeric(args[1])));
        if (name === 'CONCAT') return flat(args).map(text).join('');
        throw new Error(ERR);
      }
      const result = parseExpression();
      if (pos !== tokens.length) throw new Error(ERR);
      return result;
    }

    function getDisplay(a) {
      if (!getRaw(a)) return '';
      const v = getValue(a, []).value;
      if (v === true) return 'TRUE';
      if (v === false) return 'FALSE';
      if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v * 10000000000) / 10000000000);
      return String(v ?? '');
    }

    function remapCells(change) {
      const next = new Map();
      raw.forEach((value, key) => {
        const p = parseAddr(key);
        if (!p) return;
        let { row, col } = p;
        if (change.type === 'insertRow' && row >= change.index) row++;
        if (change.type === 'deleteRow') {
          if (row === change.index) return;
          if (row > change.index) row--;
        }
        if (change.type === 'insertColumn' && col >= change.index) col++;
        if (change.type === 'deleteColumn') {
          if (col === change.index) return;
          if (col > change.index) col--;
        }
        if (row >= 0 && row < rows && col >= 0 && col < cols) next.set(addr(row, col), transformFormula(value, change));
      });
      raw.clear();
      next.forEach((value, key) => raw.set(key, value));
    }

    function insertRow(index) { remapCells({ type: 'insertRow', index }); }
    function deleteRow(index) { remapCells({ type: 'deleteRow', index }); }
    function insertColumn(index) { remapCells({ type: 'insertColumn', index }); }
    function deleteColumn(index) { remapCells({ type: 'deleteColumn', index }); }

    return { rows, cols, raw, setCell, getRaw, getDisplay, insertRow, deleteRow, insertColumn, deleteColumn };
  }

  function boot() {
    if (!root.document) return;
    const ns = root.SPREADSHEET_STORAGE_NAMESPACE || root.__SPREADSHEET_STORAGE_NAMESPACE__ || 'amazon-sheet:';
    const key = ns + ':state';
    const engine = createEngine(ROWS, COLS);
    const sheet = document.getElementById('sheet');
    const bar = document.getElementById('formulaBar');
    const nameBox = document.getElementById('nameBox');
    const cells = new Map();
    const history = [];
    const redo = [];
    let active = { row: 0, col: 0 };
    let anchor = { row: 0, col: 0 };
    let editing = null;

    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      Object.entries(saved.cells || {}).forEach(([a, v]) => engine.setCell(a, v));
      active = saved.active || active;
      anchor = saved.anchor || active;
    } catch (_) {}

    function save() {
      localStorage.setItem(key, JSON.stringify({ cells: Object.fromEntries(engine.raw), active, anchor }));
    }
    function rangeBounds() {
      return { r1: Math.min(active.row, anchor.row), r2: Math.max(active.row, anchor.row), c1: Math.min(active.col, anchor.col), c2: Math.max(active.col, anchor.col) };
    }
    function snapshot(bounds) {
      const before = [];
      for (let r = bounds.r1; r <= bounds.r2; r++) for (let c = bounds.c1; c <= bounds.c2; c++) before.push([addr(r, c), engine.getRaw(addr(r, c))]);
      return before;
    }
    function apply(entries) { entries.forEach(([a, v]) => engine.setCell(a, v)); }
    function record(before, after) { history.push({ before, after }); if (history.length > 50) history.shift(); redo.length = 0; }
    function commitRaw(a, value) {
      const before = [[a, engine.getRaw(a)]];
      const after = [[a, value]];
      apply(after); record(before, after); render(); save();
    }
    function render() {
      const b = rangeBounds();
      nameBox.textContent = addr(active.row, active.col);
      bar.value = engine.getRaw(addr(active.row, active.col));
      cells.forEach((el, key) => {
        const [r, c] = key.split(',').map(Number);
        const a = addr(r, c);
        const display = engine.getDisplay(a);
        el.textContent = display;
        el.className = 'cell';
        if (r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2) el.classList.add('in-range');
        if (r === active.row && c === active.col) el.classList.add('active');
        if (display.startsWith('#')) el.classList.add('error');
        else if (engine.getRaw(a) && !Number.isNaN(Number(display))) el.classList.add('number');
      });
    }
    function select(row, col, extend) {
      active = { row: Math.max(0, Math.min(ROWS - 1, row)), col: Math.max(0, Math.min(COLS - 1, col)) };
      if (!extend) anchor = { ...active };
      render(); save(); sheet.focus();
    }
    function startEdit(seed) {
      if (editing) return;
      const a = addr(active.row, active.col);
      const el = cells.get(active.row + ',' + active.col);
      const input = document.createElement('input');
      input.value = seed == null ? engine.getRaw(a) : seed;
      el.textContent = '';
      el.appendChild(input);
      editing = { input, original: engine.getRaw(a), address: a };
      input.focus(); input.select();
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { editing = null; render(); sheet.focus(); }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const move = e.key === 'Tab' ? [0, 1] : [1, 0]; commitRaw(a, input.value); editing = null; select(active.row + move[0], active.col + move[1], false); }
      });
    }
    function clearRange() {
      const b = rangeBounds();
      const before = snapshot(b);
      const after = before.map(([a]) => [a, '']);
      apply(after); record(before, after); render(); save();
    }
    function copyRange(cut) {
      const b = rangeBounds();
      const lines = [];
      for (let r = b.r1; r <= b.r2; r++) {
        const row = [];
        for (let c = b.c1; c <= b.c2; c++) row.push(engine.getRaw(addr(r, c)));
        lines.push(row.join('\t'));
      }
      navigator.clipboard.writeText(lines.join('\n'));
      if (cut) clearRange();
    }
    async function pasteRange() {
      const text = await navigator.clipboard.readText();
      const rows = text.split(/\r?\n/).map(line => line.split('\t'));
      const before = [];
      const after = [];
      rows.forEach((line, r) => line.forEach((value, c) => {
        const target = addr(active.row + r, active.col + c);
        before.push([target, engine.getRaw(target)]);
        after.push([target, value.startsWith('=') ? adjustFormulaForPaste(value, active.row - anchor.row + r, active.col - anchor.col + c) : value]);
      }));
      apply(after); record(before, after); render(); save();
    }
    function undoRedo(from, to, dir) {
      const item = from.pop();
      if (!item) return;
      apply(dir === 'undo' ? item.before : item.after);
      to.push(item); render(); save();
    }

    function structuralEdit(kind, index) {
      const before = Array.from(engine.raw.entries());
      engine[kind](index);
      const after = Array.from(engine.raw.entries());
      record(before, after); render(); save();
    }

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'corner' }));
    for (let c = 0; c < COLS; c++) {
      const h = Object.assign(document.createElement('div'), { className: 'col-header', textContent: indexToCol(c), title: 'Right-click: insert/delete columns' });
      h.addEventListener('contextmenu', e => {
        e.preventDefault();
        const action = prompt('Column ' + indexToCol(c) + ': type insert or delete');
        if (action === 'insert') structuralEdit('insertColumn', c);
        if (action === 'delete') structuralEdit('deleteColumn', c);
      });
      grid.appendChild(h);
    }
    for (let r = 0; r < ROWS; r++) {
      const rh = Object.assign(document.createElement('div'), { className: 'row-header', textContent: r + 1, title: 'Right-click: insert/delete rows' });
      rh.addEventListener('contextmenu', e => {
        e.preventDefault();
        const action = prompt('Row ' + (r + 1) + ': type insert or delete');
        if (action === 'insert') structuralEdit('insertRow', r);
        if (action === 'delete') structuralEdit('deleteRow', r);
      });
      grid.appendChild(rh);
      for (let c = 0; c < COLS; c++) {
        const el = document.createElement('div');
        el.className = 'cell'; el.dataset.row = r; el.dataset.col = c;
        el.addEventListener('mousedown', e => select(r, c, e.shiftKey));
        el.addEventListener('mouseenter', e => { if (e.buttons === 1) select(r, c, true); });
        el.addEventListener('dblclick', () => startEdit());
        cells.set(r + ',' + c, el); grid.appendChild(el);
      }
    }
    sheet.appendChild(grid);
    sheet.addEventListener('keydown', e => {
      if (editing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? redo : history, e.shiftKey ? history : redo, e.shiftKey ? 'redo' : 'undo'); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(redo, history, 'redo'); return; }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copyRange(false); return; }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copyRange(true); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteRange(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearRange(); return; }
      if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); startEdit(); return; }
      const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (moves[e.key]) { e.preventDefault(); select(active.row + moves[e.key][0], active.col + moves[e.key][1], e.shiftKey); return; }
      if (e.key.length === 1 && !mod) { e.preventDefault(); startEdit(e.key); }
    });
    bar.addEventListener('keydown', e => {
      if (e.key === 'Enter') { commitRaw(addr(active.row, active.col), bar.value); select(active.row + 1, active.col, false); }
      if (e.key === 'Escape') render();
    });
    bar.addEventListener('blur', () => { if (bar.value !== engine.getRaw(addr(active.row, active.col))) commitRaw(addr(active.row, active.col), bar.value); });
    render();
  }

  root.createEngine = createEngine;
  root.adjustFormulaForPaste = adjustFormulaForPaste;
  if (typeof module !== 'undefined') module.exports = { createEngine, adjustFormulaForPaste, colToIndex, indexToCol };
  if (root.document) boot();
})(typeof window === 'undefined' ? globalThis : window);
