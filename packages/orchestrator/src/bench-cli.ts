import path from "node:path";

import {
  defaultRunScratchRoot,
  defineRunConfig,
  loadRunConfig,
  runBenchmark,
  type RunConfig,
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

const BENCH_SUITE_ENV = "ORG_BENCH_SUITE";
const BENCH_MODEL_ENV = "ORG_BENCH_MODEL";

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

function formatRunId(runConfig: RunConfig): string {
  return runConfig.suite === undefined
    ? runConfig.topology.slug
    : `${runConfig.suite}-${runConfig.topology.slug}`;
}

function readOptionalEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export function applyBenchEnvironmentOverrides(
  runConfig: RunConfig,
  env: NodeJS.ProcessEnv = process.env,
): RunConfig {
  const suite = readOptionalEnv(env, BENCH_SUITE_ENV);
  const model = readOptionalEnv(env, BENCH_MODEL_ENV);

  if (suite === undefined && model === undefined) {
    return runConfig;
  }

  if (model !== undefined && suite === undefined) {
    throw new Error(
      `${BENCH_MODEL_ENV} requires ${BENCH_SUITE_ENV} so model reruns cannot overwrite baseline artifacts`,
    );
  }

  if (suite !== undefined && !/^[A-Za-z0-9_-]+$/.test(suite)) {
    throw new Error(
      `${BENCH_SUITE_ENV} must contain only letters, numbers, underscores, and hyphens, e.g. gpt-5-5`,
    );
  }

  const models =
    model === undefined
      ? runConfig.models
      : {
          node: { ...runConfig.models.node, model },
          judge: { ...runConfig.models.judge, model },
          analyst: { ...runConfig.models.analyst, model },
          player: { ...runConfig.models.player, model },
        };

  return defineRunConfig({
    ...runConfig,
    ...(suite === undefined ? {} : { suite }),
    models,
  });
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
  const runConfig = applyBenchEnvironmentOverrides(
    await loadRunConfig(resolvedConfigPath),
  );
  const repoRoot = path.resolve(path.dirname(resolvedConfigPath), "..");
  const runId = formatRunId(runConfig);
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
