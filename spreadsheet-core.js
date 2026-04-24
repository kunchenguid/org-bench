(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpreadsheetCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 26;
  const ERR = '#ERR!';
  const DIV0 = '#DIV/0!';
  const CIRC = '#CIRC!';
  const REF = '#REF!';

  function colName(col) {
    let name = '';
    let n = col + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      name = String.fromCharCode(65 + r) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function colIndex(name) {
    let n = 0;
    for (const ch of name) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function cellId(row, col) {
    return `${colName(col)}${row + 1}`;
  }

  function parseRef(ref) {
    const m = /^([$]?)([A-Z]+)([$]?)(\d+)$/.exec(ref);
    if (!m) return null;
    return { colAbs: !!m[1], col: colIndex(m[2]), rowAbs: !!m[3], row: Number(m[4]) - 1 };
  }

  function formatRef(ref) {
    if (ref.row < 0 || ref.col < 0) return REF;
    return `${ref.colAbs ? '$' : ''}${colName(ref.col)}${ref.rowAbs ? '$' : ''}${ref.row + 1}`;
  }

  function adjustFormulaReferences(raw, rowDelta, colDelta) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?[A-Z]+\$?\d+)/g, (match) => {
      const ref = parseRef(match);
      if (!ref) return match;
      if (!ref.rowAbs) ref.row += rowDelta;
      if (!ref.colAbs) ref.col += colDelta;
      return formatRef(ref);
    });
  }

  function shiftFormulaForInsert(raw, type, index, count) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?[A-Z]+\$?\d+)/g, (match) => {
      const ref = parseRef(match);
      if (!ref) return match;
      if (type === 'row' && ref.row >= index) ref.row += count;
      if (type === 'col' && ref.col >= index) ref.col += count;
      return formatRef(ref);
    });
  }

  function markDeletedRefs(raw, type, index, count) {
    if (!raw || raw[0] !== '=') return raw;
    return raw.replace(/(\$?[A-Z]+\$?\d+)/g, (match) => {
      const ref = parseRef(match);
      if (!ref) return match;
      if (type === 'row') {
        if (ref.row >= index && ref.row < index + count) return REF;
        if (ref.row >= index + count) ref.row -= count;
      }
      if (type === 'col') {
        if (ref.col >= index && ref.col < index + count) return REF;
        if (ref.col >= index + count) ref.col -= count;
      }
      return formatRef(ref);
    });
  }

  class SpreadsheetModel {
    constructor(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
      this.rows = rows;
      this.cols = cols;
      this.cells = new Map();
    }

    cloneCells() {
      return new Map(this.cells);
    }

    restoreCells(cells, rows = this.rows, cols = this.cols) {
      this.rows = rows;
      this.cols = cols;
      this.cells = new Map(cells);
    }

    key(row, col) {
      return `${row},${col}`;
    }

    getRaw(row, col) {
      return this.cells.get(this.key(row, col)) || '';
    }

    setCell(row, col, raw) {
      const key = this.key(row, col);
      const value = String(raw || '');
      if (value) this.cells.set(key, value);
      else this.cells.delete(key);
    }

    getValue(row, col, stack = new Set()) {
      const key = this.key(row, col);
      if (stack.has(key)) return { error: CIRC, value: CIRC };
      const raw = this.getRaw(row, col);
      if (!raw) return { value: 0, text: '' };
      if (raw[0] !== '=') {
        const trimmed = raw.trim();
        if (/^(TRUE|FALSE)$/i.test(trimmed)) return { value: /^TRUE$/i.test(trimmed) };
        if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return { value: Number(trimmed) };
        return { value: raw, text: raw };
      }
      stack.add(key);
      const result = evaluateFormula(raw.slice(1), this, stack);
      stack.delete(key);
      return result;
    }

    getDisplay(row, col) {
      if (!this.getRaw(row, col)) return '';
      const result = this.getValue(row, col);
      if (result.error) return result.error;
      if (typeof result.value === 'boolean') return result.value ? 'TRUE' : 'FALSE';
      if (typeof result.value === 'number') return Number.isFinite(result.value) ? String(Number(result.value.toFixed(10))) : ERR;
      return String(result.value == null ? '' : result.value);
    }

    toJSON() {
      return { rows: this.rows, cols: this.cols, cells: Array.from(this.cells.entries()) };
    }

    static fromJSON(data) {
      const model = new SpreadsheetModel(data && data.rows || DEFAULT_ROWS, data && data.cols || DEFAULT_COLS);
      if (data && Array.isArray(data.cells)) model.cells = new Map(data.cells);
      return model;
    }

    insertRow(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [row, col] = key.split(',').map(Number);
        next.set(this.key(row >= index ? row + 1 : row, col), shiftFormulaForInsert(raw, 'row', index, 1));
      }
      this.rows += 1;
      this.cells = next;
    }

    deleteRow(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [row, col] = key.split(',').map(Number);
        if (row === index) continue;
        next.set(this.key(row > index ? row - 1 : row, col), markDeletedRefs(raw, 'row', index, 1));
      }
      this.rows = Math.max(1, this.rows - 1);
      this.cells = next;
    }

    insertCol(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [row, col] = key.split(',').map(Number);
        next.set(this.key(row, col >= index ? col + 1 : col), shiftFormulaForInsert(raw, 'col', index, 1));
      }
      this.cols += 1;
      this.cells = next;
    }

    deleteCol(index) {
      const next = new Map();
      for (const [key, raw] of this.cells) {
        const [row, col] = key.split(',').map(Number);
        if (col === index) continue;
        next.set(this.key(row, col > index ? col - 1 : col), markDeletedRefs(raw, 'col', index, 1));
      }
      this.cols = Math.max(1, this.cols - 1);
      this.cells = next;
    }
  }

  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '"') {
        let value = '';
        i += 1;
        while (i < input.length && input[i] !== '"') value += input[i++];
        if (input[i] !== '"') throw new Error(ERR);
        i += 1;
        tokens.push({ type: 'string', value });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<>', '<=', '>='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&=<>(),:'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i += 1; continue; }
      const num = /^\d+(?:\.\d+)?/.exec(input.slice(i));
      if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
      const ident = /^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/i.exec(input.slice(i));
      if (ident) { tokens.push({ type: 'ident', value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      throw new Error(ERR);
    }
    return tokens;
  }

  function evaluateFormula(source, model, stack) {
    if (source.includes(REF)) return { error: REF, value: REF };
    try {
      const parser = new Parser(tokenize(source), model, stack);
      const value = parser.parseExpression();
      if (!parser.done()) return { error: ERR, value: ERR };
      if (value && value.error) return value;
      return { value };
    } catch (error) {
      const marker = [DIV0, CIRC, REF].includes(error.message) ? error.message : ERR;
      return { error: marker, value: marker };
    }
  }

  class Parser {
    constructor(tokens, model, stack) {
      this.tokens = tokens;
      this.pos = 0;
      this.model = model;
      this.stack = stack;
    }

    done() { return this.pos >= this.tokens.length; }
    peek() { return this.tokens[this.pos]; }
    take(value) {
      if (this.peek() && this.peek().value === value) { this.pos += 1; return true; }
      return false;
    }

    parseExpression() { return this.parseComparison(); }

    parseComparison() {
      let left = this.parseConcat();
      while (this.peek() && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
        const op = this.peek().value;
        this.pos += 1;
        const right = this.parseConcat();
        const a = primitive(left);
        const b = primitive(right);
        if (op === '=') left = a === b;
        if (op === '<>') left = a !== b;
        if (op === '<') left = a < b;
        if (op === '<=') left = a <= b;
        if (op === '>') left = a > b;
        if (op === '>=') left = a >= b;
      }
      return left;
    }

    parseConcat() {
      let left = this.parseAdd();
      while (this.take('&')) left = textValue(left) + textValue(this.parseAdd());
      return left;
    }

    parseAdd() {
      let left = this.parseMul();
      while (this.peek() && ['+', '-'].includes(this.peek().value)) {
        const op = this.peek().value;
        this.pos += 1;
        const right = this.parseMul();
        left = op === '+' ? numberValue(left) + numberValue(right) : numberValue(left) - numberValue(right);
      }
      return left;
    }

    parseMul() {
      let left = this.parseUnary();
      while (this.peek() && ['*', '/'].includes(this.peek().value)) {
        const op = this.peek().value;
        this.pos += 1;
        const right = numberValue(this.parseUnary());
        if (op === '/' && right === 0) throw new Error(DIV0);
        left = op === '*' ? numberValue(left) * right : numberValue(left) / right;
      }
      return left;
    }

    parseUnary() {
      if (this.take('-')) return -numberValue(this.parseUnary());
      return this.parsePrimary();
    }

    parsePrimary() {
      const token = this.peek();
      if (!token) throw new Error(ERR);
      if (this.take('(')) {
        const value = this.parseExpression();
        if (!this.take(')')) throw new Error(ERR);
        return value;
      }
      this.pos += 1;
      if (token.type === 'number' || token.type === 'string') return token.value;
      if (token.type === 'ident') {
        if (token.value === REF) throw new Error(REF);
        if (token.value === 'TRUE') return true;
        if (token.value === 'FALSE') return false;
        if (this.take('(')) return this.callFunction(token.value);
        const ref = parseRef(token.value);
        if (ref) {
          if (this.take(':')) {
            const end = this.peek();
            if (!end || end.type !== 'ident') throw new Error(ERR);
            this.pos += 1;
            return this.range(ref, parseRef(end.value));
          }
          return this.cell(ref.row, ref.col);
        }
      }
      throw new Error(ERR);
    }

    callFunction(name) {
      const args = [];
      if (!this.take(')')) {
        do args.push(this.parseExpression());
        while (this.take(','));
        if (!this.take(')')) throw new Error(ERR);
      }
      const flat = args.flatMap((value) => Array.isArray(value) ? value : [value]);
      if (name === 'SUM') return flat.reduce((sum, value) => sum + numberValue(value), 0);
      if (name === 'AVERAGE') return flat.length ? flat.reduce((sum, value) => sum + numberValue(value), 0) / flat.length : 0;
      if (name === 'MIN') return Math.min(...flat.map(numberValue));
      if (name === 'MAX') return Math.max(...flat.map(numberValue));
      if (name === 'COUNT') return flat.filter((value) => typeof primitive(value) === 'number' && !Number.isNaN(primitive(value))).length;
      if (name === 'IF') return truthy(args[0]) ? args[1] : args[2];
      if (name === 'AND') return flat.every(truthy);
      if (name === 'OR') return flat.some(truthy);
      if (name === 'NOT') return !truthy(args[0]);
      if (name === 'ABS') return Math.abs(numberValue(args[0]));
      if (name === 'ROUND') return Number(numberValue(args[0]).toFixed(args[1] == null ? 0 : numberValue(args[1])));
      if (name === 'CONCAT') return flat.map(textValue).join('');
      throw new Error(ERR);
    }

    cell(row, col) {
      if (row < 0 || col < 0 || row >= this.model.rows || col >= this.model.cols) throw new Error(REF);
      const result = this.model.getValue(row, col, this.stack);
      if (result.error) throw new Error(result.error);
      return result.value;
    }

    range(start, end) {
      if (!start || !end) throw new Error(ERR);
      const values = [];
      const rowStart = Math.min(start.row, end.row);
      const rowEnd = Math.max(start.row, end.row);
      const colStart = Math.min(start.col, end.col);
      const colEnd = Math.max(start.col, end.col);
      for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = colStart; col <= colEnd; col++) values.push(this.cell(row, col));
      }
      return values;
    }
  }

  function primitive(value) {
    return Array.isArray(value) ? primitive(value[0]) : value;
  }

  function numberValue(value) {
    const v = primitive(value);
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === '' || v == null) return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }

  function textValue(value) {
    const v = primitive(value);
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }

  function truthy(value) {
    const v = primitive(value);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return !!v;
  }

  return {
    SpreadsheetModel,
    adjustFormulaReferences,
    colName,
    colIndex,
    cellId,
    DEFAULT_ROWS,
    DEFAULT_COLS,
  };
});
