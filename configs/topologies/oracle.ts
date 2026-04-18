import type { TopologyConfig } from "@org-bench/orchestrator";

export const oracle: TopologyConfig = {
  slug: "oracle",
  name: "Oracle",
  nodes: ["Larry", "review", "l1", "l2", "l3", "l4", "e1", "e2", "e3"],
  edges: [
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
  ],
  leader: "Larry",
  developers: ["e1", "e2", "e3"],
  integrators: ["Larry", "review", "l1", "l2", "l3", "l4"],
  culture: {
    kind: "oracle-process",
    reviewNodeId: "review",
    leaderPrompt:
      "You can only merge after the review node (or anyone in the legal subtree: l1, l2, l3, l4) approves with an explicit comment. Respect the review gate; do not try to bypass it. Expect review cycles to take time. You do not raise code PRs yourself; you only review and merge.",
    reviewPrompt:
      "You are the head of the governance/legal branch. The legal subtree (you, l1, l2, l3, l4) dominates the org; engineering (e1, e2, e3) is a small isolated team. You do NOT open code PRs - that is not your role. Your output is PR reviews (approve/request-changes), comments, and citations from the brief. Block merges that skip review, cite rules from the brief when requesting changes, and prefer process correctness over speed.",
    legalStaffPrompt:
      "You support the governance/legal branch. You do NOT open code PRs - your output is PR reviews and comments. When reviewing work, cite specific brief rules and flag compliance issues. Be thorough; slowness is not a defect.",
    engineeringPrompt:
      "You are a small engineering team in a legal-dominated org. Every merge requires legal review approval. Write PRs with detailed compliance rationale up front; expect rework cycles.",
  },
};
