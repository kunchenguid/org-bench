import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  __resetLiveOpenCodeServeRegistryForTests,
  createOpenCodeStreamCollector,
  createOpenCodeSession,
  createOpenCodeSseParser,
  deleteOpenCodeSession,
  reapOrphanedOpenCodeServes,
  shutdownAllOpenCodeServesSync,
  shutdownOpenCodeServe,
  startOpenCodeServe,
  sendOpenCodePromptStreamed,
  sendOpenCodePrompt,
  selectOpenCodeFinalText,
  type OpenCodeMessagePart,
  type OpenCodeServeProcess,
  type OpenCodeStreamEvent,
} from "./opencode-serve.js";

function createMockServeProcess(): OpenCodeServeProcess & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  emit: EventEmitter["emit"];
} {
  const child = new EventEmitter() as unknown as OpenCodeServeProcess & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    emit: EventEmitter["emit"];
  };
  child.exitCode = null;
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.exitCode = 0;
    child.emit("close", 0, null);
    return true;
  };
  return child;
}

test("startOpenCodeServe spawns opencode serve, waits for health, and strips server auth env", async () => {
  const child = createMockServeProcess();
  const spawnCalls: Array<{
    command: string;
    args: readonly string[];
    options: {
      cwd?: string;
      detached?: boolean;
      shell?: boolean;
      stdio?: unknown;
      env?: NodeJS.ProcessEnv;
    };
  }> = [];
  const healthChecks: string[] = [];
  let attempts = 0;

  const server = await startOpenCodeServe({
    cwd: "/tmp/workspace",
    getPort: async () => 4312,
    spawnFn: (command, args, options) => {
      spawnCalls.push({
        command,
        args,
        options: {
          cwd:
            typeof options.cwd === "string"
              ? options.cwd
              : options.cwd instanceof URL
                ? options.cwd.toString()
                : undefined,
          detached:
            typeof options.detached === "boolean"
              ? options.detached
              : undefined,
          shell: typeof options.shell === "boolean" ? options.shell : undefined,
          stdio: options.stdio,
          env: options.env,
        },
      });
      return child;
    },
    fetchFn: async (url) => {
      healthChecks.push(String(url));
      attempts += 1;
      if (attempts < 2) {
        throw new Error("not ready yet");
      }

      return new Response("ok", { status: 200 });
    },
    env: {
      ...process.env,
      OPENCODE_SERVER_USERNAME: "user",
      OPENCODE_SERVER_PASSWORD: "pass",
    },
  });

  assert.equal(server.baseUrl, "http://127.0.0.1:4312");
  assert.equal(server.port, 4312);
  assert.equal(server.cwd, "/tmp/workspace");
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0]?.command, "opencode");
  assert.deepEqual(spawnCalls[0]?.args, [
    "serve",
    "--hostname",
    "127.0.0.1",
    "--port",
    "4312",
    "--print-logs",
  ]);
  assert.equal(spawnCalls[0]?.options.cwd, "/tmp/workspace");
  assert.equal(spawnCalls[0]?.options.detached, true);
  assert.equal(spawnCalls[0]?.options.shell, false);
  assert.equal(spawnCalls[0]?.options.env?.OPENCODE_SERVER_USERNAME, undefined);
  assert.equal(spawnCalls[0]?.options.env?.OPENCODE_SERVER_PASSWORD, undefined);
  assert.deepEqual(healthChecks, [
    "http://127.0.0.1:4312/global/health",
    "http://127.0.0.1:4312/global/health",
  ]);
});

test("startOpenCodeServe surfaces captured stderr when the server exits before becoming healthy", async () => {
  const child = createMockServeProcess();
  let fetchAttempts = 0;

  await assert.rejects(
    () =>
      startOpenCodeServe({
        cwd: "/tmp/workspace",
        getPort: async () => 4312,
        spawnFn: () => child,
        fetchFn: async () => {
          fetchAttempts += 1;
          child.stderr.emit("data", Buffer.from("bind failed"));
          child.exitCode = 1;
          throw new Error("connect ECONNREFUSED");
        },
        pollIntervalMs: 0,
        timeoutMs: 10,
      }),
    /bind failed/,
  );

  assert.equal(fetchAttempts, 1);
});

test("shutdownOpenCodeServe kills the child and resolves after close", async () => {
  const child = createMockServeProcess();
  const killSignals: Array<NodeJS.Signals | number | undefined> = [];
  child.kill = (signal?: NodeJS.Signals | number) => {
    killSignals.push(signal);
    child.exitCode = 0;
    setImmediate(() => {
      child.emit("close", 0, signal ?? null);
    });
    return true;
  };

  const server = {
    baseUrl: "http://127.0.0.1:4312",
    child,
    closed: false,
    cwd: "/tmp/workspace",
    port: 4312,
    readyPromise: Promise.resolve(),
    stderr: "",
    stdout: "",
  };

  await shutdownOpenCodeServe(server);

  assert.deepEqual(killSignals, ["SIGTERM"]);
  assert.equal(server.closed, true);
});

test("createOpenCodeSession posts allow-all permissions and returns the session id", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "session-123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const session = await createOpenCodeSession({
      baseUrl: "http://127.0.0.1:4096",
      directory: "/tmp/workspace",
    });

    assert.equal(session.id, "session-123");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "http://127.0.0.1:4096/session");
    assert.equal(requests[0]?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      directory: "/tmp/workspace",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendOpenCodePrompt returns structured output from the assistant message response", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        info: { structured: { done: true } },
        parts: [
          {
            type: "text",
            text: '{"done":true}',
            metadata: { openai: { phase: "final_answer" } },
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  const schema = {
    type: "object" as const,
    additionalProperties: false,
    properties: { done: { type: "boolean" } },
    required: ["done"],
  };

  try {
    const response = await sendOpenCodePrompt<{ done: boolean }>({
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-123",
      prompt: "do the thing",
      schema,
    });

    assert.deepEqual(response.structured, { done: true });
    assert.equal(response.finalText, '{"done":true}');
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0]?.url,
      "http://127.0.0.1:4096/session/session-123/message",
    );
    assert.equal(requests[0]?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      role: "user",
      parts: [{ type: "text", text: "do the thing" }],
      format: {
        type: "json_schema",
        schema,
        retryCount: 1,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendOpenCodePrompt falls back to parsing the final text when structured output is absent", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        parts: [
          {
            type: "text",
            text: "working",
            metadata: { openai: { phase: "commentary" } },
          },
          {
            type: "text",
            text: '{"done":true}',
            metadata: { openai: { phase: "final_answer" } },
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;

  try {
    const response = await sendOpenCodePrompt<{ done: boolean }>({
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-123",
      prompt: "do the thing",
      schema: {
        type: "object" as const,
        additionalProperties: false,
        properties: { done: { type: "boolean" } },
        required: ["done"],
      },
    });

    assert.deepEqual(response.structured, { done: true });
    assert.equal(response.finalText, '{"done":true}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendOpenCodePromptStreamed posts prompt_async and collects session-scoped structured output, tool calls, and tokens until idle", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, init });

    if (requestUrl.endsWith("/global/event")) {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                [
                  'data: {"payload":{"type":"message.part.updated","properties":{"sessionID":"session-123","part":{"id":"part-1","type":"text","text":"{\\\"done\\\":true}","metadata":{"openai":{"phase":"final_answer"}}}}}}\n\n',
                  'data: {"payload":{"type":"message.part.updated","properties":{"sessionID":"session-123","part":{"type":"tool","tool":"bash","input":"npm test","status":"success","duration_ms":250}}}}\n\n',
                  'data: {"payload":{"type":"message.part.updated","properties":{"sessionID":"session-123","part":{"type":"step-finish","messageID":"message-1","tokens":{"input":12,"output":34}}}}}\n\n',
                  'data: {"payload":{"type":"message.updated","properties":{"sessionID":"session-123","info":{"id":"message-1","role":"assistant","structured":{"done":true}}}}}\n\n',
                  'data: {"payload":{"type":"session.idle","properties":{"sessionID":"session-123"}}}\n\n',
                ].join(""),
              ),
            );
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    }

    if (requestUrl.endsWith("/session/session-123/prompt_async")) {
      return new Response(
        JSON.stringify(true),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const response = await sendOpenCodePromptStreamed<{ done: boolean }>({
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-123",
      prompt: "do the thing",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { done: { type: "boolean" } },
        required: ["done"],
      },
    });

    assert.deepEqual(response.structured, { done: true });
    assert.equal(response.finalText, '{"done":true}');
    assert.deepEqual(response.toolCalls, [
      {
        tool: "bash",
        input: "npm test",
        status: "success",
        duration_ms: 250,
      },
    ]);
    assert.deepEqual(response.tokens, { in: 12, out: 34 });
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        "http://127.0.0.1:4096/global/event",
        "http://127.0.0.1:4096/session/session-123/prompt_async",
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendOpenCodePromptStreamed tolerates an empty prompt_async response body", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/global/event")) {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                [
                  'data: {"payload":{"type":"message.part.updated","properties":{"sessionID":"session-123","part":{"id":"part-1","type":"text","text":"{\\\"done\\\":true}","metadata":{"openai":{"phase":"final_answer"}}}}}}\n\n',
                  'data: {"payload":{"type":"message.updated","properties":{"sessionID":"session-123","info":{"id":"message-1","role":"assistant","structured":{"done":true}}}}}\n\n',
                  'data: {"payload":{"type":"session.idle","properties":{"sessionID":"session-123"}}}\n\n',
                ].join(""),
              ),
            );
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    }

    if (requestUrl.endsWith("/session/session-123/prompt_async")) {
      return new Response(null, { status: 200 });
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const response = await sendOpenCodePromptStreamed<{ done: boolean }>({
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-123",
      prompt: "do the thing",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { done: { type: "boolean" } },
        required: ["done"],
      },
    });

    assert.deepEqual(response.structured, { done: true });
    assert.equal(response.finalText, '{"done":true}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendOpenCodePromptStreamed aborts the OpenCode session when the caller aborts", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let rejectStreamRead: ((reason?: unknown) => void) | undefined;
  let rejectMessageRequest: ((reason?: unknown) => void) | undefined;

  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, init });

    if (requestUrl.endsWith("/global/event")) {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"payload":{"type":"message.updated","properties":{"sessionID":"session-123"}}}\n\n',
              ),
            );
          },
          pull() {
            return new Promise<void>((_, reject) => {
              rejectStreamRead = reject as (reason?: unknown) => void;
            });
          },
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    }

    if (requestUrl.endsWith("/session/session-123/prompt_async")) {
      return new Promise<Response>((_, reject) => {
        rejectMessageRequest = reject as (reason?: unknown) => void;
      });
    }

    if (requestUrl.endsWith("/session/session-123/abort")) {
      return new Response("true", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected request: ${requestUrl}`);
  }) as typeof fetch;

  const controller = new AbortController();

  try {
    const responsePromise = sendOpenCodePromptStreamed<{ done: boolean }>({
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-123",
      prompt: "do the thing",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { done: { type: "boolean" } },
        required: ["done"],
      },
      signal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    controller.abort();
    const abortError = new DOMException(
      "This operation was aborted",
      "AbortError",
    );
    if (rejectMessageRequest) {
      rejectMessageRequest(abortError);
    }
    if (rejectStreamRead) {
      rejectStreamRead(abortError);
    }

    await assert.rejects(responsePromise, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AbortError");
      return true;
    });

    assert.deepEqual(
      requests.map((request) => request.url),
      [
        "http://127.0.0.1:4096/global/event",
        "http://127.0.0.1:4096/session/session-123/prompt_async",
        "http://127.0.0.1:4096/session/session-123/abort",
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleteOpenCodeSession issues a delete request and returns the server boolean", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push({ url: String(url), init });
    return new Response("true", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const deleted = await deleteOpenCodeSession({
      baseUrl: "http://127.0.0.1:4096",
      sessionId: "session-123",
    });

    assert.equal(deleted, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "http://127.0.0.1:4096/session/session-123");
    assert.equal(requests[0]?.init?.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createOpenCodeSseParser emits parsed events across mixed chunk boundaries", () => {
  const events: OpenCodeStreamEvent[] = [];
  const parser = createOpenCodeSseParser((event) => {
    events.push(event);
  });

  parser.push('data: {"payload":{"type":"message.part.updated"}}\n\n');
  parser.push('data: {"payload":{"type":"session');
  parser.push('.idle"}}\r\n\r\n');
  parser.push('data: {"payload":{"type":"ignored"}}');

  assert.deepEqual(events, [
    { payload: { type: "message.part.updated" } },
    { payload: { type: "session.idle" } },
  ]);

  parser.flush();

  assert.deepEqual(events, [
    { payload: { type: "message.part.updated" } },
    { payload: { type: "session.idle" } },
    { payload: { type: "ignored" } },
  ]);
});

test("createOpenCodeSseParser joins multi-line data payloads and ignores malformed events", () => {
  const events: OpenCodeStreamEvent[] = [];
  const parser = createOpenCodeSseParser((event) => {
    events.push(event);
  });

  parser.push("event: ignored\n");
  parser.push('data: {"payload":\n');
  parser.push('data: {"type":"message.updated"}}\n\n');
  parser.push("data: not json\n\n");

  assert.deepEqual(events, [{ payload: { type: "message.updated" } }]);
});

test("selectOpenCodeFinalText prefers the final_answer part and falls back to latest non-empty text", () => {
  const parts: OpenCodeMessagePart[] = [
    {
      type: "text",
      text: "working",
      metadata: { openai: { phase: "commentary" } },
    },
    {
      type: "text",
      text: '{"ok":true}',
      metadata: { openai: { phase: "final_answer" } },
    },
    {
      type: "text",
      text: "later commentary",
      metadata: { openai: { phase: "commentary" } },
    },
  ];

  assert.equal(selectOpenCodeFinalText(parts), '{"ok":true}');
  assert.equal(
    selectOpenCodeFinalText([
      { type: "text", text: "" },
      { type: "text", text: "fallback" },
    ]),
    "fallback",
  );
  assert.equal(selectOpenCodeFinalText([{ type: "step-finish" }]), null);
});

test("createOpenCodeStreamCollector aggregates structured output, tool calls, and tokens for one session", () => {
  const collector = createOpenCodeStreamCollector<{ done: boolean }>(
    "session-123",
  );

  assert.equal(
    collector.handleEvent({
      payload: {
        type: "message.part.updated",
        properties: {
          sessionID: "session-123",
          part: {
            id: "part-1",
            type: "text",
            text: '{"done":true}',
            metadata: { openai: { phase: "final_answer" } },
          },
        },
      },
    }),
    false,
  );

  assert.equal(
    collector.handleEvent({
      payload: {
        type: "message.part.updated",
        properties: {
          sessionID: "session-123",
          part: {
            type: "tool",
            tool: "bash",
            input: "gh pr review 41 --approve",
            status: "success",
            duration_ms: 1820,
          },
        },
      },
    }),
    false,
  );

  assert.equal(
    collector.handleEvent({
      payload: {
        type: "message.part.updated",
        properties: {
          sessionID: "session-123",
          part: {
            type: "step-finish",
            messageID: "message-1",
            tokens: { input: 144, output: 55 },
          },
        },
      },
    }),
    false,
  );

  assert.equal(
    collector.handleEvent({
      payload: {
        type: "message.updated",
        properties: {
          sessionID: "session-123",
          info: {
            id: "message-1",
            role: "assistant",
            structured: { done: true },
          },
        },
      },
    }),
    false,
  );

  assert.equal(
    collector.handleEvent({
      payload: {
        type: "session.idle",
        properties: {
          sessionID: "session-123",
        },
      },
    }),
    true,
  );

  assert.deepEqual(collector.snapshot(), {
    finalText: '{"done":true}',
    structured: { done: true },
    toolCalls: [
      {
        tool: "bash",
        input: "gh pr review 41 --approve",
        status: "success",
        duration_ms: 1820,
      },
    ],
    tokens: { in: 144, out: 55 },
  });
});

test("createOpenCodeStreamCollector ignores unrelated session events and falls back to latest text", () => {
  const collector = createOpenCodeStreamCollector<{ done: boolean }>(
    "session-123",
  );

  collector.handleEvent({
    payload: {
      type: "message.part.updated",
      properties: {
        sessionID: "session-999",
        part: {
          id: "other",
          type: "text",
          text: "ignored",
        },
      },
    },
  });

  collector.handleEvent({
    payload: {
      type: "message.part.updated",
      properties: {
        sessionID: "session-123",
        part: {
          id: "part-1",
          type: "text",
          text: "working",
          metadata: { openai: { phase: "commentary" } },
        },
      },
    },
  });

  collector.handleEvent({
    payload: {
      type: "message.part.updated",
      properties: {
        sessionID: "session-123",
        part: {
          id: "part-2",
          type: "step-finish",
          tokens: { input: 3, output: 2 },
        },
      },
    },
  });

  assert.deepEqual(collector.snapshot(), {
    finalText: "working",
    structured: null,
    toolCalls: [],
    tokens: { in: 0, out: 0 },
  });
});

test("startOpenCodeServe registers the handle so shutdownAllOpenCodeServesSync can kill it", async () => {
  __resetLiveOpenCodeServeRegistryForTests();
  const child = createMockServeProcess();
  const killSignals: Array<NodeJS.Signals | number | undefined> = [];
  child.kill = (signal?: NodeJS.Signals | number) => {
    killSignals.push(signal);
    child.exitCode = 0;
    return true;
  };

  await startOpenCodeServe({
    cwd: "/tmp/workspace",
    getPort: async () => 4321,
    spawnFn: () => child,
    fetchFn: async () => new Response("ok", { status: 200 }),
  });

  shutdownAllOpenCodeServesSync();

  assert.deepEqual(killSignals, ["SIGTERM"]);
});

test("shutdownOpenCodeServe unregisters the handle so later shutdownAllOpenCodeServesSync is a no-op", async () => {
  __resetLiveOpenCodeServeRegistryForTests();
  const child = createMockServeProcess();
  const killSignals: Array<NodeJS.Signals | number | undefined> = [];
  child.kill = (signal?: NodeJS.Signals | number) => {
    killSignals.push(signal);
    child.exitCode = 0;
    setImmediate(() => {
      child.emit("close", 0, signal ?? null);
    });
    return true;
  };

  const server = await startOpenCodeServe({
    cwd: "/tmp/workspace",
    getPort: async () => 4322,
    spawnFn: () => child,
    fetchFn: async () => new Response("ok", { status: 200 }),
  });

  await shutdownOpenCodeServe(server);
  assert.deepEqual(killSignals, ["SIGTERM"]);

  shutdownAllOpenCodeServesSync();
  assert.deepEqual(
    killSignals,
    ["SIGTERM"],
    "second shutdown must not send another SIGTERM",
  );
});

test("startOpenCodeServe writes the pid file when pidFile is provided", async () => {
  __resetLiveOpenCodeServeRegistryForTests();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-pidfile-"));
  const pidFile = path.join(tmpDir, ".opencode-serve.pid");

  try {
    const child = createMockServeProcess();
    child.pid = 54321;

    const server = await startOpenCodeServe({
      cwd: "/tmp/workspace",
      getPort: async () => 4323,
      spawnFn: () => child,
      fetchFn: async () => new Response("ok", { status: 200 }),
      pidFile,
    });

    assert.equal(server.pidFile, pidFile);
    assert.equal(fs.readFileSync(pidFile, "utf8").trim(), "54321");

    await shutdownOpenCodeServe(server);

    assert.equal(
      fs.existsSync(pidFile),
      false,
      "pid file must be removed on graceful shutdown",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    __resetLiveOpenCodeServeRegistryForTests();
  }
});

test("shutdownAllOpenCodeServesSync deletes pid files for every registered handle", async () => {
  __resetLiveOpenCodeServeRegistryForTests();
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "opencode-pidfile-all-"),
  );
  const pidFile = path.join(tmpDir, ".opencode-serve.pid");

  try {
    const child = createMockServeProcess();
    child.pid = 11111;

    await startOpenCodeServe({
      cwd: "/tmp/workspace",
      getPort: async () => 4324,
      spawnFn: () => child,
      fetchFn: async () => new Response("ok", { status: 200 }),
      pidFile,
    });

    assert.equal(fs.existsSync(pidFile), true);

    shutdownAllOpenCodeServesSync();

    assert.equal(
      fs.existsSync(pidFile),
      false,
      "pid file must be removed during synchronous shutdown",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    __resetLiveOpenCodeServeRegistryForTests();
  }
});

test("reapOrphanedOpenCodeServes signals alive pids and removes their pidfiles", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-reap-"));

  try {
    const aliveRunDir = path.join(tmpDir, "solo-seed-05");
    const deadRunDir = path.join(tmpDir, "solo-seed-04");
    fs.mkdirSync(aliveRunDir, { recursive: true });
    fs.mkdirSync(deadRunDir, { recursive: true });
    const alivePidFile = path.join(aliveRunDir, ".opencode-serve.pid");
    const deadPidFile = path.join(deadRunDir, ".opencode-serve.pid");
    fs.writeFileSync(alivePidFile, "424242\n");
    fs.writeFileSync(deadPidFile, "515151\n");

    const killCalls: Array<{ pid: number; signal: NodeJS.Signals }> = [];

    const result = reapOrphanedOpenCodeServes({
      runsDir: tmpDir,
      isAlive: (pid) => pid === 424242,
      killFn: (pid, signal) => {
        killCalls.push({ pid, signal });
      },
    });

    assert.deepEqual(result.reaped, [424242]);
    assert.deepEqual(result.skipped, [515151]);
    assert.deepEqual(killCalls, [{ pid: 424242, signal: "SIGTERM" }]);
    assert.equal(
      fs.existsSync(alivePidFile),
      false,
      "alive pid's pidfile must be removed after reap",
    );
    assert.equal(
      fs.existsSync(deadPidFile),
      false,
      "dead pid's pidfile must also be removed as cleanup",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("reapOrphanedOpenCodeServes returns empty counts when runsDir is missing", () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "opencode-reap-missing-"),
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const result = reapOrphanedOpenCodeServes({
    runsDir: tmpDir,
    isAlive: () => true,
    killFn: () => {
      throw new Error("kill must not be called when runsDir is missing");
    },
  });

  assert.deepEqual(result.reaped, []);
  assert.deepEqual(result.skipped, []);
});

test("reapOrphanedOpenCodeServes ignores malformed pid files without throwing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-reap-bad-"));

  try {
    const runDir = path.join(tmpDir, "solo-seed-99");
    fs.mkdirSync(runDir, { recursive: true });
    const pidFile = path.join(runDir, ".opencode-serve.pid");
    fs.writeFileSync(pidFile, "not-a-pid\n");

    const result = reapOrphanedOpenCodeServes({
      runsDir: tmpDir,
      isAlive: () => true,
      killFn: () => {
        throw new Error("kill must not be called for malformed pid files");
      },
    });

    assert.deepEqual(result.reaped, []);
    assert.deepEqual(result.skipped, []);
    assert.equal(
      fs.existsSync(pidFile),
      false,
      "malformed pid file must still be cleaned up",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
