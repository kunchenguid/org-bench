(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_COLS = 26;
  const MAX_ROWS = 100;
  const ERROR = {
    CIRC: '#CIRC!',
    DIV0: '#DIV/0!',
    ERR: '#ERR!',
    REF: '#REF!',
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function indexToCol(index) {
    let value = index;
    let name = '';

    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }

    return name;
  }

  function colToIndex(label) {
    let value = 0;
    for (let index = 0; index < label.length; index += 1) {
      value = value * 26 + (label.charCodeAt(index) - 64);
    }
    return value;
  }

  function coordsToKey(row, col) {
    return indexToCol(col) + row;
  }

  function parseRefParts(ref) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
    if (!match) {
      return null;
    }

    return {
      absCol: Boolean(match[1]),
      colLabel: match[2],
      absRow: Boolean(match[3]),
      row: Number(match[4]),
    };
  }

  function shiftReference(ref, rowOffset, colOffset) {
    const parsed = parseRefParts(ref);
    if (!parsed) {
      return ref;
    }

    const nextCol = parsed.absCol ? colToIndex(parsed.colLabel) : colToIndex(parsed.colLabel) + colOffset;
    const nextRow = parsed.absRow ? parsed.row : parsed.row + rowOffset;

    const safeCol = clamp(nextCol, 1, MAX_COLS);
    const safeRow = clamp(nextRow, 1, MAX_ROWS);

    return [
      parsed.absCol ? '$' : '',
      indexToCol(safeCol),
      parsed.absRow ? '$' : '',
      safeRow,
    ].join('');
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    return formula.replace(/\$?[A-Z]+\$?\d+/g, function (match) {
      return shiftReference(match, rowOffset, colOffset);
    });
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
      const char = input[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (char === '"') {
        let value = '';
        index += 1;
        while (index < input.length && input[index] !== '"') {
          value += input[index];
          index += 1;
        }
        if (input[index] !== '"') {
          throw new Error(ERROR.ERR);
        }
        index += 1;
        tokens.push({ type: 'string', value: value });
        continue;
      }

      const twoChar = input.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'op', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=<>(),:'.includes(char)) {
        tokens.push({ type: char === ',' || char === '(' || char === ')' || char === ':' ? char : 'op', value: char });
        index += 1;
        continue;
      }

      const refMatch = /^\$?[A-Z]+\$?\d+/.exec(input.slice(index));
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0] });
        index += refMatch[0].length;
        continue;
      }

      const numberMatch = /^\d+(?:\.\d+)?/.exec(input.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }

      const identMatch = /^[A-Z_]+/.exec(input.slice(index));
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0] });
        index += identMatch[0].length;
        continue;
      }

      throw new Error(ERROR.ERR);
    }

    return tokens;
  }

  function createParser(tokens) {
    let index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (value && token.value !== value)) {
        throw new Error(ERROR.ERR);
      }
      index += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let left = parseConcat();
      while (peek() && peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = consume('op').value;
        left = { type: 'binary', operator: operator, left: left, right: parseConcat() };
      }
      return left;
    }

    function parseConcat() {
      let left = parseAdditive();
      while (peek() && peek().type === 'op' && peek().value === '&') {
        consume('op', '&');
        left = { type: 'binary', operator: '&', left: left, right: parseAdditive() };
      }
      return left;
    }

    function parseAdditive() {
      let left = parseMultiplicative();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const operator = consume('op').value;
        left = { type: 'binary', operator: operator, left: left, right: parseMultiplicative() };
      }
      return left;
    }

    function parseMultiplicative() {
      let left = parseUnary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const operator = consume('op').value;
        left = { type: 'binary', operator: operator, left: left, right: parseUnary() };
      }
      return left;
    }

    function parseUnary() {
      if (peek() && peek().type === 'op' && peek().value === '-') {
        consume('op', '-');
        return { type: 'unary', operator: '-', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new Error(ERROR.ERR);
      }

      if (token.type === 'number') {
        consume('number');
        return { type: 'number', value: token.value };
      }

      if (token.type === 'string') {
        consume('string');
        return { type: 'string', value: token.value };
      }

      if (token.type === 'ref') {
        const ref = consume('ref').value;
        if (peek() && peek().type === ':') {
          consume(':');
          const end = consume('ref').value;
          return { type: 'range', start: ref, end: end };
        }
        return { type: 'ref', value: ref };
      }

      if (token.type === 'ident') {
        const ident = consume('ident').value;
        if (ident === 'TRUE' || ident === 'FALSE') {
          return { type: 'boolean', value: ident === 'TRUE' };
        }
        consume('(');
        const args = [];
        if (!peek() || peek().type !== ')') {
          args.push(parseExpression());
          while (peek() && peek().type === ',') {
            consume(',');
            args.push(parseExpression());
          }
        }
        consume(')');
        return { type: 'func', name: ident, args: args };
      }

      if (token.type === '(') {
        consume('(');
        const value = parseExpression();
        consume(')');
        return value;
      }

      throw new Error(ERROR.ERR);
    }

    const result = parseExpression();
    if (index !== tokens.length) {
      throw new Error(ERROR.ERR);
    }
    return result;
  }

  function flatten(values) {
    return values.flat ? values.flat(Infinity) : values.reduce(function (acc, item) {
      return acc.concat(Array.isArray(item) ? flatten(item) : item);
    }, []);
  }

  function coerceNumber(value) {
    if (value === '' || value === null || typeof value === 'undefined') {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      throw new Error(ERROR.ERR);
    }
    return number;
  }

  function coerceBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function formatDisplay(value) {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ERROR.ERR;
      }
      return String(Number(value.toFixed(10)));
    }
    return value == null ? '' : String(value);
  }

  function createEngine(initialCells) {
    const raw = Object.assign({}, initialCells || {});

    function getRawValue(address) {
      return raw[address] || '';
    }

    function setCell(address, value) {
      if (value === '') {
        delete raw[address];
        return;
      }
      raw[address] = value;
    }

    function getAllRaw() {
      return Object.assign({}, raw);
    }

    function evaluateAddress(address, stack, cache) {
      if (cache[address]) {
        return cache[address];
      }
      if (stack.indexOf(address) >= 0) {
        return { error: ERROR.CIRC };
      }
      const nextStack = stack.concat(address);
      const result = evaluateRaw(getRawValue(address), nextStack, cache);
      cache[address] = result;
      return result;
    }

    function evaluateRange(startRef, endRef, stack, cache) {
      const start = parseRefParts(startRef);
      const end = parseRefParts(endRef);
      if (!start || !end) {
        throw new Error(ERROR.REF);
      }

      const startRow = Math.min(start.row, end.row);
      const endRow = Math.max(start.row, end.row);
      const startCol = Math.min(colToIndex(start.colLabel), colToIndex(end.colLabel));
      const endCol = Math.max(colToIndex(start.colLabel), colToIndex(end.colLabel));
      const values = [];

      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          const result = evaluateAddress(coordsToKey(row, col), stack, cache);
          if (result.error) {
            throw new Error(result.error);
          }
          values.push(result.value);
        }
      }

      return values;
    }

    function evaluateNode(node, stack, cache) {
      switch (node.type) {
        case 'number':
        case 'string':
        case 'boolean':
          return node.value;
        case 'ref': {
          const result = evaluateAddress(node.value.replace(/\$/g, ''), stack, cache);
          if (result.error) {
            throw new Error(result.error);
          }
          return result.value;
        }
        case 'range':
          return evaluateRange(node.start, node.end, stack, cache);
        case 'unary':
          return -coerceNumber(evaluateNode(node.value, stack, cache));
        case 'binary': {
          const left = evaluateNode(node.left, stack, cache);
          const right = evaluateNode(node.right, stack, cache);
          switch (node.operator) {
            case '+':
              return coerceNumber(left) + coerceNumber(right);
            case '-':
              return coerceNumber(left) - coerceNumber(right);
            case '*':
              return coerceNumber(left) * coerceNumber(right);
            case '/': {
              const divisor = coerceNumber(right);
              if (divisor === 0) {
                throw new Error(ERROR.DIV0);
              }
              return coerceNumber(left) / divisor;
            }
            case '&':
              return formatDisplay(left === 0 && getRawValue(node.left.value || '') === '' ? '' : left) + formatDisplay(right === 0 && getRawValue(node.right.value || '') === '' ? '' : right);
            case '=':
              return left === right;
            case '<>':
              return left !== right;
            case '<':
              return left < right;
            case '<=':
              return left <= right;
            case '>':
              return left > right;
            case '>=':
              return left >= right;
            default:
              throw new Error(ERROR.ERR);
          }
        }
        case 'func': {
          const values = node.args.map(function (arg) {
            return evaluateNode(arg, stack, cache);
          });
          const flat = flatten(values);
          switch (node.name) {
            case 'SUM':
              return flat.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0);
            case 'AVERAGE':
              return flat.length ? flat.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) / flat.length : 0;
            case 'MIN':
              return Math.min.apply(Math, flat.map(coerceNumber));
            case 'MAX':
              return Math.max.apply(Math, flat.map(coerceNumber));
            case 'COUNT':
              return flat.filter(function (value) { return value !== '' && !Number.isNaN(Number(value)); }).length;
            case 'IF':
              return coerceBoolean(values[0]) ? values[1] : values[2];
            case 'AND':
              return flat.every(coerceBoolean);
            case 'OR':
              return flat.some(coerceBoolean);
            case 'NOT':
              return !coerceBoolean(values[0]);
            case 'ABS':
              return Math.abs(coerceNumber(values[0]));
            case 'ROUND':
              return Number(coerceNumber(values[0]).toFixed(values[1] == null ? 0 : coerceNumber(values[1])));
            case 'CONCAT':
              return flat.map(formatDisplay).join('');
            default:
              throw new Error(ERROR.ERR);
          }
        }
        default:
          throw new Error(ERROR.ERR);
      }
    }

    function evaluateRaw(rawValue, stack, cache) {
      if (!rawValue) {
        return { value: '' };
      }
      if (rawValue[0] !== '=') {
        const numeric = Number(rawValue);
        if (!Number.isNaN(numeric) && rawValue.trim() !== '') {
          return { value: numeric };
        }
        return { value: rawValue };
      }

      try {
        const expression = createParser(tokenize(rawValue.slice(1)));
        return { value: evaluateNode(expression, stack, cache) };
      } catch (error) {
        return { error: error && error.message ? error.message : ERROR.ERR };
      }
    }

    function getDisplayValue(address) {
      const result = evaluateAddress(address, [], {});
      return result.error || formatDisplay(result.value);
    }

    function copyRawBlock(bounds) {
      const rows = [];
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        const line = [];
        for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
          line.push(getRawValue(coordsToKey(row, col)));
        }
        rows.push(line);
      }
      return {
        source: { row: bounds.startRow, col: bounds.startCol },
        cells: rows,
      };
    }

    function pasteRawBlock(block, target) {
      for (let rowOffset = 0; rowOffset < block.cells.length; rowOffset += 1) {
        for (let colOffset = 0; colOffset < block.cells[rowOffset].length; colOffset += 1) {
          let value = block.cells[rowOffset][colOffset];
          if (value && value[0] === '=') {
            value = shiftFormula(value, target.row - block.source.row + rowOffset, target.col - block.source.col + colOffset);
          }
          setCell(coordsToKey(target.row + rowOffset, target.col + colOffset), value);
        }
      }
    }

    return {
      getAllRaw: getAllRaw,
      getRawValue: getRawValue,
      getDisplayValue: getDisplayValue,
      setCell: setCell,
      copyRawBlock: copyRawBlock,
      pasteRawBlock: pasteRawBlock,
      coordsToKey: coordsToKey,
      indexToCol: indexToCol,
      colToIndex: colToIndex,
      shiftFormula: shiftFormula,
      maxRows: MAX_ROWS,
      maxCols: MAX_COLS,
    };
  }

  return {
    createEngine: createEngine,
  };
});
