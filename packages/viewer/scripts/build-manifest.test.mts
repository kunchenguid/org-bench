import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverRuns } from "./build-manifest.mjs";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "viewer-manifest-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("discoverRuns finds seed-* directories under each topology", async () => {
  await withTempDir(async (root) => {
    await mkdir(join(root, "solo", "seed-01"), { recursive: true });
    await mkdir(join(root, "solo", "seed-02"), { recursive: true });
    await mkdir(join(root, "apple", "seed-01"), { recursive: true });

    const entries = await discoverRuns(root);

    assert.deepEqual(entries, [
      {
        topology: "apple",
        seed: "seed-01",
        artifactPath: "runs/apple/seed-01/",
      },
      { topology: "solo", seed: "seed-01", artifactPath: "runs/solo/seed-01/" },
      { topology: "solo", seed: "seed-02", artifactPath: "runs/solo/seed-02/" },
    ]);
  });
});

test("discoverRuns ignores non-seed directories and files in topology dirs", async () => {
  await withTempDir(async (root) => {
    await mkdir(join(root, "solo", "seed-01"), { recursive: true });
    await mkdir(join(root, "solo", "notes"), { recursive: true });
    await writeFile(join(root, "solo", "README.md"), "hi", "utf8");
    await writeFile(join(root, "stray.txt"), "hi", "utf8");

    const entries = await discoverRuns(root);

    assert.deepEqual(entries, [
      { topology: "solo", seed: "seed-01", artifactPath: "runs/solo/seed-01/" },
    ]);
  });
});

test("discoverRuns returns an empty list when the runs dir does not exist", async () => {
  const entries = await discoverRuns(
    join(tmpdir(), `viewer-nope-${Date.now()}`),
  );
  assert.deepEqual(entries, []);
});
