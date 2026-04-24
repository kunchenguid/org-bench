(function () {
  "use strict";

  var spreadsheet = window.Spreadsheet;
  var store = spreadsheet.createStore();
  var activeAddress = document.getElementById("active-address");
  var formulaInput = document.getElementById("formula-input");
  var gridRoot = document.getElementById("grid-root");
  var status = document.querySelector("[data-spreadsheet-slot='status']");
  var editing = null;
  var draggingAnchor = null;

  window.sheetStore = store;
  if (window.SpreadsheetClipboardController && window.SelectionClipboard) {
    window.removeSpreadsheetClipboardController = window.SpreadsheetClipboardController.installClipboardController({
      target: document,
      store: store,
      selectionTools: window.SelectionClipboard
    });
  }

  function cellKey(row, col) {
    return spreadsheet.cellKey({ row: row, col: col });
  }

  function activeCell() {
    return store.snapshot().selection.active;
  }

  function cellAt(row, col) {
    return gridRoot.querySelector("[data-row='" + row + "'][data-col='" + col + "']");
  }

  function colHeaderAt(col) {
    return gridRoot.querySelector("[data-col-header='" + col + "']");
  }

  function rowHeaderAt(row) {
    return gridRoot.querySelector("[data-row-header='" + row + "']");
  }

  function clearSelectionChrome() {
    var selected = gridRoot.querySelectorAll(".active, .active-header, .is-selected, .is-active-cell, .selection-top, .selection-bottom, .selection-left, .selection-right");
    Array.prototype.forEach.call(selected, function (element) {
      element.classList.remove(
        "active",
        "active-header",
        "is-selected",
        "is-active-cell",
        "selection-top",
        "selection-bottom",
        "selection-left",
        "selection-right"
      );
    });
  }

  function selectionForChrome(selection) {
    return {
      active: { row: selection.anchor.row + 1, col: selection.anchor.col + 1 },
      focus: { row: selection.focus.row + 1, col: selection.focus.col + 1 }
    };
  }

  function syncSelectionChrome(selection) {
    var active = selection.active;
    var cell = cellAt(active.row, active.col);
    var range = selection.range;

    clearSelectionChrome();
    if (window.SelectionClipboard) {
      for (var row = range.top; row <= range.bottom; row += 1) {
        for (var col = range.left; col <= range.right; col += 1) {
          var rangeCell = cellAt(row, col);
          if (rangeCell) {
            rangeCell.classList.add.apply(
              rangeCell.classList,
              window.SelectionClipboard.getCellSelectionClasses(selectionForChrome(selection), row + 1, col + 1)
            );
          }
        }
      }
    }
    if (cell) cell.classList.add("active");
    if (colHeaderAt(active.col)) colHeaderAt(active.col).classList.add("active-header");
    if (rowHeaderAt(active.row)) rowHeaderAt(active.row).classList.add("active-header");
    activeAddress.textContent = spreadsheet.cellKey(active);
    formulaInput.value = store.getCellRaw(active);
    if (status) status.textContent = "Ready";
    if (cell) cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderCellRaw(row, col) {
    var cell = cellAt(row, col);
    if (cell && (!editing || editing.row !== row || editing.col !== col)) {
      cell.textContent = store.getCellRaw({ row: row, col: col });
    }
  }

  function commitEdit(cancel) {
    if (!editing) return;

    var state = editing;
    var cell = cellAt(state.row, state.col);
    var nextRaw = cancel ? state.original : state.input.value;

    editing = null;
    if (cell) {
      cell.classList.remove("editing");
      cell.textContent = "";
    }
    store.setCellRaw({ row: state.row, col: state.col }, nextRaw, cancel ? "edit-cancel" : "cell-edit");
    renderCellRaw(state.row, state.col);
    formulaInput.value = store.getCellRaw(activeCell());
  }

  function selectCell(row, col) {
    if (editing) commitEdit(false);
    store.selectCell({ row: row, col: col });
  }

  function beginEdit(options) {
    var active = activeCell();
    var cell = cellAt(active.row, active.col);
    var original = store.getCellRaw(active);
    var input = document.createElement("input");

    if (editing || !cell) return;

    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = options && Object.prototype.hasOwnProperty.call(options, "replaceWith") ? options.replaceWith : original;

    cell.classList.add("editing");
    cell.textContent = "";
    cell.appendChild(input);
    editing = { row: active.row, col: active.col, original: original, input: input };
    formulaInput.value = input.value;
    if (status) status.textContent = "Editing " + spreadsheet.cellKey(active);

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener("input", function () {
      formulaInput.value = input.value;
    });
  }

  function move(rowDelta, colDelta) {
    var active = activeCell();
    selectCell(active.row + rowDelta, active.col + colDelta);
  }

  function extendRange(rowDelta, colDelta) {
    var selection = store.snapshot().selection;
    var nextFocus = spreadsheet.clampCell({
      row: selection.focus.row + rowDelta,
      col: selection.focus.col + colDelta
    }, store.snapshot().dimensions);
    store.selectRange(selection.anchor, nextFocus);
  }

  function handleDocumentKeydown(event) {
    if (event.target === formulaInput) return;

    if (editing) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitEdit(false);
        move(1, 0);
      } else if (event.key === "Tab") {
        event.preventDefault();
        commitEdit(false);
        move(0, 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        commitEdit(true);
      }
      return;
    }

    if (event.key === "ArrowUp") { event.preventDefault(); event.shiftKey ? extendRange(-1, 0) : move(-1, 0); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); event.shiftKey ? extendRange(1, 0) : move(1, 0); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); event.shiftKey ? extendRange(0, -1) : move(0, -1); return; }
    if (event.key === "ArrowRight") { event.preventDefault(); event.shiftKey ? extendRange(0, 1) : move(0, 1); return; }
    if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); beginEdit(); return; }
    if (event.key === "Tab") { event.preventDefault(); move(0, 1); return; }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginEdit({ replaceWith: event.key });
    }
  }

  function handleFormulaInput() {
    var active = activeCell();
    if (editing) {
      editing.input.value = formulaInput.value;
      return;
    }
    store.setCellRaw(active, formulaInput.value, "formula-bar");
    renderCellRaw(active.row, active.col);
  }

  function handleFormulaKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (editing) commitEdit(false);
      else store.setCellRaw(activeCell(), formulaInput.value, "formula-bar");
      move(1, 0);
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (editing) commitEdit(false);
      else store.setCellRaw(activeCell(), formulaInput.value, "formula-bar");
      move(0, 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (editing) commitEdit(true);
      formulaInput.value = store.getCellRaw(activeCell());
    }
  }

  function renderShellGrid() {
    var rows = spreadsheet.constants.rows;
    var columns = spreadsheet.constants.columns;
    var fragment = document.createDocumentFragment();
    var corner = document.createElement("div");
    var row;
    var col;

    gridRoot.textContent = "";
    gridRoot.style.setProperty("--column-count", String(columns));
    gridRoot.setAttribute("role", "grid");
    gridRoot.setAttribute("aria-rowcount", String(rows));
    gridRoot.setAttribute("aria-colcount", String(columns));
    gridRoot.dataset.ready = "true";

    corner.className = "corner";
    fragment.appendChild(corner);

    for (col = 0; col < columns; col += 1) {
      var columnHeader = document.createElement("div");
      columnHeader.className = "column-header";
      columnHeader.dataset.colHeader = String(col);
      columnHeader.textContent = spreadsheet.colToName(col);
      fragment.appendChild(columnHeader);
    }

    for (row = 0; row < rows; row += 1) {
      var rowHeader = document.createElement("div");
      rowHeader.className = "row-header";
      rowHeader.dataset.rowHeader = String(row);
      rowHeader.textContent = String(row + 1);
      fragment.appendChild(rowHeader);

      for (col = 0; col < columns; col += 1) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.role = "gridcell";
        cell.tabIndex = -1;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.cell = cellKey(row, col);
        cell.addEventListener("mousedown", function (event) {
          event.preventDefault();
          var targetCell = { row: Number(this.dataset.row), col: Number(this.dataset.col) };
          if (event.shiftKey) {
            store.selectRange(store.snapshot().selection.anchor, targetCell);
            draggingAnchor = null;
          } else {
            draggingAnchor = targetCell;
            selectCell(targetCell.row, targetCell.col);
          }
        });
        cell.addEventListener("mouseenter", function (event) {
          if (!draggingAnchor || event.buttons !== 1) return;
          store.selectRange(draggingAnchor, { row: Number(this.dataset.row), col: Number(this.dataset.col) });
        });
        cell.addEventListener("dblclick", function (event) {
          event.preventDefault();
          beginEdit();
        });
        fragment.appendChild(cell);
      }
    }

    gridRoot.appendChild(fragment);
  }

  store.on("selectionchange", function (event) {
    syncSelectionChrome(event.detail.selection);
  });

  store.on("cellchange", function (event) {
    renderCellRaw(event.detail.cell.row, event.detail.cell.col);
    if (spreadsheet.cellKey(activeCell()) === event.detail.key && !editing) {
      formulaInput.value = event.detail.raw;
    }
  });

  formulaInput.addEventListener("input", handleFormulaInput);
  formulaInput.addEventListener("keydown", handleFormulaKeydown);
  document.addEventListener("keydown", handleDocumentKeydown);
  document.addEventListener("mouseup", function () { draggingAnchor = null; });

  renderShellGrid();
  syncSelectionChrome(store.snapshot().selection);
  document.dispatchEvent(new CustomEvent("spreadsheet:ready", { detail: { store: store } }));
}());
