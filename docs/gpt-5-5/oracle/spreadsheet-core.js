(function (root) {
  'use strict';

  const ERR = {
    ERROR: '#ERR!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
    CIRC: '#CIRC!',
  };

  function colToIndex(col) {
    let n = 0;
    for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }

  function indexToCol(index) {
    let out = '';
    while (index > 0) {
      const r = (index - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      index = Math.floor((index - 1) / 26);
    }
    return out;
  }

  function parseAddress(address) {
    const m = /^([A-Z]+)([1-9][0-9]*)$/.exec(String(address).toUpperCase());
    if (!m) throw new Error('Bad cell address');
    return { col: colToIndex(m[1]), row: Number(m[2]) };
  }

  function makeAddress(row, col) {
    return indexToCol(col) + row;
  }

  function addressFromCoordinates(row, col) {
    return makeAddress(row + 1, col + 1);
  }

  function parseRef(ref) {
    const m = /^\$(?=[A-Z])|^[A-Z]/.test(ref);
    const parts = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(ref.toUpperCase());
    if (!m || !parts) return null;
    return {
      colAbs: parts[1] === '$',
      col: colToIndex(parts[2]),
      rowAbs: parts[3] === '$',
      row: Number(parts[4]),
    };
  }

  function formatRef(ref) {
    if (!ref || ref.deleted || ref.row < 1 || ref.col < 1) return '#REF!';
    return (ref.colAbs ? '$' : '') + indexToCol(ref.col) + (ref.rowAbs ? '$' : '') + ref.row;
  }

  function tokenize(formula) {
    const input = formula.startsWith('=') ? formula.slice(1) : formula;
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) {
        i += 1;
      } else if (ch === '"') {
        let value = '';
        i += 1;
        while (i < input.length && input[i] !== '"') value += input[i++];
        if (input[i] !== '"') throw new Error(ERR.ERROR);
        i += 1;
        tokens.push({ type: 'string', value });
      } else if (/[0-9.]/.test(ch)) {
        const m = /^[0-9]+(?:\.[0-9]+)?|^\.[0-9]+/.exec(input.slice(i));
        if (!m) throw new Error(ERR.ERROR);
        tokens.push({ type: 'number', value: Number(m[0]) });
        i += m[0].length;
      } else if (input.slice(i, i + 2) === '<>' || input.slice(i, i + 2) === '<=' || input.slice(i, i + 2) === '>=') {
        tokens.push({ type: 'op', value: input.slice(i, i + 2) });
        i += 2;
      } else if ('+-*/&=<>():,'.includes(ch)) {
        tokens.push({ type: ch === '(' || ch === ')' || ch === ':' || ch === ',' ? ch : 'op', value: ch });
        i += 1;
      } else if (/[A-Za-z_$]/.test(ch)) {
        const m = /^\$?[A-Za-z]+\$?[0-9]+|^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
        if (!m) throw new Error(ERR.ERROR);
        tokens.push({ type: 'ident', value: m[0].toUpperCase() });
        i += m[0].length;
      } else {
        throw new Error(ERR.ERROR);
      }
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  class Parser {
    constructor(tokens) {
      this.tokens = tokens;
      this.pos = 0;
    }
    peek() { return this.tokens[this.pos]; }
    take(type, value) {
      const t = this.peek();
      if (t.type === type && (value === undefined || t.value === value)) {
        this.pos += 1;
        return t;
      }
      return null;
    }
    expect(type, value) {
      const t = this.take(type, value);
      if (!t) throw new Error(ERR.ERROR);
      return t;
    }
    parse() {
      const node = this.comparison();
      this.expect('eof');
      return node;
    }
    comparison() {
      let node = this.concat();
      while (this.peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
        const op = this.peek().value;
        this.pos += 1;
        node = { type: 'binary', op, left: node, right: this.concat() };
      }
      return node;
    }
    concat() {
      let node = this.add();
      while (this.take('op', '&')) node = { type: 'binary', op: '&', left: node, right: this.add() };
      return node;
    }
    add() {
      let node = this.mul();
      while (this.peek().type === 'op' && ['+', '-'].includes(this.peek().value)) {
        const op = this.peek().value;
        this.pos += 1;
        node = { type: 'binary', op, left: node, right: this.mul() };
      }
      return node;
    }
    mul() {
      let node = this.unary();
      while (this.peek().type === 'op' && ['*', '/'].includes(this.peek().value)) {
        const op = this.peek().value;
        this.pos += 1;
        node = { type: 'binary', op, left: node, right: this.unary() };
      }
      return node;
    }
    unary() {
      if (this.take('op', '-')) return { type: 'unary', op: '-', expr: this.unary() };
      return this.primary();
    }
    primary() {
      const t = this.peek();
      if (this.take('number')) return { type: 'number', value: t.value };
      if (this.take('string')) return { type: 'string', value: t.value };
      if (this.take('(')) {
        const node = this.comparison();
        this.expect(')');
        return node;
      }
      if (this.take('ident')) {
        if (t.value === 'TRUE' || t.value === 'FALSE') return { type: 'boolean', value: t.value === 'TRUE' };
        const ref = parseRef(t.value);
        if (ref) {
          if (this.take(':')) {
            const end = this.expect('ident').value;
            const endRef = parseRef(end);
            if (!endRef) throw new Error(ERR.ERROR);
            return { type: 'range', start: t.value, end };
          }
          return { type: 'ref', address: t.value };
        }
        this.expect('(');
        const args = [];
        if (!this.take(')')) {
          do args.push(this.comparison()); while (this.take(','));
          this.expect(')');
        }
        return { type: 'call', name: t.value, args };
      }
      throw new Error(ERR.ERROR);
    }
  }

  function numberValue(v) {
    if (v.error) throw new Error(v.error);
    if (v.type === 'empty') return 0;
    if (v.type === 'boolean') return v.value ? 1 : 0;
    if (v.type === 'number') return v.value;
    const n = Number(v.value);
    return Number.isFinite(n) ? n : 0;
  }

  function textValue(v) {
    if (v.error) throw new Error(v.error);
    if (v.type === 'empty') return '';
    if (v.type === 'boolean') return v.value ? 'TRUE' : 'FALSE';
    return String(v.value);
  }

  function boolValue(v) {
    if (v.error) throw new Error(v.error);
    if (v.type === 'boolean') return v.value;
    if (v.type === 'number') return v.value !== 0;
    return textValue(v) !== '';
  }

  function valueToDisplay(v) {
    if (!v) return '';
    if (v.error) return v.error;
    if (v.type === 'empty') return '';
    if (v.type === 'boolean') return v.value ? 'TRUE' : 'FALSE';
    return String(v.value);
  }

  function collectRefs(node, out) {
    if (!node) return out;
    if (node.type === 'ref') out.add(parseRef(node.address) ? formatRef(parseRef(node.address)).replace(/\$/g, '') : node.address);
    if (node.type === 'range') {
      for (const address of expandRange(node.start, node.end)) out.add(address);
    }
    for (const key of ['left', 'right', 'expr']) collectRefs(node[key], out);
    if (node.args) node.args.forEach((arg) => collectRefs(arg, out));
    return out;
  }

  function expandRange(start, end) {
    const a = parseRef(start);
    const b = parseRef(end);
    if (!a || !b) throw new Error(ERR.REF);
    const rows = [Math.min(a.row, b.row), Math.max(a.row, b.row)];
    const cols = [Math.min(a.col, b.col), Math.max(a.col, b.col)];
    const cells = [];
    for (let row = rows[0]; row <= rows[1]; row += 1) {
      for (let col = cols[0]; col <= cols[1]; col += 1) cells.push(makeAddress(row, col));
    }
    return cells;
  }

  class SpreadsheetCore {
    constructor(options) {
      options = options || {};
      this.rows = options.rows || 100;
      this.cols = options.cols || 26;
      this.cells = new Map();
      this.active = { row: 0, col: 0 };
    }
    setCell(address, colOrRaw, rawValue) {
      const raw = rawValue === undefined ? colOrRaw : rawValue;
      if (typeof address === 'number') address = addressFromCoordinates(address, colOrRaw);
      parseAddress(address);
      const key = address.toUpperCase();
      if (raw == null || raw === '') this.cells.delete(key);
      else this.cells.set(key, String(raw));
    }
    getRawCell(address) {
      return this.cells.get(address.toUpperCase()) || '';
    }
    getCell(row, col) {
      return this.getRawCell(addressFromCoordinates(row, col));
    }
    clearCell(row, col) {
      this.setCell(row, col, '');
    }
    snapshot() {
      const out = {};
      for (const [address, raw] of this.cells) {
        const pos = parseAddress(address);
        out[`${pos.row - 1},${pos.col - 1}`] = raw;
      }
      return out;
    }
    load(snapshot) {
      const cells = snapshot && snapshot.cells ? snapshot.cells : (snapshot || {});
      this.cells.clear();
      Object.keys(cells).forEach((key) => {
        if (key.includes(',')) {
          const parts = key.split(',').map(Number);
          this.setCell(parts[0], parts[1], cells[key]);
        } else {
          this.setCell(key, cells[key]);
        }
      });
      if (snapshot && snapshot.rows) this.rows = snapshot.rows;
      if (snapshot && snapshot.cols) this.cols = snapshot.cols;
      if (snapshot && snapshot.active) this.active = { row: snapshot.active.row, col: snapshot.active.col };
    }
    resize(rows, cols) {
      this.rows = Math.max(1, rows);
      this.cols = Math.max(1, cols);
    }
    setActive(row, col) {
      this.active = { row, col };
    }
    getDisplayValue(address) {
      return valueToDisplay(this.evaluateCell(address.toUpperCase(), new Set(), new Map()));
    }
    getDependencies(address) {
      const raw = this.getRawCell(address);
      if (!raw.startsWith('=')) return [];
      try {
        return Array.from(collectRefs(new Parser(tokenize(raw)).parse(), new Set())).sort();
      } catch (_) {
        return [];
      }
    }
    getError(address) {
      const value = this.evaluateCell(address.toUpperCase(), new Set(), new Map());
      return value.error || null;
    }
    evaluateCell(address, stack, memo) {
      const addr = parseAddress(address);
      if (addr.row > this.rows || addr.col > this.cols) return { error: ERR.REF };
      if (memo.has(address)) return memo.get(address);
      if (stack.has(address)) return { error: ERR.CIRC };
      const raw = this.getRawCell(address);
      if (raw === '') return { type: 'empty', value: '' };
      if (!raw.startsWith('=')) {
        const trimmed = raw.trim();
        const n = Number(trimmed);
        const value = trimmed !== '' && Number.isFinite(n) ? { type: 'number', value: n } : { type: 'string', value: raw };
        memo.set(address, value);
        return value;
      }
      stack.add(address);
      let value;
      try {
        value = this.evalNode(new Parser(tokenize(raw)).parse(), stack, memo);
      } catch (e) {
        value = { error: Object.values(ERR).includes(e.message) ? e.message : ERR.ERROR };
      }
      stack.delete(address);
      memo.set(address, value);
      return value;
    }
    evalNode(node, stack, memo) {
      if (node.type === 'number' || node.type === 'string' || node.type === 'boolean') return { type: node.type, value: node.value };
      if (node.type === 'unary') return { type: 'number', value: -numberValue(this.evalNode(node.expr, stack, memo)) };
      if (node.type === 'ref') {
        const ref = parseRef(node.address);
        if (!ref || ref.row > this.rows || ref.col > this.cols) throw new Error(ERR.REF);
        const address = makeAddress(ref.row, ref.col);
        const value = this.evaluateCell(address, stack, memo);
        if (value.error === ERR.CIRC) throw new Error(ERR.CIRC);
        return value;
      }
      if (node.type === 'range') return { type: 'range', values: expandRange(node.start, node.end).map((a) => this.evaluateCell(a, stack, memo)) };
      if (node.type === 'binary') return this.evalBinary(node, stack, memo);
      if (node.type === 'call') return this.evalCall(node, stack, memo);
      throw new Error(ERR.ERROR);
    }
    evalBinary(node, stack, memo) {
      const left = this.evalNode(node.left, stack, memo);
      const right = this.evalNode(node.right, stack, memo);
      if (node.op === '&') return { type: 'string', value: textValue(left) + textValue(right) };
      if (['+', '-', '*', '/'].includes(node.op)) {
        const a = numberValue(left);
        const b = numberValue(right);
        if (node.op === '/' && b === 0) throw new Error(ERR.DIV0);
        return { type: 'number', value: node.op === '+' ? a + b : node.op === '-' ? a - b : node.op === '*' ? a * b : a / b };
      }
      const a = left.type === 'string' || right.type === 'string' ? textValue(left) : numberValue(left);
      const b = left.type === 'string' || right.type === 'string' ? textValue(right) : numberValue(right);
      const ok = node.op === '=' ? a === b : node.op === '<>' ? a !== b : node.op === '<' ? a < b : node.op === '<=' ? a <= b : node.op === '>' ? a > b : a >= b;
      return { type: 'boolean', value: ok };
    }
    evalCall(node, stack, memo) {
      const name = node.name;
      if (name === 'IF') {
        if (node.args.length < 2) return { error: ERR.ERROR };
        const condition = this.evalNode(node.args[0], stack, memo);
        return boolValue(condition) ? this.evalNode(node.args[1], stack, memo) : (node.args[2] ? this.evalNode(node.args[2], stack, memo) : { type: 'empty', value: '' });
      }
      const args = node.args.map((arg) => this.evalNode(arg, stack, memo));
      const flat = args.flatMap((arg) => arg.type === 'range' ? arg.values : [arg]);
      if (flat.some((v) => v.error)) throw new Error(flat.find((v) => v.error).error);
      if (name === 'SUM') return { type: 'number', value: flat.reduce((s, v) => s + numberValue(v), 0) };
      if (name === 'AVERAGE') return { type: 'number', value: flat.length ? flat.reduce((s, v) => s + numberValue(v), 0) / flat.length : 0 };
      if (name === 'MIN') return { type: 'number', value: Math.min(...flat.map(numberValue)) };
      if (name === 'MAX') return { type: 'number', value: Math.max(...flat.map(numberValue)) };
      if (name === 'COUNT') return { type: 'number', value: flat.filter((v) => !Number.isNaN(Number(textValue(v))) && textValue(v) !== '').length };
      if (name === 'AND') return { type: 'boolean', value: flat.every(boolValue) };
      if (name === 'OR') return { type: 'boolean', value: flat.some(boolValue) };
      if (name === 'NOT') return args.length === 1 ? { type: 'boolean', value: !boolValue(args[0]) } : { error: ERR.ERROR };
      if (name === 'ABS') return args.length === 1 ? { type: 'number', value: Math.abs(numberValue(args[0])) } : { error: ERR.ERROR };
      if (name === 'ROUND') return { type: 'number', value: round(numberValue(args[0]), args[1] ? numberValue(args[1]) : 0) };
      if (name === 'CONCAT') return { type: 'string', value: flat.map(textValue).join('') };
      throw new Error(ERR.ERROR);
    }
    insertRow(row, count) { this.transformCells((addr, raw) => transformCellRow(addr, raw, row, count, false)); this.rows += count; }
    deleteRow(row, count) { this.transformCells((addr, raw) => transformCellRow(addr, raw, row, count, true)); this.rows = Math.max(1, this.rows - count); }
    insertColumn(col, count) { this.transformCells((addr, raw) => transformCellCol(addr, raw, col, count, false)); this.cols += count; }
    deleteColumn(col, count) { this.transformCells((addr, raw) => transformCellCol(addr, raw, col, count, true)); this.cols = Math.max(1, this.cols - count); }
    shiftFormulaReferences(formula, source, destination) {
      return adjustFormulaForMove(formula, addressFromCoordinates(source.row, source.col), addressFromCoordinates(destination.row, destination.col));
    }
    transformFormulaForStructureChange(formula, change) {
      if (change.type === 'insert-row') return adjustFormulaForRowInsert(formula, change.index + 1, change.count || 1);
      if (change.type === 'delete-row') return adjustFormulaForRowDelete(formula, change.index + 1, change.count || 1);
      if (change.type === 'insert-col') return adjustFormulaForColumnInsert(formula, change.index + 1, change.count || 1);
      if (change.type === 'delete-col') return adjustFormulaForColumnDelete(formula, change.index + 1, change.count || 1);
      return formula;
    }
    transformCells(fn) {
      const next = new Map();
      for (const [address, raw] of this.cells) {
        const item = fn(address, raw);
        if (item && item.address && item.raw !== '') next.set(item.address, item.raw);
      }
      this.cells = next;
    }
  }

  function round(value, places) {
    const factor = Math.pow(10, places);
    return Math.round(value * factor) / factor;
  }

  function replaceFormulaRefs(formula, mapper) {
    if (!formula.startsWith('=')) return formula;
    return formula.replace(/\$?[A-Z]+\$?[1-9][0-9]*(?::\$?[A-Z]+\$?[1-9][0-9]*)?/g, (match) => {
      if (match.includes(':')) return match.split(':').map((part) => mapper(parseRef(part))).join(':');
      return mapper(parseRef(match));
    });
  }

  function adjustFormulaForMove(formula, fromAddress, toAddress) {
    const from = parseAddress(fromAddress);
    const to = parseAddress(toAddress);
    const rowDelta = to.row - from.row;
    const colDelta = to.col - from.col;
    return replaceFormulaRefs(formula, (ref) => formatRef({
      row: ref.rowAbs ? ref.row : ref.row + rowDelta,
      col: ref.colAbs ? ref.col : ref.col + colDelta,
      rowAbs: ref.rowAbs,
      colAbs: ref.colAbs,
    }));
  }

  function adjustFormulaForRowInsert(formula, row, count) {
    return replaceFormulaRefs(formula, (ref) => formatRef({ ...ref, row: ref.row >= row ? ref.row + count : ref.row }));
  }

  function adjustFormulaForRowDelete(formula, row, count) {
    return replaceFormulaRefs(formula, (ref) => {
      if (ref.row >= row && ref.row < row + count) return '#REF!';
      return formatRef({ ...ref, row: ref.row >= row + count ? ref.row - count : ref.row });
    });
  }

  function adjustFormulaForColumnInsert(formula, col, count) {
    return replaceFormulaRefs(formula, (ref) => formatRef({ ...ref, col: ref.col >= col ? ref.col + count : ref.col }));
  }

  function adjustFormulaForColumnDelete(formula, col, count) {
    return replaceFormulaRefs(formula, (ref) => {
      if (ref.col >= col && ref.col < col + count) return '#REF!';
      return formatRef({ ...ref, col: ref.col >= col + count ? ref.col - count : ref.col });
    });
  }

  function transformCellRow(address, raw, row, count, deleting) {
    const pos = parseAddress(address);
    if (deleting && pos.row >= row && pos.row < row + count) return null;
    const nextRow = deleting ? (pos.row >= row + count ? pos.row - count : pos.row) : (pos.row >= row ? pos.row + count : pos.row);
    return { address: makeAddress(nextRow, pos.col), raw: deleting ? adjustFormulaForRowDelete(raw, row, count) : adjustFormulaForRowInsert(raw, row, count) };
  }

  function transformCellCol(address, raw, col, count, deleting) {
    const pos = parseAddress(address);
    if (deleting && pos.col >= col && pos.col < col + count) return null;
    const nextCol = deleting ? (pos.col >= col + count ? pos.col - count : pos.col) : (pos.col >= col ? pos.col + count : pos.col);
    return { address: makeAddress(pos.row, nextCol), raw: deleting ? adjustFormulaForColumnDelete(raw, col, count) : adjustFormulaForColumnInsert(raw, col, count) };
  }

  const api = {
    SpreadsheetCore,
    adjustFormulaForMove,
    adjustFormulaForRowInsert,
    adjustFormulaForRowDelete,
    adjustFormulaForColumnInsert,
    adjustFormulaForColumnDelete,
    parseAddress,
    makeAddress,
    addressFromCoordinates,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpreadsheetCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
