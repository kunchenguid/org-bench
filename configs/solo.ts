import {
  defineRunConfig,
  type RunConfig,
  type TopologyConfig,
} from "@org-bench/orchestrator";

import { models } from "./models.js";

export const soloTopology: TopologyConfig = {
  slug: "solo",
  name: "Solo",
  nodes: ["leader"],
  edges: [],
  leader: "leader",
  writeAccess: { kind: "everyone" },
  culture: {
    kind: "solo-builder",
    prompt:
      "You are working alone. No coordination, no delegation, no one to review your work. Ship directly. Your only constraint is the brief.",
  },
};

export function defineSoloRunConfig(seed: number): RunConfig {
  return defineRunConfig({
    topology: soloTopology,
    seed,
    maxRounds: 8,
    perRoundTimeoutMs: 3_600_000,
    brief: "configs/brief.md",
    models: models.default,
    runBudget: {
      tokens: 5_000_000,
      wallClockMs: 8 * 3_600_000,
    },
  });
}
