export type SideId = 'player' | 'opponent';

export type SpellEffect =
  | {
      kind: 'damage';
      amount: number;
    }
  | {
      kind: 'heal';
      amount: number;
    };

export type CreatureCard = {
  id: string;
  name: string;
  type: 'creature';
  cost: number;
  attack: number;
  health: number;
};

export type SpellCard = {
  id: string;
  name: string;
  type: 'spell';
  cost: number;
  effect: SpellEffect;
};

export type Card = CreatureCard | SpellCard;

export type BattlefieldCard = CreatureCard & {
  currentHealth: number;
  ready: boolean;
};

export type Resources = {
  current: number;
  available: number;
};

export type SideState = {
  health: number;
  deck: Card[];
  hand: Card[];
  discard: Card[];
  battlefield: BattlefieldCard[];
  resources: Resources;
};

export type TurnState = {
  number: number;
  activeSide: SideId;
};

export type EncounterDefinition = {
  ladderIndex: number;
  title: string;
  opponentName: string;
  playerDeck: Card[];
  opponentDeck: Card[];
};

export type EncounterState = {
  ladderIndex: number;
  encounterName: string;
  player: SideState;
  opponent: SideState;
  turn: TurnState;
  log: string[];
};

function creatureCard(
  id: string,
  name: string,
  cost: number,
  attack: number,
  health: number,
): CreatureCard {
  return { id, name, type: 'creature', cost, attack, health };
}

function spellCard(id: string, name: string, cost: number, effect: SpellEffect): SpellCard {
  return { id, name, type: 'spell', cost, effect };
}

function createStarterDeck(prefix: string): Card[] {
  return [
    creatureCard(`${prefix}-spark-adept-1`, 'Spark Adept', 1, 1, 2),
    creatureCard(`${prefix}-ember-fox-1`, 'Ember Fox', 1, 2, 1),
    spellCard(`${prefix}-cinder-burst-1`, 'Cinder Burst', 1, { kind: 'damage', amount: 2 }),
    creatureCard(`${prefix}-ash-guard-1`, 'Ash Guard', 2, 2, 3),
    creatureCard(`${prefix}-spark-adept-2`, 'Spark Adept', 1, 1, 2),
    creatureCard(`${prefix}-ember-fox-2`, 'Ember Fox', 1, 2, 1),
    spellCard(`${prefix}-healing-flare-1`, 'Healing Flare', 1, { kind: 'heal', amount: 2 }),
    creatureCard(`${prefix}-ash-guard-2`, 'Ash Guard', 2, 2, 3),
    spellCard(`${prefix}-cinder-burst-2`, 'Cinder Burst', 1, { kind: 'damage', amount: 2 }),
    creatureCard(`${prefix}-blaze-warden-1`, 'Blaze Warden', 3, 3, 4),
    creatureCard(`${prefix}-spark-adept-3`, 'Spark Adept', 1, 1, 2),
    creatureCard(`${prefix}-ember-fox-3`, 'Ember Fox', 1, 2, 1),
    spellCard(`${prefix}-healing-flare-2`, 'Healing Flare', 1, { kind: 'heal', amount: 2 }),
    creatureCard(`${prefix}-ash-guard-3`, 'Ash Guard', 2, 2, 3),
    spellCard(`${prefix}-cinder-burst-3`, 'Cinder Burst', 1, { kind: 'damage', amount: 2 }),
    creatureCard(`${prefix}-blaze-warden-2`, 'Blaze Warden', 3, 3, 4),
    creatureCard(`${prefix}-spark-adept-4`, 'Spark Adept', 1, 1, 2),
    creatureCard(`${prefix}-ember-fox-4`, 'Ember Fox', 1, 2, 1),
    spellCard(`${prefix}-inferno-surge-1`, 'Inferno Surge', 2, { kind: 'damage', amount: 3 }),
    creatureCard(`${prefix}-ember-titan-1`, 'Ember Titan', 4, 4, 5),
  ];
}

function createOpponentDeck(prefix: string, openerName: string): Card[] {
  return [
    creatureCard(`${prefix}-rook-1`, openerName, 1, 1, 2),
    creatureCard(`${prefix}-torchling-1`, 'Torchling', 1, 2, 1),
    spellCard(`${prefix}-ember-ping-1`, 'Ember Ping', 1, { kind: 'damage', amount: 1 }),
    creatureCard(`${prefix}-shield-bearer-1`, 'Shield Bearer', 2, 1, 4),
    creatureCard(`${prefix}-rook-2`, openerName, 1, 1, 2),
    creatureCard(`${prefix}-torchling-2`, 'Torchling', 1, 2, 1),
    spellCard(`${prefix}-ember-ping-2`, 'Ember Ping', 1, { kind: 'damage', amount: 1 }),
    creatureCard(`${prefix}-shield-bearer-2`, 'Shield Bearer', 2, 1, 4),
    creatureCard(`${prefix}-rook-3`, openerName, 1, 1, 2),
    spellCard(`${prefix}-lava-lash-1`, 'Lava Lash', 2, { kind: 'damage', amount: 3 }),
    creatureCard(`${prefix}-torchling-3`, 'Torchling', 1, 2, 1),
    creatureCard(`${prefix}-rook-4`, openerName, 1, 1, 2),
    spellCard(`${prefix}-ember-ping-3`, 'Ember Ping', 1, { kind: 'damage', amount: 1 }),
    creatureCard(`${prefix}-shield-bearer-3`, 'Shield Bearer', 2, 1, 4),
    creatureCard(`${prefix}-blaze-rider-1`, 'Blaze Rider', 3, 3, 3),
    spellCard(`${prefix}-lava-lash-2`, 'Lava Lash', 2, { kind: 'damage', amount: 3 }),
    creatureCard(`${prefix}-torchling-4`, 'Torchling', 1, 2, 1),
    creatureCard(`${prefix}-blaze-rider-2`, 'Blaze Rider', 3, 3, 3),
    spellCard(`${prefix}-ember-ping-4`, 'Ember Ping', 1, { kind: 'damage', amount: 1 }),
    creatureCard(`${prefix}-citadel-giant-1`, 'Citadel Giant', 4, 4, 5),
  ];
}

export function createLadder(): EncounterDefinition[] {
  const playerDeck = createStarterDeck('player');

  return [
    {
      ladderIndex: 0,
      title: 'Gate Ash Skirmish',
      opponentName: 'Rook of Cinders',
      playerDeck,
      opponentDeck: createOpponentDeck('gate-ash', 'Rook Sentry'),
    },
    {
      ladderIndex: 1,
      title: 'Forge Crossing',
      opponentName: 'Mira the Furnace',
      playerDeck,
      opponentDeck: createOpponentDeck('forge-crossing', 'Forge Rook'),
    },
    {
      ladderIndex: 2,
      title: 'Ember Crown',
      opponentName: 'Veyr Emberhand',
      playerDeck,
      opponentDeck: createOpponentDeck('ember-crown', 'Crown Rook'),
    },
  ];
}

function cloneEncounter(encounter: EncounterState): EncounterState {
  return structuredClone(encounter);
}

function emptySide(deck: Card[]): SideState {
  return {
    health: 20,
    deck: [...deck],
    hand: [],
    discard: [],
    battlefield: [],
    resources: {
      current: 1,
      available: 1,
    },
  };
}

export function drawCard(encounter: EncounterState, side: SideId): EncounterState {
  const next = cloneEncounter(encounter);
  const targetSide = next[side];
  const nextCard = targetSide.deck.shift();

  if (nextCard) {
    targetSide.hand.push(nextCard);
  }

  return next;
}

function drawOpeningHand(side: SideState): void {
  for (let index = 0; index < 4; index += 1) {
    const nextCard = side.deck.shift();
    if (nextCard) {
      side.hand.push(nextCard);
    }
  }
}

export function createEncounterState(definition: EncounterDefinition): EncounterState {
  const encounter: EncounterState = {
    ladderIndex: definition.ladderIndex,
    encounterName: definition.title,
    player: emptySide(definition.playerDeck),
    opponent: emptySide(definition.opponentDeck),
    turn: {
      number: 1,
      activeSide: 'player',
    },
    log: [`Encounter ${definition.ladderIndex + 1} begins: ${definition.title}`],
  };

  drawOpeningHand(encounter.player);
  drawOpeningHand(encounter.opponent);

  return encounter;
}

function opposingSide(side: SideId): SideId {
  return side === 'player' ? 'opponent' : 'player';
}

function clampHealth(health: number): number {
  return Math.max(0, Math.min(20, health));
}

export function playCard(encounter: EncounterState, side: SideId, handIndex: number): EncounterState {
  const next = cloneEncounter(encounter);
  const actor = next[side];
  const defender = next[opposingSide(side)];
  const [card] = actor.hand.splice(handIndex, 1);

  if (!card) {
    return encounter;
  }

  if (card.cost > actor.resources.available) {
    actor.hand.splice(handIndex, 0, card);
    return encounter;
  }

  actor.resources.available -= card.cost;

  if (card.type === 'creature') {
    actor.battlefield.push({
      ...card,
      currentHealth: card.health,
      ready: false,
    });
    next.log.push(`${side} deploys ${card.name}.`);
    return next;
  }

  if (card.effect.kind === 'damage') {
    defender.health = clampHealth(defender.health - card.effect.amount);
  } else {
    actor.health = clampHealth(actor.health + card.effect.amount);
  }

  actor.discard.push(card);
  next.log.push(`${side} casts ${card.name}.`);
  return next;
}

function readyBattlefield(side: SideState): void {
  for (const card of side.battlefield) {
    card.ready = true;
  }
}

function beginTurn(encounter: EncounterState, side: SideId, turnNumber: number): EncounterState {
  const next = cloneEncounter(encounter);
  const actor = next[side];

  next.turn = {
    number: turnNumber,
    activeSide: side,
  };

  readyBattlefield(actor);
  actor.resources.current = Math.min(10, turnNumber);
  actor.resources.available = actor.resources.current;

  return drawCard(next, side);
}

function aiPlayableIndex(hand: Card[], available: number): number {
  const playable = hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.cost <= available)
    .sort((left, right) => {
      if (right.card.cost !== left.card.cost) {
        return right.card.cost - left.card.cost;
      }

      if (left.card.type !== right.card.type) {
        return left.card.type === 'creature' ? -1 : 1;
      }

      return left.card.name.localeCompare(right.card.name);
    });

  return playable[0]?.index ?? -1;
}

function runCombat(encounter: EncounterState, side: SideId): EncounterState {
  const next = cloneEncounter(encounter);
  const actor = next[side];
  const defender = next[opposingSide(side)];

  for (const creature of actor.battlefield) {
    if (!creature.ready) {
      continue;
    }

    defender.health = clampHealth(defender.health - creature.attack);
    creature.ready = false;
    next.log.push(`${creature.name} hits the opposing hero for ${creature.attack}.`);
  }

  return next;
}

function runAiTurn(encounter: EncounterState): EncounterState {
  let next = beginTurn(encounter, 'opponent', encounter.turn.number);
  const playableIndex = aiPlayableIndex(next.opponent.hand, next.opponent.resources.available);

  if (playableIndex >= 0) {
    next = playCard(next, 'opponent', playableIndex);
  }

  next = runCombat(next, 'opponent');
  return next;
}

export function endTurn(encounter: EncounterState): EncounterState {
  if (encounter.player.health === 0 || encounter.opponent.health === 0) {
    return encounter;
  }

  if (encounter.turn.activeSide === 'player') {
    const afterAiTurn = runAiTurn(encounter);
    return beginTurn(afterAiTurn, 'player', encounter.turn.number + 1);
  }

  return beginTurn(encounter, 'player', encounter.turn.number + 1);
}

export function storageKey(runNamespace: string, ladderIndex: number): string {
  return `${runNamespace}:encounter:${ladderIndex}`;
}

export function persistEncounterState(runNamespace: string, encounter: EncounterState): void {
  window.localStorage.setItem(storageKey(runNamespace, encounter.ladderIndex), JSON.stringify(encounter));
}

export function loadEncounterState(
  runNamespace: string,
  ladderIndex: number,
): EncounterState | null {
  const raw = window.localStorage.getItem(storageKey(runNamespace, ladderIndex));

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as EncounterState;
}
