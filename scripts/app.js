(function () {
  "use strict";

  var spreadsheet = window.Spreadsheet;
  var store = spreadsheet.createStore();
  var activeAddress = document.getElementById("active-address");
  var formulaInput = document.getElementById("formula-input");
  var gridRoot = document.getElementById("grid-root");
  var status = document.querySelector("[data-spreadsheet-slot='status']");

  window.sheetStore = store;

  function renderShellGrid() {
    var state = store.snapshot();

    gridRoot.setAttribute("role", "grid");
    gridRoot.setAttribute("aria-rowcount", String(state.dimensions.rows));
    gridRoot.setAttribute("aria-colcount", String(state.dimensions.columns));
    gridRoot.dataset.ready = "true";
    gridRoot.innerHTML = "";
    gridRoot.appendChild(createGridTable(state));
  }

  function createGridTable(state) {
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var tbody = document.createElement("tbody");

    table.className = "sheet-grid";
    headRow.appendChild(createCornerHeader());
    for (var col = 0; col < state.dimensions.columns; col += 1) {
      headRow.appendChild(createColumnHeader(col));
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    for (var row = 0; row < state.dimensions.rows; row += 1) {
      var tr = document.createElement("tr");
      tr.appendChild(createRowHeader(row));
      for (var cellCol = 0; cellCol < state.dimensions.columns; cellCol += 1) {
        tr.appendChild(createCell(row, cellCol));
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    return table;
  }

  function createCornerHeader() {
    var th = document.createElement("th");
    th.className = "corner-header";
    th.scope = "col";
    return th;
  }

  function createColumnHeader(col) {
    return createHeaderWithMenu(spreadsheet.colToName(col), "column", [
      ["Insert column left", "insert-column-left", function () { applyStructureAction("insertColumns", col); }],
      ["Insert column right", "insert-column-right", function () { applyStructureAction("insertColumns", col + 1); }],
      ["Delete column", "delete-column", function () { applyStructureAction("deleteColumns", col); }, true]
    ]);
  }

  function createRowHeader(row) {
    return createHeaderWithMenu(String(row + 1), "row", [
      ["Insert row above", "insert-row-above", function () { applyStructureAction("insertRows", row); }],
      ["Insert row below", "insert-row-below", function () { applyStructureAction("insertRows", row + 1); }],
      ["Delete row", "delete-row", function () { applyStructureAction("deleteRows", row); }, true]
    ]);
  }

  function createHeaderWithMenu(label, axis, actions) {
    var th = document.createElement("th");
    var labelSpan = document.createElement("span");
    var button = document.createElement("button");
    var menu = document.createElement("div");

    th.className = axis + "-header structure-header";
    th.scope = axis === "row" ? "row" : "col";
    labelSpan.className = "header-label";
    labelSpan.textContent = label;
    button.type = "button";
    button.className = "structure-menu-button";
    button.textContent = "v";
    button.setAttribute("aria-label", label + " structure menu");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    menu.className = "structure-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");

    actions.forEach(function (action) {
      var item = document.createElement("button");
      item.type = "button";
      item.textContent = action[0];
      item.setAttribute("data-action", action[1]);
      item.setAttribute("role", "menuitem");
      if (action[3]) {
        item.className = "danger-action";
      }
      item.addEventListener("click", function () {
        action[2]();
      });
      menu.appendChild(item);
    });

    button.addEventListener("click", function (event) {
      event.stopPropagation();
      var shouldOpen = menu.hidden;
      closeStructureMenus();
      menu.hidden = !shouldOpen;
      button.setAttribute("aria-expanded", String(shouldOpen));
    });

    th.appendChild(labelSpan);
    th.appendChild(button);
    th.appendChild(menu);
    return th;
  }

  function createCell(row, col) {
    var td = document.createElement("td");
    var cell = { row: row, col: col };

    td.className = "sheet-cell";
    td.dataset.cell = spreadsheet.cellKey(cell);
    td.textContent = store.getCellRaw(cell);
    return td;
  }

  function closeStructureMenus() {
    gridRoot.querySelectorAll(".structure-menu").forEach(function (menu) {
      menu.hidden = true;
    });
    gridRoot.querySelectorAll(".structure-menu-button").forEach(function (button) {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function applyStructureAction(type, index) {
    var payload = store.applyStructureAction({ type: type, index: index, count: 1 }, "header-control");
    closeStructureMenus();
    renderShellGrid();
    syncFormulaBar(store.snapshot().selection);
    if (status) {
      status.textContent = payload.type + " applied. Undo payload: " + payload.undo.type + ".";
    }
  }

  function syncFormulaBar(selection) {
    activeAddress.textContent = spreadsheet.cellKey(selection.active);
    formulaInput.value = store.getCellRaw(selection.active);
  }

  store.on("selectionchange", function (event) {
    syncFormulaBar(event.detail.selection);
  });

  store.on("cellchange", function (event) {
    var active = store.snapshot().selection.active;
    if (spreadsheet.cellKey(active) === event.detail.key) {
      formulaInput.value = event.detail.raw;
    }
  });

  store.on("structurechange", function () {
    renderShellGrid();
  });

  document.addEventListener("click", closeStructureMenus);

  formulaInput.addEventListener("change", function () {
    store.setCellRaw(store.snapshot().selection.active, formulaInput.value, "formula-bar");
  });

  renderShellGrid();
  syncFormulaBar(store.snapshot().selection);
  document.dispatchEvent(new CustomEvent("spreadsheet:ready", { detail: { store: store } }));
}());
