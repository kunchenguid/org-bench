import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunHash,
  extractRubricRows,
  extractScenarioRows,
  formatDurationMs,
  formatNumber,
  formatPercent,
  parseRunRoute,
  runArtifactBaseUrl,
  scenarioScreenshotUrl,
  type JudgeJsonLike,
  type MetaJsonLike,
} from "./run-data.js";

test("parseRunRoute returns route for #run/<topology>/<seed>", () => {
  assert.deepEqual(parseRunRoute("#run/apple/seed-01"), {
    topology: "apple",
    seed: "seed-01",
  });
  assert.deepEqual(parseRunRoute("#run/solo/seed-12"), {
    topology: "solo",
    seed: "seed-12",
  });
});

test("parseRunRoute returns null for unrecognized hashes", () => {
  assert.equal(parseRunRoute(""), null);
  assert.equal(parseRunRoute("#"), null);
  assert.equal(parseRunRoute("#run/apple"), null);
  assert.equal(parseRunRoute("#run/apple/notseed"), null);
  assert.equal(parseRunRoute("#run/apple/seed-01/extra"), null);
  assert.equal(parseRunRoute("#index"), null);
});

test("buildRunHash and parseRunRoute round-trip", () => {
  const route = { topology: "facebook", seed: "seed-03" };
  assert.equal(buildRunHash(route), "#run/facebook/seed-03");
  assert.deepEqual(parseRunRoute(buildRunHash(route)), route);
});

test("runArtifactBaseUrl points at docs-relative artifact dir", () => {
  assert.equal(
    runArtifactBaseUrl({ topology: "apple", seed: "seed-01" }),
    "./runs/apple/seed-01/",
  );
});

test("formatNumber adds thousands separators", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
  assert.equal(formatNumber(0), "0");
});

test("formatPercent rounds 0..1 ratios", () => {
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(1), "100%");
  assert.equal(formatPercent(0.2857), "29%");
});

test("formatDurationMs produces friendly durations", () => {
  assert.equal(formatDurationMs(0), "0 ms");
  assert.equal(formatDurationMs(750), "750 ms");
  assert.equal(formatDurationMs(2500), "3s");
  assert.equal(formatDurationMs(75_000), "1m 15s");
});

test("extractScenarioRows produces sorted rows from meta.evaluator.scenarios", () => {
  const meta = {
    evaluator: {
      scenarios: {
        navigates: {
          passed_attempts: 3,
          total_attempts: 3,
          pass_rate: 1,
        },
        "loads-cleanly": {
          passed_attempts: 0,
          total_attempts: 3,
          pass_rate: 0,
        },
      },
    },
  } as unknown as MetaJsonLike;

  const rows = extractScenarioRows(meta);

  assert.deepEqual(
    rows.map((row) => row.scenario),
    ["loads-cleanly", "navigates"],
  );
  assert.equal(rows[0]?.passedAttempts, 0);
  assert.equal(rows[1]?.passRate, 1);
});

test("extractRubricRows returns the five rubric criteria in canonical order", () => {
  const judge = {
    rubric: {
      gameplay_completeness: 4,
      rules_clarity: 5,
      content_cohesion: 3,
      visual_polish: 2,
      navigation: 4,
    },
  } as unknown as JudgeJsonLike;

  const rows = extractRubricRows(judge);

  assert.deepEqual(
    rows.map((row) => row.criterion),
    [
      "gameplay_completeness",
      "rules_clarity",
      "content_cohesion",
      "visual_polish",
      "navigation",
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.score),
    [4, 5, 3, 2, 4],
  );
});

test("scenarioScreenshotUrl points at the canonical attempt-1-step-1 thumbnail", () => {
  assert.equal(
    scenarioScreenshotUrl("./runs/apple/seed-01/", "loads-cleanly"),
    "./runs/apple/seed-01/trajectory/blobs/screenshots/loads-cleanly/attempt-1-step-1.png",
  );
});
