(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetEditingUX = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getCommitMoveForKey(key) {
    if (key === 'Enter') {
      return { dx: 0, dy: 1 };
    }
    if (key === 'Tab') {
      return { dx: 1, dy: 0 };
    }
    return null;
  }

  return {
    getCommitMoveForKey,
  };
});
