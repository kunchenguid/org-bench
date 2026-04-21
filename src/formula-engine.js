(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetFormulaEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERROR = {
    GENERIC: '#ERR!',
    DIV0: '#DIV/0!',
    REF: '#REF!',
    NAME: '#NAME?',
    CIRC: '#CIRC!',
  };

  function createSpreadsheetEngine() {
    const cells = new Map();

    function setCell(address, rawContent) {
      cells.set(normalizeAddress(address), rawContent == null ? '' : String(rawContent));
    }

    function clearCell(address) {
      cells.delete(normalizeAddress(address));
    }

    function getCellInput(address) {
      return cells.get(normalizeAddress(address)) || '';
    }

    function getDisplayValue(address) {
      const evaluated = evaluateCell(normalizeAddress(address), new Map(), []);
      return evaluated.type === 'scalar' ? evaluated.value : displayTextForResult(evaluated);
    }

    function getDisplayText(address) {
      return displayTextForResult(evaluateCell(normalizeAddress(address), new Map(), []));
    }

    function evaluateCell(address, cache, stack) {
      if (cache.has(address)) {
        return cache.get(address);
      }
      if (stack.includes(address)) {
        return { type: 'error', error: ERROR.CIRC };
      }

      const raw = getCellInput(address);
      let result;

      if (!raw) {
        result = { type: 'empty', value: '' };
      } else if (raw[0] !== '=') {
        result = evaluatePrimitive(raw);
      } else {
        const nextStack = stack.concat(address);
        try {
          const tokens = tokenize(raw.slice(1));
          const parser = createParser(tokens);
          const ast = parser.parseExpression();
          parser.expectEnd();
          result = evaluateAst(ast, {
            evaluateAddress(ref) {
              return evaluateCell(ref, cache, nextStack);
            },
          });
        } catch (error) {
          result = normalizeError(error);
        }
      }

      cache.set(address, result);
      return result;
    }

    return {
      setCell,
      clearCell,
      getCellInput,
      getDisplayValue,
      getDisplayText,
    };
  }

  function evaluatePrimitive(raw) {
    const trimmed = raw.trim();
    if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
      return { type: 'scalar', value: Number(trimmed) };
    }
    if (/^TRUE$/i.test(trimmed)) {
      return { type: 'scalar', value: true };
    }
    if (/^FALSE$/i.test(trimmed)) {
      return { type: 'scalar', value: false };
    }
    return { type: 'scalar', value: raw };
  }

  function evaluateAst(node, context) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return { type: 'scalar', value: node.value };
      case 'error':
        return { type: 'error', error: node.value };
      case 'unary':
        return evaluateUnary(node, context);
      case 'binary':
        return evaluateBinary(node, context);
      case 'cell':
        return context.evaluateAddress(node.address);
      case 'range':
        return evaluateRange(node, context);
      case 'call':
        return evaluateFunction(node, context);
      default:
        throw spreadsheetError(ERROR.GENERIC);
    }
  }

  function evaluateUnary(node, context) {
    const result = evaluateAst(node.argument, context);
    if (result.type === 'error') {
      return result;
    }
    if (node.operator === '-') {
      return { type: 'scalar', value: -coerceNumber(result) };
    }
    throw spreadsheetError(ERROR.GENERIC);
  }

  function evaluateBinary(node, context) {
    const left = evaluateAst(node.left, context);
    if (left.type === 'error') {
      return left;
    }
    const right = evaluateAst(node.right, context);
    if (right.type === 'error') {
      return right;
    }

    switch (node.operator) {
      case '+':
        return { type: 'scalar', value: coerceNumber(left) + coerceNumber(right) };
      case '-':
        return { type: 'scalar', value: coerceNumber(left) - coerceNumber(right) };
      case '*':
        return { type: 'scalar', value: coerceNumber(left) * coerceNumber(right) };
      case '/':
        if (coerceNumber(right) === 0) {
          return { type: 'error', error: ERROR.DIV0 };
        }
        return { type: 'scalar', value: coerceNumber(left) / coerceNumber(right) };
      case '&':
        return { type: 'scalar', value: coerceText(left) + coerceText(right) };
      case '=':
        return { type: 'scalar', value: compareValues(left, right) === 0 };
      case '<>':
        return { type: 'scalar', value: compareValues(left, right) !== 0 };
      case '<':
        return { type: 'scalar', value: compareValues(left, right) < 0 };
      case '<=':
        return { type: 'scalar', value: compareValues(left, right) <= 0 };
      case '>':
        return { type: 'scalar', value: compareValues(left, right) > 0 };
      case '>=':
        return { type: 'scalar', value: compareValues(left, right) >= 0 };
      default:
        throw spreadsheetError(ERROR.GENERIC);
    }
  }

  function evaluateRange(node, context) {
    const start = parseAddress(node.start.address);
    const end = parseAddress(node.end.address);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const values = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        values.push(context.evaluateAddress(formatAddress({ row, col })));
      }
    }

    return { type: 'range', values };
  }

  function evaluateFunction(node, context) {
    const fn = FUNCTIONS[node.name];
    if (!fn) {
      return { type: 'error', error: ERROR.NAME };
    }
    const args = node.args.map(function (arg) {
      return evaluateAst(arg, context);
    });

    for (const arg of args) {
      if (arg.type === 'error') {
        return arg;
      }
    }

    try {
      return { type: 'scalar', value: fn(args) };
    } catch (error) {
      return normalizeError(error);
    }
  }

  const FUNCTIONS = {
    SUM(args) {
      return flattenArgs(args).reduce(function (sum, value) {
        return sum + coerceNumber(value);
      }, 0);
    },
    AVERAGE(args) {
      const values = flattenArgs(args).map(coerceNumber);
      return values.length ? values.reduce(add, 0) / values.length : 0;
    },
    MIN(args) {
      const values = flattenArgs(args).map(coerceNumber);
      return values.length ? Math.min.apply(null, values) : 0;
    },
    MAX(args) {
      const values = flattenArgs(args).map(coerceNumber);
      return values.length ? Math.max.apply(null, values) : 0;
    },
    COUNT(args) {
      return flattenArgs(args).filter(function (value) {
        return !isEmptyResult(value);
      }).length;
    },
    IF(args) {
      if (args.length < 3) {
        throw spreadsheetError(ERROR.GENERIC);
      }
      return coerceBoolean(args[0]) ? unwrapScalar(args[1]) : unwrapScalar(args[2]);
    },
    AND(args) {
      return flattenArgs(args).every(coerceBoolean);
    },
    OR(args) {
      return flattenArgs(args).some(coerceBoolean);
    },
    NOT(args) {
      if (args.length !== 1) {
        throw spreadsheetError(ERROR.GENERIC);
      }
      return !coerceBoolean(args[0]);
    },
    ABS(args) {
      if (args.length !== 1) {
        throw spreadsheetError(ERROR.GENERIC);
      }
      return Math.abs(coerceNumber(args[0]));
    },
    ROUND(args) {
      if (args.length === 0 || args.length > 2) {
        throw spreadsheetError(ERROR.GENERIC);
      }
      const value = coerceNumber(args[0]);
      const digits = args.length === 2 ? coerceNumber(args[1]) : 0;
      const factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    },
    CONCAT(args) {
      return flattenArgs(args).map(coerceText).join('');
    },
  };

  function flattenArgs(args) {
    const values = [];
    for (const arg of args) {
      if (arg.type === 'range') {
        for (const item of arg.values) {
          values.push(item);
        }
      } else {
        values.push(arg);
      }
    }
    return values;
  }

  function unwrapScalar(result) {
    if (result.type === 'range') {
      return result.values.length ? unwrapScalar(result.values[0]) : '';
    }
    if (result.type === 'empty') {
      return '';
    }
    if (result.type === 'error') {
      throw spreadsheetError(result.error);
    }
    return result.value;
  }

  function coerceNumber(result) {
    const value = unwrapScalar(result);
    if (value === '') {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      throw spreadsheetError(ERROR.GENERIC);
    }
    return number;
  }

  function coerceText(result) {
    const value = unwrapScalar(result);
    if (value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function coerceBoolean(result) {
    const value = unwrapScalar(result);
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === '') {
      return false;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function compareValues(left, right) {
    const leftValue = unwrapScalar(left);
    const rightValue = unwrapScalar(right);
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return leftValue - rightValue;
    }
    if (typeof leftValue === 'boolean' && typeof rightValue === 'boolean') {
      return Number(leftValue) - Number(rightValue);
    }
    return String(leftValue).localeCompare(String(rightValue));
  }

  function normalizeError(error) {
    if (error && error.isSpreadsheetError) {
      return { type: 'error', error: error.code };
    }
    return { type: 'error', error: ERROR.GENERIC };
  }

  function spreadsheetError(code) {
    const error = new Error(code);
    error.code = code;
    error.isSpreadsheetError = true;
    return error;
  }

  function displayTextForResult(result) {
    if (result.type === 'error') {
      return result.error;
    }
    if (result.type === 'empty') {
      return '';
    }
    if (result.type === 'range') {
      return result.values.map(displayTextForResult).join(',');
    }
    if (typeof result.value === 'boolean') {
      return result.value ? 'TRUE' : 'FALSE';
    }
    return String(result.value);
  }

  function isEmptyResult(result) {
    return result.type === 'empty' || (result.type === 'scalar' && result.value === '');
  }

  function add(a, b) {
    return a + b;
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      const rest = source.slice(index);
      const char = source[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (rest.startsWith('#DIV/0!')) {
        tokens.push({ type: 'error', value: ERROR.DIV0, raw: '#DIV/0!' });
        index += 7;
        continue;
      }
      if (rest.startsWith('#REF!')) {
        tokens.push({ type: 'error', value: ERROR.REF, raw: '#REF!' });
        index += 5;
        continue;
      }
      if (rest.startsWith('#ERR!')) {
        tokens.push({ type: 'error', value: ERROR.GENERIC, raw: '#ERR!' });
        index += 5;
        continue;
      }
      if (rest.startsWith('#NAME?')) {
        tokens.push({ type: 'error', value: ERROR.NAME, raw: '#NAME?' });
        index += 6;
        continue;
      }
      if (rest.startsWith('#CIRC!')) {
        tokens.push({ type: 'error', value: ERROR.CIRC, raw: '#CIRC!' });
        index += 6;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < source.length) {
          if (source[end] === '"') {
            if (source[end + 1] === '"') {
              value += '"';
              end += 2;
              continue;
            }
            break;
          }
          value += source[end];
          end += 1;
        }
        if (end >= source.length || source[end] !== '"') {
          throw spreadsheetError(ERROR.GENERIC);
        }
        tokens.push({ type: 'string', value, raw: source.slice(index, end + 1) });
        index = end + 1;
        continue;
      }

      const numberMatch = rest.match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]), raw: numberMatch[0] });
        index += numberMatch[0].length;
        continue;
      }

      const cellMatch = rest.match(/^\$?[A-Za-z]+\$?\d+/);
      if (cellMatch) {
        tokens.push({ type: 'cell', value: normalizeAddress(cellMatch[0]), raw: cellMatch[0] });
        index += cellMatch[0].length;
        continue;
      }

      const identMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (identMatch) {
        const ident = identMatch[0].toUpperCase();
        if (ident === 'TRUE' || ident === 'FALSE') {
          tokens.push({ type: 'boolean', value: ident === 'TRUE', raw: identMatch[0] });
        } else {
          tokens.push({ type: 'identifier', value: ident, raw: identMatch[0] });
        }
        index += identMatch[0].length;
        continue;
      }

      const twoChar = rest.slice(0, 2);
      if (twoChar === '<=' || twoChar === '>=' || twoChar === '<>') {
        tokens.push({ type: 'operator', value: twoChar, raw: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=<>(),:'.includes(char)) {
        tokens.push({ type: 'operator', value: char, raw: char });
        index += 1;
        continue;
      }

      throw spreadsheetError(ERROR.GENERIC);
    }

    return tokens;
  }

  function createParser(tokens) {
    let index = 0;

    function peek() {
      return tokens[index] || null;
    }

    function consume() {
      const token = peek();
      index += 1;
      return token;
    }

    function expectOperator(value) {
      const token = consume();
      if (!token || token.type !== 'operator' || token.value !== value) {
        throw spreadsheetError(ERROR.GENERIC);
      }
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek() && peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = consume().value;
        node = { type: 'binary', operator, left: node, right: parseConcat() };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAdditive();
      while (peek() && peek().type === 'operator' && peek().value === '&') {
        consume();
        node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
        const operator = consume().value;
        node = { type: 'binary', operator, left: node, right: parseMultiplicative() };
      }
      return node;
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (peek() && peek().type === 'operator' && (peek().value === '*' || peek().value === '/')) {
        const operator = consume().value;
        node = { type: 'binary', operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (peek() && peek().type === 'operator' && peek().value === '-') {
        consume();
        return { type: 'unary', operator: '-', argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw spreadsheetError(ERROR.GENERIC);
      }

      if (token.type === 'number' || token.type === 'string' || token.type === 'boolean' || token.type === 'error') {
        consume();
        return { type: token.type, value: token.value };
      }

      if (token.type === 'cell') {
        consume();
        const cellNode = { type: 'cell', address: token.value };
        if (peek() && peek().type === 'operator' && peek().value === ':') {
          consume();
          const right = consume();
          if (!right || right.type !== 'cell') {
            throw spreadsheetError(ERROR.GENERIC);
          }
          return { type: 'range', start: cellNode, end: { type: 'cell', address: right.value } };
        }
        return cellNode;
      }

      if (token.type === 'identifier') {
        consume();
        if (!(peek() && peek().type === 'operator' && peek().value === '(')) {
          throw spreadsheetError(ERROR.NAME);
        }
        consume();
        const args = [];
        if (!(peek() && peek().type === 'operator' && peek().value === ')')) {
          while (true) {
            args.push(parseExpression());
            if (peek() && peek().type === 'operator' && peek().value === ',') {
              consume();
              continue;
            }
            break;
          }
        }
        expectOperator(')');
        return { type: 'call', name: token.value, args };
      }

      if (token.type === 'operator' && token.value === '(') {
        consume();
        const expr = parseExpression();
        expectOperator(')');
        return expr;
      }

      throw spreadsheetError(ERROR.GENERIC);
    }

    return {
      parseExpression,
      expectEnd() {
        if (peek()) {
          throw spreadsheetError(ERROR.GENERIC);
        }
      },
    };
  }

  function shiftFormula(formula, rowOffset, colOffset) {
    return rewriteFormula(formula, function (reference) {
      return shiftReference(reference, rowOffset, colOffset);
    });
  }

  function updateFormulaForStructuralChange(formula, change) {
    return rewriteFormula(formula, function (reference) {
      return rewriteReferenceForStructure(reference, change);
    });
  }

  function rewriteFormula(formula, transformReference) {
    if (!formula || formula[0] !== '=') {
      return formula;
    }
    const tokens = tokenize(formula.slice(1));
    let output = '=';
    for (const token of tokens) {
      if (token.type === 'cell') {
        output += transformReference(token.raw);
      } else {
        output += token.raw;
      }
    }
    return output;
  }

  function shiftReference(reference, rowOffset, colOffset) {
    const parsed = parseAddress(reference);
    const nextRow = parsed.rowAbsolute ? parsed.row : Math.max(1, parsed.row + rowOffset);
    const nextCol = parsed.colAbsolute ? parsed.col : Math.max(1, parsed.col + colOffset);
    return formatAddress({
      row: nextRow,
      col: nextCol,
      rowAbsolute: parsed.rowAbsolute,
      colAbsolute: parsed.colAbsolute,
    });
  }

  function rewriteReferenceForStructure(reference, change) {
    const parsed = parseAddress(reference);
    if (change.type === 'insert-row') {
      if (!parsed.rowAbsolute && parsed.row >= change.index) {
        parsed.row += change.count;
      }
      return formatAddress(parsed);
    }
    if (change.type === 'insert-column') {
      if (!parsed.colAbsolute && parsed.col >= change.index) {
        parsed.col += change.count;
      }
      return formatAddress(parsed);
    }
    if (change.type === 'delete-row') {
      if (!parsed.rowAbsolute && parsed.row >= change.index && parsed.row < change.index + change.count) {
        return ERROR.REF;
      }
      if (!parsed.rowAbsolute && parsed.row >= change.index + change.count) {
        parsed.row -= change.count;
      }
      return formatAddress(parsed);
    }
    if (change.type === 'delete-column') {
      if (!parsed.colAbsolute && parsed.col >= change.index && parsed.col < change.index + change.count) {
        return ERROR.REF;
      }
      if (!parsed.colAbsolute && parsed.col >= change.index + change.count) {
        parsed.col -= change.count;
      }
      return formatAddress(parsed);
    }
    return reference;
  }

  function normalizeAddress(address) {
    return formatAddress(parseAddress(address));
  }

  function parseAddress(address) {
    const match = String(address).trim().toUpperCase().match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      throw spreadsheetError(ERROR.REF);
    }
    return {
      colAbsolute: match[1] === '$',
      col: columnNameToNumber(match[2]),
      rowAbsolute: match[3] === '$',
      row: Number(match[4]),
    };
  }

  function formatAddress(parts) {
    return (parts.colAbsolute ? '$' : '') + numberToColumnName(parts.col) + (parts.rowAbsolute ? '$' : '') + parts.row;
  }

  function columnNameToNumber(name) {
    let value = 0;
    for (let index = 0; index < name.length; index += 1) {
      value = value * 26 + (name.charCodeAt(index) - 64);
    }
    return value;
  }

  function numberToColumnName(value) {
    let col = value;
    let name = '';
    while (col > 0) {
      const remainder = (col - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      col = Math.floor((col - 1) / 26);
    }
    return name;
  }

  return {
    ERROR,
    createSpreadsheetEngine,
    shiftFormula,
    updateFormulaForStructuralChange,
  };
});
