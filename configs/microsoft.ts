import { defineRunConfig, type RunConfig } from "@org-bench/orchestrator";

import { microsoft } from "./topologies/microsoft.js";
import { models } from "./models.js";

export function defineMicrosoftRunConfig(seed: number): RunConfig {
  return defineRunConfig({
    topology: microsoft,
    seed,
    maxRounds: 28,
    perNodeTurnTimeoutMs: 3_600_000,
    brief: "configs/brief.md",
    models: models.default,
    runBudget: {
      tokens: 175_000_000,
      wallClockMs: 28 * 3_600_000,
    },
  });
}
