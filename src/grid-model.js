class SpreadsheetGridModel {
  constructor(options = {}) {
    this.rows = options.rows || 100;
    this.columns = options.columns || 26;
    this.selection = { row: 1, column: 1 };
    this.rangeAnchor = null;
    this.editing = null;
  }

  getSelection() {
    return { ...this.selection };
  }

  getSelectedAddress() {
    return `${columnToLabel(this.selection.column)}${this.selection.row}`;
  }

  setSelection(row, column) {
    this.selection = {
      row: clamp(row, 1, this.rows),
      column: clamp(column, 1, this.columns),
    };
    this.rangeAnchor = null;
  }

  getRange() {
    if (!this.rangeAnchor) {
      return null;
    }
    return {
      start: {
        row: Math.min(this.rangeAnchor.row, this.selection.row),
        column: Math.min(this.rangeAnchor.column, this.selection.column),
      },
      end: {
        row: Math.max(this.rangeAnchor.row, this.selection.row),
        column: Math.max(this.rangeAnchor.column, this.selection.column),
      },
    };
  }

  isCellSelected(row, column) {
    const range = this.getRange();
    if (!range) {
      return this.selection.row === row && this.selection.column === column;
    }
    return row >= range.start.row && row <= range.end.row && column >= range.start.column && column <= range.end.column;
  }

  getSelectedAddresses() {
    const range = this.getRange();
    if (!range) {
      return [this.getSelectedAddress()];
    }

    const addresses = [];
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      for (let column = range.start.column; column <= range.end.column; column += 1) {
        addresses.push(`${columnToLabel(column)}${row}`);
      }
    }
    return addresses;
  }

  moveSelection(direction) {
    this.rangeAnchor = null;
    this.shiftSelection(direction);
  }

  extendSelection(direction) {
    if (!this.rangeAnchor) {
      this.rangeAnchor = { ...this.selection };
    }
    this.shiftSelection(direction);
  }

  extendSelectionTo(row, column) {
    if (!this.rangeAnchor) {
      this.rangeAnchor = { ...this.selection };
    }
    this.selection = {
      row: clamp(row, 1, this.rows),
      column: clamp(column, 1, this.columns),
    };
  }

  shiftSelection(direction) {
    const offsets = {
      up: [-1, 0],
      down: [1, 0],
      left: [0, -1],
      right: [0, 1],
    };
    const [rowOffset, columnOffset] = offsets[direction] || [0, 0];
    this.selection = {
      row: clamp(this.selection.row + rowOffset, 1, this.rows),
      column: clamp(this.selection.column + columnOffset, 1, this.columns),
    };
  }

  isEditing() {
    return Boolean(this.editing);
  }

  getDraft() {
    return this.editing ? this.editing.draft : '';
  }

  getEditTarget() {
    return this.editing ? this.editing.address : '';
  }

  startEditing(raw) {
    this.editing = {
      address: this.getSelectedAddress(),
      original: raw || '',
      draft: raw || '',
    };
  }

  startTyping(character) {
    this.editing = {
      address: this.getSelectedAddress(),
      original: '',
      draft: character,
    };
  }

  updateDraft(raw) {
    if (this.editing) {
      this.editing.draft = raw;
    }
  }

  commitEdit(mode) {
    if (!this.editing) {
      return null;
    }

    const commit = {
      address: this.editing.address,
      raw: this.editing.draft,
    };

    this.editing = null;
    if (mode === 'enter') {
      this.moveSelection('down');
    } else if (mode === 'tab') {
      this.moveSelection('right');
    }
    return commit;
  }

  cancelEdit() {
    if (!this.editing) {
      return null;
    }

    const canceled = {
      address: this.editing.address,
      raw: this.editing.original,
    };
    this.editing = null;
    return canceled;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function columnToLabel(column) {
  let value = column;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpreadsheetGridModel };
}

if (typeof globalThis !== 'undefined') {
  globalThis.SpreadsheetGridModel = SpreadsheetGridModel;
}
