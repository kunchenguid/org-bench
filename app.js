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
          return evaluateCell(node.ref, visiting);
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
      getDisplayValue,
      evaluateCell
    };
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

      if ('+-*/&=<>():,$'.includes(char)) {
        tokens.push({ type: char === ',' ? 'comma' : char === '(' || char === ')' ? 'paren' : char === ':' ? 'colon' : char === '$' ? 'dollar' : 'op', value: char });
        index += 1;
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

        if (/^[A-Z]+\d+$/.test(ident)) {
          const cellNode = { type: 'cell', ref: ident };
          if (consume('colon')) {
            const end = expect('ident').value;
            return { type: 'range', start: ident, end };
          }
          return cellNode;
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
    const match = /^([A-Z]+)(\d+)$/.exec(cellId);
    if (!match) {
      throw new Error('bad ref');
    }
    return {
      col: lettersToColumn(match[1]),
      row: Number(match[2])
    };
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
      editing: null
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
      selectCell(cell.dataset.cellId);
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
      if (meta) {
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
        moveSelection(keyToDirection(event.key));
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        engine.setCell(state.selected, '');
        refreshAll();
        persist();
        return;
      }

      if (!event.altKey && event.key.length === 1) {
        event.preventDefault();
        beginEdit(event.key, true);
      }
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

    function selectCell(cellId) {
      state.selected = cellId;
      refreshSelection();
      persist();
    }

    function refreshSelection() {
      sheet.querySelectorAll('.active').forEach((node) => node.classList.remove('active'));
      const activeCell = getCellNode(state.selected);
      if (activeCell) {
        activeCell.classList.add('active');
      }
      selectionPill.textContent = state.selected;
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

    function moveSelection(direction) {
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
      selectCell(toCellId(col, row));
      focusSelectedCell();
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

  function isNumericLike(raw, display) {
    return raw.startsWith('=') ? /^-?\d/.test(display) : raw.trim() !== '' && Number.isFinite(Number(raw));
  }

  return {
    createEngine: createEngine,
    createApp: createApp,
    COL_COUNT: COL_COUNT,
    ROW_COUNT: ROW_COUNT
  };
});
