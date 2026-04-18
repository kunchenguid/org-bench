import assert from "node:assert/strict";
import test from "node:test";

import { apple } from "./apple.js";

test("apple topology exports the canonical nine-node star", () => {
  assert.equal(apple.slug, "apple");
  assert.equal(apple.name, "Apple");
  assert.deepEqual(apple.nodes, [
    "leader",
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
    { from: "leader", to: "n1", bidir: true },
    { from: "leader", to: "n2", bidir: true },
    { from: "leader", to: "n3", bidir: true },
    { from: "leader", to: "n4", bidir: true },
    { from: "leader", to: "n5", bidir: true },
    { from: "leader", to: "n6", bidir: true },
    { from: "leader", to: "n7", bidir: true },
    { from: "leader", to: "n8", bidir: true },
  ]);
  assert.equal(apple.leader, "leader");
  assert.deepEqual(apple.writeAccess, { kind: "leader-only" });
  assert.equal(apple.culture?.kind, "apple-taste");
});
