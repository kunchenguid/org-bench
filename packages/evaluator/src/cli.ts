import { evaluateArtifact } from "./index.js";

async function main(): Promise<void> {
  const artifactDir = process.argv[2];

  if (artifactDir === undefined || artifactDir.trim().length === 0) {
    throw new Error("Usage: npm run evaluate -- <built-artifact-dir>");
  }

  const result = await evaluateArtifact({ artifactDir });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
