(function (globalScope) {
  const ROWS = 100;
  const COLS = 26;

  function columnIndexToName(index) {
    let value = index + 1;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function cellKey(row, col) {
    return columnIndexToName(col) + String(row + 1);
  }

  function parseCellReference(reference) {
    const match = /^([A-Z]+)(\d+)$/.exec(reference);
    if (!match) {
      return null;
    }

    let col = 0;
    for (const char of match[1]) {
      col = col * 26 + (char.charCodeAt(0) - 64);
    }

    return {
      row: Number(match[2]) - 1,
      col: col - 1,
      key: match[0],
    };
  }

  function normalizeValue(raw) {
    if (raw == null || raw === '') {
      return { value: '', display: '' };
    }

    const numeric = Number(raw);
    if (!Number.isNaN(numeric) && raw.trim() !== '') {
      return { value: numeric, display: String(numeric) };
    }

    return { value: raw, display: String(raw) };
  }

  function evaluateSheet(cells) {
    const cache = {};
    const visiting = new Set();

    function evaluateCell(key) {
      if (cache[key]) {
        return cache[key];
      }

      const raw = Object.prototype.hasOwnProperty.call(cells, key) ? cells[key] : '';
      if (!raw || raw.charAt(0) !== '=') {
        const normalized = normalizeValue(raw);
        cache[key] = { raw, value: normalized.value, display: normalized.display };
        return cache[key];
      }

      if (visiting.has(key)) {
        cache[key] = { raw, value: null, display: '#CIRC!' };
        return cache[key];
      }

      visiting.add(key);
      const expression = raw.slice(1);

      try {
        const jsExpression = expression.replace(/\b([A-Z]+\d+)\b/g, function (match) {
          const referenced = evaluateCell(match);
          if (referenced.display === '#CIRC!') {
            throw new Error('#CIRC!');
          }
          if (referenced.display === '#ERR!' || referenced.display === '#DIV/0!') {
            throw new Error(referenced.display);
          }
          if (referenced.value === '') {
            return '0';
          }
          if (typeof referenced.value === 'number') {
            return String(referenced.value);
          }
          return JSON.stringify(String(referenced.value));
        });

        const value = Function('return (' + jsExpression + ');')();
        if (typeof value === 'number' && !Number.isFinite(value)) {
          throw new Error('#DIV/0!');
        }
        cache[key] = {
          raw,
          value,
          display: value === true ? 'TRUE' : value === false ? 'FALSE' : String(value),
        };
      } catch (error) {
        const message = error && error.message;
        cache[key] = {
          raw,
          value: null,
          display: message === '#CIRC!' ? '#CIRC!' : message === '#DIV/0!' ? '#DIV/0!' : '#ERR!',
        };
      }

      visiting.delete(key);
      return cache[key];
    }

    const evaluated = {};
    for (const key of Object.keys(cells)) {
      evaluated[key] = evaluateCell(key);
    }
    return evaluated;
  }

  function createEmptySheet() {
    return {
      rows: ROWS,
      cols: COLS,
      selected: { row: 0, col: 0 },
      cells: {},
    };
  }

  function makeStorageKey(namespace, suffix) {
    return String(namespace || 'spreadsheet:') + suffix;
  }

  const api = {
    ROWS,
    COLS,
    cellKey,
    columnIndexToName,
    createEmptySheet,
    evaluateSheet,
    makeStorageKey,
    parseCellReference,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.SpreadsheetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
