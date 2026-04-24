(function () {
  "use strict";

  var app = window.App;
  var store = app.createStore();
  var activeAddress = document.getElementById("active-address");
  var formulaInput = document.getElementById("formula-input");
  var gridRoot = document.getElementById("grid-root");

  app.store = store;

  function renderShellGrid() {
    gridRoot.setAttribute("role", "grid");
    gridRoot.setAttribute("aria-rowcount", String(app.constants.rows));
    gridRoot.setAttribute("aria-colcount", String(app.constants.columns));
    gridRoot.dataset.ready = "true";
  }

  function syncFormulaBar(selection) {
    activeAddress.textContent = app.cellKey(selection.active);
    formulaInput.value = store.getCellRaw(selection.active);
  }

  store.on("selectionchange", function (event) {
    syncFormulaBar(event.detail.selection);
  });

  store.on("cellchange", function (event) {
    var active = store.snapshot().selection.active;
    if (app.cellKey(active) === event.detail.key) {
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
