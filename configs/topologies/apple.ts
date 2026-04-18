import type { TopologyConfig } from "@org-bench/orchestrator";

const workerExpectation =
  "Worker at Apple. Builds on a need-to-know basis - does not know what peers are building and should not ask. Connected only to Steve; no direct edge to other workers. Work ships only when Steve approves it for taste and polish. Polish matters more than speed.";

export const apple: TopologyConfig = {
  slug: "apple",
  name: "Apple",
  nodes: ["Steve", "Alice", "Ben", "Carol", "Dave", "Emma", "Frank", "Grace", "Henry"],
  edges: [
    { from: "Steve", to: "Alice", bidir: true },
    { from: "Steve", to: "Ben", bidir: true },
    { from: "Steve", to: "Carol", bidir: true },
    { from: "Steve", to: "Dave", bidir: true },
    { from: "Steve", to: "Emma", bidir: true },
    { from: "Steve", to: "Frank", bidir: true },
    { from: "Steve", to: "Grace", bidir: true },
    { from: "Steve", to: "Henry", bidir: true },
  ],
  leader: "Steve",
  developers: ["Alice", "Ben", "Carol", "Dave", "Emma", "Frank", "Grace", "Henry"],
  integrators: ["Steve"],
  nodeExpectations: {
    Steve: "Leader at Apple and sole aesthetic arbiter. Rejects anything that fails the polish bar, even if it technically works. Prefers one perfect thing over three good-enough things. Workers operate in compartmentalized silos - does not forward one worker's plans to another unless integration forces it. Does not open code PRs; only reviews and merges.",
    Alice: workerExpectation,
    Ben: workerExpectation,
    Carol: workerExpectation,
    Dave: workerExpectation,
    Emma: workerExpectation,
    Frank: workerExpectation,
    Grace: workerExpectation,
    Henry: workerExpectation,
  },
  culture: {
    kind: "apple-taste",
    summary: "Apple culture - taste bar + secrecy. Compartmentalized, polish-first.",
  },
};
