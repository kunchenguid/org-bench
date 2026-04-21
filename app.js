(function () {
  const core = window.SpreadsheetCore;
  const namespace = core.getStorageNamespace(window);
  const storageKey = core.getStorageKey(namespace);
  const table = document.getElementById('sheet-table');
  const formulaInput = document.getElementById('formula-input');

  let state = core.deserializeState(window.localStorage.getItem(storageKey));
  let editing = null;

  function saveState() {
    window.localStorage.setItem(storageKey, core.serializeState(state));
  }

  function beginEdit(row, col, seedValue) {
    editing = {
      row,
      col,
      value: seedValue != null ? seedValue : core.getCellRaw(state, row, col),
    };
    state = core.setActiveCell(state, row, col);
    render();
    const editor = document.querySelector('[data-editor="true"]');
    if (editor) {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  function commitEdit(nextRowOffset, nextColOffset) {
    if (!editing) {
      return;
    }

    state = core.setCellRaw(state, editing.row, editing.col, editing.value);
    state = core.setActiveCell(state, editing.row, editing.col);
    editing = null;
    if (nextRowOffset || nextColOffset) {
      state = core.moveSelection(state, { row: nextRowOffset, col: nextColOffset });
    }
    saveState();
    render();
  }

  function cancelEdit() {
    editing = null;
    render();
  }

  function updateFormulaBar() {
    if (editing) {
      formulaInput.value = editing.value;
      return;
    }

    formulaInput.value = core.getCellRaw(state, state.active.row, state.active.col);
  }

  function render() {
    const fragment = document.createDocumentFragment();
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    for (let col = 0; col < core.COL_COUNT; col += 1) {
      const th = document.createElement('th');
      th.className = 'col-header';
      th.textContent = core.columnLabel(col);
      headerRow.appendChild(th);
    }

    fragment.appendChild(headerRow);

    for (let row = 0; row < core.ROW_COUNT; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (let col = 0; col < core.COL_COUNT; col += 1) {
        const td = document.createElement('td');
        const isActive = state.active.row === row && state.active.col === col;
        const isEditing = editing && editing.row === row && editing.col === col;
        td.className = 'cell' + (isActive ? ' active' : '') + (isEditing ? ' editing' : '');
        td.dataset.row = String(row);
        td.dataset.col = String(col);

        if (isEditing) {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = editing.value;
          input.dataset.editor = 'true';
          input.addEventListener('input', function (event) {
            editing.value = event.target.value;
            updateFormulaBar();
          });
          input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitEdit(1, 0);
            } else if (event.key === 'Tab') {
              event.preventDefault();
              commitEdit(0, 1);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelEdit();
            }
          });
          td.appendChild(input);
        } else {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = core.getDisplayValue(core.getCellRaw(state, row, col));
          button.addEventListener('click', function () {
            state = core.setActiveCell(state, row, col);
            saveState();
            render();
          });
          button.addEventListener('dblclick', function () {
            beginEdit(row, col);
          });
          td.appendChild(button);
        }

        tr.appendChild(td);
      }

      fragment.appendChild(tr);
    }

    table.replaceChildren(fragment);
    updateFormulaBar();
  }

  document.addEventListener('keydown', function (event) {
    if (event.target === formulaInput || (editing && event.target.closest('.cell'))) {
      return;
    }

    if ((event.metaKey || event.ctrlKey || event.altKey) && event.key !== 'Backspace') {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      state = core.moveSelection(state, { row: -1, col: 0 });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      state = core.moveSelection(state, { row: 1, col: 0 });
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      state = core.moveSelection(state, { row: 0, col: -1 });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      state = core.moveSelection(state, { row: 0, col: 1 });
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(state.active.row, state.active.col);
      return;
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      beginEdit(state.active.row, state.active.col, event.key);
      return;
    } else {
      return;
    }

    saveState();
    render();
  });

  formulaInput.addEventListener('focus', function () {
    beginEdit(state.active.row, state.active.col);
  });

  formulaInput.addEventListener('input', function (event) {
    if (!editing) {
      beginEdit(state.active.row, state.active.col);
    }
    editing.value = event.target.value;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(1, 0);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  render();
})();
