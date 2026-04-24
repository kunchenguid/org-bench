import { spawn, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

export interface OpenCodeMessagePart {
  type?: string;
  text?: string;
  tool?: string;
  input?: string;
  status?: "success" | "error";
  duration_ms?: number;
  metadata?: {
    openai?: {
      phase?: string;
    };
  };
}

export interface OpenCodeTokens {
  input?: number;
  output?: number;
}

export interface OpenCodeMessageResponse {
  info?: {
    structured?: unknown;
    id?: string;
    role?: string;
    tokens?: OpenCodeTokens;
  };
  parts?: OpenCodeMessagePart[];
}

export interface OpenCodeSessionResponse {
  id: string;
}

export interface JsonSchemaFormat {
  type: "object";
  additionalProperties?: boolean;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface OpenCodeServeProcess {
  pid?: number;
  exitCode: number | null;
  stdout: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
  stderr: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
  on(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface OpenCodeServeHandle {
  baseUrl: string;
  child: OpenCodeServeProcess;
  closed: boolean;
  cwd: string;
  port: number;
  readyPromise: Promise<void>;
  stderr: string;
  stdout: string;
  pidFile?: string;
}

// Module-level registry of live opencode serve handles. This is what lets a
// signal handler in the bench CLI entry point cleanly kill every running child
// when the parent receives SIGINT/SIGTERM/uncaughtException. See `bench-cli.ts`
// for how this is wired up.
const liveOpenCodeServeHandles = new Set<OpenCodeServeHandle>();

export function __resetLiveOpenCodeServeRegistryForTests(): void {
  liveOpenCodeServeHandles.clear();
}

function tryUnlinkSync(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // best-effort: pidfile may already be gone
  }
}

export function shutdownAllOpenCodeServesSync(): void {
  const handles = Array.from(liveOpenCodeServeHandles);
  liveOpenCodeServeHandles.clear();
  for (const handle of handles) {
    if (!handle.closed && handle.child.exitCode === null) {
      try {
        handle.child.kill("SIGTERM");
      } catch {
        // child may already be dead
      }
    }
    handle.closed = true;
    if (handle.pidFile !== undefined) {
      tryUnlinkSync(handle.pidFile);
    }
  }
}

const BLANKET_PERMISSION_RULESET = [
  { permission: "*", pattern: "*", action: "allow" },
] as const;

function sanitizeOpenCodeServeEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const nextEnv = { ...env };
  delete nextEnv.OPENCODE_SERVER_USERNAME;
  delete nextEnv.OPENCODE_SERVER_PASSWORD;
  // Strip provider env vars we do not want opencode to auto-load. The run
  // config pins exactly one model (e.g. openai/gpt-5.4); leaking extra
  // provider keys would let opencode fall back to an alternate provider if
  // the pinned one fails auth, which silently changes which model executes
  // the benchmark.
  delete nextEnv.OPENROUTER_API_KEY;
  return nextEnv;
}

async function getAvailableOpenCodeServePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate a port for opencode serve"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForOpenCodeServeHealthy(input: {
  server: OpenCodeServeHandle;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const fetchFn = input.fetchFn ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const pollIntervalMs = input.pollIntervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let spawnErrorMessage: string | null = null;

  input.server.child.once("error", (error) => {
    spawnErrorMessage = error.message;
  });

  while (Date.now() < deadline) {
    if (input.signal?.aborted) {
      throw new DOMException("This operation was aborted", "AbortError");
    }

    if (spawnErrorMessage) {
      throw new Error(`Failed to spawn opencode serve: ${spawnErrorMessage}`);
    }

    if (input.server.closed || input.server.child.exitCode !== null) {
      input.server.closed = true;
      const output = input.server.stderr.trim() || input.server.stdout.trim();
      throw new Error(
        output
          ? `opencode serve exited before becoming ready: ${output}`
          : "opencode serve exited before becoming ready",
      );
    }

    try {
      const response = await fetchFn(`${input.server.baseUrl}/global/health`, {
        method: "GET",
        signal: input.signal,
      });
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
    }

    if (pollIntervalMs > 0) {
      await delay(pollIntervalMs);
    }
  }

  throw new Error(
    `Timed out waiting for opencode serve at ${input.server.baseUrl}`,
  );
}

export async function startOpenCodeServe(input: {
  cwd: string;
  bin?: string;
  extraArgs?: string[];
  hostname?: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fetchFn?: typeof fetch;
  getPort?: () => Promise<number>;
  spawnFn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => OpenCodeServeProcess;
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  pidFile?: string;
}): Promise<OpenCodeServeHandle> {
  const hostname = input.hostname ?? "127.0.0.1";
  const port =
    input.port ?? (await (input.getPort ?? getAvailableOpenCodeServePort)());
  const platform = input.platform ?? process.platform;
  const isWindows = platform === "win32";
  const spawnFn =
    input.spawnFn ??
    ((command, args, options) =>
      spawn(command, args, options) as unknown as OpenCodeServeProcess);
  const child = spawnFn(
    input.bin ?? "opencode",
    [
      "serve",
      ...(input.extraArgs ?? []),
      "--hostname",
      hostname,
      "--port",
      String(port),
      "--print-logs",
    ],
    {
      cwd: input.cwd,
      detached: !isWindows,
      shell: isWindows,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizeOpenCodeServeEnv(input.env),
    },
  );
  const server: OpenCodeServeHandle = {
    baseUrl: `http://${hostname}:${port}`,
    child,
    closed: false,
    cwd: input.cwd,
    port,
    readyPromise: Promise.resolve(),
    stderr: "",
    stdout: "",
    pidFile: input.pidFile,
  };
  liveOpenCodeServeHandles.add(server);

  if (input.pidFile !== undefined && child.pid !== undefined) {
    try {
      fs.mkdirSync(path.dirname(input.pidFile), { recursive: true });
      fs.writeFileSync(input.pidFile, `${child.pid}\n`, "utf8");
    } catch {
      // pid file is best-effort telemetry for orphan recovery; do not fail
      // startup if the target directory is not writable.
    }
  }
  const maxOutput = 64 * 1024;
  const appendOutput = (current: string, chunk: Buffer | string): string => {
    const next = current + chunk.toString();
    return next.length > maxOutput ? next.slice(-maxOutput) : next;
  };

  child.stdout.on("data", (chunk) => {
    server.stdout = appendOutput(server.stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    server.stderr = appendOutput(server.stderr, chunk);
  });
  child.on("close", () => {
    server.closed = true;
  });

  server.readyPromise = waitForOpenCodeServeHealthy({
    server,
    fetchFn: input.fetchFn,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    signal: input.signal,
  });

  try {
    await server.readyPromise;
    return server;
  } catch (error) {
    liveOpenCodeServeHandles.delete(server);
    if (server.pidFile !== undefined) {
      tryUnlinkSync(server.pidFile);
    }
    await shutdownOpenCodeServe(server).catch(() => undefined);
    throw error;
  }
}

export async function shutdownOpenCodeServe(
  server: OpenCodeServeHandle,
): Promise<void> {
  liveOpenCodeServeHandles.delete(server);

  if (server.closed || server.child.exitCode !== null) {
    server.closed = true;
    if (server.pidFile !== undefined) {
      tryUnlinkSync(server.pidFile);
    }
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      server.closed = true;
      if (server.pidFile !== undefined) {
        tryUnlinkSync(server.pidFile);
      }
      resolve();
    };

    server.child.on("close", () => {
      finish();
    });

    const killed = server.child.kill("SIGTERM");
    if (!killed) {
      finish();
    }
  });
}

export interface ReapOrphanedOpenCodeServesResult {
  reaped: number[];
  skipped: number[];
}

export function reapOrphanedOpenCodeServes(input: {
  runsDir: string;
  isAlive?: (pid: number) => boolean;
  killFn?: (pid: number, signal: NodeJS.Signals) => void;
}): ReapOrphanedOpenCodeServesResult {
  const isAlive =
    input.isAlive ??
    ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // ESRCH: no such process. EPERM: process exists but we cannot signal
        // it; treat as alive to avoid silently leaving an unreachable orphan.
        return (
          error instanceof Error &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "EPERM"
        );
      }
    });
  const killFn =
    input.killFn ??
    ((pid: number, signal: NodeJS.Signals) => {
      try {
        process.kill(pid, signal);
      } catch {
        // best-effort; the orphan may exit between the aliveness check and
        // the signal.
      }
    });

  const reaped: number[] = [];
  const skipped: number[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(input.runsDir, { withFileTypes: true });
  } catch {
    return { reaped, skipped };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const pidFile = path.join(input.runsDir, entry.name, ".opencode-serve.pid");
    let contents: string;
    try {
      contents = fs.readFileSync(pidFile, "utf8");
    } catch {
      continue;
    }

    const pid = Number.parseInt(contents.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      tryUnlinkSync(pidFile);
      continue;
    }

    if (isAlive(pid)) {
      killFn(pid, "SIGTERM");
      reaped.push(pid);
    } else {
      skipped.push(pid);
    }
    tryUnlinkSync(pidFile);
  }

  return { reaped, skipped };
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  options?: {
    allowEmptyBody?: boolean;
    emptyValue?: T;
  },
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();
  if (body.trim().length === 0) {
    if (options?.allowEmptyBody) {
      return options.emptyValue as T;
    }

    throw new Error(`Request succeeded for ${url} but returned an empty body`);
  }

  return JSON.parse(body) as T;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// Opencode's StructuredOutput tool enforces JSON via tool_choice: required,
// but gpt-5-class models sometimes skip the tool call on the final attempt
// and emit prose instead. When that happens opencode hands us the raw text.
// Try plain JSON.parse first; if that fails, scan for the first balanced
// `{...}` block and try each candidate. On total failure, throw an error
// carrying the full raw text so the caller can persist it for debugging.
function parseStructuredOutputLenient<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // fall through to balanced-brace extraction
  }

  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf("{", searchFrom);
    if (start < 0) {
      break;
    }

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end < 0) {
      break;
    }

    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      searchFrom = start + 1;
    }
  }

  const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
  const error = new Error(
    `Structured-output response contained no parseable JSON (${text.length} chars). Preview: ${preview}`,
  );
  (error as Error & { finalText?: string }).finalText = text;
  throw error;
}

interface OpenCodeProviderCatalogEntry {
  id?: string;
  models?: Record<string, unknown>;
}

interface OpenCodeProviderCatalogResponse {
  providers?: OpenCodeProviderCatalogEntry[];
}

// Verify that the opencode serve loaded the provider and model we pinned in
// opencode.json. Opencode silently falls back to another available provider
// if the pinned one is not registered (missing auth, missing env var), which
// means the benchmark would run against the wrong model without any
// visible error. Call this right after `startOpenCodeServe` resolves.
export async function assertOpenCodeProviderAvailable(input: {
  baseUrl: string;
  model: string;
  fetchFn?: typeof fetch;
}): Promise<void> {
  const slashIndex = input.model.indexOf("/");
  if (slashIndex <= 0 || slashIndex === input.model.length - 1) {
    throw new Error(
      `Pinned model "${input.model}" must be in "<provider>/<model>" form so opencode can route it to a specific provider`,
    );
  }

  const providerId = input.model.slice(0, slashIndex);
  const modelId = input.model.slice(slashIndex + 1);
  const fetchFn = input.fetchFn ?? fetch;
  const response = await fetchFn(`${input.baseUrl}/config/providers`, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch opencode providers: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as OpenCodeProviderCatalogResponse;
  const providers = Array.isArray(body.providers) ? body.providers : [];
  const providerIds = providers
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string");
  const provider = providers.find((entry) => entry.id === providerId);

  if (!provider) {
    throw new Error(
      `opencode provider "${providerId}" is not loaded. Loaded providers: ${
        providerIds.length > 0 ? providerIds.join(", ") : "(none)"
      }. Check that auth/env for the pinned model is available to opencode serve.`,
    );
  }

  const providerModels = provider.models ?? {};
  if (!Object.prototype.hasOwnProperty.call(providerModels, modelId)) {
    const available = Object.keys(providerModels).slice(0, 10).join(", ");
    throw new Error(
      `opencode model "${modelId}" is not available on provider "${providerId}". First known models: ${
        available || "(none)"
      }.`,
    );
  }
}

export async function createOpenCodeSession(input: {
  baseUrl: string;
  directory: string;
}): Promise<OpenCodeSessionResponse> {
  return requestJson<OpenCodeSessionResponse>(`${input.baseUrl}/session`, {
    method: "POST",
    body: JSON.stringify({
      directory: input.directory,
      permission: BLANKET_PERMISSION_RULESET,
    }),
  });
}

export async function deleteOpenCodeSession(input: {
  baseUrl: string;
  sessionId: string;
}): Promise<boolean> {
  return requestJson<boolean>(`${input.baseUrl}/session/${input.sessionId}`, {
    method: "DELETE",
  });
}

async function abortOpenCodeSession(input: {
  baseUrl: string;
  sessionId: string;
}): Promise<boolean> {
  return requestJson<boolean>(
    `${input.baseUrl}/session/${input.sessionId}/abort`,
    {
      method: "POST",
    },
  );
}

export async function sendOpenCodePrompt<TStructured>(input: {
  baseUrl: string;
  sessionId: string;
  prompt: string;
  schema: JsonSchemaFormat;
  signal?: AbortSignal;
}): Promise<{
  response: OpenCodeMessageResponse;
  finalText: string | null;
  structured: TStructured | null;
}> {
  const response = await requestJson<OpenCodeMessageResponse>(
    `${input.baseUrl}/session/${input.sessionId}/message`,
    {
      method: "POST",
      body: JSON.stringify({
        role: "user",
        parts: [{ type: "text", text: input.prompt }],
        format: {
          type: "json_schema",
          schema: input.schema,
          retryCount: 2,
        },
      }),
      signal: input.signal,
    },
  );

  const finalText = selectOpenCodeFinalText(response.parts);
  const structured =
    response.info?.structured !== undefined
      ? (response.info.structured as TStructured)
      : finalText
        ? parseStructuredOutputLenient<TStructured>(finalText)
        : null;

  return {
    response,
    finalText,
    structured,
  };
}

export async function sendOpenCodePromptStreamed<TStructured>(input: {
  baseUrl: string;
  sessionId: string;
  prompt: string;
  schema: JsonSchemaFormat;
  signal?: AbortSignal;
}): Promise<{
  response: OpenCodeMessageResponse;
  finalText: string | null;
  structured: TStructured | null;
  toolCalls: Array<{
    tool: string;
    input: string;
    status: "success" | "error";
    duration_ms?: number;
  }>;
  tokens: { in: number; out: number };
}> {
  const dispatchStartedAtMs = Date.now();
  const streamAbortController = new AbortController();
  const eventSignal = input.signal
    ? AbortSignal.any([input.signal, streamAbortController.signal])
    : streamAbortController.signal;
  const eventResponse = await fetch(`${input.baseUrl}/global/event`, {
    method: "GET",
    headers: { accept: "text/event-stream" },
    signal: eventSignal,
  });

  if (!eventResponse.ok || !eventResponse.body) {
    throw new Error("Failed to open OpenCode global event stream");
  }

  const collector = createOpenCodeStreamCollector<TStructured>(input.sessionId);
  const parser = createOpenCodeSseParser((event) => {
    sawSessionIdle = collector.handleEvent(event) || sawSessionIdle;
  });
  const reader = eventResponse.body.getReader();
  const decoder = new TextDecoder();
  let sawSessionIdle = false;
  let abortRequest: Promise<boolean> | null = null;
  const onAbort = () => {
    abortRequest = abortOpenCodeSession({
      baseUrl: input.baseUrl,
      sessionId: input.sessionId,
    }).catch(() => false);
  };

  if (input.signal) {
    if (input.signal.aborted) {
      onAbort();
    } else {
      input.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const streamLoop = (async () => {
    try {
      while (!sawSessionIdle) {
        const result = await reader.read();
        if (result.done) {
          break;
        }

        parser.push(decoder.decode(result.value, { stream: true }));
      }
    } finally {
      parser.push(decoder.decode());
      parser.flush();
      await reader.cancel().catch(() => undefined);
    }
  })();

  const response: OpenCodeMessageResponse = { parts: [] };

  try {
    await requestJson<boolean>(
      `${input.baseUrl}/session/${input.sessionId}/prompt_async`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "user",
          parts: [{ type: "text", text: input.prompt }],
          format: {
            type: "json_schema",
            schema: input.schema,
            retryCount: 2,
          },
        }),
        signal: input.signal,
      },
      {
        allowEmptyBody: true,
        emptyValue: true,
      },
    );
  } catch (error) {
    streamAbortController.abort();
    await streamLoop.catch(() => undefined);
    await abortRequest;
    if (isAbortError(error) && error instanceof Error) {
      (
        error as Error & {
          partialSnapshot?: ReturnType<typeof collector.snapshot>;
        }
      ).partialSnapshot = collector.snapshot();
    }
    throw error;
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
  }

  try {
    await streamLoop;
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }
  }

  streamAbortController.abort();
  await abortRequest;

  if (!sawSessionIdle) {
    throw new Error("OpenCode event stream ended before session became idle");
  }

  const snapshot = collector.snapshot();
  const finalText = snapshot.finalText ?? selectOpenCodeFinalText(response.parts);
  let structured: TStructured | null;
  if (snapshot.structured !== null) {
    structured = snapshot.structured;
  } else if (response.info?.structured !== undefined) {
    structured = response.info.structured as TStructured;
  } else if (finalText) {
    try {
      structured = parseStructuredOutputLenient<TStructured>(finalText);
    } catch (parseError) {
      if (parseError instanceof Error) {
        (parseError as Error & { diagnostics?: string }).diagnostics =
          JSON.stringify({
            reason: "parse_failed_no_structured_output",
            sawSessionIdle: snapshot.sawSessionIdle,
            textPartPhases: snapshot.textPartPhases,
            toolCallsAttempted: snapshot.toolCalls.map((t) => ({
              tool: t.tool,
              status: t.status,
            })),
            structuredFromInfo: response.info?.structured !== undefined,
            finalTextLength: finalText.length,
            tokens: snapshot.tokens,
            durationMs: Date.now() - dispatchStartedAtMs,
          });
      }
      throw parseError;
    }
  } else {
    structured = null;
  }

  return {
    response,
    finalText,
    structured,
    toolCalls: snapshot.toolCalls,
    tokens: snapshot.tokens,
  };
}

export interface OpenCodeStreamEvent {
  payload?: {
    type?: string;
    properties?: {
      sessionID?: string;
      field?: string;
      delta?: string;
      partID?: string;
      part?: {
        id?: string;
        messageID?: string;
        type?: string;
        text?: string;
        tool?: string;
        callID?: string;
        state?: {
          status?: string;
          input?: unknown;
          output?: string;
          time?: { start?: number; end?: number };
        };
        tokens?: OpenCodeTokens;
        metadata?: {
          openai?: {
            phase?: string;
          };
        };
      };
      info?: {
        id?: string;
        role?: string;
        structured?: unknown;
        tokens?: OpenCodeTokens;
      };
    };
  };
}

function sumOpenCodeUsage(
  usageByMessageId: ReadonlyMap<string, OpenCodeTokens>,
): { in: number; out: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const usage of usageByMessageId.values()) {
    inputTokens += usage.input ?? 0;
    outputTokens += usage.output ?? 0;
  }

  return {
    in: inputTokens,
    out: outputTokens,
  };
}

export function createOpenCodeStreamCollector<TStructured>(sessionId: string): {
  handleEvent: (event: OpenCodeStreamEvent) => boolean;
  snapshot: () => {
    finalText: string | null;
    structured: TStructured | null;
    toolCalls: Array<{
      tool: string;
      input: string;
      status: "success" | "error";
      duration_ms?: number;
    }>;
    tokens: { in: number; out: number };
    textPartPhases: Array<{
      id: string;
      phase: string | null;
      length: number;
    }>;
    sawSessionIdle: boolean;
  };
} {
  const textParts = new Map<
    string,
    {
      text: string;
      phase?: string;
    }
  >();
  const usageByMessageId = new Map<string, OpenCodeTokens>();
  type CapturedToolCall = {
    tool: string;
    input: string;
    status: "success" | "error";
    duration_ms?: number;
  };
  const toolCallsByCallId = new Map<string, CapturedToolCall>();
  let lastText: string | null = null;
  let lastFinalAnswerText: string | null = null;
  let structured: TStructured | null = null;
  let sawSessionIdle = false;

  const updateText = (partId: string, nextText: string, phase?: string) => {
    textParts.set(partId, {
      text: nextText,
      phase,
    });

    const trimmed = nextText.trim();
    if (!trimmed) {
      return;
    }

    lastText = nextText;
    if (phase === "final_answer") {
      lastFinalAnswerText = nextText;
    }
  };

  const updateUsage = (
    messageId: string | undefined,
    tokens?: OpenCodeTokens,
  ) => {
    if (!messageId || !tokens) {
      return;
    }

    usageByMessageId.set(messageId, tokens);
  };

  return {
    handleEvent(event) {
      const payload = event.payload;
      const properties = payload?.properties;

      if (!properties || properties.sessionID !== sessionId) {
        return false;
      }

      if (
        payload?.type === "message.part.delta" &&
        properties.field === "text" &&
        typeof properties.partID === "string" &&
        typeof properties.delta === "string"
      ) {
        const current = textParts.get(properties.partID);
        updateText(
          properties.partID,
          `${current?.text ?? ""}${properties.delta}`,
          current?.phase,
        );
        return false;
      }

      if (payload?.type === "message.part.updated") {
        const part = properties.part;
        if (!part) {
          return false;
        }

        if (part.type === "text" && typeof part.id === "string") {
          updateText(part.id, part.text ?? "", part.metadata?.openai?.phase);
          return false;
        }

        if (
          part.type === "tool" &&
          typeof part.tool === "string" &&
          typeof part.callID === "string" &&
          part.state
        ) {
          const status = part.state.status;
          if (status === "completed" || status === "error") {
            const inputString = (() => {
              try {
                return JSON.stringify(part.state.input ?? null);
              } catch {
                return "";
              }
            })();
            if (inputString.length > 0) {
              const start = part.state.time?.start;
              const end = part.state.time?.end;
              const duration_ms =
                typeof start === "number" &&
                typeof end === "number" &&
                end >= start
                  ? end - start
                  : undefined;
              toolCallsByCallId.set(part.callID, {
                tool: part.tool,
                input: inputString,
                status: status === "completed" ? "success" : "error",
                ...(duration_ms !== undefined ? { duration_ms } : {}),
              });
            }
          }
          return false;
        }

        if (part.type === "step-finish") {
          updateUsage(part.messageID, part.tokens);
          return false;
        }

        return false;
      }

      if (payload?.type === "message.updated") {
        if (properties.info?.role === "assistant") {
          updateUsage(properties.info.id, properties.info.tokens);
        }

        if (properties.info?.structured !== undefined) {
          structured = properties.info.structured as TStructured;
        }

        return false;
      }

      if (payload?.type === "session.idle") {
        sawSessionIdle = true;
        return true;
      }
      return false;
    },
    snapshot() {
      const textPartPhases = Array.from(textParts.entries()).map(
        ([id, part]) => ({
          id,
          phase: part.phase ?? null,
          length: part.text.length,
        }),
      );
      return {
        finalText: lastFinalAnswerText ?? lastText,
        structured,
        toolCalls: Array.from(toolCallsByCallId.values()),
        tokens: sumOpenCodeUsage(usageByMessageId),
        textPartPhases,
        sawSessionIdle,
      };
    },
  };
}

export function createOpenCodeSseParser(
  onEvent: (event: OpenCodeStreamEvent) => void,
): { push: (chunk: string) => void; flush: () => void } {
  let buffer = "";

  const processRawEvent = (rawEvent: string) => {
    if (!rawEvent.trim()) {
      return;
    }

    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart());

    if (dataLines.length === 0) {
      return;
    }

    try {
      onEvent(JSON.parse(dataLines.join("\n")) as OpenCodeStreamEvent);
    } catch {
      // Ignore malformed SSE payloads so a single bad event does not poison the stream.
    }
  };

  const processBufferedEvents = (flushRemainder = false) => {
    while (true) {
      const lfBoundary = buffer.indexOf("\n\n");
      const crlfBoundary = buffer.indexOf("\r\n\r\n");

      if (lfBoundary === -1 && crlfBoundary === -1) {
        break;
      }

      let boundary = lfBoundary;
      let separatorLength = 2;
      if (
        crlfBoundary !== -1 &&
        (lfBoundary === -1 || crlfBoundary < lfBoundary)
      ) {
        boundary = crlfBoundary;
        separatorLength = 4;
      }

      processRawEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + separatorLength);
    }

    if (flushRemainder && buffer.trim()) {
      processRawEvent(buffer);
      buffer = "";
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      processBufferedEvents(false);
    },
    flush() {
      processBufferedEvents(true);
    },
  };
}

export function selectOpenCodeFinalText(
  parts: readonly OpenCodeMessagePart[] | undefined,
): string | null {
  if (!parts) {
    return null;
  }

  let lastNonEmptyText: string | null = null;
  let lastFinalAnswerText: string | null = null;

  for (const part of parts) {
    if (part.type !== "text") {
      continue;
    }

    const text = part.text?.trim();
    if (!text) {
      continue;
    }

    lastNonEmptyText = part.text ?? null;
    if (part.metadata?.openai?.phase === "final_answer") {
      lastFinalAnswerText = part.text ?? null;
    }
  }

  return lastFinalAnswerText ?? lastNonEmptyText;
}
