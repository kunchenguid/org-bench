(function () {
  const core = window.SpreadsheetCore;
  const engine = core.createEngine(loadState().cells);
  const state = {
    selection: loadState().selection || { row: 1, col: 1 },
    editing: null,
  };

  const app = document.getElementById('app');
  app.innerHTML = [
    '<div class="shell">',
    '  <div class="toolbar">',
    '    <div class="name-box" id="name-box"></div>',
    '    <label class="formula-wrap">',
    '      <span class="fx">fx</span>',
    '      <input id="formula-input" class="formula-input" autocomplete="off" spellcheck="false" />',
    '    </label>',
    '  </div>',
    '  <div class="grid-wrap">',
    '    <table class="sheet" id="sheet"></table>',
    '  </div>',
    '</div>'
  ].join('');

  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.getElementById('name-box');
  const sheet = document.getElementById('sheet');

  renderGrid();
  renderSelection();

  sheet.addEventListener('click', function (event) {
    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }
    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
  });

  sheet.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-cell]');
    if (!cell) {
      return;
    }
    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    startCellEdit(engine.getRawValue(activeKey()));
  });

  formulaInput.addEventListener('focus', function () {
    state.editing = { source: 'formula', draft: engine.getRawValue(activeKey()), original: engine.getRawValue(activeKey()) };
    formulaInput.value = state.editing.draft;
  });

  formulaInput.addEventListener('input', function () {
    if (!state.editing || state.editing.source !== 'formula') {
      state.editing = { source: 'formula', draft: formulaInput.value, original: engine.getRawValue(activeKey()) };
    }
    state.editing.draft = formulaInput.value;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(formulaInput.value);
      focusCell();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      focusCell();
    }
  });

  formulaInput.addEventListener('blur', function () {
    if (state.editing && state.editing.source === 'formula') {
      commitEdit(formulaInput.value);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.target === formulaInput) {
      return;
    }
    if (state.editing && state.editing.source === 'cell') {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && ['c', 'x', 'v', 'z', 'y'].includes(event.key.toLowerCase())) {
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startCellEdit(engine.getRawValue(activeKey()));
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      engine.setCell(activeKey(), '');
      persist();
      renderSelection();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, 0);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, 0);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(0, -1);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'Tab') {
      event.preventDefault();
      moveSelection(0, 1);
      return;
    }

    if (event.key.length === 1 && !event.altKey) {
      event.preventDefault();
      startCellEdit(event.key, true);
    }
  });

  document.addEventListener('copy', function (event) {
    const key = activeKey();
    event.clipboardData.setData('text/plain', engine.getRawValue(key));
    event.preventDefault();
  });

  document.addEventListener('cut', function (event) {
    const key = activeKey();
    event.clipboardData.setData('text/plain', engine.getRawValue(key));
    engine.setCell(key, '');
    persist();
    renderSelection();
    event.preventDefault();
  });

  document.addEventListener('paste', function (event) {
    const text = event.clipboardData.getData('text/plain');
    engine.setCell(activeKey(), text);
    persist();
    renderSelection();
    event.preventDefault();
  });

  function renderGrid() {
    const header = ['<thead><tr><th class="corner"></th>'];
    for (let col = 1; col <= engine.maxCols; col += 1) {
      header.push('<th class="col-header">' + core.createEngine().indexToCol(col) + '</th>');
    }
    header.push('</tr></thead>');

    const body = ['<tbody>'];
    for (let row = 1; row <= engine.maxRows; row += 1) {
      body.push('<tr>');
      body.push('<th class="row-header">' + row + '</th>');
      for (let col = 1; col <= engine.maxCols; col += 1) {
        body.push('<td tabindex="0" class="cell" data-cell="1" data-row="' + row + '" data-col="' + col + '"></td>');
      }
      body.push('</tr>');
    }
    body.push('</tbody>');

    sheet.innerHTML = header.join('') + body.join('');
  }

  function renderSelection() {
    const cells = sheet.querySelectorAll('[data-cell]');
    cells.forEach(function (cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const key = engine.coordsToKey(row, col);
      cell.classList.toggle('active', row === state.selection.row && col === state.selection.col);
      if (!(state.editing && state.editing.source === 'cell' && row === state.selection.row && col === state.selection.col)) {
        cell.textContent = engine.getDisplayValue(key);
        cell.classList.toggle('text', isTextValue(engine.getRawValue(key)));
        cell.classList.toggle('error', /^#/.test(engine.getDisplayValue(key)));
      }
    });

    const active = getActiveCell();
    if (active) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    formulaInput.value = state.editing && state.editing.source === 'formula' ? state.editing.draft : engine.getRawValue(activeKey());
    nameBox.textContent = activeKey();
    persist();
  }

  function isTextValue(raw) {
    return raw && raw[0] !== '=' && Number.isNaN(Number(raw));
  }

  function activeKey() {
    return engine.coordsToKey(state.selection.row, state.selection.col);
  }

  function getActiveCell() {
    return sheet.querySelector('[data-row="' + state.selection.row + '"][data-col="' + state.selection.col + '"]');
  }

  function selectCell(row, col) {
    state.selection = {
      row: Math.max(1, Math.min(engine.maxRows, row)),
      col: Math.max(1, Math.min(engine.maxCols, col)),
    };
    state.editing = null;
    renderSelection();
  }

  function moveSelection(rowDelta, colDelta) {
    selectCell(state.selection.row + rowDelta, state.selection.col + colDelta);
    focusCell();
  }

  function startCellEdit(seed, replace) {
    const active = getActiveCell();
    const original = engine.getRawValue(activeKey());
    const value = replace ? seed : (typeof seed === 'string' ? seed : original);
    state.editing = { source: 'cell', original: original, draft: value };
    active.innerHTML = '<input class="cell-editor" id="cell-editor" autocomplete="off" spellcheck="false" />';
    const input = document.getElementById('cell-editor');
    input.value = value;
    formulaInput.value = value;
    input.focus();
    input.setSelectionRange(replace ? value.length : 0, value.length);
    input.addEventListener('input', function () {
      state.editing.draft = input.value;
      formulaInput.value = input.value;
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(input.value);
        moveSelection(1, 0);
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(input.value);
        moveSelection(0, 1);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
        focusCell();
      }
    });
    input.addEventListener('blur', function () {
      if (state.editing && state.editing.source === 'cell') {
        commitEdit(input.value);
      }
    });
  }

  function commitEdit(value) {
    engine.setCell(activeKey(), value);
    state.editing = null;
    renderSelection();
  }

  function cancelEdit() {
    state.editing = null;
    renderSelection();
  }

  function focusCell() {
    const active = getActiveCell();
    if (active) {
      active.focus();
    }
  }

  function storageNamespace() {
    return window.__BENCHMARK_RUN_NAMESPACE__ || window.BENCHMARK_RUN_NAMESPACE || document.body.dataset.storageNamespace || 'spreadsheet-local';
  }

  function storageKey() {
    return storageNamespace() + ':sheet-state';
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(storageKey());
      return raw ? JSON.parse(raw) : { cells: {}, selection: { row: 1, col: 1 } };
    } catch (error) {
      return { cells: {}, selection: { row: 1, col: 1 } };
    }
  }

  function persist() {
    window.localStorage.setItem(storageKey(), JSON.stringify({
      cells: engine.getAllRaw(),
      selection: state.selection,
    }));
  }
})();
