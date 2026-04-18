import { defineRunConfig, type RunConfig } from "@org-bench/orchestrator";

import { apple } from "./topologies/apple.js";
import { models } from "./models.js";

export function defineAppleRunConfig(seed: number): RunConfig {
  return defineRunConfig({
    topology: apple,
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
