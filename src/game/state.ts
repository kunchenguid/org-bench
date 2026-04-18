export type PlayerId = 'player' | 'opponent';
export type DeckId = 'ember' | 'tidal';
export type CardType = 'creature' | 'spell';

export type CardDefinition =
  | {
      id: string;
      name: string;
      type: 'creature';
      cost: number;
      power: number;
      health: number;
    }
  | {
      id: string;
      name: string;
      type: 'spell';
      cost: number;
      damage: number;
    };

type PlayerState = {
  id: PlayerId;
  deckId: DeckId;
  health: number;
  deck: CardDefinition[];
  hand: CardDefinition[];
  battlefield: CardDefinition[];
  discardPile: CardDefinition[];
  resources: {
    current: number;
    max: number;
  };
};

export type GameState = {
  turn: number;
  activePlayer: PlayerId;
  player: PlayerState;
  opponent: PlayerState;
};

type PlayCardInput = {
  playerId: PlayerId;
  handIndex: number;
  targetPlayerId?: PlayerId;
};

const EMBER_DECK: CardDefinition[] = [
  creature('ember-scout', 'Ember Scout', 1, 1, 1),
  creature('ember-scout', 'Ember Scout', 1, 1, 1),
  spell('ember-spark', 'Ember Spark', 1, 3),
  creature('ember-guard', 'Ember Guard', 2, 2, 3),
  spell('ember-spark', 'Ember Spark', 1, 3),
  creature('ember-mage', 'Ember Mage', 2, 3, 1),
  creature('ember-guard', 'Ember Guard', 2, 2, 3),
  creature('ember-rider', 'Ember Rider', 3, 3, 2),
  spell('cinder-burst', 'Cinder Burst', 2, 4),
  creature('ember-rider', 'Ember Rider', 3, 3, 2),
  creature('ashbound-brute', 'Ashbound Brute', 3, 4, 3),
  spell('cinder-burst', 'Cinder Burst', 2, 4),
  creature('ashbound-brute', 'Ashbound Brute', 3, 4, 3),
  creature('flamecaller', 'Flamecaller', 4, 4, 4),
  spell('phoenix-flare', 'Phoenix Flare', 4, 6),
  creature('flamecaller', 'Flamecaller', 4, 4, 4),
  creature('inferno-titan', 'Inferno Titan', 5, 6, 5),
  spell('phoenix-flare', 'Phoenix Flare', 4, 6),
  creature('inferno-titan', 'Inferno Titan', 5, 6, 5),
  spell('ember-nova', 'Ember Nova', 6, 8)
];

const TIDAL_DECK: CardDefinition[] = [
  creature('tidal-myrmidon', 'Tidal Myrmidon', 1, 1, 2),
  creature('tidal-myrmidon', 'Tidal Myrmidon', 1, 1, 2),
  spell('mist-bolt', 'Mist Bolt', 1, 2),
  creature('reef-warden', 'Reef Warden', 2, 2, 4),
  spell('mist-bolt', 'Mist Bolt', 1, 2),
  creature('current-sage', 'Current Sage', 2, 2, 2),
  creature('reef-warden', 'Reef Warden', 2, 2, 4),
  creature('wave-stalker', 'Wave Stalker', 3, 3, 3),
  spell('undertow', 'Undertow', 2, 4),
  creature('wave-stalker', 'Wave Stalker', 3, 3, 3),
  creature('shellback-giant', 'Shellback Giant', 3, 4, 4),
  spell('undertow', 'Undertow', 2, 4),
  creature('shellback-giant', 'Shellback Giant', 3, 4, 4),
  creature('depthcaller', 'Depthcaller', 4, 4, 5),
  spell('maelstrom', 'Maelstrom', 4, 6),
  creature('depthcaller', 'Depthcaller', 4, 4, 5),
  creature('kraken-guard', 'Kraken Guard', 5, 5, 7),
  spell('maelstrom', 'Maelstrom', 4, 6),
  creature('kraken-guard', 'Kraken Guard', 5, 5, 7),
  creature('tidal-leviathan', 'Tidal Leviathan', 6, 7, 8)
];

export function getPreconstructedDeck(deckId: DeckId): CardDefinition[] {
  return cloneCards(deckId === 'ember' ? EMBER_DECK : TIDAL_DECK);
}

export function createInitialGameState(): GameState {
  const playerDeck = getPreconstructedDeck('ember');
  const opponentDeck = getPreconstructedDeck('tidal');

  return {
    turn: 1,
    activePlayer: 'player',
    player: createPlayerState('player', 'ember', playerDeck),
    opponent: createPlayerState('opponent', 'tidal', opponentDeck)
  };
}

export function startTurn(state: GameState): GameState {
  const nextState = cloneState(state);
  const actor = nextState[nextState.activePlayer];

  actor.resources.max = Math.min(actor.resources.max + 1, 10);
  actor.resources.current = actor.resources.max;
  drawCard(actor);

  return nextState;
}

export function endTurn(state: GameState): GameState {
  const nextActivePlayer = state.activePlayer === 'player' ? 'opponent' : 'player';

  return {
    ...cloneState(state),
    turn: state.activePlayer === 'opponent' ? state.turn + 1 : state.turn,
    activePlayer: nextActivePlayer
  };
}

export function playCard(state: GameState, input: PlayCardInput): GameState {
  if (state.activePlayer !== input.playerId) {
    throw new Error('Only the active player can play cards.');
  }

  const nextState = cloneState(state);
  const actor = nextState[input.playerId];
  const card = actor.hand[input.handIndex];

  if (!card) {
    throw new Error('Card index is out of range.');
  }

  if (actor.resources.current < card.cost) {
    throw new Error('Not enough resources to play this card.');
  }

  actor.resources.current -= card.cost;
  actor.hand.splice(input.handIndex, 1);

  if (card.type === 'creature') {
    actor.battlefield.push(card);
    return nextState;
  }

  const targetPlayer = nextState[input.targetPlayerId ?? opposingPlayerId(input.playerId)];
  targetPlayer.health = Math.max(targetPlayer.health - card.damage, 0);
  actor.discardPile.push(card);

  return nextState;
}

function createPlayerState(id: PlayerId, deckId: DeckId, deck: CardDefinition[]): PlayerState {
  const openingHand = deck.splice(0, 3);

  return {
    id,
    deckId,
    health: 20,
    deck,
    hand: openingHand,
    battlefield: [],
    discardPile: [],
    resources: {
      current: 0,
      max: 0
    }
  };
}

function drawCard(player: PlayerState): void {
  const card = player.deck.shift();

  if (card) {
    player.hand.push(card);
  }
}

function opposingPlayerId(playerId: PlayerId): PlayerId {
  return playerId === 'player' ? 'opponent' : 'player';
}

function cloneState(state: GameState): GameState {
  return {
    turn: state.turn,
    activePlayer: state.activePlayer,
    player: clonePlayerState(state.player),
    opponent: clonePlayerState(state.opponent)
  };
}

function clonePlayerState(player: PlayerState): PlayerState {
  return {
    ...player,
    deck: cloneCards(player.deck),
    hand: cloneCards(player.hand),
    battlefield: cloneCards(player.battlefield),
    discardPile: cloneCards(player.discardPile),
    resources: { ...player.resources }
  };
}

function cloneCards(cards: CardDefinition[]): CardDefinition[] {
  return cards.map((card) => ({ ...card }));
}

function creature(
  id: string,
  name: string,
  cost: number,
  power: number,
  health: number
): CardDefinition {
  return { id, name, type: 'creature', cost, power, health };
}

function spell(id: string, name: string, cost: number, damage: number): CardDefinition {
  return { id, name, type: 'spell', cost, damage };
}
