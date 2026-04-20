(function (globalScope) {
  'use strict';

  const MAX_COLS = 26;
  const MAX_ROWS = 100;
  const ERROR = {
    generic: '#ERR!',
    div0: '#DIV/0!',
    circular: '#CIRC!',
    ref: '#REF!',
    name: '#NAME?',
  };

  function createSheet(data) {
    const cells = new Map(Object.entries(data || {}));

    function setCell(address, raw) {
      if (raw == null || raw === '') {
        cells.delete(address);
      } else {
        cells.set(address, String(raw));
      }
    }

    function getCell(address) {
      return cells.get(address) || '';
    }

    function replaceAll(nextData) {
      cells.clear();
      for (const [address, raw] of Object.entries(nextData || {})) {
        setCell(address, raw);
      }
    }

    function toJSON() {
      return Object.fromEntries(cells.entries());
    }

    function applyRowChange(index, mode) {
      const next = {};
      for (const [address, raw] of cells.entries()) {
        const position = parseAddress(address);
        if (mode === 'delete' && position.row === index && (typeof raw !== 'string' || raw.charAt(0) !== '=')) {
          continue;
        }
        const nextRow = mode === 'insert'
          ? (position.row >= index ? position.row + 1 : position.row)
          : (position.row > index ? position.row - 1 : position.row);
        next[toAddress(nextRow, position.col)] = rewriteFormulaRows(raw, index, mode);
      }
      replaceAll(next);
    }

    return {
      setCell,
      setCellRaw: setCell,
      getCell,
      getCellRaw: getCell,
      getComputedCell(address) {
        return evaluateCell(this, address);
      },
      clearCell(address) {
        cells.delete(address);
      },
      toJSON,
      getStoredCells: toJSON,
      replaceAll,
      insertRow(index) {
        applyRowChange(index, 'insert');
      },
      deleteRow(index) {
        applyRowChange(index, 'delete');
      },
      _cells: cells,
    };
  }

  function evaluateCell(sheetOrAddress, addressOrCells, cache, stack) {
    let sheet = sheetOrAddress;
    let address = addressOrCells;
    if (typeof sheetOrAddress === 'string') {
      address = sheetOrAddress;
      sheet = createSheet(addressOrCells || {});
    }

    const memo = cache || new Map();
    const activeStack = stack || [];
    if (memo.has(address)) {
      return memo.get(address);
    }
    if (activeStack.includes(address)) {
      return makeError(ERROR.circular);
    }

    const raw = sheet.getCell(address);
    let result;
    if (!raw) {
      result = makeBlank();
    } else if (raw.charAt(0) !== '=') {
      result = parseLiteral(raw);
    } else if (/^=#(?:REF!|DIV\/0!|CIRC!|ERR!|NAME\?)$/i.test(raw)) {
      result = makeError(raw.slice(1).toUpperCase());
    } else {
      try {
        const parser = createParser(tokenize(raw.slice(1)), sheet, memo, activeStack.concat(address));
        const value = parser.parseExpression();
        if (!parser.isDone()) {
          throw new Error(ERROR.generic);
        }
        result = value;
      } catch (error) {
        result = normalizeError(error);
      }
    }

    memo.set(address, result);
    return result;
  }

  function createSpreadsheetEngine(initialData) {
    const sheet = createSheet(initialData);
    let selection = { row: 0, col: 0 };
    let clipboard = null;

    return {
      setCell(address, raw) {
        sheet.setCell(address, raw);
      },
      getRawValue(address) {
        return sheet.getCell(address);
      },
      getDisplayValue(address) {
        return evaluateCell(sheet, address).display;
      },
      getComputedCell(address) {
        return evaluateCell(sheet, address);
      },
      setSelection(nextSelection) {
        selection = { row: nextSelection.row, col: nextSelection.col };
      },
      getSelection() {
        return { row: selection.row, col: selection.col };
      },
      serialize() {
        return JSON.stringify({ cells: sheet.toJSON(), selection: selection });
      },
      deserialize(snapshot) {
        const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        sheet.replaceAll(data.cells || {});
        selection = data.selection || { row: 0, col: 0 };
      },
      copyRange(range) {
        const rows = [];
        for (let row = range.startRow; row <= range.endRow; row += 1) {
          const values = [];
          for (let col = range.startCol; col <= range.endCol; col += 1) {
            values.push(sheet.getCell(toAddress(row, col)));
          }
          rows.push(values);
        }
        clipboard = { rows: rows, sourceRow: range.startRow, sourceCol: range.startCol };
      },
      pasteRange(target) {
        if (!clipboard) {
          return;
        }
        for (let rowOffset = 0; rowOffset < clipboard.rows.length; rowOffset += 1) {
          for (let colOffset = 0; colOffset < clipboard.rows[rowOffset].length; colOffset += 1) {
            const raw = clipboard.rows[rowOffset][colOffset];
            const sourceCell = { row: clipboard.sourceRow + rowOffset, col: clipboard.sourceCol + colOffset };
            const targetCell = { row: target.row + rowOffset, col: target.col + colOffset };
            sheet.setCell(toAddress(targetCell.row, targetCell.col), copyFormula(raw, sourceCell, targetCell));
          }
        }
      },
      insertRow(rowIndex) {
        sheet.insertRow(rowIndex);
        if (selection.row >= rowIndex) {
          selection = { row: selection.row + 1, col: selection.col };
        }
      },
      deleteRow(rowIndex) {
        sheet.deleteRow(rowIndex);
        if (selection.row > rowIndex) {
          selection = { row: selection.row - 1, col: selection.col };
        } else if (selection.row === rowIndex) {
          selection = { row: Math.max(0, selection.row - 1), col: selection.col };
        }
      },
    };
  }

  function copyFormula(formula, sourceCell, targetCell) {
    if (typeof formula !== 'string' || formula.charAt(0) !== '=') {
      return formula;
    }
    const rowDelta = targetCell.row - sourceCell.row;
    const colDelta = targetCell.col - sourceCell.col;
    return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (_, absCol, colName, absRow, rowText) {
      const colIndex = columnNameToIndex(colName);
      const rowIndex = Number(rowText) - 1;
      const nextCol = absCol ? colIndex : colIndex + colDelta;
      const nextRow = absRow ? rowIndex : rowIndex + rowDelta;
      if (!isValidCell(nextRow, nextCol)) {
        return ERROR.ref;
      }
      return (absCol ? '$' : '') + columnIndexToName(nextCol) + (absRow ? '$' : '') + String(nextRow + 1);
    });
  }

  function rewriteFormulaRows(raw, rowIndex, mode) {
    if (typeof raw !== 'string' || raw.charAt(0) !== '=') {
      return raw;
    }
    return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, absCol, colName, absRow, rowText) {
      if (absRow) {
        return match;
      }
      const currentRow = Number(rowText) - 1;
      if (mode === 'insert') {
        const nextRow = currentRow >= rowIndex ? currentRow + 1 : currentRow;
        return (absCol ? '$' : '') + colName + (absRow ? '$' : '') + String(nextRow + 1);
      }
      if (currentRow === rowIndex) {
        return ERROR.ref;
      }
      const nextRow = currentRow > rowIndex ? currentRow - 1 : currentRow;
      return (absCol ? '$' : '') + colName + (absRow ? '$' : '') + String(nextRow + 1);
    });
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;
    while (index < input.length) {
      const char = input.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      const two = input.slice(index, index + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two });
        index += 2;
        continue;
      }
      if ('+-*/&=(),:<>'.includes(char)) {
        tokens.push({ type: char === ',' || char === '(' || char === ')' || char === ':' ? char : 'op', value: char });
        index += 1;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let text = '';
        while (end < input.length && input.charAt(end) !== '"') {
          text += input.charAt(end);
          end += 1;
        }
        if (input.charAt(end) !== '"') {
          throw new Error(ERROR.generic);
        }
        tokens.push({ type: 'string', value: text });
        index = end + 1;
        continue;
      }
      const numberMatch = input.slice(index).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const referenceMatch = input.slice(index).match(/^\$?[A-Z]+\$?\d+/);
      if (referenceMatch) {
        tokens.push({ type: 'ref', value: referenceMatch[0] });
        index += referenceMatch[0].length;
        continue;
      }
      const identMatch = input.slice(index).match(/^[A-Z]+/);
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0] });
        index += identMatch[0].length;
        continue;
      }
      throw new Error(ERROR.generic);
    }
    return tokens;
  }

  function createParser(tokens, sheet, cache, stack) {
    let position = 0;

    function current() {
      return tokens[position];
    }

    function consume(type, value) {
      const token = current();
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        throw new Error(ERROR.generic);
      }
      position += 1;
      return token;
    }

    function maybe(type, value) {
      const token = current();
      if (token && token.type === type && (value === undefined || token.value === value)) {
        position += 1;
        return token;
      }
      return null;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let left = parseConcat();
      while (current() && current().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(current().value)) {
        const operator = consume('op').value;
        const right = parseConcat();
        left = makeBoolean(compareValues(left, right, operator));
      }
      return left;
    }

    function parseConcat() {
      let left = parseAddSub();
      while (maybe('op', '&')) {
        left = makeString(toText(left) + toText(parseAddSub()));
      }
      return left;
    }

    function parseAddSub() {
      let left = parseMulDiv();
      while (current() && current().type === 'op' && (current().value === '+' || current().value === '-')) {
        const operator = consume('op').value;
        const right = parseMulDiv();
        left = makeNumber(operator === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right));
      }
      return left;
    }

    function parseMulDiv() {
      let left = parseUnary();
      while (current() && current().type === 'op' && (current().value === '*' || current().value === '/')) {
        const operator = consume('op').value;
        const right = parseUnary();
        if (operator === '*') {
          left = makeNumber(toNumber(left) * toNumber(right));
        } else {
          const denominator = toNumber(right);
          if (denominator === 0) {
            throw new Error(ERROR.div0);
          }
          left = makeNumber(toNumber(left) / denominator);
        }
      }
      return left;
    }

    function parseUnary() {
      if (maybe('op', '-')) {
        return makeNumber(-toNumber(parseUnary()));
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = current();
      if (!token) {
        throw new Error(ERROR.generic);
      }
      if (token.type === 'number') {
        consume('number');
        return makeNumber(token.value);
      }
      if (token.type === 'string') {
        consume('string');
        return makeString(token.value);
      }
      if (token.type === 'ref') {
        const start = consume('ref').value;
        if (maybe(':')) {
          const end = consume('ref').value;
          return makeRange(parseReference(start), parseReference(end), sheet, cache, stack);
        }
        const ref = parseReference(start);
        if (!isValidCell(ref.row, ref.col)) {
          throw new Error(ERROR.ref);
        }
        return evaluateCell(sheet, toAddress(ref.row, ref.col), cache, stack);
      }
      if (token.type === 'ident') {
        const ident = consume('ident').value;
        if (ident === 'TRUE') {
          return makeBoolean(true);
        }
        if (ident === 'FALSE') {
          return makeBoolean(false);
        }
        consume('(');
        const args = [];
        if (!maybe(')')) {
          do {
            args.push(parseExpression());
          } while (maybe(','));
          consume(')');
        }
        return callFunction(ident, args);
      }
      if (maybe('(')) {
        const value = parseExpression();
        consume(')');
        return value;
      }
      throw new Error(ERROR.generic);
    }

    return {
      parseExpression,
      isDone() {
        return position >= tokens.length;
      },
    };
  }

  function makeRange(start, end, sheet, cache, stack) {
    return {
      kind: 'range',
      start: start,
      end: end,
      get(row, col) {
        return evaluateCell(sheet, toAddress(row, col), cache, stack);
      },
    };
  }

  function callFunction(name, args) {
    const flat = flattenArgs(args);
    switch (name) {
      case 'SUM':
        return makeNumber(flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0));
      case 'AVERAGE':
        return makeNumber(flat.length ? flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0) / flat.length : 0);
      case 'MIN':
        return makeNumber(flat.length ? Math.min.apply(null, flat.map(toNumber)) : 0);
      case 'MAX':
        return makeNumber(flat.length ? Math.max.apply(null, flat.map(toNumber)) : 0);
      case 'COUNT':
        return makeNumber(flat.filter(function (value) { return !isBlank(value); }).length);
      case 'IF':
        return args.length < 3 ? makeError(ERROR.generic) : (toBoolean(args[0]) ? args[1] : args[2]);
      case 'AND':
        return makeBoolean(flat.every(toBoolean));
      case 'OR':
        return makeBoolean(flat.some(toBoolean));
      case 'NOT':
        return makeBoolean(!toBoolean(args[0] || makeBlank()));
      case 'ABS':
        return makeNumber(Math.abs(toNumber(args[0] || makeBlank())));
      case 'ROUND': {
        const digits = Math.max(0, Math.trunc(toNumber(args[1] || makeNumber(0))));
        return makeNumber(Number(toNumber(args[0] || makeBlank()).toFixed(digits)));
      }
      case 'CONCAT':
        return makeString(flat.map(toText).join(''));
      default:
        throw new Error(ERROR.name);
    }
  }

  function flattenArgs(args) {
    const values = [];
    for (const arg of args) {
      if (arg && arg.kind === 'range') {
        const top = Math.min(arg.start.row, arg.end.row);
        const bottom = Math.max(arg.start.row, arg.end.row);
        const left = Math.min(arg.start.col, arg.end.col);
        const right = Math.max(arg.start.col, arg.end.col);
        for (let row = top; row <= bottom; row += 1) {
          for (let col = left; col <= right; col += 1) {
            values.push(arg.get(row, col));
          }
        }
      } else {
        values.push(arg);
      }
    }
    return values;
  }

  function parseLiteral(raw) {
    const value = raw.trim();
    if (value === '') {
      return makeBlank();
    }
    if (!Number.isNaN(Number(value))) {
      return makeNumber(Number(value));
    }
    if (value.toUpperCase() === 'TRUE') {
      return makeBoolean(true);
    }
    if (value.toUpperCase() === 'FALSE') {
      return makeBoolean(false);
    }
    return makeString(raw);
  }

  function normalizeError(error) {
    const marker = error && typeof error.message === 'string' && Object.values(ERROR).includes(error.message)
      ? error.message
      : ERROR.generic;
    return makeError(marker);
  }

  function makeNumber(value) {
    return { type: 'number', value: value, display: Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8))) };
  }

  function makeString(value) {
    return { type: 'string', value: value, display: value };
  }

  function makeBoolean(value) {
    return { type: 'boolean', value: Boolean(value), display: value ? 'TRUE' : 'FALSE' };
  }

  function makeBlank() {
    return { type: 'blank', value: '', display: '' };
  }

  function makeError(display) {
    return { type: 'error', value: display, display: display, error: true };
  }

  function toNumber(value) {
    if (!value || value.type === 'blank') {
      return 0;
    }
    if (value.type === 'number') {
      return value.value;
    }
    if (value.type === 'boolean') {
      return value.value ? 1 : 0;
    }
    const parsed = Number(value.value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function toText(value) {
    if (!value || value.type === 'blank') {
      return '';
    }
    return value.display;
  }

  function toBoolean(value) {
    if (!value || value.type === 'blank') {
      return false;
    }
    if (value.type === 'boolean') {
      return value.value;
    }
    if (value.type === 'number') {
      return value.value !== 0;
    }
    return value.display !== '';
  }

  function compareValues(left, right, operator) {
    const useText = left.type === 'string' || right.type === 'string';
    const a = useText ? toText(left) : toNumber(left);
    const b = useText ? toText(right) : toNumber(right);
    switch (operator) {
      case '=':
        return a === b;
      case '<>':
        return a !== b;
      case '<':
        return a < b;
      case '<=':
        return a <= b;
      case '>':
        return a > b;
      case '>=':
        return a >= b;
      default:
        return false;
    }
  }

  function isBlank(value) {
    return !value || value.type === 'blank' || value.display === '';
  }

  function columnIndexToName(index) {
    return String.fromCharCode(65 + index);
  }

  function columnNameToIndex(name) {
    return name.charCodeAt(0) - 65;
  }

  function toAddress(row, col) {
    return columnIndexToName(col) + String(row + 1);
  }

  function parseAddress(address) {
    const match = address.match(/^([A-Z]+)(\d+)$/);
    return { row: Number(match[2]) - 1, col: columnNameToIndex(match[1]) };
  }

  function parseReference(reference) {
    const match = reference.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      throw new Error(ERROR.ref);
    }
    return {
      absCol: Boolean(match[1]),
      col: columnNameToIndex(match[2]),
      absRow: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function isValidCell(row, col) {
    return row >= 0 && row < MAX_ROWS && col >= 0 && col < MAX_COLS;
  }

  const api = {
    MAX_COLS: MAX_COLS,
    MAX_ROWS: MAX_ROWS,
    ERROR: ERROR,
    createSheet: createSheet,
    createSpreadsheetEngine: createSpreadsheetEngine,
    evaluateCell: evaluateCell,
    copyFormula: copyFormula,
    toAddress: toAddress,
    parseAddress: parseAddress,
    columnIndexToName: columnIndexToName,
    indexToColumnLabel: columnIndexToName,
    isValidCell: isValidCell,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
