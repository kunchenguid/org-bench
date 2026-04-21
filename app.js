(function () {
  const core = window.SpreadsheetCore;
  const storageNamespace = window.__RUN_STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'local';
  const model = core.createSpreadsheetModel({
    columns: 26,
    rows: 100,
    storage: window.localStorage,
    storageKey: storageNamespace + ':spreadsheet-state',
  });

  const formulaBar = document.querySelector('[data-formula-bar]');
  const nameBox = document.querySelector('[data-name-box]');
  const gridBody = document.querySelector('[data-grid-body]');
  const scrollFrame = document.querySelector('[data-grid-frame]');
  const editor = document.querySelector('[data-cell-editor]');
  let editingCell = null;
  let previousRaw = '';

  buildGrid();
  model.subscribe(render);
  render();

  function buildGrid() {
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    headerRow.appendChild(corner);

    for (let column = 0; column < 26; column += 1) {
      const th = document.createElement('th');
      th.textContent = core.makeCellKey(0, column).replace(/\d+/g, '');
      th.className = 'column-header';
      headerRow.appendChild(th);
    }
    gridBody.appendChild(headerRow);

    for (let row = 0; row < 100; row += 1) {
      const tr = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.textContent = String(row + 1);
      rowHeader.className = 'row-header';
      tr.appendChild(rowHeader);

      for (let column = 0; column < 26; column += 1) {
        const key = core.makeCellKey(row, column);
        const td = document.createElement('td');
        td.dataset.cell = key;
        td.tabIndex = -1;
        td.className = 'cell';
        td.addEventListener('click', function () {
          model.selectCell(key);
        });
        td.addEventListener('dblclick', function () {
          startEditing(key, model.getCell(key).raw);
        });
        tr.appendChild(td);
      }

      gridBody.appendChild(tr);
    }
  }

  function render() {
    const state = model.getState();
    const activeCell = state.selection.activeCell;

    nameBox.textContent = activeCell;
    if (document.activeElement !== formulaBar) {
      formulaBar.value = model.getCell(activeCell).raw;
    }

    const cells = gridBody.querySelectorAll('[data-cell]');
    cells.forEach(function (cell) {
      const key = cell.dataset.cell;
      const snapshot = model.getCell(key);
      cell.textContent = snapshot.display;
      cell.classList.toggle('active', key === activeCell);
      cell.classList.toggle('numeric', snapshot.kind === 'number');
      cell.classList.toggle('error', Boolean(snapshot.error));
    });

    if (editingCell) {
      positionEditor(editingCell);
    }
  }

  function startEditing(cellKey, seedValue) {
    editingCell = cellKey;
    previousRaw = model.getCell(cellKey).raw;
    editor.hidden = false;
    editor.value = seedValue == null ? previousRaw : seedValue;
    positionEditor(cellKey);
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  function positionEditor(cellKey) {
    const cell = gridBody.querySelector('[data-cell="' + cellKey + '"]');
    if (!cell) {
      return;
    }
    const frameRect = scrollFrame.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    editor.style.width = cellRect.width + 'px';
    editor.style.height = cellRect.height + 'px';
    editor.style.left = cellRect.left - frameRect.left + scrollFrame.scrollLeft + 'px';
    editor.style.top = cellRect.top - frameRect.top + scrollFrame.scrollTop + 'px';
  }

  function stopEditing() {
    editingCell = null;
    editor.hidden = true;
  }

  function commitEditing(move) {
    if (!editingCell) {
      return;
    }
    model.commitCell(editingCell, editor.value, move ? { move: move } : undefined);
    stopEditing();
  }

  function cancelEditing() {
    if (!editingCell) {
      return;
    }
    editor.value = previousRaw;
    stopEditing();
    render();
  }

  formulaBar.addEventListener('focus', function () {
    formulaBar.value = model.getCell(model.getSelection().activeCell).raw;
  });

  formulaBar.addEventListener('input', function () {
    if (!editingCell) {
      startEditing(model.getSelection().activeCell, formulaBar.value);
      return;
    }
    editor.value = formulaBar.value;
  });

  formulaBar.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!editingCell) {
        startEditing(model.getSelection().activeCell, formulaBar.value);
      }
      commitEditing('down');
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
      formulaBar.blur();
    }
  });

  editor.addEventListener('input', function () {
    formulaBar.value = editor.value;
  });

  editor.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing('down');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEditing('right');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (document.activeElement === formulaBar || document.activeElement === editor) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      model.moveSelection('up');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      model.moveSelection('down');
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      model.moveSelection('left');
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      model.moveSelection('right');
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      const key = model.getSelection().activeCell;
      startEditing(key, model.getCell(key).raw);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      model.clearCell(model.getSelection().activeCell);
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      startEditing(model.getSelection().activeCell, event.key);
    }
  });

  window.addEventListener('resize', function () {
    if (editingCell) {
      positionEditor(editingCell);
    }
  });
})();
