import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { EvaluatorStepRecord, SCHEMA_VERSION } from "@org-bench/schemas";

import {
  AgentBrowser,
  OpenCodePlayer,
  PlayerActionSchema,
  evaluateArtifact,
  evaluatorScenarios,
  evaluateScenarioAttempts,
  defineScenario,
  type CommandRunner,
  runPlayerLoop,
  writeEvaluatorStepRecords,
} from "./index.js";

test("AgentBrowser defaults to the agent-browser CLI", async () => {
  const invocations: Array<{ command: string; args: string[] }> = [];
  const runner: CommandRunner = async ({ command, args }) => {
    invocations.push({ command, args });

    return { stdout: "", stderr: "" };
  };

  const cli = new AgentBrowser({ runner });

  await cli.snapshot();

  assert.deepEqual(invocations, [
    { command: "agent-browser", args: ["snapshot"] },
  ]);
});

test("snapshot returns stdout from the CLI", async () => {
  const calls: Array<{ args: string[]; cwd?: string }> = [];
  const runner: CommandRunner = async ({ args, cwd }) => {
    calls.push({ args, cwd });

    return {
      stdout: '{"tree":[]}',
      stderr: "",
    };
  };

  const cli = new AgentBrowser({ runner, cwd: "/tmp/evaluator" });

  const snapshot = await cli.snapshot();

  assert.equal(snapshot, '{"tree":[]}');
  assert.deepEqual(calls, [
    {
      args: ["snapshot"],
      cwd: "/tmp/evaluator",
    },
  ]);
});

test("errors returns uncaught page exceptions from the CLI", async () => {
  const calls: string[][] = [];
  const runner: CommandRunner = async ({ args }) => {
    calls.push(args);
    return { stdout: "TypeError: x is undefined\n", stderr: "" };
  };

  const cli = new AgentBrowser({ runner });

  const output = await cli.errors();

  assert.equal(output, "TypeError: x is undefined\n");
  assert.deepEqual(calls, [["errors"]]);
});

test("close shuts the browser down via agent-browser close", async () => {
  const calls: string[][] = [];
  const runner: CommandRunner = async ({ args }) => {
    calls.push(args);
    return { stdout: "", stderr: "" };
  };

  const cli = new AgentBrowser({ runner });

  await cli.close();

  assert.deepEqual(calls, [["close"]]);
});

test("dispatch maps structured actions to CLI arguments", async () => {
  const commands: string[][] = [];
  const runner: CommandRunner = async ({ args }) => {
    commands.push(args);

    return {
      stdout: "ok",
      stderr: "",
    };
  };

  const cli = new AgentBrowser({ runner });

  await cli.dispatch({ type: "click", uid: "@12" });
  await cli.dispatch({ type: "fill", uid: "@34", text: "Play" });
  await cli.dispatch({ type: "press", key: "Enter" });
  await cli.dispatch({ type: "scroll", dir: "down" });
  await cli.dispatch({ type: "wait", ms: 250, text: "let animation settle" });

  assert.deepEqual(commands, [
    ["click", "@12"],
    ["fill", "@34", "Play"],
    ["press", "Enter"],
    ["scroll", "down"],
    ["wait", "250", "let animation settle"],
  ]);
});

test("screenshot requires an output path", async () => {
  const cli = new AgentBrowser({
    runner: async () => ({
      stdout: "ok",
      stderr: "",
    }),
  });

  await assert.rejects(() => cli.screenshot(""), /output path/i);
});

test("PlayerActionSchema parses every supported evaluator verb", () => {
  const actions = [
    { type: "click", uid: "@1" },
    { type: "fill", uid: "@2", text: "Play" },
    { type: "type", text: "Aggro" },
    { type: "press", key: "Enter" },
    { type: "scroll", dir: "down" },
    { type: "wait", ms: 250, text: "let animation settle" },
    { type: "done", note: "encounter started" },
    { type: "blocked", note: "no visible start control" },
  ];

  const parsed = actions.map((action) => PlayerActionSchema.parse(action));

  assert.deepEqual(parsed, actions);
});

test("PlayerActionSchema rejects unsupported verbs", () => {
  assert.throws(
    () =>
      PlayerActionSchema.parse({
        type: "drag",
        uid: "@4",
      }),
    /invalid discriminator value/i,
  );
});

test("OpenCodePlayer uses the pinned model with skipped permissions", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const player = new OpenCodePlayer({
    model: "openai/gpt-5.4",
    run: async ({ command, args }: { command: string; args: string[] }) => {
      calls.push({ command, args });

      return {
        stdout: `${JSON.stringify({
          type: "text",
          part: {
            type: "text",
            text: JSON.stringify({ type: "done", note: "complete" }),
            metadata: {
              openai: {
                phase: "final_answer",
              },
            },
          },
        })}\n`,
        stderr: "",
      };
    },
  });

  const action = await player.nextAction({
    subGoal: "Finish the turn",
    snapshot: "Visible board",
    screenshot: "ignored",
    screenshotPath: "/tmp/shot.png",
    consoleErrors: [],
    history: [],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "opencode");
  assert.deepEqual(calls[0]?.args.slice(0, 6), [
    "run",
    "--model",
    "openai/gpt-5.4",
    "--dangerously-skip-permissions",
    "--format",
    "json",
  ]);
  assert.equal(typeof calls[0]?.args[6], "string");
  assert.equal(action.type, "done");
});

test("defineScenario returns the scenario shape with optional setup", () => {
  const scenario = defineScenario({
    goal: "Start an encounter from the home page",
    setup: async ({ open }) => {
      await open("http://localhost:4173");
    },
    stepCap: 12,
    checkOutcome: ({ finalSnapshot }) =>
      finalSnapshot.includes("Encounter")
        ? { passed: true, rationale: "Encounter affordance is visible." }
        : { passed: false, rationale: "Could not find encounter UI." },
  });

  assert.equal(scenario.goal, "Start an encounter from the home page");
  assert.equal(scenario.stepCap, 12);
  assert.equal(typeof scenario.setup, "function");

  assert.deepEqual(
    scenario.checkOutcome({
      finalSnapshot: "Encounter ready",
      consoleErrors: [],
      history: [],
    }),
    {
      passed: true,
      rationale: "Encounter affordance is visible.",
    },
  );
});

test("defineScenario rejects blank goals and non-positive step caps", () => {
  assert.throws(
    () =>
      defineScenario({
        goal: "   ",
        stepCap: 3,
        checkOutcome: () => ({
          passed: true,
          rationale: "ok",
        }),
      }),
    /goal/i,
  );

  assert.throws(
    () =>
      defineScenario({
        goal: "Load the game",
        stepCap: 0,
        checkOutcome: () => ({
          passed: true,
          rationale: "ok",
        }),
      }),
    /step cap/i,
  );
});

test("runPlayerLoop feeds snapshot state into the player and stops on done", async () => {
  const playerCalls: Array<{
    subGoal: string;
    snapshot: string;
    screenshot: string;
    screenshotPath: string;
    consoleErrors: string[];
    history: Array<{ type: string }>;
  }> = [];
  const dispatched: string[] = [];
  let snapshotCount = 0;
  const errorReads = ["error-1", "error-2"];

  const result = await runPlayerLoop({
    subGoal: "Start a game",
    stepCap: 3,
    browser: {
      async snapshot() {
        snapshotCount += 1;
        return `snapshot-${snapshotCount}`;
      },
      async screenshot(outputPath) {
        return `captured:${outputPath}`;
      },
      async errors() {
        return errorReads.shift() ?? "";
      },
      async dispatch(action) {
        dispatched.push(action.type);
        return action.type;
      },
    },
    player: {
      async nextAction(input) {
        playerCalls.push({
          subGoal: input.subGoal,
          snapshot: input.snapshot,
          screenshot: input.screenshot,
          screenshotPath: input.screenshotPath,
          consoleErrors: input.consoleErrors,
          history: input.history.map((action) => ({ type: action.type })),
        });

        return playerCalls.length === 1
          ? { type: "click", uid: "@start" }
          : { type: "done", note: "encounter launched" };
      },
    },
    createScreenshotPath(step) {
      return `/tmp/step-${step}.png`;
    },
  });

  assert.deepEqual(dispatched, ["click"]);
  assert.deepEqual(playerCalls, [
    {
      subGoal: "Start a game",
      snapshot: "snapshot-1",
      screenshot: "captured:/tmp/step-1.png",
      screenshotPath: "/tmp/step-1.png",
      consoleErrors: ["error-1"],
      history: [],
    },
    {
      subGoal: "Start a game",
      snapshot: "snapshot-2",
      screenshot: "captured:/tmp/step-2.png",
      screenshotPath: "/tmp/step-2.png",
      consoleErrors: ["error-2"],
      history: [{ type: "click" }],
    },
  ]);
  assert.deepEqual(result.history, [
    { type: "click", uid: "@start" },
    { type: "done", note: "encounter launched" },
  ]);
  assert.equal(result.terminalAction?.type, "done");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1]?.dispatched, false);
});

test("runPlayerLoop retries transient CDP failures on screenshot", async () => {
  let screenshotAttempts = 0;

  const result = await runPlayerLoop({
    subGoal: "Start a game",
    stepCap: 1,
    browser: {
      async snapshot() {
        return "snapshot-1";
      },
      async screenshot(outputPath) {
        screenshotAttempts += 1;

        if (screenshotAttempts === 1) {
          throw new Error(
            "agent-browser exited with code 1: CDP command timed out: Page.captureScreenshot",
          );
        }

        return `captured:${outputPath}`;
      },
      async errors() {
        return "";
      },
      async dispatch(action) {
        return action.type;
      },
    },
    player: {
      async nextAction() {
        return { type: "done", note: "ok" };
      },
    },
    createScreenshotPath(step) {
      return `/tmp/retry-step-${step}.png`;
    },
  });

  assert.equal(screenshotAttempts, 2);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.screenshot, "captured:/tmp/retry-step-1.png");
});

test("runPlayerLoop rethrows a non-transient browser error without retrying", async () => {
  let screenshotAttempts = 0;

  await assert.rejects(
    () =>
      runPlayerLoop({
        subGoal: "Start a game",
        stepCap: 1,
        browser: {
          async snapshot() {
            return "snapshot-1";
          },
          async screenshot() {
            screenshotAttempts += 1;
            throw new Error("agent-browser binary not found");
          },
          async errors() {
            return "";
          },
          async dispatch(action) {
            return action.type;
          },
        },
        player: {
          async nextAction() {
            return { type: "done", note: "ok" };
          },
        },
        createScreenshotPath(step) {
          return `/tmp/no-retry-step-${step}.png`;
        },
      }),
    /agent-browser binary not found/,
  );

  assert.equal(screenshotAttempts, 1);
});

test("runPlayerLoop creates the screenshot parent directory before each capture", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "org-bench-screenshot-parent-"));
  const screenshotPath = join(
    tempDir,
    "deep",
    "nested",
    "scenario",
    "shot.png",
  );
  const screenshotCalls: string[] = [];
  const parentDirsAtCall: boolean[] = [];

  await runPlayerLoop({
    subGoal: "capture",
    stepCap: 1,
    browser: {
      async snapshot() {
        return "snap";
      },
      async screenshot(path) {
        screenshotCalls.push(path);
        parentDirsAtCall.push(
          await access(join(path, "..")).then(
            () => true,
            () => false,
          ),
        );
        return "captured";
      },
      async errors() {
        return "";
      },
      async dispatch() {
        return "ok";
      },
    },
    player: {
      async nextAction() {
        return { type: "done", note: "captured" };
      },
    },
    createScreenshotPath() {
      return screenshotPath;
    },
  });

  assert.deepEqual(screenshotCalls, [screenshotPath]);
  assert.deepEqual(parentDirsAtCall, [true]);
});

test("runPlayerLoop treats empty agent-browser errors output as no errors", async () => {
  const playerConsoleErrors: string[][] = [];

  const result = await runPlayerLoop({
    subGoal: "Confirm the site loads cleanly",
    stepCap: 1,
    browser: {
      async snapshot() {
        return "Rendered home screen";
      },
      async screenshot(outputPath) {
        return `captured:${outputPath}`;
      },
      async errors() {
        return "";
      },
      async dispatch() {
        return "ok";
      },
    },
    player: {
      async nextAction(input) {
        playerConsoleErrors.push(input.consoleErrors);
        return { type: "done", note: "page rendered successfully" };
      },
    },
    createScreenshotPath(step) {
      return `/tmp/step-${step}.png`;
    },
  });

  assert.deepEqual(playerConsoleErrors, [[]]);
  assert.deepEqual(result.steps[0]?.consoleErrors, []);
});

test("evaluatorScenarios covers the seven PRD evaluator checks", () => {
  assert.deepEqual(
    evaluatorScenarios.map((scenario) => scenario.id),
    [
      "loads-cleanly",
      "navigates",
      "starts-a-game",
      "completes-a-turn",
      "finishes-an-encounter",
      "persists",
      "rules-informative",
    ],
  );

  assert.equal(evaluatorScenarios.length, 7);
  assert.equal(
    evaluatorScenarios.every((scenario) => scenario.stepCap > 0),
    true,
  );
  assert.equal(
    typeof evaluatorScenarios.find((scenario) => scenario.id === "persists")
      ?.setup,
    "function",
  );
});

test("scenario outcome checks reflect their intended success signals", async () => {
  const loadsCleanly = evaluatorScenarios.find(
    (scenario) => scenario.id === "loads-cleanly",
  );
  const navigates = evaluatorScenarios.find(
    (scenario) => scenario.id === "navigates",
  );
  const persists = evaluatorScenarios.find(
    (scenario) => scenario.id === "persists",
  );

  assert.ok(loadsCleanly);
  assert.ok(navigates);
  assert.ok(persists);

  await assert.rejects(
    () =>
      Promise.resolve(
        loadsCleanly.checkOutcome({
          finalSnapshot: "Home Play Rules Gallery",
          consoleErrors: ["Uncaught Error: boom"],
          history: [],
        }),
      ),
    /console errors/i,
  );

  assert.deepEqual(
    await navigates.checkOutcome({
      finalSnapshot:
        "Home page with visible Play, Rules, and Card Gallery links",
      consoleErrors: [],
      history: [],
    }),
    {
      passed: true,
      rationale:
        "Visible navigation reaches play, rules, and card gallery surfaces.",
    },
  );

  assert.equal(
    (
      await persists.checkOutcome({
        finalSnapshot:
          "Resume saved match with battlefield, hand, and enemy HP visible",
        consoleErrors: [],
        history: [
          { type: "done", note: "Reloaded and the resume affordance appeared" },
        ],
      })
    ).passed,
    true,
  );
});

test("evaluateScenarioAttempts runs three attempts and passes on majority success", async () => {
  const attemptNumbers: number[] = [];

  const result = await evaluateScenarioAttempts({
    scenario: evaluatorScenarios[0],
    runAttempt: async ({ attempt }) => {
      attemptNumbers.push(attempt);

      return attempt === 2
        ? {
            passed: false,
            rationale: "One attempt hit a transient failure.",
          }
        : {
            passed: true,
            rationale: `Attempt ${attempt} reached the goal.`,
          };
    },
  });

  assert.deepEqual(attemptNumbers, [1, 2, 3]);
  assert.equal(result.attempts.length, 3);
  assert.equal(result.passed, true);
  assert.equal(result.passedAttempts, 2);
  assert.equal(result.failedAttempts, 1);
});

test("evaluateScenarioAttempts fails when fewer than two of three attempts pass", async () => {
  const result = await evaluateScenarioAttempts({
    scenario: evaluatorScenarios[1],
    runAttempt: async ({ attempt }) => ({
      passed: attempt === 1,
      rationale: `Attempt ${attempt}`,
    }),
  });

  assert.equal(result.passed, false);
  assert.equal(result.passedAttempts, 1);
  assert.equal(result.failedAttempts, 2);
});

test("writeEvaluatorStepRecords writes validated JSONL records per scenario", async () => {
  const trajectoryDir = await mkdtemp(join(tmpdir(), "org-bench-evaluator-"));

  const outputPath = await writeEvaluatorStepRecords({
    trajectoryDir,
    runId: "solo-seed-01",
    scenario: "loads-cleanly",
    attempt: 2,
    goal: "Open the site and confirm it renders without console errors.",
    model: "openai/gpt-5.4",
    steps: [
      {
        step: 1,
        startedAt: "2026-04-16T12:00:00.000Z",
        snapshotBeforeRef: "blobs/snapshots/before-1.json",
        action: { type: "click", uid: "@play" },
        snapshotAfterRef: "blobs/snapshots/after-1.json",
        consoleErrors: [],
        tokens: { in: 120, out: 35 },
        latencyMs: 1800,
        costUsd: 0.012,
      },
      {
        step: 2,
        startedAt: "2026-04-16T12:00:02.000Z",
        snapshotBeforeRef: "blobs/snapshots/before-2.json",
        action: { type: "done", note: "page loaded" },
        snapshotAfterRef: "blobs/snapshots/after-2.json",
        consoleErrors: [],
        tokens: { in: 90, out: 12 },
        latencyMs: 900,
        costUsd: 0.006,
      },
    ],
  });

  assert.equal(
    outputPath,
    join(trajectoryDir, "evaluator", "loads-cleanly.jsonl"),
  );

  const jsonl = await readFile(outputPath, "utf8");
  const records = jsonl
    .trim()
    .split("\n")
    .map((line) => EvaluatorStepRecord.parse(JSON.parse(line)));

  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    run_id: "solo-seed-01",
    scenario: "loads-cleanly",
    attempt: 2,
    step: 1,
    schema_version: SCHEMA_VERSION,
    ts: "2026-04-16T12:00:00.000Z",
    goal: "Open the site and confirm it renders without console errors.",
    snapshot_before_ref: "blobs/snapshots/before-1.json",
    action: { type: "click", uid: "@play" },
    snapshot_after_ref: "blobs/snapshots/after-1.json",
    console_errors: [],
    tokens: { in: 120, out: 35 },
    model: "openai/gpt-5.4",
    latency_ms: 1800,
    cost_usd: 0.012,
  });
});

test("evaluateArtifact runs standalone evaluation against a built artifact directory", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "org-bench-artifact-"));
  await writeFile(
    join(artifactDir, "index.html"),
    "<html>artifact</html>",
    "utf8",
  );
  const servedRoots: string[] = [];
  const browserCalls: string[] = [];
  const attemptCalls: number[] = [];

  const result = await evaluateArtifact({
    artifactDir,
    runId: "solo-seed-01",
    scenarios: [
      {
        id: "loads-cleanly",
        goal: "Open the site and confirm it renders.",
        stepCap: 2,
        checkOutcome: ({ history }) => ({
          passed: history.some((action) => action.type === "done"),
          rationale: "The player reached a terminal success state.",
        }),
      },
    ],
    createServer: async ({ rootDir }) => {
      servedRoots.push(rootDir);

      return {
        url: "http://127.0.0.1:4173",
        async close() {
          browserCalls.push("server:close");
        },
      };
    },
    browser: {
      async close() {
        browserCalls.push("browser:close");
      },
      async open(url) {
        browserCalls.push(`browser:open:${url}`);
        return url;
      },
      async snapshot() {
        return "Rendered home screen";
      },
      async screenshot(outputPath) {
        return `screenshot:${outputPath}`;
      },
      async errors() {
        return "";
      },
      async dispatch() {
        return "ok";
      },
    },
    player: {
      async nextAction({ history }) {
        return history.length === 0
          ? { type: "wait", ms: 50, text: "let page settle" }
          : { type: "done", note: "page rendered successfully" };
      },
    },
    now: () => "2026-04-16T13:00:00.000Z",
    createLatencyMs: () => 250,
    createCostUsd: () => 0.002,
    model: "openai/gpt-5.4",
    onAttemptStart(attempt) {
      attemptCalls.push(attempt);
    },
  });

  assert.deepEqual(servedRoots, [artifactDir]);
  assert.deepEqual(attemptCalls, [1, 2, 3]);
  assert.deepEqual(browserCalls, [
    "browser:close",
    "browser:open:http://127.0.0.1:4173",
    "browser:open:http://127.0.0.1:4173",
    "browser:open:http://127.0.0.1:4173",
    "browser:close",
    "server:close",
  ]);
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0]?.passed, true);

  const outputPath = join(
    artifactDir,
    "trajectory",
    "evaluator",
    "loads-cleanly.jsonl",
  );
  const jsonl = await readFile(outputPath, "utf8");
  const records = jsonl
    .trim()
    .split("\n")
    .map((line) => EvaluatorStepRecord.parse(JSON.parse(line)));

  assert.equal(records.length, 6);
  assert.equal(records[0]?.attempt, 1);
  assert.equal(records[5]?.attempt, 3);
});

test("evaluateArtifact keeps standalone reruns out of the artifact trajectory by default", async () => {
  const artifactDir = await mkdtemp(
    join(tmpdir(), "org-bench-artifact-standalone-"),
  );
  await writeFile(
    join(artifactDir, "index.html"),
    "<html>artifact</html>",
    "utf8",
  );

  const result = await evaluateArtifact({
    artifactDir,
    scenarios: [
      {
        id: "loads-cleanly",
        goal: "Open the site and confirm it renders.",
        stepCap: 1,
        checkOutcome: () => ({
          passed: true,
          rationale: "The player reached a terminal success state.",
        }),
      },
    ],
    createServer: async () => ({
      url: "http://127.0.0.1:4173",
      async close() {},
    }),
    browser: {
      async close() {},
      async open(url) {
        return url;
      },
      async snapshot() {
        return "Rendered home screen";
      },
      async screenshot(outputPath) {
        return `screenshot:${outputPath}`;
      },
      async errors() {
        return "";
      },
      async dispatch() {
        return "ok";
      },
    },
    player: {
      async nextAction() {
        return { type: "done", note: "page rendered successfully" };
      },
    },
  });

  await assert.rejects(access(join(artifactDir, "trajectory")));
  assert.notEqual(result.trajectoryDir, join(artifactDir, "trajectory"));

  const jsonl = await readFile(
    join(result.trajectoryDir, "evaluator", "loads-cleanly.jsonl"),
    "utf8",
  );
  const records = jsonl
    .trim()
    .split("\n")
    .map((line) => EvaluatorStepRecord.parse(JSON.parse(line)));

  assert.equal(records.length, 3);
  assert.equal(records[0]?.run_id, "standalone-evaluate");
});

test("evaluateArtifact records a failed scenario instead of throwing when checkOutcome raises", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "org-bench-artifact-fail-"));
  await writeFile(
    join(artifactDir, "index.html"),
    "<html>artifact</html>",
    "utf8",
  );

  const result = await evaluateArtifact({
    artifactDir,
    runId: "solo-seed-01",
    scenarios: [
      {
        id: "loads-cleanly",
        goal: "Open the site and confirm it renders.",
        stepCap: 1,
        checkOutcome: () => {
          throw new Error("The page emitted console errors.");
        },
      },
    ],
    createServer: async () => ({
      url: "http://127.0.0.1:4173",
      async close() {},
    }),
    browser: {
      async close() {},
      async open(url) {
        return url;
      },
      async snapshot() {
        return "Rendered home screen";
      },
      async screenshot(outputPath) {
        return `screenshot:${outputPath}`;
      },
      async errors() {
        return "";
      },
      async dispatch() {
        return "ok";
      },
    },
    player: {
      async nextAction() {
        return { type: "done", note: "console errors were observed" };
      },
    },
  });

  assert.deepEqual(result.scenarios, [
    {
      id: "loads-cleanly",
      passed: false,
      passedAttempts: 0,
      failedAttempts: 3,
      attempts: [
        {
          attempt: 1,
          passed: false,
          rationale: "The page emitted console errors.",
        },
        {
          attempt: 2,
          passed: false,
          rationale: "The page emitted console errors.",
        },
        {
          attempt: 3,
          passed: false,
          rationale: "The page emitted console errors.",
        },
      ],
    },
  ]);
});
