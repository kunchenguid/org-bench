(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const COLUMN_COUNT = 26;
  const ROW_COUNT = 100;
  const FUNCTION_NAMES = new Set([
    'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'IF', 'AND', 'OR', 'NOT', 'ABS', 'ROUND', 'CONCAT'
  ]);

  function createSpreadsheetModel(state) {
    const cells = new Map();
    const initialCells = state && state.cells ? state.cells : {};

    Object.keys(initialCells).forEach(function (address) {
      if (initialCells[address] !== '') {
        cells.set(normalizeAddress(address), String(initialCells[address]));
      }
    });

    let selectedCell = normalizeAddress(state && state.selectedCell ? state.selectedCell : 'A1');

    function setCell(address, rawValue) {
      const normalized = normalizeAddress(address);
      const value = String(rawValue == null ? '' : rawValue);

      if (value === '') {
        cells.delete(normalized);
        return;
      }

      cells.set(normalized, value);
    }

    function getRawValue(address) {
      return cells.get(normalizeAddress(address)) || '';
    }

    function getCellValue(address) {
      return evaluateCell(normalizeAddress(address), []);
    }

    function getDisplayValue(address) {
      const value = getCellValue(address);
      return formatValue(value);
    }

    function clearCells(addresses) {
      addresses.forEach(function (address) {
        cells.delete(normalizeAddress(address));
      });
    }

    function selectCell(address) {
      selectedCell = normalizeAddress(address);
    }

    function getSelectedCell() {
      return selectedCell;
    }

    function serialize() {
      const serializedCells = {};

      Array.from(cells.keys()).sort(compareAddresses).forEach(function (address) {
        serializedCells[address] = cells.get(address);
      });

      return {
        cells: serializedCells,
        selectedCell: selectedCell
      };
    }

    function evaluateCell(address, stack) {
      if (stack.indexOf(address) !== -1) {
        return errorValue('#CIRC!');
      }

      const raw = getRawValue(address);
      if (raw === '') {
        return '';
      }

      if (raw.charAt(0) !== '=') {
        return parseLiteral(raw);
      }

      try {
        const parser = createParser(raw.slice(1), function (referenceAddress) {
          return evaluateCell(referenceAddress, stack.concat(address));
        });
        return parser.parseExpression();
      } catch (error) {
        return error && error.isSpreadsheetError ? error : errorValue('#ERR!');
      }
    }

    return {
      setCell: setCell,
      clearCells: clearCells,
      getRawValue: getRawValue,
      getCellValue: getCellValue,
      getDisplayValue: getDisplayValue,
      selectCell: selectCell,
      getSelectedCell: getSelectedCell,
      serialize: serialize
    };
  }

  function createParser(source, resolveReference) {
    let index = 0;

    function parseExpression() {
      const result = parseComparison();
      skipWhitespace();
      if (index !== source.length) {
        throw errorValue('#ERR!');
      }
      return result;
    }

    function parseComparison() {
      let left = parseConcat();

      while (true) {
        skipWhitespace();
        const operator = matchOperators(['<=', '>=', '<>', '<', '>', '=']);
        if (!operator) {
          return left;
        }

        const right = parseConcat();
        if (isError(left)) {
          return left;
        }
        if (isError(right)) {
          return right;
        }

        left = compareValues(left, right, operator);
      }
    }

    function parseConcat() {
      let left = parseAddSubtract();

      while (true) {
        skipWhitespace();
        if (!consume('&')) {
          return left;
        }

        const right = parseAddSubtract();
        if (isError(left)) {
          return left;
        }
        if (isError(right)) {
          return right;
        }

        left = toText(left) + toText(right);
      }
    }

    function parseAddSubtract() {
      let left = parseMultiplyDivide();

      while (true) {
        skipWhitespace();
        const operator = matchOperators(['+', '-']);
        if (!operator) {
          return left;
        }

        const right = parseMultiplyDivide();
        left = applyNumericBinary(left, right, operator);
      }
    }

    function parseMultiplyDivide() {
      let left = parseUnary();

      while (true) {
        skipWhitespace();
        const operator = matchOperators(['*', '/']);
        if (!operator) {
          return left;
        }

        const right = parseUnary();
        left = applyNumericBinary(left, right, operator);
      }
    }

    function parseUnary() {
      skipWhitespace();
      if (consume('-')) {
        const value = parseUnary();
        if (isError(value)) {
          return value;
        }
        return -toNumber(value);
      }

      return parsePrimary();
    }

    function parsePrimary() {
      skipWhitespace();

      if (consume('(')) {
        const value = parseComparison();
        skipWhitespace();
        if (!consume(')')) {
          throw errorValue('#ERR!');
        }
        return value;
      }

      if (peek() === '"') {
        return parseString();
      }

      const number = parseNumber();
      if (number !== null) {
        return number;
      }

      const cellReference = parseCellReference();
      if (cellReference) {
        skipWhitespace();
        if (consume(':')) {
          const rangeEnd = parseCellReference();
          if (!rangeEnd) {
            throw errorValue('#ERR!');
          }
          return expandRange(cellReference, rangeEnd).map(function (address) {
            return resolveReference(address);
          });
        }

        return resolveReference(cellReference);
      }

      const identifier = parseIdentifier();
      if (!identifier) {
        throw errorValue('#ERR!');
      }

      if (identifier === 'TRUE') {
        return true;
      }
      if (identifier === 'FALSE') {
        return false;
      }

      skipWhitespace();
      if (consume('(')) {
        const args = [];
        skipWhitespace();
        if (!consume(')')) {
          while (true) {
            args.push(parseComparison());
            skipWhitespace();
            if (consume(')')) {
              break;
            }
            if (!consume(',')) {
              throw errorValue('#ERR!');
            }
          }
        }

        return callFunction(identifier, args);
      }

      if (FUNCTION_NAMES.has(identifier)) {
        throw errorValue('#ERR!');
      }

      throw errorValue('#ERR!');
    }

    function parseString() {
      consume('"');
      let value = '';
      while (index < source.length && source.charAt(index) !== '"') {
        value += source.charAt(index);
        index += 1;
      }
      if (!consume('"')) {
        throw errorValue('#ERR!');
      }
      return value;
    }

    function parseNumber() {
      skipWhitespace();
      const remaining = source.slice(index);
      const match = remaining.match(/^\d+(?:\.\d+)?/);
      if (!match) {
        return null;
      }
      index += match[0].length;
      return Number(match[0]);
    }

    function parseIdentifier() {
      skipWhitespace();
      const remaining = source.slice(index);
      const match = remaining.match(/^[A-Za-z]+/);
      if (!match) {
        return '';
      }

      index += match[0].length;
      return match[0].toUpperCase();
    }

    function parseCellReference() {
      skipWhitespace();
      const remaining = source.slice(index);
      const match = remaining.match(/^[A-Za-z]+\d+/);
      if (!match) {
        return '';
      }
      index += match[0].length;
      try {
        return normalizeAddress(match[0].toUpperCase());
      } catch (error) {
        throw errorValue('#REF!');
      }
    }

    function callFunction(name, args) {
      const values = flatten(args);
      switch (name) {
        case 'SUM':
          return values.reduce(function (total, value) { return total + toNumber(value); }, 0);
        case 'AVERAGE':
          return values.length ? values.reduce(function (total, value) { return total + toNumber(value); }, 0) / values.length : 0;
        case 'MIN':
          return values.length ? Math.min.apply(Math, values.map(toNumber)) : 0;
        case 'MAX':
          return values.length ? Math.max.apply(Math, values.map(toNumber)) : 0;
        case 'COUNT':
          return values.filter(function (value) { return value !== ''; }).length;
        case 'IF':
          return toBoolean(args[0]) ? args[1] : (args.length > 2 ? args[2] : '');
        case 'AND':
          return values.every(toBoolean);
        case 'OR':
          return values.some(toBoolean);
        case 'NOT':
          return !toBoolean(args[0]);
        case 'ABS':
          return Math.abs(toNumber(args[0]));
        case 'ROUND':
          return roundValue(args[0], args[1]);
        case 'CONCAT':
          return values.map(toText).join('');
        default:
          throw errorValue('#ERR!');
      }
    }

    function roundValue(value, digits) {
      const precision = digits == null ? 0 : toNumber(digits);
      const factor = Math.pow(10, precision);
      return Math.round(toNumber(value) * factor) / factor;
    }

    function matchOperators(operators) {
      for (let operatorIndex = 0; operatorIndex < operators.length; operatorIndex += 1) {
        if (source.slice(index, index + operators[operatorIndex].length) === operators[operatorIndex]) {
          index += operators[operatorIndex].length;
          return operators[operatorIndex];
        }
      }
      return '';
    }

    function consume(character) {
      if (source.charAt(index) !== character) {
        return false;
      }
      index += 1;
      return true;
    }

    function skipWhitespace() {
      while (index < source.length && /\s/.test(source.charAt(index))) {
        index += 1;
      }
    }

    function peek() {
      return source.charAt(index);
    }

    return {
      parseExpression: parseExpression
    };
  }

  function parseLiteral(raw) {
    const trimmed = String(raw).trim();
    if (trimmed === '') {
      return '';
    }
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (trimmed === 'TRUE') {
      return true;
    }
    if (trimmed === 'FALSE') {
      return false;
    }
    return raw;
  }

  function normalizeAddress(address) {
    const match = String(address).toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new Error('Invalid cell address: ' + address);
    }
    const row = Number(match[2]);
    const columnIndex = lettersToColumnIndex(match[1]);
    if (row < 1 || row > ROW_COUNT || columnIndex < 0 || columnIndex >= COLUMN_COUNT) {
      throw new Error('Out of bounds cell address: ' + address);
    }
    return indexToColumnLetters(columnIndex) + String(row);
  }

  function expandRange(start, end) {
    const startPoint = addressToPoint(start);
    const endPoint = addressToPoint(end);
    const addresses = [];
    const minColumn = Math.min(startPoint.column, endPoint.column);
    const maxColumn = Math.max(startPoint.column, endPoint.column);
    const minRow = Math.min(startPoint.row, endPoint.row);
    const maxRow = Math.max(startPoint.row, endPoint.row);

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        addresses.push(pointToAddress(column, row));
      }
    }

    return addresses;
  }

  function applyNumericBinary(left, right, operator) {
    if (isError(left)) {
      return left;
    }
    if (isError(right)) {
      return right;
    }

    const a = toNumber(left);
    const b = toNumber(right);

    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? errorValue('#DIV/0!') : a / b;
      default: return errorValue('#ERR!');
    }
  }

  function compareValues(left, right, operator) {
    const a = typeof left === 'string' || typeof right === 'string' ? toText(left) : toNumber(left);
    const b = typeof left === 'string' || typeof right === 'string' ? toText(right) : toNumber(right);

    switch (operator) {
      case '=': return a === b;
      case '<>': return a !== b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default: return false;
    }
  }

  function toNumber(value) {
    if (isError(value)) {
      throw value;
    }
    if (value === '' || value == null) {
      return 0;
    }
    if (value === true) {
      return 1;
    }
    if (value === false) {
      return 0;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function toText(value) {
    if (isError(value)) {
      throw value;
    }
    if (value === '' || value == null) {
      return '';
    }
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    return String(value);
  }

  function toBoolean(value) {
    if (isError(value)) {
      throw value;
    }
    if (value === '' || value == null) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return String(value).length > 0;
  }

  function flatten(values) {
    return values.reduce(function (all, value) {
      if (Array.isArray(value)) {
        return all.concat(flatten(value));
      }
      all.push(value);
      return all;
    }, []);
  }

  function formatValue(value) {
    if (isError(value)) {
      return value.code;
    }
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (value === '' || value == null) {
      return '';
    }
    return String(value);
  }

  function isError(value) {
    return Boolean(value && value.isSpreadsheetError);
  }

  function errorValue(code) {
    return {
      isSpreadsheetError: true,
      code: code
    };
  }

  function addressToPoint(address) {
    const match = normalizeAddress(address).match(/^([A-Z]+)(\d+)$/);
    return {
      column: lettersToColumnIndex(match[1]),
      row: Number(match[2]) - 1
    };
  }

  function pointToAddress(column, row) {
    return indexToColumnLetters(column) + String(row + 1);
  }

  function lettersToColumnIndex(letters) {
    let index = 0;
    for (let characterIndex = 0; characterIndex < letters.length; characterIndex += 1) {
      index = (index * 26) + (letters.charCodeAt(characterIndex) - 64);
    }
    return index - 1;
  }

  function indexToColumnLetters(index) {
    let value = index + 1;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - 1) / 26);
    }
    return letters;
  }

  function compareAddresses(left, right) {
    const leftPoint = addressToPoint(left);
    const rightPoint = addressToPoint(right);
    return leftPoint.row - rightPoint.row || leftPoint.column - rightPoint.column;
  }

  return {
    COLUMN_COUNT: COLUMN_COUNT,
    ROW_COUNT: ROW_COUNT,
    createSpreadsheetModel: createSpreadsheetModel,
    expandRange: expandRange,
    addressToPoint: addressToPoint,
    pointToAddress: pointToAddress,
    indexToColumnLetters: indexToColumnLetters
  };
});
