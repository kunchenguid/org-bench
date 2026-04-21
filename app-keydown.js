(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetKeydown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getEditingKeyAction(event) {
    if (!event) {
      return null;
    }

    if (event.targetKind === 'formula') {
      if (event.key === 'Enter') {
        return { type: 'commit', dCol: 0, dRow: 1 };
      }
      if (event.key === 'Escape') {
        return { type: 'cancel' };
      }
      return null;
    }

    if (event.hasCellEditor) {
      if (event.key === 'Enter') {
        return { type: 'commit', dCol: 0, dRow: 1 };
      }
      if (event.key === 'Tab') {
        return { type: 'commit', dCol: 1, dRow: 0 };
      }
      if (event.key === 'Escape') {
        return { type: 'cancel' };
      }
    }

    return null;
  }

  return {
    getEditingKeyAction,
  };
});
