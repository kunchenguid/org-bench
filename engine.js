(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const ERROR_CIRC = '#CIRC!';
  const ERROR_GENERIC = '#ERR!';
  const ERROR_DIV_ZERO = '#DIV/0!';
  const MAX_ROWS = 100;
  const MAX_COLS = 26;

  function indexToColumnLabel(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function columnLabelToIndex(label) {
    let total = 0;
    for (let i = 0; i < label.length; i += 1) {
      total = total * 26 + (label.charCodeAt(i) - 64);
    }
    return total - 1;
  }

  function coordsToCellId(row, col) {
    return `${indexToColumnLabel(col)}${row + 1}`;
  }

  function cellIdToCoords(cellId) {
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cellId);
    if (!match) {
      return null;
    }
    return {
      row: Number(match[2]) - 1,
      col: columnLabelToIndex(match[1]),
    };
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
          throw new Error('Unterminated string');
        }
        index += 1;
        tokens.push({ type: 'string', value });
        continue;
      }
      const twoChar = input.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }
      if ('+-*/&(),:=<>'.includes(char)) {
        const type = char === '(' || char === ')' || char === ',' || char === ':' ? char : 'operator';
        tokens.push({ type, value: char });
        index += 1;
        continue;
      }
      const numberMatch = /^(\d+(?:\.\d+)?)/.exec(input.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[1]) });
        index += numberMatch[1].length;
        continue;
      }
      const identifierMatch = /^([A-Za-z_\$][A-Za-z0-9_\$]*)/.exec(input.slice(index));
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[1].toUpperCase() });
        index += identifierMatch[1].length;
        continue;
      }
      throw new Error(`Unexpected token ${char}`);
    }
    return tokens;
  }

  function parseFormula(formula) {
    const tokens = tokenize(formula);
    let position = 0;

    function peek(offset) {
      return tokens[position + (offset || 0)];
    }

    function consume(type, value) {
      const token = tokens[position];
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw new Error('Unexpected token');
      }
      position += 1;
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let left = parseConcatenation();
      while (peek() && peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = consume('operator').value;
        const right = parseConcatenation();
        left = { type: 'binary', operator, left, right };
      }
      return left;
    }

    function parseConcatenation() {
      let left = parseAdditive();
      while (peek() && peek().type === 'operator' && peek().value === '&') {
        consume('operator', '&');
        const right = parseAdditive();
        left = { type: 'binary', operator: '&', left, right };
      }
      return left;
    }

    function parseAdditive() {
      let left = parseMultiplicative();
      while (peek() && peek().type === 'operator' && ['+', '-'].includes(peek().value)) {
        const operator = consume('operator').value;
        const right = parseMultiplicative();
        left = { type: 'binary', operator, left, right };
      }
      return left;
    }

    function parseMultiplicative() {
      let left = parseUnary();
      while (peek() && peek().type === 'operator' && ['*', '/'].includes(peek().value)) {
        const operator = consume('operator').value;
        const right = parseUnary();
        left = { type: 'binary', operator, left, right };
      }
      return left;
    }

    function parseUnary() {
      if (peek() && peek().type === 'operator' && peek().value === '-') {
        consume('operator', '-');
        return { type: 'unary', operator: '-', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new Error('Expected expression');
      }
      if (token.type === 'number') {
        consume('number');
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        consume('string');
        return { type: 'string', value: token.value };
      }
      if (token.type === 'identifier') {
        const identifier = consume('identifier').value;
        if (peek() && peek().type === '(') {
          consume('(');
          const args = [];
          if (!peek() || peek().type !== ')') {
            do {
              args.push(parseExpression());
              if (!peek() || peek().type !== ',') {
                break;
              }
              consume(',');
            } while (true);
          }
          consume(')');
          return { type: 'call', name: identifier, args };
        }
        if (identifier === 'TRUE' || identifier === 'FALSE') {
          return { type: 'boolean', value: identifier === 'TRUE' };
        }
        if (/^\$?[A-Z]+\$?\d+$/.test(identifier)) {
          const start = { type: 'ref', value: identifier.replace(/\$/g, '') };
          if (peek() && peek().type === ':') {
            consume(':');
            const endToken = consume('identifier').value;
            return {
              type: 'range',
              start: start.value,
              end: endToken.replace(/\$/g, ''),
            };
          }
          return start;
        }
        throw new Error('Unknown identifier');
      }
      if (token.type === '(') {
        consume('(');
        const expr = parseExpression();
        consume(')');
        return expr;
      }
      throw new Error('Unexpected token');
    }

    const expression = parseExpression();
    if (position !== tokens.length) {
      throw new Error('Trailing tokens');
    }
    return expression;
  }

  function flatten(values) {
    const output = [];
    values.forEach((value) => {
      if (Array.isArray(value)) {
        output.push(...flatten(value));
      } else {
        output.push(value);
      }
    });
    return output;
  }

  function toNumber(value) {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '') {
      return 0;
    }
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    return 0;
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.map(toText).join('');
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function compareValues(left, right, operator) {
    const leftValue = typeof left === 'string' || typeof right === 'string' ? toText(left) : toNumber(left);
    const rightValue = typeof left === 'string' || typeof right === 'string' ? toText(right) : toNumber(right);
    switch (operator) {
      case '=':
        return leftValue === rightValue;
      case '<>':
        return leftValue !== rightValue;
      case '<':
        return leftValue < rightValue;
      case '<=':
        return leftValue <= rightValue;
      case '>':
        return leftValue > rightValue;
      case '>=':
        return leftValue >= rightValue;
      default:
        throw new Error('Unsupported comparison');
    }
  }

  function evaluateFunction(name, args) {
    const flatArgs = flatten(args);
    switch (name) {
      case 'SUM':
        return flatArgs.reduce((sum, value) => sum + toNumber(value), 0);
      case 'AVERAGE':
        return flatArgs.length ? flatArgs.reduce((sum, value) => sum + toNumber(value), 0) / flatArgs.length : 0;
      case 'MIN':
        return flatArgs.length ? Math.min(...flatArgs.map(toNumber)) : 0;
      case 'MAX':
        return flatArgs.length ? Math.max(...flatArgs.map(toNumber)) : 0;
      case 'COUNT':
        return flatArgs.filter((value) => value !== '').length;
      case 'ABS':
        return Math.abs(toNumber(args[0]));
      case 'ROUND':
        return Number(toNumber(args[0]).toFixed(Math.max(0, toNumber(args[1] || 0))));
      case 'IF':
        return args[0] ? args[1] : args[2];
      case 'AND':
        return flatArgs.every(Boolean);
      case 'OR':
        return flatArgs.some(Boolean);
      case 'NOT':
        return !args[0];
      case 'CONCAT':
        return flatArgs.map(toText).join('');
      default:
        throw new Error('Unknown function');
    }
  }

  class SpreadsheetEngine {
    constructor(snapshot) {
      this.cells = new Map();
      this.selection = { row: 0, col: 0 };
      if (snapshot) {
        Object.entries(snapshot.cells || {}).forEach(([cellId, value]) => {
          if (value !== '') {
            this.cells.set(cellId, String(value));
          }
        });
        if (snapshot.selection) {
          this.selection = {
            row: Math.max(0, Math.min(MAX_ROWS - 1, snapshot.selection.row || 0)),
            col: Math.max(0, Math.min(MAX_COLS - 1, snapshot.selection.col || 0)),
          };
        }
      }
    }

    static fromSnapshot(snapshot) {
      return new SpreadsheetEngine(snapshot);
    }

    setSelection(selection) {
      this.selection = {
        row: Math.max(0, Math.min(MAX_ROWS - 1, selection.row)),
        col: Math.max(0, Math.min(MAX_COLS - 1, selection.col)),
      };
    }

    getSelection() {
      return { row: this.selection.row, col: this.selection.col };
    }

    setCell(cellId, rawValue) {
      const value = String(rawValue || '');
      if (value === '') {
        this.cells.delete(cellId);
      } else {
        this.cells.set(cellId, value);
      }
    }

    getCellInput(cellId) {
      return this.cells.get(cellId) || '';
    }

    evaluateCell(cellId, stack, cache) {
      if (cache[cellId]) {
        return cache[cellId];
      }
      if (stack.includes(cellId)) {
        return { type: 'error', value: ERROR_CIRC };
      }
      const raw = this.getCellInput(cellId);
      if (!raw) {
        return { type: 'empty', value: '' };
      }
      if (!raw.startsWith('=')) {
        const numeric = Number(raw);
        const result = Number.isNaN(numeric) ? { type: 'text', value: raw } : { type: 'number', value: numeric };
        cache[cellId] = result;
        return result;
      }
      try {
        const ast = parseFormula(raw.slice(1));
        const result = this.evaluateNode(ast, stack.concat(cellId), cache);
        cache[cellId] = result;
        return result;
      } catch (error) {
        return { type: 'error', value: error && error.message === ERROR_DIV_ZERO ? ERROR_DIV_ZERO : ERROR_GENERIC };
      }
    }

    evaluateNode(node, stack, cache) {
      if (node.type === 'number') {
        return { type: 'number', value: node.value };
      }
      if (node.type === 'string') {
        return { type: 'text', value: node.value };
      }
      if (node.type === 'boolean') {
        return { type: 'boolean', value: node.value };
      }
      if (node.type === 'ref') {
        return this.evaluateCell(node.value, stack, cache);
      }
      if (node.type === 'range') {
        return { type: 'range', value: this.evaluateRange(node.start, node.end, stack, cache) };
      }
      if (node.type === 'unary') {
        const argument = this.unwrap(this.evaluateNode(node.argument, stack, cache));
        return { type: 'number', value: -toNumber(argument) };
      }
      if (node.type === 'binary') {
        const left = this.unwrap(this.evaluateNode(node.left, stack, cache));
        const right = this.unwrap(this.evaluateNode(node.right, stack, cache));
        switch (node.operator) {
          case '+':
            return { type: 'number', value: toNumber(left) + toNumber(right) };
          case '-':
            return { type: 'number', value: toNumber(left) - toNumber(right) };
          case '*':
            return { type: 'number', value: toNumber(left) * toNumber(right) };
          case '/':
            if (toNumber(right) === 0) {
              throw new Error(ERROR_DIV_ZERO);
            }
            return { type: 'number', value: toNumber(left) / toNumber(right) };
          case '&':
            return { type: 'text', value: toText(left) + toText(right) };
          default:
            return { type: 'boolean', value: compareValues(left, right, node.operator) };
        }
      }
      if (node.type === 'call') {
        const args = node.args.map((arg) => this.unwrap(this.evaluateNode(arg, stack, cache)));
        return { type: 'value', value: evaluateFunction(node.name, args) };
      }
      throw new Error('Unsupported node');
    }

    unwrap(result) {
      if (result.type === 'error') {
        throw new Error(result.value);
      }
      if (result.type === 'range') {
        return result.value;
      }
      return result.value;
    }

    evaluateRange(startId, endId, stack, cache) {
      const start = cellIdToCoords(startId);
      const end = cellIdToCoords(endId);
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      const values = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const result = this.evaluateCell(coordsToCellId(row, col), stack, cache);
          values.push(result.type === 'empty' ? '' : result.value);
        }
      }
      return values;
    }

    getDisplayValue(cellId) {
      const result = this.evaluateCell(cellId, [], {});
      if (result.type === 'error') {
        return result.value;
      }
      return toText(result.value);
    }

    serialize() {
      const cells = {};
      this.cells.forEach((value, key) => {
        cells[key] = value;
      });
      return {
        cells,
        selection: this.getSelection(),
      };
    }
  }

  return {
    SpreadsheetEngine,
    indexToColumnLabel,
    coordsToCellId,
    cellIdToCoords,
    MAX_ROWS,
    MAX_COLS,
  };
});
