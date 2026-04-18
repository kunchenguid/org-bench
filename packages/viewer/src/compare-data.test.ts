import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompareHash,
  pickComparePair,
  parseCompareRoute,
} from "./compare-data.js";
import type { RunEntry } from "./runs-manifest.js";

test("parseCompareRoute returns both routes for #compare/<a>/vs/<b>", () => {
  assert.deepEqual(parseCompareRoute("#compare/apple/vs/google"), {
    a: { topology: "apple" },
    b: { topology: "google" },
  });
});

test("parseCompareRoute returns null for malformed compare hashes", () => {
  assert.equal(parseCompareRoute(""), null);
  assert.equal(parseCompareRoute("#compare"), null);
  assert.equal(parseCompareRoute("#compare/apple"), null);
  assert.equal(parseCompareRoute("#compare/apple/oops/google"), null);
  assert.equal(parseCompareRoute("#compare/apple/vs/google/extra"), null);
  assert.equal(parseCompareRoute("#run/apple"), null);
});

test("buildCompareHash and parseCompareRoute round-trip", () => {
  const pair = {
    a: { topology: "facebook" },
    b: { topology: "oracle" },
  };
  assert.equal(buildCompareHash(pair), "#compare/facebook/vs/oracle");
  assert.deepEqual(parseCompareRoute(buildCompareHash(pair)), pair);
});

test("pickComparePair returns deterministic distinct topologies via picker", () => {
  const entries: RunEntry[] = [
    { topology: "apple", artifactPath: "" },
    { topology: "google", artifactPath: "" },
    { topology: "facebook", artifactPath: "" },
  ];

  const pair = pickComparePair(entries, () => 0);
  assert.notEqual(pair, null);
  assert.notEqual(pair?.a.topology, pair?.b.topology);
});

test("pickComparePair returns null when fewer than 2 distinct topologies", () => {
  const entries: RunEntry[] = [{ topology: "apple", artifactPath: "" }];
  assert.equal(
    pickComparePair(entries, () => 0),
    null,
  );
  assert.equal(
    pickComparePair([], () => 0),
    null,
  );
});
