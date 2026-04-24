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
  var historyController = window.SpreadsheetHistoryPersistenceController && window.SpreadsheetHistoryPersistence
    ? window.SpreadsheetHistoryPersistenceController.installHistoryPersistenceController({
      target: document,
      store: store,
      historyPersistence: window.SpreadsheetHistoryPersistence
    })
    : null;
  var recordAction = historyController
    ? historyController.recordAction
    : function (label, mutate) { mutate(); };
  var formulaEditBefore = null;
  var formulaSheet = null;

  window.sheetStore = store;
  if (window.SpreadsheetClipboardController && window.SelectionClipboard) {
    window.removeSpreadsheetClipboardController = window.SpreadsheetClipboardController.installClipboardController({
      target: document,
      store: store,
      selectionTools: window.SelectionClipboard,
      recordAction: recordAction
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

  function recalculateDisplayValues() {
    if (!window.FormulaEngine) return null;
    formulaSheet = window.FormulaEngine.createSheet(store.snapshot().cells);
    window.FormulaEngine.recalculate(formulaSheet);
    return formulaSheet;
  }

  function formatDisplayValue(value) {
    if (value === true) return "TRUE";
    if (value === false) return "FALSE";
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function displayRecordFor(row, col) {
    var key = cellKey(row, col);
    if (!formulaSheet || !formulaSheet.values[key]) {
      return { raw: store.getCellRaw({ row: row, col: col }), display: store.getCellRaw({ row: row, col: col }) };
    }
    return formulaSheet.values[key];
  }

  function applyCellDisplayClasses(cell, record) {
    cell.classList.remove("number", "text", "error", "cell-error");
    if (record && record.error) {
      cell.classList.add("error", "cell-error");
    } else if (record && record.type === "number") {
      cell.classList.add("number");
    } else if (record && record.type === "text") {
      cell.classList.add("text");
    }
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

  function closeStructureMenus() {
    var menus = gridRoot.querySelectorAll(".structure-menu");
    var buttons = gridRoot.querySelectorAll(".structure-menu-button");

    Array.prototype.forEach.call(menus, function (menu) {
      menu.hidden = true;
    });
    Array.prototype.forEach.call(buttons, function (button) {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function applyStructureAction(type, index) {
    if (editing) commitEdit(false);

    var payload;

    recordAction(type, function () {
      payload = store.applyStructureAction({ type: type, index: index, count: 1 }, "header-control");
    });
    closeStructureMenus();
    renderShellGrid();
    syncSelectionChrome(store.snapshot().selection);
    if (status) status.textContent = payload.type + " applied. Undo payload: " + payload.undo.type + ".";
  }

  function createStructureMenu(label, actions) {
    var wrapper = document.createElement("span");
    var labelNode = document.createElement("span");
    var button = document.createElement("button");
    var menu = document.createElement("div");

    wrapper.className = "structure-header-content";
    labelNode.className = "structure-header-label";
    labelNode.textContent = label;
    button.type = "button";
    button.className = "structure-menu-button";
    button.textContent = "v";
    button.setAttribute("aria-label", label + " structure menu");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    menu.className = "structure-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");

    actions.forEach(function (action) {
      var item = document.createElement("button");
      item.type = "button";
      item.textContent = action.label;
      item.setAttribute("data-action", action.name);
      item.setAttribute("role", "menuitem");
      if (action.danger) item.className = "danger-action";
      item.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        action.run();
      });
      menu.appendChild(item);
    });

    button.addEventListener("click", function (event) {
      var shouldOpen = menu.hidden;
      event.preventDefault();
      event.stopPropagation();
      closeStructureMenus();
      menu.hidden = !shouldOpen;
      button.setAttribute("aria-expanded", String(shouldOpen));
    });

    wrapper.appendChild(labelNode);
    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    return wrapper;
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
      var record = displayRecordFor(row, col);
      cell.textContent = formatDisplayValue(record.display);
      applyCellDisplayClasses(cell, record);
    }
  }

  function renderPopulatedCells() {
    var cells = store.snapshot().cells;
    Object.keys(cells).forEach(function (key) {
      var match = /^([A-Z]+)(\d+)$/.exec(key);
      if (!match) return;
      var colName = match[1];
      var col = 0;
      for (var index = 0; index < colName.length; index += 1) {
        col = col * 26 + colName.charCodeAt(index) - 64;
      }
      renderCellRaw(Number(match[2]) - 1, col - 1);
    });
  }

  function renderAllCellDisplays() {
    var cells = gridRoot.querySelectorAll(".cell");
    Array.prototype.forEach.call(cells, function (cell) {
      renderCellRaw(Number(cell.dataset.row), Number(cell.dataset.col));
    });
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
    if (cancel) {
      store.setCellRaw({ row: state.row, col: state.col }, nextRaw, "edit-cancel");
    } else {
      recordAction("cell-edit", function () {
        store.setCellRaw({ row: state.row, col: state.col }, nextRaw, "cell-edit");
      });
    }
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
    if (!formulaEditBefore) {
      formulaEditBefore = store.snapshot();
    }
    if (editing) {
      editing.input.value = formulaInput.value;
      return;
    }
    store.setCellRaw(active, formulaInput.value, "formula-bar");
  }

  function handleFormulaKeydown(event) {
    function commitFormulaBarAction(label) {
      if (!formulaEditBefore || !historyController || !historyController.recordSnapshots) {
        formulaEditBefore = null;
        return;
      }
      historyController.recordSnapshots(label, formulaEditBefore, store.snapshot());
      formulaEditBefore = null;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (editing) commitEdit(false);
      else store.setCellRaw(activeCell(), formulaInput.value, "formula-bar");
      commitFormulaBarAction("formula-bar");
      move(1, 0);
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (editing) commitEdit(false);
      else store.setCellRaw(activeCell(), formulaInput.value, "formula-bar");
      commitFormulaBarAction("formula-bar");
      move(0, 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (editing) commitEdit(true);
      formulaInput.value = store.getCellRaw(activeCell());
      formulaEditBefore = null;
    }
  }

  function renderShellGrid() {
    var snapshot = store.snapshot();
    var rows = snapshot.dimensions.rows;
    var columns = snapshot.dimensions.columns;
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
      columnHeader.className = "column-header structure-header";
      columnHeader.dataset.colHeader = String(col);
      columnHeader.appendChild(createStructureMenu(spreadsheet.colToName(col), [
        { label: "Insert column left", name: "insert-column-left", run: function (targetCol) { return function () { applyStructureAction("insertColumns", targetCol); }; }(col) },
        { label: "Insert column right", name: "insert-column-right", run: function (targetCol) { return function () { applyStructureAction("insertColumns", targetCol + 1); }; }(col) },
        { label: "Delete column", name: "delete-column", danger: true, run: function (targetCol) { return function () { applyStructureAction("deleteColumns", targetCol); }; }(col) }
      ]));
      fragment.appendChild(columnHeader);
    }

    for (row = 0; row < rows; row += 1) {
      var rowHeader = document.createElement("div");
      rowHeader.className = "row-header structure-header";
      rowHeader.dataset.rowHeader = String(row);
      rowHeader.appendChild(createStructureMenu(String(row + 1), [
        { label: "Insert row above", name: "insert-row-above", run: function (targetRow) { return function () { applyStructureAction("insertRows", targetRow); }; }(row) },
        { label: "Insert row below", name: "insert-row-below", run: function (targetRow) { return function () { applyStructureAction("insertRows", targetRow + 1); }; }(row) },
        { label: "Delete row", name: "delete-row", danger: true, run: function (targetRow) { return function () { applyStructureAction("deleteRows", targetRow); }; }(row) }
      ]));
      fragment.appendChild(rowHeader);

      for (col = 0; col < columns; col += 1) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.role = "gridcell";
        cell.tabIndex = -1;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.cell = cellKey(row, col);
        var record = displayRecordFor(row, col);
        cell.textContent = formatDisplayValue(record.display);
        applyCellDisplayClasses(cell, record);
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
    recalculateDisplayValues();
    renderAllCellDisplays();
    if (spreadsheet.cellKey(activeCell()) === event.detail.key && !editing) {
      formulaInput.value = event.detail.raw;
    }
  });

  store.on("structurechange", function () {
    recalculateDisplayValues();
    renderShellGrid();
    syncSelectionChrome(store.snapshot().selection);
  });

  store.on("hydrate", function (event) {
    recalculateDisplayValues();
    renderAllCellDisplays();
    syncSelectionChrome(event.detail.state.selection);
  });

  formulaInput.addEventListener("input", handleFormulaInput);
  formulaInput.addEventListener("keydown", handleFormulaKeydown);
  document.addEventListener("keydown", handleDocumentKeydown);
  document.addEventListener("mouseup", function () { draggingAnchor = null; });
  document.addEventListener("click", closeStructureMenus);

  recalculateDisplayValues();
  renderShellGrid();
  syncSelectionChrome(store.snapshot().selection);
  document.dispatchEvent(new CustomEvent("spreadsheet:ready", { detail: { store: store } }));
}());
