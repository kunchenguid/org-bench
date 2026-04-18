import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  createReferenceBuildArtifacts,
  applyReferenceAppAction,
  createReferenceApp,
  endEncounterTurn,
  navigateToPage,
  playEncounterCard,
  renderAppHtml,
  resumeEncounter,
  restoreReferenceApp,
  serializeReferenceApp,
  startEncounter,
} from "./index.js";

test("renderAppHtml exposes the core site navigation and a start encounter call to action", () => {
  const app = createReferenceApp();

  const html = renderAppHtml(app);

  assert.match(html, /Sky Duel TCG/);
  assert.match(html, /Home/);
  assert.match(html, /Play/);
  assert.match(html, /Rules/);
  assert.match(html, /Card Gallery/);
  assert.match(html, /Start Encounter 1/);
  assert.match(html, /aria-current="page"[^>]*>Home</);
  assert.match(html, /data-action="navigate"/);
  assert.match(html, /data-page="play"/);
  assert.match(html, /data-action="start-encounter"/);
  assert.match(html, /data-encounter-index="0"/);
});

test("renderAppHtml shows duel state after starting the first encounter", () => {
  const app = startEncounter(createReferenceApp(), 0);

  const html = renderAppHtml(app);

  assert.match(html, /Encounter 1: Ember Trial/);
  assert.match(html, /Player HP: 20/);
  assert.match(html, /Enemy HP: 16/);
  assert.match(html, /Enemy resources: 1\/1/);
  assert.match(html, /Hand/);
  assert.match(html, /Battlefield/);
  assert.match(html, /End Turn/);
});

test("later encounters use distinct enemy deck themes instead of only extra health", () => {
  const unlockedSecond = {
    ...createReferenceApp(),
    encounters: createReferenceApp().encounters.map((encounter, index) =>
      index === 0 ? { ...encounter, completed: true } : encounter,
    ),
  };
  const unlockedThird = {
    ...createReferenceApp(),
    encounters: createReferenceApp().encounters.map((encounter, index) =>
      index < 2 ? { ...encounter, completed: true } : encounter,
    ),
  };
  const secondEncounter = startEncounter(unlockedSecond, 1);
  const thirdEncounter = startEncounter(unlockedThird, 2);
  const secondNames = new Set(
    secondEncounter.encounter?.enemy.hand.map((card) => card.name) ?? [],
  );
  const thirdNames = new Set(
    thirdEncounter.encounter?.enemy.hand.map((card) => card.name) ?? [],
  );

  assert.equal(secondNames.has("Mistblade Adept"), true);
  assert.equal(thirdNames.has("Aerie Skirmisher"), true);
});

test("playEncounterCard updates duel state and rendered controls for a played hand card", () => {
  const app = startEncounter(createReferenceApp(), 0);
  const cardId = app.encounter?.player.hand[0]?.id;

  assert.ok(cardId);

  const next = playEncounterCard(app, cardId);
  const html = renderAppHtml(next);

  assert.equal(next.encounter?.player.resources.current, 0);
  assert.equal(
    next.encounter?.player.hand.some((card) => card.id === cardId),
    false,
  );
  assert.equal(
    next.encounter?.player.battlefield.some((card) => card.id === cardId),
    true,
  );
  assert.match(html, /Resources: 0\/1/);
  assert.match(html, /Play Ember Warden/);
  assert.match(html, /player summons Ember Warden\./);
  assert.match(html, /Player board attacks for 2/);
});

test("play page surfaces a race outlook after you commit board pressure", () => {
  const app = startEncounter(createReferenceApp(), 0);
  const cardId = app.encounter?.player.hand[0]?.id;

  assert.ok(cardId);

  const next = playEncounterCard(app, cardId);
  const html = renderAppHtml(next);

  assert.match(html, /Race Outlook/);
  assert.match(html, /You present a 2-damage swing each turn\./);
  assert.match(html, /Enemy defeat in 8 player turns if the board sticks\./);
  assert.match(html, /Enemy has no return lethal clock yet\./);
});

test("play page surfaces an encounter-specific matchup brief", () => {
  const unlockedSecond = {
    ...createReferenceApp(),
    encounters: createReferenceApp().encounters.map((encounter, index) =>
      index === 0 ? { ...encounter, completed: true } : encounter,
    ),
  };
  const app = startEncounter(unlockedSecond, 1);

  const html = renderAppHtml(app);

  assert.match(html, /Matchup Brief/);
  assert.match(html, /Mist Channeler/);
  assert.match(html, /steady chip damage and efficient tempo/i);
  assert.match(html, /trade resources early so your heavier turns take over/i);
});

test("play page surfaces signature enemy threats inside the matchup brief", () => {
  const unlockedThird = {
    ...createReferenceApp(),
    encounters: createReferenceApp().encounters.map((encounter, index) =>
      index < 2 ? { ...encounter, completed: true } : encounter,
    ),
  };
  const app = startEncounter(unlockedThird, 2);

  const html = renderAppHtml(app);

  assert.match(html, /Signature threats/i);
  assert.match(html, /Aerie Skirmisher/);
  assert.match(html, /Citadel Roc/);
  assert.match(html, /Heavenfall/);
});

test("navigateToPage changes which primary page is rendered", () => {
  const app = navigateToPage(createReferenceApp(), "rules");

  const html = renderAppHtml(app);

  assert.match(html, /How to Play/);
  assert.match(html, /resource/i);
  assert.match(html, /Ember/i);
  assert.match(html, /Sky/i);
  assert.match(html, /Turn Flow/i);
  assert.match(html, /Solo Ladder/i);
  assert.match(html, /next encounter/i);
  assert.match(html, /localStorage/i);
  assert.match(html, /do not block/i);
  assert.doesNotMatch(html, /Select an encounter from the home page to begin/);
});

test("rules page explains the fixed deckbuilding constraints for the ladder", () => {
  const app = navigateToPage(createReferenceApp(), "rules");

  const html = renderAppHtml(app);

  assert.match(html, /Deckbuilding Rules/i);
  assert.match(html, /20-card deck/i);
  assert.match(html, /exactly 2 copies/i);
  assert.match(html, /10 unique card designs/i);
  assert.match(html, /fixed Ember list/i);
});

test("rules page summarizes the three ladder rival archetypes", () => {
  const app = navigateToPage(createReferenceApp(), "rules");

  const html = renderAppHtml(app);

  assert.match(html, /Ladder Rivals/i);
  assert.match(html, /Ashen Sentinel/);
  assert.match(html, /Mist Channeler/);
  assert.match(html, /Aerie Marshal/);
  assert.match(html, /straight race/i);
  assert.match(html, /tempo/i);
  assert.match(html, /larger aerial bodies/i);
});

test("card gallery references the full ladder card pool", () => {
  const app = navigateToPage(createReferenceApp(), "gallery");
  const html = renderAppHtml(app);

  assert.match(html, /Ember Warden/);
  assert.match(html, /Mistblade Adept/);
  assert.match(html, /Aerie Skirmisher/);
});

test("endEncounterTurn advances the active encounter through a full visible turn", () => {
  const app = startEncounter(createReferenceApp(), 0);

  const next = endEncounterTurn(app);
  const html = renderAppHtml(next);

  assert.equal(next.encounter?.turn, 2);
  assert.match(html, /Turn: 2/);
  assert.match(html, /Player HP:/);
  assert.match(html, /Enemy HP:/);
});

test("renderAppHtml shows a visible encounter result when the duel is over", () => {
  const app = startEncounter(createReferenceApp(), 0);

  assert.ok(app.encounter);

  const victoryState = {
    ...app,
    encounter: {
      ...app.encounter,
      status: "victory" as const,
    },
  };
  const defeatState = {
    ...app,
    encounter: {
      ...app.encounter,
      status: "defeat" as const,
    },
  };

  assert.match(renderAppHtml(victoryState), /Victory/i);
  assert.match(renderAppHtml(victoryState), /Return to Ladder/i);
  assert.match(renderAppHtml(victoryState), /Start Encounter 2/i);
  assert.match(renderAppHtml(defeatState), /Defeat/i);
  assert.match(renderAppHtml(defeatState), /Return to Ladder/i);
});

test("serializeReferenceApp and restoreReferenceApp round-trip an in-progress encounter", () => {
  const app = endEncounterTurn(startEncounter(createReferenceApp(), 1));

  const serialized = serializeReferenceApp(app);
  const restored = restoreReferenceApp(serialized);

  assert.deepEqual(restored, app);
});

test("home page offers a resume path for an in-progress saved encounter", () => {
  const unlockedApp = {
    ...createReferenceApp(),
    encounters: createReferenceApp().encounters.map((encounter, index) =>
      index === 0 ? { ...encounter, completed: true } : encounter,
    ),
  };
  const inProgress = endEncounterTurn(startEncounter(unlockedApp, 1));
  const restored = restoreReferenceApp(serializeReferenceApp(inProgress));
  const home = navigateToPage(restored, "home");

  const homeHtml = renderAppHtml(home);

  assert.match(homeHtml, /Resume Encounter 2/);
  assert.match(homeHtml, /Saved state - Turn 2, Hand \d+, Battlefield 0/);

  const resumed = resumeEncounter(home);
  const resumedHtml = renderAppHtml(resumed);

  assert.equal(resumed.page, "play");
  assert.match(resumedHtml, /Encounter 2: Tidal Crossing/);
  assert.match(resumedHtml, /Turn: 2/);
});

test("ladder encounters unlock only after the previous duel is won", () => {
  const freshApp = createReferenceApp();
  const lockedAttempt = startEncounter(freshApp, 1);

  assert.equal(lockedAttempt, freshApp);
  assert.match(
    renderAppHtml(freshApp),
    /Locked until you win the previous duel/,
  );

  const started = startEncounter(freshApp, 0);

  assert.ok(started.encounter);

  const winningState = {
    ...started,
    encounter: {
      ...started.encounter,
      enemy: {
        ...started.encounter.enemy,
        hp: 0,
      },
      status: "victory" as const,
    },
  };
  const progressed = endEncounterTurn(winningState);
  const secondEncounter = startEncounter(progressed, 1);

  assert.equal(progressed.encounters[0]?.completed, true);
  assert.equal(secondEncounter.activeEncounterIndex, 1);
});

test("home page shows a finished-run callout after the full ladder is cleared", () => {
  const completedApp = {
    ...createReferenceApp(),
    encounters: createReferenceApp().encounters.map((encounter) => ({
      ...encounter,
      completed: true,
    })),
  };

  const html = renderAppHtml(completedApp);

  assert.match(html, /Ladder complete/);
  assert.match(html, /Replay any fight to improve your finish/i);
});

test("applyReferenceAppAction routes UI actions through the existing app state helpers", () => {
  const started = applyReferenceAppAction(createReferenceApp(), {
    type: "start-encounter",
    encounterIndex: 0,
  });
  const cardId = started.encounter?.player.hand[0]?.id;

  assert.ok(cardId);

  const played = applyReferenceAppAction(started, {
    type: "play-card",
    cardId,
  });
  const rules = applyReferenceAppAction(played, {
    type: "navigate",
    page: "rules",
  });
  const resumed = applyReferenceAppAction(rules, {
    type: "resume-encounter",
  });
  const ended = applyReferenceAppAction(resumed, {
    type: "end-turn",
  });

  assert.equal(started.page, "play");
  assert.equal(
    played.encounter?.player.hand.some((card) => card.id === cardId),
    false,
  );
  assert.equal(rules.page, "rules");
  assert.equal(resumed.page, "play");
  assert.equal(ended.encounter?.turn, 2);
});

test("createReferenceBuildArtifacts creates a relative-path browser app shell", () => {
  const artifacts = createReferenceBuildArtifacts(createReferenceApp(), {
    storageNamespace: "run-demo:",
  });

  assert.deepEqual(Object.keys(artifacts).sort(), [
    "app.js",
    "favicon.svg",
    "index.html",
    "styles.css",
  ]);
  assert.match(artifacts["index.html"], /<!doctype html>/i);
  assert.match(artifacts["index.html"], /<div id="app"/);
  assert.match(
    artifacts["index.html"],
    /<script type="module" src="\.\/app\.js"><\/script>/,
  );
  assert.match(
    artifacts["index.html"],
    /<link rel="stylesheet" href="\.\/styles\.css" \/>/,
  );
  assert.match(
    artifacts["index.html"],
    /<link rel="icon" href="\.\/favicon\.svg" type="image\/svg\+xml" \/>/,
  );
  assert.match(artifacts["app.js"], /run-demo:/);
  assert.match(
    artifacts["favicon.svg"],
    /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/i,
  );
  assert.match(artifacts["app.js"], /localStorage/);
  assert.match(artifacts["styles.css"], /\.app-shell/);
  assert.doesNotMatch(artifacts["index.html"], /(?:src|href)="\//);
});

test("createReferenceBuildArtifacts hydrates the app shell from saved browser state", () => {
  const unlockedApp = {
    ...createReferenceApp(),
    encounters: createReferenceApp().encounters.map((encounter, index) =>
      index === 0 ? { ...encounter, completed: true } : encounter,
    ),
  };
  const restoredApp = navigateToPage(
    endEncounterTurn(startEncounter(unlockedApp, 1)),
    "home",
  );
  const artifacts = createReferenceBuildArtifacts(createReferenceApp(), {
    storageNamespace: "run-demo:",
  });
  const root = {
    innerHTML:
      '<main><section aria-label="home"><h1>Sky Duel TCG</h1></section></main>',
  };
  const localStorage = {
    getItem(key: string) {
      assert.equal(key, "run-demo:reference-app-save");
      return serializeReferenceApp(restoredApp);
    },
    setItem() {
      throw new Error("saved state should not be overwritten during hydration");
    },
  };
  const document = {
    getElementById(id: string) {
      assert.equal(id, "app");
      return root;
    },
  };
  const windowObject = {
    localStorage,
  } as {
    localStorage: typeof localStorage;
    __SKY_DUEL_BOOTSTRAP__?: unknown;
  };

  vm.runInNewContext(artifacts["app.js"], {
    window: windowObject,
    document,
  });

  assert.match(root.innerHTML, /Resume Encounter 2/);
  assert.match(root.innerHTML, /Saved state - Turn 2, Hand \d+, Battlefield 0/);
  assert.match(root.innerHTML, /Tidal Crossing/);
});

test("createReferenceBuildArtifacts handles click actions by re-rendering and persisting state", () => {
  const artifacts = createReferenceBuildArtifacts(createReferenceApp(), {
    storageNamespace: "run-demo:",
  });
  const storageWrites: Array<{ key: string; value: string }> = [];
  const localStorage = {
    getItem(key: string) {
      assert.equal(key, "run-demo:reference-app-save");
      return null;
    },
    setItem(key: string, value: string) {
      storageWrites.push({ key, value });
    },
  };
  const root = {
    innerHTML: "",
    listeners: new Map<
      string,
      (event: {
        target: {
          closest: (
            selector: string,
          ) => { dataset: Record<string, string> } | null;
        };
      }) => void
    >(),
    addEventListener(
      eventName: string,
      listener: (event: {
        target: {
          closest: (
            selector: string,
          ) => { dataset: Record<string, string> } | null;
        };
      }) => void,
    ) {
      this.listeners.set(eventName, listener);
    },
  };
  const document = {
    getElementById(id: string) {
      assert.equal(id, "app");
      return root;
    },
  };
  const windowObject = {
    localStorage,
  } as {
    localStorage: typeof localStorage;
    __SKY_DUEL_BOOTSTRAP__?: unknown;
  };

  vm.runInNewContext(artifacts["app.js"], {
    window: windowObject,
    document,
  });

  const clickListener = root.listeners.get("click");

  assert.ok(clickListener);
  assert.match(root.innerHTML, /Start Encounter 1/);
  assert.equal(storageWrites.length, 1);

  clickListener({
    target: {
      closest: (selector: string) => {
        assert.equal(selector, "[data-action]");
        return {
          dataset: {
            action: "start-encounter",
            encounterIndex: "0",
          },
        };
      },
    },
  });

  assert.match(root.innerHTML, /Encounter 1: Ember Trial/);
  assert.match(root.innerHTML, /Play Ember Warden/);
  assert.equal(storageWrites.length, 2);

  clickListener({
    target: {
      closest: () => ({
        dataset: {
          action: "end-turn",
        },
      }),
    },
  });

  assert.match(root.innerHTML, /Turn: 2/);
  assert.equal(storageWrites.length, 3);

  const latestSave = storageWrites.at(-1);

  assert.ok(latestSave);
  assert.equal(latestSave.key, "run-demo:reference-app-save");
  assert.match(latestSave.value, /"turn":2/);
});
