(function (root, factory) {
  var api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.RangeClipboard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function cellKey(row, col) {
    return row + "," + col;
  }

  function columnLabel(index) {
    var value = index;
    var label = "";
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  }

  function columnNumber(label) {
    var value = 0;
    var index;
    for (index = 0; index < label.length; index += 1) {
      value = (value * 26) + (label.charCodeAt(index) - 64);
    }
    return value;
  }

  function normalizeRange(anchor, focus, active) {
    return {
      start: {
        row: Math.min(anchor.row, focus.row),
        col: Math.min(anchor.col, focus.col),
      },
      end: {
        row: Math.max(anchor.row, focus.row),
        col: Math.max(anchor.col, focus.col),
      },
      active: {
        row: (active || anchor).row,
        col: (active || anchor).col,
      },
    };
  }

  function extendRange(range, nextActive) {
    return normalizeRange(rangeAnchor(range), nextActive, nextActive);
  }

  function clearRange(cells, range) {
    var nextCells = { ...cells };

    forEachCell(range, function (row, col) {
      delete nextCells[cellKey(row, col)];
    });

    return nextCells;
  }

  function copyRange(cells, range) {
    var rows = [];
    var row;
    var col;

    for (row = range.start.row; row <= range.end.row; row += 1) {
      var values = [];
      for (col = range.start.col; col <= range.end.col; col += 1) {
        values.push(cells[cellKey(row, col)] || "");
      }
      rows.push(values.join("\t"));
    }

    return rows.join("\n");
  }

  function parseClipboard(text) {
    return String(text)
      .replace(/\r/g, "")
      .split("\n")
      .map(function (line) {
        return line.split("\t");
      });
  }

  function pasteBlock(cells, destinationRange, text, options) {
    var settings = options || {};
    var nextCells = settings.cutRange ? clearRange(cells, settings.cutRange) : { ...cells };
    var block = parseClipboard(text);
    var target = destinationRange.start;
    var rowOffset;
    var colOffset;

    for (rowOffset = 0; rowOffset < block.length; rowOffset += 1) {
      for (colOffset = 0; colOffset < block[rowOffset].length; colOffset += 1) {
        var sourceRow = settings.sourceRange ? settings.sourceRange.start.row + rowOffset : target.row + rowOffset;
        var sourceCol = settings.sourceRange ? settings.sourceRange.start.col + colOffset : target.col + colOffset;
        var value = block[rowOffset][colOffset].charAt(0) === "="
          ? shiftReference(block[rowOffset][colOffset], (target.row + rowOffset) - sourceRow, (target.col + colOffset) - sourceCol)
          : block[rowOffset][colOffset];
        var key = cellKey(target.row + rowOffset, target.col + colOffset);

        if (value) {
          nextCells[key] = value;
        } else {
          delete nextCells[key];
        }
      }
    }

    return {
      cells: nextCells,
      range: normalizeRange(
        target,
        {
          row: target.row + block.length - 1,
          col: target.col + block[0].length - 1,
        },
        target
      ),
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rangeAnchor(range) {
    return {
      row: range.active.row === range.start.row ? range.end.row : range.start.row,
      col: range.active.col === range.start.col ? range.end.col : range.start.col,
    };
  }

  function shiftReference(reference, rowDelta, colDelta) {
    return reference.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, colFixed, colLabel, rowFixed, rowNumber) {
      var nextCol = colFixed ? columnNumber(colLabel) : columnNumber(colLabel) + colDelta;
      var nextRow = rowFixed ? Number(rowNumber) : Number(rowNumber) + rowDelta;
      return (
        (colFixed || "")
        + columnLabel(Math.max(1, nextCol))
        + (rowFixed || "")
        + String(Math.max(1, nextRow))
      );
    });
  }

  function forEachCell(range, visitor) {
    var row;
    var col;
    for (row = range.start.row; row <= range.end.row; row += 1) {
      for (col = range.start.col; col <= range.end.col; col += 1) {
        visitor(row, col);
      }
    }
  }

  return {
    cellKey: cellKey,
    columnLabel: columnLabel,
    columnNumber: columnNumber,
    normalizeRange: normalizeRange,
    extendRange: extendRange,
    clearRange: clearRange,
    copyRange: copyRange,
    parseClipboard: parseClipboard,
    pasteBlock: pasteBlock,
    clamp: clamp,
  };
});
