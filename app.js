(function () {
  var interaction = window.CellInteraction;
  var ROWS = 100;
  var COLS = 26;
  var STORAGE_NAMESPACE = window.__APPLE_RUN_STORAGE_NAMESPACE__ || window.__RUN_STORAGE_NAMESPACE__ || "apple-run";
  var STORAGE_KEY = STORAGE_NAMESPACE + ":bootstrap-selection";
  var columnHeaders = document.getElementById("column-headers");
  var rowHeaders = document.getElementById("row-headers");
  var grid = document.getElementById("grid");
  var nameBox = document.getElementById("name-box");
  var formulaInput = document.getElementById("formula-input");
  var status = document.getElementById("app-status");
  var controller = interaction.createCellInteractionController({ rows: ROWS, cols: COLS });
  var activeCellId = restoreSelection() || "A1";

  renderHeaders();
  renderGrid();
  setActiveCell(activeCellId);
  status.textContent = "Cell interaction ready";

  function renderHeaders() {
    for (var col = 0; col < COLS; col += 1) {
      var header = document.createElement("div");
      header.className = "column-header";
      header.textContent = String.fromCharCode(65 + col);
      columnHeaders.appendChild(header);
    }

    for (var row = 1; row <= ROWS; row += 1) {
      var rowHeader = document.createElement("div");
      rowHeader.className = "row-header";
      rowHeader.textContent = String(row);
      rowHeaders.appendChild(rowHeader);
    }
  }

  function renderGrid() {
    for (var row = 1; row <= ROWS; row += 1) {
      for (var col = 0; col < COLS; col += 1) {
        var cellId = String.fromCharCode(65 + col) + row;
        var cell = document.createElement("button");
        var label = document.createElement("span");

        cell.type = "button";
        cell.className = "cell";
        cell.dataset.cellId = cellId;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", cellId);

        label.className = "cell-label";
        label.textContent = "";

        cell.appendChild(label);
        cell.addEventListener("click", handleCellClick);
        cell.addEventListener("dblclick", handleCellDoubleClick);
        grid.appendChild(cell);
      }
    }
  }

  function handleCellClick(event) {
    setActiveCell(event.currentTarget.dataset.cellId);
  }

  function handleCellDoubleClick(event) {
    setActiveCell(event.currentTarget.dataset.cellId);
    beginCellEdit(null, true);
  }

  function setActiveCell(cellId) {
    if (isEditing()) {
      return;
    }

    var previous = grid.querySelector(".cell.active");
    var next = grid.querySelector('[data-cell-id="' + cellId + '"]');
    var position = parseCellId(cellId);

    if (previous) {
      previous.classList.remove("active");
      previous.setAttribute("aria-selected", "false");
    }

    if (!next) {
      return;
    }

    next.classList.add("active");
    next.setAttribute("aria-selected", "true");
    activeCellId = cellId;
    nameBox.value = cellId;
    controller.selectCell(position.row, position.col);
    formulaInput.value = controller.getFormulaBarValue();
    persistSelection(cellId);
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function parseCellId(cellId) {
    return {
      col: cellId.charCodeAt(0) - 64,
      row: Number(cellId.slice(1)),
    };
  }

  function toCellId(row, col) {
    return String.fromCharCode(64 + col) + row;
  }

  function activeCellElement() {
    return grid.querySelector('[data-cell-id="' + activeCellId + '"]');
  }

  function isEditing() {
    return !!controller.getEditorState();
  }

  function renderFormulaBar() {
    formulaInput.value = controller.getFormulaBarValue();
  }

  function renderActiveCell() {
    var selection = controller.getSelection();
    var cell = activeCellElement();
    var editor = controller.getEditorState();
    var label;
    var input;

    if (!cell) {
      return;
    }

    label = cell.querySelector('.cell-label');
    label.textContent = controller.getCellValue(selection.active.row, selection.active.col);

    cell.querySelectorAll('.cell-editor').forEach(function (node) {
      node.remove();
    });

    if (editor && editor.source === 'cell') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-editor';
      input.value = editor.draft;
      input.addEventListener('input', function () {
        controller.setDraftValue(input.value);
        renderFormulaBar();
      });
      input.addEventListener('keydown', handleEditorKeydown);
      cell.appendChild(input);
      input.focus();
      return input;
    }

    return null;
  }

  function refreshSelection() {
    grid.querySelectorAll('.cell.active').forEach(function (cell) {
      cell.classList.remove('active');
      cell.setAttribute('aria-selected', 'false');
    });

    var selection = controller.getSelection();
    var nextCellId = toCellId(selection.active.row, selection.active.col);
    var cell = grid.querySelector('[data-cell-id="' + nextCellId + '"]');
    if (!cell) {
      return;
    }

    activeCellId = nextCellId;
    nameBox.value = nextCellId;
    cell.classList.add('active');
    cell.setAttribute('aria-selected', 'true');
    persistSelection(nextCellId);
    renderFormulaBar();
    renderActiveCell();
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function beginCellEdit(seedValue, selectContents) {
    var input;
    if (seedValue == null) {
      controller.beginEdit('cell');
    } else {
      controller.startTyping(seedValue);
    }

    renderFormulaBar();
    input = renderActiveCell();
    if (!input) {
      return;
    }

    if (selectContents) {
      input.select();
    } else {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function beginFormulaEdit(selectContents) {
    if (!isEditing()) {
      controller.beginEdit('formula-bar');
    }
    renderFormulaBar();
    formulaInput.focus();
    if (selectContents) {
      formulaInput.select();
    } else {
      formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
    }
  }

  function commitEdit(move) {
    controller.commitEdit(move);
    refreshSelection();
    status.textContent = 'Committed ' + activeCellId;
  }

  function cancelEdit() {
    controller.cancelEdit();
    renderFormulaBar();
    renderActiveCell();
    status.textContent = 'Edit canceled';
  }

  function handleEditorKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit('down');
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit('right');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  formulaInput.addEventListener('focus', function () {
    beginFormulaEdit(false);
  });

  formulaInput.addEventListener('input', function () {
    controller.setDraftValue(formulaInput.value);
  });

  formulaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit('down');
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit('right');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (document.activeElement === formulaInput) {
      return;
    }

    if (isEditing()) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      controller.moveActive(-1, 0);
      refreshSelection();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      controller.moveActive(1, 0);
      refreshSelection();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      controller.moveActive(0, -1);
      refreshSelection();
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'Tab') {
      event.preventDefault();
      controller.moveActive(0, 1);
      refreshSelection();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginCellEdit(null, true);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginCellEdit(event.key, false);
    }
  });

  function persistSelection(cellId) {
    try {
      window.localStorage.setItem(STORAGE_KEY, cellId);
    } catch (error) {
      status.textContent = "Storage unavailable";
    }
  }

  function restoreSelection() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }
})();
