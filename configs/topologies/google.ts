import type { TopologyConfig } from "@org-bench/orchestrator";

const middleExpectation =
  "Middle integrator at Google, a promoted peer. Reviews design docs from connected workers (Emma, Frank, Grace, Henry), asks for data or metrics when claims are made, and merges only after consensus forms in the doc comments. Prefers data over opinion.";

const workerExpectation =
  "Worker at Google. Every substantive change starts with a short design doc shared with connected middle integrators (Alice, Ben, Carol, Dave). Cites data or metrics when making claims. Expects review comments; responds with edits, not arguments.";

export const google: TopologyConfig = {
  slug: "google",
  name: "Google",
  nodes: [
    "Eric",
    "Alice",
    "Ben",
    "Carol",
    "Dave",
    "Emma",
    "Frank",
    "Grace",
    "Henry",
  ],
  edges: [
    { from: "Eric", to: "Alice", bidir: true },
    { from: "Eric", to: "Ben", bidir: true },
    { from: "Eric", to: "Carol", bidir: true },
    { from: "Eric", to: "Dave", bidir: true },
    { from: "Alice", to: "Emma", bidir: true },
    { from: "Alice", to: "Frank", bidir: true },
    { from: "Alice", to: "Grace", bidir: true },
    { from: "Alice", to: "Henry", bidir: true },
    { from: "Ben", to: "Emma", bidir: true },
    { from: "Ben", to: "Frank", bidir: true },
    { from: "Ben", to: "Grace", bidir: true },
    { from: "Ben", to: "Henry", bidir: true },
    { from: "Carol", to: "Emma", bidir: true },
    { from: "Carol", to: "Frank", bidir: true },
    { from: "Carol", to: "Grace", bidir: true },
    { from: "Carol", to: "Henry", bidir: true },
    { from: "Dave", to: "Emma", bidir: true },
    { from: "Dave", to: "Frank", bidir: true },
    { from: "Dave", to: "Grace", bidir: true },
    { from: "Dave", to: "Henry", bidir: true },
  ],
  leader: "Eric",
  developers: [
    "Alice",
    "Ben",
    "Carol",
    "Dave",
    "Emma",
    "Frank",
    "Grace",
    "Henry",
  ],
  integrators: ["Eric", "Alice", "Ben", "Carol", "Dave"],
  nodeExpectations: {
    Eric: "Leader at Google, practicing design-doc culture. Non-trivial delegation goes through a short technical design document: problem statement, options considered with trade-offs, chosen approach, and success metrics. Expects TDD-review-style responses. Does not open code PRs; only reviews and merges after design doc consensus.",
    Alice: middleExpectation,
    Ben: middleExpectation,
    Carol: middleExpectation,
    Dave: middleExpectation,
    Emma: workerExpectation,
    Frank: workerExpectation,
    Grace: workerExpectation,
    Henry: workerExpectation,
  },
  culture: {
    kind: "google-design-docs",
    summary:
      "Google culture - design docs + data-driven consensus. Claims need data.",
  },
};
