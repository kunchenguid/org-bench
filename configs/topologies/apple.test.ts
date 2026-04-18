import assert from "node:assert/strict";
import test from "node:test";

import { apple } from "./apple.js";

test("apple topology exports the canonical nine-node star with Steve as the sole integrator", () => {
  assert.equal(apple.slug, "apple");
  assert.equal(apple.name, "Apple");
  assert.deepEqual(apple.nodes, [
    "Steve",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "n6",
    "n7",
    "n8",
  ]);
  assert.deepEqual(apple.edges, [
    { from: "Steve", to: "n1", bidir: true },
    { from: "Steve", to: "n2", bidir: true },
    { from: "Steve", to: "n3", bidir: true },
    { from: "Steve", to: "n4", bidir: true },
    { from: "Steve", to: "n5", bidir: true },
    { from: "Steve", to: "n6", bidir: true },
    { from: "Steve", to: "n7", bidir: true },
    { from: "Steve", to: "n8", bidir: true },
  ]);
  assert.equal(apple.leader, "Steve");
  assert.deepEqual(apple.developers, [
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "n6",
    "n7",
    "n8",
  ]);
  assert.deepEqual(apple.integrators, ["Steve"]);
  assert.equal(apple.culture?.kind, "apple-taste");
});
