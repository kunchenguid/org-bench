import assert from "node:assert/strict";
import test from "node:test";

import type { RunEntry } from "./runs-manifest.js";

test("RunEntry records a single artifact per topology", () => {
  const entry: RunEntry = { topology: "solo", artifactPath: "solo/" };
  assert.equal(entry.topology, "solo");
  assert.equal(entry.artifactPath, "solo/");
});
