const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../spreadsheet-core.js");

test("evaluates arithmetic and references", function () {
  const cells = { A1: "4", A2: "=A1*2", A3: "=A1+A2" };
  assert.equal(core.evaluateCell("A3", cells).display, "12");
});

test("evaluates functions and ranges", function () {
  const cells = { A1: "2", A2: "4", A3: "6", B1: "=SUM(A1:A3)" };
  assert.equal(core.evaluateCell("B1", cells).display, "12");
});

test("renders divide by zero and circular references as spreadsheet errors", function () {
  assert.equal(core.evaluateCell("A1", { A1: "=1/0" }).display, "#DIV/0!");
  assert.equal(core.evaluateCell("A1", { A1: "=B1", B1: "=A1" }).display, "#CIRC!");
});
