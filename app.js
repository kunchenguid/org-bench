(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.GridApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clampSelection(selection, rowCount, colCount) {
    return {
      row: Math.max(0, Math.min(rowCount - 1, selection.row)),
      col: Math.max(0, Math.min(colCount - 1, selection.col)),
    };
  }

  function moveSelection(selection, direction, rowCount, colCount) {
    const next = { row: selection.row, col: selection.col };
    if (direction === 'up') next.row -= 1;
    if (direction === 'down') next.row += 1;
    if (direction === 'left') next.col -= 1;
    if (direction === 'right') next.col += 1;
    return clampSelection(next, rowCount, colCount);
  }

  function getStorageKey(namespace) {
    return (namespace ? String(namespace) + ':' : '') + 'gridline:sheet';
  }

  function initBrowserApp() {
    const core = window.SpreadsheetCore;
    const table = document.getElementById('grid-table');
    const formulaInput = document.getElementById('formula-input');
    const cellName = document.getElementById('cell-name');
    const menu = document.getElementById('header-menu');
    const storageKey = getStorageKey(window.__BENCHMARK_STORAGE_NAMESPACE__ || '');

    let sheet = loadSheet();
    let editing = false;
    let editOriginal = '';
    let dragAnchor = null;
    let clipboardRange = null;
    let clipboardText = '';
    let cutRange = null;

    function loadSheet() {
      try {
        const raw = localStorage.getItem(storageKey);
        return core.createSheet(raw ? JSON.parse(raw) : null);
      } catch (_error) {
        return core.createSheet();
      }
    }

    function saveSheet() {
      localStorage.setItem(storageKey, JSON.stringify({
        cells: sheet.cells,
        rowCount: sheet.rowCount,
        colCount: sheet.colCount,
        selected: sheet.selected,
        range: sheet.range,
      }));
    }

    function activeRef() {
      return core.colToLabel(sheet.selected.col) + String(sheet.selected.row + 1);
    }

    function currentRange() {
      if (sheet.range) return core.normalizeRange(sheet.range);
      return { startRow: sheet.selected.row, endRow: sheet.selected.row, startCol: sheet.selected.col, endCol: sheet.selected.col };
    }

    function inRange(row, col) {
      const range = currentRange();
      return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
    }

    function syncFormulaBar() {
      cellName.textContent = activeRef();
      if (!editing) {
        formulaInput.value = core.getCellRaw(sheet, sheet.selected.row, sheet.selected.col);
      }
    }

    function setSelection(row, col, keepRange, anchor) {
      const next = clampSelection({ row: row, col: col }, sheet.rowCount, sheet.colCount);
      sheet.selected = next;
      if (keepRange && anchor) {
        sheet.range = { startRow: anchor.row, startCol: anchor.col, endRow: next.row, endCol: next.col };
      } else {
        sheet.range = null;
      }
      editing = false;
      syncFormulaBar();
      saveSheet();
      render();
      ensureVisible(next.row, next.col);
    }

    function ensureVisible(row, col) {
      const cell = table.querySelector('td[data-row="' + row + '"][data-col="' + col + '"]');
      if (cell) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function classifyDisplay(display) {
      if (display.charAt(0) === '#') return 'error';
      if (display === 'TRUE' || display === 'FALSE') return 'boolean';
      return display !== '' && !Number.isNaN(Number(display)) ? 'numeric' : '';
    }

    function escapeHtml(text) {
      return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function render() {
      const range = currentRange();
      let html = '<thead><tr><th class="corner"></th>';
      for (let col = 0; col < sheet.colCount; col += 1) {
        html += '<th class="col-header' + (col >= range.startCol && col <= range.endCol ? ' active-header' : '') + '" data-col="' + col + '">' + core.colToLabel(col) + '</th>';
      }
      html += '</tr></thead><tbody>';
      for (let row = 0; row < sheet.rowCount; row += 1) {
        html += '<tr><th class="row-header' + (row >= range.startRow && row <= range.endRow ? ' active-header' : '') + '" data-row="' + row + '">' + (row + 1) + '</th>';
        for (let col = 0; col < sheet.colCount; col += 1) {
          const display = core.getCellDisplay(sheet, row, col);
          const classes = [];
          if (inRange(row, col)) classes.push('in-range');
          if (row === sheet.selected.row && col === sheet.selected.col) classes.push('active');
          const typeClass = classifyDisplay(display);
          if (typeClass) classes.push(typeClass);
          html += '<td class="' + classes.join(' ') + '" data-row="' + row + '" data-col="' + col + '">' + escapeHtml(display) + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody>';
      table.innerHTML = html;
      syncFormulaBar();
    }

    function beginEdit(value, preserve) {
      editing = true;
      editOriginal = core.getCellRaw(sheet, sheet.selected.row, sheet.selected.col);
      formulaInput.value = preserve ? editOriginal : value;
      formulaInput.focus();
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    }

    function commitEdit(move) {
      if (!editing) return;
      core.pushHistory(sheet);
      core.setCellRaw(sheet, sheet.selected.row, sheet.selected.col, formulaInput.value);
      editing = false;
      saveSheet();
      render();
      if (move) setSelection(sheet.selected.row + move.row, sheet.selected.col + move.col, false);
    }

    function cancelEdit() {
      if (!editing) return;
      editing = false;
      formulaInput.value = editOriginal;
      formulaInput.blur();
      syncFormulaBar();
    }

    function clearSelection() {
      core.pushHistory(sheet);
      core.clearRange(sheet, currentRange());
      saveSheet();
      render();
    }

    function selectionToText(copied) {
      return copied.cells.map(function (row) { return row.join('\t'); }).join('\n');
    }

    function parseTextGrid(text) {
      const rows = text.replace(/\r/g, '').split('\n');
      return {
        width: rows[0] ? rows[0].split('\t').length : 1,
        height: rows.length,
        originRow: 0,
        originCol: 0,
        cells: rows.map(function (row) { return row.split('\t'); }),
      };
    }

    function copySelection(isCut) {
      clipboardRange = core.copyRange(sheet, currentRange());
      clipboardText = selectionToText(clipboardRange);
      cutRange = isCut ? currentRange() : null;
      return clipboardText;
    }

    function pasteSelection(text) {
      const range = currentRange();
      const payload = text === clipboardText && clipboardRange ? clipboardRange : parseTextGrid(text);
      core.pushHistory(sheet);
      core.pasteRange(sheet, payload, range.startRow, range.startCol);
      if (cutRange && text === clipboardText) {
        core.clearRange(sheet, cutRange);
        cutRange = null;
      }
      sheet.range = { startRow: range.startRow, startCol: range.startCol, endRow: range.startRow + payload.height - 1, endCol: range.startCol + payload.width - 1 };
      saveSheet();
      render();
    }

    function hideMenu() { menu.classList.add('hidden'); }

    function showMenu(type, index, x, y) {
      const label = type === 'row' ? 'Row' : 'Column';
      menu.innerHTML = [
        '<button data-type="' + type + '" data-index="' + index + '" data-action="insert-before">Insert ' + label + ' Before</button>',
        '<button data-type="' + type + '" data-index="' + index + '" data-action="insert-after">Insert ' + label + ' After</button>',
        '<button data-type="' + type + '" data-index="' + index + '" data-action="delete">Delete ' + label + '</button>'
      ].join('');
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.classList.remove('hidden');
    }

    function applyHeaderAction(type, index, action) {
      core.pushHistory(sheet);
      if (type === 'row') {
        if (action === 'insert-before') core.insertRow(sheet, index);
        else if (action === 'insert-after') core.insertRow(sheet, index + 1);
        else core.deleteRow(sheet, index);
        sheet.selected.row = Math.min(sheet.selected.row, sheet.rowCount - 1);
      } else {
        if (action === 'insert-before') core.insertColumn(sheet, index);
        else if (action === 'insert-after') core.insertColumn(sheet, index + 1);
        else core.deleteColumn(sheet, index);
        sheet.selected.col = Math.min(sheet.selected.col, sheet.colCount - 1);
      }
      sheet.range = null;
      hideMenu();
      saveSheet();
      render();
    }

    table.addEventListener('mousedown', function (event) {
      const cell = event.target.closest('td');
      if (!cell) return;
      hideMenu();
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const anchor = event.shiftKey ? { row: sheet.selected.row, col: sheet.selected.col } : { row: row, col: col };
      dragAnchor = anchor;
      setSelection(row, col, event.shiftKey, anchor);
      event.preventDefault();
    });

    table.addEventListener('mouseover', function (event) {
      if (!dragAnchor || editing) return;
      const cell = event.target.closest('td');
      if (!cell) return;
      setSelection(Number(cell.dataset.row), Number(cell.dataset.col), true, dragAnchor);
    });

    document.addEventListener('mouseup', function () { dragAnchor = null; });

    table.addEventListener('dblclick', function (event) {
      const cell = event.target.closest('td');
      if (!cell) return;
      setSelection(Number(cell.dataset.row), Number(cell.dataset.col), false);
      beginEdit('', true);
    });

    table.addEventListener('contextmenu', function (event) {
      const rowHeader = event.target.closest('.row-header');
      const colHeader = event.target.closest('.col-header');
      if (!rowHeader && !colHeader) return;
      event.preventDefault();
      if (rowHeader) showMenu('row', Number(rowHeader.dataset.row), event.clientX, event.clientY);
      else showMenu('col', Number(colHeader.dataset.col), event.clientX, event.clientY);
    });

    menu.addEventListener('click', function (event) {
      const button = event.target.closest('button');
      if (!button) return;
      applyHeaderAction(button.dataset.type, Number(button.dataset.index), button.dataset.action);
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('#header-menu')) hideMenu();
    });

    formulaInput.addEventListener('focus', function () {
      if (!editing) {
        editing = true;
        editOriginal = core.getCellRaw(sheet, sheet.selected.row, sheet.selected.col);
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); commitEdit({ row: 1, col: 0 }); }
      else if (event.key === 'Tab') { event.preventDefault(); commitEdit({ row: 0, col: 1 }); }
      else if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
    });

    document.addEventListener('keydown', function (event) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) core.redo(sheet); else core.undo(sheet);
        saveSheet(); render();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault(); core.redo(sheet); saveSheet(); render(); return;
      }
      if (editing && document.activeElement === formulaInput) return;
      if (event.key === 'F2' || event.key === 'Enter') { event.preventDefault(); beginEdit('', true); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearSelection(); return; }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key.replace('Arrow', '').toLowerCase();
        const anchor = event.shiftKey ? { row: sheet.range ? sheet.range.startRow : sheet.selected.row, col: sheet.range ? sheet.range.startCol : sheet.selected.col } : null;
        const next = moveSelection(sheet.selected, direction, sheet.rowCount, sheet.colCount);
        setSelection(next.row, next.col, event.shiftKey, anchor);
        return;
      }
      if (event.key === 'Tab') { event.preventDefault(); setSelection(sheet.selected.row, sheet.selected.col + 1, false); return; }
      if (!meta && !event.altKey && event.key.length === 1) { event.preventDefault(); beginEdit(event.key, false); }
    });

    document.addEventListener('copy', function (event) {
      const text = copySelection(false);
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    });

    document.addEventListener('cut', function (event) {
      const text = copySelection(true);
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    });

    document.addEventListener('paste', function (event) {
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      pasteSelection(text);
    });

    window.addEventListener('beforeunload', saveSheet);
    render();
    ensureVisible(sheet.selected.row, sheet.selected.col);
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.SpreadsheetCore) {
    initBrowserApp();
  }

  return {
    clampSelection: clampSelection,
    moveSelection: moveSelection,
    getStorageKey: getStorageKey,
  };
});
