(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COLUMN_COUNT = 26;
  const ROW_COUNT = 100;

  function columnNumberToName(col) {
    let value = col;
    let output = '';
    while (value > 0) {
      const rem = (value - 1) % 26;
      output = String.fromCharCode(65 + rem) + output;
      value = Math.floor((value - 1) / 26);
    }
    return output;
  }

  function columnNameToNumber(name) {
    let value = 0;
    for (let index = 0; index < name.length; index += 1) {
      value = value * 26 + (name.charCodeAt(index) - 64);
    }
    return value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createGridModel() {
    const columns = [];
    const rows = [];
    for (let col = 1; col <= COLUMN_COUNT; col += 1) {
      columns.push(columnNumberToName(col));
    }
    for (let row = 1; row <= ROW_COUNT; row += 1) {
      rows.push(row);
    }
    return { columns, rows };
  }

  function createEmptyState() {
    return {
      cells: {},
      selection: { row: 1, col: 1 },
    };
  }

  function makeCellKey(row, col) {
    return row + ':' + col;
  }

  function selectCell(state, row, col) {
    return {
      cells: { ...state.cells },
      selection: {
        row: clamp(row, 1, ROW_COUNT),
        col: clamp(col, 1, COLUMN_COUNT),
      },
    };
  }

  function commitCell(state, row, col, raw) {
    const nextCells = { ...state.cells };
    const key = makeCellKey(row, col);
    const value = String(raw);
    if (value === '') {
      delete nextCells[key];
    } else {
      nextCells[key] = value;
    }
    return {
      cells: nextCells,
      selection: { ...state.selection },
    };
  }

  function getCellRaw(state, row, col) {
    return state.cells[makeCellKey(row, col)] || '';
  }

  function normalizeRect(start, end) {
    return {
      startRow: Math.min(start.row, end.row),
      endRow: Math.max(start.row, end.row),
      startCol: Math.min(start.col, end.col),
      endCol: Math.max(start.col, end.col),
    };
  }

  function parseReferenceToken(token) {
    const match = token.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    return {
      colAbsolute: match[1] === '$',
      col: columnNameToNumber(match[2]),
      rowAbsolute: match[3] === '$',
      row: Number(match[4]),
    };
  }

  function formatReferenceToken(reference) {
    return (reference.colAbsolute ? '$' : '') +
      columnNumberToName(reference.col) +
      (reference.rowAbsolute ? '$' : '') +
      reference.row;
  }

  function shiftReferenceToken(token, rowOffset, colOffset) {
    const reference = parseReferenceToken(token);
    const shifted = {
      colAbsolute: reference.colAbsolute,
      rowAbsolute: reference.rowAbsolute,
      col: reference.colAbsolute ? reference.col : clamp(reference.col + colOffset, 1, COLUMN_COUNT),
      row: reference.rowAbsolute ? reference.row : clamp(reference.row + rowOffset, 1, ROW_COUNT),
    };
    return formatReferenceToken(shifted);
  }

  function shiftFormulaReferences(raw, rowOffset, colOffset) {
    if (!raw.startsWith('=')) {
      return raw;
    }
    return '=' + raw.slice(1).replace(/\$?[A-Z]+\$?\d+/g, function (token) {
      return shiftReferenceToken(token, rowOffset, colOffset);
    });
  }

  function copySelection(state, start, end) {
    const rect = normalizeRect(start, end);
    const rows = [];
    for (let row = rect.startRow; row <= rect.endRow; row += 1) {
      const columns = [];
      for (let col = rect.startCol; col <= rect.endCol; col += 1) {
        columns.push({
          raw: getCellRaw(state, row, col),
          sourceRow: row,
          sourceCol: col,
        });
      }
      rows.push(columns);
    }
    return {
      origin: { row: rect.startRow, col: rect.startCol },
      rows,
    };
  }

  function pasteSelection(state, clipboard, target) {
    let nextState = state;
    for (let rowIndex = 0; rowIndex < clipboard.rows.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < clipboard.rows[rowIndex].length; colIndex += 1) {
        const cell = clipboard.rows[rowIndex][colIndex];
        const destinationRow = target.row + rowIndex;
        const destinationCol = target.col + colIndex;
        const rowOffset = destinationRow - cell.sourceRow;
        const colOffset = destinationCol - cell.sourceCol;
        nextState = commitCell(
          nextState,
          destinationRow,
          destinationCol,
          shiftFormulaReferences(cell.raw, rowOffset, colOffset)
        );
      }
    }
    return nextState;
  }

  function moveSelection(state, rowDelta, colDelta) {
    return selectCell(state, state.selection.row + rowDelta, state.selection.col + colDelta);
  }

  function getSelectionAfterCommit(selection, key) {
    if (key === 'Tab') {
      return {
        row: selection.row,
        col: clamp(selection.col + 1, 1, COLUMN_COUNT),
      };
    }
    return {
      row: clamp(selection.row + 1, 1, ROW_COUNT),
      col: selection.col,
    };
  }

  function createStorageAdapter(storage, namespace) {
    return {
      getItem(key) {
        return storage.getItem(namespace + ':' + key);
      },
      setItem(key, value) {
        storage.setItem(namespace + ':' + key, value);
      },
    };
  }

  function saveState(storage, state) {
    storage.setItem('spreadsheet-state', JSON.stringify(state));
  }

  function loadState(storage) {
    const raw = storage.getItem('spreadsheet-state');
    if (!raw) {
      return createEmptyState();
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        cells: parsed && parsed.cells ? parsed.cells : {},
        selection: parsed && parsed.selection ? {
          row: clamp(Number(parsed.selection.row) || 1, 1, ROW_COUNT),
          col: clamp(Number(parsed.selection.col) || 1, 1, COLUMN_COUNT),
        } : { row: 1, col: 1 },
      };
    } catch (error) {
      return createEmptyState();
    }
  }

  function isErrorValue(value) {
    return typeof value === 'string' && value.charAt(0) === '#';
  }

  function toNumber(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === '' || value === null || typeof value === 'undefined') {
      return 0;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : '#ERR!';
  }

  function toText(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (value === '' || value === null || typeof value === 'undefined') {
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
    if (isErrorValue(value)) {
      return value;
    }
    if (value === '' || value === null || typeof value === 'undefined') {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    const upper = String(value).toUpperCase();
    if (upper === 'TRUE') {
      return true;
    }
    if (upper === 'FALSE') {
      return false;
    }
    return String(value).length > 0;
  }

  function formatValue(value) {
    return toText(value);
  }

  function parseLiteral(raw) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return '';
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (trimmed.toUpperCase() === 'TRUE') {
      return true;
    }
    if (trimmed.toUpperCase() === 'FALSE') {
      return false;
    }
    return raw;
  }

  function tokenize(formula) {
    const tokens = [];
    let index = 0;
    while (index < formula.length) {
      const char = formula.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < formula.length && formula.charAt(end) !== '"') {
          value += formula.charAt(end);
          end += 1;
        }
        if (end >= formula.length) {
          throw new Error('unterminated string');
        }
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      const twoChar = formula.slice(index, index + 2);
      if (['<=', '>=', '<>'].indexOf(twoChar) >= 0) {
        tokens.push({ type: 'op', value: twoChar });
        index += 2;
        continue;
      }
      if ('()+-*/&,=:'.indexOf(char) >= 0 || char === '<' || char === '>') {
        tokens.push({ type: char === '(' || char === ')' || char === ',' ? char : 'op', value: char });
        index += 1;
        continue;
      }
      const refMatch = formula.slice(index).match(/^\$?[A-Za-z]+\$?[0-9]+/);
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0].toUpperCase() });
        index += refMatch[0].length;
        continue;
      }
      const numberMatch = formula.slice(index).match(/^[0-9]*\.?[0-9]+/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const identMatch = formula.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0].toUpperCase() });
        index += identMatch[0].length;
        continue;
      }
      throw new Error('unexpected token');
    }
    return tokens;
  }

  function createParser(tokens, context) {
    let index = 0;

    function peek() {
      return tokens[index];
    }

    function take(type, value) {
      const token = tokens[index];
      if (!token || token.type !== type || (typeof value !== 'undefined' && token.value !== value)) {
        return null;
      }
      index += 1;
      return token;
    }

    function expect(type, value) {
      const token = take(type, value);
      if (!token) {
        throw new Error('parse error');
      }
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let value = parseConcat();
      while (peek() && peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].indexOf(peek().value) >= 0) {
        const op = tokens[index].value;
        index += 1;
        const right = parseConcat();
        if (isErrorValue(value)) {
          continue;
        }
        if (isErrorValue(right)) {
          value = right;
          continue;
        }
        const leftValue = typeof value === 'number' || typeof right === 'number' ? toNumber(value) : toText(value);
        const rightValue = typeof value === 'number' || typeof right === 'number' ? toNumber(right) : toText(right);
        if (isErrorValue(leftValue)) {
          value = leftValue;
          continue;
        }
        if (isErrorValue(rightValue)) {
          value = rightValue;
          continue;
        }
        if (op === '=') value = leftValue === rightValue;
        if (op === '<>') value = leftValue !== rightValue;
        if (op === '<') value = leftValue < rightValue;
        if (op === '<=') value = leftValue <= rightValue;
        if (op === '>') value = leftValue > rightValue;
        if (op === '>=') value = leftValue >= rightValue;
      }
      return value;
    }

    function parseConcat() {
      let value = parseAddSub();
      while (take('op', '&')) {
        const right = parseAddSub();
        const leftText = toText(value);
        const rightText = toText(right);
        if (isErrorValue(leftText)) return leftText;
        if (isErrorValue(rightText)) return rightText;
        value = leftText + rightText;
      }
      return value;
    }

    function parseAddSub() {
      let value = parseMulDiv();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = tokens[index].value;
        index += 1;
        const right = parseMulDiv();
        const leftNumber = toNumber(value);
        const rightNumber = toNumber(right);
        if (isErrorValue(leftNumber)) return leftNumber;
        if (isErrorValue(rightNumber)) return rightNumber;
        value = op === '+' ? leftNumber + rightNumber : leftNumber - rightNumber;
      }
      return value;
    }

    function parseMulDiv() {
      let value = parseUnary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const op = tokens[index].value;
        index += 1;
        const right = parseUnary();
        const leftNumber = toNumber(value);
        const rightNumber = toNumber(right);
        if (isErrorValue(leftNumber)) return leftNumber;
        if (isErrorValue(rightNumber)) return rightNumber;
        if (op === '/' && rightNumber === 0) {
          return '#DIV/0!';
        }
        value = op === '*' ? leftNumber * rightNumber : leftNumber / rightNumber;
      }
      return value;
    }

    function parseUnary() {
      if (take('op', '-')) {
        const value = parseUnary();
        const number = toNumber(value);
        return isErrorValue(number) ? number : -number;
      }
      return parsePrimary();
    }

    function parseArguments() {
      const args = [];
      if (take(')', ')')) {
        return args;
      }
      do {
        args.push(parseExpression());
      } while (take(',', ','));
      expect(')', ')');
      return args;
    }

    function applyFunction(name, args) {
      function flattenArgs(values) {
        const flat = [];
        values.forEach(function (value) {
          if (Array.isArray(value)) {
            flat.push.apply(flat, flattenArgs(value));
          } else {
            flat.push(value);
          }
        });
        return flat;
      }

      function numericArgs() {
        return flattenArgs(args).map(toNumber);
      }

      if (name === 'SUM') {
        const values = numericArgs();
        return values.some(isErrorValue) ? values.find(isErrorValue) : values.reduce(function (sum, value) { return sum + value; }, 0);
      }
      if (name === 'AVERAGE') {
        const values = numericArgs();
        if (values.some(isErrorValue)) return values.find(isErrorValue);
        return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : 0;
      }
      if (name === 'MIN') {
        const values = numericArgs();
        return values.some(isErrorValue) ? values.find(isErrorValue) : Math.min.apply(Math, values);
      }
      if (name === 'MAX') {
        const values = numericArgs();
        return values.some(isErrorValue) ? values.find(isErrorValue) : Math.max.apply(Math, values);
      }
      if (name === 'COUNT') {
        return flattenArgs(args).filter(function (value) { return value !== ''; }).length;
      }
      if (name === 'ABS') {
        const value = toNumber(args[0] || 0);
        return isErrorValue(value) ? value : Math.abs(value);
      }
      if (name === 'ROUND') {
        const value = toNumber(args[0] || 0);
        const places = toNumber(args[1] || 0);
        if (isErrorValue(value)) return value;
        if (isErrorValue(places)) return places;
        const factor = Math.pow(10, places);
        return Math.round(value * factor) / factor;
      }
      if (name === 'CONCAT') {
        const values = flattenArgs(args).map(toText);
        return values.some(isErrorValue) ? values.find(isErrorValue) : values.join('');
      }
      if (name === 'IF') {
        const condition = toBoolean(args[0]);
        if (isErrorValue(condition)) return condition;
        return condition ? (typeof args[1] === 'undefined' ? '' : args[1]) : (typeof args[2] === 'undefined' ? '' : args[2]);
      }
      if (name === 'AND') {
        for (let i = 0; i < args.length; i += 1) {
          const value = toBoolean(args[i]);
          if (isErrorValue(value)) return value;
          if (!value) return false;
        }
        return true;
      }
      if (name === 'OR') {
        for (let i = 0; i < args.length; i += 1) {
          const value = toBoolean(args[i]);
          if (isErrorValue(value)) return value;
          if (value) return true;
        }
        return false;
      }
      if (name === 'NOT') {
        const value = toBoolean(args[0]);
        return isErrorValue(value) ? value : !value;
      }
      return '#ERR!';
    }

    function parsePrimary() {
      const numberToken = take('number');
      if (numberToken) {
        return numberToken.value;
      }
      const stringToken = take('string');
      if (stringToken) {
        return stringToken.value;
      }
      const refToken = take('ref');
      if (refToken) {
        if (take('op', ':')) {
          const endRefToken = expect('ref');
          const startReference = parseReferenceToken(refToken.value);
          const endReference = parseReferenceToken(endRefToken.value);
          return context.resolveRange(startReference, endReference);
        }
        const reference = parseReferenceToken(refToken.value);
        return context.resolveRef(reference.row, reference.col);
      }
      const identToken = take('ident');
      if (identToken) {
        if (take('(', '(')) {
          return applyFunction(identToken.value, parseArguments());
        }
        if (identToken.value === 'TRUE') {
          return true;
        }
        if (identToken.value === 'FALSE') {
          return false;
        }
        return '#ERR!';
      }
      if (take('(', '(')) {
        const value = parseExpression();
        expect(')', ')');
        return value;
      }
      throw new Error('parse error');
    }

    return {
      parse() {
        const value = parseExpression();
        if (index !== tokens.length) {
          throw new Error('trailing tokens');
        }
        return value;
      },
    };
  }

  function evaluateFormula(state, formula, context) {
    try {
      const tokens = tokenize(formula);
      return createParser(tokens, context).parse();
    } catch (error) {
      return '#ERR!';
    }
  }

  function evaluateCell(state, row, col, memo, stack) {
    const cache = memo || {};
    const trail = stack || [];
    const key = makeCellKey(row, col);
    if (cache[key]) {
      return cache[key];
    }
    if (trail.indexOf(key) >= 0) {
      return { value: '#CIRC!' };
    }
    const raw = getCellRaw(state, row, col);
    if (!raw.startsWith('=')) {
      const result = { value: parseLiteral(raw) };
      cache[key] = result;
      return result;
    }
    const result = {
      value: evaluateFormula(state, raw.slice(1), {
        resolveRef(refRow, refCol) {
          if (refRow < 1 || refRow > ROW_COUNT || refCol < 1 || refCol > COLUMN_COUNT) {
            return '#REF!';
          }
          return evaluateCell(state, refRow, refCol, cache, trail.concat(key)).value;
        },
        resolveRange(startReference, endReference) {
          const rect = normalizeRect(
            { row: startReference.row, col: startReference.col },
            { row: endReference.row, col: endReference.col }
          );
          const values = [];
          for (let rowIndex = rect.startRow; rowIndex <= rect.endRow; rowIndex += 1) {
            for (let colIndex = rect.startCol; colIndex <= rect.endCol; colIndex += 1) {
              values.push(this.resolveRef(rowIndex, colIndex));
            }
          }
          return values;
        },
      }),
    };
    cache[key] = result;
    return result;
  }

  function getStorageNamespace() {
    if (typeof window === 'undefined') {
      return 'local';
    }
    return window.__BENCHMARK_STORAGE_NAMESPACE__ || 'local';
  }

  function initApp() {
    if (typeof document === 'undefined') {
      return;
    }
    const gridModel = createGridModel();
    const formulaBar = document.querySelector('[data-formula-input]');
    const editor = document.querySelector('[data-cell-editor]');
    const selectedCellLabel = document.querySelector('[data-selected-cell]');
    const columnHeaders = document.querySelector('[data-column-headers]');
    const gridBody = document.querySelector('[data-grid-body]');
    const storage = createStorageAdapter(window.localStorage, getStorageNamespace());
    let state = loadState(storage);

    function persist() {
      saveState(storage, state);
    }

    function syncEditors() {
      const raw = getCellRaw(state, state.selection.row, state.selection.col);
      formulaBar.value = raw;
      editor.value = raw;
      selectedCellLabel.textContent = columnNumberToName(state.selection.col) + state.selection.row;
    }

    function renderHeaders() {
      columnHeaders.innerHTML = '';
      const corner = document.createElement('div');
      corner.className = 'corner-cell';
      columnHeaders.appendChild(corner);
      gridModel.columns.forEach(function (column) {
        const node = document.createElement('div');
        node.className = 'column-header';
        node.textContent = column;
        columnHeaders.appendChild(node);
      });
    }

    function renderGrid() {
      const memo = {};
      gridBody.innerHTML = '';
      gridModel.rows.forEach(function (row) {
        const rowEl = document.createElement('div');
        rowEl.className = 'grid-row';

        const rowHeader = document.createElement('div');
        rowHeader.className = 'row-header';
        rowHeader.textContent = row;
        rowEl.appendChild(rowHeader);

        for (let col = 1; col <= COLUMN_COUNT; col += 1) {
          const button = document.createElement('button');
          const result = evaluateCell(state, row, col, memo, []);
          const selected = state.selection.row === row && state.selection.col === col;
          button.type = 'button';
          button.className = 'grid-cell' + (selected ? ' is-selected' : '');
          button.dataset.row = String(row);
          button.dataset.col = String(col);
          button.textContent = formatValue(result.value);
          rowEl.appendChild(button);
        }

        gridBody.appendChild(rowEl);
      });
      syncEditors();
    }

    function commitSelected(value) {
      state = commitCell(state, state.selection.row, state.selection.col, value);
      persist();
      renderGrid();
    }

    function applySelectionMove(rowDelta, colDelta) {
      state = moveSelection(state, rowDelta, colDelta);
      persist();
      renderGrid();
    }

    function commitAndAdvance(value, key) {
      const nextSelection = getSelectionAfterCommit(state.selection, key);
      state = commitCell(state, state.selection.row, state.selection.col, value);
      state = selectCell(state, nextSelection.row, nextSelection.col);
      persist();
      renderGrid();
    }

    renderHeaders();
    renderGrid();

    gridBody.addEventListener('click', function (event) {
      const button = event.target.closest('.grid-cell');
      if (!button) {
        return;
      }
      state = selectCell(state, Number(button.dataset.row), Number(button.dataset.col));
      persist();
      renderGrid();
    });

    formulaBar.addEventListener('input', function () {
      editor.value = formulaBar.value;
    });

    formulaBar.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === 'Tab') {
        commitAndAdvance(formulaBar.value, event.key);
        event.preventDefault();
      } else if (event.key === 'Escape') {
        syncEditors();
        event.preventDefault();
      }
    });

    editor.addEventListener('keydown', function (event) {
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        commitAndAdvance(editor.value, event.key);
        event.preventDefault();
      } else if (event.key === 'Escape') {
        syncEditors();
        event.preventDefault();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.target === formulaBar || event.target === editor) {
        return;
      }
      if (event.key === 'ArrowUp') applySelectionMove(-1, 0);
      else if (event.key === 'ArrowDown') applySelectionMove(1, 0);
      else if (event.key === 'ArrowLeft') applySelectionMove(0, -1);
      else if (event.key === 'ArrowRight') applySelectionMove(0, 1);
      else if (event.key === 'Enter' || event.key === 'F2') {
        editor.focus();
        editor.select();
        event.preventDefault();
        return;
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        editor.focus();
        editor.value = event.key;
        formulaBar.value = event.key;
        event.preventDefault();
        return;
      } else {
        return;
      }
      event.preventDefault();
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initApp);
  }

  return {
    createGridModel,
    createEmptyState,
    selectCell,
    commitCell,
    getCellRaw,
    moveSelection,
    getSelectionAfterCommit,
    copySelection,
    pasteSelection,
    evaluateCell,
    formatValue,
    createStorageAdapter,
    saveState,
    loadState,
  };
});
