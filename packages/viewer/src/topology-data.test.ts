import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTopologyHash,
  parseTopologyRoute,
  summarizeTopologyRuns,
  type TopologyRunSummary,
} from "./topology-data.js";

test("parseTopologyRoute returns route for #topology/<slug>", () => {
  assert.deepEqual(parseTopologyRoute("#topology/apple"), {
    topology: "apple",
  });
  assert.deepEqual(parseTopologyRoute("#topology/microsoft"), {
    topology: "microsoft",
  });
});

test("parseTopologyRoute returns null for unrecognized hashes", () => {
  assert.equal(parseTopologyRoute(""), null);
  assert.equal(parseTopologyRoute("#"), null);
  assert.equal(parseTopologyRoute("#topology"), null);
  assert.equal(parseTopologyRoute("#topology/"), null);
  assert.equal(parseTopologyRoute("#topology/apple/seed-01"), null);
  assert.equal(parseTopologyRoute("#run/apple/seed-01"), null);
});

test("buildTopologyHash and parseTopologyRoute round-trip", () => {
  const route = { topology: "facebook" };
  assert.equal(buildTopologyHash(route), "#topology/facebook");
  assert.deepEqual(parseTopologyRoute(buildTopologyHash(route)), route);
});

test("summarizeTopologyRuns averages metrics across seed summaries", () => {
  const summaries: TopologyRunSummary[] = [
    {
      seed: "seed-01",
      totalTokens: 100_000,
      wallClockMs: 60_000,
      passRate: 1,
      buildSuccess: true,
      deploySuccess: true,
    },
    {
      seed: "seed-02",
      totalTokens: 200_000,
      wallClockMs: 120_000,
      passRate: 0.5,
      buildSuccess: true,
      deploySuccess: false,
    },
  ];

  const aggregate = summarizeTopologyRuns(summaries);

  assert.equal(aggregate.runCount, 2);
  assert.equal(aggregate.meanTokens, 150_000);
  assert.equal(aggregate.meanWallClockMs, 90_000);
  assert.equal(aggregate.meanPassRate, 0.75);
  assert.equal(aggregate.buildSuccessCount, 2);
  assert.equal(aggregate.deploySuccessCount, 1);
});

test("summarizeTopologyRuns handles missing meta entries by skipping nulls", () => {
  const summaries: TopologyRunSummary[] = [
    {
      seed: "seed-01",
      totalTokens: null,
      wallClockMs: null,
      passRate: null,
      buildSuccess: null,
      deploySuccess: null,
    },
    {
      seed: "seed-02",
      totalTokens: 50_000,
      wallClockMs: 30_000,
      passRate: 0.4,
      buildSuccess: false,
      deploySuccess: true,
    },
  ];

  const aggregate = summarizeTopologyRuns(summaries);

  assert.equal(aggregate.runCount, 2);
  assert.equal(aggregate.metaCount, 1);
  assert.equal(aggregate.meanTokens, 50_000);
  assert.equal(aggregate.meanWallClockMs, 30_000);
  assert.equal(aggregate.meanPassRate, 0.4);
  assert.equal(aggregate.buildSuccessCount, 0);
  assert.equal(aggregate.deploySuccessCount, 1);
});

test("summarizeTopologyRuns returns zeros when no runs are present", () => {
  const aggregate = summarizeTopologyRuns([]);
  assert.equal(aggregate.runCount, 0);
  assert.equal(aggregate.metaCount, 0);
  assert.equal(aggregate.meanTokens, null);
  assert.equal(aggregate.meanWallClockMs, null);
  assert.equal(aggregate.meanPassRate, null);
  assert.equal(aggregate.buildSuccessCount, 0);
  assert.equal(aggregate.deploySuccessCount, 0);
});
