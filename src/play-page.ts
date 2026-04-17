import { cardLibrary, starterDecks } from './card-data';
import {
  createGame,
  getLegalActions,
  resolveAction,
  type CardDefinition as DuelCardDefinition,
  type GameAction,
  type GameState,
} from './duel-engine';
import { ENCOUNTERS, advanceEncounter, chooseEnemyTurn, createEncounterRun, type Encounter } from './encounters';

export const playBoardZones = [
  'Enemy health',
  'Player health',
  'Resources',
  'Battlefield',
  'Hand',
  'Deck',
  'Discard',
  'Action controls',
  'Turn flow',
] as const;

export function getPlayBoardZones(): string[] {
  return [...playBoardZones];
}

const playInteractionChecklist = [
  'Start from the Play route and review the visible turn state before acting.',
  'Use the action controls to play cards, advance combat, and end the turn.',
  'Watch the turn flow panel after each click to confirm the next expected step.',
] as const;

export function getPlayInteractionChecklist(): string[] {
  return [...playInteractionChecklist];
}

type IdlePlayState = {
  mode: 'idle';
  availableEncounters: Encounter[];
};

type ActivePlayState = {
  mode: 'active';
  availableEncounters: Encounter[];
  encounter: Encounter;
  game: GameState;
  legalActions: GameAction[];
  statusMessage: string;
  log: string[];
};

export type PlayState = IdlePlayState | ActivePlayState;

type PersistedIdlePlayState = {
  mode: 'idle';
};

type PersistedActivePlayState = {
  mode: 'active';
  encounterId: string;
  game: GameState;
  statusMessage: string;
  log: string[];
};

export type PersistedPlayState = PersistedIdlePlayState | PersistedActivePlayState;

function getEncounterById(encounterId: string): Encounter | null {
  return ENCOUNTERS.find((entry) => entry.id === encounterId) ?? null;
}

function getSavedEncounterId(savedState: PersistedActivePlayState | ActivePlayState): string {
  return 'encounter' in savedState ? savedState.encounter.id : savedState.encounterId;
}

const spellDamageByCardId: Record<string, number> = {
  coalburst: 2,
  'flare-up': 3,
  'war-drum': 0,
  'tidal-push': 0,
  'foam-barrier': 0,
  undertow: 0,
};

function expandDeck(deckId: string): string[] {
  const deck = starterDecks.find((entry) => entry.id === deckId);

  if (!deck) {
    throw new Error(`unknown deck: ${deckId}`);
  }

  return deck.cards.flatMap((entry) => Array.from({ length: entry.count }, () => entry.cardId));
}

function toDuelCards(): DuelCardDefinition[] {
  const playerCards = cardLibrary.map((card) => {
    if (card.kind === 'creature') {
      return {
        id: card.id,
        name: card.name,
        kind: 'creature' as const,
        cost: card.cost,
        attack: card.attack,
        health: card.health,
        keywords: card.keywords,
      };
    }

    return {
      id: card.id,
      name: card.name,
      kind: 'spell' as const,
      cost: card.cost,
      damage: spellDamageByCardId[card.id] ?? 0,
    };
  });

  const encounterCards = ENCOUNTERS.flatMap((encounter) =>
    encounter.enemyDeck.map((card) => ({
      id: card.id,
      name: card.name,
      kind: 'spell' as const,
      cost: card.cost,
      damage: card.damage,
    })),
  );

  return [...playerCards, ...encounterCards];
}

function describeAction(game: GameState, action: GameAction): string {
  if (action.type === 'end_turn') {
    return `${action.playerId} ended the turn.`;
  }

  if (action.type === 'attack') {
    return action.target.type === 'hero'
      ? `${action.playerId} attacked the opposing hero.`
      : `${action.playerId} attacked an opposing creature.`;
  }

  const player = game.players[action.playerId];
  const handCard = player.hand.find((card) => card.instanceId === action.cardInstanceId);
  const cardName = handCard ? game.cardsById[handCard.cardId]?.name ?? handCard.cardId : 'Unknown card';

  return `${action.playerId} played ${cardName}.`;
}

function createActivePlayState(encounter: Encounter): ActivePlayState {
  const game = createGame({
    cards: toDuelCards(),
    playerDeck: expandDeck('ember-vanguard'),
    enemyDeck: encounter.enemyDeck.map((card) => card.id),
    startingHandSize: 4,
    startingHealth: 20,
  });

  return {
    mode: 'active',
    availableEncounters: ENCOUNTERS,
    encounter,
    game,
    legalActions: getLegalActions(game),
    statusMessage: `Encounter ready against ${encounter.name}.`,
    log: [`Started encounter: ${encounter.name}.`],
  };
}

function runEnemyTurn(state: ActivePlayState): ActivePlayState {
  let game = state.game;
  const enemy = game.players.enemy;
  const enemyHand = enemy.hand
    .map((card) => game.cardsById[card.cardId])
    .filter((card): card is Extract<DuelCardDefinition, { kind: 'spell' }> => card?.kind === 'spell')
    .map((card) => ({ id: card.id, name: card.name, cost: card.cost, damage: card.damage }));
  const choice = chooseEnemyTurn({ mana: enemy.resources, hand: enemyHand });
  const nextLog = [...state.log];

  if (choice.cardId) {
    const chosenHandCard = enemy.hand.find((card) => card.cardId === choice.cardId);

    if (chosenHandCard) {
      const playAction: GameAction = {
        type: 'play_card',
        playerId: 'enemy',
        cardInstanceId: chosenHandCard.instanceId,
      };

      game = resolveAction(game, playAction);
      nextLog.push(`enemy cast ${game.cardsById[choice.cardId].name} for ${choice.damage} damage.`);
    }
  } else {
    nextLog.push('enemy had no affordable card and passed pressure back.');
  }

  game = resolveAction(game, { type: 'end_turn', playerId: 'enemy' });

  return {
    ...state,
    game,
    legalActions: getLegalActions(game),
    statusMessage:
      game.winnerId === 'enemy'
        ? `${state.encounter.name} defeated you.`
        : `Enemy turn resolved. Your move against ${state.encounter.name}.`,
    log: [...nextLog, 'enemy ended the turn.'],
  };
}

function getVictoryStatusMessage(encounter: Encounter): string {
  const run = createEncounterRun();

  while (run.currentEncounter.id !== encounter.id && !run.isComplete) {
    const nextRun = advanceEncounter(run, 'won');

    if (nextRun.currentEncounter.id === run.currentEncounter.id && nextRun.isComplete === run.isComplete) {
      break;
    }

    run.currentEncounter = nextRun.currentEncounter;
    run.completedEncounterIds = nextRun.completedEncounterIds;
    run.isComplete = nextRun.isComplete;
  }

  const nextRun = advanceEncounter(run, 'won');

  if (nextRun.isComplete) {
    return `You defeated ${encounter.name} and cleared the encounter ladder.`;
  }

  return `You defeated ${encounter.name}. Next encounter: ${nextRun.currentEncounter.name}.`;
}

export function createInitialPlayState(): PlayState {
  return {
    mode: 'idle',
    availableEncounters: ENCOUNTERS,
  };
}

export function serializePlayState(state: PlayState): PersistedPlayState {
  if (state.mode === 'idle') {
    return { mode: 'idle' };
  }

  return {
    mode: 'active',
    encounterId: state.encounter.id,
    game: state.game,
    statusMessage: state.statusMessage,
    log: state.log,
  };
}

export function restorePlayState(savedState: PersistedPlayState | PlayState | null): PlayState {
  if (!savedState || savedState.mode === 'idle') {
    return createInitialPlayState();
  }

  const encounter = getEncounterById(getSavedEncounterId(savedState));

  if (!encounter) {
    return createInitialPlayState();
  }

  return {
    mode: 'active',
    availableEncounters: ENCOUNTERS,
    encounter,
    game: savedState.game,
    legalActions: getLegalActions(savedState.game),
    statusMessage: savedState.statusMessage,
    log: savedState.log,
  };
}

export function startEncounter(state: PlayState, encounterId: string): ActivePlayState {
  const encounter = state.availableEncounters.find((entry) => entry.id === encounterId);

  if (!encounter) {
    throw new Error(`unknown encounter: ${encounterId}`);
  }

  return createActivePlayState(encounter);
}

export function performAction(state: ActivePlayState, action: GameAction): ActivePlayState {
  let nextState: ActivePlayState = {
    ...state,
    game: resolveAction(state.game, action),
    statusMessage: 'Action resolved.',
    log: [...state.log, describeAction(state.game, action)],
    legalActions: [],
  };

  nextState = {
    ...nextState,
    legalActions: getLegalActions(nextState.game),
    statusMessage:
      nextState.game.winnerId === 'player'
        ? getVictoryStatusMessage(state.encounter)
        : action.type === 'end_turn'
          ? `Enemy is taking a turn against ${state.encounter.name}.`
          : 'Action resolved. Choose your next move.',
  };

  if (nextState.game.activePlayerId === 'enemy' && !nextState.game.winnerId) {
    return runEnemyTurn(nextState);
  }

  return nextState;
}

export function getActionLabel(state: ActivePlayState, action: GameAction): string {
  if (action.type === 'end_turn') {
    return 'End Turn';
  }

  if (action.type === 'attack') {
    return action.target.type === 'hero' ? 'Attack Enemy Hero' : 'Attack Enemy Creature';
  }

  const handCard = state.game.players[action.playerId].hand.find((card) => card.instanceId === action.cardInstanceId);

  if (!handCard) {
    return 'Play Card';
  }

  const definition = state.game.cardsById[handCard.cardId];

  return `Play ${definition.name}`;
}
