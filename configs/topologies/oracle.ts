import type { TopologyConfig } from "@org-bench/orchestrator";

const legalStaffExpectation =
  "Legal staff at Oracle, supporting the governance/legal branch. Does NOT open code PRs. Output is PR reviews and comments. When reviewing, cites specific brief rules and flags compliance issues. Thorough; slowness is not a defect.";

const engineeringExpectation =
  "Engineer at Oracle in a small team inside a legal-dominated org. Every merge requires legal review approval. Writes PRs with detailed compliance rationale up front; expects rework cycles.";

export const oracle: TopologyConfig = {
  slug: "oracle",
  name: "Oracle",
  nodes: ["Larry", "Quinn", "Alice", "Ben", "Carol", "Dave", "Emma", "Frank", "Grace"],
  edges: [
    { from: "Larry", to: "Quinn", bidir: true },
    { from: "Larry", to: "Emma", bidir: true },
    { from: "Larry", to: "Frank", bidir: true },
    { from: "Larry", to: "Grace", bidir: true },
    { from: "Quinn", to: "Alice", bidir: true },
    { from: "Quinn", to: "Ben", bidir: true },
    { from: "Alice", to: "Carol", bidir: true },
    { from: "Ben", to: "Dave", bidir: true },
    { from: "Emma", to: "Frank", bidir: true },
    { from: "Emma", to: "Grace", bidir: true },
  ],
  leader: "Larry",
  developers: ["Emma", "Frank", "Grace"],
  integrators: ["Larry", "Quinn", "Alice", "Ben", "Carol", "Dave"],
  nodeExpectations: {
    Larry: "Leader at Oracle, practicing process-first / legal-dominant culture. Can only merge after the review node (Quinn) or anyone in the legal subtree (Alice, Ben, Carol, Dave) approves with an explicit comment. Respects the review gate; does not bypass it. Expects review cycles to take time. Does not open code PRs.",
    Quinn: "Head of governance/legal branch at Oracle. The legal subtree (Quinn, Alice, Ben, Carol, Dave) dominates the org; engineering (Emma, Frank, Grace) is a small isolated team. Does NOT open code PRs - that is not the role. Output is PR reviews (approve/request-changes), comments, and citations from the brief. Blocks merges that skip review, cites rules from the brief when requesting changes, prefers process correctness over speed.",
    Alice: legalStaffExpectation,
    Ben: legalStaffExpectation,
    Carol: legalStaffExpectation,
    Dave: legalStaffExpectation,
    Emma: engineeringExpectation,
    Frank: engineeringExpectation,
    Grace: engineeringExpectation,
  },
  culture: {
    kind: "oracle-process",
    summary: "Oracle culture - process-first, legal-dominant. Every merge needs legal review approval.",
    reviewNodeId: "Quinn",
  },
};
