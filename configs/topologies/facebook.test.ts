import assert from "node:assert/strict";
import test from "node:test";

import { facebook } from "./facebook.js";

test("facebook topology exports a nine-node near-complete mesh where every node is both developer and integrator", () => {
  assert.equal(facebook.slug, "facebook");
  assert.equal(facebook.name, "Facebook");
  assert.deepEqual(facebook.nodes, [
    "Mark",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "n6",
    "n7",
    "n8",
  ]);
  assert.deepEqual(facebook.edges, [
    { from: "Mark", to: "n1", bidir: true },
    { from: "Mark", to: "n2", bidir: true },
    { from: "Mark", to: "n3", bidir: true },
    { from: "Mark", to: "n4", bidir: true },
    { from: "Mark", to: "n5", bidir: true },
    { from: "Mark", to: "n6", bidir: true },
    { from: "Mark", to: "n7", bidir: true },
    { from: "Mark", to: "n8", bidir: true },
    { from: "n1", to: "n2", bidir: true },
    { from: "n1", to: "n3", bidir: true },
    { from: "n1", to: "n4", bidir: true },
    { from: "n1", to: "n5", bidir: true },
    { from: "n1", to: "n6", bidir: true },
    { from: "n1", to: "n7", bidir: true },
    { from: "n1", to: "n8", bidir: true },
    { from: "n2", to: "n3", bidir: true },
    { from: "n2", to: "n4", bidir: true },
    { from: "n2", to: "n5", bidir: true },
    { from: "n2", to: "n6", bidir: true },
    { from: "n2", to: "n7", bidir: true },
    { from: "n2", to: "n8", bidir: true },
    { from: "n3", to: "n4", bidir: true },
    { from: "n3", to: "n5", bidir: true },
    { from: "n3", to: "n6", bidir: true },
    { from: "n3", to: "n7", bidir: true },
    { from: "n3", to: "n8", bidir: true },
    { from: "n4", to: "n5", bidir: true },
    { from: "n4", to: "n6", bidir: true },
    { from: "n4", to: "n7", bidir: true },
    { from: "n4", to: "n8", bidir: true },
    { from: "n5", to: "n6", bidir: true },
    { from: "n5", to: "n7", bidir: true },
    { from: "n5", to: "n8", bidir: true },
    { from: "n6", to: "n7", bidir: true },
    { from: "n6", to: "n8", bidir: true },
    { from: "n7", to: "n8", bidir: true },
  ]);
  assert.equal(facebook.leader, "Mark");
  assert.deepEqual(facebook.developers, [
    "Mark",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "n6",
    "n7",
    "n8",
  ]);
  assert.deepEqual(facebook.integrators, [
    "Mark",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "n6",
    "n7",
    "n8",
  ]);
  assert.equal(facebook.culture?.kind, "facebook-velocity");
});
