export type SideKey = 'player' | 'opponent';

export type CardDefinition = CreatureCardDefinition | SpellCardDefinition;

type BaseCardDefinition = {
  key: string;
  name: string;
  cost: number;
  text: string;
};

export type CreatureCardDefinition = BaseCardDefinition & {
  type: 'creature';
  attack: number;
  health: number;
};

export type SpellCardDefinition = BaseCardDefinition & {
  type: 'spell';
  damage: number;
};

export type CardInstance = CardDefinition & {
  id: string;
};

export type BattlefieldCard = CreatureCardDefinition & {
  id: string;
  currentHealth: number;
};

export type SideState = {
  name: string;
  health: number;
  mana: {
    current: number;
    max: number;
  };
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  battlefield: BattlefieldCard[];
};

export type GameState = {
  encounterName: string;
  turn: number;
  currentPlayer: SideKey;
  player: SideState;
  opponent: SideState;
  log: string[];
};

const cards = {
  ashStriker: {
    key: 'ash-striker',
    name: 'Ash Striker',
    type: 'creature',
    cost: 1,
    attack: 2,
    health: 2,
    text: 'Fast pressure for the opening turn.',
  },
  emberBolt: {
    key: 'ember-bolt',
    name: 'Ember Bolt',
    type: 'spell',
    cost: 1,
    damage: 2,
    text: 'Deal 2 damage to the opposing duelist.',
  },
  cinderMage: {
    key: 'cinder-mage',
    name: 'Cinder Mage',
    type: 'creature',
    cost: 2,
    attack: 3,
    health: 2,
    text: 'A heavier follow-up once mana opens up.',
  },
  stoneguardSentinel: {
    key: 'stoneguard-sentinel',
    name: 'Stoneguard Sentinel',
    type: 'creature',
    cost: 1,
    attack: 2,
    health: 3,
    text: 'The encounter defender that comes down on curve.',
  },
  quarryScout: {
    key: 'quarry-scout',
    name: 'Quarry Scout',
    type: 'creature',
    cost: 2,
    attack: 2,
    health: 4,
    text: 'A sturdy backup body for the AI deck.',
  },
} satisfies Record<string, CardDefinition>;

const playerDeckPlan = [cards.ashStriker, cards.emberBolt, cards.cinderMage, cards.ashStriker, cards.emberBolt];
const opponentDeckPlan = [
  cards.stoneguardSentinel,
  cards.quarryScout,
  cards.emberBolt,
  cards.stoneguardSentinel,
  cards.quarryScout,
];

function instantiateDeck(plan: CardDefinition[], owner: SideKey): CardInstance[] {
  return plan.map((card, index) => ({
    ...card,
    id: `${owner}-${card.key}-${index + 1}`,
  }));
}

function drawCards(side: SideState, count: number): SideState {
  const drawn = side.deck.slice(0, count);
  return {
    ...side,
    deck: side.deck.slice(count),
    hand: [...side.hand, ...drawn],
  };
}

function createSide(name: string, owner: SideKey, openingMana: number): SideState {
  const plan = owner === 'player' ? playerDeckPlan : opponentDeckPlan;
  return drawCards(
    {
      name,
      health: 20,
      mana: {
        current: openingMana,
        max: openingMana,
      },
      deck: instantiateDeck(plan, owner),
      hand: [],
      discard: [],
      battlefield: [],
    },
    3,
  );
}

function replaceSide(state: GameState, actor: SideKey, side: SideState): GameState {
  return actor === 'player' ? { ...state, player: side } : { ...state, opponent: side };
}

function addLog(state: GameState, entry: string): GameState {
  return {
    ...state,
    log: [...state.log, entry],
  };
}

function materializeCreature(card: CardInstance): BattlefieldCard {
  if (card.type !== 'creature') {
    throw new Error('Only creature cards can enter the battlefield');
  }

  return {
    ...card,
    currentHealth: card.health,
  };
}

function resolveCardPlay(state: GameState, actor: SideKey, cardId: string): GameState {
  const actingSide = actor === 'player' ? state.player : state.opponent;
  const defendingSide = actor === 'player' ? state.opponent : state.player;
  const card = actingSide.hand.find((candidate) => candidate.id === cardId);

  if (!card || card.cost > actingSide.mana.current) {
    return state;
  }

  const updatedActor: SideState = {
    ...actingSide,
    mana: {
      ...actingSide.mana,
      current: actingSide.mana.current - card.cost,
    },
    hand: actingSide.hand.filter((candidate) => candidate.id !== cardId),
  };

  if (card.type === 'creature') {
    return addLog(
      replaceSide(state, actor, {
        ...updatedActor,
        battlefield: [...updatedActor.battlefield, materializeCreature(card)],
      }),
      `${actor === 'player' ? 'You' : 'Enemy'} played ${card.name}.`,
    );
  }

  const nextState = addLog(
    replaceSide(state, actor, {
      ...updatedActor,
      discard: [...updatedActor.discard, card],
    }),
    `${actor === 'player' ? 'You' : 'Enemy'} played ${card.name}.`,
  );
  const updatedDefender: SideState = {
    ...defendingSide,
    health: Math.max(0, defendingSide.health - card.damage),
  };

  return replaceSide(nextState, actor === 'player' ? 'opponent' : 'player', updatedDefender);
}

function beginTurn(state: GameState, actor: SideKey, turn: number): GameState {
  const actingSide = actor === 'player' ? state.player : state.opponent;
  const nextMana = Math.min(actingSide.mana.max + 1, 10);
  const nextSide = drawCards(
    {
      ...actingSide,
      mana: {
        max: nextMana,
        current: nextMana,
      },
    },
    1,
  );

  return replaceSide(
    {
      ...state,
      turn,
      currentPlayer: actor,
    },
    actor,
    nextSide,
  );
}

function runOpponentTurn(state: GameState): GameState {
  let nextState = beginTurn(state, 'opponent', state.turn);
  const affordableCard = nextState.opponent.hand.find((card) => card.cost <= nextState.opponent.mana.current);

  if (affordableCard) {
    nextState = resolveCardPlay(nextState, 'opponent', affordableCard.id);
  }

  const attackDamage = nextState.opponent.battlefield.reduce((sum, card) => sum + card.attack, 0);
  if (attackDamage > 0) {
    nextState = {
      ...nextState,
      player: {
        ...nextState.player,
        health: Math.max(0, nextState.player.health - attackDamage),
      },
    };
    nextState = addLog(nextState, `Enemy attacked for ${attackDamage} damage.`);
  }

  nextState = beginTurn(nextState, 'player', nextState.turn + 1);
  return addLog(nextState, `Turn ${nextState.turn} - Your turn.`);
}

export function createEncounterState(): GameState {
  return {
    encounterName: 'Ember Ridge',
    turn: 1,
    currentPlayer: 'player',
    player: createSide('You', 'player', 1),
    opponent: createSide('Enemy', 'opponent', 0),
    log: ['Ember Ridge encounter ready.'],
  };
}

export function playCard(state: GameState, actor: SideKey, cardId: string): GameState {
  if (state.currentPlayer !== actor) {
    return state;
  }

  const card = (actor === 'player' ? state.player.hand : state.opponent.hand).find(
    (candidate) => candidate.id === cardId,
  );
  const nextState = resolveCardPlay(state, actor, cardId);

  if (!card || nextState === state) {
    return nextState;
  }

  const actorLabel = actor === 'player' ? 'You' : 'Enemy';
  return addLog(nextState, `${actorLabel} played ${card.name}.`);
}

export function endTurn(state: GameState): GameState {
  if (state.currentPlayer !== 'player') {
    return state;
  }

  const passedState = addLog({ ...state, currentPlayer: 'opponent' }, 'You ended the turn.');
  return runOpponentTurn(passedState);
}
