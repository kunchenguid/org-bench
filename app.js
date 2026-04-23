(function () {
  var core = window.SpreadsheetCore;
  var grid = document.getElementById('grid');
  var formulaBar = document.getElementById('formulaBar');
  var cellName = document.getElementById('cellName');
  var menu = document.getElementById('menu');
  var selectionStatus = document.getElementById('selectionStatus');
  var insertRowBtn = document.getElementById('insertRowBtn');
  var insertColBtn = document.getElementById('insertColBtn');
  var clearRangeBtn = document.getElementById('clearRangeBtn');
  var ns = window.__SPREADSHEET_STORAGE_NAMESPACE__ || window.__BENCH_STORAGE_NAMESPACE__ || window.STORAGE_NAMESPACE || 'facebook-sheet';
  var storageKey = ns + ':state';
  var sheet = { rows: 100, cols: 26, cells: {} };
  var active = { row: 0, col: 0 };
  var anchor = { row: 0, col: 0 };
  var range = { r1: 0, c1: 0, r2: 0, c2: 0 };
  var editing = null;
  var undo = [];
  var redo = [];
  var copyRange = null;
  var cutRange = null;
  var mouseDown = false;

  load();
  render();
  selectCell(active.row, active.col, false);

  function key(row, col) { return core.cellKey(row, col); }
  function raw(row, col) { return sheet.cells[key(row, col)] || ''; }
  function setRaw(row, col, value) { value === '' ? delete sheet.cells[key(row, col)] : sheet.cells[key(row, col)] = value; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function normalize(a, b) { return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) }; }
  function currentState() { return { rows: sheet.rows, cols: sheet.cols, cells: Object.assign({}, sheet.cells), active: Object.assign({}, active), anchor: Object.assign({}, anchor) }; }
  function restoreState(s) { sheet = { rows: s.rows, cols: s.cols, cells: Object.assign({}, s.cells || {}) }; active = s.active || { row: 0, col: 0 }; anchor = s.anchor || active; range = normalize(anchor, active); render(); save(); }
  function pushHistory() { undo.push(currentState()); if (undo.length > 50) undo.shift(); redo = []; }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify(currentState())); } catch (e) {} }
  function load() { try { var s = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (s) restoreState(s); } catch (e) {} }

  function render() {
    var html = '<thead><tr><th></th>';
    for (var c = 0; c < sheet.cols; c++) html += '<th data-col="' + c + '">' + core.colToName(c) + '</th>';
    html += '</tr></thead><tbody>';
    for (var r = 0; r < sheet.rows; r++) {
      html += '<tr><th data-row="' + r + '">' + (r + 1) + '</th>';
      for (c = 0; c < sheet.cols; c++) html += '<td data-row="' + r + '" data-col="' + c + '"></td>';
      html += '</tr>';
    }
    grid.innerHTML = html + '</tbody>';
    paintAll();
  }

  function paintAll() {
    var cells = grid.querySelectorAll('td');
    cells.forEach(function (td) {
      var r = Number(td.dataset.row), c = Number(td.dataset.col);
      var val = core.evaluateCell(sheet, { row: r, col: c });
      td.textContent = val.display;
      td.className = '';
      if (raw(r, c) !== '' && !isNaN(Number(val.display))) td.classList.add('number');
      if (val.display.charAt(0) === '#') td.classList.add('error');
      if (r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2) td.classList.add('in-range');
      if (r === active.row && c === active.col) td.classList.add('active');
    });
    formulaBar.value = raw(active.row, active.col);
    cellName.textContent = key(active.row, active.col);
    updateSelectionStatus();
    paintHeaders();
  }

  function updateSelectionStatus() {
    var rows = range.r2 - range.r1 + 1;
    var cols = range.c2 - range.c1 + 1;
    selectionStatus.textContent = rows === 1 && cols === 1
      ? key(active.row, active.col) + ' selected'
      : key(range.r1, range.c1) + ':' + key(range.r2, range.c2) + ' selected (' + rows + ' x ' + cols + ')';
  }

  function paintHeaders() {
    grid.querySelectorAll('th.hot').forEach(function (th) { th.classList.remove('hot'); });
    var rowHead = grid.querySelector('tbody th[data-row="' + active.row + '"]');
    var colHead = grid.querySelector('thead th[data-col="' + active.col + '"]');
    if (rowHead) rowHead.classList.add('hot');
    if (colHead) colHead.classList.add('hot');
  }

  function selectCell(row, col, extend) {
    active = { row: clamp(row, 0, sheet.rows - 1), col: clamp(col, 0, sheet.cols - 1) };
    if (!extend) anchor = { row: active.row, col: active.col };
    range = normalize(anchor, active);
    paintAll();
    var td = cellEl(active.row, active.col);
    if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    save();
  }

  function cellEl(row, col) { return grid.querySelector('td[data-row="' + row + '"][data-col="' + col + '"]'); }

  function startEdit(initial, replace) {
    if (editing) return;
    var td = cellEl(active.row, active.col);
    var before = raw(active.row, active.col);
    editing = { row: active.row, col: active.col, before: before };
    td.classList.add('editing');
    td.innerHTML = '<input class="cell-editor" autocomplete="off" spellcheck="false">';
    var input = td.firstChild;
    input.value = replace ? initial : before;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(1, 0); }
      if (e.key === 'Tab') { e.preventDefault(); commitEdit(0, e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    });
    input.addEventListener('input', function () { formulaBar.value = input.value; });
    input.addEventListener('blur', function () { if (editing) commitEdit(0, 0); });
  }

  function commitEdit(dr, dc) {
    if (!editing) return;
    var input = cellEl(editing.row, editing.col).querySelector('input');
    var value = input.value;
    if (value !== editing.before) { pushHistory(); setRaw(editing.row, editing.col, value); }
    editing = null;
    selectCell(active.row + dr, active.col + dc, false);
    save();
  }

  function cancelEdit() { editing = null; paintAll(); }

  function applyRange(fn) {
    pushHistory();
    for (var r = range.r1; r <= range.r2; r++) for (var c = range.c1; c <= range.c2; c++) fn(r, c);
    paintAll(); save();
  }

  function clipboardText(cut) {
    var lines = [];
    for (var r = range.r1; r <= range.r2; r++) {
      var vals = [];
      for (var c = range.c1; c <= range.c2; c++) vals.push(raw(r, c));
      lines.push(vals.join('\t'));
    }
    copyRange = Object.assign({}, range);
    cutRange = cut ? Object.assign({}, range) : null;
    return lines.join('\n');
  }

  function pasteText(text) {
    var rows = text.replace(/\r/g, '').split('\n').filter(function (line, idx, arr) { return !(idx === arr.length - 1 && line === ''); }).map(function (line) { return line.split('\t'); });
    if (!rows.length) return;
    pushHistory();
    var src = cutRange || copyRange || { r1: active.row, c1: active.col };
    var startRow = range.r1;
    var startCol = range.c1;
    var height = range.r2 - range.r1 + 1, width = range.c2 - range.c1 + 1;
    var repeat = height === rows.length && width === rows[0].length;
    for (var r = 0; r < (repeat ? height : rows.length); r++) {
      for (var c = 0; c < (repeat ? width : rows[r].length); c++) {
        var dstR = startRow + r, dstC = startCol + c;
        if (dstR >= sheet.rows || dstC >= sheet.cols) continue;
        var value = rows[r % rows.length][c % rows[0].length] || '';
        if (value.charAt(0) === '=') value = core.adjustFormula(value, src.r1 + (r % rows.length), src.c1 + (c % rows[0].length), dstR, dstC);
        setRaw(dstR, dstC, value);
      }
    }
    if (cutRange) {
      for (r = cutRange.r1; r <= cutRange.r2; r++) for (c = cutRange.c1; c <= cutRange.c2; c++) setRaw(r, c, '');
      cutRange = null;
    }
    copyRange = null;
    paintAll(); save();
  }

  function insertRow(index) { pushHistory(); shiftCells('row', index, 1); sheet.rows++; finishStructure('row', index, 1); }
  function deleteRow(index) { if (sheet.rows <= 1) return; pushHistory(); shiftCells('row', index, -1); sheet.rows--; finishStructure('row', index, -1); }
  function insertCol(index) { pushHistory(); shiftCells('col', index, 1); sheet.cols++; finishStructure('col', index, 1); }
  function deleteCol(index) { if (sheet.cols <= 1) return; pushHistory(); shiftCells('col', index, -1); sheet.cols--; finishStructure('col', index, -1); }
  function shiftCells(type, index, delta) {
    var next = {};
    Object.keys(sheet.cells).forEach(function (addr) {
      var p = core.parseCellAddress(addr);
      if (type === 'row') {
        if (delta < 0 && p.row === index) return;
        if (p.row >= index) p.row += delta;
      } else {
        if (delta < 0 && p.col === index) return;
        if (p.col >= index) p.col += delta;
      }
      if (p.row >= 0 && p.col >= 0) next[key(p.row, p.col)] = sheet.cells[addr];
    });
    sheet.cells = next;
  }
  function finishStructure(type, index, delta) {
    Object.keys(sheet.cells).forEach(function (addr) { sheet.cells[addr] = core.adjustFormulaForStructure(sheet.cells[addr], type, index, delta); });
    active.row = clamp(active.row, 0, sheet.rows - 1); active.col = clamp(active.col, 0, sheet.cols - 1);
    anchor = active; range = normalize(anchor, active); render(); save();
  }

  grid.addEventListener('mousedown', function (e) {
    var td = e.target.closest('td');
    if (!td) return;
    mouseDown = true;
    selectCell(Number(td.dataset.row), Number(td.dataset.col), e.shiftKey);
  });
  grid.addEventListener('mouseover', function (e) {
    if (!mouseDown) return;
    var td = e.target.closest('td');
    if (td) selectCell(Number(td.dataset.row), Number(td.dataset.col), true);
  });
  document.addEventListener('mouseup', function () { mouseDown = false; });
  grid.addEventListener('dblclick', function (e) { if (e.target.closest('td')) startEdit('', false); });
  grid.addEventListener('contextmenu', function (e) {
    var rowHead = e.target.closest('tbody th');
    var colHead = e.target.closest('thead th[data-col]');
    if (!rowHead && !colHead) return;
    e.preventDefault();
    var buttons = rowHead ? [
      ['Insert row above', function () { insertRow(Number(rowHead.dataset.row)); }],
      ['Insert row below', function () { insertRow(Number(rowHead.dataset.row) + 1); }],
      ['Delete row', function () { deleteRow(Number(rowHead.dataset.row)); }]
    ] : [
      ['Insert column left', function () { insertCol(Number(colHead.dataset.col)); }],
      ['Insert column right', function () { insertCol(Number(colHead.dataset.col) + 1); }],
      ['Delete column', function () { deleteCol(Number(colHead.dataset.col)); }]
    ];
    menu.innerHTML = '';
    buttons.forEach(function (b) { var btn = document.createElement('button'); btn.textContent = b[0]; btn.onclick = function () { menu.hidden = true; b[1](); }; menu.appendChild(btn); });
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; menu.hidden = false;
  });
  document.addEventListener('click', function (e) { if (!menu.contains(e.target)) menu.hidden = true; });
  insertRowBtn.addEventListener('click', function () { insertRow(active.row); grid.focus(); });
  insertColBtn.addEventListener('click', function () { insertCol(active.col); grid.focus(); });
  clearRangeBtn.addEventListener('click', function () { applyRange(function (r, c) { setRaw(r, c, ''); }); grid.focus(); });

  document.addEventListener('copy', function (e) {
    if (editing || document.activeElement === formulaBar) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', clipboardText(false));
  });
  document.addEventListener('cut', function (e) {
    if (editing || document.activeElement === formulaBar) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', clipboardText(true));
  });
  document.addEventListener('paste', function (e) {
    if (editing || document.activeElement === formulaBar) return;
    e.preventDefault();
    pasteText(e.clipboardData.getData('text/plain'));
  });

  formulaBar.addEventListener('input', function () { setRaw(active.row, active.col, formulaBar.value); paintAll(); save(); });
  formulaBar.addEventListener('focus', function () { pushHistory(); });
  formulaBar.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); selectCell(active.row + 1, active.col, false); } });

  document.addEventListener('keydown', function (e) {
    if (editing || document.activeElement === formulaBar) return;
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); var prev = undo.pop(); if (prev) { redo.push(currentState()); restoreState(prev); } return; }
    if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); var next = redo.pop(); if (next) { undo.push(currentState()); restoreState(next); } return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); applyRange(function (r, c) { setRaw(r, c, ''); }); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit('', false); return; }
    if (e.key === 'Tab') { e.preventDefault(); selectCell(active.row, active.col + (e.shiftKey ? -1 : 1), false); return; }
    var dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (dirs[e.key]) { e.preventDefault(); selectCell(active.row + dirs[e.key][0], active.col + dirs[e.key][1], e.shiftKey); return; }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(e.key, true); }
  });
})();
