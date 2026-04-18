import type { TopologyConfig } from "@org-bench/orchestrator";

export const apple: TopologyConfig = {
  slug: "apple",
  name: "Apple",
  nodes: ["leader", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"],
  edges: [
    { from: "leader", to: "n1", bidir: true },
    { from: "leader", to: "n2", bidir: true },
    { from: "leader", to: "n3", bidir: true },
    { from: "leader", to: "n4", bidir: true },
    { from: "leader", to: "n5", bidir: true },
    { from: "leader", to: "n6", bidir: true },
    { from: "leader", to: "n7", bidir: true },
    { from: "leader", to: "n8", bidir: true },
  ],
  leader: "leader",
  writeAccess: { kind: "leader-only" },
  culture: {
    kind: "apple-taste",
    leaderPrompt:
      "You are the final aesthetic arbiter. Reject anything that does not meet the polish bar, even if it technically works. Prefer one perfect thing over three good-enough things. Your direct reports work in compartmentalized silos - do not forward one worker's plans to another unless strictly necessary for integration.",
    workerPrompt:
      "You work on a need-to-know basis. You do not know what your peers are building and should not ask. Your work ships only when the leader approves it for taste and polish. Polish matters more than speed.",
  },
};
