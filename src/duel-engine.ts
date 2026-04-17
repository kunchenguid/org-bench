export type PlayerId = 'player' | 'enemy';

export type CardDefinition =
  | {
      id: string;
      name: string;
      kind: 'creature';
      cost: number;
      attack: number;
      health: number;
    }
  | {
      id: string;
      name: string;
      kind: 'spell';
      cost: number;
      damage: number;
    };

export type HandCard = {
  instanceId: number;
  cardId: string;
};

export type BattlefieldCard = {
  instanceId: number;
  cardId: string;
  attack: number;
  health: number;
  exhausted: boolean;
};

export type PlayerState = {
  health: number;
  maxResources: number;
  resources: number;
  deck: string[];
  hand: HandCard[];
  discard: string[];
  battlefield: BattlefieldCard[];
};

export type GameState = {
  activePlayerId: PlayerId;
  turn: number;
  winnerId: PlayerId | null;
  players: Record<PlayerId, PlayerState>;
  cardsById: Record<string, CardDefinition>;
  nextInstanceId: number;
};

export type GameAction =
  | {
      type: 'play_card';
      playerId: PlayerId;
      cardInstanceId: number;
    }
  | {
      type: 'attack';
      playerId: PlayerId;
      attackerInstanceId: number;
      target:
        | {
            type: 'hero';
            playerId: PlayerId;
          }
        | {
            type: 'creature';
            playerId: PlayerId;
            instanceId: number;
          };
    }
  | {
      type: 'end_turn';
      playerId: PlayerId;
    };

type CreateGameInput = {
  cards: CardDefinition[];
  playerDeck: string[];
  enemyDeck: string[];
  startingHandSize: number;
  startingHealth: number;
};

const MAX_RESOURCES = 10;

const getCardsById = (cards: CardDefinition[]) =>
  Object.fromEntries(cards.map((card) => [card.id, card])) as Record<string, CardDefinition>;

const clonePlayers = (players: Record<PlayerId, PlayerState>): Record<PlayerId, PlayerState> => ({
  player: {
    ...players.player,
    deck: [...players.player.deck],
    hand: [...players.player.hand],
    discard: [...players.player.discard],
    battlefield: [...players.player.battlefield],
  },
  enemy: {
    ...players.enemy,
    deck: [...players.enemy.deck],
    hand: [...players.enemy.hand],
    discard: [...players.enemy.discard],
    battlefield: [...players.enemy.battlefield],
  },
});

const drawCard = (state: GameState, playerId: PlayerId): GameState => {
  const players = clonePlayers(state.players);
  const deck = [...players[playerId].deck];
  const nextCardId = deck.shift();

  players[playerId].deck = deck;

  if (!nextCardId) {
    return {
      ...state,
      players,
    };
  }

  players[playerId].hand.push({
    instanceId: state.nextInstanceId,
    cardId: nextCardId,
  });

  return {
    ...state,
    players,
    nextInstanceId: state.nextInstanceId + 1,
  };
};

export const getOpponentId = (playerId: PlayerId): PlayerId => (playerId === 'player' ? 'enemy' : 'player');

export const createGame = ({
  cards,
  playerDeck,
  enemyDeck,
  startingHandSize,
  startingHealth,
}: CreateGameInput): GameState => {
  const cardsById = getCardsById(cards);

  let state: GameState = {
    activePlayerId: 'player',
    turn: 1,
    winnerId: null,
    cardsById,
    nextInstanceId: 1,
    players: {
      player: {
        health: startingHealth,
        maxResources: 1,
        resources: 1,
        deck: [...playerDeck],
        hand: [],
        discard: [],
        battlefield: [],
      },
      enemy: {
        health: startingHealth,
        maxResources: 0,
        resources: 0,
        deck: [...enemyDeck],
        hand: [],
        discard: [],
        battlefield: [],
      },
    },
  };

  for (let index = 0; index < startingHandSize; index += 1) {
    state = drawCard(state, 'player');
    state = drawCard(state, 'enemy');
  }

  return state;
};

export const getLegalActions = (state: GameState): GameAction[] => {
  if (state.winnerId) {
    return [];
  }

  const playerId = state.activePlayerId;
  const player = state.players[playerId];
  const playableCards = player.hand
    .filter((card) => state.cardsById[card.cardId].cost <= player.resources)
    .map((card) => ({
      type: 'play_card' as const,
      playerId,
      cardInstanceId: card.instanceId,
    }));

  const attackActions = player.battlefield
    .filter((card) => !card.exhausted)
    .flatMap<GameAction>((card) => {
      const opponentId = getOpponentId(playerId);
      const opponentBattlefield = state.players[opponentId].battlefield;

      if (opponentBattlefield.length === 0) {
        return [
          {
            type: 'attack' as const,
            playerId,
            attackerInstanceId: card.instanceId,
            target: {
              type: 'hero' as const,
              playerId: opponentId,
            },
          },
        ];
      }

      return opponentBattlefield.map((target) => ({
        type: 'attack' as const,
        playerId,
        attackerInstanceId: card.instanceId,
        target: {
          type: 'creature' as const,
          playerId: opponentId,
          instanceId: target.instanceId,
        },
      }));
    });

  return [...playableCards, ...attackActions, { type: 'end_turn' as const, playerId }];
};

const getCardImpactScore = (card: CardDefinition): number => {
  if (card.kind === 'spell') {
    return card.damage * 100 + card.cost;
  }

  return card.attack * 100 + card.health * 10 + card.cost;
};

export const chooseEnemyAction = (state: GameState): GameAction => {
  if (state.activePlayerId !== 'enemy') {
    throw new Error('enemy AI can only act on the enemy turn');
  }

  const legalActions = getLegalActions(state);
  const endTurnAction = legalActions.find((action) => action.type === 'end_turn');
  const playableActions = legalActions.filter((action) => action.type === 'play_card');

  const lethalSpell = playableActions.find((action) => {
    const handCard = state.players.enemy.hand.find((card) => card.instanceId === action.cardInstanceId);

    if (!handCard) {
      return false;
    }

    const definition = state.cardsById[handCard.cardId];

    return definition.kind === 'spell' && definition.damage >= state.players.player.health;
  });

  if (lethalSpell) {
    return lethalSpell;
  }

  const bestPlayableAction = playableActions.reduce<GameAction | null>((bestAction, action) => {
    const handCard = state.players.enemy.hand.find((card) => card.instanceId === action.cardInstanceId);

    if (!handCard) {
      return bestAction;
    }

    if (!bestAction || bestAction.type !== 'play_card') {
      return action;
    }

    const bestHandCard = state.players.enemy.hand.find((card) => card.instanceId === bestAction.cardInstanceId);

    if (!bestHandCard) {
      return action;
    }

    const definition = state.cardsById[handCard.cardId];
    const bestDefinition = state.cardsById[bestHandCard.cardId];

    return getCardImpactScore(definition) > getCardImpactScore(bestDefinition) ? action : bestAction;
  }, null);

  if (bestPlayableAction) {
    return bestPlayableAction;
  }

  if (!endTurnAction) {
    throw new Error('enemy turn has no legal end_turn action');
  }

  return endTurnAction;
};

const assertActivePlayer = (state: GameState, playerId: PlayerId) => {
  if (state.winnerId) {
    throw new Error('game is already finished');
  }

  if (state.activePlayerId !== playerId) {
    throw new Error('only the active player can act');
  }
};

const readyBattlefield = (battlefield: BattlefieldCard[]) => battlefield.map((card) => ({ ...card, exhausted: false }));

const moveDefeatedCreatures = (player: PlayerState) => {
  const survivors: BattlefieldCard[] = [];

  for (const creature of player.battlefield) {
    if (creature.health > 0) {
      survivors.push(creature);
      continue;
    }

    player.discard.push(creature.cardId);
  }

  player.battlefield = survivors;
};

export const resolveAction = (state: GameState, action: GameAction): GameState => {
  assertActivePlayer(state, action.playerId);

  if (action.type === 'end_turn') {
    const nextPlayerId = getOpponentId(action.playerId);
    const players = clonePlayers(state.players);
    const nextMaxResources = Math.min(players[nextPlayerId].maxResources + 1, MAX_RESOURCES);

    players[nextPlayerId].maxResources = nextMaxResources;
    players[nextPlayerId].resources = nextMaxResources;
    players[nextPlayerId].battlefield = readyBattlefield(players[nextPlayerId].battlefield);

    const endedTurnState: GameState = {
      ...state,
      activePlayerId: nextPlayerId,
      turn: state.turn + 1,
      players,
    };

    return drawCard(endedTurnState, nextPlayerId);
  }

  if (action.type === 'attack') {
    const players = clonePlayers(state.players);
    const activePlayer = players[action.playerId];
    const attacker = activePlayer.battlefield.find((card) => card.instanceId === action.attackerInstanceId);

    if (!attacker) {
      throw new Error('attacker is not on the battlefield');
    }

    if (attacker.exhausted) {
      throw new Error('attacker is exhausted');
    }

    attacker.exhausted = true;

    if (action.target.type === 'hero') {
      const defendingPlayer = players[action.target.playerId];
      const nextHealth = Math.max(0, defendingPlayer.health - attacker.attack);
      defendingPlayer.health = nextHealth;

      return {
        ...state,
        winnerId: nextHealth === 0 ? action.playerId : null,
        players,
      };
    }

    const defendingPlayer = players[action.target.playerId];
    const defenderTarget = action.target;
    const defender = defendingPlayer.battlefield.find((card) => card.instanceId === defenderTarget.instanceId);

    if (!defender) {
      throw new Error('defender is not on the battlefield');
    }

    attacker.health -= defender.attack;
    defender.health -= attacker.attack;
    moveDefeatedCreatures(activePlayer);
    moveDefeatedCreatures(defendingPlayer);

    return {
      ...state,
      players,
    };
  }

  const players = clonePlayers(state.players);
  const activePlayer = players[action.playerId];
  const handIndex = activePlayer.hand.findIndex((card) => card.instanceId === action.cardInstanceId);

  if (handIndex === -1) {
    throw new Error('card is not in hand');
  }

  const [handCard] = activePlayer.hand.splice(handIndex, 1);
  const definition = state.cardsById[handCard.cardId];

  if (!definition) {
    throw new Error('unknown card');
  }

  if (definition.cost > activePlayer.resources) {
    throw new Error('card is not affordable');
  }

  activePlayer.resources -= definition.cost;

  if (definition.kind === 'creature') {
    activePlayer.battlefield.push({
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      attack: definition.attack,
      health: definition.health,
      exhausted: true,
    });

    return {
      ...state,
      players,
    };
  }

  const opponentId = getOpponentId(action.playerId);
  const nextHealth = Math.max(0, players[opponentId].health - definition.damage);
  players[opponentId].health = nextHealth;
  activePlayer.discard.push(handCard.cardId);

  return {
    ...state,
    winnerId: nextHealth === 0 ? action.playerId : null,
    players,
  };
};
