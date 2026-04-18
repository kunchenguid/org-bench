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
    slug: "apple",
    name: "Apple",
    nodes: ["leader", "n1"],
    edges: [{ from: "leader", to: "n1", bidir: true }],
    leader: "leader",
    writeAccess: { kind: "bad-kind" },
    culture: null,
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
