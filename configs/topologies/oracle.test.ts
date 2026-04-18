import assert from "node:assert/strict";
import test from "node:test";

import { oracle } from "./oracle.js";

test("oracle topology exports a nine-node review-gated tree with a dominant legal subtree and tiny engineering corner", () => {
  assert.equal(oracle.slug, "oracle");
  assert.equal(oracle.name, "Oracle");
  assert.deepEqual(oracle.nodes, [
    "leader",
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
    { from: "leader", to: "review", bidir: true },
    { from: "leader", to: "e1", bidir: true },
    { from: "review", to: "l1", bidir: true },
    { from: "review", to: "l2", bidir: true },
    { from: "l1", to: "l3", bidir: true },
    { from: "l2", to: "l4", bidir: true },
    { from: "e1", to: "e2", bidir: true },
    { from: "e1", to: "e3", bidir: true },
  ]);
  assert.equal(oracle.leader, "leader");
  assert.deepEqual(oracle.writeAccess, { kind: "review-gated" });
  assert.deepEqual(oracle.culture, {
    kind: "oracle-process",
    reviewNodeId: "review",
    leaderPrompt:
      "You can only merge after the review node approves. Respect the review gate; do not try to bypass it. Expect review cycles to take time.",
    reviewPrompt:
      "You are the head of the governance/legal branch. The legal subtree (you, l1, l2, l3, l4) dominates the org; engineering (e1, e2, e3) is a small isolated team. You do NOT open code PRs - that is not your role. Your output is PR reviews (approve/request-changes), comments, and citations from the brief. Block merges that skip review, cite rules from the brief when requesting changes, and prefer process correctness over speed.",
    legalStaffPrompt:
      "You support the governance/legal branch. You do NOT open code PRs - your output is PR reviews and comments. When reviewing work, cite specific brief rules and flag compliance issues. Be thorough; slowness is not a defect.",
    engineeringPrompt:
      "You are a small engineering team in a legal-dominated org. Every merge requires review approval. Write PRs with detailed compliance rationale up front; expect rework cycles.",
  });
});
