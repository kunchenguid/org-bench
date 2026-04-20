const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../spreadsheet-core.js");

test("evaluates arithmetic and references", function () {
  const sheet = core.createSheet({ A1: "4", A2: "=A1*2", A3: "=A1+A2" });
  assert.equal(core.evaluateCell(sheet, "A3").display, "12");
});

test("evaluates functions and ranges", function () {
  const sheet = core.createSheet({ A1: "2", A2: "4", A3: "6", B1: "=SUM(A1:A3)" });
  assert.equal(core.evaluateCell(sheet, "B1").display, "12");
});

test("renders divide by zero and circular references as spreadsheet errors", function () {
  assert.equal(core.evaluateCell(core.createSheet({ A1: "=1/0" }), "A1").display, "#DIV/0!");
  assert.equal(core.evaluateCell(core.createSheet({ A1: "=B1", B1: "=A1" }), "A1").display, "#CIRC!");
});

test("insertRow shifts cells and keeps formulas pointing at the same data", function () {
  const sheet = core.createSheet({ A1: "10", A2: "20", B1: "=SUM(A1:A2)" });

  sheet.insertRow(0);

  assert.equal(sheet.getCell("A2"), "10");
  assert.equal(sheet.getCell("A3"), "20");
  assert.equal(sheet.getCell("B2"), "=SUM(A2:A3)");
  assert.equal(core.evaluateCell(sheet, "B2").display, "30");
});

test("deleteRow rewrites deleted references to #REF!", function () {
  const sheet = core.createSheet({ A1: "10", B2: "=A1" });

  sheet.deleteRow(0);

  assert.equal(sheet.getCell("B1"), "=#REF!");
  assert.equal(core.evaluateCell(sheet, "B1").display, "#REF!");
});

test("insertColumn shifts cells and keeps formulas pointing at the same data", function () {
  const sheet = core.createSheet({ A1: "10", B1: "20", C1: "=SUM(A1:B1)" });

  sheet.insertColumn(0);

  assert.equal(sheet.getCell("B1"), "10");
  assert.equal(sheet.getCell("C1"), "20");
  assert.equal(sheet.getCell("D1"), "=SUM(B1:C1)");
  assert.equal(core.evaluateCell(sheet, "D1").display, "30");
});

test("deleteColumn rewrites deleted references to #REF!", function () {
  const sheet = core.createSheet({ A1: "10", C2: "=A1" });

  sheet.deleteColumn(0);

  assert.equal(sheet.getCell("B2"), "=#REF!");
  assert.equal(core.evaluateCell(sheet, "B2").display, "#REF!");
});
