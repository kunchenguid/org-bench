(function () {
  "use strict";

  var DEFAULT_ROWS = 100;
  var DEFAULT_COLUMNS = 26;
  var EVENT_PREFIX = "spreadsheet:";

  function createEmitter() {
    var target = document.createDocumentFragment();

    return {
      on: function (type, handler) {
        target.addEventListener(EVENT_PREFIX + type, handler);
        return function unsubscribe() {
          target.removeEventListener(EVENT_PREFIX + type, handler);
        };
      },
      emit: function (type, detail) {
        target.dispatchEvent(new CustomEvent(EVENT_PREFIX + type, { detail: detail }));
      }
    };
  }

  function colToName(index) {
    var name = "";
    var current = index + 1;

    while (current > 0) {
      current -= 1;
      name = String.fromCharCode(65 + (current % 26)) + name;
      current = Math.floor(current / 26);
    }

    return name;
  }

  function cellKey(cell) {
    return colToName(cell.col) + String(cell.row + 1);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clampCell(cell, dimensions) {
    return {
      row: clamp(Number(cell.row) || 0, 0, dimensions.rows - 1),
      col: clamp(Number(cell.col) || 0, 0, dimensions.columns - 1)
    };
  }

  function sameCell(left, right) {
    return left.row === right.row && left.col === right.col;
  }

  function normalizeRange(anchor, focus) {
    return {
      top: Math.min(anchor.row, focus.row),
      left: Math.min(anchor.col, focus.col),
      bottom: Math.max(anchor.row, focus.row),
      right: Math.max(anchor.col, focus.col)
    };
  }

  function createStore(options) {
    var settings = options || {};
    var dimensions = {
      rows: settings.rows || DEFAULT_ROWS,
      columns: settings.columns || DEFAULT_COLUMNS
    };
    var emitter = createEmitter();
    var state = {
      dimensions: dimensions,
      cells: {},
      selection: {
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 0 },
        active: { row: 0, col: 0 },
        range: { top: 0, left: 0, bottom: 0, right: 0 }
      }
    };

    function emitStateChange(reason) {
      emitter.emit("statechange", { reason: reason, state: snapshot() });
    }

    function selectCell(cell) {
      var next = clampCell(cell, state.dimensions);
      var previous = state.selection;

      state.selection = {
        anchor: next,
        focus: next,
        active: next,
        range: normalizeRange(next, next)
      };

      if (!sameCell(previous.active, next)) {
        emitter.emit("selectionchange", { previous: previous, selection: state.selection });
        emitStateChange("selection");
      }

      return state.selection;
    }

    function selectRange(anchor, focus) {
      var nextAnchor = clampCell(anchor, state.dimensions);
      var nextFocus = clampCell(focus, state.dimensions);
      var previous = state.selection;

      state.selection = {
        anchor: nextAnchor,
        focus: nextFocus,
        active: nextFocus,
        range: normalizeRange(nextAnchor, nextFocus)
      };

      emitter.emit("selectionchange", { previous: previous, selection: state.selection });
      emitStateChange("selection");
      return state.selection;
    }

    function getCellRaw(cell) {
      var key = typeof cell === "string" ? cell : cellKey(clampCell(cell, state.dimensions));
      return state.cells[key] || "";
    }

    function setCellRaw(cell, raw, source) {
      var safeCell = clampCell(cell, state.dimensions);
      var key = cellKey(safeCell);
      var nextRaw = String(raw == null ? "" : raw);
      var previousRaw = state.cells[key] || "";

      if (nextRaw) {
        state.cells[key] = nextRaw;
      } else {
        delete state.cells[key];
      }

      if (previousRaw !== nextRaw) {
        emitter.emit("cellchange", {
          cell: safeCell,
          key: key,
          previousRaw: previousRaw,
          raw: nextRaw,
          source: source || "api"
        });
        emitStateChange("cell");
      }

      return nextRaw;
    }

    function clearRange(range, source) {
      var cleared = [];
      var safeRange = {
        top: clamp(range.top, 0, state.dimensions.rows - 1),
        left: clamp(range.left, 0, state.dimensions.columns - 1),
        bottom: clamp(range.bottom, 0, state.dimensions.rows - 1),
        right: clamp(range.right, 0, state.dimensions.columns - 1)
      };

      for (var row = safeRange.top; row <= safeRange.bottom; row += 1) {
        for (var col = safeRange.left; col <= safeRange.right; col += 1) {
          var key = cellKey({ row: row, col: col });
          if (state.cells[key]) {
            cleared.push({ cell: { row: row, col: col }, key: key, previousRaw: state.cells[key] });
            delete state.cells[key];
          }
        }
      }

      if (cleared.length) {
        emitter.emit("rangeclear", { range: safeRange, cleared: cleared, source: source || "api" });
        emitStateChange("range");
      }

      return cleared;
    }

    function snapshot() {
      return {
        dimensions: {
          rows: state.dimensions.rows,
          columns: state.dimensions.columns
        },
        cells: Object.assign({}, state.cells),
        selection: {
          anchor: Object.assign({}, state.selection.anchor),
          focus: Object.assign({}, state.selection.focus),
          active: Object.assign({}, state.selection.active),
          range: Object.assign({}, state.selection.range)
        }
      };
    }

    function hydrate(nextState, source) {
      if (!nextState) {
        return snapshot();
      }

      state.cells = Object.assign({}, nextState.cells || {});
      if (nextState.dimensions) {
        state.dimensions = {
          rows: nextState.dimensions.rows || DEFAULT_ROWS,
          columns: nextState.dimensions.columns || DEFAULT_COLUMNS
        };
      }
      if (nextState.selection && nextState.selection.active) {
        selectRange(nextState.selection.anchor || nextState.selection.active, nextState.selection.focus || nextState.selection.active);
      }

      emitter.emit("hydrate", { state: snapshot(), source: source || "api" });
      emitStateChange("hydrate");
      return snapshot();
    }

    return {
      on: emitter.on,
      snapshot: snapshot,
      hydrate: hydrate,
      selectCell: selectCell,
      selectRange: selectRange,
      getCellRaw: getCellRaw,
      setCellRaw: setCellRaw,
      clearRange: clearRange
    };
  }

  window.App = {
    constants: {
      rows: DEFAULT_ROWS,
      columns: DEFAULT_COLUMNS,
      eventPrefix: EVENT_PREFIX
    },
    colToName: colToName,
    cellKey: cellKey,
    clampCell: clampCell,
    normalizeRange: normalizeRange,
    createStore: createStore
  };
  window.Spreadsheet = window.App;
}());
