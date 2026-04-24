(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SpreadsheetClipboardController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function installClipboardController(options) {
    const config = options || {};
    const target = config.target || (typeof document !== 'undefined' ? document : null);
    const store = config.store;
    const selectionTools = config.selectionTools || (typeof SelectionClipboard !== 'undefined' ? SelectionClipboard : null);
    let internalClipboard = null;
    if (!target || !store || !selectionTools) return function () {};

    function onKeyDown(event) {
      if (isEditableTarget(event.target)) return;
      const key = event.key;
      if (key !== 'Delete' && key !== 'Backspace') return;
      store.clearRange(store.snapshot().selection.range, 'range-delete');
      prevent(event);
    }

    function onCopy(event) {
      if (isEditableTarget(event.target)) return;
      writeClipboard(event, false);
    }

    function onCut(event) {
      if (isEditableTarget(event.target)) return;
      writeClipboard(event, true);
    }

    function onPaste(event) {
      if (isEditableTarget(event.target)) return;
      if (!event.clipboardData) return;
      const text = event.clipboardData.getData('text/plain');
      const clipboard = internalClipboard && internalClipboard.text === text
        ? internalClipboard
        : { text: text, source: { row: 1, col: 1 }, cut: false };
      const selection = storeSelectionToClipboardSelection(store.snapshot().selection);
      selectionTools.pasteClipboard(
        clipboard,
        selection,
        function (row, col, raw) {
          store.setCellRaw({ row: row - 1, col: col - 1 }, raw, 'range-paste');
        }
      );
      prevent(event);
    }

    function writeClipboard(event, shouldCut) {
      if (!event.clipboardData) return;
      const snapshot = store.snapshot();
      const selection = storeSelectionToClipboardSelection(snapshot.selection);
      const clipboard = selectionTools.copySelection(selection, function (row, col) {
        return store.getCellRaw({ row: row - 1, col: col - 1 });
      });
      internalClipboard = clipboard;
      event.clipboardData.setData('text/plain', clipboard.text);
      if (shouldCut) {
        store.clearRange(snapshot.selection.range, 'range-cut');
      }
      prevent(event);
    }

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('copy', onCopy);
    target.addEventListener('cut', onCut);
    target.addEventListener('paste', onPaste);

    return function removeClipboardController() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('copy', onCopy);
      target.removeEventListener('cut', onCut);
      target.removeEventListener('paste', onPaste);
    };
  }

  function storeSelectionToClipboardSelection(selection) {
    const anchor = selection.anchor || selection.active;
    const focus = selection.focus || selection.active;
    return {
      active: { row: anchor.row + 1, col: anchor.col + 1 },
      focus: { row: focus.row + 1, col: focus.col + 1 },
    };
  }

  function prevent(event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tagName = String(target.tagName || '').toUpperCase();
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable === true;
  }

  return {
    installClipboardController,
    storeSelectionToClipboardSelection,
  };
});
