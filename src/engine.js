(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.SpreadsheetEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const ERR = '#ERR!';
  const DIV0 = '#DIV/0!';
  const CIRC = '#CIRC!';

  function createEngine() {
    return {
      evaluateSheet,
    };
  }

  function evaluateSheet(inputCells) {
    const sheet = {};
    const state = new Map();

    for (const [address, cell] of Object.entries(inputCells)) {
      sheet[address] = { raw: cell.raw || '' };
    }

    function evaluateCell(address, stack) {
      const existing = state.get(address);
      if (existing) {
        if (existing.status === 'done') {
          return existing.value;
        }

        if (existing.status === 'running') {
          return errorValue(CIRC);
        }
      }

      const raw = sheet[address] ? sheet[address].raw : '';
      state.set(address, { status: 'running' });

      let value;
      if (!raw) {
        value = blankValue();
      } else if (raw[0] !== '=') {
        value = parseLiteral(raw);
      } else {
        try {
          const parser = createParser(raw.slice(1));
          const ast = parser.parse();
          value = evaluateNode(ast, stack.concat(address));
        } catch (error) {
          value = errorValue(ERR);
        }
      }

      state.set(address, { status: 'done', value });
      return value;
    }

    function evaluateNode(node, stack) {
      switch (node.type) {
        case 'number':
          return numberValue(node.value);
        case 'string':
          return stringValue(node.value);
        case 'boolean':
          return booleanValue(node.value);
        case 'unary': {
          const value = evaluateNode(node.argument, stack);
          if (isError(value)) return value;
          const numeric = toNumber(value);
          return numeric.ok ? numberValue(-numeric.value) : errorValue(ERR);
        }
        case 'binary':
          return evaluateBinary(node, stack);
        case 'reference':
          return evaluateReference(node.address, stack);
        case 'range':
          return rangeValue(expandRange(node.start, node.end).map((address) => evaluateReference(address, stack)));
        case 'call':
          return evaluateCall(node, stack);
        default:
          return errorValue(ERR);
      }
    }

    function evaluateReference(address, stack) {
      if (stack.includes(address)) {
        return errorValue(CIRC);
      }

      return evaluateCell(address, stack);
    }

    function evaluateBinary(node, stack) {
      const left = evaluateNode(node.left, stack);
      if (isError(left)) return left;
      const right = evaluateNode(node.right, stack);
      if (isError(right)) return right;

      if (node.operator === '&') {
        return stringValue(toText(left) + toText(right));
      }

      if (isComparison(node.operator)) {
        const comparison = compareValues(left, right, node.operator);
        return comparison.ok ? booleanValue(comparison.value) : errorValue(ERR);
      }

      const leftNumber = toNumber(left);
      const rightNumber = toNumber(right);
      if (!leftNumber.ok || !rightNumber.ok) {
        return errorValue(ERR);
      }

      switch (node.operator) {
        case '+':
          return numberValue(leftNumber.value + rightNumber.value);
        case '-':
          return numberValue(leftNumber.value - rightNumber.value);
        case '*':
          return numberValue(leftNumber.value * rightNumber.value);
        case '/':
          if (rightNumber.value === 0) return errorValue(DIV0);
          return numberValue(leftNumber.value / rightNumber.value);
        default:
          return errorValue(ERR);
      }
    }

    function evaluateCall(node, stack) {
      const name = node.name.toUpperCase();
      const args = node.args.map((argument) => evaluateNode(argument, stack));
      for (const argument of args) {
        if (isError(argument)) return argument;
      }

      const flat = flattenArgs(args);
      switch (name) {
        case 'SUM':
          return numericAggregate(flat, 0, (total, value) => total + value);
        case 'AVERAGE': {
          const numbers = collectNumbers(flat);
          if (!numbers.ok) return errorValue(ERR);
          if (numbers.values.length === 0) return numberValue(0);
          const total = numbers.values.reduce((sum, value) => sum + value, 0);
          return numberValue(total / numbers.values.length);
        }
        case 'MIN':
          return minMax(flat, Math.min);
        case 'MAX':
          return minMax(flat, Math.max);
        case 'COUNT':
          return numberValue(flat.filter((value) => !isBlank(value)).length);
        case 'IF':
          return args.length >= 2 && isTruthy(args[0]) ? args[1] : (args[2] || blankValue());
        case 'AND':
          return booleanValue(args.every(isTruthy));
        case 'OR':
          return booleanValue(args.some(isTruthy));
        case 'NOT':
          return booleanValue(!isTruthy(args[0] || blankValue()));
        case 'ABS': {
          const numeric = toNumber(args[0] || blankValue());
          return numeric.ok ? numberValue(Math.abs(numeric.value)) : errorValue(ERR);
        }
        case 'ROUND': {
          const numeric = toNumber(args[0] || blankValue());
          const digits = toNumber(args[1] || numberValue(0));
          if (!numeric.ok || !digits.ok) return errorValue(ERR);
          const factor = Math.pow(10, digits.value);
          return numberValue(Math.round(numeric.value * factor) / factor);
        }
        case 'CONCAT':
          return stringValue(flat.map(toText).join(''));
        default:
          return errorValue(ERR);
      }
    }

    const cells = {};
    for (const address of Object.keys(sheet)) {
      const value = evaluateCell(address, []);
      cells[address] = {
        raw: sheet[address].raw,
        value,
        display: formatDisplay(value),
      };
    }

    return { cells };
  }

  function numericAggregate(values, initial, reducer) {
    const numbers = collectNumbers(values);
    if (!numbers.ok) return errorValue(ERR);
    return numberValue(numbers.values.reduce(reducer, initial));
  }

  function minMax(values, fn) {
    const numbers = collectNumbers(values);
    if (!numbers.ok) return errorValue(ERR);
    if (numbers.values.length === 0) return numberValue(0);
    return numberValue(fn(...numbers.values));
  }

  function collectNumbers(values) {
    const result = [];
    for (const value of values) {
      const numeric = toNumber(value);
      if (!numeric.ok) return { ok: false };
      result.push(numeric.value);
    }
    return { ok: true, values: result };
  }

  function flattenArgs(values) {
    return values.flatMap((value) => (value.kind === 'range' ? value.items : [value]));
  }

  function compareValues(left, right, operator) {
    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    const comparable = leftNumber.ok && rightNumber.ok
      ? { left: leftNumber.value, right: rightNumber.value }
      : { left: toText(left), right: toText(right) };

    switch (operator) {
      case '=':
        return { ok: true, value: comparable.left === comparable.right };
      case '<>':
        return { ok: true, value: comparable.left !== comparable.right };
      case '<':
        return { ok: true, value: comparable.left < comparable.right };
      case '<=':
        return { ok: true, value: comparable.left <= comparable.right };
      case '>':
        return { ok: true, value: comparable.left > comparable.right };
      case '>=':
        return { ok: true, value: comparable.left >= comparable.right };
      default:
        return { ok: false };
    }
  }

  function isComparison(operator) {
    return operator === '=' || operator === '<>' || operator === '<' || operator === '<=' || operator === '>' || operator === '>=';
  }

  function formatDisplay(value) {
    if (value.kind === 'error') return value.code;
    if (value.kind === 'blank') return '';
    if (value.kind === 'boolean') return value.value ? 'TRUE' : 'FALSE';
    if (value.kind === 'number') return Number.isInteger(value.value) ? String(value.value) : String(Number(value.value.toFixed(10)));
    if (value.kind === 'string') return value.value;
    return ERR;
  }

  function isTruthy(value) {
    if (isError(value)) return false;
    if (value.kind === 'blank') return false;
    if (value.kind === 'boolean') return value.value;
    if (value.kind === 'number') return value.value !== 0;
    return value.kind === 'string' ? value.value.length > 0 : false;
  }

  function toNumber(value) {
    if (isError(value)) return { ok: false };
    if (value.kind === 'blank') return { ok: true, value: 0 };
    if (value.kind === 'number') return { ok: true, value: value.value };
    if (value.kind === 'boolean') return { ok: true, value: value.value ? 1 : 0 };
    if (value.kind === 'string') {
      if (value.value === '') return { ok: true, value: 0 };
      const parsed = Number(value.value);
      return Number.isNaN(parsed) ? { ok: false } : { ok: true, value: parsed };
    }
    return { ok: false };
  }

  function toText(value) {
    if (value.kind === 'blank') return '';
    if (value.kind === 'boolean') return value.value ? 'TRUE' : 'FALSE';
    if (value.kind === 'number') return formatDisplay(value);
    if (value.kind === 'string') return value.value;
    return ERR;
  }

  function isBlank(value) {
    return value.kind === 'blank' || (value.kind === 'string' && value.value === '');
  }

  function isError(value) {
    return value.kind === 'error';
  }

  function blankValue() {
    return { kind: 'blank' };
  }

  function numberValue(value) {
    return { kind: 'number', value };
  }

  function stringValue(value) {
    return { kind: 'string', value };
  }

  function booleanValue(value) {
    return { kind: 'boolean', value };
  }

  function errorValue(code) {
    return { kind: 'error', code };
  }

  function rangeValue(items) {
    return { kind: 'range', items };
  }

  function parseLiteral(raw) {
    const numeric = Number(raw);
    if (raw.trim() !== '' && !Number.isNaN(numeric)) {
      return numberValue(numeric);
    }

    return stringValue(raw);
  }

  function expandRange(start, end) {
    const startRef = splitAddress(start);
    const endRef = splitAddress(end);
    const minCol = Math.min(startRef.col, endRef.col);
    const maxCol = Math.max(startRef.col, endRef.col);
    const minRow = Math.min(startRef.row, endRef.row);
    const maxRow = Math.max(startRef.row, endRef.row);
    const addresses = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        addresses.push(makeAddress(col, row));
      }
    }

    return addresses;
  }

  function splitAddress(address) {
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(address);
    if (!match) throw new Error('Bad reference');
    return { col: columnToNumber(match[1]), row: Number(match[2]) };
  }

  function columnToNumber(label) {
    let value = 0;
    for (const char of label) {
      value = value * 26 + (char.charCodeAt(0) - 64);
    }
    return value;
  }

  function makeAddress(col, row) {
    let value = '';
    let current = col;

    while (current > 0) {
      current -= 1;
      value = String.fromCharCode(65 + (current % 26)) + value;
      current = Math.floor(current / 26);
    }

    return `${value}${row}`;
  }

  function createParser(source) {
    const tokens = tokenize(source);
    let index = 0;

    function peek() {
      return tokens[index] || { type: 'eof' };
    }

    function next() {
      const token = peek();
      index += 1;
      return token;
    }

    function expect(type, value) {
      const token = next();
      if (token.type !== type || (value && token.value !== value)) {
        throw new Error('Unexpected token');
      }
      return token;
    }

    function parse() {
      const expression = parseComparison();
      if (peek().type !== 'eof') {
        throw new Error('Trailing token');
      }
      return expression;
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek().type === 'operator' && isComparison(peek().value)) {
        const operator = next().value;
        node = { type: 'binary', operator, left: node, right: parseConcat() };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAddSub();
      while (peek().type === 'operator' && peek().value === '&') {
        const operator = next().value;
        node = { type: 'binary', operator, left: node, right: parseAddSub() };
      }
      return node;
    }

    function parseAddSub() {
      let node = parseMulDiv();
      while (peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
        const operator = next().value;
        node = { type: 'binary', operator, left: node, right: parseMulDiv() };
      }
      return node;
    }

    function parseMulDiv() {
      let node = parseUnary();
      while (peek().type === 'operator' && (peek().value === '*' || peek().value === '/')) {
        const operator = next().value;
        node = { type: 'binary', operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (peek().type === 'operator' && peek().value === '-') {
        next();
        return { type: 'unary', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = next();
      if (token.type === 'number') {
        return { type: 'number', value: token.value };
      }

      if (token.type === 'string') {
        return { type: 'string', value: token.value };
      }

      if (token.type === 'identifier') {
        if (peek().type === 'paren' && peek().value === '(') {
          next();
          const args = [];
          if (!(peek().type === 'paren' && peek().value === ')')) {
            do {
              args.push(parseComparison());
              if (peek().type === 'comma') {
                next();
              } else {
                break;
              }
            } while (true);
          }
          expect('paren', ')');
          return { type: 'call', name: token.value, args };
        }

        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'boolean', value: token.value === 'TRUE' };
        }

        if (/^[A-Z]+[1-9][0-9]*$/.test(token.value)) {
          if (peek().type === 'colon') {
            next();
            const end = expect('identifier').value;
            return { type: 'range', start: token.value, end };
          }
          return { type: 'reference', address: token.value };
        }
      }

      if (token.type === 'paren' && token.value === '(') {
        const expression = parseComparison();
        expect('paren', ')');
        return expression;
      }

      throw new Error('Unexpected token');
    }

    return { parse };
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < source.length && source[end] !== '"') {
          value += source[end];
          end += 1;
        }
        if (end >= source.length) throw new Error('Unterminated string');
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        const match = /^(\d+(?:\.\d+)?|\.\d+)/.exec(source.slice(index));
        if (!match) throw new Error('Bad number');
        tokens.push({ type: 'number', value: Number(match[1]) });
        index += match[1].length;
        continue;
      }

      if (/[A-Z]/.test(char)) {
        const match = /^[A-Z]+[1-9][0-9]*|^[A-Z]+/.exec(source.slice(index));
        tokens.push({ type: 'identifier', value: match[0] });
        index += match[0].length;
        continue;
      }

      if (char === ',') {
        tokens.push({ type: 'comma' });
        index += 1;
        continue;
      }

      if (char === ':') {
        tokens.push({ type: 'colon' });
        index += 1;
        continue;
      }

      if (char === '(' || char === ')') {
        tokens.push({ type: 'paren', value: char });
        index += 1;
        continue;
      }

      const twoChar = source.slice(index, index + 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=<>' .includes(char)) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      throw new Error('Unknown character');
    }

    return tokens;
  }

  return {
    createEngine,
  };
});
