(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const COLS = 26;
  const ROWS = 100;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function coordsToRef(col, row) {
    return String.fromCharCode(65 + col) + String(row + 1);
  }

  function refToCoords(ref) {
    const match = /^\$?([A-Z])\$?(\d+)$/.exec(String(ref).toUpperCase());
    if (!match) {
      throw new Error('Invalid cell reference');
    }

    return {
      col: match[1].charCodeAt(0) - 65,
      row: Number(match[2]) - 1,
    };
  }

  function moveSelection(current, delta) {
    return {
      col: clamp(current.col + delta.col, 0, COLS - 1),
      row: clamp(current.row + delta.row, 0, ROWS - 1),
    };
  }

  function getRangeRefs(rangeRef) {
    const [startRef, endRef] = rangeRef.split(':');
    const start = refToCoords(startRef);
    const end = refToCoords(endRef);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const refs = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        refs.push(coordsToRef(col, row));
      }
    }

    return refs;
  }

  function flattenValues(values) {
    const flattened = [];
    for (const value of values) {
      if (Array.isArray(value)) {
        flattened.push(...flattenValues(value));
      } else {
        flattened.push(value);
      }
    }
    return flattened;
  }

  function toNumber(value) {
    if (value === '' || value == null) {
      return 0;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatValue(value) {
    if (value === true) {
      return 'TRUE';
    }
    if (value === false) {
      return 'FALSE';
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function evaluateSheet(cells) {
    const cache = {};
    const visiting = new Set();

    const funcs = {
      SUM: (...args) => flattenValues(args).reduce((sum, value) => sum + toNumber(value), 0),
      AVERAGE: (...args) => {
        const values = flattenValues(args).map(toNumber);
        return values.length ? funcs.SUM(values) / values.length : 0;
      },
      MIN: (...args) => Math.min(...flattenValues(args).map(toNumber)),
      MAX: (...args) => Math.max(...flattenValues(args).map(toNumber)),
      COUNT: (...args) => flattenValues(args).filter((value) => value !== '').length,
      IF: (cond, whenTrue, whenFalse) => (cond ? whenTrue : whenFalse),
      AND: (...args) => flattenValues(args).every(Boolean),
      OR: (...args) => flattenValues(args).some(Boolean),
      NOT: (value) => !value,
      ABS: (value) => Math.abs(toNumber(value)),
      ROUND: (value, digits) => {
        const places = digits == null ? 0 : toNumber(digits);
        const scale = 10 ** places;
        return Math.round(toNumber(value) * scale) / scale;
      },
      CONCAT: (...args) => flattenValues(args).join(''),
    };

    function evaluateRef(ref) {
      const normalizedRef = String(ref).toUpperCase();
      if (cache[normalizedRef]) {
        return cache[normalizedRef];
      }

      if (visiting.has(normalizedRef)) {
        const circular = { raw: cells[normalizedRef] || '', value: '#CIRC!', display: '#CIRC!' };
        cache[normalizedRef] = circular;
        return circular;
      }

      visiting.add(normalizedRef);
      const raw = cells[normalizedRef] || '';
      let result;

      if (!raw) {
        result = { raw: '', value: '', display: '' };
      } else if (raw.startsWith('=')) {
        try {
          const expr = compileFormula(raw.slice(1));
          const value = expr(
            (depRef) => {
              const dep = evaluateRef(depRef);
              if (String(dep.display).startsWith('#')) {
                throw new Error(dep.display);
              }
              return dep.value === '' ? 0 : dep.value;
            },
            (rangeRef) => getRangeRefs(rangeRef).map((depRef) => {
              const dep = evaluateRef(depRef);
              if (String(dep.display).startsWith('#')) {
                throw new Error(dep.display);
              }
              return dep.value === '' ? 0 : dep.value;
            }),
            funcs
          );
          result = { raw, value, display: formatValue(value) };
        } catch (error) {
          const code = error && /^#/.test(error.message) ? error.message : '#ERR!';
          result = { raw, value: code, display: code };
        }
      } else {
        const numeric = Number(raw);
        result = Number.isFinite(numeric) && raw.trim() !== ''
          ? { raw, value: numeric, display: String(numeric) }
          : { raw, value: raw, display: raw };
      }

      visiting.delete(normalizedRef);
      cache[normalizedRef] = result;
      return result;
    }

    const evaluated = {};
    for (const ref of Object.keys(cells)) {
      evaluated[ref] = evaluateRef(ref);
    }
    return evaluated;
  }

  function compileFormula(formula) {
    let expression = String(formula).toUpperCase();
    const rangeTokens = [];
    expression = expression.replace(/<>/g, '!=');
    expression = expression.replace(/(^|[^<>])=([^=])/g, '$1==$2');
    expression = expression.replace(/&/g, '+');
    expression = expression.replace(/\bTRUE\b/g, 'true');
    expression = expression.replace(/\bFALSE\b/g, 'false');
    expression = expression.replace(/([A-Z]\d+):([A-Z]\d+)/g, function (_, startRef, endRef) {
      const token = '__RANGE_' + rangeTokens.length + '__';
      rangeTokens.push('range("' + startRef + ':' + endRef + '")');
      return token;
    });
    expression = expression.replace(/\b(SUM|AVERAGE|MIN|MAX|COUNT|IF|AND|OR|NOT|ABS|ROUND|CONCAT)\s*\(/g, 'funcs.$1(');
    expression = expression.replace(/\b([A-Z]\d+)\b/g, 'cell("$1")');
    expression = expression.replace(/__RANGE_(\d+)__/g, function (_, index) {
      return rangeTokens[Number(index)];
    });

    return new Function('cell', 'range', 'funcs', 'return (' + expression + ');');
  }

  return {
    COLS,
    ROWS,
    coordsToRef,
    refToCoords,
    moveSelection,
    evaluateSheet,
  };
});
