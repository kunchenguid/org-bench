import type { TopologyConfig } from "@org-bench/orchestrator";

export const google: TopologyConfig = {
  slug: "google",
  name: "Google",
  nodes: ["leader", "m1", "m2", "m3", "m4", "w1", "w2", "w3", "w4"],
  edges: [
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
  ],
  leader: "leader",
  writeAccess: { kind: "leader+middle" },
  culture: {
    kind: "google-design-docs",
    leaderPrompt:
      "You practice Google's design-doc culture. Non-trivial delegation goes through a short technical design document: problem statement, options considered with trade-offs, chosen approach, and success metrics. Expect workers to respond in TDD-review style.",
    middlePrompt:
      "You are a promoted peer integrator. Review design docs from workers, ask for data or metrics when claims are made, and merge only after consensus forms in the doc comments. Prefer data over opinion.",
    workerPrompt:
      "Every substantive change starts with a short design doc you share with your connected middle integrators. Cite data or metrics when making claims. Expect review comments; respond with edits, not arguments.",
  },
};
