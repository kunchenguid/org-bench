import type { EvaluatorScenario, PlayerAction } from "./index.js";

export type EvaluatorScenarioId =
  | "loads-cleanly"
  | "navigates"
  | "starts-a-game"
  | "completes-a-turn"
  | "finishes-an-encounter"
  | "persists"
  | "rules-informative";

export type NamedEvaluatorScenario = EvaluatorScenario & {
  id: EvaluatorScenarioId;
};

function hasAllTerms(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();

  return terms.every((term) => normalized.includes(term));
}

function historyIncludes(history: PlayerAction[], text: string): boolean {
  const normalized = text.toLowerCase();

  return history.some((action) => {
    if (action.type !== "done" && action.type !== "blocked") {
      return false;
    }

    return action.note?.toLowerCase().includes(normalized) ?? false;
  });
}

function defineNamedScenario(
  id: EvaluatorScenarioId,
  scenario: EvaluatorScenario,
): NamedEvaluatorScenario {
  if (scenario.goal.trim().length === 0) {
    throw new Error("Scenario goal must be non-empty");
  }

  if (!Number.isInteger(scenario.stepCap) || scenario.stepCap <= 0) {
    throw new Error("Scenario step cap must be a positive integer");
  }

  return {
    id,
    ...scenario,
  };
}

export const evaluatorScenarios: NamedEvaluatorScenario[] = [
  defineNamedScenario("loads-cleanly", {
    goal: "Open the built site and confirm it renders without uncaught console errors.",
    stepCap: 3,
    checkOutcome: async ({ finalSnapshot, consoleErrors }) => {
      if (consoleErrors.length > 0) {
        throw new Error(
          "Loads-cleanly failed because the page emitted console errors.",
        );
      }

      return finalSnapshot.trim().length > 0
        ? {
            passed: true,
            rationale: "The site rendered and no console errors were observed.",
          }
        : {
            passed: false,
            rationale: "The page did not expose any visible rendered state.",
          };
    },
  }),
  defineNamedScenario("navigates", {
    goal: "From the home page, verify visible affordances reach play, rules, and card gallery surfaces.",
    stepCap: 8,
    checkOutcome: ({ finalSnapshot }) =>
      hasAllTerms(finalSnapshot, ["play", "rules", "gallery"])
        ? {
            passed: true,
            rationale:
              "Visible navigation reaches play, rules, and card gallery surfaces.",
          }
        : {
            passed: false,
            rationale:
              "Could not confirm visible affordances for play, rules, and card gallery.",
          },
  }),
  defineNamedScenario("starts-a-game", {
    goal: "Launch an encounter from the playable UI and confirm the game screen becomes visible.",
    stepCap: 12,
    checkOutcome: ({ finalSnapshot, history }) => {
      const snapshotShowsGame = hasAllTerms(finalSnapshot, ["hand", "deck"]);
      const historyShowsStart =
        historyIncludes(history, "encounter") ||
        historyIncludes(history, "game");

      return snapshotShowsGame || historyShowsStart
        ? {
            passed: true,
            rationale: "An encounter appears to have started successfully.",
          }
        : {
            passed: false,
            rationale: "The run never reached a visible in-game state.",
          };
    },
  }),
  defineNamedScenario("completes-a-turn", {
    goal: "Play through a legal turn and verify state visibly advances to the AI or next turn.",
    stepCap: 16,
    checkOutcome: ({ finalSnapshot, history }) => {
      const snapshotAdvanced =
        hasAllTerms(finalSnapshot, ["turn", "enemy"]) ||
        hasAllTerms(finalSnapshot, ["turn", "ai"]);
      const historyAdvanced =
        historyIncludes(history, "turn") || historyIncludes(history, "passed");

      return snapshotAdvanced || historyAdvanced
        ? {
            passed: true,
            rationale: "The board state advanced through a completed turn.",
          }
        : {
            passed: false,
            rationale: "Could not verify that a full turn resolved.",
          };
    },
  }),
  defineNamedScenario("finishes-an-encounter", {
    goal: "Continue playing until the encounter reaches a visible win or loss result.",
    stepCap: 30,
    checkOutcome: ({ finalSnapshot, history }) => {
      const snapshotFinished =
        hasAllTerms(finalSnapshot, ["victory"]) ||
        hasAllTerms(finalSnapshot, ["defeat"]) ||
        hasAllTerms(finalSnapshot, ["win"]) ||
        hasAllTerms(finalSnapshot, ["loss"]);
      const historyFinished =
        historyIncludes(history, "victory") ||
        historyIncludes(history, "defeat") ||
        historyIncludes(history, "win") ||
        historyIncludes(history, "loss");

      return snapshotFinished || historyFinished
        ? {
            passed: true,
            rationale: "The encounter reached a visible final result.",
          }
        : {
            passed: false,
            rationale:
              "The encounter did not resolve within the scenario budget.",
          };
    },
  }),
  defineNamedScenario("persists", {
    goal: "Reload mid-session, then confirm the site offers resume flow and restores visible game state.",
    stepCap: 10,
    setup: async ({ open }) => {
      await open("/");
    },
    checkOutcome: ({ finalSnapshot, history }) => {
      const snapshotShowsResume =
        hasAllTerms(finalSnapshot, ["resume"]) &&
        (hasAllTerms(finalSnapshot, ["battlefield"]) ||
          hasAllTerms(finalSnapshot, ["hand"]));
      const historyShowsReload =
        historyIncludes(history, "reload") ||
        historyIncludes(history, "resume");

      return snapshotShowsResume || historyShowsReload
        ? {
            passed: true,
            rationale:
              "Saved state was available after reload and visible to the player.",
          }
        : {
            passed: false,
            rationale: "Could not confirm resume flow after reload.",
          };
    },
  }),
  defineNamedScenario("rules-informative", {
    goal: "Read the rules page and confirm it explains core turn flow, resources, and card types.",
    stepCap: 8,
    checkOutcome: ({ finalSnapshot }) =>
      hasAllTerms(finalSnapshot, ["turn"]) &&
      hasAllTerms(finalSnapshot, ["resource"]) &&
      (hasAllTerms(finalSnapshot, ["creature"]) ||
        hasAllTerms(finalSnapshot, ["spell"]))
        ? {
            passed: true,
            rationale:
              "The rules page describes turn flow, resources, and card types.",
          }
        : {
            passed: false,
            rationale:
              "The rules page did not clearly explain the game's basic rules.",
          },
  }),
];
