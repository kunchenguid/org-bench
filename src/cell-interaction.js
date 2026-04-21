(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.CellInteraction = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toCellPosition(cellId) {
    return {
      row: Number(cellId.slice(1)),
      col: cellId.charCodeAt(0) - 64,
    };
  }

  function toCellId(row, col) {
    return String.fromCharCode(64 + col) + row;
  }

  function createCellInteractionController(options) {
    var settings = options || {};
    var rows = settings.rows || 100;
    var cols = settings.cols || 26;
    var workbookState = settings.workbookState;
    var editor = null;

    if (!workbookState) {
      throw new Error('A workbookState implementation is required');
    }

    function getSelection() {
      return {
        start: workbookState.getSelectedCell(),
        end: workbookState.getSelectedCell(),
        active: workbookState.getSelectedCell(),
      };
    }

    function selectCell(cellId) {
      workbookState.setSelectedCell(cellId);
      editor = null;
      return getSelection();
    }

    function moveActive(rowDelta, colDelta) {
      var position;
      if (editor) {
        return getSelection();
      }

      position = toCellPosition(workbookState.getSelectedCell());
      return selectCell(toCellId(
        clamp(position.row + rowDelta, 1, rows),
        clamp(position.col + colDelta, 1, cols)
      ));
    }

    function beginEdit(source) {
      var cellId = workbookState.getSelectedCell();
      editor = {
        cellId: cellId,
        source: source || 'cell',
        original: workbookState.getCellRaw(cellId),
        draft: workbookState.getCellRaw(cellId),
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
      var position;
      if (!editor) {
        return null;
      }

      workbookState.setCellRaw(editor.cellId, editor.draft);
      position = toCellPosition(editor.cellId);
      if (move === 'down') {
        position.row = clamp(position.row + 1, 1, rows);
      } else if (move === 'right') {
        position.col = clamp(position.col + 1, 1, cols);
      }

      workbookState.setSelectedCell(toCellId(position.row, position.col));
      editor = null;
      return getSelection();
    }

    function cancelEdit() {
      editor = null;
      return getSelection();
    }

    function getEditorState() {
      if (!editor) {
        return null;
      }

      return {
        cellId: editor.cellId,
        source: editor.source,
        original: editor.original,
        draft: editor.draft,
      };
    }

    function getFormulaBarValue() {
      return editor ? editor.draft : workbookState.getCellRaw(workbookState.getSelectedCell());
    }

    return {
      beginEdit: beginEdit,
      cancelEdit: cancelEdit,
      commitEdit: commitEdit,
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
