import path from "node:path";

import {
  defaultRunScratchRoot,
  loadRunConfig,
  runBenchmark,
} from "./index.js";
import { enableStderrLogSink } from "./logger.js";
import {
  reapOrphanedOpenCodeServes,
  shutdownAllOpenCodeServesSync,
} from "./opencode-serve.js";

type BenchProcessHook = Pick<
  NodeJS.EventEmitter,
  "on" | "off" | "listenerCount"
> & {
  exit: (code?: number) => never;
};

const BENCH_CLEANUP_EVENTS = [
  "SIGINT",
  "SIGTERM",
  "SIGHUP",
  "exit",
  "uncaughtException",
  "unhandledRejection",
] as const;

type BenchCleanupEvent = (typeof BENCH_CLEANUP_EVENTS)[number];

const SIGNAL_EXIT_CODE: Partial<Record<BenchCleanupEvent, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
  uncaughtException: 1,
  unhandledRejection: 1,
};

export function installBenchCleanupHandlers(options?: {
  processHook?: BenchProcessHook;
  shutdown?: () => void;
}): () => void {
  const processHook: BenchProcessHook =
    options?.processHook ?? (process as unknown as BenchProcessHook);
  const shutdown = options?.shutdown ?? shutdownAllOpenCodeServesSync;

  const handlers: Array<{
    event: BenchCleanupEvent;
    listener: (...args: unknown[]) => void;
  }> = [];

  for (const event of BENCH_CLEANUP_EVENTS) {
    const listener = (): void => {
      try {
        shutdown();
      } finally {
        const exitCode = SIGNAL_EXIT_CODE[event];
        if (exitCode !== undefined) {
          processHook.exit(exitCode);
        }
      }
    };
    processHook.on(event, listener);
    handlers.push({ event, listener });
  }

  return () => {
    for (const { event, listener } of handlers) {
      processHook.off(event, listener);
    }
  };
}

function formatRunId(topologySlug: string): string {
  return topologySlug;
}

export function resolveBenchConfigPath(
  configPath: string,
  options?: {
    cwd?: string;
    initCwd?: string;
  },
): string {
  const baseDir = options?.initCwd ?? options?.cwd ?? process.cwd();

  return path.isAbsolute(configPath)
    ? configPath
    : path.resolve(baseDir, configPath);
}

async function main(): Promise<void> {
  enableStderrLogSink();

  const configPath = process.argv[2];

  if (configPath === undefined || configPath.trim().length === 0) {
    throw new Error("Usage: npm run bench -- <run-config>");
  }

  const resolvedConfigPath = resolveBenchConfigPath(configPath, {
    cwd: process.cwd(),
    initCwd: process.env.INIT_CWD,
  });
  const runConfig = await loadRunConfig(resolvedConfigPath);
  const repoRoot = path.resolve(path.dirname(resolvedConfigPath), "..");
  const runId = formatRunId(runConfig.topology.slug);
  const runScratchRoot = defaultRunScratchRoot();

  // Install signal/exit handlers before we spawn any opencode serve, so a
  // Ctrl-C, terminal close, or uncaught exception does not leave a detached
  // opencode serve running forever.
  installBenchCleanupHandlers();

  // Reap any opencode serve PIDs left over by prior bench runs that were
  // SIGKILL'd before their cleanup path could run.
  const reapResult = reapOrphanedOpenCodeServes({
    runsDir: runScratchRoot,
  });
  if (reapResult.reaped.length > 0 || reapResult.skipped.length > 0) {
    process.stderr.write(
      `[bench] reaped ${reapResult.reaped.length} orphaned opencode serve pid(s); cleaned ${reapResult.skipped.length} stale pidfile(s)\n`,
    );
  }

  const result = await runBenchmark({
    repoRoot,
    runId,
    runConfig,
    runScratchRoot,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        run_id: result.runId,
        artifact_dir: result.artifactDir,
        rounds_executed: result.roundsExecuted,
        submitted: result.submitted,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] != null && path.resolve(process.argv[1]) === __filename) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
