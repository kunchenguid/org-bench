const defaultModels = {
  node: {
    model: "openai/gpt-5.4",
    tools: true,
    thinking: "standard",
    outputMode: "text",
    maxTurns: 1,
  },
  judge: {
    model: "openai/gpt-5.4",
    tools: false,
    thinking: "standard",
    outputMode: "json",
    maxTurns: 1,
  },
  analyst: {
    model: "openai/gpt-5.4",
    tools: false,
    thinking: "extended",
    outputMode: "json",
    maxTurns: 1,
  },
  player: {
    model: "openai/gpt-5.4",
    tools: false,
    thinking: "standard",
    outputMode: "json",
    maxTurns: 1,
  },
} as const;

export const run = {
  topology: {
    slug: "microsoft",
    name: "Microsoft",
    nodes: ["leader", "divA", "divB", "a1", "b1"],
    edges: [
      { from: "leader", to: "divA", bidir: true },
      { from: "leader", to: "divB", bidir: true },
      { from: "divA", to: "a1", bidir: true },
      { from: "divB", to: "b1", bidir: true },
    ],
    leader: "leader",
    developers: ["divA", "divB", "a1", "b1"],
    integrators: ["leader", "divA", "divB"],
    culture: {
      kind: "microsoft-competition",
      charters: {
        divA: "Owns combat and the rendered board.",
        divB: "Owns cards, art, and the rendered board.",
      },
      contested: ["rendered board"],
      leaderPrompt:
        "You arbitrate between the two divisions and merge only one vision per contested surface.",
      divisionHeadPrompt:
        "You lead your division against the other. Advocate for your vision in PRs and reviews.",
      divisionWorkerPrompt:
        "You are loyal to your division's vision and push back on the other division's approach.",
    },
  },
  seed: 1,
  maxRounds: 12,
  perRoundTimeoutMs: 120_000,
  brief: "Leader-only benchmark brief.",
  models: defaultModels,
  runBudget: {
    tokens: 5_000_000,
    wallClockMs: 10_800_000,
  },
};
