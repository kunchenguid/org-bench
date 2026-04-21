(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function columnLabelFromIndex(columnIndex) {
    var index = Number(columnIndex);
    var label = '';

    while (index >= 0) {
      label = String.fromCharCode((index % 26) + 65) + label;
      index = Math.floor(index / 26) - 1;
    }

    return label;
  }

  function cellIdFromPosition(rowIndex, columnIndex) {
    return columnLabelFromIndex(columnIndex) + String(rowIndex + 1);
  }

  function resolveStorageNamespace(env) {
    if (env && typeof env.ORACLE_STORAGE_NAMESPACE === 'string' && env.ORACLE_STORAGE_NAMESPACE.trim()) {
      return env.ORACLE_STORAGE_NAMESPACE.trim();
    }

    if (env && env.location && typeof env.location.pathname === 'string' && env.location.pathname) {
      return 'oracle-sheet:' + env.location.pathname;
    }

    return 'oracle-sheet:local';
  }

  return {
    columnLabelFromIndex: columnLabelFromIndex,
    cellIdFromPosition: cellIdFromPosition,
    resolveStorageNamespace: resolveStorageNamespace,
  };
}));
