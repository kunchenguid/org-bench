(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.CellInteraction = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cellKey(row, col) {
    return row + ',' + col;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createSelection(row, col) {
    return {
      start: { row: row, col: col },
      end: { row: row, col: col },
      active: { row: row, col: col },
    };
  }

  function cloneSelection(selection) {
    return {
      start: { row: selection.start.row, col: selection.start.col },
      end: { row: selection.end.row, col: selection.end.col },
      active: { row: selection.active.row, col: selection.active.col },
    };
  }

  function createCellInteractionController(options) {
    var settings = options || {};
    var rows = settings.rows || 100;
    var cols = settings.cols || 26;
    var cells = { ...(settings.cells || {}) };
    var selection = createSelection(1, 1);
    var editor = null;

    function readCell(row, col) {
      return cells[cellKey(row, col)] || '';
    }

    function selectCell(row, col) {
      var nextRow = clamp(row, 1, rows);
      var nextCol = clamp(col, 1, cols);
      selection = createSelection(nextRow, nextCol);
      editor = null;
      return cloneSelection(selection);
    }

    function moveActive(rowDelta, colDelta) {
      if (editor) {
        return cloneSelection(selection);
      }

      return selectCell(selection.active.row + rowDelta, selection.active.col + colDelta);
    }

    function beginEdit(source) {
      editor = {
        row: selection.active.row,
        col: selection.active.col,
        source: source || 'cell',
        original: readCell(selection.active.row, selection.active.col),
        draft: readCell(selection.active.row, selection.active.col),
      };
      return getEditorState();
    }

    function startTyping(seed) {
      beginEdit('cell');
      editor.draft = seed == null ? '' : String(seed);
      return getEditorState();
    }

    function setDraftValue(value) {
      if (!editor) {
        beginEdit('formula-bar');
      }
      editor.draft = String(value);
      return getEditorState();
    }

    function commitEdit(move) {
      if (!editor) {
        return null;
      }

      var key = cellKey(editor.row, editor.col);
      if (editor.draft) {
        cells[key] = editor.draft;
      } else {
        delete cells[key];
      }

      var nextRow = editor.row;
      var nextCol = editor.col;
      if (move === 'down') {
        nextRow = clamp(editor.row + 1, 1, rows);
      } else if (move === 'right') {
        nextCol = clamp(editor.col + 1, 1, cols);
      }

      editor = null;
      selection = createSelection(nextRow, nextCol);
      return cloneSelection(selection);
    }

    function cancelEdit() {
      editor = null;
      return cloneSelection(selection);
    }

    function getSelection() {
      return cloneSelection(selection);
    }

    function getEditorState() {
      if (!editor) {
        return null;
      }

      return {
        row: editor.row,
        col: editor.col,
        source: editor.source,
        original: editor.original,
        draft: editor.draft,
      };
    }

    function getFormulaBarValue() {
      return editor ? editor.draft : readCell(selection.active.row, selection.active.col);
    }

    function getCellValue(row, col) {
      return readCell(row, col);
    }

    return {
      beginEdit: beginEdit,
      cancelEdit: cancelEdit,
      commitEdit: commitEdit,
      getCellValue: getCellValue,
      getEditorState: getEditorState,
      getFormulaBarValue: getFormulaBarValue,
      getSelection: getSelection,
      moveActive: moveActive,
      selectCell: selectCell,
      setDraftValue: setDraftValue,
      startTyping: startTyping,
    };
  }

  return {
    createCellInteractionController: createCellInteractionController,
  };
});
