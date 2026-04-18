import path from "node:path";

import { regenerateTrajectoryAnalysis } from "./index.js";

export function resolveAnalyzeArtifactPath(
  artifactPath: string,
  options?: {
    cwd?: string;
    initCwd?: string;
  },
): string {
  const baseDir = options?.initCwd ?? options?.cwd ?? process.cwd();

  return path.isAbsolute(artifactPath)
    ? artifactPath
    : path.resolve(baseDir, artifactPath);
}

async function main(): Promise<void> {
  const artifactDir = process.argv[2];

  if (artifactDir === undefined || artifactDir.trim().length === 0) {
    throw new Error("Usage: npm run analyze -- <run-dir>");
  }

  const result = await regenerateTrajectoryAnalysis({
    artifactDir: resolveAnalyzeArtifactPath(artifactDir, {
      cwd: process.cwd(),
      initCwd: process.env.INIT_CWD,
    }),
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] != null && path.resolve(process.argv[1]) === __filename) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
