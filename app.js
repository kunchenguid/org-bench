(function () {
  const core = window.SpreadsheetCore;
  const namespace = core.getStorageNamespace(window);
  const storageKey = core.getStorageKey(namespace);
  const table = document.getElementById('sheet-table');
  const formulaInput = document.getElementById('formula-input');
  const clipboardStore = window;

  let state = core.deserializeState(window.localStorage.getItem(storageKey));
  let editing = null;
  let dragging = false;

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

  function selectionContains(row, col) {
    const bounds = core.getSelectionBounds(state);
    return row >= bounds.startRow && row <= bounds.endRow && col >= bounds.startCol && col <= bounds.endCol;
  }

  function getSelectionShape() {
    const bounds = core.getSelectionBounds(state);
    return {
      startRow: bounds.startRow,
      startCol: bounds.startCol,
      rows: bounds.endRow - bounds.startRow + 1,
      cols: bounds.endCol - bounds.startCol + 1,
    };
  }

  function parseClipboardShape(text) {
    const rows = String(text || '').split(/\r?\n/);
    return {
      rows: rows.length,
      cols: rows[0] ? rows[0].split('\t').length : 1,
    };
  }

  function getPasteTarget(text) {
    const shape = parseClipboardShape(text);
    const selection = getSelectionShape();

    if (selection.rows === shape.rows && selection.cols === shape.cols) {
      return { row: selection.startRow, col: selection.startCol };
    }

    return { row: state.active.row, col: state.active.col };
  }

  function storeClipboard(payload) {
    clipboardStore.__sheetClipboard = payload;
  }

  async function writeClipboardText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      // `file://` clipboard permissions vary by browser, so keep the in-memory fallback.
    }
  }

  async function readClipboardText() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      return '';
    }

    try {
      return await navigator.clipboard.readText();
    } catch (_error) {
      return '';
    }
  }

  function applyPaste(payload) {
    if (!payload || !payload.text) {
      return;
    }

    const target = getPasteTarget(payload.text);
    state = core.pasteClipboard(state, target.row, target.col, payload);
    state = core.setActiveCell(state, target.row, target.col);
    saveState();
    render();
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
        const isSelected = selectionContains(row, col);
        td.className = 'cell' + (isSelected ? ' selected' : '') + (isActive ? ' active' : '') + (isEditing ? ' editing' : '');
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
          button.textContent = core.getCellDisplayValue(state, row, col);
          button.addEventListener('click', function (event) {
            state = core.setSelectionFocus(state, row, col, event.shiftKey);
            saveState();
            render();
          });
          button.addEventListener('mousedown', function () {
            dragging = true;
            state = core.setActiveCell(state, row, col);
            saveState();
            render();
          });
          button.addEventListener('mouseenter', function () {
            if (!dragging) {
              return;
            }
            state = core.setSelectionFocus(state, row, col, true);
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

  document.addEventListener('mouseup', function () {
    dragging = false;
  });

  document.addEventListener('copy', function (event) {
    if (editing || document.activeElement === formulaInput) {
      return;
    }

    const payload = {
      text: core.selectionToTSV(state),
      bounds: core.getSelectionBounds(state),
      cut: false,
    };
    storeClipboard(payload);
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', payload.text);
      event.preventDefault();
    }
    writeClipboardText(payload.text);
  });

  document.addEventListener('cut', function (event) {
    if (editing || document.activeElement === formulaInput) {
      return;
    }

    const result = core.cutSelection(state);
    const payload = {
      text: result.text,
      bounds: core.getSelectionBounds(state),
      cut: true,
    };
    storeClipboard(payload);
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', payload.text);
      event.preventDefault();
    }
    writeClipboardText(payload.text);
    state = result.state;
    saveState();
    render();
  });

  document.addEventListener('paste', function (event) {
    if (editing || document.activeElement === formulaInput) {
      return;
    }

    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    const payload = clipboardStore.__sheetClipboard && clipboardStore.__sheetClipboard.text === text
      ? clipboardStore.__sheetClipboard
      : { text };

    if (!payload.text) {
      return;
    }

    event.preventDefault();
    applyPaste(payload);
  });

  document.addEventListener('keydown', function (event) {
    if (event.target === formulaInput || (editing && event.target.closest('.cell'))) {
      return;
    }

    if ((event.metaKey || event.ctrlKey || event.altKey) && event.key !== 'Backspace') {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        readClipboardText().then(function (text) {
          const payload = clipboardStore.__sheetClipboard && clipboardStore.__sheetClipboard.text === text
            ? clipboardStore.__sheetClipboard
            : { text: text || (clipboardStore.__sheetClipboard && clipboardStore.__sheetClipboard.text) || '' };
          applyPaste(payload);
        });
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      state = event.shiftKey
        ? core.setSelectionFocus(state, state.active.row - 1, state.active.col, true)
        : core.moveSelection(state, { row: -1, col: 0 });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      state = event.shiftKey
        ? core.setSelectionFocus(state, state.active.row + 1, state.active.col, true)
        : core.moveSelection(state, { row: 1, col: 0 });
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      state = event.shiftKey
        ? core.setSelectionFocus(state, state.active.row, state.active.col - 1, true)
        : core.moveSelection(state, { row: 0, col: -1 });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      state = event.shiftKey
        ? core.setSelectionFocus(state, state.active.row, state.active.col + 1, true)
        : core.moveSelection(state, { row: 0, col: 1 });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      state = core.clearSelection(state);
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
