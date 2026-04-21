(function (root, factory) {
  var api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (!root || !root.document || !root.WorkbookState) {
    return;
  }

  var ROWS = 100;
  var COLS = 26;
  var columnHeaders = root.document.getElementById("column-headers");
  var rowHeaders = root.document.getElementById("row-headers");
  var grid = root.document.getElementById("grid");
  var nameBox = root.document.getElementById("name-box");
  var formulaInput = root.document.getElementById("formula-input");
  var status = root.document.getElementById("app-status");
  var workbookState = createWorkbookState();
  var restoredPoint = pointFromCellId(workbookState.getSelectedCell());

  var state = {
    selection: api.normalizeRange(restoredPoint, restoredPoint, restoredPoint),
    dragAnchor: null,
    isDragging: false,
    clipboardText: "",
    clipboardRange: null,
    cutRange: null,
  };

  renderHeaders();
  renderGrid();
  renderSelection();
  status.textContent = "Workbook state ready";

  root.document.addEventListener("mousedown", handlePointerStart);
  root.document.addEventListener("mouseover", handlePointerMove);
  root.document.addEventListener("mouseup", handlePointerEnd);
  root.document.addEventListener("keydown", handleKeydown);
  root.document.addEventListener("copy", handleCopy);
  root.document.addEventListener("cut", handleCut);
  root.document.addEventListener("paste", handlePaste);

  function renderHeaders() {
    for (var col = 1; col <= COLS; col += 1) {
      var header = root.document.createElement("div");
      header.className = "column-header";
      header.textContent = api.columnLabel(col);
      columnHeaders.appendChild(header);
    }

    for (var row = 1; row <= ROWS; row += 1) {
      var rowHeader = root.document.createElement("div");
      rowHeader.className = "row-header";
      rowHeader.textContent = String(row);
      rowHeaders.appendChild(rowHeader);
    }
  }

  function renderGrid() {
    for (var row = 1; row <= ROWS; row += 1) {
      for (var col = 1; col <= COLS; col += 1) {
        var point = { row: row, col: col };
        var cellId = cellIdFromPoint(point);
        var cell = root.document.createElement("button");
        var label = root.document.createElement("span");

        cell.type = "button";
        cell.className = "cell";
        cell.dataset.cellId = cellId;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", cellId);

        label.className = "cell-label";
        cell.appendChild(label);
        cell.addEventListener("click", handleCellClick);
        grid.appendChild(cell);
      }
    }
  }

  function handleCellClick(event) {
    var point = pointFromCellId(event.currentTarget.dataset.cellId);

    if (event.shiftKey) {
      setSelection(api.extendRange(state.selection, point));
      return;
    }

    clearCutPreview();
    setSelection(api.normalizeRange(point, point, point));
  }

  function handlePointerStart(event) {
    var cell = event.target.closest(".cell");
    var point;

    if (!cell) {
      return;
    }

    point = pointFromCellId(cell.dataset.cellId);
    if (event.shiftKey) {
      setSelection(api.extendRange(state.selection, point));
      return;
    }

    state.dragAnchor = point;
    state.isDragging = true;
    clearCutPreview();
    setSelection(api.normalizeRange(point, point, point));
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

    setSelection(api.normalizeRange(state.dragAnchor, pointFromCellId(cell.dataset.cellId), pointFromCellId(cell.dataset.cellId)));
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
      applyGridCells(api.clearRange(readGridCells(), state.selection));
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

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(0, 1, event.shiftKey);
    }
  }

  function handleCopy(event) {
    if (!event.clipboardData) {
      return;
    }

    event.preventDefault();
    state.clipboardText = api.copyRange(readGridCells(), state.selection);
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
    state.clipboardText = api.copyRange(readGridCells(), state.selection);
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

    block = api.parseClipboard(text);
    currentSize = rangeSize(state.selection);
    destination = currentSize.rows === block.length && currentSize.cols === block[0].length
      ? state.selection
      : api.normalizeRange(state.selection.active, state.selection.active, state.selection.active);
    isInternalClipboard = text === state.clipboardText && !!state.clipboardRange;
    result = api.pasteBlock(readGridCells(), destination, text, {
      sourceRange: isInternalClipboard ? state.clipboardRange : null,
      cutRange: state.cutRange,
    });

    applyGridCells(result.cells);
    state.selection = result.range;
    clearCutPreview();
    renderSelection();
    status.textContent = "Selection pasted";
  }

  function moveSelection(rowDelta, colDelta, extend) {
    var nextActive = {
      row: api.clamp(state.selection.active.row + rowDelta, 1, ROWS),
      col: api.clamp(state.selection.active.col + colDelta, 1, COLS),
    };

    clearCutPreview();
    if (extend) {
      setSelection(api.extendRange(state.selection, nextActive));
      return;
    }

    setSelection(api.normalizeRange(nextActive, nextActive, nextActive));
  }

  function setSelection(selection) {
    state.selection = selection;
    workbookState.setSelectedCell(cellIdFromPoint(selection.active));
    renderSelection();
  }

  function renderSelection() {
    var cellEntries = workbookState.getAllCellEntries();
    var cells = grid.querySelectorAll(".cell");

    cells.forEach(function (cell) {
      var point = pointFromCellId(cell.dataset.cellId);
      var active = point.row === state.selection.active.row && point.col === state.selection.active.col;
      var inRange = point.row >= state.selection.start.row && point.row <= state.selection.end.row && point.col >= state.selection.start.col && point.col <= state.selection.end.col;

      cell.classList.toggle("in-range", inRange);
      cell.classList.toggle("active", active);
      cell.classList.toggle("cut-preview", !!state.cutRange && point.row >= state.cutRange.start.row && point.row <= state.cutRange.end.row && point.col >= state.cutRange.start.col && point.col <= state.cutRange.end.col);
      cell.setAttribute("aria-selected", active ? "true" : "false");
      cell.querySelector(".cell-label").textContent = cellEntries[cell.dataset.cellId] || "";
    });

    nameBox.value = cellIdFromPoint(state.selection.active);
    formulaInput.value = workbookState.getCellRaw(nameBox.value);
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

  function readGridCells() {
    var entries = workbookState.getAllCellEntries();
    var gridCells = {};

    Object.keys(entries).forEach(function (cellId) {
      var point = pointFromCellId(cellId);
      gridCells[api.cellKey(point.row, point.col)] = entries[cellId];
    });

    return gridCells;
  }

  function applyGridCells(nextGridCells) {
    var currentEntries = workbookState.getAllCellEntries();
    var nextEntries = {};

    Object.keys(nextGridCells).forEach(function (key) {
      var point = pointFromKey(key);
      nextEntries[cellIdFromPoint(point)] = nextGridCells[key];
    });

    Object.keys(currentEntries).forEach(function (cellId) {
      if (!Object.prototype.hasOwnProperty.call(nextEntries, cellId)) {
        workbookState.clearCell(cellId);
      }
    });

    Object.keys(nextEntries).forEach(function (cellId) {
      if (currentEntries[cellId] !== nextEntries[cellId]) {
        workbookState.setCellRaw(cellId, nextEntries[cellId]);
      }
    });
  }

  function cellIdFromPoint(point) {
    return api.columnLabel(point.col) + String(point.row);
  }

  function pointFromCellId(cellId) {
    var match = /^([A-Z]+)(\d+)$/.exec(cellId || "A1");
    return {
      row: match ? Number(match[2]) : 1,
      col: match ? api.columnNumber(match[1]) : 1,
    };
  }

  function pointFromKey(key) {
    var parts = key.split(",");
    return {
      row: Number(parts[0]),
      col: Number(parts[1]),
    };
  }

  function createWorkbookState() {
    try {
      return root.WorkbookState.createWorkbookState();
    } catch (error) {
      status.textContent = "Storage unavailable";
      return root.WorkbookState.createWorkbookState({
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
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function cellKey(row, col) {
    return row + "," + col;
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

  function normalizeRange(anchor, focus, active) {
    return {
      start: {
        row: Math.min(anchor.row, focus.row),
        col: Math.min(anchor.col, focus.col),
      },
      end: {
        row: Math.max(anchor.row, focus.row),
        col: Math.max(anchor.col, focus.col),
      },
      active: {
        row: (active || anchor).row,
        col: (active || anchor).col,
      },
    };
  }

  function rangeAnchor(range) {
    return {
      row: range.active.row === range.start.row ? range.end.row : range.start.row,
      col: range.active.col === range.start.col ? range.end.col : range.start.col,
    };
  }

  function extendRange(range, nextActive) {
    return normalizeRange(rangeAnchor(range), nextActive, nextActive);
  }

  function forEachCell(range, visitor) {
    var row;
    var col;
    for (row = range.start.row; row <= range.end.row; row += 1) {
      for (col = range.start.col; col <= range.end.col; col += 1) {
        visitor(row, col);
      }
    }
  }

  function clearRange(cells, range) {
    var nextCells = { ...cells };
    forEachCell(range, function (row, col) {
      delete nextCells[cellKey(row, col)];
    });
    return nextCells;
  }

  function copyRange(cells, range) {
    var rows = [];
    var row;
    var col;
    for (row = range.start.row; row <= range.end.row; row += 1) {
      var values = [];
      for (col = range.start.col; col <= range.end.col; col += 1) {
        values.push(cells[cellKey(row, col)] || "");
      }
      rows.push(values.join("\t"));
    }
    return rows.join("\n");
  }

  function parseClipboard(text) {
    return String(text)
      .replace(/\r/g, "")
      .split("\n")
      .map(function (line) {
        return line.split("\t");
      });
  }

  function shiftReference(reference, rowDelta, colDelta) {
    return reference.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, colFixed, colLabel, rowFixed, rowNumber) {
      var nextCol = colFixed ? columnNumber(colLabel) : columnNumber(colLabel) + colDelta;
      var nextRow = rowFixed ? Number(rowNumber) : Number(rowNumber) + rowDelta;
      return (
        (colFixed || "") +
        columnLabel(Math.max(1, nextCol)) +
        (rowFixed || "") +
        String(Math.max(1, nextRow))
      );
    });
  }

  function pasteBlock(cells, destinationRange, text, options) {
    var settings = options || {};
    var nextCells = settings.cutRange ? clearRange(cells, settings.cutRange) : { ...cells };
    var block = parseClipboard(text);
    var target = destinationRange.start;
    var rowOffset;
    var colOffset;

    for (rowOffset = 0; rowOffset < block.length; rowOffset += 1) {
      for (colOffset = 0; colOffset < block[rowOffset].length; colOffset += 1) {
        var sourceRow = settings.sourceRange ? settings.sourceRange.start.row + rowOffset : target.row + rowOffset;
        var sourceCol = settings.sourceRange ? settings.sourceRange.start.col + colOffset : target.col + colOffset;
        var value = block[rowOffset][colOffset].charAt(0) === "="
          ? shiftReference(
              block[rowOffset][colOffset],
              (target.row + rowOffset) - sourceRow,
              (target.col + colOffset) - sourceCol
            )
          : block[rowOffset][colOffset];
        var key = cellKey(target.row + rowOffset, target.col + colOffset);

        if (value) {
          nextCells[key] = value;
        } else {
          delete nextCells[key];
        }
      }
    }

    return {
      cells: nextCells,
      range: normalizeRange(
        target,
        {
          row: target.row + block.length - 1,
          col: target.col + block[0].length - 1,
        },
        target
      ),
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    cellKey: cellKey,
    columnLabel: columnLabel,
    columnNumber: columnNumber,
    normalizeRange: normalizeRange,
    extendRange: extendRange,
    clearRange: clearRange,
    copyRange: copyRange,
    parseClipboard: parseClipboard,
    shiftReference: shiftReference,
    pasteBlock: pasteBlock,
    clamp: clamp,
  };
});
