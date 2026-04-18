import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { SCHEMA_VERSION, TrajectoryAnalysisOutput } from "@org-bench/schemas";

import { trajectoryAnalystPrompt } from "./prompts/index.js";

const execFileAsync = promisify(execFile);

export { trajectoryAnalystPrompt };

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

export type RunTrajectoryAnalystInput = {
  runId: string;
  cwd?: string;
  trajectorySummary: string;
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

type TrajectoryAnalystModelOutput = {
  narrative: string;
  observations: {
    edge_utilization: Array<{
      from: string;
      to: string;
      forward_messages: number;
      reverse_messages: number;
    }>;
    decomposition: {
      leader_direct_subtasks: number;
      max_delegation_depth: number;
    };
    idle_neighbors: Array<{
      from: string;
      to: string;
    }>;
    patch_churn: {
      superseded: number;
      reverted: number;
      rewritten: number;
    };
    incidents: Array<{
      kind: "brief_handoff" | "miscommunication" | "integration_failure";
      summary: string;
      refs: Array<{
        file: string;
        line: number;
      }>;
    }>;
  };
};

export async function runTrajectoryAnalyst({
  runId,
  cwd,
  trajectorySummary,
  model,
  runner = runCommand,
  openCodeClient,
}: RunTrajectoryAnalystInput) {
  const analystPrompt = buildAnalystPrompt(
    trajectoryAnalystPrompt.system,
    trajectorySummary,
  );

  if (openCodeClient) {
    const sendPrompt = openCodeClient.sendPrompt;

    if (!sendPrompt) {
      throw new Error("OpenCode analyst client requires sendPrompt");
    }

    if (openCodeClient.sessionId) {
      const response = await sendPrompt<TrajectoryAnalystModelOutput>({
        baseUrl: openCodeClient.baseUrl,
        sessionId: openCodeClient.sessionId,
        prompt: analystPrompt,
        schema: trajectoryAnalystOutputJsonSchema(),
      });
      const output =
        response.structured ??
        parseTrajectoryAnalystModelOutput(response.finalText ?? "");

      return TrajectoryAnalysisOutput.parse({
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        narrative: output.narrative,
        observations: output.observations,
        model,
        tokens: response.tokens,
        cost_usd: 0,
      });
    }

    const createSession = openCodeClient.createSession;
    const deleteSession = openCodeClient.deleteSession;

    if (!cwd || !createSession || !deleteSession) {
      throw new Error(
        "OpenCode analyst client requires cwd, createSession, and deleteSession when no sessionId is provided",
      );
    }

    const session = await createSession({
      baseUrl: openCodeClient.baseUrl,
      directory: cwd,
    });

    try {
      const response = await sendPrompt<TrajectoryAnalystModelOutput>({
        baseUrl: openCodeClient.baseUrl,
        sessionId: session.id,
        prompt: analystPrompt,
        schema: trajectoryAnalystOutputJsonSchema(),
      });
      const output =
        response.structured ??
        parseTrajectoryAnalystModelOutput(response.finalText ?? "");

      return TrajectoryAnalysisOutput.parse({
        run_id: runId,
        schema_version: SCHEMA_VERSION,
        narrative: output.narrative,
        observations: output.observations,
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
    args: ["run", "--format", "json", analystPrompt],
    cwd,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr || `OpenCode exited with code ${result.exitCode}`,
    );
  }

  const parsed = parseOpenCodeResponse(result.stdout);
  const output = parseTrajectoryAnalystModelOutput(parsed.finalText);

  return TrajectoryAnalysisOutput.parse({
    run_id: runId,
    schema_version: SCHEMA_VERSION,
    narrative: output.narrative,
    observations: output.observations,
    model,
    tokens: parsed.tokens,
    cost_usd: 0,
  });
}

function trajectoryAnalystOutputJsonSchema(): {
  type: "object";
  additionalProperties: false;
  properties: Record<string, unknown>;
  required: string[];
} {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      narrative: { type: "string" },
      observations: {
        type: "object",
        additionalProperties: false,
        properties: {
          edge_utilization: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                from: { type: "string" },
                to: { type: "string" },
                forward_messages: { type: "number" },
                reverse_messages: { type: "number" },
              },
              required: ["from", "to", "forward_messages", "reverse_messages"],
            },
          },
          decomposition: {
            type: "object",
            additionalProperties: false,
            properties: {
              leader_direct_subtasks: { type: "number" },
              max_delegation_depth: { type: "number" },
            },
            required: ["leader_direct_subtasks", "max_delegation_depth"],
          },
          idle_neighbors: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                from: { type: "string" },
                to: { type: "string" },
              },
              required: ["from", "to"],
            },
          },
          patch_churn: {
            type: "object",
            additionalProperties: false,
            properties: {
              superseded: { type: "number" },
              reverted: { type: "number" },
              rewritten: { type: "number" },
            },
            required: ["superseded", "reverted", "rewritten"],
          },
          incidents: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                kind: {
                  type: "string",
                  enum: [
                    "brief_handoff",
                    "miscommunication",
                    "integration_failure",
                  ],
                },
                summary: { type: "string" },
                refs: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      file: { type: "string" },
                      line: { type: "number" },
                    },
                    required: ["file", "line"],
                  },
                },
              },
              required: ["kind", "summary", "refs"],
            },
          },
        },
        required: [
          "edge_utilization",
          "decomposition",
          "idle_neighbors",
          "patch_churn",
          "incidents",
        ],
      },
    },
    required: ["narrative", "observations"],
  };
}

function parseTrajectoryAnalystModelOutput(
  text: string,
): TrajectoryAnalystModelOutput {
  return JSON.parse(text) as TrajectoryAnalystModelOutput;
}

function buildAnalystPrompt(
  systemPrompt: string,
  trajectorySummary: string,
): string {
  return [
    systemPrompt,
    "Reply with only valid JSON.",
    "Do not wrap the JSON in markdown fences.",
    'Return exactly this shape: {"narrative":"...","observations":{"edge_utilization":[],"decomposition":{"leader_direct_subtasks":0,"max_delegation_depth":0},"idle_neighbors":[],"patch_churn":{"superseded":0,"reverted":0,"rewritten":0},"incidents":[]}}.',
    "Trajectory summary:",
    trajectorySummary,
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
