(function () {
  "use strict";

  var ROWS = 100;
  var COLS = 26;
  var columnHeaders = document.getElementById("column-headers");
  var rowHeaders = document.getElementById("row-headers");
  var grid = document.getElementById("grid");
  var nameBox = document.getElementById("name-box");
  var formulaInput = document.getElementById("formula-input");
  var status = document.getElementById("app-status");
  var structuralEdits = window.SpreadsheetStructuralEdits;
  var rangeClipboard = window.RangeClipboard;
  var workbookState = createWorkbookState();
  var activeCellId = workbookState.getSelectedCell();
  var selection = selectionForCell(activeCellId);
  var dragAnchor = null;
  var isDragging = false;
  var clipboardText = "";
  var clipboardRange = null;
  var cutRange = null;

  renderHeaders();
  renderGrid();
  refreshGridValues();
  setSelection(selection);
  status.textContent = "Workbook state ready";

  columnHeaders.addEventListener("click", handleHeaderClick);
  rowHeaders.addEventListener("click", handleHeaderClick);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("mousedown", handlePointerStart);
  document.addEventListener("mouseover", handlePointerMove);
  document.addEventListener("mouseup", handlePointerEnd);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("copy", handleCopy);
  document.addEventListener("cut", handleCut);
  document.addEventListener("paste", handlePaste);

  function columnLabel(index) {
    return String.fromCharCode(65 + index);
  }

  function createHeaderMenu(axis, index) {
    var details = document.createElement("details");
    var summary = document.createElement("summary");
    var menu = document.createElement("div");
    var actions = axis === "row"
      ? [
          { action: "insert-before", label: "Insert above" },
          { action: "insert-after", label: "Insert below" },
          { action: "delete", label: "Delete row" },
        ]
      : [
          { action: "insert-before", label: "Insert left" },
          { action: "insert-after", label: "Insert right" },
          { action: "delete", label: "Delete column" },
        ];

    details.className = "header-menu";

    summary.className = "header-menu-trigger";
    summary.setAttribute("aria-label", axis === "row" ? "Row options" : "Column options");
    summary.textContent = "...";
    details.appendChild(summary);

    menu.className = "header-menu-popover";
    actions.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "header-action";
      button.dataset.axis = axis;
      button.dataset.index = String(index);
      button.dataset.action = item.action;
      button.textContent = item.label;
      menu.appendChild(button);
    });

    details.appendChild(menu);
    return details;
  }

  function createHeaderContent(label, axis, index) {
    var content = document.createElement("div");
    var labelElement = document.createElement("span");

    content.className = "header-content";
    labelElement.className = "header-label";
    labelElement.textContent = label;

    content.appendChild(labelElement);
    content.appendChild(createHeaderMenu(axis, index));

    return content;
  }

  function renderHeaders() {
    for (var col = 0; col < COLS; col += 1) {
      var header = document.createElement("div");
      header.className = "column-header";
      header.appendChild(createHeaderContent(columnLabel(col), "column", col + 1));
      columnHeaders.appendChild(header);
    }

    for (var row = 1; row <= ROWS; row += 1) {
      var rowHeader = document.createElement("div");
      rowHeader.className = "row-header";
      rowHeader.appendChild(createHeaderContent(String(row), "row", row));
      rowHeaders.appendChild(rowHeader);
    }
  }

  function renderGrid() {
    for (var row = 1; row <= ROWS; row += 1) {
      for (var col = 0; col < COLS; col += 1) {
        var cellId = String.fromCharCode(65 + col) + row;
        var cell = document.createElement("button");
        var label = document.createElement("span");

        cell.type = "button";
        cell.className = "cell";
        cell.dataset.cellId = cellId;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", cellId);

        label.className = "cell-label";
        label.textContent = workbookState.getCellRaw(cellId);

        cell.appendChild(label);
        cell.addEventListener("click", handleCellClick);
        grid.appendChild(cell);
      }
    }
  }

  function refreshGridValues() {
    grid.querySelectorAll(".cell").forEach(function (cell) {
      cell.querySelector(".cell-label").textContent = workbookState.getCellRaw(cell.dataset.cellId);
    });
    refreshSelectionVisuals();
  }

  function parseCellId(cellId) {
    var match = /^([A-Z])([1-9][0-9]*)$/.exec(cellId);
    return {
      col: match[1].charCodeAt(0) - 64,
      row: Number(match[2]),
    };
  }

  function formatCellId(point) {
    return String.fromCharCode(64 + point.col) + point.row;
  }

  function selectionForCell(cellId) {
    var point = parseCellId(cellId);
    return {
      start: { row: point.row, col: point.col },
      end: { row: point.row, col: point.col },
      active: { row: point.row, col: point.col },
    };
  }

  function closeHeaderMenus(exceptMenu) {
    document.querySelectorAll(".header-menu[open]").forEach(function (menu) {
      if (menu !== exceptMenu) {
        menu.open = false;
      }
    });
  }

  function replaceWorkbookCells(nextCells) {
    var existingCells = workbookState.getAllCellEntries();

    Object.keys(existingCells).forEach(function (cellRef) {
      workbookState.clearCell(cellRef);
    });

    Object.keys(nextCells).sort().forEach(function (cellRef) {
      workbookState.setCellRaw(cellRef, nextCells[cellRef]);
    });

    refreshGridValues();
  }

  function applyStructuralAction(axis, action, index) {
    var targetIndex = Number(index);
    var currentCells = workbookState.getAllCellEntries();
    var nextCells;
    var nextSelection;
    var label;

    if (axis === "row") {
      if (action === "insert-before") {
        nextCells = structuralEdits.insertRow(currentCells, targetIndex);
        nextSelection = structuralEdits.adjustSelection(selection, { type: "insert-row", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Inserted row above " + targetIndex;
      } else if (action === "insert-after") {
        nextCells = structuralEdits.insertRow(currentCells, targetIndex + 1);
        nextSelection = structuralEdits.adjustSelection(selection, { type: "insert-row", index: targetIndex + 1, maxRows: ROWS, maxCols: COLS });
        label = "Inserted row below " + targetIndex;
      } else {
        nextCells = structuralEdits.deleteRow(currentCells, targetIndex);
        nextSelection = structuralEdits.adjustSelection(selection, { type: "delete-row", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Deleted row " + targetIndex;
      }
    } else {
      if (action === "insert-before") {
        nextCells = structuralEdits.insertColumn(currentCells, targetIndex);
        nextSelection = structuralEdits.adjustSelection(selection, { type: "insert-column", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Inserted column left of " + columnLabel(targetIndex - 1);
      } else if (action === "insert-after") {
        nextCells = structuralEdits.insertColumn(currentCells, targetIndex + 1);
        nextSelection = structuralEdits.adjustSelection(selection, { type: "insert-column", index: targetIndex + 1, maxRows: ROWS, maxCols: COLS });
        label = "Inserted column right of " + columnLabel(targetIndex - 1);
      } else {
        nextCells = structuralEdits.deleteColumn(currentCells, targetIndex);
        nextSelection = structuralEdits.adjustSelection(selection, { type: "delete-column", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Deleted column " + columnLabel(targetIndex - 1);
      }
    }

    replaceWorkbookCells(nextCells);
    setSelection(nextSelection);
    status.textContent = label;
  }

  function handleHeaderClick(event) {
    var trigger = event.target.closest(".header-menu-trigger");
    var actionButton;

    if (trigger) {
      closeHeaderMenus(trigger.parentElement);
      return;
    }

    actionButton = event.target.closest(".header-action");
    if (!actionButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyStructuralAction(actionButton.dataset.axis, actionButton.dataset.action, actionButton.dataset.index);
    actionButton.closest(".header-menu").open = false;
  }

  function handleDocumentClick(event) {
    if (!event.target.closest(".header-menu")) {
      closeHeaderMenus(null);
    }
  }

  function handleCellClick(event) {
    var nextSelection = selectionForCell(event.currentTarget.dataset.cellId);

    if (event.shiftKey) {
      setSelection(rangeClipboard.extendRange(selection, nextSelection.active));
      return;
    }

    clearCutPreview();
    setSelection(nextSelection);
  }

  function handlePointerStart(event) {
    var cell = event.target.closest(".cell");
    var nextSelection;

    if (!cell) {
      return;
    }

    nextSelection = selectionForCell(cell.dataset.cellId);
    if (event.shiftKey) {
      setSelection(rangeClipboard.extendRange(selection, nextSelection.active));
      return;
    }

    dragAnchor = nextSelection.active;
    isDragging = true;
    clearCutPreview();
    setSelection(nextSelection);
  }

  function handlePointerMove(event) {
    var cell;

    if (!isDragging) {
      return;
    }

    cell = event.target.closest(".cell");
    if (!cell) {
      return;
    }

    setSelection(rangeClipboard.normalizeRange(dragAnchor, selectionForCell(cell.dataset.cellId).active, selectionForCell(cell.dataset.cellId).active));
  }

  function handlePointerEnd() {
    isDragging = false;
  }

  function handleKeydown(event) {
    var nextActive;

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      applyGridCells(rangeClipboard.clearRange(readGridCells(), selection));
      clearCutPreview();
      refreshGridValues();
      status.textContent = "Selection cleared";
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    nextActive = {
      row: selection.active.row,
      col: selection.active.col,
    };

    if (event.key === "ArrowUp") {
      nextActive.row = rangeClipboard.clamp(selection.active.row - 1, 1, ROWS);
    } else if (event.key === "ArrowDown") {
      nextActive.row = rangeClipboard.clamp(selection.active.row + 1, 1, ROWS);
    } else if (event.key === "ArrowLeft") {
      nextActive.col = rangeClipboard.clamp(selection.active.col - 1, 1, COLS);
    } else {
      nextActive.col = rangeClipboard.clamp(selection.active.col + 1, 1, COLS);
    }

    clearCutPreview();
    if (event.shiftKey) {
      setSelection(rangeClipboard.extendRange(selection, nextActive));
      return;
    }

    setSelection(rangeClipboard.normalizeRange(nextActive, nextActive, nextActive));
  }

  function handleCopy(event) {
    if (!event.clipboardData) {
      return;
    }

    event.preventDefault();
    clipboardText = rangeClipboard.copyRange(readGridCells(), selection);
    clipboardRange = selection;
    event.clipboardData.setData("text/plain", clipboardText);
    clearCutPreview();
    refreshSelectionVisuals();
    status.textContent = "Selection copied";
  }

  function handleCut(event) {
    if (!event.clipboardData) {
      return;
    }

    event.preventDefault();
    clipboardText = rangeClipboard.copyRange(readGridCells(), selection);
    clipboardRange = selection;
    cutRange = selection;
    event.clipboardData.setData("text/plain", clipboardText);
    refreshSelectionVisuals();
    status.textContent = "Selection cut";
  }

  function handlePaste(event) {
    var text;
    var block;
    var currentSize;
    var destination;
    var isInternalClipboard;
    var result;

    if (!event.clipboardData) {
      return;
    }

    event.preventDefault();
    text = event.clipboardData.getData("text/plain");
    if (!text) {
      return;
    }

    block = rangeClipboard.parseClipboard(text);
    currentSize = selectionSize(selection);
    destination = currentSize.rows === block.length && currentSize.cols === block[0].length
      ? selection
      : selectionForCell(activeCellId);
    isInternalClipboard = text === clipboardText && !!clipboardRange;
    result = rangeClipboard.pasteBlock(readGridCells(), destination, text, {
      sourceRange: isInternalClipboard ? clipboardRange : null,
      cutRange: cutRange,
    });

    applyGridCells(result.cells);
    selection = result.range;
    activeCellId = formatCellId(selection.active);
    workbookState.setSelectedCell(activeCellId);
    clearCutPreview();
    refreshGridValues();
    status.textContent = "Selection pasted";
  }

  function selectionSize(currentSelection) {
    return {
      rows: currentSelection.end.row - currentSelection.start.row + 1,
      cols: currentSelection.end.col - currentSelection.start.col + 1,
    };
  }

  function setSelection(nextSelection) {
    selection = nextSelection;
    activeCellId = formatCellId(nextSelection.active);
    workbookState.setSelectedCell(activeCellId);
    nameBox.value = activeCellId;
    formulaInput.value = workbookState.getCellRaw(activeCellId);
    refreshSelectionVisuals();
  }

  function refreshSelectionVisuals() {
    grid.querySelectorAll(".cell").forEach(function (cell) {
      var point = parseCellId(cell.dataset.cellId);
      var inRange = point.row >= selection.start.row && point.row <= selection.end.row && point.col >= selection.start.col && point.col <= selection.end.col;
      var isActive = point.row === selection.active.row && point.col === selection.active.col;
      var isCut = !!cutRange
        && point.row >= cutRange.start.row && point.row <= cutRange.end.row
        && point.col >= cutRange.start.col && point.col <= cutRange.end.col;

      cell.classList.toggle("in-range", inRange);
      cell.classList.toggle("active", isActive);
      cell.classList.toggle("cut-preview", isCut);
      cell.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function readGridCells() {
    var entries = workbookState.getAllCellEntries();
    var cells = {};

    Object.keys(entries).forEach(function (cellRef) {
      var point = parseCellId(cellRef);
      cells[rangeClipboard.cellKey(point.row, point.col)] = entries[cellRef];
    });

    return cells;
  }

  function applyGridCells(nextGridCells) {
    var existingEntries = workbookState.getAllCellEntries();
    var nextEntries = {};

    Object.keys(nextGridCells).forEach(function (key) {
      var parts = key.split(",");
      nextEntries[formatCellId({ row: Number(parts[0]), col: Number(parts[1]) })] = nextGridCells[key];
    });

    Object.keys(existingEntries).forEach(function (cellRef) {
      if (!Object.prototype.hasOwnProperty.call(nextEntries, cellRef)) {
        workbookState.clearCell(cellRef);
      }
    });

    Object.keys(nextEntries).forEach(function (cellRef) {
      if (existingEntries[cellRef] !== nextEntries[cellRef]) {
        workbookState.setCellRaw(cellRef, nextEntries[cellRef]);
      }
    });
  }

  function clearCutPreview() {
    cutRange = null;
  }

  function createWorkbookState() {
    try {
      return window.WorkbookState.createWorkbookState();
    } catch (error) {
      status.textContent = "Storage unavailable";
      return window.WorkbookState.createWorkbookState({
        namespace: "apple-fallback",
        storage: createMemoryStorage(),
      });
    }
  }

  function createMemoryStorage() {
    var values = {};

    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      },
      setItem: function (key, value) {
        values[key] = String(value);
      },
      removeItem: function (key) {
        delete values[key];
      },
    };
  }
})();
