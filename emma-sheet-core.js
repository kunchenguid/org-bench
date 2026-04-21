(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  root.EmmaSheetCore = exported;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const MAX_ROWS = 100;
  const MAX_COLS = 26;

  function createSheetState(initial) {
    return {
      cells: Object.assign({}, initial && initial.cells),
      selection: normalizeSelection((initial && initial.selection) || { row: 1, col: 1 }),
    };
  }

  function normalizeSelection(selection) {
    return {
      row: clamp(selection.row || 1, 1, MAX_ROWS),
      col: clamp(selection.col || 1, 1, MAX_COLS),
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setCellRaw(state, address, raw) {
    const next = createSheetState(state);
    const value = raw == null ? '' : String(raw);
    if (value) {
      next.cells[address] = value;
    } else {
      delete next.cells[address];
    }
    return next;
  }

  function moveSelection(state, rowDelta, colDelta) {
    const next = createSheetState(state);
    next.selection = normalizeSelection({
      row: next.selection.row + rowDelta,
      col: next.selection.col + colDelta,
    });
    return next;
  }

  function serializeState(state) {
    return JSON.stringify({ cells: state.cells, selection: state.selection });
  }

  function hydrateState(serialized) {
    if (!serialized) {
      return createSheetState();
    }
    try {
      return createSheetState(JSON.parse(serialized));
    } catch (_error) {
      return createSheetState();
    }
  }

  function evaluateCell(state, address) {
    return evaluateAddress(state, address, [], {});
  }

  function evaluateAddress(state, address, stack, cache) {
    if (cache[address]) {
      return cache[address];
    }
    if (stack.indexOf(address) !== -1) {
      return { kind: 'error', value: '#CIRC!', display: '#CIRC!' };
    }

    const raw = state.cells[address] || '';
    let result;
    if (!raw) {
      result = { kind: 'empty', value: 0, display: '' };
    } else if (raw[0] !== '=') {
      const numeric = Number(raw);
      result = Number.isFinite(numeric) && raw.trim() !== ''
        ? { kind: 'number', value: numeric, display: formatValue(numeric) }
        : { kind: 'text', value: raw, display: raw };
    } else {
      try {
        const parser = createParser(raw.slice(1), function (ref) {
          return evaluateAddress(state, ref, stack.concat(address), cache);
        });
        const value = parser.parseExpression();
        parser.expectEnd();
        result = normalizeComputed(value);
      } catch (error) {
        const code = error && error.message === '#CIRC!' ? '#CIRC!' : '#ERR!';
        result = { kind: 'error', value: code, display: code };
      }
    }

    cache[address] = result;
    return result;
  }

  function normalizeComputed(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return { kind: 'error', value: '#DIV/0!', display: '#DIV/0!' };
      }
      return { kind: 'number', value: value, display: formatValue(value) };
    }
    if (typeof value === 'string') {
      return { kind: 'text', value: value, display: value };
    }
    if (typeof value === 'boolean') {
      return { kind: 'boolean', value: value, display: value ? 'TRUE' : 'FALSE' };
    }
    return { kind: 'empty', value: 0, display: '' };
  }

  function formatValue(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
  }

  function createParser(input, resolveReference) {
    let index = 0;

    function parseExpression() {
      let value = parseTerm();
      skipWhitespace();
      while (peek() === '+' || peek() === '-') {
        const operator = next();
        const right = parseTerm();
        value = operator === '+' ? toNumber(value) + toNumber(right) : toNumber(value) - toNumber(right);
        skipWhitespace();
      }
      return value;
    }

    function parseTerm() {
      let value = parseFactor();
      skipWhitespace();
      while (peek() === '*' || peek() === '/') {
        const operator = next();
        const right = parseFactor();
        value = operator === '*' ? toNumber(value) * toNumber(right) : toNumber(value) / toNumber(right);
        skipWhitespace();
      }
      return value;
    }

    function parseFactor() {
      skipWhitespace();
      if (peek() === '-') {
        next();
        return -toNumber(parseFactor());
      }
      if (peek() === '(') {
        next();
        const value = parseExpression();
        skipWhitespace();
        expect(')');
        return value;
      }
      if (isLetter(peek())) {
        const identifier = parseIdentifier();
        skipWhitespace();
        if (peek() === '(') {
          next();
          const args = [];
          skipWhitespace();
          if (peek() !== ')') {
            while (true) {
              args.push(parseArgument());
              skipWhitespace();
              if (peek() === ',') {
                next();
                continue;
              }
              break;
            }
          }
          expect(')');
          return callFunction(identifier, args);
        }
        return referenceToScalar(identifier);
      }
      return parseNumber();
    }

    function parseArgument() {
      skipWhitespace();
      const start = index;
      if (isLetter(peek())) {
        const identifier = parseIdentifier();
        skipWhitespace();
        if (peek() === ':') {
          next();
          skipWhitespace();
          return expandRange(identifier, parseIdentifier());
        }
        index = start;
      }
      return parseExpression();
    }

    function referenceToScalar(identifier) {
      const resolved = resolveReference(identifier);
      if (resolved.kind === 'error') {
        throw new Error(resolved.value);
      }
      return resolved.value;
    }

    function expandRange(startRef, endRef) {
      const start = addressToPoint(startRef);
      const end = addressToPoint(endRef);
      const values = [];
      for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
        for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col += 1) {
          values.push(referenceToScalar(pointToAddress(row, col)));
        }
      }
      return values;
    }

    function callFunction(name, args) {
      const values = flatten(args);
      if (name === 'SUM') {
        return values.reduce(function (total, value) {
          return total + toNumber(value);
        }, 0);
      }
      throw new Error('#ERR!');
    }

    function flatten(values) {
      return values.reduce(function (all, value) {
        if (Array.isArray(value)) {
          return all.concat(value);
        }
        all.push(value);
        return all;
      }, []);
    }

    function parseIdentifier() {
      let value = '';
      while (isLetter(peek())) {
        value += next().toUpperCase();
      }
      while (isDigit(peek())) {
        value += next();
      }
      if (!value) {
        throw new Error('#ERR!');
      }
      return value;
    }

    function parseNumber() {
      let value = '';
      while (isDigit(peek()) || peek() === '.') {
        value += next();
      }
      if (!value) {
        throw new Error('#ERR!');
      }
      return Number(value);
    }

    function expect(character) {
      skipWhitespace();
      if (next() !== character) {
        throw new Error('#ERR!');
      }
    }

    function expectEnd() {
      skipWhitespace();
      if (index !== input.length) {
        throw new Error('#ERR!');
      }
    }

    function skipWhitespace() {
      while (/\s/.test(peek())) {
        index += 1;
      }
    }

    function peek() {
      return input[index] || '';
    }

    function next() {
      const value = input[index] || '';
      index += 1;
      return value;
    }

    return {
      parseExpression: parseExpression,
      expectEnd: expectEnd,
    };
  }

  function isLetter(value) {
    return /[A-Za-z]/.test(value || '');
  }

  function isDigit(value) {
    return /[0-9]/.test(value || '');
  }

  function toNumber(value) {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (value === '') {
      return 0;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function addressToPoint(address) {
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(address);
    if (!match) {
      throw new Error('#REF!');
    }
    return {
      col: lettersToColumn(match[1]),
      row: Number(match[2]),
    };
  }

  function lettersToColumn(letters) {
    let col = 0;
    for (let index = 0; index < letters.length; index += 1) {
      col = (col * 26) + (letters.charCodeAt(index) - 64);
    }
    return col;
  }

  function pointToAddress(row, col) {
    return columnToLetters(col) + String(row);
  }

  function columnToLetters(col) {
    let value = col;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - 1) / 26);
    }
    return letters;
  }

  return {
    MAX_ROWS: MAX_ROWS,
    MAX_COLS: MAX_COLS,
    createSheetState: createSheetState,
    setCellRaw: setCellRaw,
    evaluateCell: evaluateCell,
    moveSelection: moveSelection,
    serializeState: serializeState,
    hydrateState: hydrateState,
    pointToAddress: pointToAddress,
    columnToLetters: columnToLetters,
    addressToPoint: addressToPoint,
  };
});
