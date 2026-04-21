(function () {
  const core = window.SpreadsheetCore;
  const sheetEl = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const selectedRefEl = document.getElementById('selected-ref');

  function getStoragePrefix() {
    return window.__BENCHMARK_STORAGE_NAMESPACE__
      || window.__RUN_STORAGE_NAMESPACE__
      || document.documentElement.dataset.storageNamespace
      || 'spreadsheet-local';
  }

  const storageKeys = {
    cells: getStoragePrefix() + ':cells',
    selected: getStoragePrefix() + ':selected',
  };

  const state = {
    cells: loadJson(storageKeys.cells, {}),
    selected: loadJson(storageKeys.selected, { col: 0, row: 0 }),
    editingRef: null,
    draft: '',
  };

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function persist() {
    localStorage.setItem(storageKeys.cells, JSON.stringify(state.cells));
    localStorage.setItem(storageKeys.selected, JSON.stringify(state.selected));
  }

  function getSelectedRef() {
    return core.coordsToRef(state.selected.col, state.selected.row);
  }

  function renderSheet() {
    const evaluated = core.evaluateSheet(state.cells);
    const selectedRef = getSelectedRef();
    selectedRefEl.textContent = selectedRef;
    formulaInput.value = state.editingRef === selectedRef ? state.draft : (state.cells[selectedRef] || '');

    let html = '<thead><tr><th class="corner"></th>';
    for (let col = 0; col < core.COLS; col += 1) {
      html += '<th class="col-header">' + String.fromCharCode(65 + col) + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (let row = 0; row < core.ROWS; row += 1) {
      html += '<tr><th class="row-header">' + String(row + 1) + '</th>';
      for (let col = 0; col < core.COLS; col += 1) {
        const ref = core.coordsToRef(col, row);
        const isActive = ref === selectedRef;
        const isEditing = ref === state.editingRef;
        const display = evaluated[ref] ? evaluated[ref].display : '';
        const raw = state.cells[ref] || '';
        const className = 'cell' + (isActive ? ' active' : '') + (String(display).startsWith('#') ? ' error' : '');
        html += '<td class="' + className + '" data-ref="' + ref + '">';
        if (isEditing) {
          html += '<input class="cell-editor" data-editor-ref="' + ref + '" value="' + escapeHtml(state.draft) + '">';
        } else {
          html += '<div class="cell-value" title="' + escapeHtml(raw) + '">' + escapeHtml(display) + '</div>';
        }
        html += '</td>';
      }
      html += '</tr>';
    }

    sheetEl.innerHTML = html + '</tbody>';
    if (state.editingRef) {
      const input = sheetEl.querySelector('[data-editor-ref="' + state.editingRef + '"]');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function selectRef(ref) {
    state.selected = core.refToCoords(ref);
    if (!state.editingRef) {
      formulaInput.value = state.cells[ref] || '';
    }
    persist();
    renderSheet();
  }

  function beginEdit(seedValue) {
    const ref = getSelectedRef();
    state.editingRef = ref;
    state.draft = seedValue != null ? seedValue : (state.cells[ref] || '');
    renderSheet();
  }

  function commitEdit(moveDelta) {
    if (!state.editingRef) {
      return;
    }

    const raw = state.draft;
    if (raw) {
      state.cells[state.editingRef] = raw;
    } else {
      delete state.cells[state.editingRef];
    }

    state.editingRef = null;
    state.draft = '';
    if (moveDelta) {
      state.selected = core.moveSelection(state.selected, moveDelta);
    }
    persist();
    renderSheet();
  }

  function cancelEdit() {
    state.editingRef = null;
    state.draft = '';
    renderSheet();
  }

  sheetEl.addEventListener('click', function (event) {
    const cell = event.target.closest('[data-ref]');
    if (!cell) {
      return;
    }
    selectRef(cell.dataset.ref);
  });

  sheetEl.addEventListener('dblclick', function (event) {
    const cell = event.target.closest('[data-ref]');
    if (!cell) {
      return;
    }
    selectRef(cell.dataset.ref);
    beginEdit();
  });

  sheetEl.addEventListener('input', function (event) {
    if (event.target.matches('.cell-editor')) {
      state.draft = event.target.value;
      formulaInput.value = state.draft;
    }
  });

  sheetEl.addEventListener('keydown', function (event) {
    if (!event.target.matches('.cell-editor')) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ col: 0, row: 1 });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit({ col: 1, row: 0 });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  formulaInput.addEventListener('focus', function () {
    if (!state.editingRef) {
      beginEdit();
    }
  });

  formulaInput.addEventListener('input', function () {
    if (!state.editingRef) {
      state.editingRef = getSelectedRef();
    }
    state.draft = formulaInput.value;
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit({ col: 0, row: 1 });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (state.editingRef) {
      return;
    }
    if (event.target === formulaInput) {
      return;
    }

    const movement = {
      ArrowUp: { col: 0, row: -1 },
      ArrowDown: { col: 0, row: 1 },
      ArrowLeft: { col: -1, row: 0 },
      ArrowRight: { col: 1, row: 0 },
    };

    if (movement[event.key]) {
      event.preventDefault();
      state.selected = core.moveSelection(state.selected, movement[event.key]);
      persist();
      renderSheet();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      delete state.cells[getSelectedRef()];
      persist();
      renderSheet();
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginEdit(event.key);
    }
  });

  renderSheet();
})();
