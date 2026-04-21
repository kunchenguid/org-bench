(function (global) {
  'use strict';

  var GRID_COLUMNS = 26;
  var GRID_ROWS = 100;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampPosition(position) {
    return {
      col: clamp(position.col, 0, GRID_COLUMNS - 1),
      row: clamp(position.row, 0, GRID_ROWS - 1),
    };
  }

  function movePosition(position, colDelta, rowDelta) {
    return clampPosition({
      col: position.col + colDelta,
      row: position.row + rowDelta,
    });
  }

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function cellKey(position) {
    return columnLabel(position.col) + String(position.row + 1);
  }

  function createWorkbook() {
    return {
      cells: {},
    };
  }

  function getCell(workbook, position) {
    return workbook.cells[cellKey(position)] || null;
  }

  function getCellDisplay(workbook, position) {
    var cell = getCell(workbook, position);
    return cell ? cell.display : '';
  }

  function parseCellReference(token) {
    var match = /^([A-Z])(\d+)$/.exec(token);
    if (!match) {
      return null;
    }

    return {
      col: match[1].charCodeAt(0) - 65,
      row: Number(match[2]) - 1,
    };
  }

  function tokenizeFormula(source) {
    var tokens = [];
    var index = 0;

    while (index < source.length) {
      var char = source[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (/[()+\-*/]/.test(char)) {
        tokens.push({ type: char, value: char });
        index += 1;
        continue;
      }

      if (char === '<' || char === '>') {
        var next = source[index + 1] || '';
        var pair = char + next;
        if (pair === '<=' || pair === '>=' || pair === '<>') {
          tokens.push({ type: 'operator', value: pair });
          index += 2;
          continue;
        }
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      if (char === '=') {
        tokens.push({ type: 'operator', value: '=' });
        index += 1;
        continue;
      }

      if (/\d|\./.test(char)) {
        var numberEnd = index + 1;
        while (numberEnd < source.length && /\d|\./.test(source[numberEnd])) {
          numberEnd += 1;
        }
        tokens.push({ type: 'number', value: Number(source.slice(index, numberEnd)) });
        index = numberEnd;
        continue;
      }

      if (/[A-Z]/i.test(char)) {
        var identifierEnd = index + 1;
        while (identifierEnd < source.length && /[A-Z]/i.test(source[identifierEnd])) {
          identifierEnd += 1;
        }
        while (identifierEnd < source.length && /\d/.test(source[identifierEnd])) {
          identifierEnd += 1;
        }
        tokens.push({ type: 'identifier', value: source.slice(index, identifierEnd).toUpperCase() });
        index = identifierEnd;
        continue;
      }

      throw new Error('Unexpected token');
    }

    return tokens;
  }

  function evaluateFormula(workbook, raw) {
    var tokens = tokenizeFormula(raw.slice(1));
    var index = 0;

    function peek() {
      return tokens[index] || null;
    }

    function consume(type, value) {
      var token = peek();
      if (!token || token.type !== type || (value && token.value !== value)) {
        throw new Error('Unexpected token');
      }
      index += 1;
      return token;
    }

    function parsePrimary() {
      var token = peek();
      if (!token) {
        throw new Error('Unexpected end of formula');
      }

      if (token.type === 'number') {
        consume('number');
        return token.value;
      }

      if (token.type === 'identifier') {
        consume('identifier');
        if (token.value === 'TRUE') {
          return true;
        }
        if (token.value === 'FALSE') {
          return false;
        }
        var reference = parseCellReference(token.value);
        if (!reference) {
          throw new Error('Unknown identifier');
        }
        var display = getCellDisplay(workbook, reference);
        return display === '' ? 0 : Number(display);
      }

      if (token.type === '-') {
        consume('-');
        return -Number(parsePrimary());
      }

      if (token.type === '(') {
        consume('(');
        var value = parseComparison();
        consume(')');
        return value;
      }

      throw new Error('Unexpected token');
    }

    function parseMultiplication() {
      var value = parsePrimary();
      while (peek() && (peek().type === '*' || peek().type === '/')) {
        var operator = consume(peek().type).value;
        var nextValue = parsePrimary();
        value = operator === '*' ? Number(value) * Number(nextValue) : Number(value) / Number(nextValue);
      }
      return value;
    }

    function parseAddition() {
      var value = parseMultiplication();
      while (peek() && (peek().type === '+' || peek().type === '-')) {
        var operator = consume(peek().type).value;
        var nextValue = parseMultiplication();
        value = operator === '+' ? Number(value) + Number(nextValue) : Number(value) - Number(nextValue);
      }
      return value;
    }

    function parseComparison() {
      var value = parseAddition();
      while (peek() && peek().type === 'operator') {
        var operator = consume('operator').value;
        var nextValue = parseAddition();
        if (operator === '=') {
          value = value === nextValue;
        } else if (operator === '<>') {
          value = value !== nextValue;
        } else if (operator === '<') {
          value = value < nextValue;
        } else if (operator === '<=') {
          value = value <= nextValue;
        } else if (operator === '>') {
          value = value > nextValue;
        } else if (operator === '>=') {
          value = value >= nextValue;
        }
      }
      return value;
    }

    var result = parseComparison();
    if (peek()) {
      throw new Error('Unexpected token');
    }
    return result;
  }

  function coerceDisplayValue(raw) {
    if (raw == null || raw === '') {
      return '';
    }

    if (raw.charAt(0) === '=') {
      return String(evaluateFormula(this, raw));
    }

    var trimmed = raw.trim();
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
      return String(Number(trimmed));
    }

    return raw;
  }

  function setCell(workbook, position, raw) {
    var key = cellKey(position);

    if (!raw) {
      delete workbook.cells[key];
      return;
    }

    workbook.cells[key] = {
      raw: raw,
      display: coerceDisplayValue.call(workbook, raw),
    };
  }

  function storageKey(namespace, suffix) {
    return String(namespace || '') + suffix;
  }

  var api = {
    GRID_COLUMNS: GRID_COLUMNS,
    GRID_ROWS: GRID_ROWS,
    clampPosition: clampPosition,
    movePosition: movePosition,
    columnLabel: columnLabel,
    cellKey: cellKey,
    createWorkbook: createWorkbook,
    setCell: setCell,
    getCellDisplay: getCellDisplay,
    evaluateFormula: evaluateFormula,
    storageKey: storageKey,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
