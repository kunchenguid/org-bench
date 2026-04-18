import { z } from "zod";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";

import { evaluatorScenarios } from "./scenarios.js";

import {
  EvaluatorStepRecord,
  SCHEMA_VERSION,
  type EvaluatorStepRecord as EvaluatorStepRecordShape,
} from "@org-bench/schemas";

export const PlayerActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    uid: z.string().min(1),
  }),
  z.object({
    type: z.literal("fill"),
    uid: z.string().min(1),
    text: z.string(),
  }),
  z.object({
    type: z.literal("type"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("press"),
    key: z.string().min(1),
  }),
  z.object({
    type: z.literal("scroll"),
    dir: z.enum(["up", "down", "left", "right"]),
  }),
  z.object({
    type: z.literal("wait"),
    ms: z.number().int().positive().optional(),
    text: z.string().optional(),
  }),
  z.object({
    type: z.literal("done"),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("blocked"),
    note: z.string().optional(),
  }),
]);

export type PlayerAction = z.infer<typeof PlayerActionSchema>;

export type ScenarioSetupContext = {
  open: (url: string) => Promise<string>;
};

export type ScenarioCheckOutcomeInput = {
  finalSnapshot: string;
  consoleErrors: string[];
  history: PlayerAction[];
};

export type ScenarioOutcome = {
  passed: boolean;
  rationale: string;
};

export type EvaluatorScenario = {
  goal: string;
  setup?: (context: ScenarioSetupContext) => Promise<void> | void;
  stepCap: number;
  checkOutcome: (
    input: ScenarioCheckOutcomeInput,
  ) => ScenarioOutcome | Promise<ScenarioOutcome>;
};

export function defineScenario(scenario: EvaluatorScenario): EvaluatorScenario {
  if (scenario.goal.trim().length === 0) {
    throw new Error("Scenario goal must be non-empty");
  }

  if (!Number.isInteger(scenario.stepCap) || scenario.stepCap <= 0) {
    throw new Error("Scenario step cap must be a positive integer");
  }

  return scenario;
}

export type PlayerLoopInput = {
  subGoal: string;
  stepCap: number;
  browser: {
    snapshot: () => Promise<string>;
    screenshot: (outputPath: string) => Promise<string>;
    errors: () => Promise<string>;
    dispatch: (
      action: Exclude<PlayerAction, { type: "done" | "blocked" }>,
    ) => Promise<string>;
  };
  player: {
    nextAction: (input: {
      subGoal: string;
      snapshot: string;
      screenshot: string;
      screenshotPath: string;
      consoleErrors: string[];
      history: PlayerAction[];
    }) => Promise<PlayerAction>;
  };
  createScreenshotPath: (step: number) => string;
};

export type PlayerLoopStep = {
  step: number;
  snapshot: string;
  screenshot: string;
  screenshotPath: string;
  consoleErrors: string[];
  action: PlayerAction;
  dispatched: boolean;
};

export type PlayerLoopResult = {
  history: PlayerAction[];
  steps: PlayerLoopStep[];
  terminalAction?: Extract<PlayerAction, { type: "done" | "blocked" }>;
};

function parsePageErrors(errorsOutput: string): string[] {
  return errorsOutput.trim().length === 0 ? [] : [errorsOutput];
}

export type EvaluatorTelemetry = {
  tokens: {
    in: number;
    out: number;
  };
  latencyMs: number;
  costUsd: number;
};

export type StandaloneEvaluationScenarioResult = {
  id: string;
  passed: boolean;
  passedAttempts: number;
  failedAttempts: number;
  attempts: ScenarioAttemptResult[];
};

export type EvaluateArtifactResult = {
  artifactDir: string;
  trajectoryDir: string;
  scenarios: StandaloneEvaluationScenarioResult[];
};

export type EvaluationServer = {
  url: string;
  close: () => Promise<void>;
};

export type StandaloneBrowser = {
  close: () => Promise<void> | Promise<string> | void;
  open: (url: string) => Promise<string>;
  snapshot: () => Promise<string>;
  screenshot: (outputPath: string) => Promise<string>;
  errors: () => Promise<string>;
  dispatch: (
    action: Exclude<PlayerAction, { type: "done" | "blocked" }>,
  ) => Promise<string>;
};

export type StandalonePlayer = {
  nextAction: PlayerLoopInput["player"]["nextAction"];
};

export type EvaluateArtifactInput = {
  artifactDir: string;
  runId?: string;
  trajectoryDir?: string;
  scenarios?: Array<EvaluatorScenario & { id: string }>;
  createServer?: (input: { rootDir: string }) => Promise<EvaluationServer>;
  browser?: StandaloneBrowser;
  player?: StandalonePlayer;
  model?: string;
  now?: () => string;
  createLatencyMs?: () => number;
  createCostUsd?: () => number;
  onAttemptStart?: (attempt: number, scenarioId: string) => void;
};

export type OpenCodePlayerOptions = {
  model?: string;
  run?: CommandRunner;
};

export const EVALUATOR_SCENARIOS_VERSION = "evaluator-scenarios.v1";

export const SCENARIO_ATTEMPT_COUNT = 3;

export type ScenarioAttemptResult = {
  attempt: number;
  passed: boolean;
  rationale: string;
};

export type EvaluateScenarioAttemptsInput = {
  scenario: EvaluatorScenario;
  runAttempt: (input: {
    attempt: number;
    scenario: EvaluatorScenario;
  }) => Promise<ScenarioOutcome> | ScenarioOutcome;
};

export type EvaluateScenarioAttemptsResult = {
  attempts: ScenarioAttemptResult[];
  passed: boolean;
  passedAttempts: number;
  failedAttempts: number;
};

export type EvaluatorStepWriteInput = {
  trajectoryDir: string;
  runId: string;
  scenario: string;
  attempt: number;
  goal: string;
  model: string;
  steps: Array<{
    step: number;
    startedAt: string;
    snapshotBeforeRef: string;
    action: PlayerAction;
    snapshotAfterRef: string;
    consoleErrors: string[];
    tokens: {
      in: number;
      out: number;
    };
    latencyMs: number;
    costUsd: number;
  }>;
};

function toEvaluatorStepRecord({
  runId,
  scenario,
  attempt,
  goal,
  model,
  step,
}: Omit<EvaluatorStepWriteInput, "trajectoryDir" | "steps"> & {
  step: EvaluatorStepWriteInput["steps"][number];
}): EvaluatorStepRecordShape {
  return EvaluatorStepRecord.parse({
    run_id: runId,
    scenario,
    attempt,
    step: step.step,
    schema_version: SCHEMA_VERSION,
    ts: step.startedAt,
    goal,
    snapshot_before_ref: step.snapshotBeforeRef,
    action: step.action,
    snapshot_after_ref: step.snapshotAfterRef,
    console_errors: step.consoleErrors,
    tokens: step.tokens,
    model,
    latency_ms: step.latencyMs,
    cost_usd: step.costUsd,
  });
}

export async function writeEvaluatorStepRecords({
  trajectoryDir,
  runId,
  scenario,
  attempt,
  goal,
  model,
  steps,
}: EvaluatorStepWriteInput): Promise<string> {
  const evaluatorDir = join(trajectoryDir, "evaluator");
  const outputPath = join(evaluatorDir, `${scenario}.jsonl`);

  await mkdir(evaluatorDir, { recursive: true });

  for (const step of steps) {
    const record = toEvaluatorStepRecord({
      runId,
      scenario,
      attempt,
      goal,
      model,
      step,
    });

    await appendFile(outputPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  return outputPath;
}

export async function evaluateScenarioAttempts({
  scenario,
  runAttempt,
}: EvaluateScenarioAttemptsInput): Promise<EvaluateScenarioAttemptsResult> {
  const attempts: ScenarioAttemptResult[] = [];

  for (let attempt = 1; attempt <= SCENARIO_ATTEMPT_COUNT; attempt += 1) {
    const outcome = await runAttempt({ attempt, scenario });

    attempts.push({
      attempt,
      passed: outcome.passed,
      rationale: outcome.rationale,
    });
  }

  const passedAttempts = attempts.filter((attempt) => attempt.passed).length;
  const failedAttempts = attempts.length - passedAttempts;

  return {
    attempts,
    passed: passedAttempts >= Math.ceil(SCENARIO_ATTEMPT_COUNT / 2),
    passedAttempts,
    failedAttempts,
  };
}

function toFailedScenarioOutcome(error: unknown): ScenarioOutcome {
  return {
    passed: false,
    rationale:
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error),
  };
}

const TRANSIENT_BROWSER_ERROR_PATTERNS = [
  /CDP command timed out/i,
  /Resource temporarily unavailable/i,
  /daemon may be busy or unresponsive/i,
  /WebSocket is not open/i,
  /Target closed/i,
];

function isTransientBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return TRANSIENT_BROWSER_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

async function retryOnTransientBrowserError<T>(
  label: string,
  run: () => Promise<T>,
  {
    maxAttempts = 3,
    backoffMs = 750,
  }: { maxAttempts?: number; backoffMs?: number } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (!isTransientBrowserError(error) || attempt === maxAttempts) {
        throw error;
      }

      process.stderr.write(
        `[evaluator] ${label} transient failure (attempt ${attempt}/${maxAttempts}): ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
      await new Promise((resolve) => {
        setTimeout(resolve, backoffMs * attempt);
      });
    }
  }

  throw lastError;
}

export async function runPlayerLoop({
  subGoal,
  stepCap,
  browser,
  player,
  createScreenshotPath,
}: PlayerLoopInput): Promise<PlayerLoopResult> {
  const history: PlayerAction[] = [];
  const steps: PlayerLoopStep[] = [];

  for (let step = 1; step <= stepCap; step += 1) {
    const snapshot = await retryOnTransientBrowserError("snapshot", () =>
      browser.snapshot(),
    );
    const screenshotPath = createScreenshotPath(step);
    await mkdir(dirname(screenshotPath), { recursive: true });
    const screenshot = await retryOnTransientBrowserError("screenshot", () =>
      browser.screenshot(screenshotPath),
    );
    const errorsOutput = await retryOnTransientBrowserError("errors", () =>
      browser.errors(),
    );
    const consoleErrors = parsePageErrors(errorsOutput);
    const action = await player.nextAction({
      subGoal,
      snapshot,
      screenshot,
      screenshotPath,
      consoleErrors,
      history: [...history],
    });
    const terminal = action.type === "done" || action.type === "blocked";

    history.push(action);
    steps.push({
      step,
      snapshot,
      screenshot,
      screenshotPath,
      consoleErrors,
      action,
      dispatched: !terminal,
    });

    if (terminal) {
      return {
        history,
        steps,
        terminalAction: action,
      };
    }

    await browser.dispatch(action);
  }

  return {
    history,
    steps,
  };
}

function estimateTokenCount(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

async function writeSnapshotArtifact(
  trajectoryDir: string,
  scenarioId: string,
  attempt: number,
  step: number,
  phase: "before" | "after",
  snapshot: string,
): Promise<string> {
  const relativePath = join(
    "blobs",
    "snapshots",
    scenarioId,
    `attempt-${attempt}-step-${step}-${phase}.txt`,
  );
  const outputPath = join(trajectoryDir, relativePath);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, snapshot, "utf8");

  return relativePath;
}

function resolveScenarioUrl(baseUrl: string, target: string): string {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return target;
  }

  return new URL(
    target,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}

export async function evaluateArtifact({
  artifactDir,
  runId = "standalone-evaluate",
  trajectoryDir,
  scenarios = evaluatorScenarios,
  createServer = createStaticServer,
  browser,
  player,
  model = "openai/gpt-5.4",
  now = () => new Date().toISOString(),
  createLatencyMs = () => 0,
  createCostUsd = () => 0,
  onAttemptStart,
}: EvaluateArtifactInput): Promise<EvaluateArtifactResult> {
  const resolvedArtifactDir = resolve(artifactDir);
  const indexPath = join(resolvedArtifactDir, "index.html");
  await stat(indexPath);

  const evaluationBrowser = browser ?? new AgentBrowser({ runner: runCommand });
  const evaluationPlayer = player ?? new OpenCodePlayer({ model });

  try {
    await evaluationBrowser.close();
  } catch (error) {
    process.stderr.write(
      `[evaluator] pre-run browser close (best-effort) failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }

  const server = await createServer({ rootDir: resolvedArtifactDir });
  const resolvedTrajectoryDir =
    trajectoryDir !== undefined
      ? resolve(trajectoryDir)
      : runId === "standalone-evaluate"
        ? await mkdtemp(join(tmpdir(), "org-bench-evaluator-trajectory-"))
        : join(resolvedArtifactDir, "trajectory");
  const scenarioResults: StandaloneEvaluationScenarioResult[] = [];

  try {
    for (const scenario of scenarios) {
      const attempts = await evaluateScenarioAttempts({
        scenario,
        runAttempt: async ({ attempt, scenario: scenarioDefinition }) => {
          try {
          onAttemptStart?.(attempt, scenario.id);
          await retryOnTransientBrowserError("open", () =>
            evaluationBrowser.open(server.url),
          );

          if (scenarioDefinition.setup !== undefined) {
            await scenarioDefinition.setup({
              open: async (url) =>
                retryOnTransientBrowserError("setup.open", () =>
                  evaluationBrowser.open(resolveScenarioUrl(server.url, url)),
                ),
            });
          }

          const loopResult = await runPlayerLoop({
            subGoal: scenario.goal,
            stepCap: scenario.stepCap,
            browser: evaluationBrowser,
            player: evaluationPlayer,
            createScreenshotPath(step) {
              return join(
                resolvedTrajectoryDir,
                "blobs",
                "screenshots",
                scenario.id,
                `attempt-${attempt}-step-${step}.png`,
              );
            },
          });

          const stepWrites = await Promise.all(
            loopResult.steps.map(async (stepRecord, index) => {
              const nextStepSnapshot = loopResult.steps[index + 1]?.snapshot;
              const snapshotAfter = nextStepSnapshot ?? stepRecord.snapshot;
              const snapshotBeforeRef = await writeSnapshotArtifact(
                resolvedTrajectoryDir,
                scenario.id,
                attempt,
                stepRecord.step,
                "before",
                stepRecord.snapshot,
              );
              const snapshotAfterRef = await writeSnapshotArtifact(
                resolvedTrajectoryDir,
                scenario.id,
                attempt,
                stepRecord.step,
                "after",
                snapshotAfter,
              );
              const inputText = JSON.stringify({
                subGoal: scenario.goal,
                snapshot: stepRecord.snapshot,
                screenshotPath: stepRecord.screenshotPath,
                consoleErrors: stepRecord.consoleErrors,
                history: loopResult.history.slice(0, stepRecord.step - 1),
              });
              const outputText = JSON.stringify(stepRecord.action);

              return {
                step: stepRecord.step,
                startedAt: now(),
                snapshotBeforeRef,
                action: stepRecord.action,
                snapshotAfterRef,
                consoleErrors: stepRecord.consoleErrors,
                tokens: {
                  in: estimateTokenCount(inputText),
                  out: estimateTokenCount(outputText),
                },
                latencyMs: createLatencyMs(),
                costUsd: createCostUsd(),
              };
            }),
          );

          await writeEvaluatorStepRecords({
            trajectoryDir: resolvedTrajectoryDir,
            runId,
            scenario: scenario.id,
            attempt,
            goal: scenario.goal,
            model,
            steps: stepWrites,
          });

          const finalSnapshot = loopResult.steps.at(-1)?.snapshot ?? "";
          const consoleErrors = loopResult.steps.flatMap(
            (step) => step.consoleErrors,
          );

          try {
            return await scenario.checkOutcome({
              finalSnapshot,
              consoleErrors,
              history: loopResult.history,
            });
          } catch (error) {
            return toFailedScenarioOutcome(error);
          }
          } catch (error) {
            process.stderr.write(
              `[evaluator] attempt ${attempt} of ${scenario.id} failed: ${
                error instanceof Error ? error.message : String(error)
              }\n`,
            );
            return toFailedScenarioOutcome(error);
          }
        },
      });

      scenarioResults.push({
        id: scenario.id,
        passed: attempts.passed,
        passedAttempts: attempts.passedAttempts,
        failedAttempts: attempts.failedAttempts,
        attempts: attempts.attempts,
      });
    }
  } finally {
    await evaluationBrowser.close();
    await server.close();
  }

  return {
    artifactDir: resolvedArtifactDir,
    trajectoryDir: resolvedTrajectoryDir,
    scenarios: scenarioResults,
  };
}

export type CommandRunnerInput = {
  command: string;
  args: string[];
  cwd?: string;
};

export type CommandRunnerResult = {
  stdout: string;
  stderr: string;
};

export type CommandRunner = (
  input: CommandRunnerInput,
) => Promise<CommandRunnerResult>;

export async function runCommand({
  command,
  args,
  cwd,
}: CommandRunnerInput): Promise<CommandRunnerResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout.push(chunk.toString());
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr.push(chunk.toString());
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${command} exited with code ${code}: ${stderr.join("").trim()}`,
          ),
        );
        return;
      }

      resolvePromise({
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      });
    });
  });
}

export type AgentBrowserOptions = {
  cwd?: string;
  command?: string;
  runner: CommandRunner;
};

const DEFAULT_COMMAND = "agent-browser";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const PLAYER_ACTION_OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "click" },
        uid: { type: "string", minLength: 1 },
      },
      required: ["type", "uid"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "fill" },
        uid: { type: "string", minLength: 1 },
        text: { type: "string" },
      },
      required: ["type", "uid", "text"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "type" },
        text: { type: "string" },
      },
      required: ["type", "text"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "press" },
        key: { type: "string", minLength: 1 },
      },
      required: ["type", "key"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "scroll" },
        dir: { enum: ["up", "down", "left", "right"] },
      },
      required: ["type", "dir"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "wait" },
        ms: { type: "integer", minimum: 1 },
        text: { type: "string" },
      },
      required: ["type"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "done" },
        note: { type: "string" },
      },
      required: ["type"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "blocked" },
        note: { type: "string" },
      },
      required: ["type"],
    },
  ],
});

export async function createStaticServer({
  rootDir,
}: {
  rootDir: string;
}): Promise<EvaluationServer> {
  const server = createHttpServer(async (request, response) => {
    try {
      const requestPath = request.url ?? "/";
      const pathname = decodeURIComponent(
        new URL(requestPath, "http://127.0.0.1").pathname,
      );
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const filePath = join(rootDir, relativePath);
      const fileContents = await readFile(filePath);
      const contentType =
        MIME_TYPES[extname(filePath)] ?? "application/octet-stream";

      response.writeHead(200, { "Content-Type": contentType });
      response.end(fileContents);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  const address = await new Promise<{ port: number }>(
    (resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const listener = server.address();

        if (listener === null || typeof listener === "string") {
          reject(new Error("Static server failed to bind to a TCP port"));
          return;
        }

        resolvePromise({ port: listener.port });
      });
    },
  );

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }

          resolvePromise();
        });
      });
    },
  };
}

export class OpenCodePlayer implements StandalonePlayer {
  private readonly model: string;
  private readonly run: CommandRunner;

  constructor({
    model = "openai/gpt-5.4",
    run = runCommand,
  }: OpenCodePlayerOptions = {}) {
    this.model = model;
    this.run = run;
  }

  async nextAction({
    subGoal,
    snapshot,
    screenshotPath,
    consoleErrors,
    history,
  }: Parameters<StandalonePlayer["nextAction"]>[0]): Promise<PlayerAction> {
    const prompt = [
      "You are the evaluator's LLM-as-player.",
      "Choose exactly one next action that advances the visible UI toward the goal.",
      "Reply with only valid JSON matching this schema:",
      PLAYER_ACTION_OUTPUT_SCHEMA,
      "Sub-goal:",
      subGoal,
      "Snapshot:",
      snapshot,
      "Screenshot path:",
      screenshotPath,
      "Console errors:",
      consoleErrors.length === 0 ? "none" : consoleErrors.join("\n"),
      "History:",
      history.length === 0 ? "[]" : JSON.stringify(history),
    ].join("\n\n");
    const result = await this.run({
      command: "opencode",
      args: [
        "run",
        "--model",
        this.model,
        "--dangerously-skip-permissions",
        "--format",
        "json",
        prompt,
      ],
    });
    const finalText = parseFinalOpencodeText(result.stdout);

    return PlayerActionSchema.parse(JSON.parse(finalText));
  }
}

function parseFinalOpencodeText(stdout: string): string {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const textEvents: string[] = [];

  for (const line of lines) {
    const event = JSON.parse(line) as {
      type?: string;
      part?: {
        type?: string;
        text?: string;
        metadata?: { openai?: { phase?: string } };
      };
      error?: { message?: string };
    };

    if (event.type === "error") {
      throw new Error(
        event.error?.message ?? "OpenCode returned an error event",
      );
    }

    if (
      event.type === "text" &&
      event.part?.type === "text" &&
      event.part.text !== undefined
    ) {
      if (event.part.metadata?.openai?.phase === "final_answer") {
        return event.part.text;
      }

      textEvents.push(event.part.text);
    }
  }

  const fallback = textEvents.at(-1);

  if (fallback === undefined) {
    throw new Error("OpenCode did not emit a final text response");
  }

  return fallback;
}

export class AgentBrowser {
  private readonly command: string;
  private readonly cwd?: string;
  private readonly runner: CommandRunner;

  constructor({ command = DEFAULT_COMMAND, cwd, runner }: AgentBrowserOptions) {
    this.command = command;
    this.cwd = cwd;
    this.runner = runner;
  }

  async close(): Promise<string> {
    return this.run(["close"]);
  }

  async open(url: string): Promise<string> {
    return this.run(["open", url]);
  }

  async snapshot(): Promise<string> {
    return this.run(["snapshot"]);
  }

  async screenshot(outputPath: string): Promise<string> {
    if (outputPath.length === 0) {
      throw new Error("Screenshot output path is required");
    }

    return this.run(["screenshot", outputPath]);
  }

  async errors(): Promise<string> {
    return this.run(["errors"]);
  }

  async dispatch(
    action: Exclude<PlayerAction, { type: "done" | "blocked" }>,
  ): Promise<string> {
    switch (action.type) {
      case "click":
        return this.run(["click", action.uid]);
      case "fill":
        return this.run(["fill", action.uid, action.text]);
      case "type":
        return this.run(["type", action.text]);
      case "press":
        return this.run(["press", action.key]);
      case "scroll":
        return this.run(["scroll", action.dir]);
      case "wait": {
        const args = ["wait"];

        if (action.ms !== undefined) {
          args.push(String(action.ms));
        }

        if (action.text !== undefined) {
          args.push(action.text);
        }

        return this.run(args);
      }
    }
  }

  private async run(args: string[]): Promise<string> {
    const result = await this.runner({
      command: this.command,
      args,
      cwd: this.cwd,
    });

    return result.stdout;
  }
}

export * from "./scenarios.js";
