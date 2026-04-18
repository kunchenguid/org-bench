import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { ArtifactJudgeOutput, SCHEMA_VERSION } from "@org-bench/schemas";

import { artifactJudgePrompt } from "./prompts/index.js";

export { artifactJudgePrompt };

export type JudgeStaticServer = {
  url: string;
  close: () => Promise<void>;
};

export type OpenCodeJsonSchema = {
  type: "object";
  additionalProperties?: boolean;
  properties?: Record<string, unknown>;
  required?: string[];
};

export type OpenCodeStructuredPromptSender = <TStructured>(input: {
  baseUrl: string;
  sessionId: string;
  prompt: string;
  schema: OpenCodeJsonSchema;
  signal?: AbortSignal;
}) => Promise<{
  finalText: string | null;
  structured: TStructured | null;
  tokens: { in: number; out: number };
}>;

export type JudgeOpenCodeClient = {
  baseUrl: string;
  sessionId?: string;
  createSession?: (input: {
    baseUrl: string;
    directory: string;
  }) => Promise<{ id: string }>;
  sendPrompt: OpenCodeStructuredPromptSender;
  deleteSession?: (input: {
    baseUrl: string;
    sessionId: string;
  }) => Promise<boolean>;
};

export type RunArtifactJudgeInput = {
  runId: string;
  artifactDir: string;
  model: string;
  agentBrowserSession: string;
  openCodeClient: JudgeOpenCodeClient;
  createServer?: (input: { rootDir: string }) => Promise<JudgeStaticServer>;
  signal?: AbortSignal;
};

type JudgeModelOutput = {
  rubric: {
    functional_completeness: number;
    learnability: number;
    visual_cohesion: number;
    visual_polish: number;
    state_legibility: number;
    aesthetics: number;
    interaction_feel: number;
    practical_utility: number;
  };
  rationale: string;
};

export async function runArtifactJudge({
  runId,
  artifactDir,
  model,
  agentBrowserSession,
  openCodeClient,
  createServer = createStaticServer,
  signal,
}: RunArtifactJudgeInput): Promise<ArtifactJudgeOutput> {
  const resolvedArtifactDir = resolve(artifactDir);
  await stat(join(resolvedArtifactDir, "index.html"));

  const server = await createServer({ rootDir: resolvedArtifactDir });

  const useExistingSession = openCodeClient.sessionId !== undefined;
  const createSession = openCodeClient.createSession;
  const deleteSession = openCodeClient.deleteSession;

  let sessionId = openCodeClient.sessionId;
  let ownedSession = false;

  try {
    if (!useExistingSession) {
      if (!createSession) {
        throw new Error(
          "runArtifactJudge: openCodeClient.createSession is required when no sessionId is provided",
        );
      }

      const session = await createSession({
        baseUrl: openCodeClient.baseUrl,
        directory: resolvedArtifactDir,
      });
      sessionId = session.id;
      ownedSession = true;
    }

    if (sessionId === undefined) {
      throw new Error("runArtifactJudge: no session id available");
    }

    const judgePrompt = buildJudgePrompt({
      system: artifactJudgePrompt.system,
      artifactUrl: server.url,
      artifactDir: resolvedArtifactDir,
      agentBrowserSession,
    });

    const response = await openCodeClient.sendPrompt<JudgeModelOutput>({
      baseUrl: openCodeClient.baseUrl,
      sessionId,
      prompt: judgePrompt,
      schema: artifactJudgeOutputJsonSchema(),
      signal,
    });

    const output =
      response.structured ?? parseJudgeModelOutput(response.finalText ?? "");

    return ArtifactJudgeOutput.parse({
      run_id: runId,
      schema_version: SCHEMA_VERSION,
      rubric: output.rubric,
      rationale: output.rationale,
      model,
      tokens: response.tokens,
      cost_usd: 0,
    });
  } finally {
    if (ownedSession && sessionId !== undefined && deleteSession) {
      await deleteSession({
        baseUrl: openCodeClient.baseUrl,
        sessionId,
      }).catch(() => undefined);
    }

    await server.close().catch(() => undefined);
  }
}

function artifactJudgeOutputJsonSchema(): OpenCodeJsonSchema & {
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
          functional_completeness: { type: "number" },
          learnability: { type: "number" },
          visual_cohesion: { type: "number" },
          visual_polish: { type: "number" },
          state_legibility: { type: "number" },
          aesthetics: { type: "number" },
          interaction_feel: { type: "number" },
          practical_utility: { type: "number" },
        },
        required: [
          "functional_completeness",
          "learnability",
          "visual_cohesion",
          "visual_polish",
          "state_legibility",
          "aesthetics",
          "interaction_feel",
          "practical_utility",
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

function buildJudgePrompt({
  system,
  artifactUrl,
  artifactDir,
  agentBrowserSession,
}: {
  system: string;
  artifactUrl: string;
  artifactDir: string;
  agentBrowserSession: string;
}): string {
  return [
    system,
    `The artifact is being served at: ${artifactUrl}`,
    `Its source files are available on disk at: ${artifactDir} (same directory this session was opened in).`,
    `The agent-browser session you control is named "${agentBrowserSession}". That session name is already exported as AGENT_BROWSER_SESSION in the shell environment of this session, so every invocation of agent-browser will automatically use it - do not set it yourself.`,
    [
      "You drive a real browser via the agent-browser CLI through the bash tool.",
      "Use these commands to interact with the artifact:",
      "  agent-browser open <url>              # navigate",
      "  agent-browser snapshot                # dump a queryable DOM/canvas snapshot",
      "  agent-browser click <uid>             # click the element by its snapshot uid",
      "  agent-browser fill <uid> <text>       # fill a form field by uid",
      "  agent-browser type <text>             # type text into the focused element",
      "  agent-browser press <key>             # press a key (Enter, Tab, ArrowDown, Escape, etc.)",
      "  agent-browser scroll up|down|left|right",
      "  agent-browser wait [ms] [text]",
      "  agent-browser errors                  # read uncaught console errors",
      "  agent-browser screenshot <path>       # save a PNG for yourself to inspect",
      "  agent-browser close                   # teardown between runs if needed",
      "",
      "Call these through bash. Run one command at a time, read its output, then decide the next action. Take your time; the quality of the judgment matters more than speed.",
    ].join("\n"),
    [
      "Exercise the artifact before scoring. At a minimum:",
      "1. Open the artifact URL and take a snapshot. Confirm the grid is visible and no console errors appear on load.",
      "2. Click a cell, type a number, press Enter. Confirm the value appears and the selection advanced.",
      "3. Type numbers into several cells (e.g. A1=10, A2=20, A3=30), then put formulas that exercise each function family: e.g. B1=`=SUM(A1:A3)`, B2=`=AVERAGE(A1:A3)`, B3=`=IF(A1>5,\"big\",\"small\")`, B4=`=CONCAT(\"total=\",SUM(A1:A3))`, B5=`=ROUND(A1/3,2)`. Confirm each evaluates correctly.",
      "4. Change a precedent cell (e.g. update A1) and confirm every dependent cell recomputes.",
      "5. Test relative vs absolute references: put `=A1` in C1, then copy C1 and paste into C2. Confirm C2 now reads `=A2` (relative shift). Put `=$A$1` in D1, copy to D2, confirm D2 still reads `=$A$1`.",
      "6. Test range selection: click A1, shift-click A3 or drag to select A1:A3, then press Delete. Confirm all three cells clear.",
      "7. Test clipboard on a range: put values in A1:A3, select them, Cmd/Ctrl+C, click B1, Cmd/Ctrl+V. Confirm B1:B3 now hold the same values.",
      "8. Test undo/redo: after the paste above, press Cmd/Ctrl+Z and confirm B1:B3 return to empty. Press Cmd/Ctrl+Shift+Z (or Cmd/Ctrl+Y) and confirm the paste is restored.",
      "9. Test insert/delete row or column: insert a new row above a block of data that has a formula pointing into it, and confirm the formula still points at the same data. Delete a row a formula depends on and confirm the formula renders `#REF!` instead of crashing.",
      "10. Try an illegal formula (e.g. `=1/0` or a circular reference like A1=`=B1`, B1=`=A1`). Confirm the error renders as a cell marker, not a crash.",
      "11. Reload the page (agent-browser open <same url>) and confirm the cell contents persist.",
      "",
      "Investigate more than this if something feels broken or unusual. You can also read source files under the artifact directory if you need to understand an unexpected behavior.",
    ].join("\n"),
    [
      "When you finish testing, output the rubric + rationale JSON.",
      "Reply with only valid JSON. Do not wrap the JSON in markdown fences. Do not include any prose outside the JSON object.",
      'Return exactly this shape: {"rubric":{"functional_completeness":1,"learnability":1,"visual_cohesion":1,"visual_polish":1,"state_legibility":1,"aesthetics":1,"interaction_feel":1,"practical_utility":1},"rationale":"..."}.',
      "Scores are integers 1-5. The rationale should be concise but cite specific observations from what you saw (snapshot text, computed values, errors), not generalities.",
    ].join("\n"),
  ].join("\n\n");
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export async function createStaticServer({
  rootDir,
}: {
  rootDir: string;
}): Promise<JudgeStaticServer> {
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
