(function () {
  var core = window.SpreadsheetCore;
  var ROWS = 100;
  var COLS = 26;
  var STORAGE_NAMESPACE = window.__APPLE_RUN_STORAGE_NAMESPACE__ || window.__RUN_STORAGE_NAMESPACE__ || "apple-run";
  var STORAGE_KEY = STORAGE_NAMESPACE + ":bootstrap-selection";
  var columnHeaders = document.getElementById("column-headers");
  var rowHeaders = document.getElementById("row-headers");
  var grid = document.getElementById("grid");
  var nameBox = document.getElementById("name-box");
  var formulaInput = document.getElementById("formula-input");
  var status = document.getElementById("app-status");
  var restoredPoint = pointFromCellId(restoreSelection() || "A1");

  var state = {
    cells: {},
    selection: core.normalizeRange(restoredPoint, restoredPoint, restoredPoint),
    dragAnchor: null,
    isDragging: false,
    clipboardText: "",
    clipboardRange: null,
    cutRange: null,
  };

  renderHeaders();
  renderGrid();
  renderSelection();
  status.textContent = "Range selection ready";

  document.addEventListener("mousedown", handlePointerStart);
  document.addEventListener("mouseover", handlePointerMove);
  document.addEventListener("mouseup", handlePointerEnd);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("copy", handleCopy);
  document.addEventListener("cut", handleCut);
  document.addEventListener("paste", handlePaste);

  function renderHeaders() {
    for (var col = 1; col <= COLS; col += 1) {
      var header = document.createElement("div");
      header.className = "column-header";
      header.textContent = columnLabel(col);
      columnHeaders.appendChild(header);
    }

    for (var row = 1; row <= ROWS; row += 1) {
      var rowHeader = document.createElement("div");
      rowHeader.className = "row-header";
      rowHeader.textContent = String(row);
      rowHeaders.appendChild(rowHeader);
    }
  }

  function renderGrid() {
    for (var row = 1; row <= ROWS; row += 1) {
      for (var col = 1; col <= COLS; col += 1) {
        var point = { row: row, col: col };
        var button = document.createElement("button");
        var label = document.createElement("span");

        button.type = "button";
        button.className = "cell";
        button.dataset.cellId = cellIdFromPoint(point);
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-label", button.dataset.cellId);
        button.addEventListener("click", handleCellClick);

        label.className = "cell-label";
        button.appendChild(label);
        grid.appendChild(button);
      }
    }
  }

  function handleCellClick(event) {
    if (!event.shiftKey) {
      return;
    }
    setSelection(core.extendRange(state.selection, pointFromCellId(event.currentTarget.dataset.cellId)));
  }

  function handlePointerStart(event) {
    var cell = event.target.closest(".cell");
    if (!cell) {
      return;
    }

    var point = pointFromCellId(cell.dataset.cellId);
    if (event.shiftKey) {
      setSelection(core.extendRange(state.selection, point));
      return;
    }

    state.dragAnchor = point;
    state.isDragging = true;
    clearCutPreview();
    setSelection(core.normalizeRange(point, point, point));
  }

  function handlePointerMove(event) {
    var cell;
    if (!state.isDragging) {
      return;
    }

    cell = event.target.closest(".cell");
    if (!cell) {
      return;
    }

    setSelection(core.normalizeRange(state.dragAnchor, pointFromCellId(cell.dataset.cellId), pointFromCellId(cell.dataset.cellId)));
  }

  function handlePointerEnd() {
    state.isDragging = false;
  }

  function handleKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      state.cells = core.clearRange(state.cells, state.selection);
      clearCutPreview();
      renderSelection();
      status.textContent = "Selection cleared";
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1, 0, event.shiftKey);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1, 0, event.shiftKey);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(0, -1, event.shiftKey);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "Tab") {
      event.preventDefault();
      moveSelection(0, 1, event.shiftKey);
    }
  }

  function handleCopy(event) {
    if (!event.clipboardData) {
      return;
    }

    event.preventDefault();
    state.clipboardText = core.copyRange(state.cells, state.selection);
    state.clipboardRange = state.selection;
    event.clipboardData.setData("text/plain", state.clipboardText);
    clearCutPreview();
    renderSelection();
    status.textContent = "Selection copied";
  }

  function handleCut(event) {
    if (!event.clipboardData) {
      return;
    }

    event.preventDefault();
    state.clipboardText = core.copyRange(state.cells, state.selection);
    state.clipboardRange = state.selection;
    state.cutRange = state.selection;
    event.clipboardData.setData("text/plain", state.clipboardText);
    renderSelection();
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

    block = core.parseClipboard(text);
    currentSize = rangeSize(state.selection);
    destination = currentSize.rows === block.length && currentSize.cols === block[0].length
      ? state.selection
      : core.normalizeRange(state.selection.active, state.selection.active, state.selection.active);
    isInternalClipboard = text === state.clipboardText && !!state.clipboardRange;
    result = core.pasteBlock(state.cells, destination, text, {
      sourceRange: isInternalClipboard ? state.clipboardRange : null,
      cutRange: state.cutRange,
    });

    state.cells = result.cells;
    state.selection = result.range;
    clearCutPreview();
    renderSelection();
    status.textContent = "Selection pasted";
  }

  function moveSelection(rowDelta, colDelta, extend) {
    var nextActive = {
      row: clamp(state.selection.active.row + rowDelta, 1, ROWS),
      col: clamp(state.selection.active.col + colDelta, 1, COLS),
    };

    clearCutPreview();
    if (extend) {
      setSelection(core.extendRange(state.selection, nextActive));
      return;
    }
    setSelection(core.normalizeRange(nextActive, nextActive, nextActive));
  }

  function setSelection(selection) {
    state.selection = selection;
    persistSelection(cellIdFromPoint(selection.active));
    renderSelection();
  }

  function renderSelection() {
    var cells = grid.querySelectorAll(".cell");

    cells.forEach(function (cell) {
      var point = pointFromCellId(cell.dataset.cellId);
      var key = core.cellKey(point.row, point.col);
      var active = point.row === state.selection.active.row && point.col === state.selection.active.col;
      var inRange = point.row >= state.selection.start.row && point.row <= state.selection.end.row && point.col >= state.selection.start.col && point.col <= state.selection.end.col;

      cell.classList.toggle("in-range", inRange);
      cell.classList.toggle("active", active);
      cell.classList.toggle("cut-preview", !!state.cutRange && point.row >= state.cutRange.start.row && point.row <= state.cutRange.end.row && point.col >= state.cutRange.start.col && point.col <= state.cutRange.end.col);
      cell.setAttribute("aria-selected", active ? "true" : "false");
      cell.querySelector(".cell-label").textContent = state.cells[key] || "";
    });

    nameBox.value = cellIdFromPoint(state.selection.active);
    formulaInput.value = state.cells[core.cellKey(state.selection.active.row, state.selection.active.col)] || "";
  }

  function clearCutPreview() {
    state.cutRange = null;
  }

  function rangeSize(range) {
    return {
      rows: range.end.row - range.start.row + 1,
      cols: range.end.col - range.start.col + 1,
    };
  }

  function cellIdFromPoint(point) {
    return columnLabel(point.col) + String(point.row);
  }

  function pointFromCellId(cellId) {
    var match = /^([A-Z]+)(\d+)$/.exec(cellId || "A1");
    return {
      row: match ? Number(match[2]) : 1,
      col: match ? columnNumber(match[1]) : 1,
    };
  }

  function columnLabel(index) {
    var value = index;
    var label = "";
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  }

  function columnNumber(label) {
    var value = 0;
    var index;
    for (index = 0; index < label.length; index += 1) {
      value = (value * 26) + (label.charCodeAt(index) - 64);
    }
    return value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function persistSelection(cellId) {
    try {
      window.localStorage.setItem(STORAGE_KEY, cellId);
    } catch (error) {
      status.textContent = "Storage unavailable";
    }
  }

  function restoreSelection() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }
})();
