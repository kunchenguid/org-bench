import assert from "node:assert/strict";
import test from "node:test";

import { amazon } from "./amazon.js";

test("amazon topology exports a nine-node depth-three tree with leader plus subleads write access", () => {
  assert.equal(amazon.slug, "amazon");
  assert.equal(amazon.name, "Amazon");
  assert.deepEqual(amazon.nodes, [
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
  assert.deepEqual(amazon.edges, [
    { from: "leader", to: "n1", bidir: true },
    { from: "leader", to: "n2", bidir: true },
    { from: "n1", to: "n3", bidir: true },
    { from: "n1", to: "n4", bidir: true },
    { from: "n1", to: "n5", bidir: true },
    { from: "n2", to: "n6", bidir: true },
    { from: "n2", to: "n7", bidir: true },
    { from: "n2", to: "n8", bidir: true },
  ]);
  assert.equal(amazon.leader, "leader");
  assert.deepEqual(amazon.writeAccess, { kind: "leader+subleads" });
  assert.equal(amazon.culture?.kind, "amazon-writing");
});
