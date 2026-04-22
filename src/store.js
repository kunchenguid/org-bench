function toColumnLabel(columnIndex) {
  let index = columnIndex;
  let label = '';

  do {
    label = String.fromCharCode(65 + (index % 26)) + label;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);

  return label;
}

function toCellId(rowIndex, columnIndex) {
  return `${toColumnLabel(columnIndex)}${rowIndex + 1}`;
}

function createStore() {
  const cells = new Map();
  const selection = { anchor: 'A1', focus: 'A1' };

  return {
    getSelection() {
      return { ...selection };
    },

    getCell(cellId) {
      return cells.has(cellId) ? { raw: cells.get(cellId) } : null;
    },

    setCell(cellId, raw) {
      if (raw === '') {
        cells.delete(cellId);
        return;
      }

      cells.set(cellId, raw);
    },

    getUsedCellIds() {
      return Array.from(cells.keys()).sort();
    },
  };
}

const exportsObject = {
  createStore,
  toCellId,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObject;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetStore = exportsObject;
}
