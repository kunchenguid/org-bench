export type PlayerId = 'player' | 'opponent';

export type DuelOutcome = 'in_progress' | 'player_won' | 'opponent_won';

export interface ResourceState {
  current: number;
  max: number;
}

export interface PlayerState {
  deck: string[];
  hand: string[];
  discard: string[];
  battlefield: string[];
  health: number;
  resources: ResourceState;
}

export interface DuelState {
  activePlayer: PlayerId;
  turn: number;
  outcome: DuelOutcome;
  players: Record<PlayerId, PlayerState>;
}

export interface CreateDuelStateInput {
  playerDeck: string[];
  opponentDeck: string[];
  openingHandSize?: number;
}

const MAX_HEALTH = 20;
const MAX_RESOURCES = 10;

function createPlayerState(deck: string[], openingHandSize: number): PlayerState {
  return {
    deck: deck.slice(openingHandSize),
    hand: deck.slice(0, openingHandSize),
    discard: [],
    battlefield: [],
    health: MAX_HEALTH,
    resources: {
      current: 0,
      max: 0,
    },
  };
}

function clonePlayer(player: PlayerState): PlayerState {
  return {
    deck: [...player.deck],
    hand: [...player.hand],
    discard: [...player.discard],
    battlefield: [...player.battlefield],
    health: player.health,
    resources: { ...player.resources },
  };
}

function getWinnerFromDefeat(target: PlayerId): DuelOutcome {
  return target === 'player' ? 'opponent_won' : 'player_won';
}

export function createDuelState({
  playerDeck,
  opponentDeck,
  openingHandSize = 3,
}: CreateDuelStateInput): DuelState {
  return {
    activePlayer: 'player',
    turn: 1,
    outcome: 'in_progress',
    players: {
      player: createPlayerState(playerDeck, openingHandSize),
      opponent: createPlayerState(opponentDeck, openingHandSize),
    },
  };
}

export function advanceTurn(state: DuelState): DuelState {
  const nextActivePlayer = state.activePlayer === 'player' ? 'opponent' : 'player';
  const nextTurn = nextActivePlayer === 'player' ? state.turn + 1 : state.turn;
  const players = {
    player: clonePlayer(state.players.player),
    opponent: clonePlayer(state.players.opponent),
  };
  const player = players[nextActivePlayer];
  const nextMaxResources = Math.min(player.resources.max + 1, MAX_RESOURCES);
  const drawnCard = player.deck[0];

  if (drawnCard) {
    player.hand.push(drawnCard);
    player.deck = player.deck.slice(1);
  }

  player.resources = {
    current: nextMaxResources,
    max: nextMaxResources,
  };

  return {
    activePlayer: nextActivePlayer,
    turn: nextTurn,
    outcome: state.outcome,
    players,
  };
}

export function deployCard(
  state: DuelState,
  playerId: PlayerId,
  handIndex: number,
  cost: number
): DuelState {
  const players = {
    player: clonePlayer(state.players.player),
    opponent: clonePlayer(state.players.opponent),
  };
  const player = players[playerId];
  const [card] = player.hand.splice(handIndex, 1);

  if (!card) {
    return state;
  }

  player.battlefield.push(card);
  player.resources.current = Math.max(0, player.resources.current - cost);

  return {
    ...state,
    players,
  };
}

export function dealDamage(state: DuelState, playerId: PlayerId, amount: number): DuelState {
  const players = {
    player: clonePlayer(state.players.player),
    opponent: clonePlayer(state.players.opponent),
  };
  const player = players[playerId];
  const nextHealth = Math.max(0, player.health - amount);

  player.health = nextHealth;

  return {
    ...state,
    outcome: nextHealth === 0 ? getWinnerFromDefeat(playerId) : state.outcome,
    players,
  };
}
