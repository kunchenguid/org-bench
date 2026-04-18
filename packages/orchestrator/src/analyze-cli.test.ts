import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveAnalyzeArtifactPath } from "./analyze-cli.js";

test("resolveAnalyzeArtifactPath prefers INIT_CWD for relative artifact paths under npm workspaces", () => {
  const resolved = resolveAnalyzeArtifactPath("docs/solo", {
    cwd: path.join("/repo", "packages", "orchestrator"),
    initCwd: "/repo",
  });

  assert.equal(resolved, path.join("/repo", "docs", "solo"));
});

test("resolveAnalyzeArtifactPath falls back to cwd when INIT_CWD is unavailable", () => {
  const resolved = resolveAnalyzeArtifactPath("docs/solo", {
    cwd: "/repo",
  });

  assert.equal(resolved, path.join("/repo", "docs", "solo"));
});
