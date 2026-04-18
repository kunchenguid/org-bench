import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(packageRoot, "dist");
const referenceModule = (await import(
  new URL("../src/index.ts", import.meta.url).href
)) as typeof import("../src/index.js");
const { createReferenceApp, createReferenceBuildArtifacts } = referenceModule;
const artifacts = createReferenceBuildArtifacts(createReferenceApp(), {
  storageNamespace: "__ORG_BENCH_REFERENCE__:",
});

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await Promise.all(
  Object.entries(artifacts).map(async ([relativePath, contents]) => {
    await writeFile(join(distDir, relativePath), contents, "utf8");
  }),
);
