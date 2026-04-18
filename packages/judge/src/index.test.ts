import assert from "node:assert/strict";
import test from "node:test";

import { SCHEMA_VERSION } from "@org-bench/schemas";

import {
  artifactJudgePromptV1,
  loadJudgePrompt,
  runArtifactJudge,
} from "./index.js";

test("loads the artifact judge v1 prompt with the full rubric", () => {
  assert.equal(artifactJudgePromptV1.version, "artifact-judge.v1");
  assert.equal(loadJudgePrompt("artifact-judge.v1"), artifactJudgePromptV1);

  for (const rubricItem of [
    "gameplay_completeness",
    "learnability",
    "content_cohesion",
    "visual_polish",
    "state_legibility",
  ]) {
    assert.match(artifactJudgePromptV1.system, new RegExp(rubricItem, "i"));
  }
});

test("rejects unknown judge prompt versions", () => {
  assert.throws(
    () => loadJudgePrompt("artifact-judge.v9"),
    /Unknown judge prompt version/,
  );
});

test("runs the artifact judge through OpenCode JSON mode and stamps prompt metadata", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    cwd?: string;
  }> = [];

  const result = await runArtifactJudge({
    runId: "solo",
    cwd: "/tmp/judge-run",
    artifactSummary: "Rendered site and evaluator evidence.",
    model: "openai/gpt-5.4",
    runner: async ({ command, args, cwd }) => {
      calls.push({ command, args, cwd });

      return {
        stdout: [
          JSON.stringify({
            type: "text",
            part: {
              type: "text",
              text: "Preparing the rubric.",
              metadata: { openai: { phase: "commentary" } },
            },
          }),
          JSON.stringify({
            type: "text",
            part: {
              type: "text",
              text: JSON.stringify({
                rubric: {
                  gameplay_completeness: 4,
                  learnability: 5,
                  content_cohesion: 4,
                  visual_polish: 3,
                  state_legibility: 4,
                },
                rationale: "The game is playable and coherent.",
              }),
              metadata: { openai: { phase: "final_answer" } },
            },
          }),
          JSON.stringify({
            type: "step_finish",
            part: {
              tokens: {
                input: 123,
                output: 45,
              },
            },
          }),
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "opencode");
  assert.deepEqual(calls[0]?.args.slice(0, 3), ["run", "--format", "json"]);
  assert.equal(calls[0]?.cwd, "/tmp/judge-run");
  assert.match(calls[0]?.args[3] ?? "", /reply with only valid json/i);
  assert.match(calls[0]?.args[3] ?? "", /gameplay_completeness/i);

  assert.deepEqual(result, {
    run_id: "solo",
    schema_version: SCHEMA_VERSION,
    prompt_version: "artifact-judge.v1",
    rubric: {
      gameplay_completeness: 4,
      learnability: 5,
      content_cohesion: 4,
      visual_polish: 3,
      state_legibility: 4,
    },
    rationale: "The game is playable and coherent.",
    model: "openai/gpt-5.4",
    tokens: {
      in: 123,
      out: 45,
    },
    cost_usd: 0,
  });
});

test("runArtifactJudge can reuse an OpenCode serve session with structured output", async () => {
  let shellRunnerCalled = false;
  const prompts: string[] = [];
  const structuredOutput = {
    rubric: {
      gameplay_completeness: 5,
      learnability: 4,
      content_cohesion: 4,
      visual_polish: 3,
      state_legibility: 5,
    },
    rationale: "The artifact is cohesive and easy to read at a glance.",
  };

  const result = await runArtifactJudge({
    runId: "solo",
    cwd: "/tmp/judge-run",
    artifactSummary: "Rendered site and evaluator evidence.",
    model: "openai/gpt-5.4",
    runner: async () => {
      shellRunnerCalled = true;

      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
      };
    },
    openCodeClient: {
      baseUrl: "http://127.0.0.1:4321",
      sessionId: "session-judge-123",
      sendPrompt: async <TStructured>({ prompt }: { prompt: string }) => {
        prompts.push(prompt);

        return {
          response: {
            info: {
              structured: structuredOutput,
            },
          },
          finalText: null,
          structured: structuredOutput as TStructured,
          tokens: {
            in: 51,
            out: 19,
          },
        };
      },
    },
  });

  assert.equal(shellRunnerCalled, false);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /artifact summary:/i);
  assert.deepEqual(result, {
    run_id: "solo",
    schema_version: SCHEMA_VERSION,
    prompt_version: "artifact-judge.v1",
    ...structuredOutput,
    model: "openai/gpt-5.4",
    tokens: {
      in: 51,
      out: 19,
    },
    cost_usd: 0,
  });
});
