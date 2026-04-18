import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveAggregateArtifactPath } from "./cli.js";

test("resolveAggregateArtifactPath prefers INIT_CWD for relative artifact paths under npm workspaces", () => {
  const resolved = resolveAggregateArtifactPath("docs/solo", {
    cwd: path.join("/repo", "packages", "orchestrator"),
    initCwd: "/repo",
  });

  assert.equal(resolved, path.join("/repo", "docs", "solo"));
});

test("resolveAggregateArtifactPath falls back to cwd when INIT_CWD is unavailable", () => {
  const resolved = resolveAggregateArtifactPath("docs/solo", {
    cwd: "/repo",
  });

  assert.equal(resolved, path.join("/repo", "docs", "solo"));
});
