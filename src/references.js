(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.SpreadsheetReferences = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const REF_ERROR = '#REF!';

  function rewriteFormulaForCopy(formula, sourceAddress, targetAddress) {
    if (typeof formula !== 'string' || formula[0] !== '=') {
      return formula;
    }

    const source = parseSimpleAddress(sourceAddress);
    const target = parseSimpleAddress(targetAddress);
    const delta = { col: target.col - source.col, row: target.row - source.row };

    return rewriteFormula(formula, function (match) {
      return rewriteReferenceMatch(match, function (reference) {
        const shifted = {
          col: reference.colAbsolute ? reference.col : reference.col + delta.col,
          row: reference.rowAbsolute ? reference.row : reference.row + delta.row,
          colAbsolute: reference.colAbsolute,
          rowAbsolute: reference.rowAbsolute,
        };

        return isValidReference(shifted) ? formatReference(shifted) : REF_ERROR;
      });
    });
  }

  function rewriteFormulaForStructuralChange(formula, change) {
    if (typeof formula !== 'string' || formula[0] !== '=') {
      return formula;
    }

    return rewriteFormula(formula, function (match) {
      return rewriteReferenceMatch(match, function (reference, isRangeBoundary, rangeMeta) {
        return formatStructuralReference(reference, change, isRangeBoundary, rangeMeta);
      });
    });
  }

  function rewriteFormula(formula, rewriteMatch) {
    let result = '';
    let index = 0;

    while (index < formula.length) {
      const char = formula[index];
      if (char === '"') {
        const stringEnd = findStringEnd(formula, index + 1);
        result += formula.slice(index, stringEnd + 1);
        index = stringEnd + 1;
        continue;
      }

      const match = readReferenceMatch(formula, index);
      if (match) {
        result += rewriteMatch(match);
        index = match.end;
        continue;
      }

      result += char;
      index += 1;
    }

    return result;
  }

  function rewriteReferenceMatch(match, transformReference) {
    if (!match.range) {
      const rewritten = transformReference(match.start, false, null);
      return typeof rewritten === 'string' ? rewritten : REF_ERROR;
    }

    const meta = buildRangeMeta(match.start, match.endReference);
    const start = transformReference(match.start, true, meta);
    const end = transformReference(match.endReference, true, meta);
    if (start === REF_ERROR || end === REF_ERROR) {
      return REF_ERROR;
    }

    return `${start}:${end}`;
  }

  function formatStructuralReference(reference, change, isRangeBoundary, rangeMeta) {
    if (change.kind === 'insert-row') {
      const next = cloneReference(reference);
      if (rangeMeta && rangeMeta.axis === 'row' && rangeMeta.min <= change.index && change.index <= rangeMeta.max) {
        if (rangeMeta.isEnd(reference)) {
          next.row += change.count;
        } else if (next.row >= change.index) {
          next.row += change.count;
        }
      } else if (next.row >= change.index) {
        next.row += change.count;
      }
      return formatReference(next);
    }

    if (change.kind === 'insert-column') {
      const next = cloneReference(reference);
      if (rangeMeta && rangeMeta.axis === 'col' && rangeMeta.min <= change.index && change.index <= rangeMeta.max) {
        if (rangeMeta.isEnd(reference)) {
          next.col += change.count;
        } else if (next.col >= change.index) {
          next.col += change.count;
        }
      } else if (next.col >= change.index) {
        next.col += change.count;
      }
      return formatReference(next);
    }

    if (change.kind === 'delete-row') {
      if (isRangeBoundary && rangeMeta && rangeMeta.axis === 'row') {
        const rewrittenRange = rewriteRangeAxis(rangeMeta.min, rangeMeta.max, change.index, change.count);
        if (!rewrittenRange) return REF_ERROR;
        const next = cloneReference(reference);
        next.row = rangeMeta.isStart(reference) ? rewrittenRange.min : rewrittenRange.max;
        return formatReference(next);
      }

      return rewriteSingleAxis(reference, 'row', change.index, change.count);
    }

    if (change.kind === 'delete-column') {
      if (isRangeBoundary && rangeMeta && rangeMeta.axis === 'col') {
        const rewrittenRange = rewriteRangeAxis(rangeMeta.min, rangeMeta.max, change.index, change.count);
        if (!rewrittenRange) return REF_ERROR;
        const next = cloneReference(reference);
        next.col = rangeMeta.isStart(reference) ? rewrittenRange.min : rewrittenRange.max;
        return formatReference(next);
      }

      return rewriteSingleAxis(reference, 'col', change.index, change.count);
    }

    return formatReference(reference);
  }

  function rewriteSingleAxis(reference, axis, index, count) {
    const value = reference[axis];
    const end = index + count - 1;
    if (index <= value && value <= end) {
      return REF_ERROR;
    }

    const next = cloneReference(reference);
    if (value > end) {
      next[axis] = value - count;
    }

    return formatReference(next);
  }

  function rewriteRangeAxis(min, max, index, count) {
    const end = index + count - 1;
    if (end < min) {
      return { min: min - count, max: max - count };
    }

    if (index > max) {
      return { min, max };
    }

    const overlapStart = Math.max(min, index);
    const overlapEnd = Math.min(max, end);
    const overlap = overlapEnd - overlapStart + 1;
    const remaining = (max - min + 1) - overlap;
    if (remaining <= 0) {
      return null;
    }

    const nextMin = min < index ? min : index;
    const nextMax = nextMin + remaining - 1;
    return { min: nextMin, max: nextMax };
  }

  function buildRangeMeta(start, end) {
    const axis = start.col !== end.col ? 'col' : 'row';
    const startValue = axis === 'col' ? start.col : start.row;
    const endValue = axis === 'col' ? end.col : end.row;

    return {
      axis,
      min: Math.min(startValue, endValue),
      max: Math.max(startValue, endValue),
      isStart(reference) {
        return reference === start;
      },
      isEnd(reference) {
        return reference === end;
      },
    };
  }

  function readReferenceMatch(source, index) {
    const start = readReference(source, index);
    if (!start) {
      return null;
    }

    let end = start.end;
    let endReference = null;
    if (source[end] === ':') {
      endReference = readReference(source, end + 1);
      if (!endReference) {
        return null;
      }
      end = endReference.end;
    }

    return {
      start: start.reference,
      endReference: endReference ? endReference.reference : null,
      end,
      range: Boolean(endReference),
    };
  }

  function readReference(source, index) {
    const match = /^([$]?)([A-Z]+)([$]?)([1-9][0-9]*)/.exec(source.slice(index));
    if (!match) {
      return null;
    }

    return {
      reference: {
        colAbsolute: match[1] === '$',
        col: columnToNumber(match[2]),
        rowAbsolute: match[3] === '$',
        row: Number(match[4]),
      },
      end: index + match[0].length,
    };
  }

  function parseSimpleAddress(address) {
    const parsed = readReference(String(address || ''), 0);
    if (!parsed || parsed.end !== String(address || '').length) {
      throw new Error('Invalid address');
    }
    return parsed.reference;
  }

  function formatReference(reference) {
    return `${reference.colAbsolute ? '$' : ''}${numberToColumn(reference.col)}${reference.rowAbsolute ? '$' : ''}${reference.row}`;
  }

  function cloneReference(reference) {
    return {
      colAbsolute: reference.colAbsolute,
      col: reference.col,
      rowAbsolute: reference.rowAbsolute,
      row: reference.row,
    };
  }

  function isValidReference(reference) {
    return reference.col >= 1 && reference.row >= 1;
  }

  function findStringEnd(source, index) {
    let cursor = index;
    while (cursor < source.length) {
      if (source[cursor] === '"') {
        return cursor;
      }
      cursor += 1;
    }
    return source.length - 1;
  }

  function columnToNumber(label) {
    let value = 0;
    for (const char of label) {
      value = value * 26 + (char.charCodeAt(0) - 64);
    }
    return value;
  }

  function numberToColumn(column) {
    let current = column;
    let result = '';
    while (current > 0) {
      current -= 1;
      result = String.fromCharCode(65 + (current % 26)) + result;
      current = Math.floor(current / 26);
    }
    return result;
  }

  return {
    REF_ERROR,
    rewriteFormulaForCopy,
    rewriteFormulaForStructuralChange,
  };
});
