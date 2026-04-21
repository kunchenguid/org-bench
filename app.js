(function () {
  var interaction = window.CellInteraction;
  var ROWS = 100;
  var COLS = 26;
  var columnHeaders = document.getElementById("column-headers");
  var rowHeaders = document.getElementById("row-headers");
  var grid = document.getElementById("grid");
  var nameBox = document.getElementById("name-box");
  var formulaInput = document.getElementById("formula-input");
  var status = document.getElementById("app-status");
  var workbookState = createWorkbookState();
  var controller = interaction.createCellInteractionController({
    rows: ROWS,
    cols: COLS,
    workbookState: workbookState,
  });
  var activeCellId = workbookState.getSelectedCell();

  renderHeaders();
  renderGrid();
  refreshSelection();
  status.textContent = "Workbook state ready";

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
        var cellId = toCellId(row, col + 1);
        var cell = document.createElement("button");
        var label = document.createElement("span");

        cell.type = "button";
        cell.className = "cell";
        cell.dataset.cellId = cellId;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", cellId);

        label.className = "cell-label";
        cell.appendChild(label);
        cell.addEventListener("click", handleCellClick);
        cell.addEventListener("dblclick", handleCellDoubleClick);
        grid.appendChild(cell);
      }
    }

    renderGridValues();
  }

  function renderGridValues() {
    grid.querySelectorAll(".cell").forEach(function (cell) {
      renderCell(cell.dataset.cellId);
    });
  }

  function renderCell(cellId) {
    var cell = getCellElement(cellId);
    var label;
    var editor = controller.getEditorState();
    var input;

    if (!cell) {
      return null;
    }

    cell.querySelectorAll(".cell-editor").forEach(function (node) {
      node.remove();
    });

    label = cell.querySelector(".cell-label");
    label.textContent = workbookState.getCellRaw(cellId);

    if (editor && editor.cellId === cellId && editor.source === "cell") {
      input = document.createElement("input");
      input.type = "text";
      input.className = "cell-editor";
      input.value = editor.draft;
      input.addEventListener("input", function () {
        controller.setDraftValue(input.value);
        renderFormulaBar();
      });
      input.addEventListener("keydown", handleEditorKeydown);
      cell.appendChild(input);
      input.focus();
      return input;
    }

    return null;
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

    controller.selectCell(cellId);
    refreshSelection();
  }

  function refreshSelection() {
    var previousActive = activeCellId;
    var selection = controller.getSelection();
    var nextCellId = selection.active;
    var previousCell = previousActive ? getCellElement(previousActive) : null;
    var nextCell = getCellElement(nextCellId);

    if (previousCell) {
      previousCell.classList.remove("active");
      previousCell.setAttribute("aria-selected", "false");
      renderCell(previousActive);
    }

    if (!nextCell) {
      return;
    }

    nextCell.classList.add("active");
    nextCell.setAttribute("aria-selected", "true");
    activeCellId = nextCellId;
    nameBox.value = nextCellId;
    renderFormulaBar();
    renderCell(nextCellId);
    nextCell.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderFormulaBar() {
    formulaInput.value = controller.getFormulaBarValue();
  }

  function beginCellEdit(seedValue, selectContents) {
    var input;

    if (seedValue == null) {
      controller.beginEdit("cell");
    } else {
      controller.startTyping(seedValue);
    }

    renderFormulaBar();
    input = renderCell(activeCellId);
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
      controller.beginEdit("formula-bar");
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
    renderGridValues();
    refreshSelection();
    status.textContent = "Edited " + activeCellId;
  }

  function cancelEdit() {
    var editor = controller.getEditorState();
    controller.cancelEdit();
    renderFormulaBar();
    if (editor) {
      renderCell(editor.cellId);
    }
    status.textContent = "Edit canceled";
  }

  function handleEditorKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit("down");
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      commitEdit("right");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  function isEditing() {
    return !!controller.getEditorState();
  }

  function getCellElement(cellId) {
    return grid.querySelector('[data-cell-id="' + cellId + '"]');
  }

  function toCellId(row, col) {
    return String.fromCharCode(64 + col) + row;
  }

  formulaInput.addEventListener("focus", function () {
    beginFormulaEdit(false);
  });

  formulaInput.addEventListener("input", function () {
    controller.setDraftValue(formulaInput.value);
  });

  formulaInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit("down");
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      commitEdit("right");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (document.activeElement === formulaInput) {
      return;
    }

    if (isEditing()) {
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      controller.moveActive(-1, 0);
      refreshSelection();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      controller.moveActive(1, 0);
      refreshSelection();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      controller.moveActive(0, -1);
      refreshSelection();
      return;
    }

    if (event.key === "ArrowRight" || event.key === "Tab") {
      event.preventDefault();
      controller.moveActive(0, 1);
      refreshSelection();
      return;
    }

    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      beginCellEdit(null, true);
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      beginCellEdit(event.key, false);
    }
  });

  function createWorkbookState() {
    try {
      return window.WorkbookState.createWorkbookState();
    } catch (error) {
      status.textContent = "Storage unavailable";
      return window.WorkbookState.createWorkbookState({
        namespace: "apple-fallback",
        storage: createMemoryStorage(),
      });
    }
  }

  function createMemoryStorage() {
    var values = {};

    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      },
      setItem: function (key, value) {
        values[key] = String(value);
      },
      removeItem: function (key) {
        delete values[key];
      },
    };
  }
})();
