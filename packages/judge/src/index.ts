import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ArtifactJudgeOutput, SCHEMA_VERSION } from "@org-bench/schemas";

import { artifactJudgePromptV1 } from "./prompts/index.js";

const execFileAsync = promisify(execFile);

const judgePrompts = {
  [artifactJudgePromptV1.version]: artifactJudgePromptV1,
} as const;

export { artifactJudgePromptV1 };

export type JudgePromptVersion = keyof typeof judgePrompts;

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CommandRunner = (input: {
  command: string;
  args: string[];
  cwd?: string;
}) => Promise<CommandResult>;

export type RunArtifactJudgeInput = {
  runId: string;
  cwd?: string;
  artifactSummary: string;
  model: string;
  runner?: CommandRunner;
  openCodeClient?: {
    baseUrl: string;
    sessionId?: string;
    createSession?: (input: {
      baseUrl: string;
      directory: string;
    }) => Promise<{ id: string }>;
    sendPrompt?: <TStructured>(input: {
      baseUrl: string;
      sessionId: string;
      prompt: string;
      schema: {
        type: "object";
        additionalProperties?: boolean;
        properties?: Record<string, unknown>;
        required?: string[];
      };
      signal?: AbortSignal;
    }) => Promise<{
      response: unknown;
      finalText: string | null;
      structured: TStructured | null;
      tokens: { in: number; out: number };
    }>;
    deleteSession?: (input: {
      baseUrl: string;
      sessionId: string;
    }) => Promise<boolean>;
  };
};

type JudgeModelOutput = {
  rubric: {
    gameplay_completeness: number;
    rules_clarity: number;
    content_cohesion: number;
    visual_polish: number;
    navigation: number;
    aesthetics?: number;
    gameplay_fun?: number;
    replayability?: number;
  };
  rationale: string;
};

export function loadJudgePrompt(version: string) {
  const prompt = judgePrompts[version as JudgePromptVersion];

  if (!prompt) {
    throw new Error(`Unknown judge prompt version: ${version}`);
  }

  return prompt;
}

export async function runArtifactJudge({
  runId,
  cwd,
  artifactSummary,
  model,
  runner = runCommand,
  openCodeClient,
}: RunArtifactJudgeInput) {
  const prompt = loadJudgePrompt(artifactJudgePromptV1.version);
  const judgePrompt = buildJudgePrompt(prompt.system, artifactSummary);

  if (openCodeClient) {
    const sendPrompt = openCodeClient.sendPrompt;

    if (!sendPrompt) {
      throw new Error("OpenCode judge client requires sendPrompt");
    }

    if (openCodeClient.sessionId) {
      const response = await sendPrompt<JudgeModelOutput>({
        baseUrl: openCodeClient.baseUrl,
        sessionId: openCodeClient.sessionId,
        prompt: judgePrompt,
        schema: artifactJudgeOutputJsonSchema(),
      });
      const output =
        response.structured ?? parseJudgeModelOutput(response.finalText ?? "");

      return ArtifactJudgeOutput.parse({
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: prompt.version,
        rubric: output.rubric,
        rationale: output.rationale,
        model,
        tokens: response.tokens,
        cost_usd: 0,
      });
    }

    const createSession = openCodeClient.createSession;
    const deleteSession = openCodeClient.deleteSession;

    if (!cwd || !createSession || !deleteSession) {
      throw new Error(
        "OpenCode judge client requires cwd, createSession, and deleteSession when no sessionId is provided",
      );
    }

    const session = await createSession({
      baseUrl: openCodeClient.baseUrl,
      directory: cwd,
    });

    try {
      const response = await sendPrompt<JudgeModelOutput>({
        baseUrl: openCodeClient.baseUrl,
        sessionId: session.id,
        prompt: judgePrompt,
        schema: artifactJudgeOutputJsonSchema(),
      });
      const output =
        response.structured ?? parseJudgeModelOutput(response.finalText ?? "");

      return ArtifactJudgeOutput.parse({
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        prompt_version: prompt.version,
        rubric: output.rubric,
        rationale: output.rationale,
        model,
        tokens: response.tokens,
        cost_usd: 0,
      });
    } finally {
      await deleteSession({
        baseUrl: openCodeClient.baseUrl,
        sessionId: session.id,
      }).catch(() => undefined);
    }
  }

  const result = await runner({
    command: "opencode",
    args: ["run", "--format", "json", judgePrompt],
    cwd,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr || `OpenCode exited with code ${result.exitCode}`,
    );
  }

  const parsed = parseOpenCodeResponse(result.stdout);
  const output = parseJudgeModelOutput(parsed.finalText);

  return ArtifactJudgeOutput.parse({
    run_id: runId,
    schema_version: SCHEMA_VERSION,
    prompt_version: prompt.version,
    rubric: output.rubric,
    rationale: output.rationale,
    model,
    tokens: parsed.tokens,
    cost_usd: 0,
  });
}

function artifactJudgeOutputJsonSchema(): {
  type: "object";
  additionalProperties: false;
  properties: Record<string, unknown>;
  required: string[];
} {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      rubric: {
        type: "object",
        additionalProperties: false,
        properties: {
          gameplay_completeness: { type: "number" },
          rules_clarity: { type: "number" },
          content_cohesion: { type: "number" },
          visual_polish: { type: "number" },
          navigation: { type: "number" },
          aesthetics: { type: "number" },
          gameplay_fun: { type: "number" },
          replayability: { type: "number" },
        },
        required: [
          "gameplay_completeness",
          "rules_clarity",
          "content_cohesion",
          "visual_polish",
          "navigation",
          "aesthetics",
          "gameplay_fun",
          "replayability",
        ],
      },
      rationale: { type: "string" },
    },
    required: ["rubric", "rationale"],
  };
}

function parseJudgeModelOutput(text: string): JudgeModelOutput {
  return JSON.parse(text) as JudgeModelOutput;
}

function buildJudgePrompt(
  systemPrompt: string,
  artifactSummary: string,
): string {
  return [
    systemPrompt,
    "Reply with only valid JSON.",
    "Do not wrap the JSON in markdown fences.",
    'Return exactly this shape: {"rubric":{"gameplay_completeness":1,"rules_clarity":1,"content_cohesion":1,"visual_polish":1,"navigation":1,"aesthetics":1,"gameplay_fun":1,"replayability":1},"rationale":"..."}.',
    "Artifact summary:",
    artifactSummary,
  ].join("\n\n");
}

async function runCommand({
  command,
  args,
  cwd,
}: {
  command: string;
  args: string[];
  cwd?: string;
}): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      message?: string;
    };

    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : Number.NaN,
    };
  }
}

function parseOpenCodeResponse(stdout: string): {
  finalText: string;
  tokens: { in: number; out: number };
} {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const textEvents: string[] = [];
  let finalText: string | undefined;
  let tokens = { in: 0, out: 0 };

  for (const line of lines) {
    const event = JSON.parse(line) as {
      type?: string;
      part?: {
        type?: string;
        text?: string;
        tokens?: {
          input?: number;
          output?: number;
        };
        metadata?: { openai?: { phase?: string } };
      };
      error?: { message?: string };
    };

    if (event.type === "error") {
      throw new Error(
        event.error?.message ?? "OpenCode returned an error event",
      );
    }

    if (event.type === "step_finish") {
      tokens = {
        in: event.part?.tokens?.input ?? 0,
        out: event.part?.tokens?.output ?? 0,
      };
      continue;
    }

    if (
      event.type === "text" &&
      event.part?.type === "text" &&
      event.part.text !== undefined
    ) {
      if (event.part.metadata?.openai?.phase === "final_answer") {
        finalText = event.part.text;
        continue;
      }

      textEvents.push(event.part.text);
    }
  }

  const resolvedFinalText = finalText ?? textEvents.at(-1);

  if (resolvedFinalText === undefined) {
    throw new Error("OpenCode did not emit a final text response");
  }

  return {
    finalText: resolvedFinalText,
    tokens,
  };
}
