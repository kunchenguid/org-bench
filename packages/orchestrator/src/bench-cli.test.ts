import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  installBenchCleanupHandlers,
  resolveBenchConfigPath,
} from "./bench-cli.js";

interface FakeProcess extends EventEmitter {
  exitCalls: Array<number | undefined>;
  exit(code?: number): never;
}

function createFakeProcess(): FakeProcess {
  const emitter = new EventEmitter() as FakeProcess;
  emitter.exitCalls = [];
  emitter.exit = ((code?: number) => {
    emitter.exitCalls.push(code);
    // Throw a sentinel to mirror process.exit short-circuiting execution.
    throw new Error(`__fake_exit_${code ?? 0}`);
  }) as FakeProcess["exit"];
  return emitter;
}

test("resolveBenchConfigPath prefers INIT_CWD for relative config paths under npm workspaces", () => {
  const resolved = resolveBenchConfigPath("configs/run.ts", {
    cwd: "/repo/packages/orchestrator",
    initCwd: "/repo",
  });

  assert.equal(resolved, "/repo/configs/run.ts");
});

test("resolveBenchConfigPath falls back to cwd when INIT_CWD is unavailable", () => {
  const resolved = resolveBenchConfigPath("configs/run.ts", {
    cwd: "/repo",
  });

  assert.equal(resolved, "/repo/configs/run.ts");
});

test("installBenchCleanupHandlers invokes shutdown on SIGINT, SIGTERM, and exit", () => {
  const fakeProcess = createFakeProcess();
  let shutdownCalls = 0;

  installBenchCleanupHandlers({
    processHook: fakeProcess,
    shutdown: () => {
      shutdownCalls += 1;
    },
  });

  // SIGINT should shutdown and exit with 130 (128 + SIGINT=2).
  assert.throws(() => fakeProcess.emit("SIGINT"), /__fake_exit_130/);
  assert.equal(shutdownCalls, 1);
  assert.deepEqual(fakeProcess.exitCalls, [130]);

  // Subsequent SIGTERM should shutdown again (different lifecycle, different
  // signal semantics), but the shutdown implementation is responsible for
  // idempotency, not the handler registry.
  assert.throws(() => fakeProcess.emit("SIGTERM"), /__fake_exit_143/);
  assert.equal(shutdownCalls, 2);
  assert.deepEqual(fakeProcess.exitCalls, [130, 143]);

  // On normal exit, shutdown still fires once.
  fakeProcess.emit("exit", 0);
  assert.equal(shutdownCalls, 3);
});

test("installBenchCleanupHandlers returns an uninstaller that removes every listener", () => {
  const fakeProcess = createFakeProcess();
  let shutdownCalls = 0;

  const uninstall = installBenchCleanupHandlers({
    processHook: fakeProcess,
    shutdown: () => {
      shutdownCalls += 1;
    },
  });

  uninstall();

  assert.equal(fakeProcess.listenerCount("SIGINT"), 0);
  assert.equal(fakeProcess.listenerCount("SIGTERM"), 0);
  assert.equal(fakeProcess.listenerCount("SIGHUP"), 0);
  assert.equal(fakeProcess.listenerCount("exit"), 0);
  assert.equal(fakeProcess.listenerCount("uncaughtException"), 0);
  assert.equal(fakeProcess.listenerCount("unhandledRejection"), 0);

  fakeProcess.emit("exit", 0);
  assert.equal(shutdownCalls, 0, "shutdown must not fire after uninstall");
});

test("installBenchCleanupHandlers routes uncaughtException through shutdown then exit 1", () => {
  const fakeProcess = createFakeProcess();
  let shutdownCalls = 0;

  installBenchCleanupHandlers({
    processHook: fakeProcess,
    shutdown: () => {
      shutdownCalls += 1;
    },
  });

  assert.throws(
    () => fakeProcess.emit("uncaughtException", new Error("boom")),
    /__fake_exit_1/,
  );
  assert.equal(shutdownCalls, 1);
  assert.deepEqual(fakeProcess.exitCalls, [1]);
});
