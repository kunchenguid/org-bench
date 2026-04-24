(function (root) {
  const ERR = '#ERR!';
  const CIRC = '#CIRC!';
  const DIV0 = '#DIV/0!';
  const REF = '#REF!';

  function indexToCol(index) {
    let n = index;
    let out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function colToIndex(col) {
    let n = 0;
    for (const ch of String(col).replace(/\$/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }

  function parseAddress(address) {
    const m = String(address).match(/^\$?([A-Z]+)\$?(\d+)$/i);
    if (!m) return null;
    return { row: Number(m[2]), col: colToIndex(m[1]) };
  }

  function address(row, col) {
    return indexToCol(col) + row;
  }

  function display(value) {
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value == null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 10000000000) / 10000000000) : ERR;
    return String(value);
  }

  function primitive(raw) {
    if (raw == null || raw === '') return { value: 0, display: '' };
    if (/^true$/i.test(raw)) return { value: true, display: 'TRUE' };
    if (/^false$/i.test(raw)) return { value: false, display: 'FALSE' };
    const n = Number(raw);
    if (String(raw).trim() !== '' && Number.isFinite(n)) return { value: n, display: display(n) };
    return { value: String(raw), display: String(raw) };
  }

  function tokenize(input) {
    const out = [];
    let i = String(input)[0] === '=' ? 1 : 0;
    while (i < input.length) {
      const ch = input[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === '"') {
        let s = '';
        i += 1;
        while (i < input.length) {
          if (input[i] === '"' && input[i + 1] === '"') { s += '"'; i += 2; continue; }
          if (input[i] === '"') break;
          s += input[i++];
        }
        if (input[i] !== '"') throw ERR;
        i += 1;
        out.push({ type: 'str', value: s });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) { out.push({ type: 'op', value: two }); i += 2; continue; }
      if ('+-*/&=<>(),:'.includes(ch)) { out.push({ type: ch === '(' || ch === ')' || ch === ',' || ch === ':' ? ch : 'op', value: ch }); i += 1; continue; }
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(input.slice(i));
      if (number) { out.push({ type: 'num', value: Number(number[0]) }); i += number[0].length; continue; }
      const ref = /^\$?[A-Z]+\$?\d+/i.exec(input.slice(i));
      if (ref) { out.push({ type: 'ref', value: ref[0].toUpperCase() }); i += ref[0].length; continue; }
      const id = /^[A-Z_][A-Z0-9_]*/i.exec(input.slice(i));
      if (id) { out.push({ type: 'id', value: id[0].toUpperCase() }); i += id[0].length; continue; }
      throw ERR;
    }
    return out;
  }

  function evaluateCell(cellOrRaw, host, visiting) {
    const raw = String(cellOrRaw || '').startsWith('=') ? cellOrRaw : host.getRaw(cellOrRaw);
    if (!String(raw || '').startsWith('=')) return primitive(raw || '');
    return evaluateFormula(raw, String(cellOrRaw || ''), host, visiting || []);
  }

  function evaluateFormula(formula, origin, host, visiting) {
    let tokens;
    try { tokens = tokenize(String(formula)); } catch (e) { return { value: e, display: e, error: e }; }
    let pos = 0;
    const stack = visiting ? visiting.slice() : [];
    const peek = () => tokens[pos];
    const eat = (type, value) => peek() && peek().type === type && (value === undefined || peek().value === value) ? tokens[pos++] : null;
    const need = (type, value) => { const token = eat(type, value); if (!token) throw ERR; return token; };
    const num = (value) => {
      if ([ERR, CIRC, DIV0, REF].includes(value)) throw value;
      if (value === true) return 1;
      if (value === false || value == null || value === '') return 0;
      const n = Number(value);
      if (!Number.isFinite(n)) throw '#VALUE!';
      return n;
    };
    const text = (value) => value == null ? '' : display(value);
    const bool = (value) => Boolean(num(value));
    const flat = (values) => values.flat(Infinity);

    function deref(refText) {
      const clean = refText.replace(/\$/g, '');
      const coord = parseAddress(clean);
      if (!coord || coord.row < 1 || coord.col < 1) throw REF;
      if (stack.includes(clean)) throw CIRC;
      const result = evaluateCell(clean, host, stack.concat(clean));
      if (result.error) throw result.error;
      return result.value;
    }

    function range(start, end) {
      const a = parseAddress(start.replace(/\$/g, ''));
      const b = parseAddress(end.replace(/\$/g, ''));
      if (!a || !b) throw REF;
      const values = [];
      for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row += 1) {
        for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col += 1) values.push(deref(address(row, col)));
      }
      return values;
    }

    function call(name, args) {
      const values = flat(args);
      if (name === 'SUM') return values.reduce((sum, value) => sum + num(value), 0);
      if (name === 'AVERAGE') return values.length ? call('SUM', values) / values.length : 0;
      if (name === 'MIN') return values.length ? Math.min(...values.map(num)) : 0;
      if (name === 'MAX') return values.length ? Math.max(...values.map(num)) : 0;
      if (name === 'COUNT') return values.filter((value) => value !== '' && Number.isFinite(Number(value))).length;
      if (name === 'IF') return bool(args[0]) ? args[1] : args[2];
      if (name === 'AND') return values.every(bool);
      if (name === 'OR') return values.some(bool);
      if (name === 'NOT') return !bool(args[0]);
      if (name === 'ABS') return Math.abs(num(args[0]));
      if (name === 'ROUND') return Number(num(args[0]).toFixed(args[1] == null ? 0 : num(args[1])));
      if (name === 'CONCAT') return values.map(text).join('');
      throw '#NAME?';
    }

    function primary() {
      if (eat('(')) { const v = expr(); need(')'); return v; }
      const token = tokens[pos++];
      if (!token) throw ERR;
      if (token.type === 'num' || token.type === 'str') return token.value;
      if (token.type === 'ref') {
        if (eat(':')) return range(token.value, need('ref').value);
        return deref(token.value);
      }
      if (token.type === 'id') {
        if (token.value === 'TRUE') return true;
        if (token.value === 'FALSE') return false;
        need('(');
        const args = [];
        if (!eat(')')) {
          do { args.push(expr()); } while (eat(','));
          need(')');
        }
        return call(token.value, args);
      }
      throw ERR;
    }

    function unary() { if (eat('op', '-')) return -num(unary()); return primary(); }
    function mul() {
      let value = unary();
      for (;;) {
        if (eat('op', '*')) value = num(value) * num(unary());
        else if (eat('op', '/')) { const d = num(unary()); if (d === 0) throw DIV0; value = num(value) / d; }
        else return value;
      }
    }
    function add() {
      let value = mul();
      for (;;) {
        if (eat('op', '+')) value = num(value) + num(mul());
        else if (eat('op', '-')) value = num(value) - num(mul());
        else return value;
      }
    }
    function concat() { let value = add(); while (eat('op', '&')) value = text(value) + text(add()); return value; }
    function compare() {
      let value = concat();
      while (peek() && peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const op = tokens[pos++].value;
        const right = concat();
        const leftNum = Number(value), rightNum = Number(right);
        const bothNum = Number.isFinite(leftNum) && Number.isFinite(rightNum);
        const a = bothNum ? leftNum : text(value), b = bothNum ? rightNum : text(right);
        if (op === '=') value = a === b;
        else if (op === '<>') value = a !== b;
        else if (op === '<') value = a < b;
        else if (op === '<=') value = a <= b;
        else if (op === '>') value = a > b;
        else value = a >= b;
      }
      return value;
    }
    function expr() { return compare(); }

    try {
      const value = expr();
      if (pos !== tokens.length) throw ERR;
      return { value, display: display(value) };
    } catch (e) {
      const code = typeof e === 'string' && e.startsWith('#') ? e : ERR;
      return { value: code, display: code, error: code };
    }
  }

  function shiftFormula(raw, dRow, dCol) {
    if (!String(raw || '').startsWith('=')) return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, colAbs, col, rowAbs, row) => {
      const nextCol = colAbs ? col : indexToCol(Math.max(1, colToIndex(col) + dCol));
      const nextRow = rowAbs ? row : Math.max(1, Number(row) + dRow);
      return colAbs + nextCol + rowAbs + nextRow;
    });
  }

  function adjustFormulaForInsertDelete(raw, change) {
    if (!String(raw || '').startsWith('=')) return raw;
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match, colAbs, col, rowAbs, row) => {
      const pos = change.type === 'row' ? Number(row) : colToIndex(col);
      if (change.delta < 0 && pos >= change.index && pos < change.index - change.delta) return REF;
      let next = pos;
      if (pos >= change.index) next += change.delta;
      if (next < 1) return REF;
      return change.type === 'row' ? colAbs + col + rowAbs + next : colAbs + indexToCol(next) + rowAbs + row;
    });
  }

  const api = { indexToCol, colToIndex, parseAddress, evaluateCell, evaluateFormula, shiftFormula, adjustFormulaForInsertDelete };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
