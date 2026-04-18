import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMessageGraphData,
  buildTraceHash,
  extractPrReferences,
  parseJsonlLines,
  parseMessageLine,
  parseNodeTurnLine,
  parseTraceRoute,
  summarizeNodeTimeline,
  type MessageEdge,
  type NodeTurn,
} from "./trace-data.js";

test("parseTraceRoute returns null when the hash does not start with #trace/", () => {
  assert.equal(parseTraceRoute(""), null);
  assert.equal(parseTraceRoute("#run/apple/seed-01"), null);
  assert.equal(parseTraceRoute("#trace/"), null);
  assert.equal(parseTraceRoute("#trace/apple"), null);
});

test("parseTraceRoute parses #trace/<topology>/<seed>", () => {
  assert.deepEqual(parseTraceRoute("#trace/apple/seed-01"), {
    topology: "apple",
    seed: "seed-01",
  });
  assert.equal(parseTraceRoute("#trace/apple/not-a-seed"), null);
});

test("buildTraceHash round-trips with parseTraceRoute", () => {
  const hash = buildTraceHash({ topology: "facebook", seed: "seed-03" });
  assert.equal(hash, "#trace/facebook/seed-03");
  assert.deepEqual(parseTraceRoute(hash), {
    topology: "facebook",
    seed: "seed-03",
  });
});

test("parseJsonlLines ignores blank lines and returns only valid JSON", () => {
  const raw = '{"a":1}\n\n{"a":2}\n   \n{"a":3}';
  const parsed = parseJsonlLines<{ a: number }>(raw);
  assert.deepEqual(parsed, [{ a: 1 }, { a: 2 }, { a: 3 }]);
});

test("parseJsonlLines tolerates malformed lines by skipping them", () => {
  const raw = '{"a":1}\nnot-json\n{"a":2}';
  const parsed = parseJsonlLines<{ a: number }>(raw);
  assert.deepEqual(parsed, [{ a: 1 }, { a: 2 }]);
});

test("parseMessageLine extracts a typed MessageEdge from a messages.jsonl row", () => {
  const row = JSON.stringify({
    run_id: "apple-seed-01",
    round: 2,
    from: "leader",
    to: "n1",
    schema_version: 1,
    ts: "2026-04-17T20:14:53.630Z",
    tag: "status",
    content: "hello",
  });
  const msg = parseMessageLine(row);
  assert.deepEqual(msg, {
    round: 2,
    from: "leader",
    to: "n1",
    tag: "status",
    content: "hello",
    ts: "2026-04-17T20:14:53.630Z",
  } satisfies MessageEdge);
});

test("parseMessageLine returns null for rows missing required fields", () => {
  assert.equal(parseMessageLine('{"round":1}'), null);
  assert.equal(parseMessageLine("not-json"), null);
});

test("parseNodeTurnLine extracts round, node, latency, and tokens", () => {
  const row = JSON.stringify({
    run_id: "apple-seed-01",
    node_id: "leader",
    round: 3,
    turn: 1,
    schema_version: 1,
    ts: "2026-04-17T20:23:15.092Z",
    output: { summary: "did stuff", messages: [{ to: "n1" }] },
    tool_calls: [{ name: "gh" }],
    tokens: { in: 10, out: 20 },
    model: "openai/gpt-5.4",
    latency_ms: 1234,
    cost_usd: 0,
  });
  const turn = parseNodeTurnLine(row);
  assert.deepEqual(turn, {
    nodeId: "leader",
    round: 3,
    ts: "2026-04-17T20:23:15.092Z",
    tokensIn: 10,
    tokensOut: 20,
    latencyMs: 1234,
    summary: "did stuff",
    outboundMessageCount: 1,
    toolCallCount: 1,
  } satisfies NodeTurn);
});

test("summarizeNodeTimeline groups turns by node and totals tokens/turns", () => {
  const turns: NodeTurn[] = [
    {
      nodeId: "leader",
      round: 1,
      ts: "t1",
      tokensIn: 10,
      tokensOut: 20,
      latencyMs: 100,
      summary: "a",
      outboundMessageCount: 1,
      toolCallCount: 0,
    },
    {
      nodeId: "leader",
      round: 2,
      ts: "t2",
      tokensIn: 5,
      tokensOut: 15,
      latencyMs: 50,
      summary: "b",
      outboundMessageCount: 2,
      toolCallCount: 3,
    },
    {
      nodeId: "n1",
      round: 2,
      ts: "t3",
      tokensIn: 1,
      tokensOut: 2,
      latencyMs: 10,
      summary: "c",
      outboundMessageCount: 0,
      toolCallCount: 0,
    },
  ];
  const timeline = summarizeNodeTimeline(turns);
  assert.deepEqual(timeline, [
    {
      nodeId: "leader",
      turns: [turns[0], turns[1]],
      totalTurns: 2,
      totalTokensIn: 15,
      totalTokensOut: 35,
    },
    {
      nodeId: "n1",
      turns: [turns[2]],
      totalTurns: 1,
      totalTokensIn: 1,
      totalTokensOut: 2,
    },
  ]);
});

test("buildMessageGraphData aggregates messages into directed edges with counts", () => {
  const messages: MessageEdge[] = [
    { round: 1, from: "leader", to: "n1", tag: "task", content: "x", ts: "t1" },
    {
      round: 2,
      from: "leader",
      to: "n1",
      tag: "status",
      content: "y",
      ts: "t2",
    },
    { round: 2, from: "n1", to: "leader", tag: "ack", content: "z", ts: "t3" },
    {
      round: 3,
      from: "leader",
      to: "n2",
      tag: "task",
      content: "w",
      ts: "t4",
    },
  ];
  const graph = buildMessageGraphData(messages);
  assert.deepEqual(graph.nodes.map((n) => n.id).sort(), ["leader", "n1", "n2"]);
  const leaderToN1 = graph.edges.find(
    (e) => e.source === "leader" && e.target === "n1",
  );
  assert.ok(leaderToN1);
  assert.equal(leaderToN1.count, 2);
  assert.equal(leaderToN1.firstRound, 1);
  assert.equal(leaderToN1.lastRound, 2);
  const n1ToLeader = graph.edges.find(
    (e) => e.source === "n1" && e.target === "leader",
  );
  assert.ok(n1ToLeader);
  assert.equal(n1ToLeader.count, 1);
  const leaderToN2 = graph.edges.find(
    (e) => e.source === "leader" && e.target === "n2",
  );
  assert.ok(leaderToN2);
  assert.equal(leaderToN2.count, 1);
  assert.equal(graph.edges.length, 3);
});

test("buildMessageGraphData returns empty nodes/edges for empty input", () => {
  const graph = buildMessageGraphData([]);
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
});

test("extractPrReferences collects distinct PR URLs with first-seen round and author", () => {
  const messages: MessageEdge[] = [
    {
      round: 1,
      from: "leader",
      to: "n1",
      tag: "status",
      content:
        "Scaffold merged via https://github.com/kunchenguid/org-bench/pull/2 today",
      ts: "t1",
    },
    {
      round: 2,
      from: "leader",
      to: "n2",
      tag: "status",
      content:
        "PR merged: https://github.com/kunchenguid/org-bench/pull/3 - follow up",
      ts: "t2",
    },
    {
      round: 3,
      from: "n1",
      to: "leader",
      tag: "status",
      content:
        "Please review https://github.com/kunchenguid/org-bench/pull/3 again.",
      ts: "t3",
    },
  ];
  const refs = extractPrReferences(messages);
  assert.deepEqual(refs, [
    {
      url: "https://github.com/kunchenguid/org-bench/pull/2",
      number: 2,
      firstSeenRound: 1,
      firstMentionedBy: "leader",
      mentionCount: 1,
    },
    {
      url: "https://github.com/kunchenguid/org-bench/pull/3",
      number: 3,
      firstSeenRound: 2,
      firstMentionedBy: "leader",
      mentionCount: 2,
    },
  ]);
});
