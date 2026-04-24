(function (global) {
  'use strict';

  var COLS = 26;
  var ROWS = 100;
  var MAX_HISTORY = 50;

  function colName(col) {
    var name = '';
    var n = col + 1;
    while (n > 0) {
      var rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function parseRef(ref) {
    var match = /^([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, ''));
    if (!match) return null;
    var col = 0;
    for (var i = 0; i < match[1].length; i += 1) {
      col = col * 26 + match[1].charCodeAt(i) - 64;
    }
    return { row: Number(match[2]) - 1, col: col - 1 };
  }

  function refName(row, col) {
    return colName(col) + String(row + 1);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function describeSelection(anchor, active, maxRows, maxCols) {
    var activeRow = clamp(active.row, 0, maxRows - 1);
    var activeCol = clamp(active.col, 0, maxCols - 1);
    var anchorRow = clamp(anchor.row, 0, maxRows - 1);
    var anchorCol = clamp(anchor.col, 0, maxCols - 1);
    var selection = {
      r1: Math.min(anchorRow, activeRow),
      c1: Math.min(anchorCol, activeCol),
      r2: Math.max(anchorRow, activeRow),
      c2: Math.max(anchorCol, activeCol),
      activeRow: activeRow,
      activeCol: activeCol,
      label: ''
    };
    var start = refName(selection.r1, selection.c1);
    var end = refName(selection.r2, selection.c2);
    selection.label = start === end ? start : start + ':' + end;
    return selection;
  }

  function eachCellInRange(range, callback) {
    var startRow = Math.min(range.r1, range.r2);
    var endRow = Math.max(range.r1, range.r2);
    var startCol = Math.min(range.c1, range.c2);
    var endCol = Math.max(range.c1, range.c2);
    for (var row = startRow; row <= endRow; row += 1) {
      for (var col = startCol; col <= endCol; col += 1) {
        callback(row, col);
      }
    }
  }

  function replaceOutsideStrings(source, pattern, replacer) {
    var out = '';
    var chunk = '';
    var inString = false;
    for (var i = 0; i < source.length; i += 1) {
      var ch = source[i];
      if (ch === '"') {
        if (!inString) {
          out += chunk.replace(pattern, replacer);
          chunk = '';
          inString = true;
        } else if (source[i + 1] === '"') {
          chunk += '\\"';
          i += 1;
          continue;
        } else {
          inString = false;
          out += '"' + chunk + '"';
          chunk = '';
          continue;
        }
      } else {
        chunk += ch;
      }
    }
    out += inString ? '"' + chunk : chunk.replace(pattern, replacer);
    return out;
  }

  function adjustFormulaReferences(raw, fromRow, fromCol, toRow, toCol) {
    if (!raw || raw[0] !== '=') return raw;
    var rowDelta = toRow - fromRow;
    var colDelta = toCol - fromCol;
    return replaceOutsideStrings(raw, /(\$?)([A-Z]+)(\$?)(\d+)/g, function (_, absCol, colLetters, absRow, rowText) {
      var parsed = parseRef(colLetters + rowText);
      if (!parsed) return _;
      var nextCol = absCol ? parsed.col : parsed.col + colDelta;
      var nextRow = absRow ? parsed.row : parsed.row + rowDelta;
      if (nextCol < 0 || nextRow < 0) return '#REF!';
      return absCol + colName(nextCol) + absRow + String(nextRow + 1);
    });
  }

  function adjustFormulaStructure(raw, axis, atIndex, count, mode) {
    if (!raw || raw[0] !== '=') return raw;
    return replaceOutsideStrings(raw, /(\$?)([A-Z]+)(\$?)(\d+)/g, function (match, absCol, colLetters, absRow, rowText) {
      var parsed = parseRef(colLetters + rowText);
      var nextRow = parsed.row;
      var nextCol = parsed.col;
      if (axis === 'row') {
        if (mode === 'insert' && parsed.row >= atIndex) nextRow += count;
        if (mode === 'delete' && parsed.row >= atIndex && parsed.row < atIndex + count) return '#REF!';
        if (mode === 'delete' && parsed.row >= atIndex + count) nextRow -= count;
      }
      if (axis === 'col') {
        if (mode === 'insert' && parsed.col >= atIndex) nextCol += count;
        if (mode === 'delete' && parsed.col >= atIndex && parsed.col < atIndex + count) return '#REF!';
        if (mode === 'delete' && parsed.col >= atIndex + count) nextCol -= count;
      }
      return absCol + colName(nextCol) + absRow + String(nextRow + 1);
    });
  }

  function flatten(values) {
    var out = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) out = out.concat(flatten(value));
      else out.push(value);
    });
    return out;
  }

  function numeric(value) {
    if (value === true) return 1;
    if (value === false || value === '' || value === null || value === undefined) return 0;
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function displayValue(value) {
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function SpreadsheetEngine(cols, rows) {
    this.cols = cols || COLS;
    this.rows = rows || ROWS;
    this.cells = {};
  }

  SpreadsheetEngine.prototype.key = function (row, col) {
    return row + ',' + col;
  };

  SpreadsheetEngine.prototype.setCell = function (row, col, raw) {
    var key = this.key(row, col);
    var value = String(raw == null ? '' : raw);
    if (value) this.cells[key] = value;
    else delete this.cells[key];
  };

  SpreadsheetEngine.prototype.applyRawChanges = function (updates) {
    var byKey = {};
    var self = this;
    updates.forEach(function (item) {
      if (item.row < 0 || item.col < 0 || item.row >= self.rows || item.col >= self.cols) return;
      var itemKey = self.key(item.row, item.col);
      if (!byKey[itemKey]) byKey[itemKey] = { row: item.row, col: item.col, oldRaw: self.getRaw(item.row, item.col), newRaw: '' };
      byKey[itemKey].newRaw = String(item.raw == null ? '' : item.raw);
    });
    return Object.keys(byKey).map(function (itemKey) {
      var change = byKey[itemKey];
      self.setCell(change.row, change.col, change.newRaw);
      return change;
    }).filter(function (change) { return change.oldRaw !== change.newRaw; });
  };

  SpreadsheetEngine.prototype.getRaw = function (row, col) {
    return this.cells[this.key(row, col)] || '';
  };

  SpreadsheetEngine.prototype.toJSON = function () {
    return { cols: this.cols, rows: this.rows, cells: this.cells };
  };

  SpreadsheetEngine.fromJSON = function (data) {
    var engine = new SpreadsheetEngine(data && data.cols || COLS, data && data.rows || ROWS);
    engine.cells = data && data.cells || {};
    return engine;
  };

  SpreadsheetEngine.prototype.getValue = function (row, col, stack) {
    var raw = this.getRaw(row, col);
    if (!raw) return '';
    if (raw[0] !== '=') {
      var n = Number(raw);
      return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
    }
    stack = stack || {};
    var key = this.key(row, col);
    if (stack[key]) return '#CIRC!';
    stack[key] = true;
    var result = this.evaluateFormula(raw, stack);
    delete stack[key];
    return result;
  };

  SpreadsheetEngine.prototype.getDisplay = function (row, col) {
    return displayValue(this.getValue(row, col, {}));
  };

  SpreadsheetEngine.prototype.shiftStructure = function (axis, atIndex, count, mode) {
    var next = {};
    var self = this;
    Object.keys(this.cells).forEach(function (cellKey) {
      var parts = cellKey.split(',').map(Number);
      var row = parts[0];
      var col = parts[1];
      if (axis === 'row') {
        if (mode === 'insert' && row >= atIndex) row += count;
        if (mode === 'delete' && row >= atIndex && row < atIndex + count) return;
        if (mode === 'delete' && row >= atIndex + count) row -= count;
      }
      if (axis === 'col') {
        if (mode === 'insert' && col >= atIndex) col += count;
        if (mode === 'delete' && col >= atIndex && col < atIndex + count) return;
        if (mode === 'delete' && col >= atIndex + count) col -= count;
      }
      if (row >= 0 && row < self.rows && col >= 0 && col < self.cols) {
        next[self.key(row, col)] = adjustFormulaStructure(self.cells[cellKey], axis, atIndex, count, mode);
      }
    });
    this.cells = next;
  };

  SpreadsheetEngine.prototype.insertRows = function (atRow, count) {
    this.shiftStructure('row', atRow, count || 1, 'insert');
  };

  SpreadsheetEngine.prototype.deleteRows = function (atRow, count) {
    this.shiftStructure('row', atRow, count || 1, 'delete');
  };

  SpreadsheetEngine.prototype.insertCols = function (atCol, count) {
    this.shiftStructure('col', atCol, count || 1, 'insert');
  };

  SpreadsheetEngine.prototype.deleteCols = function (atCol, count) {
    this.shiftStructure('col', atCol, count || 1, 'delete');
  };

  SpreadsheetEngine.prototype.copyRange = function (range) {
    var data = [];
    var r1 = Math.min(range.r1, range.r2);
    var r2 = Math.max(range.r1, range.r2);
    var c1 = Math.min(range.c1, range.c2);
    var c2 = Math.max(range.c1, range.c2);
    for (var row = r1; row <= r2; row += 1) {
      var line = [];
      for (var col = c1; col <= c2; col += 1) line.push(this.getRaw(row, col));
      data.push(line);
    }
    return data;
  };

  SpreadsheetEngine.prototype.pasteBlock = function (block, startRow, startCol, sourceRange, targetSize) {
    var rows = targetSize && targetSize.rows ? targetSize.rows : block.length;
    var cols = targetSize && targetSize.cols ? targetSize.cols : block[0].length;
    var updates = [];
    for (var r = 0; r < rows; r += 1) {
      var sourceRow = block[r % block.length];
      for (var c = 0; c < cols; c += 1) {
        var raw = sourceRow[c % sourceRow.length];
        var fromRow = sourceRange ? sourceRange.r1 + (r % block.length) : startRow + r;
        var fromCol = sourceRange ? sourceRange.c1 + (c % sourceRow.length) : startCol + c;
        updates.push({ row: startRow + r, col: startCol + c, raw: adjustFormulaReferences(raw, fromRow, fromCol, startRow + r, startCol + c) });
      }
    }
    return this.applyRawChanges(updates);
  };

  SpreadsheetEngine.prototype.moveRange = function (range, startRow, startCol) {
    var source = this.copyRange(range);
    var r1 = Math.min(range.r1, range.r2);
    var c1 = Math.min(range.c1, range.c2);
    var updates = [];
    for (var r = 0; r < source.length; r += 1) {
      for (var c = 0; c < source[r].length; c += 1) updates.push({ row: r1 + r, col: c1 + c, raw: '' });
    }
    for (var pr = 0; pr < source.length; pr += 1) {
      for (var pc = 0; pc < source[pr].length; pc += 1) {
        updates.push({ row: startRow + pr, col: startCol + pc, raw: adjustFormulaReferences(source[pr][pc], r1 + pr, c1 + pc, startRow + pr, startCol + pc) });
      }
    }
    return this.applyRawChanges(updates);
  };

  SpreadsheetEngine.prototype.rangeValues = function (startRef, endRef, stack) {
    var start = parseRef(startRef);
    var end = parseRef(endRef);
    var values = [];
    if (!start || !end) return values;
    var r1 = Math.min(start.row, end.row);
    var r2 = Math.max(start.row, end.row);
    var c1 = Math.min(start.col, end.col);
    var c2 = Math.max(start.col, end.col);
    for (var r = r1; r <= r2; r += 1) {
      for (var c = c1; c <= c2; c += 1) {
        values.push(this.getValue(r, c, stack));
      }
    }
    return values;
  };

  SpreadsheetEngine.prototype.evaluateFormula = function (raw, stack) {
    var self = this;
    var expr = raw.slice(1).trim();
    try {
      expr = expr.replace(/<>/g, '!=').replace(/([^<>!=])=([^=])/g, '$1==$2').replace(/&/g, '+');
      expr = replaceOutsideStrings(expr, /(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/g, function (_, a, b) {
        return 'RANGE("' + a.replace(/\$/g, '') + '","' + b.replace(/\$/g, '') + '")';
      });
      expr = replaceOutsideStrings(expr, /\b(\$?[A-Z]+\$?\d+)\b/g, function (_, ref) {
        return 'CELL("' + ref.replace(/\$/g, '') + '")';
      });
      expr = replaceOutsideStrings(expr, /\bTRUE\b/g, function () { return 'true'; });
      expr = replaceOutsideStrings(expr, /\bFALSE\b/g, function () { return 'false'; });
      var fns = {
        CELL: function (ref) {
          var parsed = parseRef(ref);
          if (!parsed || parsed.row < 0 || parsed.col < 0 || parsed.row >= self.rows || parsed.col >= self.cols) return '#REF!';
          return self.getValue(parsed.row, parsed.col, stack);
        },
        RANGE: function (a, b) { return self.rangeValues(a, b, stack); },
        SUM: function () { return flatten(Array.prototype.slice.call(arguments)).reduce(function (sum, value) { return sum + numeric(value); }, 0); },
        AVERAGE: function () { var vals = flatten(Array.prototype.slice.call(arguments)); return vals.length ? fns.SUM(vals) / vals.length : 0; },
        MIN: function () { return Math.min.apply(Math, flatten(Array.prototype.slice.call(arguments)).map(numeric)); },
        MAX: function () { return Math.max.apply(Math, flatten(Array.prototype.slice.call(arguments)).map(numeric)); },
        COUNT: function () { return flatten(Array.prototype.slice.call(arguments)).filter(function (value) { return value !== '' && Number.isFinite(Number(value)); }).length; },
        IF: function (cond, yes, no) { return cond ? yes : no; },
        AND: function () { return flatten(Array.prototype.slice.call(arguments)).every(Boolean); },
        OR: function () { return flatten(Array.prototype.slice.call(arguments)).some(Boolean); },
        NOT: function (value) { return !value; },
        ABS: Math.abs,
        ROUND: function (value, digits) { var places = Math.pow(10, digits || 0); return Math.round(numeric(value) * places) / places; },
        CONCAT: function () { return flatten(Array.prototype.slice.call(arguments)).map(displayValue).join(''); }
      };
      var names = Object.keys(fns);
      var values = names.map(function (name) { return fns[name]; });
      var result = Function(names.join(','), 'return (' + expr + ');').apply(null, values);
      return result === Infinity || result === -Infinity ? '#DIV/0!' : result;
    } catch (error) {
      return '#ERR!';
    }
  };

  function createApp() {
    var grid = document.getElementById('grid');
    if (!grid) return;
    var wrap = document.getElementById('sheet-wrap');
    var formulaInput = document.getElementById('formula-input');
    var cellName = document.getElementById('cell-name');
    var ns = global.SPREADSHEET_STORAGE_NAMESPACE || global.__STORAGE_NAMESPACE__ || document.documentElement.dataset.storageNamespace || 'local-spreadsheet:' + location.pathname;
    var storageKey = ns + ':sheet-state';
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (error) { saved = null; }
    var engine = SpreadsheetEngine.fromJSON(saved && saved.sheet);
    var active = saved && saved.active || { row: 0, col: 0 };
    var anchor = { row: active.row, col: active.col };
    var range = { r1: active.row, c1: active.col, r2: active.row, c2: active.col };
    var editing = null;
    var history = [];
    var redo = [];
    var dragSelecting = false;
    var internalClipboard = null;
    var contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.hidden = true;
    document.body.appendChild(contextMenu);
    var formulaInputCommitted = false;

    function persist() {
      localStorage.setItem(storageKey, JSON.stringify({ sheet: engine.toJSON(), active: active }));
    }

    function record(changes) {
      if (!changes.length) return;
      history.push(changes);
      if (history.length > MAX_HISTORY) history.shift();
      redo = [];
    }

    function applyChanges(changes, direction) {
      if (changes.snapshot) {
        engine.cells = JSON.parse(JSON.stringify(direction === 'old' ? changes.oldCells : changes.newCells));
        renderValues();
        persist();
        return;
      }
      changes.forEach(function (change) {
        engine.setCell(change.row, change.col, direction === 'old' ? change.oldRaw : change.newRaw);
      });
      renderValues();
      persist();
    }

    function setMany(updates) {
      var changes = engine.applyRawChanges(updates);
      record(changes);
      renderValues();
      persist();
    }

    function recordEngineChanges(changes) {
      record(changes);
      renderValues();
      persist();
    }

    function mutateStructure(action) {
      var oldCells = JSON.parse(JSON.stringify(engine.cells));
      action();
      var newCells = JSON.parse(JSON.stringify(engine.cells));
      history.push({ snapshot: true, oldCells: oldCells, newCells: newCells });
      if (history.length > MAX_HISTORY) history.shift();
      redo = [];
      buildGrid();
      renderValues();
      persist();
    }

    function buildGrid() {
      grid.innerHTML = '';
      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      var corner = document.createElement('th');
      corner.className = 'corner';
      headRow.appendChild(corner);
      for (var col = 0; col < COLS; col += 1) {
        var th = document.createElement('th');
        th.textContent = colName(col);
        th.dataset.colHeader = String(col);
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      grid.appendChild(thead);
      var tbody = document.createElement('tbody');
      for (var row = 0; row < ROWS; row += 1) {
        var tr = document.createElement('tr');
        var rowHead = document.createElement('th');
        rowHead.className = 'row-header';
        rowHead.textContent = String(row + 1);
        rowHead.dataset.rowHeader = String(row);
        tr.appendChild(rowHead);
        for (var c = 0; c < COLS; c += 1) {
          var td = document.createElement('td');
          td.className = 'cell';
          td.dataset.row = String(row);
          td.dataset.col = String(c);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      grid.appendChild(tbody);
    }

    function showContextMenu(x, y, items) {
      contextMenu.innerHTML = '';
      items.forEach(function (item) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        button.addEventListener('click', function () {
          contextMenu.hidden = true;
          item.run();
        });
        contextMenu.appendChild(button);
      });
      contextMenu.style.left = x + 'px';
      contextMenu.style.top = y + 'px';
      contextMenu.hidden = false;
    }

    function getCell(row, col) {
      return grid.querySelector('[data-row="' + row + '"][data-col="' + col + '"]');
    }

    function normalizedRange() {
      return describeSelection({ row: range.r1, col: range.c1 }, { row: range.r2, col: range.c2 }, ROWS, COLS);
    }

    function renderValues() {
      for (var row = 0; row < ROWS; row += 1) {
        for (var col = 0; col < COLS; col += 1) {
          var td = getCell(row, col);
          var raw = engine.getRaw(row, col);
          var display = engine.getDisplay(row, col);
          td.textContent = display;
          td.classList.toggle('number', raw !== '' && Number.isFinite(Number(display)));
          td.classList.toggle('text', raw === '' || !Number.isFinite(Number(display)));
          td.classList.toggle('error', /^#/.test(display));
        }
      }
      renderSelection();
    }

    function renderSelection() {
      var nr = normalizedRange();
      grid.querySelectorAll('.cell').forEach(function (td) {
        var row = Number(td.dataset.row);
        var col = Number(td.dataset.col);
        td.classList.toggle('active', row === active.row && col === active.col);
        td.classList.toggle('in-range', row >= nr.r1 && row <= nr.r2 && col >= nr.c1 && col <= nr.c2);
      });
      grid.querySelectorAll('[data-col-header]').forEach(function (th) {
        var col = Number(th.dataset.colHeader);
        th.classList.toggle('selected-header', col >= nr.c1 && col <= nr.c2);
        th.classList.toggle('active-header', col === active.col);
      });
      grid.querySelectorAll('[data-row-header]').forEach(function (th) {
        var row = Number(th.dataset.rowHeader);
        th.classList.toggle('selected-header', row >= nr.r1 && row <= nr.r2);
        th.classList.toggle('active-header', row === active.row);
      });
      cellName.textContent = nr.label;
      if (document.activeElement !== formulaInput) formulaInput.value = engine.getRaw(active.row, active.col);
      var current = getCell(active.row, active.col);
      if (current) current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function selectCell(row, col, extend) {
      active = { row: clamp(row, 0, ROWS - 1), col: clamp(col, 0, COLS - 1) };
      if (!extend) anchor = { row: active.row, col: active.col };
      range = { r1: anchor.row, c1: anchor.col, r2: active.row, c2: active.col };
      renderSelection();
      persist();
    }

    function commitEdit(value, move) {
      if (editing) {
        editing.cell.classList.remove('editing');
        editing.cell.innerHTML = '';
        editing = null;
      }
      setMany([{ row: active.row, col: active.col, raw: value }]);
      if (move === 'down') selectCell(active.row + 1, active.col, false);
      if (move === 'right') selectCell(active.row, active.col + 1, false);
      wrap.focus();
    }

    function commitFormulaInput(move) {
      var row = active.row;
      var col = active.col;
      setMany([{ row: row, col: col, raw: formulaInput.value }]);
      if (move === 'down') selectCell(row + 1, col, false);
      if (move === 'right') selectCell(row, col + 1, false);
      if (move === 'left') selectCell(row, col - 1, false);
      wrap.focus();
    }

    function startEdit(preserve, initial) {
      if (editing) return;
      var td = getCell(active.row, active.col);
      var previous = engine.getRaw(active.row, active.col);
      td.classList.add('editing');
      td.textContent = '';
      var input = document.createElement('input');
      input.className = 'cell-editor';
      input.value = preserve ? previous : initial || '';
      td.appendChild(input);
      editing = { cell: td, input: input, previous: previous };
      input.focus();
      input.select();
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); commitEdit(input.value, 'down'); }
        if (event.key === 'Tab') { event.preventDefault(); commitEdit(input.value, 'right'); }
        if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
      });
    }

    function cancelEdit() {
      if (!editing) return;
      editing.cell.classList.remove('editing');
      editing.cell.innerHTML = '';
      editing = null;
      renderValues();
      wrap.focus();
    }

    function clearRange() {
      var updates = [];
      eachCellInRange(range, function (row, col) { updates.push({ row: row, col: col, raw: '' }); });
      setMany(updates);
    }

    function clipboardText() {
      var nr = normalizedRange();
      return engine.copyRange(nr).map(function (line) { return line.join('\t'); }).join('\n');
    }

    function parseClipboardText(text) {
      var rows = text.replace(/\r/g, '').split('\n');
      if (rows[rows.length - 1] === '') rows.pop();
      return rows.map(function (line) { return line.split('\t'); });
    }

    function pasteText(text) {
      var block = parseClipboardText(text);
      if (!block.length) return;
      var target = normalizedRange();
      var targetRows = target.r2 - target.r1 + 1;
      var targetCols = target.c2 - target.c1 + 1;
      var targetSize = targetRows === 1 && targetCols === 1 ? null : { rows: targetRows, cols: targetCols };
      if (internalClipboard && internalClipboard.cut) {
        recordEngineChanges(engine.moveRange(internalClipboard.range, active.row, active.col));
        internalClipboard = null;
        return;
      }
      recordEngineChanges(engine.pasteBlock(block, active.row, active.col, internalClipboard && internalClipboard.range, targetSize));
    }

    buildGrid();
    renderValues();

    grid.addEventListener('mousedown', function (event) {
      var td = event.target.closest('.cell');
      if (!td) return;
      event.preventDefault();
      selectCell(Number(td.dataset.row), Number(td.dataset.col), event.shiftKey);
      dragSelecting = true;
      wrap.focus();
    });

    grid.addEventListener('contextmenu', function (event) {
      var rowHeader = event.target.closest('[data-row-header]');
      var colHeader = event.target.closest('[data-col-header]');
      if (!rowHeader && !colHeader) return;
      event.preventDefault();
      if (rowHeader) {
        var row = Number(rowHeader.dataset.rowHeader);
        showContextMenu(event.clientX, event.clientY, [
          { label: 'Insert row above', run: function () { mutateStructure(function () { engine.insertRows(row, 1); }); } },
          { label: 'Insert row below', run: function () { mutateStructure(function () { engine.insertRows(row + 1, 1); }); } },
          { label: 'Delete row', run: function () { mutateStructure(function () { engine.deleteRows(row, 1); }); } }
        ]);
      }
      if (colHeader) {
        var col = Number(colHeader.dataset.colHeader);
        showContextMenu(event.clientX, event.clientY, [
          { label: 'Insert column left', run: function () { mutateStructure(function () { engine.insertCols(col, 1); }); } },
          { label: 'Insert column right', run: function () { mutateStructure(function () { engine.insertCols(col + 1, 1); }); } },
          { label: 'Delete column', run: function () { mutateStructure(function () { engine.deleteCols(col, 1); }); } }
        ]);
      }
    });

    grid.addEventListener('mouseover', function (event) {
      if (!dragSelecting) return;
      var td = event.target.closest('.cell');
      if (!td) return;
      selectCell(Number(td.dataset.row), Number(td.dataset.col), true);
    });

    document.addEventListener('mouseup', function () {
      dragSelecting = false;
    });

    document.addEventListener('click', function (event) {
      if (!contextMenu.contains(event.target)) contextMenu.hidden = true;
    });

    grid.addEventListener('dblclick', function (event) {
      var td = event.target.closest('.cell');
      if (!td) return;
      selectCell(Number(td.dataset.row), Number(td.dataset.col), false);
      startEdit(true);
    });

    wrap.addEventListener('keydown', function (event) {
      if (editing) return;
      var meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          var redoChanges = redo.pop();
          if (redoChanges) { history.push(redoChanges); applyChanges(redoChanges, 'new'); }
        } else {
          var undoChanges = history.pop();
          if (undoChanges) { redo.push(undoChanges); applyChanges(undoChanges, 'old'); }
        }
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        var yChanges = redo.pop();
        if (yChanges) { history.push(yChanges); applyChanges(yChanges, 'new'); }
        return;
      }
      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        internalClipboard = { range: normalizedRange(), cut: false };
        navigator.clipboard && navigator.clipboard.writeText(clipboardText());
        return;
      }
      if (meta && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        internalClipboard = { range: normalizedRange(), cut: true };
        navigator.clipboard && navigator.clipboard.writeText(clipboardText());
        return;
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        if (navigator.clipboard) navigator.clipboard.readText().then(pasteText);
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit(true); return; }
      if (event.key === 'Tab') { event.preventDefault(); selectCell(active.row, active.col + (event.shiftKey ? -1 : 1), false); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearRange(); return; }
      if (event.key.indexOf('Arrow') === 0) {
        event.preventDefault();
        var dr = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        var dc = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        selectCell(active.row + dr, active.col + dc, event.shiftKey);
        return;
      }
      if (event.key.length === 1 && !meta && !event.altKey) {
        event.preventDefault();
        startEdit(false, event.key);
      }
    });

    formulaInput.addEventListener('focus', function () { formulaInput.value = engine.getRaw(active.row, active.col); });
    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); formulaInputCommitted = true; commitFormulaInput('down'); setTimeout(function () { formulaInputCommitted = false; }, 0); }
      if (event.key === 'Tab') { event.preventDefault(); formulaInputCommitted = true; commitFormulaInput(event.shiftKey ? 'left' : 'right'); setTimeout(function () { formulaInputCommitted = false; }, 0); }
      if (event.key === 'Escape') { event.preventDefault(); formulaInput.value = engine.getRaw(active.row, active.col); wrap.focus(); }
    });
    formulaInput.addEventListener('change', function () { if (!formulaInputCommitted) commitFormulaInput(); });
    wrap.addEventListener('paste', function (event) {
      if (document.activeElement === formulaInput) return;
      event.preventDefault();
      pasteText(event.clipboardData.getData('text/plain'));
    });

    selectCell(active.row, active.col, false);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SpreadsheetEngine: SpreadsheetEngine, adjustFormulaReferences: adjustFormulaReferences, parseRef: parseRef, colName: colName, describeSelection: describeSelection };
  }

  if (global.document) {
    global.addEventListener('DOMContentLoaded', createApp);
  }
})(typeof window !== 'undefined' ? window : globalThis);
