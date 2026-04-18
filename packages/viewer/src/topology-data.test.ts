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
  assert.equal(parseTopologyRoute("#run/apple"), null);
});

test("buildTopologyHash and parseTopologyRoute round-trip", () => {
  const route = { topology: "facebook" };
  assert.equal(buildTopologyHash(route), "#topology/facebook");
  assert.deepEqual(parseTopologyRoute(buildTopologyHash(route)), route);
});

test("summarizeTopologyRuns mirrors the single run's metrics", () => {
  const summaries: TopologyRunSummary[] = [
    {
      topology: "apple",
      totalTokens: 100_000,
      wallClockMs: 60_000,
      passRate: 1,
      buildSuccess: true,
      deploySuccess: true,
    },
  ];

  const aggregate = summarizeTopologyRuns(summaries);

  assert.equal(aggregate.runCount, 1);
  assert.equal(aggregate.metaCount, 1);
  assert.equal(aggregate.totalTokens, 100_000);
  assert.equal(aggregate.wallClockMs, 60_000);
  assert.equal(aggregate.passRate, 1);
  assert.equal(aggregate.buildSuccessCount, 1);
  assert.equal(aggregate.deploySuccessCount, 1);
});

test("summarizeTopologyRuns handles missing meta by returning null metrics", () => {
  const summaries: TopologyRunSummary[] = [
    {
      topology: "apple",
      totalTokens: null,
      wallClockMs: null,
      passRate: null,
      buildSuccess: null,
      deploySuccess: null,
    },
  ];

  const aggregate = summarizeTopologyRuns(summaries);

  assert.equal(aggregate.runCount, 1);
  assert.equal(aggregate.metaCount, 0);
  assert.equal(aggregate.totalTokens, null);
  assert.equal(aggregate.wallClockMs, null);
  assert.equal(aggregate.passRate, null);
  assert.equal(aggregate.buildSuccessCount, 0);
  assert.equal(aggregate.deploySuccessCount, 0);
});

test("summarizeTopologyRuns returns zeros when no runs are present", () => {
  const aggregate = summarizeTopologyRuns([]);
  assert.equal(aggregate.runCount, 0);
  assert.equal(aggregate.metaCount, 0);
  assert.equal(aggregate.totalTokens, null);
  assert.equal(aggregate.wallClockMs, null);
  assert.equal(aggregate.passRate, null);
  assert.equal(aggregate.buildSuccessCount, 0);
  assert.equal(aggregate.deploySuccessCount, 0);
});
