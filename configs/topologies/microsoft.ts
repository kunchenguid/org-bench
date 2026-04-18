import type { TopologyConfig } from "@org-bench/orchestrator";

export const microsoft: TopologyConfig = {
  slug: "microsoft",
  name: "Microsoft",
  nodes: ["leader", "divA", "divB", "a1", "a2", "a3", "b1", "b2", "b3"],
  edges: [
    { from: "leader", to: "divA", bidir: true },
    { from: "leader", to: "divB", bidir: true },
    { from: "divA", to: "a1", bidir: true },
    { from: "divA", to: "a2", bidir: true },
    { from: "divA", to: "a3", bidir: true },
    { from: "divB", to: "b1", bidir: true },
    { from: "divB", to: "b2", bidir: true },
    { from: "divB", to: "b3", bidir: true },
  ],
  leader: "leader",
  writeAccess: { kind: "leader+divisions" },
  culture: {
    kind: "microsoft-competition",
    charters: {
      divA: "combat loop, encounter flow, AI opponents, and the play page",
      divB: "card content, deckbuilding rules, the rules page, and the play page",
    },
    contested: ["play page"],
    leaderPrompt:
      "You arbitrate between the two divisions. On contested surfaces you will merge only one vision. Expect both divisions to ship their own competing PRs for every contested surface. Read both, pick one, and be explicit in the merge commit about why the losing division's approach lost. Do not try to merge both - pick.",
    divisionHeadPrompt:
      "You are competing with the other division. The leader will merge only one vision per contested area, so SHIP YOUR OWN VERSION of every contested surface - do not cede it to the rival just because they are working on it. Open your own PR against `main` on every contested surface, clearly signed as your division's vision. Advocate for yours in PR descriptions and reviews. Push back on the rival's PRs in comments when their approach would harm your charter.",
    divisionWorkerPrompt:
      "You are loyal to your division's vision. The other division is a rival, not a collaborator. Ship your own division's take on every contested surface - even if the rival division is already working on it. Open PRs under your division head's guidance; never defer to the rival's implementation on contested areas. In PR reviews, advocate for your division's approach and push back on the other's.",
  },
};
