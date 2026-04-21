(function () {
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
  var activeCellId = restoreSelection() || "A1";

  renderHeaders();
  renderGrid();
  setActiveCell(activeCellId);
  status.textContent = "Bootstrap ready";

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
        label.textContent = row === 1 ? "" : "";

        cell.appendChild(label);
        cell.addEventListener("click", handleCellClick);
        grid.appendChild(cell);
      }
    }
  }

  function handleCellClick(event) {
    setActiveCell(event.currentTarget.dataset.cellId);
  }

  function setActiveCell(cellId) {
    var previous = grid.querySelector(".cell.active");
    var next = grid.querySelector('[data-cell-id="' + cellId + '"]');

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
    formulaInput.value = "";
    persistSelection(cellId);
  }

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
