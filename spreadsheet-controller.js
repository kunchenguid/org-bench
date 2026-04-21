function createSpreadsheetController(options) {
  const shell = options.shell;
  const model = options.model;
  const engine = options.engine;
  let hydratedAddresses = [];
  let selection = { active: { col: 0, row: 0 }, range: { start: { col: 0, row: 0 }, end: { col: 0, row: 0 } } };
  let clipboard = null;

  function clearRemovedAddresses(nextAddresses) {
    const nextSet = new Set(nextAddresses);

    for (let index = 0; index < hydratedAddresses.length; index += 1) {
      const address = hydratedAddresses[index];
      if (!nextSet.has(address)) {
        updateShellCell(cellIdToCoords(address), '', '');
      }
    }
  }

  function resetEngine() {
    if (engine.cells && typeof engine.cells.clear === 'function') {
      engine.cells.clear();
    }
  }

  function hydrate() {
    const snapshot = model.exportState();
    const cells = snapshot && snapshot.cells ? snapshot.cells : {};
    const addresses = Object.keys(cells).sort();

    clearRemovedAddresses(addresses);
    resetEngine();

    for (let index = 0; index < addresses.length; index += 1) {
      const address = addresses[index];
      engine.setCell(address, cells[address]);
    }

    engine.recalculate();

    for (let index = 0; index < addresses.length; index += 1) {
      const address = addresses[index];
      updateShellCell(
        cellIdToCoords(address),
        cells[address],
        stringifyDisplayValue(engine.getDisplayValue(address))
      );
    }

    if (snapshot && snapshot.selection && typeof shell.setActiveCell === 'function') {
      shell.setActiveCell(cellIdToCoords(snapshot.selection));
    }

    hydratedAddresses = addresses;
    shell.rerender();
  }

  function commitCell(cell, raw) {
    const cellId = coordsToCellId(cell);
    model.setCell(cellId, raw);
    hydrate();
  }

  function clearRange(range) {
    model.clearRange(rangeToCellIds(range));
    hydrate();
  }

  function applyStructureChange(detail) {
    if (detail.axis === 'row') {
      if (detail.action === 'insert-before') {
        model.insertRows(detail.index + 1, 1);
      } else if (detail.action === 'insert-after') {
        model.insertRows(detail.index + 2, 1);
      } else if (detail.action === 'delete') {
        model.deleteRows(detail.index + 1, 1);
      }
    }

    if (detail.axis === 'col') {
      if (detail.action === 'insert-before') {
        model.insertColumns(detail.index + 1, 1);
      } else if (detail.action === 'insert-after') {
        model.insertColumns(detail.index + 2, 1);
      } else if (detail.action === 'delete') {
        model.deleteColumns(detail.index + 1, 1);
      }
    }

    hydrate();
  }

  function setSelection(cell) {
    const range = arguments.length > 1 && arguments[1] ? arguments[1] : { start: cell, end: cell };
    selection = { active: cell, range: range };

    if (typeof model.setSelection === 'function') {
      model.setSelection(coordsToCellId(cell));
    }
  }

  function copySelection() {
    if (typeof model.copyRange !== 'function') {
      return null;
    }

    clipboard = model.copyRange(rangeToCellIds(selection.range));
    return clipboard;
  }

  function cutSelection() {
    if (typeof model.cutRange !== 'function') {
      return null;
    }

    clipboard = model.cutRange(rangeToCellIds(selection.range));
    hydrate();
    return clipboard;
  }

  function pasteSelection() {
    if (!clipboard || typeof model.pasteRange !== 'function') {
      return false;
    }

    model.pasteRange(coordsToCellId(selection.active), clipboard);
    hydrate();
    return true;
  }

  function undo() {
    if (typeof model.undo !== 'function' || !model.undo()) {
      return false;
    }

    hydrate();
    return true;
  }

  function redo() {
    if (typeof model.redo !== 'function' || !model.redo()) {
      return false;
    }

    hydrate();
    return true;
  }

  function updateShellCell(cell, raw, display) {
    if (typeof shell.setCellData === 'function') {
      shell.setCellData(cell, raw, display);
      return;
    }

    shell.setCellRaw(cell, display);
  }

  return {
    hydrate,
    commitCell,
    clearRange,
    applyStructureChange,
    setSelection,
    copySelection,
    cutSelection,
    pasteSelection,
    undo,
    redo,
  };
}

function rangeToCellIds(range) {
  return {
    start: coordsToCellId(range.start),
    end: coordsToCellId(range.end),
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
