(function () {
  'use strict';

  const core = window.SpreadsheetCore;
  const state = core.createSheetState();

  const refs = {
    formulaBar: document.querySelector('[data-formula-bar]'),
    nameBox: document.querySelector('[data-name-box]'),
    grid: document.querySelector('[data-grid]'),
  };

  let isEditing = false;
  let editTarget = null;

  function selectedKey() {
    return core.cellKey(state.selection.row, state.selection.column);
  }

  function syncFormulaBar() {
    const cell = core.getCell(state, state.selection.row, state.selection.column);
    refs.nameBox.textContent = selectedKey();
    if (!isEditing) {
      refs.formulaBar.value = cell ? cell.raw : '';
    }
  }

  function renderSelection() {
    const current = refs.grid.querySelector('.cell.is-active');
    if (current) {
      current.classList.remove('is-active');
    }

    const next = refs.grid.querySelector(`[data-row="${state.selection.row}"][data-column="${state.selection.column}"]`);
    if (next) {
      next.classList.add('is-active');
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    syncFormulaBar();
  }

  function renderCell(row, column) {
    const cell = refs.grid.querySelector(`[data-row="${row}"][data-column="${column}"]`);
    if (!cell) {
      return;
    }
    cell.textContent = core.getCellDisplay(state, row, column);
    cell.classList.toggle('is-number', /^-?\d+(\.\d+)?$/.test(cell.textContent));
  }

  function buildGrid() {
    const fragment = document.createDocumentFragment();
    const corner = document.createElement('div');
    corner.className = 'corner';
    fragment.appendChild(corner);

    for (let column = 0; column < state.columnCount; column += 1) {
      const header = document.createElement('div');
      header.className = 'header header-column';
      header.textContent = core.columnLabel(column);
      fragment.appendChild(header);
    }

    for (let row = 0; row < state.rowCount; row += 1) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'header header-row';
      rowHeader.textContent = String(row + 1);
      fragment.appendChild(rowHeader);

      for (let column = 0; column < state.columnCount; column += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.setAttribute('aria-label', core.cellKey(row, column));
        cell.addEventListener('click', function () {
          state.selection = { row, column };
          isEditing = false;
          renderSelection();
        });
        cell.addEventListener('dblclick', function () {
          state.selection = { row, column };
          startEditing(false);
        });
        fragment.appendChild(cell);
      }
    }

    refs.grid.appendChild(fragment);
    renderSelection();
  }

  function commitEditing(moveRow, moveColumn) {
    if (!editTarget) {
      return;
    }

    core.commitCellInput(state, editTarget.row, editTarget.column, refs.formulaBar.value);
    renderCell(editTarget.row, editTarget.column);
    isEditing = false;
    editTarget = null;
    core.moveSelection(state, moveRow, moveColumn);
    renderSelection();
  }

  function startEditing(preserveCurrent) {
    editTarget = { row: state.selection.row, column: state.selection.column };
    isEditing = true;
    if (preserveCurrent) {
      const cell = core.getCell(state, editTarget.row, editTarget.column);
      refs.formulaBar.value = cell ? cell.raw : '';
    }
    refs.formulaBar.focus();
    refs.formulaBar.select();
  }

  refs.formulaBar.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing(1, 0);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitEditing(0, 1);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      isEditing = false;
      editTarget = null;
      syncFormulaBar();
      refs.grid.focus();
    }
  });

  refs.formulaBar.addEventListener('input', function () {
    if (!isEditing) {
      editTarget = { row: state.selection.row, column: state.selection.column };
      isEditing = true;
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.target === refs.formulaBar) {
      return;
    }

    const navigation = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };

    if (navigation[event.key]) {
      event.preventDefault();
      core.moveSelection(state, navigation[event.key][0], navigation[event.key][1]);
      isEditing = false;
      renderSelection();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(true);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      refs.formulaBar.value = event.key;
      startEditing(false);
    }
  });

  buildGrid();
})();
