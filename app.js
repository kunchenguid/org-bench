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
  var workbookState = createWorkbookState();
  var activeCellId = workbookState.getSelectedCell();

  renderHeaders();
  renderGrid();
  refreshGridValues();
  setActiveCell(activeCellId);
  status.textContent = "Workbook state ready";

  columnHeaders.addEventListener("click", handleHeaderClick);
  rowHeaders.addEventListener("click", handleHeaderClick);
  document.addEventListener("click", handleDocumentClick);

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
      var label = cell.querySelector(".cell-label");
      label.textContent = workbookState.getCellRaw(cell.dataset.cellId);
    });
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
        nextSelection = structuralEdits.adjustSelection(selectionForCell(activeCellId), { type: "insert-row", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Inserted row above " + targetIndex;
      } else if (action === "insert-after") {
        nextCells = structuralEdits.insertRow(currentCells, targetIndex + 1);
        nextSelection = structuralEdits.adjustSelection(selectionForCell(activeCellId), { type: "insert-row", index: targetIndex + 1, maxRows: ROWS, maxCols: COLS });
        label = "Inserted row below " + targetIndex;
      } else {
        nextCells = structuralEdits.deleteRow(currentCells, targetIndex);
        nextSelection = structuralEdits.adjustSelection(selectionForCell(activeCellId), { type: "delete-row", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Deleted row " + targetIndex;
      }
    } else {
      if (action === "insert-before") {
        nextCells = structuralEdits.insertColumn(currentCells, targetIndex);
        nextSelection = structuralEdits.adjustSelection(selectionForCell(activeCellId), { type: "insert-column", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Inserted column left of " + columnLabel(targetIndex - 1);
      } else if (action === "insert-after") {
        nextCells = structuralEdits.insertColumn(currentCells, targetIndex + 1);
        nextSelection = structuralEdits.adjustSelection(selectionForCell(activeCellId), { type: "insert-column", index: targetIndex + 1, maxRows: ROWS, maxCols: COLS });
        label = "Inserted column right of " + columnLabel(targetIndex - 1);
      } else {
        nextCells = structuralEdits.deleteColumn(currentCells, targetIndex);
        nextSelection = structuralEdits.adjustSelection(selectionForCell(activeCellId), { type: "delete-column", index: targetIndex, maxRows: ROWS, maxCols: COLS });
        label = "Deleted column " + columnLabel(targetIndex - 1);
      }
    }

    replaceWorkbookCells(nextCells);
    setActiveCell(formatCellId(nextSelection.active));
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
    setActiveCell(event.currentTarget.dataset.cellId);
  }

  function setActiveCell(cellId) {
    var previous = grid.querySelector(".cell.active");
    var next = grid.querySelector('[data-cell-id="' + cellId + '"]');

    if (previous) {
      previous.classList.remove("active");
      previous.setAttribute("aria-selected", "false");
    }

    if (!next) {
      return;
    }

    next.classList.add("active");
    next.setAttribute("aria-selected", "true");
    activeCellId = cellId;
    nameBox.value = cellId;
    formulaInput.value = workbookState.getCellRaw(cellId);
    workbookState.setSelectedCell(cellId);
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
