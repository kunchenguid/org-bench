export type PlayerId = 'player' | 'opponent';

type CreatureCardDefinition = {
  id: string;
  name: string;
  type: 'creature';
  cost: number;
  attack: number;
  health: number;
};

type SpellCardDefinition = {
  id: string;
  name: string;
  type: 'spell';
  cost: number;
  damage: number;
};

export type CardDefinition = CreatureCardDefinition | SpellCardDefinition;

export type CreatureInstance = CreatureCardDefinition & {
  instanceId: string;
  currentHealth: number;
};

export type PlayerState = {
  health: number;
  resources: number;
  maxResources: number;
  deck: CardDefinition[];
  hand: CardDefinition[];
  discard: CardDefinition[];
  battlefield: CreatureInstance[];
};

export type GameState = {
  turn: number;
  currentPlayer: PlayerId;
  players: Record<PlayerId, PlayerState>;
};

type CreateGameStateOptions = {
  playerDeck: CardDefinition[];
  opponentDeck: CardDefinition[];
  openingHandSize?: number;
  startingHealth?: number;
};

const MAX_RESOURCES = 10;

export function createGameState(options: CreateGameStateOptions): GameState {
  const openingHandSize = options.openingHandSize ?? 3;
  const startingHealth = options.startingHealth ?? 20;

  return {
    turn: 1,
    currentPlayer: 'player',
    players: {
      player: createPlayerState(options.playerDeck, openingHandSize, startingHealth),
      opponent: createPlayerState(options.opponentDeck, openingHandSize, startingHealth),
    },
  };
}

export function startTurn(state: GameState): GameState {
  const activePlayer = state.currentPlayer;
  const player = state.players[activePlayer];
  const maxResources = Math.min(player.maxResources + 1, MAX_RESOURCES);
  const refreshedPlayer: PlayerState = {
    ...player,
    maxResources,
    resources: maxResources,
  };

  return drawCard({
    ...state,
    players: {
      ...state.players,
      [activePlayer]: refreshedPlayer,
    },
  }, activePlayer);
}

export function endTurn(state: GameState): GameState {
  const nextPlayer = state.currentPlayer === 'player' ? 'opponent' : 'player';

  return startTurn({
    ...state,
    turn: state.turn + 1,
    currentPlayer: nextPlayer,
  });
}

export function playCard(state: GameState, cardId: string): GameState {
  const activePlayer = state.currentPlayer;
  const opposingPlayer = activePlayer === 'player' ? 'opponent' : 'player';
  const player = state.players[activePlayer];
  const card = player.hand.find((entry) => entry.id === cardId);

  if (!card || card.cost > player.resources) {
    return state;
  }

  const hand = player.hand.filter((entry) => entry.id !== cardId);

  if (card.type === 'creature') {
    return {
      ...state,
      players: {
        ...state.players,
        [activePlayer]: {
          ...player,
          resources: player.resources - card.cost,
          hand,
          battlefield: [
            ...player.battlefield,
            {
              ...card,
              instanceId: `${card.id}-${player.battlefield.length + 1}`,
              currentHealth: card.health,
            },
          ],
        },
      },
    };
  }

  return {
    ...state,
    players: {
      ...state.players,
      [activePlayer]: {
        ...player,
        resources: player.resources - card.cost,
        hand,
        discard: [...player.discard, card],
      },
      [opposingPlayer]: {
        ...state.players[opposingPlayer],
        health: state.players[opposingPlayer].health - card.damage,
      },
    },
  };
}

function createPlayerState(deck: CardDefinition[], openingHandSize: number, startingHealth: number): PlayerState {
  return {
    health: startingHealth,
    resources: 0,
    maxResources: 0,
    deck: deck.slice(openingHandSize),
    hand: deck.slice(0, openingHandSize),
    discard: [],
    battlefield: [],
  };
}

function drawCard(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  const [nextCard, ...remainingDeck] = player.deck;

  if (!nextCard) {
    return state;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: remainingDeck,
        hand: [...player.hand, nextCard],
      },
    },
  };
}
