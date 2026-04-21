(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetAppState = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  function retargetFormulaBarEdit(editing, nextCoord, getRaw) {
    if (!editing || editing.source !== 'formula') {
      return null;
    }

    const nextRaw = getRaw(nextCoord);
    return {
      coord: nextCoord,
      value: nextRaw,
      original: nextRaw,
      source: 'formula',
    };
  }

  function shouldRenderCellEditor(editing, coord) {
    return Boolean(editing && editing.coord === coord && editing.source === 'cell');
  }

  return {
    retargetFormulaBarEdit,
    shouldRenderCellEditor,
  };
}));
