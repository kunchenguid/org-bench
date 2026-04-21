(function () {
  const storagePrefix = (window.__RUN_STORAGE_NAMESPACE__ || 'facebook-spreadsheet:') + 'sheet:';
  const columns = 26;
  const rows = 100;
  const state = loadState();
  const sheetRoot = document.getElementById('spreadsheet');
  const formulaBar = document.getElementById('formula-bar');

  let editSession = null;

  function cellId(column, row) {
    return FormulaEngine.indexToColumn(column) + String(row + 1);
  }

  function parseSelected() {
    return FormulaEngine.parseCellId(state.selected.replace(/\$/g, ''));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storagePrefix + 'state');
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (error) {
    }

    return {
      cells: {},
      selected: 'A1',
    };
  }

  function persist() {
    localStorage.setItem(storagePrefix + 'state', JSON.stringify(state));
  }

  function getRaw(cell) {
    return state.cells[cell] || '';
  }

  function getDisplay(cell) {
    return FormulaEngine.evaluateFormula(getRaw(cell), {
      cellId: cell,
      getCellRaw: getRaw,
    });
  }

  function setSelected(cell) {
    state.selected = cell;
    if (!editSession || editSession.source !== 'formula') {
      formulaBar.value = getRaw(cell);
    }
    persist();
    render();
  }

  function startEditing(source, seedValue) {
    editSession = {
      cell: state.selected,
      value: seedValue != null ? seedValue : getRaw(state.selected),
      previous: getRaw(state.selected),
      source: source,
    };
    formulaBar.value = editSession.value;
    render();
    if (source === 'cell') {
      const input = sheetRoot.querySelector('[data-editor="true"]');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    } else {
      formulaBar.focus();
      formulaBar.setSelectionRange(formulaBar.value.length, formulaBar.value.length);
    }
  }

  function moveSelection(rowDelta, columnDelta) {
    const current = parseSelected();
    const nextRow = clamp(current.row + rowDelta, 0, rows - 1);
    const nextColumn = clamp(current.column + columnDelta, 0, columns - 1);
    setSelected(cellId(nextColumn, nextRow));
  }

  function commitEdit(moveRow, moveColumn) {
    if (!editSession) {
      return;
    }
    const value = editSession.value;
    if (value) {
      state.cells[editSession.cell] = value;
    } else {
      delete state.cells[editSession.cell];
    }
    editSession = null;
    formulaBar.value = getRaw(state.selected);
    persist();
    render();
    if (moveRow || moveColumn) {
      moveSelection(moveRow || 0, moveColumn || 0);
    }
  }

  function cancelEdit() {
    if (!editSession) {
      return;
    }
    formulaBar.value = editSession.previous;
    editSession = null;
    render();
  }

  function handlePrintableKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) {
      return false;
    }
    startEditing('cell', event.key);
    return true;
  }

  function render() {
    formulaBar.value = editSession && editSession.cell === state.selected ? editSession.value : getRaw(state.selected);
    const table = document.createElement('table');
    table.className = 'sheet';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    for (let column = 0; column < columns; column += 1) {
      const th = document.createElement('th');
      th.textContent = FormulaEngine.indexToColumn(column);
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < rows; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.textContent = String(row + 1);
      tr.appendChild(rowHeader);

      for (let column = 0; column < columns; column += 1) {
        const id = cellId(column, row);
        const td = document.createElement('td');
        const div = document.createElement('div');
        const result = getDisplay(id);
        div.className = 'cell';
        div.dataset.cell = id;
        if (state.selected === id) {
          div.classList.add('selected');
        }
        if (result.error) {
          div.classList.add('error');
        } else if (typeof result.value === 'number') {
          div.classList.add('numeric');
        }

        if (editSession && editSession.cell === id && editSession.source === 'cell') {
          const input = document.createElement('input');
          input.className = 'cell-input';
          input.value = editSession.value;
          input.dataset.editor = 'true';
          input.addEventListener('input', function (event) {
            editSession.value = event.target.value;
            formulaBar.value = editSession.value;
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
          div.appendChild(input);
        } else {
          div.textContent = result.display;
        }

        div.addEventListener('click', function () {
          setSelected(id);
        });
        div.addEventListener('dblclick', function () {
          setSelected(id);
          startEditing('cell');
        });
        td.appendChild(div);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    sheetRoot.replaceChildren(table);
  }

  formulaBar.addEventListener('focus', function () {
    editSession = {
      cell: state.selected,
      value: getRaw(state.selected),
      previous: getRaw(state.selected),
      source: 'formula',
    };
  });

  formulaBar.addEventListener('input', function (event) {
    if (!editSession) {
      editSession = {
        cell: state.selected,
        value: getRaw(state.selected),
        previous: getRaw(state.selected),
        source: 'formula',
      };
    }
    editSession.value = event.target.value;
  });

  formulaBar.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(1, 0);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit(0, 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      formulaBar.blur();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (document.activeElement === formulaBar) {
      return;
    }

    if (editSession && editSession.source === 'cell') {
      return;
    }

    if (handlePrintableKey(event)) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing('cell');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(0, 1);
    }
  });

  render();
})();
