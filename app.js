(function () {
  "use strict";

  var interaction = window.CellInteraction;
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
  var controller = interaction.createCellInteractionController({
    rows: ROWS,
    cols: COLS,
    workbookState: workbookState,
  });
  var activeCellId = workbookState.getSelectedCell();

  renderHeaders();
  renderGrid();
  refreshGridValues();
  refreshSelection();
  status.textContent = "Workbook state ready";

  columnHeaders.addEventListener("click", handleHeaderClick);
  rowHeaders.addEventListener("click", handleHeaderClick);
  document.addEventListener("click", handleDocumentClick);

  formulaInput.addEventListener("focus", function () {
    beginFormulaEdit(false);
  });

  formulaInput.addEventListener("input", function () {
    controller.setDraftValue(formulaInput.value);
  });

  formulaInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit("down");
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      commitEdit("right");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (document.activeElement === formulaInput || isEditing()) {
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      controller.moveActive(-1, 0);
      refreshSelection();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      controller.moveActive(1, 0);
      refreshSelection();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      controller.moveActive(0, -1);
      refreshSelection();
      return;
    }

    if (event.key === "ArrowRight" || event.key === "Tab") {
      event.preventDefault();
      controller.moveActive(0, 1);
      refreshSelection();
      return;
    }

    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      beginCellEdit(null, true);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginCellEdit(event.key, false);
    }
  });

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
      for (var col = 1; col <= COLS; col += 1) {
        var cellId = toCellId(row, col);
        var cell = document.createElement("button");
        var label = document.createElement("span");

        cell.type = "button";
        cell.className = "cell";
        cell.dataset.cellId = cellId;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", cellId);

        label.className = "cell-label";
        cell.appendChild(label);
        cell.addEventListener("click", handleCellClick);
        cell.addEventListener("dblclick", handleCellDoubleClick);
        grid.appendChild(cell);
      }
    }
  }

  function renderCell(cellId) {
    var cell = getCellElement(cellId);
    var label;
    var editor = controller.getEditorState();
    var input;

    if (!cell) {
      return null;
    }

    cell.querySelectorAll(".cell-editor").forEach(function (node) {
      node.remove();
    });

    label = cell.querySelector(".cell-label");
    label.textContent = workbookState.getCellRaw(cellId);

    if (editor && editor.cellId === cellId && editor.source === "cell") {
      input = document.createElement("input");
      input.type = "text";
      input.className = "cell-editor";
      input.value = editor.draft;
      input.addEventListener("input", function () {
        controller.setDraftValue(input.value);
        renderFormulaBar();
      });
      input.addEventListener("keydown", handleEditorKeydown);
      cell.appendChild(input);
      input.focus();
      return input;
    }

    return null;
  }

  function refreshGridValues() {
    grid.querySelectorAll(".cell").forEach(function (cell) {
      renderCell(cell.dataset.cellId);
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

  function toCellId(row, col) {
    return String.fromCharCode(64 + col) + row;
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
    if (!actionButton || isEditing()) {
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

  function handleCellDoubleClick(event) {
    setActiveCell(event.currentTarget.dataset.cellId);
    beginCellEdit(null, true);
  }

  function setActiveCell(cellId) {
    if (isEditing()) {
      return;
    }

    controller.selectCell(cellId);
    refreshSelection();
  }

  function refreshSelection() {
    var previousCell = activeCellId ? getCellElement(activeCellId) : null;
    var nextCellId = controller.getSelection().active;
    var nextCell = getCellElement(nextCellId);

    if (previousCell) {
      previousCell.classList.remove("active");
      previousCell.setAttribute("aria-selected", "false");
      renderCell(activeCellId);
    }

    if (!nextCell) {
      return;
    }

    activeCellId = nextCellId;
    nextCell.classList.add("active");
    nextCell.setAttribute("aria-selected", "true");
    nameBox.value = nextCellId;
    renderFormulaBar();
    renderCell(nextCellId);
    nextCell.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderFormulaBar() {
    formulaInput.value = controller.getFormulaBarValue();
  }

  function beginCellEdit(seedValue, selectContents) {
    var input;

    if (seedValue == null) {
      controller.beginEdit("cell");
    } else {
      controller.startTyping(seedValue);
    }

    renderFormulaBar();
    input = renderCell(activeCellId);
    if (!input) {
      return;
    }

    if (selectContents) {
      input.select();
    } else {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function beginFormulaEdit(selectContents) {
    if (!isEditing()) {
      controller.beginEdit("formula-bar");
    }

    renderFormulaBar();
    formulaInput.focus();
    if (selectContents) {
      formulaInput.select();
    } else {
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    }
  }

  function commitEdit(move) {
    controller.commitEdit(move);
    refreshGridValues();
    refreshSelection();
    status.textContent = "Edited " + activeCellId;
  }

  function cancelEdit() {
    var editor = controller.getEditorState();
    controller.cancelEdit();
    renderFormulaBar();
    if (editor) {
      renderCell(editor.cellId);
    }
    status.textContent = "Edit canceled";
  }

  function handleEditorKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit("down");
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      commitEdit("right");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  function isEditing() {
    return !!controller.getEditorState();
  }

  function getCellElement(cellId) {
    return grid.querySelector('[data-cell-id="' + cellId + '"]');
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
