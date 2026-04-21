(function () {
  'use strict';

  function columnLabelToNumber(label) {
    var value = 0;
    var index;

    for (index = 0; index < label.length; index += 1) {
      value = (value * 26) + (label.charCodeAt(index) - 64);
    }

    return value;
  }

  function numberToColumnLabel(value) {
    var remaining = value;
    var label = '';

    while (remaining > 0) {
      remaining -= 1;
      label = String.fromCharCode(65 + (remaining % 26)) + label;
      remaining = Math.floor(remaining / 26);
    }

    return label;
  }

  function parseCellAddress(address) {
    var match = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(address);

    if (!match) {
      throw new Error('Invalid cell address: ' + address);
    }

    return {
      columnAbsolute: match[1] === '$',
      column: columnLabelToNumber(match[2]),
      rowAbsolute: match[3] === '$',
      row: Number(match[4]),
    };
  }

  function formatCellAddress(reference) {
    return (
      (reference.columnAbsolute ? '$' : '') +
      numberToColumnLabel(reference.column) +
      (reference.rowAbsolute ? '$' : '') +
      String(reference.row)
    );
  }

  function cloneReference(reference) {
    return {
      columnAbsolute: reference.columnAbsolute,
      column: reference.column,
      rowAbsolute: reference.rowAbsolute,
      row: reference.row,
    };
  }

  function rewriteSingleReference(reference, editType, targetIndex) {
    var next = cloneReference(reference);

    if (editType === 'insert-row') {
      if (next.row >= targetIndex) {
        next.row += 1;
      }
      return next;
    }

    if (editType === 'delete-row') {
      if (next.row === targetIndex) {
        return '#REF!';
      }
      if (next.row > targetIndex) {
        next.row -= 1;
      }
      return next;
    }

    if (editType === 'insert-column') {
      if (next.column >= targetIndex) {
        next.column += 1;
      }
      return next;
    }

    if (editType === 'delete-column') {
      if (next.column === targetIndex) {
        return '#REF!';
      }
      if (next.column > targetIndex) {
        next.column -= 1;
      }
      return next;
    }

    throw new Error('Unsupported edit type: ' + editType);
  }

  function rewriteRange(start, end, editType, targetIndex) {
    var nextStart = cloneReference(start);
    var nextEnd = cloneReference(end);

    if (editType === 'insert-row') {
      if (nextStart.row >= targetIndex) {
        nextStart.row += 1;
      }
      if (nextEnd.row >= targetIndex) {
        nextEnd.row += 1;
      }
      return formatCellAddress(nextStart) + ':' + formatCellAddress(nextEnd);
    }

    if (editType === 'insert-column') {
      if (nextStart.column >= targetIndex) {
        nextStart.column += 1;
      }
      if (nextEnd.column >= targetIndex) {
        nextEnd.column += 1;
      }
      return formatCellAddress(nextStart) + ':' + formatCellAddress(nextEnd);
    }

    if (editType === 'delete-row') {
      if (nextStart.row === targetIndex && nextEnd.row === targetIndex) {
        return '#REF!';
      }

      if (nextStart.row > targetIndex) {
        nextStart.row -= 1;
      } else if (nextStart.row === targetIndex && nextEnd.row < targetIndex) {
        nextStart.row -= 1;
      }

      if (nextEnd.row > targetIndex) {
        nextEnd.row -= 1;
      } else if (nextEnd.row === targetIndex && nextStart.row < targetIndex) {
        nextEnd.row -= 1;
      }

      return formatCellAddress(nextStart) + ':' + formatCellAddress(nextEnd);
    }

    if (editType === 'delete-column') {
      if (nextStart.column === targetIndex && nextEnd.column === targetIndex) {
        return '#REF!';
      }

      if (nextStart.column > targetIndex) {
        nextStart.column -= 1;
      } else if (nextStart.column === targetIndex && nextEnd.column < targetIndex) {
        nextStart.column -= 1;
      }

      if (nextEnd.column > targetIndex) {
        nextEnd.column -= 1;
      } else if (nextEnd.column === targetIndex && nextStart.column < targetIndex) {
        nextEnd.column -= 1;
      }

      return formatCellAddress(nextStart) + ':' + formatCellAddress(nextEnd);
    }

    throw new Error('Unsupported edit type: ' + editType);
  }

  function rewriteFormula(rawValue, editType, targetIndex) {
    var result;
    var index;
    var inString;

    if (typeof rawValue !== 'string' || rawValue.charAt(0) !== '=') {
      return rawValue;
    }

    result = '=';
    index = 1;
    inString = false;

    while (index < rawValue.length) {
      var character = rawValue.charAt(index);

      if (character === '"') {
        result += character;

        if (inString && rawValue.charAt(index + 1) === '"') {
          result += '"';
          index += 2;
          continue;
        }

        inString = !inString;
        index += 1;
        continue;
      }

      if (!inString) {
        var slice = rawValue.slice(index);
        var match = /^(\$?[A-Z]+\$?\d+)(:(\$?[A-Z]+\$?\d+))?/.exec(slice);

        if (match) {
          var start = parseCellAddress(match[1]);
          var replacement = match[2]
            ? rewriteRange(start, parseCellAddress(match[3]), editType, targetIndex)
            : rewriteSingleReference(start, editType, targetIndex);

          result += typeof replacement === 'string' ? replacement : formatCellAddress(replacement);
          index += match[0].length;
          continue;
        }
      }

      result += character;
      index += 1;
    }

    return result;
  }

  function remapCells(cells, mapper) {
    var next = {};
    var addresses = Object.keys(cells).sort();
    var index;

    for (index = 0; index < addresses.length; index += 1) {
      var address = addresses[index];
      var reference = parseCellAddress(address);
      var mapped = mapper(reference);

      if (!mapped) {
        continue;
      }

      next[formatCellAddress(mapped)] = cells[address];
    }

    return next;
  }

  function rewriteAllFormulas(cells, editType, targetIndex) {
    var next = {};
    var addresses = Object.keys(cells);
    var index;

    for (index = 0; index < addresses.length; index += 1) {
      var address = addresses[index];
      next[address] = rewriteFormula(cells[address], editType, targetIndex);
    }

    return next;
  }

  function insertRow(cells, rowIndex) {
    var moved = remapCells(cells, function (reference) {
      if (reference.row >= rowIndex) {
        reference.row += 1;
      }
      return reference;
    });

    return rewriteAllFormulas(moved, 'insert-row', rowIndex);
  }

  function deleteRow(cells, rowIndex) {
    var moved = remapCells(cells, function (reference) {
      if (reference.row === rowIndex) {
        return null;
      }
      if (reference.row > rowIndex) {
        reference.row -= 1;
      }
      return reference;
    });

    return rewriteAllFormulas(moved, 'delete-row', rowIndex);
  }

  function insertColumn(cells, columnIndex) {
    var moved = remapCells(cells, function (reference) {
      if (reference.column >= columnIndex) {
        reference.column += 1;
      }
      return reference;
    });

    return rewriteAllFormulas(moved, 'insert-column', columnIndex);
  }

  function deleteColumn(cells, columnIndex) {
    var moved = remapCells(cells, function (reference) {
      if (reference.column === columnIndex) {
        return null;
      }
      if (reference.column > columnIndex) {
        reference.column -= 1;
      }
      return reference;
    });

    return rewriteAllFormulas(moved, 'delete-column', columnIndex);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function adjustIndex(value, editType, targetIndex, max) {
    if (editType === 'insert-row' || editType === 'insert-column') {
      return clamp(value >= targetIndex ? value + 1 : value, 1, max);
    }

    if (value > targetIndex) {
      return value - 1;
    }

    if (value === targetIndex) {
      return clamp(targetIndex, 1, max);
    }

    return value;
  }

  function adjustSelection(selection, options) {
    var settings = options || {};
    var editType = settings.type;
    var targetIndex = settings.index;
    var maxRows = settings.maxRows || 100;
    var maxCols = settings.maxCols || 26;

    if (editType === 'insert-row' || editType === 'delete-row') {
      return {
        start: {
          row: adjustIndex(selection.start.row, editType, targetIndex, maxRows),
          col: selection.start.col,
        },
        end: {
          row: adjustIndex(selection.end.row, editType, targetIndex, maxRows),
          col: selection.end.col,
        },
        active: {
          row: adjustIndex(selection.active.row, editType, targetIndex, maxRows),
          col: selection.active.col,
        },
      };
    }

    return {
      start: {
        row: selection.start.row,
        col: adjustIndex(selection.start.col, editType, targetIndex, maxCols),
      },
      end: {
        row: selection.end.row,
        col: adjustIndex(selection.end.col, editType, targetIndex, maxCols),
      },
      active: {
        row: selection.active.row,
        col: adjustIndex(selection.active.col, editType, targetIndex, maxCols),
      },
    };
  }

  var api = {
    insertRow: insertRow,
    deleteRow: deleteRow,
    insertColumn: insertColumn,
    deleteColumn: deleteColumn,
    adjustSelection: adjustSelection,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.SpreadsheetStructuralEdits = api;
  }
})();
