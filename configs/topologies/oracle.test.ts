import assert from "node:assert/strict";
import test from "node:test";

import { oracle } from "./oracle.js";

test("oracle topology exports a nine-node tree with a dominant legal subtree as integrators and tiny engineering as developers", () => {
  assert.equal(oracle.slug, "oracle");
  assert.equal(oracle.name, "Oracle");
  assert.deepEqual(oracle.nodes, [
    "Larry",
    "review",
    "l1",
    "l2",
    "l3",
    "l4",
    "e1",
    "e2",
    "e3",
  ]);
  assert.deepEqual(oracle.edges, [
    { from: "Larry", to: "review", bidir: true },
    { from: "Larry", to: "e1", bidir: true },
    { from: "Larry", to: "e2", bidir: true },
    { from: "Larry", to: "e3", bidir: true },
    { from: "review", to: "l1", bidir: true },
    { from: "review", to: "l2", bidir: true },
    { from: "l1", to: "l3", bidir: true },
    { from: "l2", to: "l4", bidir: true },
    { from: "e1", to: "e2", bidir: true },
    { from: "e1", to: "e3", bidir: true },
  ]);
  assert.equal(oracle.leader, "Larry");
  assert.deepEqual(oracle.developers, ["e1", "e2", "e3"]);
  assert.deepEqual(oracle.integrators, [
    "Larry",
    "review",
    "l1",
    "l2",
    "l3",
    "l4",
  ]);
  assert.equal(oracle.culture?.kind, "oracle-process");
});
