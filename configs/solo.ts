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
  developers: ["leader"],
  integrators: [],
  nodeExpectations: {
    leader:
      "Lone builder. No coordination, no delegation, no one to review work. Ships directly. The only constraint is the brief.",
  },
  culture: {
    kind: "solo-builder",
    summary: "Solo - one builder, no team.",
  },
};

export function defineSoloRunConfig(seed: number): RunConfig {
  return defineRunConfig({
    topology: soloTopology,
    seed,
    maxRounds: 28,
    perNodeTurnTimeoutMs: 3_600_000,
    brief: "configs/brief.md",
    models: models.default,
    runBudget: {
      tokens: 30_000_000,
      wallClockMs: 28 * 3_600_000,
    },
  });
}
