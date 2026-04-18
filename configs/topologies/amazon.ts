import type { TopologyConfig } from "@org-bench/orchestrator";

export const amazon: TopologyConfig = {
  slug: "amazon",
  name: "Amazon",
  nodes: ["Jeff", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"],
  edges: [
    { from: "Jeff", to: "n1", bidir: true },
    { from: "Jeff", to: "n2", bidir: true },
    { from: "n1", to: "n3", bidir: true },
    { from: "n1", to: "n4", bidir: true },
    { from: "n1", to: "n5", bidir: true },
    { from: "n2", to: "n6", bidir: true },
    { from: "n2", to: "n7", bidir: true },
    { from: "n2", to: "n8", bidir: true },
  ],
  leader: "Jeff",
  developers: ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"],
  integrators: ["Jeff", "n1", "n2"],
  culture: {
    kind: "amazon-writing",
    leaderPrompt:
      "You practice Amazon's writing culture. Start every major delegation with a short PR/FAQ: an imagined press release plus a short FAQ about the feature, as if announcing the finished thing to customers. Prefer narrative memos to bullet points. Work backwards from the customer. You do not raise code PRs yourself; you only review and merge.",
    subleadPrompt:
      "You are a bar-raiser. When reviewing work from your subtree, write your review as full prose critique covering what works, what fails the bar, and what the customer will think. Prioritize frugality - the simplest solution that works wins.",
    workerPrompt:
      "When delivering work to your sub-lead, write a short narrative describing what you built and why, not a checklist. Work backwards from the customer.",
  },
};
