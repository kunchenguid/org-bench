import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_NAME_POOL } from "./agent-names.js";

test("configs/agent-names exports a stable pool of short first names", () => {
  assert.equal(AGENT_NAME_POOL.length, 30);
  assert.equal(new Set(AGENT_NAME_POOL).size, AGENT_NAME_POOL.length);

  for (const name of AGENT_NAME_POOL) {
    assert.match(name, /^[A-Z][a-z]+$/);
    assert.ok(name.length <= 8);
  }
});
