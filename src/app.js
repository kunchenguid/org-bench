'use strict';

(function bootstrap() {
  const rows = 100;
  const cols = 26;
  const store = window.createSpreadsheetStore({ rows, cols });
  const sheet = document.getElementById('sheet');
  const formulaInput = document.getElementById('formula-input');
  const nameBox = document.querySelector('.name-box');
  const engine = window.spreadsheetEngine || {};
  let cutMatrix = null;
  let ignoreFormulaSync = false;
  let draggingRange = false;

  render();

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCut);
  document.addEventListener('paste', handlePaste);
  document.addEventListener('pointerup', () => {
    draggingRange = false;
  });

  formulaInput.addEventListener('focus', () => {
    store.startFormulaBarEdit();
    render();
  });

  formulaInput.addEventListener('input', (event) => {
    store.updateDraft(event.target.value);
    render();
  });

  formulaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      store.commitEdit({ move: 'down' });
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      store.commitEdit({ move: event.shiftKey ? 'left' : 'right' });
      render();
      focusActiveCell();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      store.cancelEdit();
      render();
      focusActiveCell();
    }
  });

  function handleKeydown(event) {
    if (event.target === formulaInput) {
      return;
    }

    const state = store.getState();
    const moveKey = movementKey(event.key);
    const meta = event.metaKey || event.ctrlKey;

    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        store.redo();
      } else {
        store.undo();
      }
      render();
      return;
    }

    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      store.redo();
      render();
      return;
    }

    if (state.mode === 'editing') {
      return;
    }

    if (moveKey) {
      event.preventDefault();
      store.moveActive(moveKey, { extend: event.shiftKey });
      render();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      store.startEdit();
      render();
      focusEditor();
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      store.startEdit();
      render();
      focusEditor();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      store.moveActive(event.shiftKey ? 'left' : 'right');
      render();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      store.clearSelection();
      render();
      return;
    }

    if (isTypingKey(event)) {
      event.preventDefault();
      store.beginTyping(event.key);
      render();
      focusEditor();
    }
  }

  function handleCopy(event) {
    const text = matrixToText(store.getSelectionMatrix());
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
  }

  function handleCut(event) {
    const state = store.getState();
    cutMatrix = {
      start: state.range.start,
      end: state.range.end,
      text: matrixToText(store.getSelectionMatrix()),
    };
    event.preventDefault();
    event.clipboardData.setData('text/plain', cutMatrix.text);
  }

  function handlePaste(event) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }

    event.preventDefault();
    const state = store.getState();
    store.replaceRange(state.active, textToMatrix(text));
    if (cutMatrix && cutMatrix.text === text) {
      store.setRange({ start: cutMatrix.start, end: cutMatrix.end });
      store.clearSelection();
      cutMatrix = null;
      store.setRange(state.range);
    }
    render();
  }

  function render() {
    const state = store.getState();
    nameBox.textContent = toCellRef(state.active.row, state.active.col);
    syncFormulaBar(state.formulaBarValue);

    const headerCells = ['<thead><tr><th class="corner" aria-hidden="true"></th>'];
    for (let col = 0; col < cols; col += 1) {
      const className = col === state.active.col ? ' class="header-active"' : '';
      headerCells.push('<th' + className + ' scope="col">' + columnLabel(col) + '</th>');
    }
    headerCells.push('</tr></thead>');

    const bodyRows = ['<tbody>'];
    for (let row = 0; row < rows; row += 1) {
      const rowHeaderClass = row === state.active.row ? ' class="header-active"' : '';
      bodyRows.push('<tr><th' + rowHeaderClass + ' scope="row">' + (row + 1) + '</th>');
      for (let col = 0; col < cols; col += 1) {
        bodyRows.push(renderCell(row, col, state));
      }
      bodyRows.push('</tr>');
    }
    bodyRows.push('</tbody>');

    sheet.innerHTML = headerCells.join('') + bodyRows.join('');

    Array.from(sheet.querySelectorAll('[data-role="cell-button"]')).forEach((button) => {
      button.addEventListener('click', (event) => {
        store.selectCell(Number(button.dataset.row), Number(button.dataset.col), { extend: event.shiftKey });
        render();
        focusActiveCell();
      });

      button.addEventListener('pointerdown', () => {
        draggingRange = true;
        store.selectCell(Number(button.dataset.row), Number(button.dataset.col));
        render();
      });

      button.addEventListener('pointerenter', () => {
        if (!draggingRange) {
          return;
        }

        store.selectCell(Number(button.dataset.row), Number(button.dataset.col), { extend: true });
        render();
      });

      button.addEventListener('dblclick', () => {
        store.selectCell(Number(button.dataset.row), Number(button.dataset.col));
        store.startEdit();
        render();
        focusEditor();
      });
    });

    Array.from(sheet.querySelectorAll('[data-role="cell-editor"]')).forEach((input) => {
      input.addEventListener('input', (event) => {
        store.updateDraft(event.target.value);
        syncFormulaBar(event.target.value);
      });

      input.addEventListener('blur', () => {
        if (store.getState().mode === 'editing') {
          store.commitEdit();
          render();
        }
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          store.commitEdit({ move: 'down' });
          render();
          focusActiveCell();
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          store.commitEdit({ move: event.shiftKey ? 'left' : 'right' });
          render();
          focusActiveCell();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          store.cancelEdit();
          render();
          focusActiveCell();
        }
      });

      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    });
  }

  function renderCell(row, col, state) {
    const active = row === state.active.row && col === state.active.col;
    const inRange = isInRange(row, col, state.range);
    const classes = ['cell'];
    if (active) {
      classes.push('active');
    }
    if (inRange) {
      classes.push('in-range');
    }

    const raw = store.getCellRaw(row, col);
    const display = escapeHtml(getDisplayValue(raw, row, col));

    if (active && state.mode === 'editing') {
      return '<td class="' + classes.join(' ') + '"><input class="cell-editor" data-role="cell-editor" value="' + escapeAttribute(state.draft) + '" aria-label="Cell ' + toCellRef(row, col) + '"></td>';
    }

    return '<td class="' + classes.join(' ') + '"><button type="button" class="cell-button" data-role="cell-button" data-row="' + row + '" data-col="' + col + '" aria-label="Cell ' + toCellRef(row, col) + '">' + display + '</button></td>';
  }

  function getDisplayValue(raw, row, col) {
    if (typeof engine.getCellDisplay === 'function') {
      return String(engine.getCellDisplay({ raw, row, col, getRaw: store.getCellRaw }) || '');
    }

    return raw;
  }

  function isInRange(row, col, range) {
    const top = Math.min(range.start.row, range.end.row);
    const bottom = Math.max(range.start.row, range.end.row);
    const left = Math.min(range.start.col, range.end.col);
    const right = Math.max(range.start.col, range.end.col);
    return row >= top && row <= bottom && col >= left && col <= right;
  }

  function syncFormulaBar(value) {
    if (ignoreFormulaSync) {
      return;
    }
    formulaInput.value = value;
  }

  function focusActiveCell() {
    const activeButton = sheet.querySelector('[data-row="' + store.getState().active.row + '"][data-col="' + store.getState().active.col + '"]');
    if (activeButton) {
      activeButton.focus();
    }
  }

  function focusEditor() {
    const editor = sheet.querySelector('[data-role="cell-editor"]');
    if (editor) {
      editor.focus();
    }
  }

  function movementKey(key) {
    switch (key) {
      case 'ArrowUp':
        return 'up';
      case 'ArrowDown':
        return 'down';
      case 'ArrowLeft':
        return 'left';
      case 'ArrowRight':
        return 'right';
      default:
        return null;
    }
  }

  function isTypingKey(event) {
    return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
  }

  function columnLabel(col) {
    return String.fromCharCode(65 + col);
  }

  function toCellRef(row, col) {
    return columnLabel(col) + String(row + 1);
  }

  function matrixToText(matrix) {
    return matrix.map((line) => line.join('\t')).join('\n');
  }

  function textToMatrix(text) {
    return text.replace(/\r/g, '').split('\n').map((line) => line.split('\t'));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }
})();
