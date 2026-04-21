function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cellKey(row, col) {
  return `${row},${col}`;
}

function cloneState(state) {
  return {
    rows: state.rows,
    cols: state.cols,
    cells: { ...state.cells },
    active: { ...state.active },
    editing: state.editing ? { ...state.editing } : null,
  };
}

function createInitialState(options = {}) {
  return {
    rows: 100,
    cols: 26,
    cells: { ...(options.cells || {}) },
    active: options.active ? { ...options.active } : { row: 0, col: 0 },
    editing: null,
  };
}

function getCellContent(state, row, col) {
  return state.cells[cellKey(row, col)] || '';
}

function setCellContent(state, row, col, value) {
  const next = cloneState(state);
  const key = cellKey(row, col);
  if (value === '') {
    delete next.cells[key];
  } else {
    next.cells[key] = value;
  }
  return next;
}

function beginEdit(state, mode) {
  const next = cloneState(state);
  const original = getCellContent(next, next.active.row, next.active.col);
  next.editing = {
    mode,
    original,
    draft: original,
  };
  return next;
}

function inputText(state, text) {
  const next = cloneState(state);
  if (!next.editing) {
    next.editing = {
      mode: 'cell',
      original: getCellContent(next, next.active.row, next.active.col),
      draft: '',
    };
  }
  next.editing.draft = text;
  return next;
}

function moveSelection(state, direction) {
  const next = cloneState(state);
  const delta = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
    stay: [0, 0],
  }[direction] || [0, 0];

  next.active.row = clamp(next.active.row + delta[0], 0, next.rows - 1);
  next.active.col = clamp(next.active.col + delta[1], 0, next.cols - 1);
  return next;
}

function commitEdit(state, direction) {
  if (!state.editing) {
    return moveSelection(state, direction);
  }

  const withValue = setCellContent(state, state.active.row, state.active.col, state.editing.draft);
  const cleared = cloneState(withValue);
  cleared.editing = null;
  return moveSelection(cleared, direction);
}

function cancelEdit(state) {
  const next = cloneState(state);
  next.editing = null;
  return next;
}

function columnName(index) {
  return String.fromCharCode(65 + index);
}

function displayValue(raw) {
  return raw;
}

function createApp(root) {
  let state = createInitialState();
  let gridBody;
  let formulaInput;
  let cellInput;

  function render() {
    formulaInput.value = state.editing && state.editing.mode === 'formula'
      ? state.editing.draft
      : getCellContent(state, state.active.row, state.active.col);

    Array.from(gridBody.querySelectorAll('.cell')).forEach((cell) => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const active = row === state.active.row && col === state.active.col;
      const raw = getCellContent(state, row, col);

      cell.classList.toggle('is-active', active);
      cell.textContent = active && state.editing && state.editing.mode === 'cell' ? '' : displayValue(raw);
    });

    const activeCell = gridBody.querySelector(`.cell[data-row="${state.active.row}"][data-col="${state.active.col}"]`);
    if (!activeCell) {
      return;
    }

    if (state.editing && state.editing.mode === 'cell') {
      cellInput.value = state.editing.draft;
      activeCell.appendChild(cellInput);
      requestAnimationFrame(() => {
        cellInput.focus();
        cellInput.setSelectionRange(cellInput.value.length, cellInput.value.length);
      });
    }
  }

  function setState(next) {
    state = next;
    render();
  }

  function startEdit(mode) {
    setState(beginEdit(state, mode));
    if (mode === 'formula') {
      requestAnimationFrame(() => {
        formulaInput.focus();
        formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
      });
    }
  }

  function buildGrid() {
    const fragment = document.createDocumentFragment();
    const headerCorner = document.createElement('div');
    headerCorner.className = 'corner';
    fragment.appendChild(headerCorner);

    for (let col = 0; col < state.cols; col += 1) {
      const header = document.createElement('div');
      header.className = 'col-header';
      header.textContent = columnName(col);
      fragment.appendChild(header);
    }

    for (let row = 0; row < state.rows; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      fragment.appendChild(rowHeader);

      for (let col = 0; col < state.cols; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.addEventListener('click', () => {
          setState({ ...state, active: { row, col }, editing: null });
        });
        cell.addEventListener('dblclick', () => {
          setState({ ...state, active: { row, col }, editing: null });
          startEdit('cell');
        });
        fragment.appendChild(cell);
      }
    }

    gridBody.appendChild(fragment);
  }

  function handleNavigation(key) {
    const direction = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }[key];
    if (!direction) {
      return false;
    }
    setState(moveSelection(state, direction));
    return true;
  }

  root.innerHTML = `
    <div class="app-shell">
      <div class="formula-bar">
        <div class="formula-label">fx</div>
        <input class="formula-input" type="text" spellcheck="false" aria-label="Formula bar">
      </div>
      <div class="grid-wrap">
        <div class="grid" role="grid" aria-label="Spreadsheet"></div>
      </div>
    </div>
  `;

  gridBody = root.querySelector('.grid');
  formulaInput = root.querySelector('.formula-input');
  cellInput = document.createElement('input');
  cellInput.type = 'text';
  cellInput.className = 'cell-editor';
  cellInput.spellcheck = false;

  formulaInput.addEventListener('focus', () => {
    if (!state.editing || state.editing.mode !== 'formula') {
      startEdit('formula');
    }
  });
  formulaInput.addEventListener('input', (event) => {
    setState(inputText(state, event.target.value));
  });
  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setState(commitEdit(state, 'down'));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setState(cancelEdit(state));
      formulaInput.blur();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setState(commitEdit(state, event.shiftKey ? 'left' : 'right'));
    }
  });

  cellInput.addEventListener('input', (event) => {
    setState(inputText(state, event.target.value));
  });
  cellInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setState(commitEdit(state, 'down'));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setState(cancelEdit(state));
    } else if (event.key === 'Tab') {
      event.preventDefault();
      setState(commitEdit(state, event.shiftKey ? 'left' : 'right'));
    }
  });

  document.addEventListener('keydown', (event) => {
    const typingKey = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (document.activeElement === formulaInput || document.activeElement === cellInput) {
      return;
    }

    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      startEdit('cell');
      return;
    }

    if (handleNavigation(event.key)) {
      event.preventDefault();
      return;
    }

    if (typingKey) {
      event.preventDefault();
      setState(inputText({ ...state, editing: null }, event.key));
    }
  });

  buildGrid();
  render();

  return {
    getState: () => state,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createInitialState,
    getCellContent,
    commitEdit,
    cancelEdit,
    moveSelection,
    beginEdit,
    inputText,
    createApp,
  };
}

if (typeof window !== 'undefined') {
  window.SpreadsheetApp = {
    createApp,
  };
}
