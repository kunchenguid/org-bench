(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const COL_COUNT = 26;
  const ROW_COUNT = 100;
  const ERROR = {
    generic: '#ERR!',
    circular: '#CIRC!',
    div0: '#DIV/0!'
  };

  function createEngine(initialCells) {
    const rawCells = new Map();
    if (initialCells) {
      Object.keys(initialCells).forEach((cellId) => {
        if (initialCells[cellId] !== '') {
          rawCells.set(cellId, String(initialCells[cellId]));
        }
      });
    }

    function setCell(cellId, raw) {
      const value = String(raw == null ? '' : raw);
      if (value === '') {
        rawCells.delete(cellId);
        return;
      }
      rawCells.set(cellId, value);
    }

    function getCellRaw(cellId) {
      return rawCells.get(cellId) || '';
    }

    function getCells() {
      return Object.fromEntries(rawCells.entries());
    }

    function getDisplayValue(cellId) {
      return formatDisplay(evaluateCell(cellId, new Set()));
    }

    function evaluateCell(cellId, visiting) {
      if (visiting.has(cellId)) {
        return makeError(ERROR.circular);
      }

      visiting.add(cellId);
      const raw = getCellRaw(cellId);
      let result;

      if (raw === '') {
        result = '';
      } else if (raw[0] !== '=') {
        const numeric = Number(raw);
        result = raw.trim() !== '' && Number.isFinite(numeric) ? numeric : raw;
      } else {
        try {
          const tokens = tokenize(raw.slice(1));
          const parser = createParser(tokens);
          const expression = parser.parseExpression();
          parser.expect('eof');
          result = evaluateNode(expression, visiting);
        } catch (error) {
          result = makeError(error && error.code ? error.code : ERROR.generic);
        }
      }

      visiting.delete(cellId);
      return result;
    }

    function evaluateNode(node, visiting) {
      switch (node.type) {
        case 'number':
          return node.value;
        case 'string':
          return node.value;
        case 'boolean':
          return node.value;
        case 'unary': {
          const value = evaluateNode(node.value, visiting);
          if (isError(value)) {
            return value;
          }
          return -toNumber(value);
        }
        case 'binary': {
          const left = evaluateNode(node.left, visiting);
          if (isError(left)) {
            return left;
          }
          const right = evaluateNode(node.right, visiting);
          if (isError(right)) {
            return right;
          }
          return evaluateBinary(node.operator, left, right);
        }
        case 'cell':
          return evaluateCell(normalizeCellRef(node.ref), visiting);
        case 'range':
          return expandRange(node.start, node.end).map((ref) => evaluateCell(ref, visiting));
        case 'call':
          return evaluateCall(node, visiting);
        default:
          return makeError(ERROR.generic);
      }
    }

    function evaluateBinary(operator, left, right) {
      if (operator === '&') {
        return toText(left) + toText(right);
      }

      if (operator === '+') {
        return toNumber(left) + toNumber(right);
      }

      if (operator === '-') {
        return toNumber(left) - toNumber(right);
      }

      if (operator === '*') {
        return toNumber(left) * toNumber(right);
      }

      if (operator === '/') {
        if (toNumber(right) === 0) {
          return makeError(ERROR.div0);
        }
        return toNumber(left) / toNumber(right);
      }

      return compareValues(operator, left, right);
    }

    function evaluateCall(node, visiting) {
      const name = node.name;
      const args = node.args.map((arg) => {
        const value = evaluateNode(arg, visiting);
        return arg.type === 'range' ? flattenRange(value) : value;
      });

      if (args.some(isError)) {
        return args.find(isError);
      }

      switch (name) {
        case 'SUM':
          return flattenArgs(args).reduce((sum, value) => sum + toNumber(value), 0);
        case 'AVERAGE': {
          const values = flattenArgs(args);
          return values.length ? values.reduce((sum, value) => sum + toNumber(value), 0) / values.length : 0;
        }
        case 'MIN': {
          const values = flattenArgs(args);
          return values.length ? Math.min.apply(null, values.map(toNumber)) : 0;
        }
        case 'MAX': {
          const values = flattenArgs(args);
          return values.length ? Math.max.apply(null, values.map(toNumber)) : 0;
        }
        case 'COUNT':
          return flattenArgs(args).filter((value) => value !== '').length;
        case 'IF':
          return toBoolean(args[0]) ? valueAt(args, 1) : valueAt(args, 2);
        case 'AND':
          return flattenArgs(args).every(toBoolean);
        case 'OR':
          return flattenArgs(args).some(toBoolean);
        case 'NOT':
          return !toBoolean(valueAt(args, 0));
        case 'ABS':
          return Math.abs(toNumber(valueAt(args, 0)));
        case 'ROUND': {
          const value = toNumber(valueAt(args, 0));
          const digits = Math.max(0, Math.trunc(toNumber(valueAt(args, 1))));
          const factor = Math.pow(10, digits);
          return Math.round(value * factor) / factor;
        }
        case 'CONCAT':
          return flattenArgs(args).map(toText).join('');
        default:
          return makeError(ERROR.generic);
      }
    }

    return {
      setCell,
      getCellRaw,
      getCells,
      replaceCells,
      getDisplayValue,
      evaluateCell
    };

    function replaceCells(nextCells) {
      rawCells.clear();
      Object.keys(nextCells || {}).forEach((cellId) => {
        if (nextCells[cellId] !== '') {
          rawCells.set(cellId, String(nextCells[cellId]));
        }
      });
    }
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
        let end = index + 1;
        let text = '';
        while (end < input.length && input[end] !== '"') {
          text += input[end];
          end += 1;
        }
        if (end >= input.length) {
          throw new Error('unterminated string');
        }
        tokens.push({ type: 'string', value: text });
        index = end + 1;
        continue;
      }

      const pair = input.slice(index, index + 2);
      if (pair === '<=' || pair === '>=' || pair === '<>') {
        tokens.push({ type: 'op', value: pair });
        index += 2;
        continue;
      }

      if ('+-*/&=<>():,'.includes(char)) {
        tokens.push({ type: char === ',' ? 'comma' : char === '(' || char === ')' ? 'paren' : char === ':' ? 'colon' : 'op', value: char });
        index += 1;
        continue;
      }

      const refMatch = input.slice(index).match(/^\$?[A-Za-z]+\$?\d+/);
      if (refMatch) {
        tokens.push({ type: 'ref', value: refMatch[0].toUpperCase() });
        index += refMatch[0].length;
        continue;
      }

      const numberMatch = input.slice(index).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }

      const identMatch = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (identMatch) {
        tokens.push({ type: 'ident', value: identMatch[0].toUpperCase() });
        index += identMatch[0].length;
        continue;
      }

      throw new Error('invalid token');
    }

    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function createParser(tokens) {
    let index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(type, value) {
      const token = tokens[index];
      if (token.type === type && (value == null || token.value === value)) {
        index += 1;
        return token;
      }
      return null;
    }

    function expect(type, value) {
      const token = consume(type, value);
      if (!token) {
        const error = new Error('unexpected token');
        error.code = ERROR.generic;
        throw error;
      }
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let node = parseConcat();
      while (peek().type === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek().value)) {
        const operator = expect('op').value;
        node = { type: 'binary', operator, left: node, right: parseConcat() };
      }
      return node;
    }

    function parseConcat() {
      let node = parseAdditive();
      while (consume('op', '&')) {
        node = { type: 'binary', operator: '&', left: node, right: parseAdditive() };
      }
      return node;
    }

    function parseAdditive() {
      let node = parseMultiplicative();
      while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const operator = expect('op').value;
        node = { type: 'binary', operator, left: node, right: parseMultiplicative() };
      }
      return node;
    }

    function parseMultiplicative() {
      let node = parseUnary();
      while (peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const operator = expect('op').value;
        node = { type: 'binary', operator, left: node, right: parseUnary() };
      }
      return node;
    }

    function parseUnary() {
      if (consume('op', '-')) {
        return { type: 'unary', value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();
      if (consume('paren', '(')) {
        const node = parseExpression();
        expect('paren', ')');
        return node;
      }
      if (token.type === 'number') {
        return { type: 'number', value: expect('number').value };
      }
      if (token.type === 'string') {
        return { type: 'string', value: expect('string').value };
      }
      if (token.type === 'ref') {
        const ref = expect('ref').value;
        const cellNode = { type: 'cell', ref: ref };
        if (consume('colon')) {
          const end = expect('ref').value;
          return { type: 'range', start: ref, end: end };
        }
        return cellNode;
      }
      if (token.type === 'ident') {
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'boolean', value: expect('ident').value === 'TRUE' };
        }

        const ident = expect('ident').value;
        if (consume('paren', '(')) {
          const args = [];
          if (!consume('paren', ')')) {
            do {
              args.push(parseExpression());
            } while (consume('comma'));
            expect('paren', ')');
          }
          return { type: 'call', name: ident, args };
        }

      }

      const error = new Error('invalid expression');
      error.code = ERROR.generic;
      throw error;
    }

    return { parseExpression, expect };
  }

  function compareValues(operator, left, right) {
    const leftNumber = numericCandidate(left);
    const rightNumber = numericCandidate(right);
    const pair = leftNumber != null && rightNumber != null ? [leftNumber, rightNumber] : [toText(left), toText(right)];

    switch (operator) {
      case '=':
        return pair[0] === pair[1];
      case '<>':
        return pair[0] !== pair[1];
      case '<':
        return pair[0] < pair[1];
      case '<=':
        return pair[0] <= pair[1];
      case '>':
        return pair[0] > pair[1];
      case '>=':
        return pair[0] >= pair[1];
      default:
        return makeError(ERROR.generic);
    }
  }

  function expandRange(start, end) {
    const startRef = parseCellRef(start);
    const endRef = parseCellRef(end);
    const minCol = Math.min(startRef.col, endRef.col);
    const maxCol = Math.max(startRef.col, endRef.col);
    const minRow = Math.min(startRef.row, endRef.row);
    const maxRow = Math.max(startRef.row, endRef.row);
    const refs = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        refs.push(toCellId(col, row));
      }
    }

    return refs;
  }

  function parseCellRef(cellId) {
    const match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(cellId);
    if (!match) {
      throw new Error('bad ref');
    }
    return {
      colAbsolute: match[1] === '$',
      col: lettersToColumn(match[2]),
      rowAbsolute: match[3] === '$',
      row: Number(match[4])
    };
  }

  function formatCellRef(ref) {
    return (ref.colAbsolute ? '$' : '') + columnToLetters(ref.col) + (ref.rowAbsolute ? '$' : '') + String(ref.row);
  }

  function normalizeCellRef(cellId) {
    const ref = parseCellRef(cellId);
    return toCellId(ref.col, ref.row);
  }

  function shiftCellRef(cellId, colOffset, rowOffset) {
    const ref = parseCellRef(cellId);
    const shifted = {
      colAbsolute: ref.colAbsolute,
      rowAbsolute: ref.rowAbsolute,
      col: ref.colAbsolute ? ref.col : clamp(ref.col + colOffset, 1, COL_COUNT),
      row: ref.rowAbsolute ? ref.row : clamp(ref.row + rowOffset, 1, ROW_COUNT)
    };
    return formatCellRef(shifted);
  }

  function shiftFormula(raw, colOffset, rowOffset) {
    if (!raw || raw[0] !== '=') {
      return raw;
    }

    let result = '=';
    let index = 1;
    let inString = false;

    while (index < raw.length) {
      const char = raw[index];
      if (char === '"') {
        inString = !inString;
        result += char;
        index += 1;
        continue;
      }

      if (!inString) {
        const slice = raw.slice(index);
        const refMatch = slice.match(/^\$?[A-Za-z]+\$?\d+/);
        if (refMatch) {
          const previous = index > 0 ? raw[index - 1] : '';
          if (!/[A-Za-z0-9_]/.test(previous)) {
            result += shiftCellRef(refMatch[0].toUpperCase(), colOffset, rowOffset);
            index += refMatch[0].length;
            continue;
          }
        }
      }

      result += char;
      index += 1;
    }

    return result;
  }

  function lettersToColumn(letters) {
    let value = 0;
    for (let index = 0; index < letters.length; index += 1) {
      value = value * 26 + (letters.charCodeAt(index) - 64);
    }
    return value;
  }

  function columnToLetters(column) {
    let value = column;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - 1) / 26);
    }
    return letters;
  }

  function toCellId(col, row) {
    return columnToLetters(col) + row;
  }

  function makeError(code) {
    return { error: code };
  }

  function isError(value) {
    return Boolean(value && typeof value === 'object' && value.error);
  }

  function formatDisplay(value) {
    if (isError(value)) {
      return value.error;
    }
    if (value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ERROR.generic;
      }
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    }
    return String(value);
  }

  function toNumber(value) {
    if (isError(value)) {
      return value;
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
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function numericCandidate(value) {
    if (value === '') {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  function toText(value) {
    if (value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (isError(value)) {
      return value.error;
    }
    return String(value);
  }

  function toBoolean(value) {
    if (value === '') {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function flattenRange(values) {
    return Array.isArray(values) ? values : [values];
  }

  function flattenArgs(values) {
    return values.reduce((items, value) => items.concat(Array.isArray(value) ? value : [value]), []);
  }

  function valueAt(values, index) {
    return index < values.length ? values[index] : '';
  }

  function createApp(options) {
    const rootNode = options.root;
    const storage = options.storage || window.localStorage;
    const storagePrefix = options.storagePrefix || getStoragePrefix();
    const stored = loadState(storage, storagePrefix);
    const engine = createEngine(stored.cells);
    const state = {
      selected: stored.selected || 'A1',
      rangeAnchor: stored.selected || 'A1',
      rangeFocus: stored.selected || 'A1',
      editing: null,
      dragging: false,
      clipboard: null,
      history: createHistoryManager(50)
    };

    rootNode.innerHTML = [
      '<div class="app-shell">',
      '  <header class="toolbar">',
      '    <div class="nameplate">Sheet</div>',
      '    <div class="selection-pill" id="selection-pill"></div>',
      '    <label class="formula-wrap">',
      '      <span class="formula-label">fx</span>',
      '      <input id="formula-input" class="formula-input" type="text" spellcheck="false" autocomplete="off">',
      '    </label>',
      '  </header>',
      '  <div class="grid-wrap">',
      '    <table class="sheet" id="sheet"></table>',
      '  </div>',
      '</div>'
    ].join('');

    const selectionPill = rootNode.querySelector('#selection-pill');
    const formulaInput = rootNode.querySelector('#formula-input');
    const sheet = rootNode.querySelector('#sheet');

    buildTable(sheet);
    refreshAll();

    sheet.addEventListener('click', (event) => {
      const cell = event.target.closest('[data-cell-id]');
      if (!cell) {
        return;
      }
      if (state.editing) {
        commitEdit();
      }
      selectCell(cell.dataset.cellId, event.shiftKey);
    });

    sheet.addEventListener('mousedown', (event) => {
      const cell = event.target.closest('[data-cell-id]');
      if (!cell || event.button !== 0) {
        return;
      }
      state.dragging = true;
      selectCell(cell.dataset.cellId, event.shiftKey);
      event.preventDefault();
    });

    sheet.addEventListener('mouseover', (event) => {
      if (!state.dragging) {
        return;
      }
      const cell = event.target.closest('[data-cell-id]');
      if (!cell) {
        return;
      }
      extendSelection(cell.dataset.cellId);
    });

    document.addEventListener('mouseup', () => {
      state.dragging = false;
    });

    sheet.addEventListener('dblclick', (event) => {
      const cell = event.target.closest('[data-cell-id]');
      if (!cell) {
        return;
      }
      selectCell(cell.dataset.cellId);
      beginEdit(engine.getCellRaw(cell.dataset.cellId), true);
    });

    formulaInput.addEventListener('focus', () => {
      if (!state.editing) {
        beginEdit(engine.getCellRaw(state.selected), false);
      }
    });

    formulaInput.addEventListener('input', () => {
      if (!state.editing) {
        beginEdit(formulaInput.value, false);
        return;
      }
      updateDraft(formulaInput.value);
    });

    formulaInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit('down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(event.shiftKey ? 'left' : 'right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
        focusSelectedCell();
      }
    });

    document.addEventListener('keydown', (event) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const meta = isMac ? event.metaKey : event.ctrlKey;
      if (meta && !state.editing && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'y' || event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (meta && !event.shiftKey) {
        return;
      }

      if (state.editing) {
        if (event.target && event.target.classList && event.target.classList.contains('cell-editor')) {
          return;
        }
        return;
      }

      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        beginEdit(engine.getCellRaw(state.selected), true);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(keyToDirection(event.key), event.shiftKey);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (!event.altKey && event.key.length === 1) {
        event.preventDefault();
        beginEdit(event.key, true);
      }
    });

    document.addEventListener('copy', (event) => {
      if (state.editing) {
        return;
      }
      const matrix = selectionToMatrix();
      const serialized = serializeMatrix(matrix);
      event.preventDefault();
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', serialized);
      }
      state.clipboard = {
        matrix: matrix,
        sourceBox: getSelectionBox(),
        serialized: serialized,
        cut: false
      };
    });

    document.addEventListener('cut', (event) => {
      if (state.editing) {
        return;
      }
      const matrix = selectionToMatrix();
      const serialized = serializeMatrix(matrix);
      event.preventDefault();
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', serialized);
      }
      state.clipboard = {
        matrix: matrix,
        sourceBox: getSelectionBox(),
        serialized: serialized,
        cut: true
      };
    });

    document.addEventListener('paste', (event) => {
      if (state.editing) {
        return;
      }
      const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
      const payload = state.clipboard && text === state.clipboard.serialized
        ? state.clipboard
        : { matrix: parseMatrix(text), cut: false, sourceBox: null };
      if (!payload.matrix.length) {
        return;
      }
      event.preventDefault();
      applyPaste(payload);
    });

    function buildTable(table) {
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'corner';
      headRow.appendChild(corner);
      for (let col = 1; col <= COL_COUNT; col += 1) {
        const th = document.createElement('th');
        th.textContent = columnToLetters(col);
        th.className = 'col-header';
        headRow.appendChild(th);
      }
      head.appendChild(headRow);
      table.appendChild(head);

      const body = document.createElement('tbody');
      for (let row = 1; row <= ROW_COUNT; row += 1) {
        const tr = document.createElement('tr');
        const rowHeader = document.createElement('th');
        rowHeader.textContent = String(row);
        rowHeader.className = 'row-header';
        tr.appendChild(rowHeader);
        for (let col = 1; col <= COL_COUNT; col += 1) {
          const td = document.createElement('td');
          const cellId = toCellId(col, row);
          td.dataset.cellId = cellId;
          td.tabIndex = -1;
          td.className = 'cell';
          tr.appendChild(td);
        }
        body.appendChild(tr);
      }
      table.appendChild(body);
    }

    function refreshAll() {
      const cells = sheet.querySelectorAll('[data-cell-id]');
      cells.forEach((cell) => renderCell(cell.dataset.cellId));
      refreshSelection();
    }

    function renderCell(cellId) {
      const cell = getCellNode(cellId);
      if (!cell) {
        return;
      }
      if (state.editing && state.editing.cellId === cellId && state.editing.inCell) {
        renderEditor(cell, state.editing.value);
        return;
      }
      cell.classList.toggle('active', cellId === state.selected);
      cell.classList.toggle('selected-range', isCellInSelection(cellId) && cellId !== state.selected);
      cell.classList.toggle('error', engine.getDisplayValue(cellId).startsWith('#'));
      cell.textContent = engine.getDisplayValue(cellId);
      cell.title = engine.getCellRaw(cellId);
      cell.dataset.align = isNumericLike(engine.getCellRaw(cellId), engine.getDisplayValue(cellId)) ? 'right' : 'left';
    }

    function renderEditor(cell, value) {
      cell.classList.add('active');
      cell.innerHTML = '';
      const input = document.createElement('input');
      input.className = 'cell-editor';
      input.type = 'text';
      input.spellcheck = false;
      input.value = value;
      cell.appendChild(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('input', () => {
        updateDraft(input.value);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit('down');
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitEdit(event.shiftKey ? 'left' : 'right');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
          focusSelectedCell();
        }
      });
    }

    function selectCell(cellId, extend) {
      state.selected = cellId;
      if (extend) {
        state.rangeFocus = cellId;
      } else {
        state.rangeAnchor = cellId;
        state.rangeFocus = cellId;
      }
      refreshSelection();
      persist();
    }

    function refreshSelection() {
      sheet.querySelectorAll('[data-cell-id]').forEach((node) => {
        node.classList.remove('active', 'selected-range');
      });
      const box = getSelectionBox();
      sheet.querySelectorAll('[data-cell-id]').forEach((node) => {
        if (isWithinBox(node.dataset.cellId, box)) {
          node.classList.add(node.dataset.cellId === state.selected ? 'active' : 'selected-range');
        }
      });
      selectionPill.textContent = formatSelectionLabel(box);
      if (!state.editing) {
        formulaInput.value = engine.getCellRaw(state.selected);
      }
    }

    function beginEdit(initialValue, inCell) {
      state.editing = {
        cellId: state.selected,
        original: engine.getCellRaw(state.selected),
        value: initialValue,
        inCell: inCell
      };
      formulaInput.value = initialValue;
      renderCell(state.selected);
      if (!inCell) {
        formulaInput.focus();
        formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
      }
    }

    function updateDraft(value) {
      if (!state.editing) {
        return;
      }
      state.editing.value = value;
      formulaInput.value = value;
      const editor = rootNode.querySelector('.cell-editor');
      if (editor && editor.value !== value) {
        editor.value = value;
      }
    }

    function commitEdit(direction) {
      if (!state.editing) {
        return;
      }
      recordHistory();
      engine.setCell(state.editing.cellId, state.editing.value);
      state.editing = null;
      refreshAll();
      persist();
      if (direction) {
        moveSelection(direction);
      }
    }

    function cancelEdit() {
      if (!state.editing) {
        return;
      }
      state.editing = null;
      refreshAll();
    }

    function moveSelection(direction, extend) {
      const ref = parseCellRef(state.selected);
      let col = ref.col;
      let row = ref.row;
      if (direction === 'up') {
        row = Math.max(1, row - 1);
      } else if (direction === 'down') {
        row = Math.min(ROW_COUNT, row + 1);
      } else if (direction === 'left') {
        col = Math.max(1, col - 1);
      } else if (direction === 'right') {
        col = Math.min(COL_COUNT, col + 1);
      }
      selectCell(toCellId(col, row), extend);
      focusSelectedCell();
    }

    function extendSelection(cellId) {
      state.selected = cellId;
      state.rangeFocus = cellId;
      refreshSelection();
      persist();
    }

    function getSelectionBox() {
      const start = parseCellRef(state.rangeAnchor || state.selected);
      const end = parseCellRef(state.rangeFocus || state.selected);
      return {
        startCol: Math.min(start.col, end.col),
        endCol: Math.max(start.col, end.col),
        startRow: Math.min(start.row, end.row),
        endRow: Math.max(start.row, end.row)
      };
    }

    function isCellInSelection(cellId) {
      return isWithinBox(cellId, getSelectionBox());
    }

    function selectionToMatrix() {
      const box = getSelectionBox();
      const rows = [];
      for (let row = box.startRow; row <= box.endRow; row += 1) {
        const values = [];
        for (let col = box.startCol; col <= box.endCol; col += 1) {
          values.push(engine.getCellRaw(toCellId(col, row)));
        }
        rows.push(values);
      }
      return rows;
    }

    function clearSelection() {
      recordHistory();
      const box = getSelectionBox();
      for (let row = box.startRow; row <= box.endRow; row += 1) {
        for (let col = box.startCol; col <= box.endCol; col += 1) {
          engine.setCell(toCellId(col, row), '');
        }
      }
      refreshAll();
      persist();
    }

    function applyPaste(payload) {
      recordHistory();
      const targetBox = getSelectionBox();
      const matrix = payload.matrix;
      const useSelectionBox = matrix.length === targetBox.endRow - targetBox.startRow + 1 && matrix[0].length === targetBox.endCol - targetBox.startCol + 1;
      const targetStart = useSelectionBox ? { col: targetBox.startCol, row: targetBox.startRow } : parseCellRef(state.selected);
      const targetIds = new Set();

      for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
        for (let colOffset = 0; colOffset < matrix[rowOffset].length; colOffset += 1) {
          const targetCol = targetStart.col + colOffset;
          const targetRow = targetStart.row + rowOffset;
          if (targetCol > COL_COUNT || targetRow > ROW_COUNT) {
            continue;
          }
          const targetId = toCellId(targetCol, targetRow);
          const sourceCol = payload.sourceBox ? payload.sourceBox.startCol + colOffset : targetCol;
          const sourceRow = payload.sourceBox ? payload.sourceBox.startRow + rowOffset : targetRow;
          const raw = payload.sourceBox ? shiftFormula(matrix[rowOffset][colOffset], targetCol - sourceCol, targetRow - sourceRow) : matrix[rowOffset][colOffset];
          engine.setCell(targetId, raw);
          targetIds.add(targetId);
        }
      }

      if (payload.cut && payload.sourceBox) {
        for (let row = payload.sourceBox.startRow; row <= payload.sourceBox.endRow; row += 1) {
          for (let col = payload.sourceBox.startCol; col <= payload.sourceBox.endCol; col += 1) {
            const sourceId = toCellId(col, row);
            if (!targetIds.has(sourceId)) {
              engine.setCell(sourceId, '');
            }
          }
        }
        state.clipboard.cut = false;
      }

      state.selected = toCellId(targetStart.col, targetStart.row);
      state.rangeAnchor = state.selected;
      state.rangeFocus = toCellId(
        Math.min(COL_COUNT, targetStart.col + matrix[0].length - 1),
        Math.min(ROW_COUNT, targetStart.row + matrix.length - 1)
      );
      refreshAll();
      persist();
    }

    function createSnapshot() {
      return {
        selected: state.selected,
        rangeAnchor: state.rangeAnchor,
        rangeFocus: state.rangeFocus,
        cells: engine.getCells()
      };
    }

    function restoreSnapshot(snapshot) {
      engine.replaceCells(snapshot.cells || {});
      state.selected = snapshot.selected || 'A1';
      state.rangeAnchor = snapshot.rangeAnchor || state.selected;
      state.rangeFocus = snapshot.rangeFocus || state.selected;
      state.editing = null;
      refreshAll();
      persist();
      focusSelectedCell();
    }

    function recordHistory() {
      state.history.record(createSnapshot());
    }

    function undo() {
      const snapshot = state.history.undo(createSnapshot());
      if (snapshot) {
        restoreSnapshot(snapshot);
      }
    }

    function redo() {
      const snapshot = state.history.redo(createSnapshot());
      if (snapshot) {
        restoreSnapshot(snapshot);
      }
    }

    function focusSelectedCell() {
      const cell = getCellNode(state.selected);
      if (cell) {
        cell.focus();
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    function getCellNode(cellId) {
      return sheet.querySelector('[data-cell-id="' + cellId + '"]');
    }

    function persist() {
      const payload = {
        selected: state.selected,
        cells: engine.getCells()
      };
      storage.setItem(storagePrefix + 'sheet-state', JSON.stringify(payload));
    }
  }

  function isWithinBox(cellId, box) {
    const ref = parseCellRef(cellId);
    return ref.col >= box.startCol && ref.col <= box.endCol && ref.row >= box.startRow && ref.row <= box.endRow;
  }

  function formatSelectionLabel(box) {
    const start = toCellId(box.startCol, box.startRow);
    const end = toCellId(box.endCol, box.endRow);
    return start === end ? start : start + ':' + end;
  }

  function serializeMatrix(matrix) {
    return matrix.map((row) => row.join('\t')).join('\n');
  }

  function parseMatrix(text) {
    if (!text) {
      return [];
    }
    return text.replace(/\r/g, '').split('\n').map((row) => row.split('\t'));
  }

  function loadState(storage, storagePrefix) {
    try {
      const raw = storage.getItem(storagePrefix + 'sheet-state');
      return raw ? JSON.parse(raw) : { selected: 'A1', cells: {} };
    } catch (error) {
      return { selected: 'A1', cells: {} };
    }
  }

  function getStoragePrefix() {
    return String(
      (typeof window !== 'undefined' && (window.__BENCHMARK_STORAGE_NAMESPACE__ || window.BENCHMARK_STORAGE_NAMESPACE)) ||
      'spreadsheet:'
    );
  }

  function keyToDirection(key) {
    return key.replace('Arrow', '').toLowerCase();
  }

  function createHistoryManager(limit) {
    const undoStack = [];
    const redoStack = [];

    return {
      record: function (snapshot) {
        undoStack.push(cloneSnapshot(snapshot));
        if (undoStack.length > limit) {
          undoStack.shift();
        }
        redoStack.length = 0;
      },
      undo: function (current) {
        if (!undoStack.length) {
          return null;
        }
        const snapshot = undoStack.pop();
        redoStack.push(cloneSnapshot(current));
        return cloneSnapshot(snapshot);
      },
      redo: function (current) {
        if (!redoStack.length) {
          return null;
        }
        const snapshot = redoStack.pop();
        undoStack.push(cloneSnapshot(current));
        if (undoStack.length > limit) {
          undoStack.shift();
        }
        return cloneSnapshot(snapshot);
      }
    };
  }

  function cloneSnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isNumericLike(raw, display) {
    return raw.startsWith('=') ? /^-?\d/.test(display) : raw.trim() !== '' && Number.isFinite(Number(raw));
  }

  return {
    createEngine: createEngine,
    createApp: createApp,
    createHistoryManager: createHistoryManager,
    shiftFormula: shiftFormula,
    COL_COUNT: COL_COUNT,
    ROW_COUNT: ROW_COUNT
  };
});
