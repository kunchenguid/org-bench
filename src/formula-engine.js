(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.FormulaEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createFormulaEngine(initialState) {
    const rawCells = new Map();
    let workbook = null;

    hydrate(initialState);

    function setCell(address, rawValue) {
      const normalized = normalizeAddress(address);

      if (rawValue === null || rawValue === undefined || rawValue === '') {
        rawCells.delete(normalized);
        return;
      }

      rawCells.set(normalized, String(rawValue));
    }

    function getRawValue(address) {
      const normalized = normalizeAddress(address);

      if (rawCells.has(normalized)) {
        return rawCells.get(normalized) || '';
      }

      if (workbook && typeof workbook.getCellRaw === 'function') {
        return String(workbook.getCellRaw(normalized) || '');
      }

      return '';
    }

    function getDisplayValue(address) {
      return evaluateCell(normalizeAddress(address), []);
    }

    function evaluateCell(address, stack) {
      if (stack.indexOf(address) !== -1) {
        return '#CIRC!';
      }

      const rawValue = getRawValue(address);

      if (!rawValue) {
        return '';
      }

      if (rawValue.charAt(0) !== '=') {
        return parseLiteral(rawValue);
      }

      const parser = createParser(rawValue.slice(1), {
        resolveReference: function (reference) {
          return evaluateCell(reference, stack.concat(address));
        },
        resolveRange: function (startAddress, endAddress) {
          return expandRange(startAddress, endAddress).map(function (reference) {
            return evaluateCell(reference, stack.concat(address));
          });
        },
      });

      try {
        const value = parser.parseExpression();
        parser.expectEnd();
        return value;
      } catch (error) {
        if (typeof error === 'string') {
          return error;
        }

        return '#ERR!';
      }
    }

    return {
      setCell: setCell,
      getRawValue: getRawValue,
      getDisplayValue: getDisplayValue,
      replaceCells: replaceCells,
    };

    function hydrate(source) {
      if (!source) {
        return;
      }

      if (source.workbook) {
        workbook = source.workbook;
        replaceCells(typeof workbook.getAllCellEntries === 'function' ? workbook.getAllCellEntries() : null);
        return;
      }

      replaceCells(source);
    }

    function replaceCells(nextCells) {
      rawCells.clear();

      if (!nextCells) {
        return;
      }

      Object.keys(nextCells).forEach(function (address) {
        if (nextCells[address] === '') {
          return;
        }

        rawCells.set(normalizeAddress(address), String(nextCells[address]));
      });
    }
  }

  function parseLiteral(rawValue) {
    const trimmed = rawValue.trim();

    if (trimmed === '') {
      return '';
    }

    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      return Number(trimmed);
    }

    return rawValue;
  }

  function createParser(source, resolvers) {
    let index = 0;

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let value = parseConcatenation();

      while (true) {
        skipWhitespace();
        const operator =
          source.slice(index, index + 2) === '<=' ||
          source.slice(index, index + 2) === '>=' ||
          source.slice(index, index + 2) === '<>'
            ? source.slice(index, index + 2)
            : source.charAt(index);

        if (operator !== '=' && operator !== '<>' && operator !== '<' && operator !== '<=' && operator !== '>' && operator !== '>=') {
          return value;
        }

        index += operator.length;
        const right = parseConcatenation();

        if (operator === '=') {
          value = compareValues(value, right) === 0;
        } else if (operator === '<>') {
          value = compareValues(value, right) !== 0;
        } else if (operator === '<') {
          value = compareValues(value, right) < 0;
        } else if (operator === '<=') {
          value = compareValues(value, right) <= 0;
        } else if (operator === '>') {
          value = compareValues(value, right) > 0;
        } else {
          value = compareValues(value, right) >= 0;
        }
      }
    }

    function parseConcatenation() {
      let value = parseAdditive();

      while (true) {
        skipWhitespace();

        if (source.charAt(index) !== '&') {
          return value;
        }

        index += 1;
        value = toDisplayText(value) + toDisplayText(parseAdditive());
      }
    }

    function parseAdditive() {
      let value = parseMultiplicative();

      while (true) {
        skipWhitespace();
        const operator = source.charAt(index);

        if (operator !== '+' && operator !== '-') {
          return value;
        }

        index += 1;
        const right = parseMultiplicative();

        value = operator === '+' ? asNumber(value) + asNumber(right) : asNumber(value) - asNumber(right);
      }
    }

    function parseMultiplicative() {
      let value = parseUnary();

      while (true) {
        skipWhitespace();
        const operator = source.charAt(index);

        if (operator !== '*' && operator !== '/') {
          return value;
        }

        index += 1;
        const right = parseUnary();

        if (operator === '/' && asNumber(right) === 0) {
          throw '#DIV/0!';
        }

        value = operator === '*' ? asNumber(value) * asNumber(right) : asNumber(value) / asNumber(right);
      }
    }

    function parseUnary() {
      skipWhitespace();

      if (source.charAt(index) === '-') {
        index += 1;
        return -asNumber(parseUnary());
      }

      return parsePrimary();
    }

    function parsePrimary() {
      skipWhitespace();
      const char = source.charAt(index);

      if (char === '(') {
        index += 1;
        const value = parseExpression();
        skipWhitespace();

        if (source.charAt(index) !== ')') {
          throw '#ERR!';
        }

        index += 1;
        return value;
      }

      const numberMatch = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/);
      if (numberMatch) {
        index += numberMatch[0].length;
        return Number(numberMatch[0]);
      }

      if (char === '"') {
        return parseString();
      }

      const cellReferenceMatch = source.slice(index).match(/^\$?[A-Za-z]+\$?\d+/);
      if (cellReferenceMatch) {
        index += cellReferenceMatch[0].length;
        skipWhitespace();

        if (source.charAt(index) === ':') {
          index += 1;
          skipWhitespace();
          const endReferenceMatch = source.slice(index).match(/^\$?[A-Za-z]+\$?\d+/);

          if (!endReferenceMatch) {
            throw '#ERR!';
          }

          index += endReferenceMatch[0].length;
          return resolvers.resolveRange(normalizeAddress(cellReferenceMatch[0]), normalizeAddress(endReferenceMatch[0]));
        }

        return resolvers.resolveReference(normalizeAddress(cellReferenceMatch[0]));
      }

      const errorMatch = source.slice(index).match(/^#(?:REF!|ERR!|DIV\/0!|CIRC!)/);
      if (errorMatch) {
        index += errorMatch[0].length;
        return errorMatch[0].toUpperCase();
      }

      const identifierMatch = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (identifierMatch) {
        const identifier = identifierMatch[0].toUpperCase();
        index += identifierMatch[0].length;
        skipWhitespace();

        if (identifier === 'TRUE') {
          return true;
        }

        if (identifier === 'FALSE') {
          return false;
        }

        if (source.charAt(index) === '(') {
          return parseFunctionCall(identifier);
        }
      }

      throw '#ERR!';
    }

    function parseFunctionCall(name) {
      const args = [];

      index += 1;
      skipWhitespace();

      if (source.charAt(index) === ')') {
        index += 1;
        return evaluateFunction(name, args);
      }

      while (index < source.length) {
        args.push(parseExpression());
        skipWhitespace();

        if (source.charAt(index) === ',') {
          index += 1;
          continue;
        }

        if (source.charAt(index) !== ')') {
          throw '#ERR!';
        }

        index += 1;
        return evaluateFunction(name, args);
      }

      throw '#ERR!';
    }

    function parseString() {
      let result = '';

      index += 1;

      while (index < source.length) {
        const char = source.charAt(index);

        if (char === '"') {
          if (source.charAt(index + 1) === '"') {
            result += '"';
            index += 2;
            continue;
          }

          index += 1;
          return result;
        }

        result += char;
        index += 1;
      }

      throw '#ERR!';
    }

    function expectEnd() {
      skipWhitespace();

      if (index !== source.length) {
        throw '#ERR!';
      }
    }

    function skipWhitespace() {
      while (index < source.length && /\s/.test(source.charAt(index))) {
        index += 1;
      }
    }

    return {
      parseExpression: parseExpression,
      expectEnd: expectEnd,
    };
  }

  function evaluateFunction(name, args) {
    const values = flattenValues(args);

    if (name === 'SUM') {
      return values.reduce(function (total, value) {
        return total + asNumber(value);
      }, 0);
    }

    if (name === 'AVERAGE') {
      if (!values.length) {
        throw '#DIV/0!';
      }

      return evaluateFunction('SUM', args) / values.length;
    }

    if (name === 'MIN') {
      return Math.min.apply(Math, values.map(asNumber));
    }

    if (name === 'MAX') {
      return Math.max.apply(Math, values.map(asNumber));
    }

    if (name === 'COUNT') {
      return values.filter(function (value) {
        if (value === '' || typeof value === 'boolean') {
          return false;
        }

        return !Number.isNaN(Number(value));
      }).length;
    }

    if (name === 'IF') {
      if (args.length < 2) {
        throw '#ERR!';
      }

      return asBoolean(args[0]) ? args[1] : args[2] === undefined ? false : args[2];
    }

    if (name === 'AND') {
      return values.every(asBoolean);
    }

    if (name === 'OR') {
      return values.some(asBoolean);
    }

    if (name === 'NOT') {
      if (args.length !== 1) {
        throw '#ERR!';
      }

      return !asBoolean(args[0]);
    }

    if (name === 'ABS') {
      if (args.length !== 1) {
        throw '#ERR!';
      }

      return Math.abs(asNumber(args[0]));
    }

    if (name === 'ROUND') {
      if (args.length < 1 || args.length > 2) {
        throw '#ERR!';
      }

      const value = asNumber(args[0]);
      const precision = args[1] === undefined ? 0 : asNumber(args[1]);
      const factor = Math.pow(10, precision);
      return Math.round(value * factor) / factor;
    }

    if (name === 'CONCAT') {
      return values.map(toDisplayText).join('');
    }

    throw '#ERR!';
  }

  function flattenValues(values) {
    return values.reduce(function (result, value) {
      if (Array.isArray(value)) {
        return result.concat(flattenValues(value));
      }

      result.push(value);
      return result;
    }, []);
  }

  function asBoolean(value) {
    if (isSpreadsheetError(value)) {
      throw value;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (value === '') {
      return false;
    }

    return Boolean(value);
  }

  function compareValues(left, right) {
    if (typeof left === 'string' || typeof right === 'string') {
      const leftText = toDisplayText(left);
      const rightText = toDisplayText(right);

      if (leftText < rightText) {
        return -1;
      }

      if (leftText > rightText) {
        return 1;
      }

      return 0;
    }

    const leftNumber = asNumber(left);
    const rightNumber = asNumber(right);

    if (leftNumber < rightNumber) {
      return -1;
    }

    if (leftNumber > rightNumber) {
      return 1;
    }

    return 0;
  }

  function toDisplayText(value) {
    if (isSpreadsheetError(value)) {
      throw value;
    }

    if (value === null || value === undefined || value === '') {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return String(value);
  }

  function expandRange(startAddress, endAddress) {
    const start = splitAddress(startAddress);
    const end = splitAddress(endAddress);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minColumn = Math.min(start.column, end.column);
    const maxColumn = Math.max(start.column, end.column);
    const cells = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        cells.push(columnNumberToName(column) + String(row));
      }
    }

    return cells;
  }

  function splitAddress(address) {
    const match = normalizeAddress(address).match(/^([A-Z]+)(\d+)$/);

    if (!match) {
      throw '#REF!';
    }

    return {
      column: columnNameToNumber(match[1]),
      row: Number(match[2]),
    };
  }

  function columnNameToNumber(name) {
    let column = 0;

    for (let i = 0; i < name.length; i += 1) {
      column = column * 26 + (name.charCodeAt(i) - 64);
    }

    return column;
  }

  function columnNumberToName(number) {
    let current = number;
    let name = '';

    while (current > 0) {
      const remainder = (current - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      current = Math.floor((current - 1) / 26);
    }

    return name;
  }

  function asNumber(value) {
    if (isSpreadsheetError(value)) {
      throw value;
    }

    if (value === '') {
      return 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw '#ERR!';
    }

    return parsed;
  }

  function normalizeAddress(address) {
    return String(address).trim().replace(/\$/g, '').toUpperCase();
  }

  function isSpreadsheetError(value) {
    return value === '#CIRC!' || value === '#ERR!' || value === '#DIV/0!' || value === '#REF!';
  }

  return {
    createFormulaEngine: createFormulaEngine,
  };
});
