(function () {
  const ROWS = 100;
  const COLS = 26;
  const STORAGE_NAMESPACE = window.__BENCHMARK_RUN_NAMESPACE__ || 'facebook-spreadsheet';
  const STORAGE_KEY = STORAGE_NAMESPACE + ':sheet-state';
  const core = window.SpreadsheetCore;
  const grid = document.getElementById('spreadsheet-grid');
  const formulaInput = document.getElementById('formula-input');

  const state = loadState();

  renderGrid();
  bindEvents();
  updateFormulaBar();

  function loadState() {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return {
        cells: {},
        selection: { row: 0, col: 0 },
        editing: null,
      };
    }

    try {
      const parsed = JSON.parse(saved);
      return {
        cells: parsed.cells || {},
        selection: core.clampSelection(parsed.selection || { row: 0, col: 0 }, ROWS, COLS),
        editing: null,
      };
    } catch (_error) {
      return {
        cells: {},
        selection: { row: 0, col: 0 },
        editing: null,
      };
    }
  }

  function persistState() {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cells: state.cells,
        selection: state.selection,
      })
    );
  }

  function renderGrid() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createHeaderCell('corner', ''));

    for (let col = 0; col < COLS; col += 1) {
      fragment.appendChild(createHeaderCell('column-header', core.indexToColumnLabel(col)));
    }

    for (let row = 0; row < ROWS; row += 1) {
      fragment.appendChild(createHeaderCell('row-header', String(row + 1)));

      for (let col = 0; col < COLS; col += 1) {
        fragment.appendChild(createCell(row, col));
      }
    }

    grid.innerHTML = '';
    grid.appendChild(fragment);
    updateVisibleSelection();
  }

  function createHeaderCell(className, text) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    return element;
  }

  function createCell(row, col) {
    const element = document.createElement('div');
    const key = cellKey(row, col);
    const raw = state.cells[key] || '';
    const evaluated = evaluateCell(key, new Set());
    const isActive = state.selection.row === row && state.selection.col === col;
    const kind = classifyValue(evaluated);

    element.className = 'cell ' + kind + (isActive ? ' active' : '');
    element.dataset.row = String(row);
    element.dataset.col = String(col);
    element.dataset.key = key;
    element.tabIndex = -1;
    element.title = raw;

    if (state.editing === key) {
      const input = document.createElement('input');
      input.value = raw;
      input.dataset.editor = key;
      element.appendChild(input);
      queueMicrotask(function () {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    } else {
      element.textContent = formatValue(evaluated);
    }

    return element;
  }

  function bindEvents() {
    grid.addEventListener('click', function (event) {
      const cell = event.target.closest('.cell');
      if (!cell) {
        return;
      }

      selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    });

    grid.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('.cell');
      if (!cell) {
        return;
      }

      startEditing(cell.dataset.key);
    });

    grid.addEventListener('keydown', handleGridKeydown);
    document.addEventListener('keydown', handleDocumentKeydown);

    grid.addEventListener('input', function (event) {
      if (!event.target.matches('input[data-editor]')) {
        return;
      }

      formulaInput.value = event.target.value;
    });

    grid.addEventListener('keydown', function (event) {
      if (!event.target.matches('input[data-editor]')) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        commitEditing(event.target.dataset.editor, event.target.value, { rowDelta: 1, colDelta: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEditing(event.target.dataset.editor, event.target.value, { rowDelta: 0, colDelta: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });

    formulaInput.addEventListener('focus', function () {
      startEditing(currentKey());
    });

    formulaInput.addEventListener('input', function () {
      if (state.editing !== currentKey()) {
        startEditing(currentKey());
      }

      const input = grid.querySelector('input[data-editor="' + currentKey() + '"]');
      if (input) {
        input.value = formulaInput.value;
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEditing(currentKey(), formulaInput.value, { rowDelta: 1, colDelta: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEditing(currentKey(), formulaInput.value, { rowDelta: 0, colDelta: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
  }

  function handleGridKeydown(event) {
    const printable = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;

    if (printable && state.editing === null) {
      event.preventDefault();
      state.cells[currentKey()] = event.key;
      state.editing = currentKey();
      renderGrid();
      updateFormulaBar();
      persistState();
    }
  }

  function handleDocumentKeydown(event) {
    if (event.target === formulaInput || event.target.matches('input[data-editor]')) {
      return;
    }

    const moves = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    };

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(currentKey());
      return;
    }

    if (moves[event.key]) {
      event.preventDefault();
      moveSelection(moves[event.key].row, moves[event.key].col);
    }
  }

  function selectCell(row, col) {
    state.selection = core.clampSelection({ row: row, col: col }, ROWS, COLS);
    state.editing = null;
    updateVisibleSelection();
    updateFormulaBar();
    persistState();
  }

  function moveSelection(rowDelta, colDelta) {
    state.selection = core.clampSelection(
      {
        row: state.selection.row + rowDelta,
        col: state.selection.col + colDelta,
      },
      ROWS,
      COLS
    );
    state.editing = null;
    updateVisibleSelection();
    updateFormulaBar();
    persistState();
  }

  function startEditing(key) {
    state.editing = key;
    renderGrid();
    formulaInput.focus();
    formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
  }

  function commitEditing(key, value, move) {
    if (value) {
      state.cells[key] = value;
    } else {
      delete state.cells[key];
    }

    state.editing = null;
    moveSelection(move.rowDelta, move.colDelta);
    renderGrid();
    persistState();
  }

  function cancelEditing() {
    state.editing = null;
    renderGrid();
    updateFormulaBar();
  }

  function updateFormulaBar() {
    formulaInput.value = state.cells[currentKey()] || '';
  }

  function updateVisibleSelection() {
    const cells = grid.querySelectorAll('.cell');
    for (const cell of cells) {
      const isActive = Number(cell.dataset.row) === state.selection.row && Number(cell.dataset.col) === state.selection.col;
      cell.classList.toggle('active', isActive);
    }
  }

  function cellKey(row, col) {
    return core.indexToColumnLabel(col) + String(row + 1);
  }

  function currentKey() {
    return cellKey(state.selection.row, state.selection.col);
  }

  function classifyValue(value) {
    if (typeof value === 'string' && value.startsWith('#')) {
      return 'error';
    }

    return typeof value === 'number' ? 'number' : 'text';
  }

  function formatValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return String(value);
  }

  function evaluateCell(key, stack) {
    if (stack.has(key)) {
      return '#CIRC!';
    }

    const raw = state.cells[key] || '';
    if (!raw) {
      return '';
    }

    if (raw.charAt(0) !== '=') {
      const asNumber = Number(raw);
      return Number.isFinite(asNumber) && raw.trim() !== '' ? asNumber : raw;
    }

    stack.add(key);
    try {
      return evaluateFormula(raw.slice(1), stack);
    } catch (error) {
      return error && error.message ? error.message : '#ERR!';
    } finally {
      stack.delete(key);
    }
  }

  function evaluateFormula(formula, stack) {
    const strings = [];
    let expression = formula.replace(/"([^"\\]|\\.)*"/g, function (match) {
      const token = '__STR' + strings.length + '__';
      strings.push(match);
      return token;
    });

    expression = expression
      .replace(/<>/g, '!=')
      .replace(/(^|[^<>!])=([^=])/g, '$1==$2')
      .replace(/&/g, '+');

    expression = expression.replace(/\b(TRUE|FALSE)\b/gi, function (match) {
      return match.toUpperCase() === 'TRUE' ? 'true' : 'false';
    });

    expression = expression.replace(/\b([A-Z]+\d+):([A-Z]+\d+)\b/g, function (_match, startRef, endRef) {
      return 'RANGE("' + startRef + ':' + endRef + '")';
    });

    expression = expression.replace(/\b([A-Z]+\d+)\b/g, function (_match, ref) {
      return 'REF("' + ref + '")';
    });

    expression = expression.replace(/\b(SUM|AVERAGE|MIN|MAX|COUNT|IF|AND|OR|NOT|ABS|ROUND|CONCAT)\s*\(/gi, function (match, name) {
      return 'FN.' + name.toUpperCase() + '(';
    });

    expression = expression.replace(/__STR(\d+)__/g, function (_match, index) {
      return strings[Number(index)];
    });

    const FN = {
      SUM: function () {
        return flatten(arguments).reduce(function (sum, value) {
          return sum + toNumber(value);
        }, 0);
      },
      AVERAGE: function () {
        const values = flatten(arguments).map(toNumber);
        return values.length ? FN.SUM(values) / values.length : 0;
      },
      MIN: function () {
        const values = flatten(arguments).map(toNumber);
        return values.length ? Math.min.apply(null, values) : 0;
      },
      MAX: function () {
        const values = flatten(arguments).map(toNumber);
        return values.length ? Math.max.apply(null, values) : 0;
      },
      COUNT: function () {
        return flatten(arguments).filter(function (value) {
          return value !== '' && value !== null && value !== undefined;
        }).length;
      },
      IF: function (condition, whenTrue, whenFalse) {
        return condition ? whenTrue : whenFalse;
      },
      AND: function () {
        return flatten(arguments).every(Boolean);
      },
      OR: function () {
        return flatten(arguments).some(Boolean);
      },
      NOT: function (value) {
        return !value;
      },
      ABS: function (value) {
        return Math.abs(toNumber(value));
      },
      ROUND: function (value, digits) {
        const places = digits ? toNumber(digits) : 0;
        const factor = Math.pow(10, places);
        return Math.round(toNumber(value) * factor) / factor;
      },
      CONCAT: function () {
        return flatten(arguments).join('');
      },
    };

    const REF = function (ref) {
      const parsed = parseRef(ref);
      if (!parsed || parsed.row < 0 || parsed.row >= ROWS || parsed.col < 0 || parsed.col >= COLS) {
        throw new Error('#REF!');
      }

      const value = evaluateCell(ref, stack);
      return value === '' ? 0 : value;
    };

    const RANGE = function (range) {
      const parts = range.split(':');
      const start = parseRef(parts[0]);
      const end = parseRef(parts[1]);
      const values = [];

      for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
        for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col += 1) {
          values.push(evaluateCell(cellKey(row, col), stack));
        }
      }

      return values;
    };

    try {
      const result = Function('REF', 'RANGE', 'FN', 'return (' + expression + ');')(REF, RANGE, FN);
      return result === undefined ? '' : result;
    } catch (error) {
      if (error && error.message === '#REF!') {
        throw error;
      }
      if (error instanceof RangeError) {
        throw new Error('#CIRC!');
      }
      throw new Error('#ERR!');
    }
  }

  function parseRef(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!match) {
      return null;
    }

    return {
      col: core.columnLabelToIndex(match[1]),
      row: Number(match[2]) - 1,
    };
  }

  function flatten(itemsLike) {
    const values = [];

    for (const item of Array.from(itemsLike)) {
      if (Array.isArray(item)) {
        values.push.apply(values, item);
      } else {
        values.push(item);
      }
    }

    return values;
  }

  function toNumber(value) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
})();
