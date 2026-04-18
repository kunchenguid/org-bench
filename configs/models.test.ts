import test from "node:test";
import assert from "node:assert/strict";

import { defaultModels, models } from "./models.js";

test("configs/models pins the OpenCode GPT 5.4 model ID for every benchmark role", () => {
  assert.equal(models.default, defaultModels);
  assert.deepEqual(Object.keys(defaultModels).sort(), [
    "analyst",
    "judge",
    "node",
    "player",
  ]);

  for (const profile of Object.values(defaultModels)) {
    assert.equal(profile.model, "openai/gpt-5.4");
  }
});

test("configs/models preserves the intended per-role profile differences", () => {
  assert.equal(defaultModels.node.tools, true);
  assert.equal(defaultModels.node.outputMode, "text");
  assert.equal(defaultModels.judge.tools, false);
  assert.equal(defaultModels.judge.outputMode, "json");
  assert.equal(defaultModels.player.tools, false);
  assert.equal(defaultModels.player.outputMode, "json");
  assert.equal(defaultModels.analyst.tools, false);
  assert.equal(defaultModels.analyst.thinking, "extended");
});
