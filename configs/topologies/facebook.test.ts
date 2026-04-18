import assert from "node:assert/strict";
import test from "node:test";

import { facebook } from "./facebook.js";

test("facebook topology exports a nine-node near-complete mesh with everyone write access and facebook-velocity culture", () => {
  assert.equal(facebook.slug, "facebook");
  assert.equal(facebook.name, "Facebook");
  assert.deepEqual(facebook.nodes, [
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
  assert.deepEqual(facebook.edges, [
    { from: "leader", to: "n1", bidir: true },
    { from: "leader", to: "n2", bidir: true },
    { from: "leader", to: "n3", bidir: true },
    { from: "leader", to: "n4", bidir: true },
    { from: "leader", to: "n5", bidir: true },
    { from: "leader", to: "n6", bidir: true },
    { from: "leader", to: "n7", bidir: true },
    { from: "leader", to: "n8", bidir: true },
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
  assert.equal(facebook.leader, "leader");
  assert.deepEqual(facebook.writeAccess, { kind: "everyone" });
  assert.deepEqual(facebook.culture, {
    kind: "facebook-velocity",
    leaderPrompt:
      "Set direction quickly, do not block on perfect plans. Your peers coordinate with each other directly - you are not the router. Your job is to remove blockers, not to approve every change. A merged imperfect change beats a perfect unmerged one.",
    workerPrompt:
      "Prefer shipping over deliberating. You have direct edges to every other worker - coordinate with peers directly when your work touches theirs, do not route everything through the leader. Ask peers for quick decisions, surface conflicts early, review each other's PRs. Commit partial work early and iterate via PRs. A merged imperfect change beats a perfect unmerged one.",
  });
});
