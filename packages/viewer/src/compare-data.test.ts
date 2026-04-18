import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompareHash,
  pickComparePair,
  parseCompareRoute,
} from "./compare-data.js";
import type { RunEntry } from "./runs-manifest.js";

test("parseCompareRoute returns both routes for #compare/<a>/vs/<b>", () => {
  assert.deepEqual(
    parseCompareRoute("#compare/apple/seed-01/vs/google/seed-02"),
    {
      a: { topology: "apple", seed: "seed-01" },
      b: { topology: "google", seed: "seed-02" },
    },
  );
});

test("parseCompareRoute returns null for malformed compare hashes", () => {
  assert.equal(parseCompareRoute(""), null);
  assert.equal(parseCompareRoute("#compare"), null);
  assert.equal(parseCompareRoute("#compare/apple/seed-01"), null);
  assert.equal(parseCompareRoute("#compare/apple/seed-01/vs/google"), null);
  assert.equal(
    parseCompareRoute("#compare/apple/seed-01/vs/google/oops"),
    null,
  );
  assert.equal(parseCompareRoute("#run/apple/seed-01"), null);
});

test("buildCompareHash and parseCompareRoute round-trip", () => {
  const pair = {
    a: { topology: "facebook", seed: "seed-03" },
    b: { topology: "oracle", seed: "seed-01" },
  };
  assert.equal(
    buildCompareHash(pair),
    "#compare/facebook/seed-03/vs/oracle/seed-01",
  );
  assert.deepEqual(parseCompareRoute(buildCompareHash(pair)), pair);
});

test("pickComparePair returns deterministic distinct topologies via picker", () => {
  const entries: RunEntry[] = [
    { topology: "apple", seed: "seed-01", artifactPath: "" },
    { topology: "apple", seed: "seed-02", artifactPath: "" },
    { topology: "google", seed: "seed-01", artifactPath: "" },
    { topology: "facebook", seed: "seed-01", artifactPath: "" },
  ];

  const pair = pickComparePair(entries, () => 0);
  assert.notEqual(pair, null);
  assert.notEqual(pair?.a.topology, pair?.b.topology);
});

test("pickComparePair returns null when fewer than 2 distinct topologies", () => {
  const entries: RunEntry[] = [
    { topology: "apple", seed: "seed-01", artifactPath: "" },
    { topology: "apple", seed: "seed-02", artifactPath: "" },
  ];
  assert.equal(
    pickComparePair(entries, () => 0),
    null,
  );
  assert.equal(
    pickComparePair([], () => 0),
    null,
  );
});
