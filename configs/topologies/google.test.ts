import assert from "node:assert/strict";
import test from "node:test";

import { google } from "./google.js";

test("google topology exports a nine-node leader-plus-bipartite-middle-and-workers graph with Eric plus middle integrators", () => {
  assert.equal(google.slug, "google");
  assert.equal(google.name, "Google");
  assert.deepEqual(google.nodes, [
    "Eric",
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
    { from: "Eric", to: "m1", bidir: true },
    { from: "Eric", to: "m2", bidir: true },
    { from: "Eric", to: "m3", bidir: true },
    { from: "Eric", to: "m4", bidir: true },
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
  assert.equal(google.leader, "Eric");
  assert.deepEqual(google.developers, [
    "m1",
    "m2",
    "m3",
    "m4",
    "w1",
    "w2",
    "w3",
    "w4",
  ]);
  assert.deepEqual(google.integrators, ["Eric", "m1", "m2", "m3", "m4"]);
  assert.equal(google.culture?.kind, "google-design-docs");
});
