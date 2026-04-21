(function (globalScope) {
  'use strict';

  var TOTAL_ROWS = 100;
  var TOTAL_COLUMNS = 26;
  var structuralApi = typeof module !== 'undefined' && module.exports
    ? require('./structure.js')
    : globalScope.StructuralEdit;

  function createColumnLabels(count) {
    return Array.from({ length: count }, function (_, index) {
      return String.fromCharCode(65 + index);
    });
  }

  function createGridRows(rowCount, columnCount) {
    var labels = createColumnLabels(columnCount);
    return Array.from({ length: rowCount }, function (_, rowIndex) {
      return {
        index: rowIndex + 1,
        cells: labels.map(function (label, columnIndex) {
          return {
            address: label + String(rowIndex + 1),
            row: rowIndex,
            column: columnIndex,
          };
        }),
      };
    });
  }

  function clampCell(cell, rowCount, columnCount) {
    return {
      row: Math.min(Math.max(cell.row, 0), rowCount - 1),
      column: Math.min(Math.max(cell.column, 0), columnCount - 1),
    };
  }

  function selectionFromEndpoints(anchor, focus) {
    return {
      anchor: { row: anchor.row, column: anchor.column },
      focus: { row: focus.row, column: focus.column },
      minRow: Math.min(anchor.row, focus.row),
      maxRow: Math.max(anchor.row, focus.row),
      minColumn: Math.min(anchor.column, focus.column),
      maxColumn: Math.max(anchor.column, focus.column),
      active: { row: focus.row, column: focus.column },
    };
  }

  function createInitialSelection() {
    return selectionFromEndpoints({ row: 0, column: 0 }, { row: 0, column: 0 });
  }

  function addressFromCell(cell) {
    return String.fromCharCode(65 + cell.column) + String(cell.row + 1);
  }

  function createHeaderActionItems(kind, index) {
    if (kind === 'row') {
      return [
        { label: 'Insert above', command: { type: 'insert-row', index: index } },
        { label: 'Insert below', command: { type: 'insert-row', index: index + 1 } },
        { label: 'Delete row', command: { type: 'delete-row', index: index } },
      ];
    }

    return [
      { label: 'Insert left', command: { type: 'insert-column', index: index } },
      { label: 'Insert right', command: { type: 'insert-column', index: index + 1 } },
      { label: 'Delete column', command: { type: 'delete-column', index: index } },
    ];
  }

  function remapAxisIndex(index, nextLimit, operation, axis) {
    var oneBasedIndex = index + 1;
    var nextIndex = index;

    if (operation.type === 'insert-' + axis) {
      if (oneBasedIndex >= operation.index) {
        nextIndex += 1;
      }
    } else if (operation.type === 'delete-' + axis) {
      if (oneBasedIndex > operation.index) {
        nextIndex -= 1;
      } else if (oneBasedIndex === operation.index) {
        nextIndex = Math.min(index, nextLimit - 1);
      }
    }

    return Math.min(Math.max(nextIndex, 0), nextLimit - 1);
  }

  function remapCellForStructuralCommand(cell, nextRowCount, nextColumnCount, operation) {
    return {
      row: remapAxisIndex(cell.row, nextRowCount, operation, 'row'),
      column: remapAxisIndex(cell.column, nextColumnCount, operation, 'column'),
    };
  }

  function applyStructuralCommand(state, command) {
    var nextRowCount = state.rowCount;
    var nextColumnCount = state.columnCount;

    if (command.type === 'insert-row') {
      nextRowCount += 1;
    } else if (command.type === 'delete-row') {
      nextRowCount = Math.max(1, nextRowCount - 1);
    } else if (command.type === 'insert-column') {
      nextColumnCount += 1;
    } else if (command.type === 'delete-column') {
      nextColumnCount = Math.max(1, nextColumnCount - 1);
    }

    if ((command.type === 'delete-row' && state.rowCount === 1) || (command.type === 'delete-column' && state.columnCount === 1)) {
      return state;
    }

    return {
      rowCount: nextRowCount,
      columnCount: nextColumnCount,
      cells: structuralApi.applyStructuralEdit(state.cells, command),
      selection: selectionFromEndpoints(
        remapCellForStructuralCommand(state.selection.anchor, nextRowCount, nextColumnCount, command),
        remapCellForStructuralCommand(state.selection.focus, nextRowCount, nextColumnCount, command)
      ),
      dragAnchor: null,
      openMenu: null,
    };
  }

  function buildHeaderCell(kind, index, label, openMenu) {
    var header = document.createElement('th');
    header.className = kind === 'row' ? 'row-header' : 'column-header';
    header.scope = kind === 'row' ? 'row' : 'col';
    header.dataset[kind] = String(index - 1);

    var content = document.createElement('div');
    content.className = 'header-label-wrap';

    var text = document.createElement('span');
    text.className = 'header-label-text';
    text.textContent = label;
    content.appendChild(text);

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'header-action-trigger';
    trigger.dataset.headerKind = kind;
    trigger.dataset.headerIndex = String(index);
    trigger.setAttribute('aria-label', (kind === 'row' ? 'Row ' : 'Column ') + label + ' options');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', openMenu && openMenu.kind === kind && openMenu.index === index ? 'true' : 'false');
    trigger.textContent = '...';
    content.appendChild(trigger);

    if (openMenu && openMenu.kind === kind && openMenu.index === index) {
      var menu = document.createElement('div');
      menu.className = 'header-action-menu';
      menu.setAttribute('role', 'menu');

      createHeaderActionItems(kind, index).forEach(function (item) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'header-action-button';
        button.dataset.commandType = item.command.type;
        button.dataset.commandIndex = String(item.command.index);
        button.textContent = item.label;
        menu.appendChild(button);
      });

      content.appendChild(menu);
    }

    header.appendChild(content);
    return header;
  }

  function buildGrid(tableElement, state) {
    var fragment = document.createDocumentFragment();
    var headerRow = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'corner-cell';
    corner.scope = 'col';
    headerRow.appendChild(corner);

    createColumnLabels(state.columnCount).forEach(function (label, columnIndex) {
      headerRow.appendChild(buildHeaderCell('column', columnIndex + 1, label, state.openMenu));
    });

    fragment.appendChild(headerRow);

    createGridRows(state.rowCount, state.columnCount).forEach(function (rowData, rowIndex) {
      var row = document.createElement('tr');
      row.appendChild(buildHeaderCell('row', rowIndex + 1, String(rowData.index), state.openMenu));

      rowData.cells.forEach(function (cellData) {
        var cell = document.createElement('td');
        cell.dataset.row = String(cellData.row);
        cell.dataset.column = String(cellData.column);
        cell.dataset.address = cellData.address;
        cell.setAttribute('aria-label', cellData.address);
        cell.textContent = state.cells[cellData.address] || '';
        row.appendChild(cell);
      });

      fragment.appendChild(row);
    });

    tableElement.replaceChildren(fragment);
  }

  function applySelectionState(root, selection) {
    root.querySelectorAll('.cell-active, .cell-range, .header-active, .header-range').forEach(function (node) {
      node.classList.remove('cell-active', 'cell-range', 'header-active', 'header-range');
    });

    for (var row = selection.minRow; row <= selection.maxRow; row += 1) {
      var rowHeader = root.querySelector('.row-header[data-row="' + row + '"]');
      if (rowHeader) {
        rowHeader.classList.add(selection.minRow === selection.maxRow ? 'header-active' : 'header-range');
      }

      for (var column = selection.minColumn; column <= selection.maxColumn; column += 1) {
        var cell = root.querySelector('td[data-row="' + row + '"][data-column="' + column + '"]');
        if (cell) {
          cell.classList.add('cell-range');
        }
      }
    }

    for (var headerColumn = selection.minColumn; headerColumn <= selection.maxColumn; headerColumn += 1) {
      var columnHeader = root.querySelector('.column-header[data-column="' + headerColumn + '"]');
      if (columnHeader) {
        columnHeader.classList.add(selection.minColumn === selection.maxColumn ? 'header-active' : 'header-range');
      }
    }

    var activeCell = root.querySelector('td[data-row="' + selection.active.row + '"][data-column="' + selection.active.column + '"]');
    if (activeCell) {
      activeCell.classList.remove('cell-range');
      activeCell.classList.add('cell-active');
      activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    var nameBox = document.getElementById('name-box');
    if (nameBox) {
      nameBox.textContent = addressFromCell(selection.active);
    }
  }

  function readCellFromDataset(target) {
    return {
      row: Number(target.dataset.row),
      column: Number(target.dataset.column),
    };
  }

  function initSpreadsheetShell() {
    if (typeof document === 'undefined') {
      return;
    }

    var table = document.getElementById('sheet-grid');
    if (!table) {
      return;
    }

    var state = {
      rowCount: TOTAL_ROWS,
      columnCount: TOTAL_COLUMNS,
      cells: {},
      selection: createInitialSelection(),
      dragAnchor: null,
      openMenu: null,
    };

    var formulaInput = document.getElementById('formula-input');

    function renderGrid() {
      buildGrid(table, state);
      applySelectionState(table, state.selection);
      if (formulaInput) {
        formulaInput.value = state.cells[addressFromCell(state.selection.active)] || '';
      }
    }

    function setSelection(nextSelection) {
      state.selection = nextSelection;
      renderGrid();
    }

    renderGrid();

    table.addEventListener('mousedown', function (event) {
      if (event.target.closest('.header-action-trigger, .header-action-menu')) {
        return;
      }

      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      event.preventDefault();
      var anchor = readCellFromDataset(cell);
      state.dragAnchor = event.shiftKey ? state.selection.anchor : anchor;
      setSelection(selectionFromEndpoints(state.dragAnchor, anchor));
    });

    table.addEventListener('mouseover', function (event) {
      if (!state.dragAnchor || (event.buttons & 1) !== 1) {
        return;
      }

      var cell = event.target.closest('td');
      if (!cell) {
        return;
      }

      setSelection(selectionFromEndpoints(state.dragAnchor, readCellFromDataset(cell)));
    });

    document.addEventListener('mouseup', function () {
      state.dragAnchor = null;
    });

    table.addEventListener('click', function (event) {
      var actionButton = event.target.closest('.header-action-button');
      if (actionButton) {
        event.preventDefault();
        state = applyStructuralCommand(state, {
          type: actionButton.dataset.commandType,
          index: Number(actionButton.dataset.commandIndex),
        });
        renderGrid();
        return;
      }

      var actionTrigger = event.target.closest('.header-action-trigger');
      if (actionTrigger) {
        event.preventDefault();
        var nextMenu = {
          kind: actionTrigger.dataset.headerKind,
          index: Number(actionTrigger.dataset.headerIndex),
        };
        if (state.openMenu && state.openMenu.kind === nextMenu.kind && state.openMenu.index === nextMenu.index) {
          state.openMenu = null;
        } else {
          state.openMenu = nextMenu;
        }
        renderGrid();
        return;
      }

      var cell = event.target.closest('td');
      if (!cell) {
        state.openMenu = null;
        renderGrid();
        return;
      }

      var focus = readCellFromDataset(cell);
      var anchor = event.shiftKey ? state.selection.anchor : focus;
      state.openMenu = null;
      setSelection(selectionFromEndpoints(anchor, focus));
    });

    document.addEventListener('click', function (event) {
      if (!state.openMenu) {
        return;
      }

      if (event.target.closest('.header-action-trigger, .header-action-menu')) {
        return;
      }

      state.openMenu = null;
      renderGrid();
    });

    document.addEventListener('keydown', function (event) {
      if (event.target && event.target.closest('.formula-bar')) {
        return;
      }

      var delta = null;
      if (event.key === 'ArrowUp') {
        delta = { row: -1, column: 0 };
      } else if (event.key === 'ArrowDown') {
        delta = { row: 1, column: 0 };
      } else if (event.key === 'ArrowLeft') {
        delta = { row: 0, column: -1 };
      } else if (event.key === 'ArrowRight') {
        delta = { row: 0, column: 1 };
      }

      if (!delta) {
        return;
      }

      event.preventDefault();
      var nextFocus = clampCell(
        {
          row: state.selection.active.row + delta.row,
          column: state.selection.active.column + delta.column,
        },
        state.rowCount,
        state.columnCount
      );
      var nextAnchor = event.shiftKey ? state.selection.anchor : nextFocus;
      setSelection(selectionFromEndpoints(nextAnchor, nextFocus));
    });
  }

  var api = {
    createColumnLabels: createColumnLabels,
    createGridRows: createGridRows,
    clampCell: clampCell,
    createInitialSelection: createInitialSelection,
    selectionFromEndpoints: selectionFromEndpoints,
    createHeaderActionItems: createHeaderActionItems,
    applyStructuralCommand: applyStructuralCommand,
    initSpreadsheetShell: initSpreadsheetShell,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.SpreadsheetShell = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSpreadsheetShell);
    } else {
      initSpreadsheetShell();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
