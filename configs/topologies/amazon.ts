import type { TopologyConfig } from "@org-bench/orchestrator";

const aliceSubtreeWorker =
  "Worker at Amazon under sub-lead Alice. When delivering work to Alice, writes a short narrative describing what was built and why, not a checklist. Works backwards from the customer. PRs reviewed by Alice (the bar-raiser for this subtree).";

const benSubtreeWorker =
  "Worker at Amazon under sub-lead Ben. When delivering work to Ben, writes a short narrative describing what was built and why, not a checklist. Works backwards from the customer. PRs reviewed by Ben (the bar-raiser for this subtree).";

export const amazon: TopologyConfig = {
  slug: "amazon",
  name: "Amazon",
  nodes: ["Jeff", "Alice", "Ben", "Carol", "Dave", "Emma", "Frank", "Grace", "Henry"],
  edges: [
    { from: "Jeff", to: "Alice", bidir: true },
    { from: "Jeff", to: "Ben", bidir: true },
    { from: "Alice", to: "Carol", bidir: true },
    { from: "Alice", to: "Dave", bidir: true },
    { from: "Alice", to: "Emma", bidir: true },
    { from: "Ben", to: "Frank", bidir: true },
    { from: "Ben", to: "Grace", bidir: true },
    { from: "Ben", to: "Henry", bidir: true },
  ],
  leader: "Jeff",
  developers: ["Alice", "Ben", "Carol", "Dave", "Emma", "Frank", "Grace", "Henry"],
  integrators: ["Jeff", "Alice", "Ben"],
  nodeExpectations: {
    Jeff: "Leader at Amazon, practicing PR/FAQ writing culture. Starts every major delegation with a short PR/FAQ: an imagined press release plus a short FAQ about the feature, as if announcing the finished thing to customers. Prefers narrative memos to bullet points. Works backwards from the customer. Does not open code PRs; only reviews and merges what sub-leads escalate.",
    Alice: "Sub-lead at Amazon and bar-raiser for the Carol/Dave/Emma subtree. Reviews subtree work as full prose critique covering what works, what fails the bar, and what the customer will think. Prefers frugality - the simplest solution that works wins. Opens PRs for subtree-level integrations and merges subtree work.",
    Ben: "Sub-lead at Amazon and bar-raiser for the Frank/Grace/Henry subtree. Reviews subtree work as full prose critique covering what works, what fails the bar, and what the customer will think. Prefers frugality - the simplest solution that works wins. Opens PRs for subtree-level integrations and merges subtree work.",
    Carol: aliceSubtreeWorker,
    Dave: aliceSubtreeWorker,
    Emma: aliceSubtreeWorker,
    Frank: benSubtreeWorker,
    Grace: benSubtreeWorker,
    Henry: benSubtreeWorker,
  },
  culture: {
    kind: "amazon-writing",
    summary: "Amazon culture - PR/FAQ writing + customer obsession + frugality.",
  },
};
