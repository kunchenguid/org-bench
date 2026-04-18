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

test("discoverRuns finds each topology directory with an index.html", async () => {
  await withTempDir(async (root) => {
    await mkdir(join(root, "solo"), { recursive: true });
    await writeFile(join(root, "solo", "index.html"), "<html></html>", "utf8");
    await mkdir(join(root, "apple"), { recursive: true });
    await writeFile(join(root, "apple", "index.html"), "<html></html>", "utf8");

    const entries = await discoverRuns(root);

    assert.deepEqual(entries, [
      { topology: "apple", artifactPath: "apple/" },
      { topology: "solo", artifactPath: "solo/" },
    ]);
  });
});

test("discoverRuns ignores reserved dirs, files, and unpublished topologies", async () => {
  await withTempDir(async (root) => {
    await mkdir(join(root, "solo"), { recursive: true });
    await writeFile(join(root, "solo", "index.html"), "<html></html>", "utf8");
    await mkdir(join(root, "assets"), { recursive: true });
    await mkdir(join(root, "votes"), { recursive: true });
    await mkdir(join(root, "unpublished"), { recursive: true });
    await writeFile(join(root, "stray.txt"), "hi", "utf8");

    const entries = await discoverRuns(root);

    assert.deepEqual(entries, [{ topology: "solo", artifactPath: "solo/" }]);
  });
});

test("discoverRuns returns an empty list when the docs dir does not exist", async () => {
  const entries = await discoverRuns(
    join(tmpdir(), `viewer-nope-${Date.now()}`),
  );
  assert.deepEqual(entries, []);
});
