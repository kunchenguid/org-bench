import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createOpenCodeSseParser,
  selectOpenCodeFinalText,
  type OpenCodeMessageResponse,
  type OpenCodeStreamEvent,
} from "./opencode-serve.js";

type SmokeOutput = {
  done: boolean;
};

type OpenCodeSessionResponse = {
  id: string;
};

const BLANKET_PERMISSION_RULESET = [
  { permission: "*", pattern: "*", action: "allow" },
] as const;

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(
          new Error("Failed to allocate a port for opencode serve smoke test"),
        );
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

async function waitForHealthy(
  baseUrl: string,
  child: { exitCode: number | null },
): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `opencode serve exited early with code ${child.exitCode}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/global/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the server becomes reachable or times out.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for opencode serve at ${baseUrl}`);
}

async function requestJson<T>(
  baseUrl: string,
  pathname: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed for ${pathname}: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const workspaceDir = await mkdtemp(
    path.join(tmpdir(), "org-bench-opencode-serve-"),
  );
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    "opencode",
    [
      "serve",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
      "--print-logs",
    ],
    {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealthy(baseUrl, child);

    const session = await requestJson<OpenCodeSessionResponse>(
      baseUrl,
      "/session",
      {
        method: "POST",
        body: JSON.stringify({
          directory: workspaceDir,
          permission: BLANKET_PERMISSION_RULESET,
        }),
      },
    );

    const eventResponse = await fetch(`${baseUrl}/global/event`, {
      method: "GET",
      headers: { accept: "text/event-stream" },
    });
    if (!eventResponse.ok || !eventResponse.body) {
      throw new Error("Failed to open OpenCode global event stream");
    }

    let structuredOutput: SmokeOutput | null = null;
    let sawSessionIdle = false;
    const parser = createOpenCodeSseParser((event: OpenCodeStreamEvent) => {
      const payload = event.payload;
      const properties = payload?.properties;
      if (properties?.sessionID !== session.id) {
        return;
      }

      if (
        payload?.type === "message.updated" &&
        properties.info?.role === "assistant" &&
        properties.info.structured
      ) {
        structuredOutput = properties.info.structured as SmokeOutput;
      }

      if (payload?.type === "session.idle") {
        sawSessionIdle = true;
      }
    });

    const reader = eventResponse.body.getReader();
    const decoder = new TextDecoder();
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

    const promptResponse = await requestJson<OpenCodeMessageResponse>(
      baseUrl,
      `/session/${session.id}/message`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "user",
          parts: [
            {
              type: "text",
              text: [
                "Create an index.html file in the current directory containing exactly <h1>hello</h1>.",
                "Then respond with JSON matching the provided schema.",
              ].join("\n"),
            },
          ],
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                done: { type: "boolean" },
              },
              required: ["done"],
            },
            retryCount: 1,
          },
        }),
      },
    );

    await streamLoop;

    const finalText = selectOpenCodeFinalText(promptResponse.parts);
    if (!structuredOutput && finalText) {
      structuredOutput = JSON.parse(finalText) as SmokeOutput;
    }

    assert.deepEqual(structuredOutput, { done: true });
    assert.equal(
      (await readFile(path.join(workspaceDir, "index.html"), "utf8")).trim(),
      "<h1>hello</h1>",
    );

    await requestJson<boolean>(baseUrl, `/session/${session.id}`, {
      method: "DELETE",
    });

    process.stdout.write(
      JSON.stringify({
        success: true,
        workspaceDir,
        sessionId: session.id,
        structuredOutput,
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(stderr.trim() ? `${detail}\n${stderr.trim()}` : detail);
  } finally {
    child.kill("SIGTERM");
    await rm(workspaceDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
