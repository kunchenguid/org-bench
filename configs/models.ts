export type BenchmarkRole = "node" | "judge" | "analyst" | "player";

export type ModelThinkingMode = "standard" | "extended";

export type ModelOutputMode = "text" | "json";

export type ModelProfile = {
  model: string;
  tools: boolean;
  thinking: ModelThinkingMode;
  outputMode: ModelOutputMode;
  maxTurns: number;
};

export type BenchmarkModels = Record<BenchmarkRole, ModelProfile>;

export const defaultModels: BenchmarkModels = {
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
};

export const models = {
  default: defaultModels,
} as const;
