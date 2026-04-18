import assert from "node:assert/strict";
import test from "node:test";

import { microsoft } from "./microsoft.js";

test("microsoft topology exports a nine-node two-division tree with Bill plus division heads as integrators", () => {
  assert.equal(microsoft.slug, "microsoft");
  assert.equal(microsoft.name, "Microsoft");
  assert.deepEqual(microsoft.nodes, [
    "Bill",
    "divA",
    "divB",
    "a1",
    "a2",
    "a3",
    "b1",
    "b2",
    "b3",
  ]);
  assert.deepEqual(microsoft.edges, [
    { from: "Bill", to: "divA", bidir: true },
    { from: "Bill", to: "divB", bidir: true },
    { from: "divA", to: "a1", bidir: true },
    { from: "divA", to: "a2", bidir: true },
    { from: "divA", to: "a3", bidir: true },
    { from: "divB", to: "b1", bidir: true },
    { from: "divB", to: "b2", bidir: true },
    { from: "divB", to: "b3", bidir: true },
  ]);
  assert.equal(microsoft.leader, "Bill");
  assert.deepEqual(microsoft.developers, [
    "divA",
    "divB",
    "a1",
    "a2",
    "a3",
    "b1",
    "b2",
    "b3",
  ]);
  assert.deepEqual(microsoft.integrators, ["Bill", "divA", "divB"]);
  assert.equal(microsoft.culture?.kind, "microsoft-competition");
});
