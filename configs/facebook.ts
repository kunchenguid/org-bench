import { defineRunConfig, type RunConfig } from "@org-bench/orchestrator";

import { facebook } from "./topologies/facebook.js";
import { models } from "./models.js";

export function defineFacebookRunConfig(seed: number): RunConfig {
  return defineRunConfig({
    topology: facebook,
    seed,
    maxRounds: 8,
    perRoundTimeoutMs: 3_600_000,
    brief: "configs/brief.md",
    models: models.default,
    runBudget: {
      tokens: 50_000_000,
      wallClockMs: 8 * 3_600_000,
    },
  });
}
