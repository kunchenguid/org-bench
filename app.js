(function () {
  const core = window.SpreadsheetCore;
  const ROWS = 100;
  const COLS = 26;

  const state = {
    cells: {},
    selection: core.normalizeRange({ row: 1, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 1 }),
    dragAnchor: null,
    isDragging: false,
    editor: null,
    cutRange: null,
  };

  const sheet = document.getElementById('sheet');

  function columnLabel(index) {
    return String.fromCharCode(64 + index);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function inRange(range, row, col) {
    return row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col;
  }

  function buildGrid() {
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headRow.appendChild(corner);

    for (let col = 1; col <= COLS; col += 1) {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.textContent = columnLabel(col);
      headRow.appendChild(th);
    }

    head.appendChild(headRow);
    sheet.appendChild(head);

    const body = document.createElement('tbody');
    for (let row = 1; row <= ROWS; row += 1) {
      const tr = document.createElement('tr');
      const header = document.createElement('th');
      header.className = 'row-header';
      header.textContent = row;
      tr.appendChild(header);

      for (let col = 1; col <= COLS; col += 1) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.dataset.row = row;
        td.dataset.col = col;

        const content = document.createElement('div');
        content.className = 'cell-content';
        td.appendChild(content);
        tr.appendChild(td);
      }

      body.appendChild(tr);
    }

    sheet.appendChild(body);
  }

  function cellElement(row, col) {
    return sheet.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]');
  }

  function selectionSize(range) {
    return {
      rows: range.end.row - range.start.row + 1,
      cols: range.end.col - range.start.col + 1,
    };
  }

  function parseClipboardShape(text) {
    const rows = core.parseClipboard(text);
    return {
      rows: rows.length,
      cols: rows[0].length,
    };
  }

  function setSelection(nextSelection) {
    state.selection = nextSelection;
    render();
  }

  function clearCutPreview() {
    state.cutRange = null;
  }

  function render() {
    const cells = sheet.querySelectorAll('.cell');
    cells.forEach((cell) => {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const key = core.cellKey(row, col);
      cell.classList.toggle('in-range', inRange(state.selection, row, col));
      cell.classList.toggle('active', row === state.selection.active.row && col === state.selection.active.col);
      cell.classList.toggle('cut-preview', !!state.cutRange && inRange(state.cutRange, row, col));

      if (!state.editor || state.editor.row !== row || state.editor.col !== col) {
        cell.innerHTML = '<div class="cell-content"></div>';
        cell.firstChild.textContent = state.cells[key] || '';
      }
    });
  }

  function beginEdit(row, col, seedValue, selectContents) {
    const cell = cellElement(row, col);
    if (!cell) {
      return;
    }

    const key = core.cellKey(row, col);
    const input = document.createElement('input');
    input.className = 'editor';
    input.value = seedValue != null ? seedValue : (state.cells[key] || '');
    cell.innerHTML = '';
    cell.appendChild(input);
    state.editor = { row: row, col: col, original: state.cells[key] || '' };
    input.focus();
    if (selectContents) {
      input.select();
    } else {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function commitEdit(move) {
    if (!state.editor) {
      return;
    }

    const { row, col } = state.editor;
    const input = cellElement(row, col).querySelector('input');
    const value = input.value;
    const key = core.cellKey(row, col);
    if (value) {
      state.cells[key] = value;
    } else {
      delete state.cells[key];
    }
    state.editor = null;
    clearCutPreview();
    if (move) {
      setSelection(core.normalizeRange(move, move, move));
    } else {
      render();
    }
  }

  function cancelEdit() {
    if (!state.editor) {
      return;
    }
    state.editor = null;
    render();
  }

  function moveActive(rowDelta, colDelta, extend) {
    if (state.editor) {
      return;
    }

    const nextActive = {
      row: clamp(state.selection.active.row + rowDelta, 1, ROWS),
      col: clamp(state.selection.active.col + colDelta, 1, COLS),
    };
    clearCutPreview();
    if (extend) {
      setSelection(core.extendRange(state.selection, nextActive));
      return;
    }
    setSelection(core.normalizeRange(nextActive, nextActive, nextActive));
  }

  function clearSelection() {
    state.cells = core.clearRange(state.cells, state.selection);
    clearCutPreview();
    render();
  }

  function handlePointerSelection(event) {
    const cell = event.target.closest('.cell');
    if (!cell || state.editor) {
      return;
    }

    const point = {
      row: Number(cell.dataset.row),
      col: Number(cell.dataset.col),
    };

    if (event.shiftKey) {
      setSelection(core.extendRange(state.selection, point));
      return;
    }

    state.dragAnchor = point;
    state.isDragging = true;
    clearCutPreview();
    setSelection(core.normalizeRange(point, point, point));
  }

  function continuePointerSelection(event) {
    if (!state.isDragging || state.editor) {
      return;
    }

    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }

    const point = {
      row: Number(cell.dataset.row),
      col: Number(cell.dataset.col),
    };
    setSelection(core.normalizeRange(state.dragAnchor, point, point));
  }

  function endPointerSelection() {
    state.isDragging = false;
  }

  document.addEventListener('mousedown', handlePointerSelection);
  document.addEventListener('mouseover', continuePointerSelection);
  document.addEventListener('mouseup', endPointerSelection);

  sheet.addEventListener('dblclick', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) {
      return;
    }
    beginEdit(Number(cell.dataset.row), Number(cell.dataset.col), null, true);
  });

  document.addEventListener('keydown', (event) => {
    if (state.editor) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit({ row: clamp(state.editor.row + 1, 1, ROWS), col: state.editor.col });
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit({ row: state.editor.row, col: clamp(state.editor.col + 1, 1, COLS) });
      }
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1, 0, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1, 0, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveActive(0, -1, event.shiftKey);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveActive(0, 1, event.shiftKey);
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(state.selection.active.row, state.selection.active.col, null, true);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      moveActive(0, 1, event.shiftKey);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginEdit(state.selection.active.row, state.selection.active.col, event.key, false);
    }
  });

  document.addEventListener('copy', (event) => {
    if (state.editor) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', core.copyRange(state.cells, state.selection));
    clearCutPreview();
    render();
  });

  document.addEventListener('cut', (event) => {
    if (state.editor) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', core.copyRange(state.cells, state.selection));
    state.cutRange = state.selection;
    render();
  });

  document.addEventListener('paste', (event) => {
    if (state.editor) {
      return;
    }
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }

    const shape = parseClipboardShape(text);
    const currentSize = selectionSize(state.selection);
    const destination = currentSize.rows === shape.rows && currentSize.cols === shape.cols
      ? state.selection
      : core.normalizeRange(state.selection.active, state.selection.active, state.selection.active);

    const result = core.pasteBlock(state.cells, destination, text, {
      cutRange: state.cutRange,
    });
    state.cells = result.cells;
    state.selection = result.range;
    clearCutPreview();
    render();
  });

  buildGrid();
  render();
})();
