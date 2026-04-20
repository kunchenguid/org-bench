(function () {
  const storagePrefix = window.__BENCHMARK_RUN_NAMESPACE__ || 'facebook-sheet';
  const storageKey = storagePrefix + ':sheet-state';
  const core = window.SpreadsheetCore;
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.querySelector('.name-box');
  const sheetRoot = document.getElementById('sheet-root');

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return {
        cells: parsed.cells || {},
        selectedCell: parsed.selectedCell || 'A1',
      };
    } catch (error) {
      return { cells: {}, selectedCell: 'A1' };
    }
  }

  const state = {
    sheet: core.createSheet(loadState().cells),
    selectedCell: loadState().selectedCell,
    editingCell: null,
    pendingValue: '',
  };

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify({
      cells: state.sheet.getStoredCells(),
      selectedCell: state.selectedCell,
    }));
  }

  function clampSelection(nextCol, nextRow) {
    return {
      col: Math.max(0, Math.min(core.COLUMN_COUNT - 1, nextCol)),
      row: Math.max(0, Math.min(core.ROW_COUNT - 1, nextRow)),
    };
  }

  function updateFormulaBar() {
    nameBox.textContent = state.selectedCell;
    if (state.editingCell === 'formula') {
      formulaInput.value = state.pendingValue;
      return;
    }
    formulaInput.value = state.sheet.getCellRaw(state.selectedCell);
  }

  function moveSelection(colDelta, rowDelta) {
    const current = core.decodeCellId(state.selectedCell);
    const next = clampSelection(current.col + colDelta, current.row + rowDelta);
    selectCell(core.encodeCellId(next.col, next.row));
  }

  function selectCell(cellId) {
    state.selectedCell = cellId;
    if (state.editingCell && state.editingCell !== 'formula') {
      stopEditing(true);
    }
    render();
    saveState();
  }

  function startEditing(cellId, preserveValue) {
    state.editingCell = cellId;
    state.pendingValue = preserveValue ? state.sheet.getCellRaw(cellId) : '';
    render();
    const input = document.querySelector(`[data-cell-input="${cellId}"]`);
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function startFormulaEditing() {
    state.editingCell = 'formula';
    state.pendingValue = state.sheet.getCellRaw(state.selectedCell);
    updateFormulaBar();
    formulaInput.focus();
    formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
  }

  function commitEdit(moveAfterCommit) {
    if (!state.editingCell) {
      return;
    }
    state.sheet.setCellRaw(state.selectedCell, state.pendingValue);
    state.editingCell = null;
    state.pendingValue = '';
    render();
    saveState();
    if (moveAfterCommit) {
      moveSelection(moveAfterCommit.col, moveAfterCommit.row);
    }
  }

  function stopEditing(restore) {
    if (!state.editingCell) {
      return;
    }
    if (!restore) {
      commitEdit(null);
      return;
    }
    state.editingCell = null;
    state.pendingValue = '';
    render();
  }

  function renderCell(cellId) {
    const computed = state.sheet.getComputedCell(cellId);
    const isActive = state.selectedCell === cellId;
    const isEditing = state.editingCell === cellId;
    const raw = isEditing ? state.pendingValue : state.sheet.getCellRaw(cellId);
    const classes = ['cell'];
    if (isActive) {
      classes.push('active');
    }
    if (isEditing) {
      classes.push('editing');
    }
    if (computed.error) {
      classes.push('error');
    }
    return `
      <td class="${classes.join(' ')}" data-cell="${cellId}" tabindex="0">
        <div class="cell-display">${escapeHtml(computed.display)}</div>
        <input class="cell-input" data-cell-input="${cellId}" value="${escapeHtmlAttribute(raw)}" spellcheck="false">
      </td>
    `;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtmlAttribute(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  function render() {
    let html = '<table class="sheet-table"><thead><tr><th class="corner"></th>';
    for (let col = 0; col < core.COLUMN_COUNT; col += 1) {
      html += `<th class="col-header">${core.indexToColumnLabel(col)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (let row = 0; row < core.ROW_COUNT; row += 1) {
      html += `<tr><th class="row-header">${row + 1}</th>`;
      for (let col = 0; col < core.COLUMN_COUNT; col += 1) {
        html += renderCell(core.encodeCellId(col, row));
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    sheetRoot.innerHTML = html;
    updateFormulaBar();
  }

  sheetRoot.addEventListener('click', function (event) {
    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }
    selectCell(cell.getAttribute('data-cell'));
  });

  sheetRoot.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }
    const cellId = cell.getAttribute('data-cell');
    selectCell(cellId);
    startEditing(cellId, true);
  });

  sheetRoot.addEventListener('input', function (event) {
    const input = event.target.closest('[data-cell-input]');
    if (!input) {
      return;
    }
    state.pendingValue = input.value;
    formulaInput.value = state.pendingValue;
  });

  formulaInput.addEventListener('focus', function () {
    startFormulaEditing();
  });

  formulaInput.addEventListener('input', function (event) {
    if (state.editingCell !== 'formula') {
      state.editingCell = 'formula';
    }
    state.pendingValue = event.target.value;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ col: 0, row: 1 });
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      stopEditing(true);
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit({ col: 1, row: 0 });
    }
  });

  document.addEventListener('keydown', function (event) {
    const decoded = core.decodeCellId(state.selectedCell);
    if (!decoded) {
      return;
    }
    if (state.editingCell && state.editingCell !== 'formula') {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit({ col: 0, row: 1 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit({ col: 1, row: 0 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        stopEditing(true);
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey || event.altKey) && event.key.length === 1) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(-1, 0);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(1, 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(0, -1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(0, 1);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(state.selectedCell, true);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      state.sheet.setCellRaw(state.selectedCell, '');
      render();
      saveState();
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      startEditing(state.selectedCell, false);
      state.pendingValue = event.key;
      const input = document.querySelector(`[data-cell-input="${state.selectedCell}"]`);
      if (input) {
        input.value = state.pendingValue;
      }
      formulaInput.value = state.pendingValue;
    }
  });

  render();
})();
