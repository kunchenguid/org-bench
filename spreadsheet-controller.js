function createSpreadsheetController(options) {
  const shell = options.shell;
  const model = options.model;
  const engine = options.engine;

  function hydrate() {
    const snapshot = model.exportState();
    const cells = snapshot && snapshot.cells ? snapshot.cells : {};
    const addresses = Object.keys(cells).sort();

    for (let index = 0; index < addresses.length; index += 1) {
      const address = addresses[index];
      engine.setCell(address, cells[address]);
    }

    engine.recalculate();

    for (let index = 0; index < addresses.length; index += 1) {
      const address = addresses[index];
      shell.setCellRaw(cellIdToCoords(address), stringifyDisplayValue(engine.getDisplayValue(address)));
    }

    shell.rerender();
  }

  function commitCell(cell, raw) {
    const cellId = coordsToCellId(cell);
    model.setCell(cellId, raw);
    hydrate();
  }

  return {
    hydrate,
    commitCell,
  };
}

function stringifyDisplayValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function coordsToCellId(cell) {
  return numberToColumnLabel(cell.col + 1) + String(cell.row + 1);
}

function cellIdToCoords(cellId) {
  const match = /^([A-Z]+)(\d+)$/.exec(String(cellId).toUpperCase());
  if (!match) {
    throw new Error('Invalid cell id: ' + cellId);
  }

  return {
    col: columnLabelToNumber(match[1]) - 1,
    row: Number(match[2]) - 1,
  };
}

function columnLabelToNumber(label) {
  let value = 0;

  for (let index = 0; index < label.length; index += 1) {
    value = (value * 26) + (label.charCodeAt(index) - 64);
  }

  return value;
}

function numberToColumnLabel(value) {
  let current = value;
  let label = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

const spreadsheetControllerApi = {
  createSpreadsheetController,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = spreadsheetControllerApi;
}

if (typeof window !== 'undefined') {
  window.SpreadsheetController = spreadsheetControllerApi;
}
