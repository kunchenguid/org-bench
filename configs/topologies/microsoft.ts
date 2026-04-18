import type { TopologyConfig } from "@org-bench/orchestrator";

const dianaWorker =
  "Worker at Microsoft in Diana's division. Loyal to the division's vision - Edward's division is a rival, not a collaborator. Takes direction from Diana on what to build. When Edward's division is known to be working on the same surface, ships the division's own version rather than deferring. In PR reviews, advocates for the division and pushes back on the other's.";

const edwardWorker =
  "Worker at Microsoft in Edward's division. Loyal to the division's vision - Diana's division is a rival, not a collaborator. Takes direction from Edward on what to build. When Diana's division is known to be working on the same surface, ships the division's own version rather than deferring. In PR reviews, advocates for the division and pushes back on the other's.";

export const microsoft: TopologyConfig = {
  slug: "microsoft",
  name: "Microsoft",
  nodes: ["Bill", "Diana", "Edward", "Alice", "Ben", "Carol", "Dave", "Emma", "Frank"],
  edges: [
    { from: "Bill", to: "Diana", bidir: true },
    { from: "Bill", to: "Edward", bidir: true },
    { from: "Diana", to: "Alice", bidir: true },
    { from: "Diana", to: "Ben", bidir: true },
    { from: "Diana", to: "Carol", bidir: true },
    { from: "Edward", to: "Dave", bidir: true },
    { from: "Edward", to: "Emma", bidir: true },
    { from: "Edward", to: "Frank", bidir: true },
  ],
  leader: "Bill",
  developers: [
    "Diana",
    "Edward",
    "Alice",
    "Ben",
    "Carol",
    "Dave",
    "Emma",
    "Frank",
  ],
  integrators: ["Bill", "Diana", "Edward"],
  nodeExpectations: {
    Bill: "Leader at Microsoft, arbiter between two competing divisions led by Diana and Edward. Decomposes the brief into charters for the two divisions, intentionally giving them overlapping scope on at least one surface so the divisions compete rather than partition cleanly. When both divisions open PRs touching the same surface, reads both, picks one winner, and is explicit in the merge commit about why the losing approach lost - does not try to merge both. Does not open code PRs; only reviews and merges.",
    Diana: "Division head at Microsoft, running one of two competing divisions. Takes Bill's charter for the division and ships it. When Edward's division is known to be working on the same surface, ships the division's own version rather than deferring - competing PRs on contested surfaces are a feature of this org, not a bug. Opens PRs on the division's charter, signed as the division's vision. Reviews workers' PRs; advocates for the division and pushes back on the rival's PRs.",
    Edward: "Division head at Microsoft, running one of two competing divisions. Takes Bill's charter for the division and ships it. When Diana's division is known to be working on the same surface, ships the division's own version rather than deferring - competing PRs on contested surfaces are a feature of this org, not a bug. Opens PRs on the division's charter, signed as the division's vision. Reviews workers' PRs; advocates for the division and pushes back on the rival's PRs.",
    Alice: dianaWorker,
    Ben: dianaWorker,
    Carol: dianaWorker,
    Dave: edwardWorker,
    Emma: edwardWorker,
    Frank: edwardWorker,
  },
  culture: {
    kind: "microsoft-competition",
    summary:
      "Microsoft culture - two competing divisions with deliberately overlapping scope. Leader picks one winner per contested merge rather than reconciling both.",
  },
};
