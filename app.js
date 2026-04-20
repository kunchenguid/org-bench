(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root && typeof document !== 'undefined') {
    root.SpreadsheetApp = api;
    document.addEventListener('DOMContentLoaded', function () {
      api.mountSpreadsheet(document);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const ROWS = 100;
  const COLS = 26;
  const ERROR_DIV_ZERO = '#DIV/0!';
  const ERROR_GENERIC = '#ERR!';
  const ERROR_CIRCULAR = '#CIRC!';

  function createSpreadsheetCore(options) {
    const rows = options && options.rows ? options.rows : ROWS;
    const cols = options && options.cols ? options.cols : COLS;
    const cells = new Map();
    let evaluationCache = new Map();

    function setCell(cellId, raw) {
      const value = raw == null ? '' : String(raw);
      if (value) {
        cells.set(cellId, value);
      } else {
        cells.delete(cellId);
      }
      evaluationCache = new Map();
    }

    function getCellRaw(cellId) {
      return cells.get(cellId) || '';
    }

    function exportState() {
      return Object.fromEntries(cells.entries());
    }

    function importState(nextCells) {
      cells.clear();
      for (const [cellId, raw] of Object.entries(nextCells || {})) {
        if (raw != null && raw !== '') {
          cells.set(cellId, String(raw));
        }
      }
      evaluationCache = new Map();
    }

    function getCellDisplay(cellId) {
      const evaluated = evaluateCell(cellId, []);
      return displayValue(evaluated.value);
    }

    function getCellKind(cellId) {
      const raw = getCellRaw(cellId);
      const evaluated = evaluateCell(cellId, []);
      if (isErrorValue(evaluated.value)) {
        return 'error';
      }
      if (raw.startsWith('=')) {
        return typeof evaluated.value === 'number' ? 'formula-number' : 'formula-text';
      }
      return typeof parseLooseNumber(raw) === 'number' ? 'number' : 'text';
    }

    function evaluateCell(cellId, stack) {
      if (evaluationCache.has(cellId)) {
        return evaluationCache.get(cellId);
      }
      if (stack.indexOf(cellId) !== -1) {
        return { value: ERROR_CIRCULAR };
      }

      const raw = getCellRaw(cellId);
      let result;
      if (!raw) {
        result = { value: '' };
      } else if (raw.charAt(0) !== '=') {
        const numberValue = parseLooseNumber(raw);
        result = { value: numberValue == null ? raw : numberValue };
      } else {
        try {
          const tokens = tokenizeFormula(raw.slice(1));
          const parser = createParser(tokens);
          const ast = parser.parseExpression();
          if (!parser.isAtEnd()) {
            throw new Error('Unexpected token');
          }
          result = { value: evaluateNode(ast, stack.concat(cellId), evaluateCell) };
        } catch (error) {
          result = { value: normalizeError(error) };
        }
      }

      evaluationCache.set(cellId, result);
      return result;
    }

    return {
      rows: rows,
      cols: cols,
      setCell: setCell,
      getCellRaw: getCellRaw,
      getCellDisplay: getCellDisplay,
      getCellKind: getCellKind,
      exportState: exportState,
      importState: importState,
    };
  }

  function tokenizeFormula(input) {
    const tokens = [];
    let index = 0;
    while (index < input.length) {
      const char = input.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      const twoChar = input.slice(index, index + 2);
      if (twoChar === '>=' || twoChar === '<=' || twoChar === '!=' || twoChar === '==') {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/(),:><'.indexOf(char) !== -1) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      const numberMatch = input.slice(index).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: numberMatch[0] });
        index += numberMatch[0].length;
        continue;
      }

      const identifierMatch = input.slice(index).match(/^[A-Za-z]+\d*/);
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0].toUpperCase() });
        index += identifierMatch[0].length;
        continue;
      }

      throw new Error('Invalid token');
    }
    return tokens;
  }

  function createParser(tokens) {
    let current = 0;

    function currentToken() {
      return tokens[current];
    }

    function matchOperator() {
      const values = Array.prototype.slice.call(arguments);
      const token = currentToken();
      if (token && token.type === 'operator' && values.indexOf(token.value) !== -1) {
        current += 1;
        return token;
      }
      return null;
    }

    function consumeOperator(value) {
      const token = matchOperator(value);
      if (!token) {
        throw new Error('Expected ' + value);
      }
      return token;
    }

    function parseExpression() {
      return parseComparison();
    }

    function parseComparison() {
      let expression = parseAdditive();
      while (true) {
        const operator = matchOperator('>', '<', '>=', '<=', '==', '!=');
        if (!operator) {
          return expression;
        }
        expression = {
          type: 'binary',
          operator: operator.value,
          left: expression,
          right: parseAdditive(),
        };
      }
    }

    function parseAdditive() {
      let expression = parseMultiplicative();
      while (true) {
        const operator = matchOperator('+', '-');
        if (!operator) {
          return expression;
        }
        expression = {
          type: 'binary',
          operator: operator.value,
          left: expression,
          right: parseMultiplicative(),
        };
      }
    }

    function parseMultiplicative() {
      let expression = parseUnary();
      while (true) {
        const operator = matchOperator('*', '/');
        if (!operator) {
          return expression;
        }
        expression = {
          type: 'binary',
          operator: operator.value,
          left: expression,
          right: parseUnary(),
        };
      }
    }

    function parseUnary() {
      const operator = matchOperator('-');
      if (operator) {
        return { type: 'unary', operator: operator.value, argument: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = currentToken();
      if (!token) {
        throw new Error('Unexpected end of formula');
      }

      if (token.type === 'number') {
        current += 1;
        return { type: 'number', value: Number(token.value) };
      }

      if (token.type === 'identifier') {
        current += 1;
        const identifier = token.value;
        if (matchOperator('(')) {
          const args = [];
          if (!matchOperator(')')) {
            do {
              args.push(parseExpression());
            } while (matchOperator(','));
            consumeOperator(')');
          }
          return { type: 'call', name: identifier, args: args };
        }

        if (isCellReference(identifier) && matchOperator(':')) {
          const end = currentToken();
          if (!end || end.type !== 'identifier' || !isCellReference(end.value)) {
            throw new Error('Invalid range');
          }
          current += 1;
          return { type: 'range', start: identifier, end: end.value };
        }

        if (isCellReference(identifier)) {
          return { type: 'cell', ref: identifier };
        }

        throw new Error('Unknown identifier');
      }

      if (matchOperator('(')) {
        const expression = parseExpression();
        consumeOperator(')');
        return expression;
      }

      throw new Error('Unexpected token');
    }

    function isAtEnd() {
      return current >= tokens.length;
    }

    return {
      parseExpression: parseExpression,
      isAtEnd: isAtEnd,
    };
  }

  function evaluateNode(node, stack, evaluateCell) {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'cell':
        return readCellValue(node.ref, stack, evaluateCell);
      case 'range':
        return expandRange(node.start, node.end).map(function (cellId) {
          return readCellValue(cellId, stack, evaluateCell);
        });
      case 'unary': {
        const value = evaluateNode(node.argument, stack, evaluateCell);
        throwIfError(value);
        return -coerceNumber(value);
      }
      case 'binary':
        return evaluateBinary(node, stack, evaluateCell);
      case 'call':
        return evaluateFunction(node, stack, evaluateCell);
      default:
        throw new Error('Unsupported node');
    }
  }

  function evaluateBinary(node, stack, evaluateCell) {
    const left = evaluateNode(node.left, stack, evaluateCell);
    const right = evaluateNode(node.right, stack, evaluateCell);
    throwIfError(left);
    throwIfError(right);

    switch (node.operator) {
      case '+':
        return coerceNumber(left) + coerceNumber(right);
      case '-':
        return coerceNumber(left) - coerceNumber(right);
      case '*':
        return coerceNumber(left) * coerceNumber(right);
      case '/': {
        const denominator = coerceNumber(right);
        if (denominator === 0) {
          return ERROR_DIV_ZERO;
        }
        return coerceNumber(left) / denominator;
      }
      case '>':
        return compareValues(left, right) > 0 ? 1 : 0;
      case '<':
        return compareValues(left, right) < 0 ? 1 : 0;
      case '>=':
        return compareValues(left, right) >= 0 ? 1 : 0;
      case '<=':
        return compareValues(left, right) <= 0 ? 1 : 0;
      case '==':
        return compareValues(left, right) === 0 ? 1 : 0;
      case '!=':
        return compareValues(left, right) !== 0 ? 1 : 0;
      default:
        throw new Error('Unsupported operator');
    }
  }

  function evaluateFunction(node, stack, evaluateCell) {
    const name = node.name;
    const args = node.args.map(function (arg) {
      return evaluateNode(arg, stack, evaluateCell);
    });
    if (args.some(isErrorValue)) {
      return args.find(isErrorValue);
    }

    if (name === 'IF') {
      if (args.length !== 3) {
        throw new Error('Bad IF');
      }
      return truthy(args[0]) ? args[1] : args[2];
    }

    const values = flattenArgs(args);
    switch (name) {
      case 'SUM':
        return values.reduce(function (sum, value) {
          return sum + coerceNumber(value);
        }, 0);
      case 'AVERAGE':
        return values.length ? values.reduce(function (sum, value) {
          return sum + coerceNumber(value);
        }, 0) / values.length : 0;
      case 'MIN':
        return values.length ? Math.min.apply(Math, values.map(coerceNumber)) : 0;
      case 'MAX':
        return values.length ? Math.max.apply(Math, values.map(coerceNumber)) : 0;
      case 'COUNT':
        return values.filter(function (value) {
          return !isErrorValue(value) && coerceCountable(value);
        }).length;
      default:
        throw new Error('Unknown function');
    }
  }

  function readCellValue(cellId, stack, evaluateCell) {
    const evaluated = evaluateCell(cellId, stack).value;
    if (evaluated === '') {
      return 0;
    }
    return evaluated;
  }

  function flattenArgs(args) {
    const values = [];
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const value of arg) {
          values.push(value);
        }
      } else {
        values.push(arg);
      }
    }
    return values;
  }

  function coerceNumber(value) {
    if (isErrorValue(value)) {
      return value;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (value === '' || value == null) {
      return 0;
    }
    const parsed = parseLooseNumber(String(value));
    return parsed == null ? 0 : parsed;
  }

  function coerceCountable(value) {
    if (value === '' || value == null) {
      return false;
    }
    if (typeof value === 'number') {
      return true;
    }
    return parseLooseNumber(String(value)) != null;
  }

  function truthy(value) {
    if (isErrorValue(value)) {
      throw new Error('Invalid condition');
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return Boolean(value);
  }

  function compareValues(left, right) {
    if (typeof left === 'number' || typeof right === 'number') {
      return coerceNumber(left) - coerceNumber(right);
    }
    if (left === right) {
      return 0;
    }
    return String(left) > String(right) ? 1 : -1;
  }

  function throwIfError(value) {
    if (isErrorValue(value)) {
      throw new Error(value);
    }
  }

  function normalizeError(error) {
    if (error && error.message === ERROR_CIRCULAR) {
      return ERROR_CIRCULAR;
    }
    if (error && error.message === ERROR_DIV_ZERO) {
      return ERROR_DIV_ZERO;
    }
    if (error && error.message && error.message.indexOf(ERROR_CIRCULAR) !== -1) {
      return ERROR_CIRCULAR;
    }
    if (error && error.message && error.message.indexOf(ERROR_DIV_ZERO) !== -1) {
      return ERROR_DIV_ZERO;
    }
    return ERROR_GENERIC;
  }

  function isErrorValue(value) {
    return typeof value === 'string' && value.charAt(0) === '#';
  }

  function displayValue(value) {
    if (value == null) {
      return '';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))).replace(/\.0+$/, '');
    }
    return String(value);
  }

  function parseLooseNumber(raw) {
    if (typeof raw !== 'string') {
      return typeof raw === 'number' ? raw : null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
      return null;
    }
    return Number(trimmed);
  }

  function isCellReference(value) {
    return /^[A-Z]+[1-9]\d*$/.test(value);
  }

  function cellIdToCoord(cellId) {
    const match = /^([A-Z]+)([1-9]\d*)$/.exec(cellId);
    if (!match) {
      throw new Error('Invalid cell id');
    }
    let column = 0;
    for (const char of match[1]) {
      column = (column * 26) + (char.charCodeAt(0) - 64);
    }
    return { row: Number(match[2]), col: column };
  }

  function coordToCellId(row, col) {
    return columnLabel(col) + String(row);
  }

  function columnLabel(col) {
    let value = col;
    let label = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }
    return label;
  }

  function expandRange(start, end) {
    const startCoord = cellIdToCoord(start);
    const endCoord = cellIdToCoord(end);
    const minRow = Math.min(startCoord.row, endCoord.row);
    const maxRow = Math.max(startCoord.row, endCoord.row);
    const minCol = Math.min(startCoord.col, endCoord.col);
    const maxCol = Math.max(startCoord.col, endCoord.col);
    const cells = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        cells.push(coordToCellId(row, col));
      }
    }
    return cells;
  }

  function getStorageNamespace(document, env) {
    const source = env || root || {};
    const candidates = [
      source.__BENCHMARK_STORAGE_NAMESPACE__,
      source.BENCHMARK_STORAGE_NAMESPACE,
      source.__BENCHMARK_RUN_NAMESPACE__,
      source.BENCHMARK_RUN_NAMESPACE,
      source.__RUN_NAMESPACE__,
      source.RUN_NAMESPACE,
      source.__storageNamespace,
      source.storageNamespace,
      document.documentElement.getAttribute('data-storage-namespace'),
      document.body && document.body.getAttribute('data-storage-namespace'),
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate) {
        return candidate;
      }
    }
    return 'spreadsheet:';
  }

  function mountSpreadsheet(document) {
    const sheet = document.getElementById('sheet');
    const formulaInput = document.getElementById('formula-input');
    const nameBox = document.getElementById('name-box');
    const scrollContainer = document.getElementById('sheet-scroll');
    if (!sheet || !formulaInput || !nameBox || !scrollContainer) {
      return;
    }

    const core = createSpreadsheetCore({ rows: ROWS, cols: COLS });
    const namespace = getStorageNamespace(document, root);
    const storageKeys = {
      cells: namespace + 'cells',
      selection: namespace + 'selection',
    };

    let selected = { row: 1, col: 1 };
    let editing = null;

    restoreState();
    renderSheet();
    updateSelectionUI();
    updateFormulaBar();
    scrollSelectedIntoView();

    sheet.addEventListener('click', function (event) {
      const cell = event.target.closest('[data-cell-id]');
      if (!cell) {
        return;
      }
      if (editing && editing.source === 'cell' && editing.cellId === cell.dataset.cellId) {
        return;
      }
      commitEdit(false);
      selected = cellIdToCoord(cell.dataset.cellId);
      updateSelectionUI();
      updateFormulaBar();
      scrollSelectedIntoView();
    });

    sheet.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('[data-cell-id]');
      if (!cell) {
        return;
      }
      commitEdit(false);
      selected = cellIdToCoord(cell.dataset.cellId);
      startCellEdit(core.getCellRaw(cell.dataset.cellId), false);
    });

    formulaInput.addEventListener('focus', function () {
      if (!editing) {
        startFormulaEdit(core.getCellRaw(currentCellId()), true);
      }
    });

    formulaInput.addEventListener('input', function () {
      if (!editing) {
        startFormulaEdit(formulaInput.value, true);
        return;
      }
      editing.value = formulaInput.value;
      syncCellEditor();
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit('down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit('right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
        focusCell();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented) {
        return;
      }

      if (editing && editing.source === 'cell') {
        return;
      }

      if (event.target === formulaInput) {
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        commitEdit(false);
        moveSelection(-1, 0);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        commitEdit(false);
        moveSelection(1, 0);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        commitEdit(false);
        moveSelection(0, -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        commitEdit(false);
        moveSelection(0, 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        startCellEdit(core.getCellRaw(currentCellId()), false);
      } else if (event.key === 'F2') {
        event.preventDefault();
        startCellEdit(core.getCellRaw(currentCellId()), false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(false);
        moveSelection(0, 1);
      } else if (isPrintableKey(event)) {
        event.preventDefault();
        startCellEdit(event.key, true);
      }
    });

    function restoreState() {
      try {
        const savedCells = root.localStorage.getItem(storageKeys.cells);
        if (savedCells) {
          core.importState(JSON.parse(savedCells));
        }
        const savedSelection = root.localStorage.getItem(storageKeys.selection);
        if (savedSelection) {
          const parsed = JSON.parse(savedSelection);
          selected = {
            row: clamp(parsed.row || 1, 1, ROWS),
            col: clamp(parsed.col || 1, 1, COLS),
          };
        }
      } catch (error) {
        // Ignore corrupted persisted state and keep the sheet usable.
      }
    }

    function persistState() {
      root.localStorage.setItem(storageKeys.cells, JSON.stringify(core.exportState()));
      root.localStorage.setItem(storageKeys.selection, JSON.stringify(selected));
    }

    function renderSheet() {
      const fragment = document.createDocumentFragment();
      const headerRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'corner';
      headerRow.appendChild(corner);

      for (let col = 1; col <= COLS; col += 1) {
        const th = document.createElement('th');
        th.className = 'column-header';
        th.dataset.col = String(col);
        th.textContent = columnLabel(col);
        headerRow.appendChild(th);
      }
      fragment.appendChild(headerRow);

      for (let row = 1; row <= ROWS; row += 1) {
        const tr = document.createElement('tr');
        const rowHeader = document.createElement('th');
        rowHeader.className = 'row-header';
        rowHeader.dataset.row = String(row);
        rowHeader.textContent = String(row);
        tr.appendChild(rowHeader);

        for (let col = 1; col <= COLS; col += 1) {
          const td = document.createElement('td');
          td.className = 'cell';
          const cellId = coordToCellId(row, col);
          td.dataset.cellId = cellId;
          td.tabIndex = -1;
          updateCellElement(td, cellId);
          tr.appendChild(td);
        }
        fragment.appendChild(tr);
      }

      sheet.replaceChildren(fragment);
    }

    function updateCellElement(cellElement, cellId) {
      const span = document.createElement('span');
      span.className = 'cell-inner';
      span.textContent = core.getCellDisplay(cellId);
      cellElement.replaceChildren(span);
      cellElement.dataset.kind = core.getCellKind(cellId);
    }

    function updateVisibleCells() {
      for (let row = 1; row <= ROWS; row += 1) {
        for (let col = 1; col <= COLS; col += 1) {
          const cellId = coordToCellId(row, col);
          const cellElement = findCell(cellId);
          if (cellElement) {
            updateCellElement(cellElement, cellId);
          }
        }
      }
      updateSelectionUI();
      updateFormulaBar();
    }

    function updateSelectionUI() {
      const previous = sheet.querySelector('.cell.selected');
      if (previous) {
        previous.classList.remove('selected');
      }
      const previousHeaders = sheet.querySelectorAll('.column-header.selected, .row-header.selected');
      for (const element of previousHeaders) {
        element.classList.remove('selected');
      }

      const cellElement = findCell(currentCellId());
      if (cellElement) {
        cellElement.classList.add('selected');
      }
      const rowHeader = sheet.querySelector('.row-header[data-row="' + selected.row + '"]');
      const colHeader = sheet.querySelector('.column-header[data-col="' + selected.col + '"]');
      if (rowHeader) {
        rowHeader.classList.add('selected');
      }
      if (colHeader) {
        colHeader.classList.add('selected');
      }
      nameBox.textContent = currentCellId();
      persistState();
    }

    function updateFormulaBar() {
      if (editing) {
        formulaInput.value = editing.value;
      } else {
        formulaInput.value = core.getCellRaw(currentCellId());
      }
    }

    function startFormulaEdit(value, preserve) {
      const cellId = currentCellId();
      editing = {
        source: 'formula',
        cellId: cellId,
        original: core.getCellRaw(cellId),
        value: preserve ? value : '',
      };
      formulaInput.value = editing.value;
    }

    function startCellEdit(value, replace) {
      const cellId = currentCellId();
      editing = {
        source: 'cell',
        cellId: cellId,
        original: core.getCellRaw(cellId),
        value: replace ? value : core.getCellRaw(cellId),
      };
      const cellElement = findCell(cellId);
      if (!cellElement) {
        return;
      }
      cellElement.classList.add('selected');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-editor';
      input.value = editing.value;
      cellElement.replaceChildren(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      formulaInput.value = editing.value;

      input.addEventListener('input', function () {
        editing.value = input.value;
        formulaInput.value = editing.value;
      });

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit('down');
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitEdit('right');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
          focusCell();
        }
      });

      input.addEventListener('blur', function () {
        if (editing && editing.source === 'cell' && editing.cellId === cellId) {
          commitEdit(false);
        }
      });
    }

    function syncCellEditor() {
      if (!editing || editing.source !== 'cell') {
        return;
      }
      const cellElement = findCell(editing.cellId);
      const input = cellElement && cellElement.querySelector('.cell-editor');
      if (input && input.value !== editing.value) {
        input.value = editing.value;
      }
    }

    function commitEdit(moveDirection) {
      if (!editing) {
        return;
      }
      core.setCell(editing.cellId, editing.value);
      editing = null;
      updateVisibleCells();
      persistState();
      if (moveDirection === 'down') {
        moveSelection(1, 0);
      } else if (moveDirection === 'right') {
        moveSelection(0, 1);
      }
    }

    function cancelEdit() {
      if (!editing) {
        return;
      }
      editing = null;
      updateVisibleCells();
    }

    function moveSelection(rowDelta, colDelta) {
      selected = {
        row: clamp(selected.row + rowDelta, 1, ROWS),
        col: clamp(selected.col + colDelta, 1, COLS),
      };
      updateSelectionUI();
      updateFormulaBar();
      scrollSelectedIntoView();
    }

    function scrollSelectedIntoView() {
      const cellElement = findCell(currentCellId());
      if (cellElement) {
        cellElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    function currentCellId() {
      return coordToCellId(selected.row, selected.col);
    }

    function findCell(cellId) {
      return sheet.querySelector('[data-cell-id="' + cellId + '"]');
    }

    function focusCell() {
      const cellElement = findCell(currentCellId());
      if (cellElement) {
        cellElement.focus();
      }
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createEmptyState() {
    return {
      cells: {},
      selection: 'A1',
    };
  }

  function evaluateAllCells(cells) {
    const core = createSpreadsheetCore({ rows: ROWS, cols: COLS });
    core.importState(cells || {});
    const evaluated = {};
    for (const cellId of Object.keys(cells || {})) {
      evaluated[cellId] = {
        display: core.getCellDisplay(cellId),
        kind: core.getCellKind(cellId),
      };
    }
    return evaluated;
  }

  function moveSelectionFromId(cellId, direction) {
    const deltaByDirection = {
      left: { row: 0, col: -1 },
      right: { row: 0, col: 1 },
      up: { row: -1, col: 0 },
      down: { row: 1, col: 0 },
    };
    const delta = deltaByDirection[direction] || { row: 0, col: 0 };
    const current = cellIdToCoord(cellId);
    return coordToCellId(
      clamp(current.row + delta.row, 1, ROWS),
      clamp(current.col + delta.col, 1, COLS)
    );
  }

  function defaultNamespace(namespace) {
    return namespace || 'spreadsheet';
  }

  function createStorage(storage, namespace) {
    const key = defaultNamespace(namespace) + ':spreadsheet-state';
    return {
      save: function (state) {
        storage.setItem(key, JSON.stringify(state));
      },
      load: function () {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : createEmptyState();
      },
    };
  }

  function isPrintableKey(event) {
    return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  return {
    createSpreadsheetCore: createSpreadsheetCore,
    createEmptyState: createEmptyState,
    evaluateAllCells: evaluateAllCells,
    moveSelection: moveSelectionFromId,
    createStorage: createStorage,
    defaultNamespace: defaultNamespace,
    getStorageNamespace: getStorageNamespace,
    mountSpreadsheet: mountSpreadsheet,
  };
});
