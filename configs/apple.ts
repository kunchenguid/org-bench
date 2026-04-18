import { defineRunConfig, type RunConfig } from "@org-bench/orchestrator";

import { apple } from "./topologies/apple.js";
import { models } from "./models.js";

export function defineAppleRunConfig(seed: number): RunConfig {
  return defineRunConfig({
    topology: apple,
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
