(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetStructure = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CELL_REF_PATTERN = /(\$?)([A-Z]+)(\$?)(\d+)/g;

  function applyStructureOperation(cells, operation) {
    const movedCells = {};

    for (const [address, raw] of Object.entries(cells)) {
      const nextAddress = rewriteAddress(address, operation);
      if (nextAddress === null) {
        continue;
      }

      movedCells[nextAddress] = rewriteFormula(raw, operation);
    }

    return movedCells;
  }

  function rewriteFormula(raw, operation) {
    if (typeof raw !== 'string' || !raw.startsWith('=')) {
      return raw;
    }

    return raw.replace(CELL_REF_PATTERN, function (match, absoluteColumn, column, absoluteRow, row) {
      const rewritten = rewriteReferenceParts(
        { columnIndex: columnNameToIndex(column), rowIndex: Number(row) },
        operation
      );

      if (rewritten === null) {
        return '#REF!';
      }

      return `${absoluteColumn}${columnIndexToName(rewritten.columnIndex)}${absoluteRow}${rewritten.rowIndex}`;
    });
  }

  function rewriteAddress(address, operation) {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    if (!match) {
      throw new Error(`Invalid address: ${address}`);
    }

    const rewritten = rewriteReferenceParts(
      { columnIndex: columnNameToIndex(match[1]), rowIndex: Number(match[2]) },
      operation
    );

    if (rewritten === null) {
      return null;
    }

    return `${columnIndexToName(rewritten.columnIndex)}${rewritten.rowIndex}`;
  }

  function rewriteReferenceParts(reference, operation) {
    const next = { ...reference };

    switch (operation.type) {
      case 'insert-row':
        if (next.rowIndex >= operation.index) {
          next.rowIndex += 1;
        }
        return next;
      case 'delete-row':
        if (next.rowIndex === operation.index) {
          return null;
        }
        if (next.rowIndex > operation.index) {
          next.rowIndex -= 1;
        }
        return next;
      case 'insert-column':
        if (next.columnIndex >= operation.index) {
          next.columnIndex += 1;
        }
        return next;
      case 'delete-column':
        if (next.columnIndex === operation.index) {
          return null;
        }
        if (next.columnIndex > operation.index) {
          next.columnIndex -= 1;
        }
        return next;
      default:
        throw new Error(`Unsupported structure operation: ${operation.type}`);
    }
  }

  function columnNameToIndex(name) {
    let value = 0;

    for (const char of name) {
      value = (value * 26) + (char.charCodeAt(0) - 64);
    }

    return value;
  }

  function columnIndexToName(index) {
    let current = index;
    let result = '';

    while (current > 0) {
      current -= 1;
      result = String.fromCharCode(65 + (current % 26)) + result;
      current = Math.floor(current / 26);
    }

    return result;
  }

  return {
    applyStructureOperation,
  };
});
