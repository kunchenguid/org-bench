function buildCellAriaLabel(cellId, displayValue) {
  if (displayValue === '') {
    return cellId + ' blank';
  }

  return cellId + ' ' + displayValue;
}

const api = {
  buildCellAriaLabel: buildCellAriaLabel,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.CellAccessibility = api;
}
