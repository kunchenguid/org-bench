(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.Spreadsheet = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const CELL_REF_PATTERN = /(\$?)([A-Z]+)(\$?)(\d+)/g;

  function columnToIndex(label) {
    let value = 0;
    for (let i = 0; i < label.length; i += 1) {
      value = value * 26 + (label.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToColumn(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function normalizeAddress(address) {
    const match = /^([A-Z]+)(\d+)$/.exec(String(address).toUpperCase());
    if (!match) {
      throw new Error('Bad address');
    }
    return match[1] + String(Number(match[2]));
  }

  function parseReference(text) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(text.toUpperCase());
    if (!match) {
      throw new Error('Bad reference');
    }
    return {
      colAbsolute: match[1] === '$',
      col: columnToIndex(match[2]),
      rowAbsolute: match[3] === '$',
      row: Number(match[4]) - 1,
    };
  }

  function referenceToString(ref) {
    return (ref.colAbsolute ? '$' : '') +
      indexToColumn(ref.col) +
      (ref.rowAbsolute ? '$' : '') +
      String(ref.row + 1);
  }

  function moveReference(refText, rowOffset, colOffset) {
    const ref = parseReference(refText);
    const next = {
      colAbsolute: ref.colAbsolute,
      rowAbsolute: ref.rowAbsolute,
      col: ref.colAbsolute ? ref.col : ref.col + colOffset,
      row: ref.rowAbsolute ? ref.row : ref.row + rowOffset,
    };
    return referenceToString(next);
  }

  function moveFormula(raw, rowOffset, colOffset) {
    if (typeof raw !== 'string' || raw[0] !== '=') {
      return raw;
    }
    return raw.replace(CELL_REF_PATTERN, function (match) {
      return moveReference(match, rowOffset, colOffset);
    });
  }

  function isBlank(value) {
    return value === null || value === undefined || value === '';
  }

  function isError(value) {
    return typeof value === 'string' && /^#/.test(value);
  }

  class FormulaError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }

  function asNumber(value) {
    if (isError(value)) {
      throw new FormulaError(value);
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (isBlank(value)) {
      return 0;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function asString(value) {
    if (isError(value)) {
      throw new FormulaError(value);
    }
    if (isBlank(value)) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function asBoolean(value) {
    if (isError(value)) {
      throw new FormulaError(value);
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (isBlank(value)) {
      return false;
    }
    return String(value).toUpperCase() === 'TRUE' || String(value) !== '';
  }

  function flattenValues(values) {
    const result = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        result.push.apply(result, flattenValues(value));
      } else {
        result.push(value);
      }
    });
    return result;
  }

  const FUNCTIONS = {
    SUM: function () {
      return flattenValues(Array.from(arguments)).reduce(function (sum, value) {
        return sum + asNumber(value);
      }, 0);
    },
    AVERAGE: function () {
      const items = flattenValues(Array.from(arguments));
      return items.length ? FUNCTIONS.SUM(items) / items.length : 0;
    },
    MIN: function () {
      const items = flattenValues(Array.from(arguments)).map(asNumber);
      return items.length ? Math.min.apply(Math, items) : 0;
    },
    MAX: function () {
      const items = flattenValues(Array.from(arguments)).map(asNumber);
      return items.length ? Math.max.apply(Math, items) : 0;
    },
    COUNT: function () {
      return flattenValues(Array.from(arguments)).filter(function (value) {
        return !isBlank(value);
      }).length;
    },
    IF: function (condition, yesValue, noValue) {
      return asBoolean(condition) ? yesValue : noValue;
    },
    AND: function () {
      return flattenValues(Array.from(arguments)).every(asBoolean);
    },
    OR: function () {
      return flattenValues(Array.from(arguments)).some(asBoolean);
    },
    NOT: function (value) {
      return !asBoolean(value);
    },
    ABS: function (value) {
      return Math.abs(asNumber(value));
    },
    ROUND: function (value, digits) {
      const places = asNumber(digits || 0);
      const factor = Math.pow(10, places);
      return Math.round(asNumber(value) * factor) / factor;
    },
    CONCAT: function () {
      return flattenValues(Array.from(arguments)).map(asString).join('');
    },
  };

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
          throw new FormulaError('#ERR!');
        }
        index += 1;
        tokens.push({ type: 'string', value: value });
        continue;
      }
      const two = input.slice(index, index + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        tokens.push({ type: 'op', value: two });
        index += 2;
        continue;
      }
      if ('+-*/(),:&=<>'.includes(char)) {
        tokens.push({ type: char === ',' || char === '(' || char === ')' || char === ':' ? char : 'op', value: char });
        index += 1;
        continue;
      }
      const numberMatch = /^\d+(?:\.\d+)?/.exec(input.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const wordMatch = /^\$?[A-Z]+\$?\d+|^[A-Z_]+/i.exec(input.slice(index));
      if (wordMatch) {
        tokens.push({ type: 'word', value: wordMatch[0].toUpperCase() });
        index += wordMatch[0].length;
        continue;
      }
      throw new FormulaError('#ERR!');
    }
    return tokens;
  }

  function parseFormula(input) {
    const tokens = tokenize(input);
    let index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw new FormulaError('#ERR!');
      }
      index += 1;
      return token;
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new FormulaError('#ERR!');
      }
      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: token.value };
      }
      if (token.type === 'string') {
        index += 1;
        return { type: 'string', value: token.value };
      }
      if (token.type === '(') {
        consume('(');
        const expression = parseComparison();
        consume(')');
        return expression;
      }
      if (token.type === 'op' && token.value === '-') {
        consume('op', '-');
        return { type: 'negate', value: parsePrimary() };
      }
      if (token.type === 'word') {
        index += 1;
        if (peek() && peek().type === '(') {
          consume('(');
          const args = [];
          if (!peek() || peek().type !== ')') {
            do {
              args.push(parseComparison());
              if (!peek() || peek().type !== ',') {
                break;
              }
              consume(',');
            } while (true);
          }
          consume(')');
          return { type: 'call', name: token.value, args: args };
        }
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'boolean', value: token.value === 'TRUE' };
        }
        if (peek() && peek().type === ':') {
          consume(':');
          const end = consume('word').value;
          return { type: 'range', start: token.value, end: end };
        }
        return { type: 'ref', value: token.value };
      }
      throw new FormulaError('#ERR!');
    }

    function parseTerm() {
      let node = parsePrimary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const operator = consume('op').value;
        node = { type: 'binary', operator: operator, left: node, right: parsePrimary() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseTerm();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const operator = consume('op').value;
        node = { type: 'binary', operator: operator, left: node, right: parseTerm() };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAdditive();
      while (peek() && peek().type === 'op' && peek().value === '&') {
        const operator = consume('op').value;
        node = { type: 'binary', operator: operator, left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek() && peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = consume('op').value;
        node = { type: 'binary', operator: operator, left: node, right: parseConcat() };
      }
      return node;
    }

    const tree = parseComparison();
    if (index !== tokens.length) {
      throw new FormulaError('#ERR!');
    }
    return tree;
  }

  function compareValues(left, right, operator) {
    const leftValue = typeof left === 'string' && left !== '' && Number.isNaN(Number(left)) ? left : asNumber(left);
    const rightValue = typeof right === 'string' && right !== '' && Number.isNaN(Number(right)) ? right : asNumber(right);
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
        throw new FormulaError('#ERR!');
    }
  }

  function expandRange(startRef, endRef) {
    const start = parseReference(startRef);
    const end = parseReference(endRef);
    const rowStart = Math.min(start.row, end.row);
    const rowEnd = Math.max(start.row, end.row);
    const colStart = Math.min(start.col, end.col);
    const colEnd = Math.max(start.col, end.col);
    const addresses = [];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      const currentRow = [];
      for (let col = colStart; col <= colEnd; col += 1) {
        currentRow.push(indexToColumn(col) + String(row + 1));
      }
      addresses.push(currentRow);
    }
    return addresses;
  }

  class SpreadsheetModel {
    constructor(state) {
      this.cells = Object.assign({}, state && state.cells);
    }

    setCellRaw(address, raw) {
      const key = normalizeAddress(address);
      if (raw === '' || raw === null || raw === undefined) {
        delete this.cells[key];
        return;
      }
      this.cells[key] = String(raw);
    }

    getRaw(address) {
      return this.cells[normalizeAddress(address)] || '';
    }

    evaluateAll() {
      const cache = new Map();
      const evaluating = new Set();
      const self = this;

      function evaluateNode(node) {
        switch (node.type) {
          case 'number':
          case 'string':
          case 'boolean':
            return node.value;
          case 'negate':
            return -asNumber(evaluateNode(node.value));
          case 'ref':
            return evaluateAddress(node.value);
          case 'range':
            return expandRange(node.start, node.end).map(function (row) {
              return row.map(evaluateAddress);
            });
          case 'call': {
            const fn = FUNCTIONS[node.name];
            if (!fn) {
              throw new FormulaError('#ERR!');
            }
            return fn.apply(null, node.args.map(evaluateNode));
          }
          case 'binary': {
            const left = evaluateNode(node.left);
            const right = evaluateNode(node.right);
            switch (node.operator) {
              case '+':
                return asNumber(left) + asNumber(right);
              case '-':
                return asNumber(left) - asNumber(right);
              case '*':
                return asNumber(left) * asNumber(right);
              case '/': {
                const divisor = asNumber(right);
                if (divisor === 0) {
                  throw new FormulaError('#DIV/0!');
                }
                return asNumber(left) / divisor;
              }
              case '&':
                return asString(left) + asString(right);
              default:
                return compareValues(left, right, node.operator);
            }
          }
          default:
            throw new FormulaError('#ERR!');
        }
      }

      function evaluateAddress(address) {
        const key = normalizeAddress(address);
        if (cache.has(key)) {
          return cache.get(key);
        }
        if (evaluating.has(key)) {
          throw new FormulaError('#CIRC!');
        }

        evaluating.add(key);
        try {
          const raw = self.getRaw(key);
          let value;
          if (raw === '') {
            value = '';
          } else if (raw[0] === '=') {
            value = evaluateNode(parseFormula(raw.slice(1)));
          } else if (!Number.isNaN(Number(raw)) && raw.trim() !== '') {
            value = Number(raw);
          } else {
            value = raw;
          }
          cache.set(key, value);
          return value;
        } catch (error) {
          const code = error instanceof FormulaError ? error.code : '#ERR!';
          cache.set(key, code);
          return code;
        } finally {
          evaluating.delete(key);
        }
      }

      Object.keys(this.cells).forEach(evaluateAddress);
      return { evaluateAddress: evaluateAddress };
    }

    getDisplayValue(address) {
      const value = this.evaluateAll().evaluateAddress(address);
      if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
      }
      return value === null || value === undefined ? '' : String(value);
    }

    toJSON() {
      return { cells: Object.assign({}, this.cells) };
    }

    static fromJSON(data) {
      return new SpreadsheetModel(data || { cells: {} });
    }
  }

  return {
    SpreadsheetModel: SpreadsheetModel,
    indexToColumn: indexToColumn,
    moveFormula: moveFormula,
  };
});
