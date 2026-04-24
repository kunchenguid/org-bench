(function () {
  "use strict";

  var spreadsheet = window.Spreadsheet;
  var store = spreadsheet.createStore();
  var activeAddress = document.getElementById("active-address");
  var formulaInput = document.getElementById("formula-input");
  var gridRoot = document.getElementById("grid-root");

  window.sheetStore = store;

  function renderShellGrid() {
    gridRoot.setAttribute("role", "grid");
    gridRoot.setAttribute("aria-rowcount", String(spreadsheet.constants.rows));
    gridRoot.setAttribute("aria-colcount", String(spreadsheet.constants.columns));
    gridRoot.dataset.ready = "true";
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

  formulaInput.addEventListener("change", function () {
    store.setCellRaw(store.snapshot().selection.active, formulaInput.value, "formula-bar");
  });

  renderShellGrid();
  syncFormulaBar(store.snapshot().selection);
  document.dispatchEvent(new CustomEvent("spreadsheet:ready", { detail: { store: store } }));
}());
