(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FormulaEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function columnToIndex(column) {
    let value = 0;
    for (let i = 0; i < column.length; i += 1) {
      value = value * 26 + (column.charCodeAt(i) - 64);
    }
    return value - 1;
  }

  function indexToColumn(index) {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function parseCellId(cellId) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(cellId);
    if (!match) {
      throw spreadsheetError('#REF!');
    }

    return {
      columnAbsolute: Boolean(match[1]),
      column: columnToIndex(match[2]),
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function toCellId(ref) {
    if (ref.column < 0 || ref.row < 0) {
      throw spreadsheetError('#REF!');
    }

    return (ref.columnAbsolute ? '$' : '') +
      indexToColumn(ref.column) +
      (ref.rowAbsolute ? '$' : '') +
      String(ref.row + 1);
  }

  function shiftFormula(formula, rowOffset, columnOffset) {
    return formula.replace(/\$?[A-Z]+\$?\d+/g, function (match) {
      const ref = parseCellId(match);
      return toCellId({
        columnAbsolute: ref.columnAbsolute,
        rowAbsolute: ref.rowAbsolute,
        column: ref.columnAbsolute ? ref.column : ref.column + columnOffset,
        row: ref.rowAbsolute ? ref.row : ref.row + rowOffset,
      });
    });
  }

  function spreadsheetError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
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
        if (end >= source.length) {
          throw spreadsheetError('#ERR!');
        }
        tokens.push({ type: 'string', value: value });
        index = end + 1;
        continue;
      }

      const twoChar = source.slice(index, index + 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=<>(),:'.indexOf(char) >= 0) {
        tokens.push({ type: char === ',' ? 'comma' : char === '(' || char === ')' ? 'paren' : char === ':' ? 'colon' : 'operator', value: char });
        index += 1;
        continue;
      }

      const numberMatch = /^(\d+(?:\.\d+)?)/.exec(source.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[1]) });
        index += numberMatch[1].length;
        continue;
      }

      const identifierMatch = /^(\$?[A-Z]+\$?\d+|[A-Z_][A-Z0-9_]*)/i.exec(source.slice(index));
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[1].toUpperCase() });
        index += identifierMatch[1].length;
        continue;
      }

      throw spreadsheetError('#ERR!');
    }

    return tokens;
  }

  function parseFormula(source) {
    const tokens = tokenize(source);
    let index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (value && token.value !== value)) {
        throw spreadsheetError('#ERR!');
      }
      index += 1;
      return token;
    }

    function match(type, value) {
      const token = tokens[index];
      if (token && token.type === type && (!value || token.value === value)) {
        index += 1;
        return token;
      }
      return null;
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw spreadsheetError('#ERR!');
      }

      if (match('number')) {
        return { type: 'number', value: token.value };
      }

      if (match('string')) {
        return { type: 'string', value: token.value };
      }

      if (match('paren', '(')) {
        const expression = parseComparison();
        consume('paren', ')');
        return expression;
      }

      if (token.type === 'identifier') {
        const identifier = consume('identifier').value;

        if (match('paren', '(')) {
          const args = [];
          if (!match('paren', ')')) {
            do {
              args.push(parseComparison());
            } while (match('comma'));
            consume('paren', ')');
          }
          return { type: 'call', name: identifier, args: args };
        }

        if (identifier === 'TRUE' || identifier === 'FALSE') {
          return { type: 'boolean', value: identifier === 'TRUE' };
        }

        if (/^\$?[A-Z]+\$?\d+$/.test(identifier)) {
          let node = { type: 'cell', ref: identifier };
          if (match('colon')) {
            const end = consume('identifier').value;
            if (!/^\$?[A-Z]+\$?\d+$/.test(end)) {
              throw spreadsheetError('#ERR!');
            }
            node = { type: 'range', start: identifier, end: end };
          }
          return node;
        }

        throw spreadsheetError('#ERR!');
      }

      throw spreadsheetError('#ERR!');
    }

    function parseUnary() {
      const operator = match('operator', '-');
      if (operator) {
        return { type: 'unary', operator: '-', expression: parseUnary() };
      }
      return parsePrimary();
    }

    function parseMultiply() {
      let left = parseUnary();
      while (true) {
        const operator = match('operator', '*') || match('operator', '/');
        if (!operator) {
          return left;
        }
        left = { type: 'binary', operator: operator.value, left: left, right: parseUnary() };
      }
    }

    function parseAdd() {
      let left = parseMultiply();
      while (true) {
        const operator = match('operator', '+') || match('operator', '-');
        if (!operator) {
          return left;
        }
        left = { type: 'binary', operator: operator.value, left: left, right: parseMultiply() };
      }
    }

    function parseConcat() {
      let left = parseAdd();
      while (true) {
        const operator = match('operator', '&');
        if (!operator) {
          return left;
        }
        left = { type: 'binary', operator: '&', left: left, right: parseAdd() };
      }
    }

    function parseComparison() {
      let left = parseConcat();
      while (true) {
        const operator = match('operator', '=') || match('operator', '<>') || match('operator', '<') || match('operator', '<=') || match('operator', '>') || match('operator', '>=');
        if (!operator) {
          return left;
        }
        left = { type: 'binary', operator: operator.value, left: left, right: parseConcat() };
      }
    }

    const ast = parseComparison();
    if (index !== tokens.length) {
      throw spreadsheetError('#ERR!');
    }
    return ast;
  }

  function isNumeric(value) {
    return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));
  }

  function toNumber(value) {
    if (value === '' || value == null) {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      throw spreadsheetError('#ERR!');
    }
    return numeric;
  }

  function toText(value) {
    if (value == null) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function compareValues(left, right) {
    if (isNumeric(left) && isNumeric(right)) {
      return toNumber(left) - toNumber(right);
    }
    const leftText = toText(left);
    const rightText = toText(right);
    if (leftText === rightText) {
      return 0;
    }
    return leftText < rightText ? -1 : 1;
  }

  function flatten(values) {
    const result = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        result.push.apply(result, flatten(value));
      } else {
        result.push(value);
      }
    });
    return result;
  }

  function expandRange(start, end) {
    const startRef = parseCellId(start);
    const endRef = parseCellId(end);
    const minColumn = Math.min(startRef.column, endRef.column);
    const maxColumn = Math.max(startRef.column, endRef.column);
    const minRow = Math.min(startRef.row, endRef.row);
    const maxRow = Math.max(startRef.row, endRef.row);
    const cells = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        cells.push(indexToColumn(column) + String(row + 1));
      }
    }

    return cells;
  }

  function formatDisplay(value) {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    }
    return value == null ? '' : String(value);
  }

  function evaluateFormula(raw, options) {
    options = options || {};
    const source = raw == null ? '' : String(raw);

    if (!source.startsWith('=')) {
      if (source.trim() === '') {
        return { value: '', display: '' };
      }
      if (!Number.isNaN(Number(source))) {
        const numberValue = Number(source);
        return { value: numberValue, display: formatDisplay(numberValue) };
      }
      return { value: source, display: source };
    }

    const stack = options.context && options.context.stack ? options.context.stack.slice() : [];
    if (options.cellId && stack.indexOf(options.cellId) >= 0) {
      return { error: '#CIRC!', display: '#CIRC!' };
    }
    if (options.cellId) {
      stack.push(options.cellId);
    }

    function getCellValue(ref) {
      const normalized = ref.replace(/\$/g, '');
      const rawValue = options.getCellRaw ? options.getCellRaw(normalized) : '';
      const result = evaluateFormula(rawValue, {
        cellId: normalized,
        getCellRaw: options.getCellRaw,
        context: { stack: stack },
      });
      if (result.error) {
        throw spreadsheetError(result.error);
      }
      return result.value;
    }

    function callFunction(name, args) {
      const values = flatten(args);
      switch (name) {
        case 'SUM':
          return values.reduce(function (sum, value) { return sum + toNumber(value); }, 0);
        case 'AVERAGE':
          return values.length ? values.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / values.length : 0;
        case 'MIN':
          return values.length ? Math.min.apply(Math, values.map(toNumber)) : 0;
        case 'MAX':
          return values.length ? Math.max.apply(Math, values.map(toNumber)) : 0;
        case 'COUNT':
          return values.filter(function (value) { return value !== ''; }).length;
        case 'IF':
          return args[0] ? args[1] : args[2];
        case 'AND':
          return values.every(Boolean);
        case 'OR':
          return values.some(Boolean);
        case 'NOT':
          return !args[0];
        case 'ABS':
          return Math.abs(toNumber(args[0]));
        case 'ROUND':
          return Number(toNumber(args[0]).toFixed(args.length > 1 ? toNumber(args[1]) : 0));
        case 'CONCAT':
          return values.map(toText).join('');
        default:
          throw spreadsheetError('#ERR!');
      }
    }

    function evaluateNode(node) {
      switch (node.type) {
        case 'number':
        case 'string':
        case 'boolean':
          return node.value;
        case 'cell':
          return getCellValue(node.ref);
        case 'range':
          return expandRange(node.start, node.end).map(getCellValue);
        case 'unary':
          return -toNumber(evaluateNode(node.expression));
        case 'binary': {
          const left = evaluateNode(node.left);
          const right = evaluateNode(node.right);
          switch (node.operator) {
            case '+': return toNumber(left) + toNumber(right);
            case '-': return toNumber(left) - toNumber(right);
            case '*': return toNumber(left) * toNumber(right);
            case '/': {
              const divisor = toNumber(right);
              if (divisor === 0) {
                throw spreadsheetError('#DIV/0!');
              }
              return toNumber(left) / divisor;
            }
            case '&': return toText(left) + toText(right);
            case '=': return compareValues(left, right) === 0;
            case '<>': return compareValues(left, right) !== 0;
            case '<': return compareValues(left, right) < 0;
            case '<=': return compareValues(left, right) <= 0;
            case '>': return compareValues(left, right) > 0;
            case '>=': return compareValues(left, right) >= 0;
          }
          throw spreadsheetError('#ERR!');
        }
        case 'call':
          return callFunction(node.name, node.args.map(evaluateNode));
        default:
          throw spreadsheetError('#ERR!');
      }
    }

    try {
      const ast = parseFormula(source.slice(1));
      const value = evaluateNode(ast);
      return { value: value, display: formatDisplay(value) };
    } catch (error) {
      return { error: error.code || '#ERR!', display: error.code || '#ERR!' };
    }
  }

  return {
    columnToIndex: columnToIndex,
    indexToColumn: indexToColumn,
    parseCellId: parseCellId,
    evaluateFormula: evaluateFormula,
    shiftFormula: shiftFormula,
  };
});
