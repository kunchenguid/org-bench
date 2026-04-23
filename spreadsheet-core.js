(function (root) {
  const COLS = 26;
  const ROWS = 100;

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

  function addr(row, col) {
    return indexToCol(col) + (row + 1);
  }

  function parseAddr(ref) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref);
    if (!m) return null;
    return { row: Number(m[2]) - 1, col: colToIndex(m[1]) };
  }

  function displayValue(value) {
    if (value && value.error) return value.error;
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value == null) return '';
    return String(value);
  }

  function scalar(value) {
    return Array.isArray(value) ? value.flat(Infinity)[0] ?? 0 : value;
  }

  function num(value) {
    value = scalar(value);
    if (value && value.error) return value;
    if (value === '' || value == null || value === false) return 0;
    if (value === true) return 1;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function bool(value) {
    value = scalar(value);
    if (value && value.error) return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return String(value || '').length > 0;
  }

  function text(value) {
    value = scalar(value);
    if (value && value.error) return value;
    return value == null ? '' : displayValue(value);
  }

  function flatten(values) {
    return values.flat(Infinity).filter(v => !(v && v.error));
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
        if (input[i] !== '"') throw '#ERR!';
        i++;
        tokens.push({ type: 'string', value: s });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/()&=<>:,'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      const numMatch = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (numMatch) { tokens.push({ type: 'number', value: Number(numMatch[0]) }); i += numMatch[0].length; continue; }
      const word = /^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/i.exec(input.slice(i));
      if (word) { tokens.push({ type: 'id', value: word[0].toUpperCase() }); i += word[0].length; continue; }
      throw '#ERR!';
    }
    return tokens;
  }

  function createSheet(rows = ROWS, cols = COLS) {
    const raw = new Map();

    function setCell(ref, value) {
      value = String(value ?? '');
      if (value) raw.set(ref.toUpperCase(), value); else raw.delete(ref.toUpperCase());
    }

    function getRaw(ref) { return raw.get(ref.toUpperCase()) || ''; }
    function entries() { return Array.from(raw.entries()); }
    function replaceAll(items) { raw.clear(); for (const [k, v] of items) if (v) raw.set(k, v); }

    function valueOf(ref, stack = []) {
      ref = ref.toUpperCase().replace(/\$/g, '');
      if (stack.includes(ref)) return { error: '#CIRC!' };
      const cellRaw = getRaw(ref);
      if (!cellRaw) return 0;
      if (cellRaw[0] !== '=') {
        const n = Number(cellRaw);
        return cellRaw.trim() !== '' && Number.isFinite(n) ? n : cellRaw;
      }
      try {
        return evalFormula(cellRaw.slice(1), stack.concat(ref));
      } catch (error) {
        return { error: typeof error === 'string' ? error : '#ERR!' };
      }
    }

    function rangeValues(a, b, stack) {
      const start = parseAddr(a.replace(/\$/g, ''));
      const end = parseAddr(b.replace(/\$/g, ''));
      if (!start || !end) throw '#REF!';
      const out = [];
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        const rowVals = [];
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) rowVals.push(valueOf(addr(r, c), stack));
        out.push(rowVals);
      }
      return out;
    }

    function evalFormula(src, stack) {
      const tokens = tokenize(src);
      let p = 0;
      const peek = () => tokens[p];
      const take = v => (peek() && peek().value === v ? (p++, true) : false);
      const expect = v => { if (!take(v)) throw '#ERR!'; };

      function call(name, args) {
        const vals = flatten(args);
        if (name === 'SUM') return vals.reduce((a, v) => a + num(v), 0);
        if (name === 'AVERAGE') return vals.length ? vals.reduce((a, v) => a + num(v), 0) / vals.length : 0;
        if (name === 'MIN') return Math.min(...vals.map(num));
        if (name === 'MAX') return Math.max(...vals.map(num));
        if (name === 'COUNT') return vals.filter(v => Number.isFinite(Number(v))).length;
        if (name === 'IF') return bool(args[0]) ? scalar(args[1]) : scalar(args[2]);
        if (name === 'AND') return args.every(v => bool(v));
        if (name === 'OR') return args.some(v => bool(v));
        if (name === 'NOT') return !bool(args[0]);
        if (name === 'ABS') return Math.abs(num(args[0]));
        if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
        if (name === 'CONCAT') return flatten(args).map(text).join('');
        throw '#NAME?';
      }

      function primary() {
        const t = peek();
        if (!t) throw '#ERR!';
        if (take('(')) { const v = compare(); expect(')'); return v; }
        if (t.type === 'number' || t.type === 'string') { p++; return t.value; }
        if (t.type === 'id') {
          p++;
          if (t.value === 'TRUE') return true;
          if (t.value === 'FALSE') return false;
          if (take('(')) {
            const args = [];
            if (!take(')')) {
              do { args.push(compare()); } while (take(','));
              expect(')');
            }
            return call(t.value, args);
          }
          if (take(':')) {
            const end = peek();
            if (!end || end.type !== 'id') throw '#REF!';
            p++;
            return rangeValues(t.value, end.value, stack);
          }
          return valueOf(t.value, stack);
        }
        throw '#ERR!';
      }

      function unary() { return take('-') ? -num(unary()) : primary(); }
      function mul() { let v = unary(); while (peek() && ['*', '/'].includes(peek().value)) { const op = tokens[p++].value; const r = num(unary()); if (op === '/' && r === 0) throw '#DIV/0!'; v = op === '*' ? num(v) * r : num(v) / r; } return v; }
      function add() { let v = mul(); while (peek() && ['+', '-'].includes(peek().value)) { const op = tokens[p++].value; const r = mul(); v = op === '+' ? num(v) + num(r) : num(v) - num(r); } return v; }
      function concat() { let v = add(); while (take('&')) v = text(v) + text(add()); return v; }
      function compare() {
        let v = concat();
        if (peek() && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
          const op = tokens[p++].value;
          const r = concat();
          if (op === '=') return v === r;
          if (op === '<>') return v !== r;
          if (op === '<') return num(v) < num(r);
          if (op === '<=') return num(v) <= num(r);
          if (op === '>') return num(v) > num(r);
          return num(v) >= num(r);
        }
        return v;
      }

      const result = compare();
      if (p < tokens.length) throw '#ERR!';
      return result;
    }

    return { rows, cols, setCell, getRaw, entries, replaceAll, valueOf, getDisplay: ref => displayValue(valueOf(ref)) };
  }

  function adjustFormulaReferences(formula, rowDelta, colDelta) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absCol, col, absRow, row) => {
      const nextCol = absCol ? colToIndex(col) : colToIndex(col) + colDelta;
      const nextRow = absRow ? Number(row) - 1 : Number(row) - 1 + rowDelta;
      if (nextCol < 0 || nextRow < 0) return '#REF!';
      return `${absCol}${indexToCol(nextCol)}${absRow}${nextRow + 1}`;
    });
  }

  function adjustFormulaForStructure(formula, type, index, delta) {
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, absCol, col, absRow, row) => {
      let c = colToIndex(col);
      let r = Number(row) - 1;
      if (type === 'row') {
        if (delta > 0 && r >= index) r++;
        if (delta < 0 && r === index) return '#REF!';
        if (delta < 0 && r > index) r--;
      } else {
        if (delta > 0 && c >= index) c++;
        if (delta < 0 && c === index) return '#REF!';
        if (delta < 0 && c > index) c--;
      }
      return `${absCol}${indexToCol(c)}${absRow}${r + 1}`;
    });
  }

  const api = { createSheet, adjustFormulaReferences, adjustFormulaForStructure, colToIndex, indexToCol, addr, parseAddr };
  if (typeof module !== 'undefined') module.exports = api;
  root.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
