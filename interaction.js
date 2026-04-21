(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetInteraction = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function resolvePasteTarget(selection, blockSize) {
    const selectionHeight = selection.bottom - selection.top + 1;
    const selectionWidth = selection.right - selection.left + 1;
    const matchesSelection = selectionHeight === blockSize.height && selectionWidth === blockSize.width;
    const singleCell = selectionHeight === 1 && selectionWidth === 1;

    if (matchesSelection) {
      return selection;
    }

    return {
      top: selection.top,
      left: selection.left,
      bottom: selection.top + blockSize.height - 1,
      right: selection.left + blockSize.width - 1,
    };
  }

  return {
    resolvePasteTarget,
  };
});
