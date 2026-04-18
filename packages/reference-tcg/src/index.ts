export type CombatantId = "player" | "enemy";

export type CreatureCard = {
  id: string;
  name: string;
  type: "creature";
  cost: number;
  attack: number;
  health: number;
};

export type SpellCard = {
  id: string;
  name: string;
  type: "spell";
  cost: number;
  damage: number;
};

export type Card = CreatureCard | SpellCard;

export type CombatantState = {
  hp: number;
  deck: Card[];
  hand: Card[];
  discard: Card[];
  battlefield: CreatureCard[];
  resources: {
    current: number;
    max: number;
  };
};

export type EncounterState = {
  turn: number;
  activePlayer: CombatantId;
  status: "in-progress" | "victory" | "defeat";
  log: string[];
  player: CombatantState;
  enemy: CombatantState;
};

export type CreateEncounterInput = {
  playerDeck?: Card[];
  enemyDeck?: Card[];
  enemyHp?: number;
};

export type ReferencePage = "home" | "play" | "rules" | "gallery";

export type EncounterSummary = {
  id: string;
  title: string;
  enemyName: string;
  enemyHp: number;
  enemyDeck: Card[];
  completed: boolean;
};

export type ReferenceAppState = {
  page: ReferencePage;
  encounters: EncounterSummary[];
  activeEncounterIndex: number | null;
  encounter: EncounterState | null;
};

export type ReferenceAppSave = {
  version: 1;
  state: ReferenceAppState;
};

export type ReferenceBuildArtifacts = Record<string, string>;

export type CreateReferenceBuildArtifactsOptions = {
  storageNamespace: string;
};

export type ReferenceAppAction =
  | {
      type: "navigate";
      page: ReferencePage;
    }
  | {
      type: "start-encounter";
      encounterIndex: number;
    }
  | {
      type: "resume-encounter";
    }
  | {
      type: "play-card";
      cardId: string;
    }
  | {
      type: "end-turn";
    };

const OPENING_HAND_SIZE = 4;
const PLAYER_STARTING_HP = 20;
const ENEMY_STARTING_HP = 16;

function cloneCard<T extends Card>(card: T): T {
  return { ...card };
}

function cloneDeck(deck: Card[]): Card[] {
  return deck.map((card) => cloneCard(card));
}

function drawCards(
  deck: Card[],
  count: number,
): { hand: Card[]; deck: Card[] } {
  return {
    hand: deck.slice(0, count),
    deck: deck.slice(count),
  };
}

function createCombatantState(hp: number, deck: Card[]): CombatantState {
  const clonedDeck = cloneDeck(deck);
  const openingDraw = drawCards(clonedDeck, OPENING_HAND_SIZE);

  return {
    hp,
    deck: openingDraw.deck,
    hand: openingDraw.hand,
    discard: [],
    battlefield: [],
    resources: {
      current: 1,
      max: 1,
    },
  };
}

function withUpdatedCombatant(
  encounter: EncounterState,
  side: CombatantId,
  combatant: CombatantState,
): EncounterState {
  return side === "player"
    ? { ...encounter, player: combatant }
    : { ...encounter, enemy: combatant };
}

function updateStatus(encounter: EncounterState): EncounterState {
  if (encounter.enemy.hp <= 0) {
    return {
      ...encounter,
      status: "victory",
      enemy: { ...encounter.enemy, hp: 0 },
    };
  }

  if (encounter.player.hp <= 0) {
    return {
      ...encounter,
      status: "defeat",
      player: { ...encounter.player, hp: 0 },
    };
  }

  return encounter;
}

function drawOne(combatant: CombatantState): CombatantState {
  if (combatant.deck.length === 0) {
    return combatant;
  }

  return {
    ...combatant,
    hand: [...combatant.hand, cloneCard(combatant.deck[0]!)],
    deck: combatant.deck.slice(1),
  };
}

function creatureAttackTotal(creatures: CreatureCard[]): number {
  return creatures.reduce((sum, creature) => sum + creature.attack, 0);
}

function turnsToDefeat(damagePerTurn: number, hp: number): number | null {
  if (damagePerTurn <= 0) {
    return null;
  }

  return Math.ceil(hp / damagePerTurn);
}

function describeRaceOutlook(encounter: EncounterState): {
  playerClock: string;
  enemyClock: string;
} {
  const playerAttack = creatureAttackTotal(encounter.player.battlefield);
  const enemyAttack = creatureAttackTotal(encounter.enemy.battlefield);
  const playerTurnsToWin = turnsToDefeat(playerAttack, encounter.enemy.hp);
  const enemyTurnsToWin = turnsToDefeat(enemyAttack, encounter.player.hp);

  return {
    playerClock:
      playerTurnsToWin === null
        ? "You do not present a lethal clock yet."
        : `You present a ${playerAttack}-damage swing each turn. Enemy defeat in ${playerTurnsToWin} player turns if the board sticks.`,
    enemyClock:
      enemyTurnsToWin === null
        ? "Enemy has no return lethal clock yet."
        : `Enemy threatens to end the race in ${enemyTurnsToWin} turns if you give the board back.`,
  };
}

function describeEncounterPlan(encounter: EncounterSummary): string {
  switch (encounter.id) {
    case "ember-trial":
      return "Ashen Sentinel mirrors your fundamentals. Stay efficient on board so your cleaner curve wins the straight race.";
    case "tidal-crossing":
      return "Mist Channeler pressures with steady chip damage and efficient tempo. Trade resources early so your heavier turns take over.";
    case "sky-citadel":
      return "Aerie Marshal closes with larger aerial bodies. Preserve enough life to absorb early hits before you swing back with bigger burn turns.";
    default:
      return `${encounter.enemyName} brings a fixed ladder list. Spend early mana cleanly and plan around the race clock.`;
  }
}

function describeEncounterThreats(encounter: EncounterSummary): string[] {
  switch (encounter.id) {
    case "ember-trial":
      return ["Ember Warden", "Sunsteel Colossus", "Solar Collapse"];
    case "tidal-crossing":
      return ["Mistblade Adept", "Tidecall Leviathan", "Tempest Break"];
    case "sky-citadel":
      return ["Aerie Skirmisher", "Citadel Roc", "Heavenfall"];
    default:
      return [];
  }
}

function startPlayerTurn(encounter: EncounterState): EncounterState {
  const nextResources = Math.min(10, encounter.turn);
  const player = drawOne({
    ...encounter.player,
    resources: {
      current: nextResources,
      max: nextResources,
    },
  });

  return {
    ...encounter,
    activePlayer: "player",
    player,
    log: [...encounter.log, `Turn ${encounter.turn}: player begins.`],
  };
}

function resolveEnemyTurn(encounter: EncounterState): EncounterState {
  let next: EncounterState = {
    ...encounter,
    activePlayer: "enemy" as const,
    log: [...encounter.log, `Turn ${encounter.turn}: enemy responds.`],
  };

  if (next.status !== "in-progress") {
    return next;
  }

  next = {
    ...next,
    enemy: drawOne(next.enemy),
  };

  const playableCard = next.enemy.hand.find(
    (card) => card.cost <= next.enemy.resources.current,
  );

  if (playableCard) {
    next = playCard(next, playableCard.id, "enemy");
  }

  if (next.status !== "in-progress") {
    return next;
  }

  const enemyAttack = creatureAttackTotal(next.enemy.battlefield);

  if (enemyAttack > 0) {
    next = updateStatus({
      ...next,
      player: {
        ...next.player,
        hp: next.player.hp - enemyAttack,
      },
      log: [...next.log, `Enemy attacks for ${enemyAttack}.`],
    });
  }

  return next;
}

function createDeckFromTemplates(
  prefix: string,
  cardSet: Array<Omit<CreatureCard, "id"> | Omit<SpellCard, "id">>,
): Card[] {
  return cardSet.flatMap((card, cardIndex) =>
    Array.from({ length: 2 }, (_, copyIndex) => ({
      ...card,
      id: `${prefix}-${cardIndex + 1}-${copyIndex + 1}`,
    })),
  );
}

export function createStarterDeck(prefix = "ember"): Card[] {
  const cardSet: Array<Omit<CreatureCard, "id"> | Omit<SpellCard, "id">> = [
    {
      name: "Ember Warden",
      type: "creature",
      cost: 1,
      attack: 2,
      health: 2,
    },
    {
      name: "Cinder Scout",
      type: "creature",
      cost: 1,
      attack: 1,
      health: 3,
    },
    {
      name: "Forge Duelist",
      type: "creature",
      cost: 2,
      attack: 3,
      health: 2,
    },
    {
      name: "Flare Hound",
      type: "creature",
      cost: 2,
      attack: 2,
      health: 3,
    },
    {
      name: "Sunsteel Colossus",
      type: "creature",
      cost: 3,
      attack: 4,
      health: 4,
    },
    {
      name: "Spark Volley",
      type: "spell",
      cost: 1,
      damage: 3,
    },
    {
      name: "Kindle Burst",
      type: "spell",
      cost: 1,
      damage: 2,
    },
    {
      name: "Blazing Arc",
      type: "spell",
      cost: 2,
      damage: 4,
    },
    {
      name: "Meteor Line",
      type: "spell",
      cost: 2,
      damage: 5,
    },
    {
      name: "Solar Collapse",
      type: "spell",
      cost: 3,
      damage: 6,
    },
  ];

  return createDeckFromTemplates(prefix, cardSet);
}

function createMistDeck(prefix = "mist"): Card[] {
  return createDeckFromTemplates(prefix, [
    {
      name: "Mistblade Adept",
      type: "creature",
      cost: 1,
      attack: 1,
      health: 3,
    },
    {
      name: "Riverguard Sentry",
      type: "creature",
      cost: 1,
      attack: 2,
      health: 2,
    },
    {
      name: "Foamrunner",
      type: "creature",
      cost: 2,
      attack: 2,
      health: 3,
    },
    {
      name: "Tidecall Leviathan",
      type: "creature",
      cost: 3,
      attack: 4,
      health: 4,
    },
    {
      name: "Harbor Colossus",
      type: "creature",
      cost: 3,
      attack: 3,
      health: 5,
    },
    {
      name: "Spray of Knives",
      type: "spell",
      cost: 1,
      damage: 2,
    },
    {
      name: "Undertow Bolt",
      type: "spell",
      cost: 1,
      damage: 3,
    },
    {
      name: "Flood Pulse",
      type: "spell",
      cost: 2,
      damage: 4,
    },
    {
      name: "Channel Surge",
      type: "spell",
      cost: 2,
      damage: 5,
    },
    {
      name: "Tempest Break",
      type: "spell",
      cost: 3,
      damage: 6,
    },
  ]);
}

function createAerieDeck(prefix = "aerie"): Card[] {
  return createDeckFromTemplates(prefix, [
    {
      name: "Aerie Skirmisher",
      type: "creature",
      cost: 1,
      attack: 2,
      health: 2,
    },
    {
      name: "Cloudguard Cadet",
      type: "creature",
      cost: 1,
      attack: 1,
      health: 3,
    },
    {
      name: "Stormwing Ace",
      type: "creature",
      cost: 2,
      attack: 3,
      health: 2,
    },
    {
      name: "Zephyr Lancer",
      type: "creature",
      cost: 2,
      attack: 2,
      health: 3,
    },
    {
      name: "Citadel Roc",
      type: "creature",
      cost: 3,
      attack: 4,
      health: 4,
    },
    {
      name: "Gale Shot",
      type: "spell",
      cost: 1,
      damage: 2,
    },
    {
      name: "Lightning Draft",
      type: "spell",
      cost: 1,
      damage: 3,
    },
    {
      name: "Skybreaker Arc",
      type: "spell",
      cost: 2,
      damage: 4,
    },
    {
      name: "Pressure Front",
      type: "spell",
      cost: 2,
      damage: 5,
    },
    {
      name: "Heavenfall",
      type: "spell",
      cost: 3,
      damage: 6,
    },
  ]);
}

export function createEncounter(
  input: CreateEncounterInput = {},
): EncounterState {
  return {
    turn: 1,
    activePlayer: "player",
    status: "in-progress",
    log: ["Turn 1: duel begins."],
    player: createCombatantState(
      PLAYER_STARTING_HP,
      input.playerDeck ?? createStarterDeck("player"),
    ),
    enemy: createCombatantState(
      input.enemyHp ?? ENEMY_STARTING_HP,
      input.enemyDeck ?? createStarterDeck("enemy"),
    ),
  };
}

export function playCard(
  encounter: EncounterState,
  cardId: string,
  side: CombatantId = "player",
): EncounterState {
  if (encounter.status !== "in-progress") {
    return encounter;
  }

  const actor = side === "player" ? encounter.player : encounter.enemy;
  const opponent = side === "player" ? encounter.enemy : encounter.player;
  const card = actor.hand.find((entry) => entry.id === cardId);

  if (!card) {
    throw new Error(`Card ${cardId} is not in ${side} hand`);
  }

  if (card.cost > actor.resources.current) {
    throw new Error(`Card ${cardId} costs more than available resources`);
  }

  const remainingHand = actor.hand.filter((entry) => entry.id !== cardId);
  const updatedActorBase: CombatantState = {
    ...actor,
    hand: remainingHand,
    resources: {
      ...actor.resources,
      current: actor.resources.current - card.cost,
    },
  };

  if (card.type === "creature") {
    const updatedActor: CombatantState = {
      ...updatedActorBase,
      battlefield: [...updatedActorBase.battlefield, cloneCard(card)],
    };

    return withUpdatedCombatant(
      {
        ...encounter,
        log: [...encounter.log, `${side} summons ${card.name}.`],
      },
      side,
      updatedActor,
    );
  }

  const updatedActor: CombatantState = {
    ...updatedActorBase,
    discard: [...updatedActorBase.discard, cloneCard(card)],
  };
  const updatedOpponent: CombatantState = {
    ...opponent,
    hp: opponent.hp - card.damage,
  };

  const next =
    side === "player"
      ? {
          ...encounter,
          player: updatedActor,
          enemy: updatedOpponent,
          log: [
            ...encounter.log,
            `${side} casts ${card.name} for ${card.damage}.`,
          ],
        }
      : {
          ...encounter,
          enemy: updatedActor,
          player: updatedOpponent,
          log: [
            ...encounter.log,
            `${side} casts ${card.name} for ${card.damage}.`,
          ],
        };

  return updateStatus(next);
}

export function endTurn(encounter: EncounterState): EncounterState {
  if (encounter.status !== "in-progress") {
    return encounter;
  }

  const playerAttack = creatureAttackTotal(encounter.player.battlefield);
  let next = updateStatus({
    ...encounter,
    enemy: {
      ...encounter.enemy,
      hp: encounter.enemy.hp - playerAttack,
    },
    log:
      playerAttack > 0
        ? [...encounter.log, `Player attacks for ${playerAttack}.`]
        : encounter.log,
  });

  if (next.status !== "in-progress") {
    return next;
  }

  next = resolveEnemyTurn({
    ...next,
    enemy: {
      ...next.enemy,
      resources: {
        current: next.turn,
        max: next.turn,
      },
    },
  });

  if (next.status !== "in-progress") {
    return next;
  }

  return startPlayerTurn({
    ...next,
    turn: next.turn + 1,
  });
}

const REFERENCE_ENCOUNTERS: EncounterSummary[] = [
  {
    id: "ember-trial",
    title: "Encounter 1: Ember Trial",
    enemyName: "Ashen Sentinel",
    enemyHp: 16,
    enemyDeck: createStarterDeck("ashen"),
    completed: false,
  },
  {
    id: "tidal-crossing",
    title: "Encounter 2: Tidal Crossing",
    enemyName: "Mist Channeler",
    enemyHp: 18,
    enemyDeck: createMistDeck("mist"),
    completed: false,
  },
  {
    id: "sky-citadel",
    title: "Encounter 3: Sky Citadel",
    enemyName: "Aerie Marshal",
    enemyHp: 20,
    enemyDeck: createAerieDeck("aerie"),
    completed: false,
  },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSavedEncounterSummary(app: ReferenceAppState): string {
  if (app.encounter === null || app.activeEncounterIndex === null) {
    return "";
  }

  return `<div class="resume-summary">
      <p><button type="button" data-action="resume-encounter">Resume Encounter ${app.activeEncounterIndex + 1}</button></p>
      <p>Saved state - Turn ${app.encounter.turn}, Hand ${app.encounter.player.hand.length}, Battlefield ${app.encounter.player.battlefield.length}</p>
    </div>`;
}

function isEncounterUnlocked(
  encounters: EncounterSummary[],
  encounterIndex: number,
): boolean {
  return (
    encounterIndex === 0 || encounters[encounterIndex - 1]?.completed === true
  );
}

function syncEncounterProgress(app: ReferenceAppState): ReferenceAppState {
  if (
    app.encounter === null ||
    app.activeEncounterIndex === null ||
    app.encounter.status !== "victory"
  ) {
    return app;
  }

  return {
    ...app,
    encounters: app.encounters.map((encounter, index) =>
      index === app.activeEncounterIndex
        ? { ...encounter, completed: true }
        : encounter,
    ),
  };
}

function renderHome(app: ReferenceAppState): string {
  const resumeCallToAction = renderSavedEncounterSummary(app);
  const completedLadderCallout = app.encounters.every(
    (encounter) => encounter.completed,
  )
    ? `<div class="resume-summary">
      <p><strong>Ladder complete</strong></p>
      <p>You cleared every Sky Duel encounter. Replay any fight to improve your finish or revisit the card pool.</p>
    </div>`
    : "";
  const encounters = app.encounters
    .map((encounter, index) => {
      const unlocked = isEncounterUnlocked(app.encounters, index);
      const buttonLabel = unlocked
        ? encounter.completed
          ? `Replay Encounter ${index + 1}`
          : `Start Encounter ${index + 1}`
        : `Locked Encounter ${index + 1}`;
      const statusLabel = encounter.completed
        ? "Completed"
        : unlocked
          ? "Ready"
          : "Locked until you win the previous duel";

      return `
        <li>
          <strong>${escapeHtml(encounter.title)}</strong>
          <span> - Duel ${index + 1} against ${escapeHtml(encounter.enemyName)}</span>
          <span> - ${statusLabel}</span>
          <button type="button" data-action="start-encounter" data-encounter-index="${index}"${unlocked ? "" : " disabled"}>${buttonLabel}</button>
        </li>`;
    })
    .join("");

  return `
    <section aria-label="home">
      <h1>Sky Duel TCG</h1>
      <p>Battle through three handcrafted Ember versus Sky duels using a compact Ember deck.</p>
      ${completedLadderCallout}
      ${resumeCallToAction}
      <ol>${encounters}
      </ol>
    </section>`;
}

function renderRules(): string {
  return `
    <section aria-label="rules">
      <h1>How to Play</h1>
      <p>You command the Ember deck against Sky rivals across the solo ladder.</p>
      <p>Win by reducing the enemy hero to 0 health before your hero reaches 0. Each duel is deterministic with no hidden reactions, no stack, and no instant-speed tricks.</p>
      <h2>Turn Flow</h2>
      <ol>
        <li>You start each duel with 20 health, 1 resource, and 4 cards in hand.</li>
        <li>At the start of each new player turn, you draw 1 card.</li>
        <li>Your maximum resource equals the current turn number, up to 10.</li>
        <li>Play any cards you can afford from your hand.</li>
        <li>Press End Turn. Your battlefield attacks the enemy hero automatically.</li>
        <li>The AI then draws, spends resources on one card, and attacks back.</li>
      </ol>
      <h2>Card Types</h2>
      <p>Creatures stay on the battlefield and add their attack every turn. Spells resolve immediately, deal direct damage, then move to the discard pile.</p>
      <p>Creatures do not block, intercept, or trade damage with each other in this version, so combat always goes straight to the opposing hero.</p>
      <h2>Deckbuilding Rules</h2>
      <p>Every ladder duel uses a fixed Ember list built as a 20-card deck with exactly 2 copies of each of the 10 unique card designs.</p>
      <p>You do not tune the list between rounds in this version. The deckbuilding puzzle is learning when to spend your low-cost pressure versus holding burst spells to close a race.</p>
      <h2>Ladder Rivals</h2>
      <ul>
        <li><strong>Ashen Sentinel</strong> forces a straight race and rewards the cleanest curve.</li>
        <li><strong>Mist Channeler</strong> leans on tempo and steady chip damage, so stabilizing the midgame matters.</li>
        <li><strong>Aerie Marshal</strong> closes with larger aerial bodies, which means preserving life totals for the final swing turns.</li>
      </ul>
      <h2>Zones</h2>
      <p>Deck holds future draws. Hand holds playable cards. Battlefield keeps active creatures. Discard stores used spells and any cards the engine sends out of play.</p>
      <h2>Solo Ladder</h2>
      <p>The campaign has three fixed encounters. Win a duel to unlock the next encounter on the ladder. If you lose, you can immediately retry that same battle from the home page.</p>
      <p>Your save also tracks which encounters are cleared, so reloading the site brings you back to the same campaign state and lets you resume any in-progress duel.</p>
      <h2>Persistence</h2>
      <p>Your current ladder state is stored in browser localStorage using the run-scoped save namespace, so reloading restores the same in-progress encounter.</p>
    </section>`;
}

function renderGallery(): string {
  const uniqueCards = listGalleryCards();

  return `
    <section aria-label="gallery">
      <h1>Card Gallery</h1>
      <ul>
        ${uniqueCards
          .map((card) => {
            if (card.summary.startsWith("Creature")) {
              return `<li>${escapeHtml(card.name)} - ${escapeHtml(card.summary)}</li>`;
            }

            return `<li>${escapeHtml(card.name)} - ${escapeHtml(card.summary)}</li>`;
          })
          .join("")}
      </ul>
    </section>`;
}

function renderPlay(app: ReferenceAppState): string {
  if (!app.encounter || app.activeEncounterIndex === null) {
    return `
      <section aria-label="play">
        <h1>Play</h1>
        <p>Select an encounter from the home page to begin.</p>
      </section>`;
  }

  const encounterInfo = app.encounters[app.activeEncounterIndex]!;
  const handCards = app.encounter.player.hand
    .map(
      (card) => `<li>
        <span>${escapeHtml(card.name)}</span>
        <button type="button" data-action="play-card" data-card-id="${escapeHtml(card.id)}">Play ${escapeHtml(card.name)}</button>
      </li>`,
    )
    .join("");
  const battlefieldCards = app.encounter.player.battlefield
    .map((card) => `<li>${escapeHtml(card.name)}</li>`)
    .join("");
  const playerAttack = app.encounter.player.battlefield.reduce(
    (total, card) => total + card.attack,
    0,
  );
  const enemyAttack = app.encounter.enemy.battlefield.reduce(
    (total, card) => total + card.attack,
    0,
  );
  const logEntries = app.encounter.log
    .slice(-5)
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join("");
  const raceOutlook = describeRaceOutlook(app.encounter);
  const nextEncounter = app.encounters[app.activeEncounterIndex + 1] ?? null;
  const resultMarkup =
    app.encounter.status === "victory"
      ? "<p><strong>Victory</strong> - You won the encounter.</p>" +
        '<p><button type="button" data-action="navigate" data-page="home">Return to Ladder</button>' +
        (nextEncounter
          ? '<button type="button" data-action="start-encounter" data-encounter-index="' +
            (app.activeEncounterIndex + 1) +
            '">Start Encounter ' +
            (app.activeEncounterIndex + 2) +
            "</button>"
          : "") +
        "</p>"
      : app.encounter.status === "defeat"
        ? '<p><strong>Defeat</strong> - The rival deck prevailed.</p><p><button type="button" data-action="navigate" data-page="home">Return to Ladder</button></p>'
        : "";

  return `
    <section aria-label="play">
      <h1>${escapeHtml(encounterInfo.title)}</h1>
      ${resultMarkup}
      <p>Player HP: ${app.encounter.player.hp}</p>
      <p>Enemy HP: ${app.encounter.enemy.hp}</p>
      <p>Turn: ${app.encounter.turn}</p>
      <p>Resources: ${app.encounter.player.resources.current}/${app.encounter.player.resources.max}</p>
      <p>Enemy resources: ${app.encounter.enemy.resources.current}/${app.encounter.enemy.resources.max}</p>
      <h2>Matchup Brief</h2>
      <p>${escapeHtml(describeEncounterPlan(encounterInfo))}</p>
      <p>Signature threats: ${escapeHtml(describeEncounterThreats(encounterInfo).join(", "))}</p>
      <p>Player board attacks for ${playerAttack}</p>
      <p>Enemy board attacks for ${enemyAttack}</p>
      <h2>Race Outlook</h2>
      <p>${escapeHtml(raceOutlook.playerClock)}</p>
      <p>${escapeHtml(raceOutlook.enemyClock)}</p>
      <h2>Hand</h2>
      <ul>${handCards}</ul>
      <h2>Battlefield</h2>
      <ul>${battlefieldCards}</ul>
      <h2>Battle Log</h2>
      <ul>${logEntries}</ul>
      <button type="button" data-action="end-turn">End Turn</button>
    </section>`;
}

function renderPrimaryNav(currentPage: ReferencePage): string {
  const pages: Array<{ page: ReferencePage; label: string }> = [
    { page: "home", label: "Home" },
    { page: "play", label: "Play" },
    { page: "rules", label: "Rules" },
    { page: "gallery", label: "Card Gallery" },
  ];

  return `<header class="site-header">
      <nav aria-label="primary" class="primary-nav">
        ${pages
          .map(
            ({ page, label }) =>
              `<a href="#${page}" data-action="navigate" data-page="${page}"${currentPage === page ? ' aria-current="page"' : ""}>${label}</a>`,
          )
          .join("")}
      </nav>
    </header>`;
}

function renderAppShellMarkup(app: ReferenceAppState): string {
  return `${renderPrimaryNav(app.page)}
    <main>
      ${renderPage(app)}
    </main>`;
}

function listGalleryCards(): Array<{
  name: string;
  summary: string;
}> {
  const starterDeck = [
    ...createStarterDeck(),
    ...REFERENCE_ENCOUNTERS.flatMap((encounter) => encounter.enemyDeck),
  ];
  const uniqueCards = Array.from(
    new Map(starterDeck.map((card) => [card.name, card])).values(),
  );

  return uniqueCards.map((card) => {
    if (card.type === "creature") {
      return {
        name: card.name,
        summary: `Creature ${card.attack}/${card.health}`,
      };
    }

    return {
      name: card.name,
      summary: `Spell deals ${card.damage}`,
    };
  });
}

function createReferenceBrowserScript(
  initialState: string,
  storageNamespace: string,
): string {
  return `const storageNamespace = ${JSON.stringify(storageNamespace)};
const storageKey = storageNamespace + "reference-app-save";
const initialSave = ${JSON.stringify(initialState)};
const galleryCards = ${JSON.stringify(listGalleryCards())};
const referenceEncounters = ${JSON.stringify(REFERENCE_ENCOUNTERS)};
const starterDeck = ${JSON.stringify(createStarterDeck())};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSavedEncounterSummary(app) {
  if (app.encounter === null || app.activeEncounterIndex === null) {
    return "";
  }

  return '<div class="resume-summary"><p><button type="button" data-action="resume-encounter">Resume Encounter ' + (app.activeEncounterIndex + 1) + '</button></p><p>Saved state - Turn ' + app.encounter.turn + ', Hand ' + app.encounter.player.hand.length + ', Battlefield ' + app.encounter.player.battlefield.length + '</p></div>';
}

function creatureAttackTotal(creatures) {
  return creatures.reduce((sum, creature) => sum + creature.attack, 0);
}

function turnsToDefeat(damagePerTurn, hp) {
  if (damagePerTurn <= 0) {
    return null;
  }

  return Math.ceil(hp / damagePerTurn);
}

function describeRaceOutlook(encounter) {
  const playerAttack = creatureAttackTotal(encounter.player.battlefield);
  const enemyAttack = creatureAttackTotal(encounter.enemy.battlefield);
  const playerTurnsToWin = turnsToDefeat(playerAttack, encounter.enemy.hp);
  const enemyTurnsToWin = turnsToDefeat(enemyAttack, encounter.player.hp);

  return {
    playerClock: playerTurnsToWin === null
      ? 'You do not present a lethal clock yet.'
      : 'You present a ' + playerAttack + '-damage swing each turn. Enemy defeat in ' + playerTurnsToWin + ' player turns if the board sticks.',
    enemyClock: enemyTurnsToWin === null
      ? 'Enemy has no return lethal clock yet.'
      : 'Enemy threatens to end the race in ' + enemyTurnsToWin + ' turns if you give the board back.',
  };
}

function describeEncounterPlan(encounter) {
  switch (encounter.id) {
    case 'ember-trial':
      return 'Ashen Sentinel mirrors your fundamentals. Stay efficient on board so your cleaner curve wins the straight race.';
    case 'tidal-crossing':
      return 'Mist Channeler pressures with steady chip damage and efficient tempo. Trade resources early so your heavier turns take over.';
    case 'sky-citadel':
      return 'Aerie Marshal closes with larger aerial bodies. Preserve enough life to absorb early hits before you swing back with bigger burn turns.';
    default:
      return encounter.enemyName + ' brings a fixed ladder list. Spend early mana cleanly and plan around the race clock.';
  }
}

function describeEncounterThreats(encounter) {
  switch (encounter.id) {
    case 'ember-trial':
      return ['Ember Warden', 'Sunsteel Colossus', 'Solar Collapse'];
    case 'tidal-crossing':
      return ['Mistblade Adept', 'Tidecall Leviathan', 'Tempest Break'];
    case 'sky-citadel':
      return ['Aerie Skirmisher', 'Citadel Roc', 'Heavenfall'];
    default:
      return [];
  }
}

function isEncounterUnlocked(encounters, encounterIndex) {
  return encounterIndex === 0 || encounters[encounterIndex - 1]?.completed === true;
}

function syncEncounterProgress(app) {
  if (
    app.encounter === null ||
    app.activeEncounterIndex === null ||
    app.encounter.status !== "victory"
  ) {
    return app;
  }

  return {
    ...app,
    encounters: app.encounters.map((encounter, index) =>
      index === app.activeEncounterIndex
        ? { ...encounter, completed: true }
        : encounter,
    ),
  };
}

function renderHome(app) {
  const resumeCallToAction = renderSavedEncounterSummary(app);
  const encounters = app.encounters
    .map((encounter, index) => {
      const unlocked = isEncounterUnlocked(app.encounters, index);
      const buttonLabel = unlocked
        ? encounter.completed
          ? 'Replay Encounter ' + (index + 1)
          : 'Start Encounter ' + (index + 1)
        : 'Locked Encounter ' + (index + 1);
      const statusLabel = encounter.completed
        ? 'Completed'
        : unlocked
          ? 'Ready'
          : 'Locked until you win the previous duel';

      return '<li><strong>' + escapeHtml(encounter.title) + '</strong><span> - Duel ' + (index + 1) + ' against ' + escapeHtml(encounter.enemyName) + '</span><span> - ' + statusLabel + '</span><button type="button" data-action="start-encounter" data-encounter-index="' + index + '"' + (unlocked ? '' : ' disabled') + '>' + buttonLabel + '</button></li>';
    })
    .join("");

  return '<section aria-label="home"><h1>Sky Duel TCG</h1><p>Battle through three handcrafted duels using a compact Ember deck.</p>' + resumeCallToAction + '<ol>' + encounters + '</ol></section>';
}

function renderRules() {
  return '<section aria-label="rules"><h1>How to Play</h1><p>You command the Ember deck against Sky rivals across the solo ladder.</p><p>Win by reducing the enemy hero to 0 health before your hero reaches 0. Each duel is deterministic with no hidden reactions, no stack, and no instant-speed tricks.</p><h2>Turn Flow</h2><ol><li>You start each duel with 20 health, 1 resource, and 4 cards in hand.</li><li>At the start of each new player turn, you draw 1 card.</li><li>Your maximum resource equals the current turn number, up to 10.</li><li>Play any cards you can afford from your hand.</li><li>Press End Turn. Your battlefield attacks the enemy hero automatically.</li><li>The AI then draws, spends resources on one card, and attacks back.</li></ol><h2>Card Types</h2><p>Creatures stay on the battlefield and add their attack every turn. Spells resolve immediately, deal direct damage, then move to the discard pile.</p><p>Creatures do not block, intercept, or trade damage with each other in this version, so combat always goes straight to the opposing hero.</p><h2>Deckbuilding Rules</h2><p>Every ladder duel uses a fixed Ember list built as a 20-card deck with exactly 2 copies of each of the 10 unique card designs.</p><p>You do not tune the list between rounds in this version. The deckbuilding puzzle is learning when to spend your low-cost pressure versus holding burst spells to close a race.</p><h2>Ladder Rivals</h2><ul><li><strong>Ashen Sentinel</strong> forces a straight race and rewards the cleanest curve.</li><li><strong>Mist Channeler</strong> leans on tempo and steady chip damage, so stabilizing the midgame matters.</li><li><strong>Aerie Marshal</strong> closes with larger aerial bodies, which means preserving life totals for the final swing turns.</li></ul><h2>Zones</h2><p>Deck holds future draws. Hand holds playable cards. Battlefield keeps active creatures. Discard stores used spells and any cards the engine sends out of play.</p><h2>Solo Ladder</h2><p>The campaign has three fixed encounters. Win a duel to unlock the next encounter on the ladder. If you lose, you can immediately retry that same battle from the home page.</p><p>Your save also tracks which encounters are cleared, so reloading the site brings you back to the same campaign state and lets you resume any in-progress duel.</p><h2>Persistence</h2><p>Your current ladder state is stored in browser localStorage using the run-scoped save namespace, so reloading restores the same in-progress encounter.</p></section>';
}

function renderGallery() {
  return '<section aria-label="gallery"><h1>Card Gallery</h1><ul>' + galleryCards
    .map((card) => '<li>' + escapeHtml(card.name) + ' - ' + escapeHtml(card.summary) + '</li>')
    .join("") + '</ul></section>';
}

function renderPlay(app) {
  if (!app.encounter || app.activeEncounterIndex === null) {
    return '<section aria-label="play"><h1>Play</h1><p>Select an encounter from the home page to begin.</p></section>';
  }

  const encounterInfo = app.encounters[app.activeEncounterIndex];
  const handCards = app.encounter.player.hand
    .map((card) => '<li><span>' + escapeHtml(card.name) + '</span><button type="button" data-action="play-card" data-card-id="' + escapeHtml(card.id) + '">Play ' + escapeHtml(card.name) + '</button></li>')
    .join("");
  const battlefieldCards = app.encounter.player.battlefield
    .map((card) => '<li>' + escapeHtml(card.name) + '</li>')
    .join("");
  const playerAttack = creatureAttackTotal(app.encounter.player.battlefield);
  const enemyAttack = creatureAttackTotal(app.encounter.enemy.battlefield);
  const logEntries = app.encounter.log
    .slice(-5)
    .map((entry) => '<li>' + escapeHtml(entry) + '</li>')
    .join("");
  const raceOutlook = describeRaceOutlook(app.encounter);
  const resultMarkup =
    app.encounter.status === "victory"
      ? '<p><strong>Victory</strong> - You won the encounter.</p>'
      : app.encounter.status === "defeat"
        ? '<p><strong>Defeat</strong> - The rival deck prevailed.</p>'
        : "";

  return '<section aria-label="play"><h1>' + escapeHtml(encounterInfo.title) + '</h1>' + resultMarkup + '<p>Player HP: ' + app.encounter.player.hp + '</p><p>Enemy HP: ' + app.encounter.enemy.hp + '</p><p>Turn: ' + app.encounter.turn + '</p><p>Resources: ' + app.encounter.player.resources.current + '/' + app.encounter.player.resources.max + '</p><p>Enemy resources: ' + app.encounter.enemy.resources.current + '/' + app.encounter.enemy.resources.max + '</p><h2>Matchup Brief</h2><p>' + escapeHtml(describeEncounterPlan(encounterInfo)) + '</p><p>Signature threats: ' + escapeHtml(describeEncounterThreats(encounterInfo).join(', ')) + '</p><p>Player board attacks for ' + playerAttack + '</p><p>Enemy board attacks for ' + enemyAttack + '</p><h2>Race Outlook</h2><p>' + escapeHtml(raceOutlook.playerClock) + '</p><p>' + escapeHtml(raceOutlook.enemyClock) + '</p><h2>Hand</h2><ul>' + handCards + '</ul><h2>Battlefield</h2><ul>' + battlefieldCards + '</ul><h2>Battle Log</h2><ul>' + logEntries + '</ul><button type="button" data-action="end-turn">End Turn</button></section>';
}

function renderPage(app) {
  if (app.page === "play") {
    return renderPlay(app);
  }

  if (app.page === "rules") {
    return renderRules();
  }

  if (app.page === "gallery") {
    return renderGallery();
  }

  return renderHome(app);
}

function renderShell(app) {
  const nav = [
    { page: 'home', label: 'Home' },
    { page: 'play', label: 'Play' },
    { page: 'rules', label: 'Rules' },
    { page: 'gallery', label: 'Card Gallery' },
  ]
    .map(
      ({ page, label }) =>
        '<a href="#' +
        page +
        '" data-action="navigate" data-page="' +
        page +
        '"' +
        (app.page === page ? ' aria-current="page"' : '') +
        '>' +
        label +
        '</a>',
    )
    .join('');

  return '<header class="site-header"><nav aria-label="primary" class="primary-nav">' + nav + '</nav></header><main>' + renderPage(app) + '</main>';
}

function cloneCard(card) {
  return { ...card };
}

function cloneDeck(deck) {
  return deck.map((card) => cloneCard(card));
}

function drawCards(deck, count) {
  return {
    hand: deck.slice(0, count),
    deck: deck.slice(count),
  };
}

function createCombatantState(hp, deck) {
  const clonedDeck = cloneDeck(deck);
  const openingDraw = drawCards(clonedDeck, 4);

  return {
    hp,
    deck: openingDraw.deck,
    hand: openingDraw.hand,
    discard: [],
    battlefield: [],
    resources: {
      current: 1,
      max: 1,
    },
  };
}

function withUpdatedCombatant(encounter, side, combatant) {
  return side === "player"
    ? { ...encounter, player: combatant }
    : { ...encounter, enemy: combatant };
}

function updateStatus(encounter) {
  if (encounter.enemy.hp <= 0) {
    return {
      ...encounter,
      status: "victory",
      enemy: { ...encounter.enemy, hp: 0 },
    };
  }

  if (encounter.player.hp <= 0) {
    return {
      ...encounter,
      status: "defeat",
      player: { ...encounter.player, hp: 0 },
    };
  }

  return encounter;
}

function drawOne(combatant) {
  if (combatant.deck.length === 0) {
    return combatant;
  }

  return {
    ...combatant,
    hand: [...combatant.hand, cloneCard(combatant.deck[0])],
    deck: combatant.deck.slice(1),
  };
}

function creatureAttackTotal(creatures) {
  return creatures.reduce((sum, creature) => sum + creature.attack, 0);
}

function startPlayerTurn(encounter) {
  const nextResources = Math.min(10, encounter.turn);
  const player = drawOne({
    ...encounter.player,
    resources: {
      current: nextResources,
      max: nextResources,
    },
  });

  return {
    ...encounter,
    activePlayer: "player",
    player,
    log: [...encounter.log, 'Turn ' + encounter.turn + ': player begins.'],
  };
}

function playCard(encounter, cardId, side = "player") {
  if (encounter.status !== "in-progress") {
    return encounter;
  }

  const actor = side === "player" ? encounter.player : encounter.enemy;
  const opponent = side === "player" ? encounter.enemy : encounter.player;
  const card = actor.hand.find((entry) => entry.id === cardId);

  if (!card || card.cost > actor.resources.current) {
    return encounter;
  }

  const remainingHand = actor.hand.filter((entry) => entry.id !== cardId);
  const updatedActorBase = {
    ...actor,
    hand: remainingHand,
    resources: {
      ...actor.resources,
      current: actor.resources.current - card.cost,
    },
  };

  if (card.type === "creature") {
    return withUpdatedCombatant(
      {
        ...encounter,
        log: [...encounter.log, side + ' summons ' + card.name + '.'],
      },
      side,
      {
        ...updatedActorBase,
        battlefield: [...updatedActorBase.battlefield, cloneCard(card)],
      },
    );
  }

  const next =
    side === "player"
      ? {
          ...encounter,
          player: {
            ...updatedActorBase,
            discard: [...updatedActorBase.discard, cloneCard(card)],
          },
          enemy: {
            ...opponent,
            hp: opponent.hp - card.damage,
          },
          log: [...encounter.log, side + ' casts ' + card.name + ' for ' + card.damage + '.'],
        }
      : {
          ...encounter,
          enemy: {
            ...updatedActorBase,
            discard: [...updatedActorBase.discard, cloneCard(card)],
          },
          player: {
            ...opponent,
            hp: opponent.hp - card.damage,
          },
          log: [...encounter.log, side + ' casts ' + card.name + ' for ' + card.damage + '.'],
        };

  return updateStatus(next);
}

function resolveEnemyTurn(encounter) {
  let next = {
    ...encounter,
    activePlayer: "enemy",
    log: [...encounter.log, 'Turn ' + encounter.turn + ': enemy responds.'],
  };

  if (next.status !== "in-progress") {
    return next;
  }

  next = {
    ...next,
    enemy: drawOne(next.enemy),
  };

  const playableCard = next.enemy.hand.find(
    (card) => card.cost <= next.enemy.resources.current,
  );

  if (playableCard) {
    next = playCard(next, playableCard.id, "enemy");
  }

  if (next.status !== "in-progress") {
    return next;
  }

  const enemyAttack = creatureAttackTotal(next.enemy.battlefield);

  if (enemyAttack > 0) {
    next = updateStatus({
      ...next,
      player: {
        ...next.player,
        hp: next.player.hp - enemyAttack,
      },
      log: [...next.log, 'Enemy attacks for ' + enemyAttack + '.'],
    });
  }

  return next;
}

function endTurn(encounter) {
  if (encounter.status !== "in-progress") {
    return encounter;
  }

  const playerAttack = creatureAttackTotal(encounter.player.battlefield);
  let next = updateStatus({
    ...encounter,
    enemy: {
      ...encounter.enemy,
      hp: encounter.enemy.hp - playerAttack,
    },
    log:
      playerAttack > 0
        ? [...encounter.log, 'Player attacks for ' + playerAttack + '.']
        : encounter.log,
  });

  if (next.status !== "in-progress") {
    return next;
  }

  next = resolveEnemyTurn({
    ...next,
    enemy: {
      ...next.enemy,
      resources: {
        current: next.turn,
        max: next.turn,
      },
    },
  });

  if (next.status !== "in-progress") {
    return next;
  }

  return startPlayerTurn({
    ...next,
    turn: next.turn + 1,
  });
}

function createEncounter(enemyHp) {
  return {
    turn: 1,
    activePlayer: "player",
    status: "in-progress",
    log: ['Turn 1: duel begins.'],
    player: createCombatantState(20, starterDeck),
    enemy: createCombatantState(enemyHp, starterDeck),
  };
}

function navigateToPage(app, page) {
  return {
    ...app,
    page,
  };
}

function startEncounter(app, encounterIndex) {
  const encounterInfo = app.encounters[encounterIndex];

  if (!encounterInfo || !isEncounterUnlocked(app.encounters, encounterIndex)) {
    return app;
  }

  return {
    ...app,
    page: "play",
    activeEncounterIndex: encounterIndex,
    encounter: createEncounter(encounterInfo.enemyHp),
  };
}

function resumeEncounter(app) {
  if (app.encounter === null || app.activeEncounterIndex === null) {
    return app;
  }

  return {
    ...app,
    page: "play",
  };
}

function playEncounterCard(app, cardId) {
  if (!app.encounter) {
    return app;
  }

  return syncEncounterProgress({
    ...app,
    page: "play",
    encounter: playCard(app.encounter, cardId),
  });
}

function endEncounterTurn(app) {
  if (!app.encounter) {
    return app;
  }

  return syncEncounterProgress({
    ...app,
    page: "play",
    encounter: endTurn(app.encounter),
  });
}

function applyReferenceAppAction(app, action) {
  if (action.type === "navigate") {
    return navigateToPage(app, action.page);
  }

  if (action.type === "start-encounter") {
    return startEncounter(app, action.encounterIndex);
  }

  if (action.type === "resume-encounter") {
    return resumeEncounter(app);
  }

  if (action.type === "play-card") {
    return playEncounterCard(app, action.cardId);
  }

  return endEncounterTurn(app);
}

function persistApp(app) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ version: 1, state: app }),
  );
}

function parseAction(target) {
  const dataset = target && target.dataset ? target.dataset : {};

  if (dataset.action === "navigate" && dataset.page) {
    return { type: "navigate", page: dataset.page };
  }

  if (dataset.action === "start-encounter" && dataset.encounterIndex) {
    return {
      type: "start-encounter",
      encounterIndex: Number(dataset.encounterIndex),
    };
  }

  if (dataset.action === "resume-encounter") {
    return { type: "resume-encounter" };
  }

  if (dataset.action === "play-card" && dataset.cardId) {
    return { type: "play-card", cardId: dataset.cardId };
  }

  if (dataset.action === "end-turn") {
    return { type: "end-turn" };
  }

  return null;
}

window.__SKY_DUEL_BOOTSTRAP__ = {
  storageNamespace,
  storageKey,
  initialSave,
};

const root = document.getElementById("app");
const savedState = window.localStorage.getItem(storageKey);
const activeSave = savedState ?? initialSave;
let appState = JSON.parse(activeSave).state;

if (!savedState) {
  window.localStorage.setItem(storageKey, initialSave);
}

if (root) {
  root.innerHTML = renderShell(appState);

  if (typeof root.addEventListener === "function") {
    root.addEventListener("click", (event) => {
      const actionTarget =
        event.target && typeof event.target.closest === "function"
          ? event.target.closest("[data-action]")
          : null;

      if (!actionTarget) {
        return;
      }

      const action = parseAction(actionTarget);

      if (!action) {
        return;
      }

      appState = applyReferenceAppAction(appState, action);
      persistApp(appState);
      root.innerHTML = renderShell(appState);
    });
  }
}
`;
}

function renderPage(app: ReferenceAppState): string {
  if (app.page === "play") {
    return renderPlay(app);
  }

  if (app.page === "rules") {
    return renderRules();
  }

  if (app.page === "gallery") {
    return renderGallery();
  }

  return renderHome(app);
}

export function createReferenceApp(): ReferenceAppState {
  return {
    page: "home",
    encounters: REFERENCE_ENCOUNTERS.map((encounter) => ({
      ...encounter,
      enemyDeck: cloneDeck(encounter.enemyDeck),
      completed: false,
    })),
    activeEncounterIndex: null,
    encounter: null,
  };
}

export function navigateToPage(
  app: ReferenceAppState,
  page: ReferencePage,
): ReferenceAppState {
  return {
    ...app,
    page,
  };
}

export function startEncounter(
  app: ReferenceAppState,
  encounterIndex: number,
): ReferenceAppState {
  const encounterInfo = app.encounters[encounterIndex];

  if (!encounterInfo) {
    throw new Error(`Encounter ${encounterIndex} does not exist`);
  }

  if (!isEncounterUnlocked(app.encounters, encounterIndex)) {
    return app;
  }

  return {
    ...app,
    page: "play",
    activeEncounterIndex: encounterIndex,
    encounter: createEncounter({
      enemyHp: encounterInfo.enemyHp,
      enemyDeck: encounterInfo.enemyDeck,
    }),
  };
}

export function resumeEncounter(app: ReferenceAppState): ReferenceAppState {
  if (app.encounter === null || app.activeEncounterIndex === null) {
    return app;
  }

  return {
    ...app,
    page: "play",
  };
}

export function applyReferenceAppAction(
  app: ReferenceAppState,
  action: ReferenceAppAction,
): ReferenceAppState {
  if (action.type === "navigate") {
    return navigateToPage(app, action.page);
  }

  if (action.type === "start-encounter") {
    return startEncounter(app, action.encounterIndex);
  }

  if (action.type === "resume-encounter") {
    return resumeEncounter(app);
  }

  if (action.type === "play-card") {
    return playEncounterCard(app, action.cardId);
  }

  return endEncounterTurn(app);
}

export function endEncounterTurn(app: ReferenceAppState): ReferenceAppState {
  if (!app.encounter) {
    return app;
  }

  return syncEncounterProgress({
    ...app,
    page: "play",
    encounter: endTurn(app.encounter),
  });
}

export function playEncounterCard(
  app: ReferenceAppState,
  cardId: string,
): ReferenceAppState {
  if (!app.encounter) {
    return app;
  }

  return syncEncounterProgress({
    ...app,
    page: "play",
    encounter: playCard(app.encounter, cardId),
  });
}

export function serializeReferenceApp(app: ReferenceAppState): string {
  const save: ReferenceAppSave = {
    version: 1,
    state: app,
  };

  return JSON.stringify(save);
}

export function restoreReferenceApp(serialized: string): ReferenceAppState {
  const parsed = JSON.parse(serialized) as Partial<ReferenceAppSave>;

  if (parsed.version !== 1 || !parsed.state) {
    throw new Error("Invalid reference app save data");
  }

  return parsed.state;
}

export function renderAppHtml(app: ReferenceAppState): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sky Duel TCG</title>
  </head>
  <body>
    ${renderAppShellMarkup(app)}
  </body>
</html>`;
}

export function createReferenceBuildArtifacts(
  app: ReferenceAppState,
  options: CreateReferenceBuildArtifactsOptions,
): ReferenceBuildArtifacts {
  const initialState = serializeReferenceApp(app);

  return {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sky Duel TCG</title>
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app" class="app-shell">${renderAppShellMarkup(app)}
    </div>
    <script type="module" src="./app.js"></script>
  </body>
</html>`,
    "app.js": createReferenceBrowserScript(
      initialState,
      options.storageNamespace,
    ),
    "favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#172554"/>
  <path d="M18 18h28l-7 12 7 16H18l7-16-7-12Z" fill="#fbbf24"/>
  <circle cx="32" cy="32" r="7" fill="#0f172a"/>
</svg>`,
    "styles.css": `.app-shell {
  min-height: 100vh;
  padding: 24px;
  font-family: Arial, sans-serif;
  color: #f8fafc;
  background: linear-gradient(180deg, #172554 0%, #0f172a 100%);
}

.site-header {
  margin-bottom: 24px;
}

.primary-nav {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.primary-nav a {
  color: #fbbf24;
}

.save-banner {
  margin: 0 0 16px;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.75);
}

button {
  cursor: pointer;
}
`,
  };
}
