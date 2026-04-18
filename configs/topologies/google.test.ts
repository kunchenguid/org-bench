import assert from "node:assert/strict";
import test from "node:test";

import { google } from "./google.js";

test("google topology exports a nine-node leader-plus-bipartite-middle-and-workers graph with leader+middle write access", () => {
  assert.equal(google.slug, "google");
  assert.equal(google.name, "Google");
  assert.deepEqual(google.nodes, [
    "leader",
    "m1",
    "m2",
    "m3",
    "m4",
    "w1",
    "w2",
    "w3",
    "w4",
  ]);
  assert.deepEqual(google.edges, [
    { from: "leader", to: "m1", bidir: true },
    { from: "leader", to: "m2", bidir: true },
    { from: "leader", to: "m3", bidir: true },
    { from: "leader", to: "m4", bidir: true },
    { from: "m1", to: "w1", bidir: true },
    { from: "m1", to: "w2", bidir: true },
    { from: "m1", to: "w3", bidir: true },
    { from: "m1", to: "w4", bidir: true },
    { from: "m2", to: "w1", bidir: true },
    { from: "m2", to: "w2", bidir: true },
    { from: "m2", to: "w3", bidir: true },
    { from: "m2", to: "w4", bidir: true },
    { from: "m3", to: "w1", bidir: true },
    { from: "m3", to: "w2", bidir: true },
    { from: "m3", to: "w3", bidir: true },
    { from: "m3", to: "w4", bidir: true },
    { from: "m4", to: "w1", bidir: true },
    { from: "m4", to: "w2", bidir: true },
    { from: "m4", to: "w3", bidir: true },
    { from: "m4", to: "w4", bidir: true },
  ]);
  assert.equal(google.leader, "leader");
  assert.deepEqual(google.writeAccess, { kind: "leader+middle" });
  assert.equal(google.culture?.kind, "google-design-docs");
});
