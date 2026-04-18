import { createNamespacedStorage } from '../lib/storage';

type SessionOptions = {
  encounterId: string;
};

type Card = {
  id: string;
  name: string;
  cost: number;
  type: 'unit' | 'spell';
};

type PlayerId = 'player' | 'ai';

type Lane = 'frontline' | 'support' | 'backline';

type Battlefield = Record<Lane, Card[]>;

type PlayerState = {
  health: number;
  resources: {
    current: number;
    max: number;
  };
  deck: Card[];
  hand: Card[];
  discardPile: Card[];
  battlefield: Battlefield;
};

type GameSession = {
  encounter: {
    id: string;
    opponentName: string;
  };
  status: 'in_progress';
  turn: {
    number: number;
    activePlayerId: PlayerId;
  };
  players: {
    player: PlayerState;
    ai: PlayerState;
  };
};

type GameStorage = {
  clear: () => void;
  load: () => GameSession | null;
  save: (session: GameSession) => void;
};

type PlayUnitAction = {
  cardId: string;
  lane: Lane;
  type: 'play_unit';
};

type PlaySpellAction = {
  cardId: string;
  type: 'play_spell';
};

type PassAction = {
  type: 'pass';
};

type GameAction = PlayUnitAction | PlaySpellAction | PassAction;

const lanes: Lane[] = ['frontline', 'support', 'backline'];

const playerDeck: Card[] = [
  { id: 'p-1', name: 'Lantern Squire', cost: 1, type: 'unit' },
  { id: 'p-2', name: 'Copper Scout', cost: 1, type: 'unit' },
  { id: 'p-3', name: 'Signal Flare', cost: 1, type: 'spell' },
  { id: 'p-4', name: 'Bastion Knight', cost: 2, type: 'unit' },
  { id: 'p-5', name: 'Aegis Burst', cost: 2, type: 'spell' },
  { id: 'p-6', name: 'Dawn Marshal', cost: 3, type: 'unit' }
];

const aiDeck: Card[] = [
  { id: 'a-1', name: 'Ashling Raider', cost: 1, type: 'unit' },
  { id: 'a-2', name: 'Cinder Familiar', cost: 1, type: 'unit' },
  { id: 'a-3', name: 'Scorch Volley', cost: 1, type: 'spell' },
  { id: 'a-4', name: 'Blaze Captain', cost: 2, type: 'unit' },
  { id: 'a-5', name: 'Ember Surge', cost: 2, type: 'spell' },
  { id: 'a-6', name: 'Inferno Drake', cost: 3, type: 'unit' }
];

function createPlayerState(deck: Card[], startingResources: { current: number; max: number }): PlayerState {
  return {
    health: 20,
    resources: startingResources,
    hand: deck.slice(0, 3),
    deck: deck.slice(3),
    discardPile: [],
    battlefield: {
      frontline: [],
      support: [],
      backline: []
    }
  };
}

function refreshResources(player: PlayerState): PlayerState {
  const nextMax = Math.min(player.resources.max + 1, 10);

  return {
    ...player,
    resources: {
      current: nextMax,
      max: nextMax
    }
  };
}

export function getPersistenceKey(runId: string): string {
  return `${runId}:duel-tcg:game-state`;
}

export function createGameSession({ encounterId }: SessionOptions): GameSession {
  return {
    encounter: {
      id: encounterId,
      opponentName: 'Ashen Vanguard'
    },
    status: 'in_progress',
    turn: {
      number: 1,
      activePlayerId: 'player'
    },
    players: {
      player: createPlayerState(playerDeck, { current: 1, max: 1 }),
      ai: createPlayerState(aiDeck, { current: 0, max: 0 })
    }
  };
}

export function createGameStorage(storage: Storage, runId: string): GameStorage {
  const namespacedStorage = createNamespacedStorage(storage, runId);
  const gameStateKey = 'duel-tcg:game-state';

  return {
    clear() {
      namespacedStorage.remove(gameStateKey);
    },
    load() {
      return namespacedStorage.getJson<GameSession>(gameStateKey);
    },
    save(session) {
      namespacedStorage.setJson(gameStateKey, session);
    }
  };
}

export function endTurn(session: GameSession): GameSession {
  const nextActivePlayerId = session.turn.activePlayerId === 'player' ? 'ai' : 'player';

  return {
    ...session,
    players: {
      ...session.players,
      [nextActivePlayerId]: refreshResources(session.players[nextActivePlayerId])
    },
    turn: {
      activePlayerId: nextActivePlayerId,
      number: session.turn.number + 1
    }
  };
}

export function listLegalActions(session: GameSession): GameAction[] {
  const player = session.players[session.turn.activePlayerId];
  const unitActions = player.hand
    .filter((card) => card.type === 'unit')
    .flatMap((card) =>
      lanes
        .filter((lane) => player.battlefield[lane].length === 0)
        .map((lane) => ({ cardId: card.id, lane, type: 'play_unit' as const }))
    );
  const spellActions = player.hand
    .filter((card) => card.type === 'spell')
    .map((card) => ({ cardId: card.id, type: 'play_spell' as const }));

  return [...unitActions, ...spellActions, { type: 'pass' }];
}

export function playCard(session: GameSession, action: PlayUnitAction | PlaySpellAction): GameSession {
  const activePlayerId = session.turn.activePlayerId;
  const player = session.players[activePlayerId];
  const opponentPlayerId = activePlayerId === 'player' ? 'ai' : 'player';
  const card = player.hand.find((entry) => entry.id === action.cardId);

  if (!card || card.cost > player.resources.current) {
    return session;
  }

  const nextHand = player.hand.filter((entry) => entry.id !== action.cardId);
  const nextResources = {
    ...player.resources,
    current: player.resources.current - card.cost
  };

  if (action.type === 'play_spell') {
    return {
      ...session,
      players: {
        ...session.players,
        [activePlayerId]: {
          ...player,
          hand: nextHand,
          discardPile: [...player.discardPile, card],
          resources: nextResources
        },
        [opponentPlayerId]: {
          ...session.players[opponentPlayerId],
          health: Math.max(0, session.players[opponentPlayerId].health - 2)
        }
      }
    };
  }

  if (card.type !== 'unit') {
    return session;
  }

  return {
    ...session,
    players: {
      ...session.players,
      [activePlayerId]: {
        ...player,
        hand: nextHand,
        battlefield: {
          ...player.battlefield,
          [action.lane]: [...player.battlefield[action.lane], card]
        },
        resources: nextResources
      }
    }
  };
}

export function applyAction(session: GameSession, action: GameAction): GameSession {
  if (action.type === 'pass') {
    return endTurn(session);
  }

  return playCard(session, action);
}
