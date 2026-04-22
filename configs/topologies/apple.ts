import type { TopologyConfig } from "@org-bench/orchestrator";

const workerExpectation =
  "Worker at Apple. Steve assigns your scope; build ONLY what Steve asks you to, nothing more. Do NOT build a full product on your branch, and do NOT touch surfaces Steve has given to other workers. If you finish your assigned scope, wait or ask Steve before expanding. Connected only to Steve; no direct edge to other workers - you learn what peers are doing only from what Steve tells you. Work ships when Steve approves it for taste and polish. Polish the piece you were given.";

export const apple: TopologyConfig = {
  slug: "apple",
  name: "Apple",
  nodes: ["Steve", "Alice", "Ben", "Carol", "Dave", "Emma", "Frank", "Grace", "Henry"],
  edges: [
    { from: "Steve", to: "Alice", bidir: true },
    { from: "Steve", to: "Ben", bidir: true },
    { from: "Steve", to: "Carol", bidir: true },
    { from: "Steve", to: "Dave", bidir: true },
    { from: "Steve", to: "Emma", bidir: true },
    { from: "Steve", to: "Frank", bidir: true },
    { from: "Steve", to: "Grace", bidir: true },
    { from: "Steve", to: "Henry", bidir: true },
  ],
  leader: "Steve",
  developers: ["Alice", "Ben", "Carol", "Dave", "Emma", "Frank", "Grace", "Henry"],
  integrators: ["Steve"],
  nodeExpectations: {
    Steve: "Leader at Apple and sole aesthetic arbiter. Quality over schedule. Rejects anything that fails the polish bar, even if it technically works, and will NOT declare final submission while there are known runtime bugs, unreliable user flows, or integration seams that fail end-to-end in the live app. Use every available round if that's what it takes to close real issues - this overrides any general guidance about minimizing round count. Your first job is to divide the work clearly: hand each worker a specific scope that does not overlap with any other worker's scope, and tell each worker explicitly what they should and should not build. Name the boundaries (e.g. \"you build the formula engine; the UI and clipboard belong to someone else\"). After PRs start merging, you must also personally use the composed product end-to-end: open the live shipped app and make sure it meets your bar both functionally and aesthetically. When you find a bug or missing behavior, identify the worker whose subsystem owns it and send them a specific, reproducible bug report - do NOT write the fix yourself. Does not open code PRs; only reviews, tests the live app, and merges.",
    Alice: workerExpectation,
    Ben: workerExpectation,
    Carol: workerExpectation,
    Dave: workerExpectation,
    Emma: workerExpectation,
    Frank: workerExpectation,
    Grace: workerExpectation,
    Henry: workerExpectation,
  },
  culture: {
    kind: "apple-taste",
    summary: "Apple culture - taste bar + secrecy. Polish-first. Quality over schedule.",
  },
};
