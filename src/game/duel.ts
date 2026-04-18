export type CardKind = 'creature' | 'spell';

type Card =
  | {
      id: string;
      name: string;
      kind: 'creature';
      cost: number;
      attack: number;
      health: number;
      text: string;
    }
  | {
      id: string;
      name: string;
      kind: 'spell';
      cost: number;
      damage: number;
      text: string;
    };

type Unit = {
  id: string;
  name: string;
  attack: number;
  health: number;
};

type Side = {
  name: string;
  heroHealth: number;
  mana: number;
  maxMana: number;
  deck: Card[];
  hand: Card[];
  board: Unit[];
  discard: Card[];
};

export type TurnAction = {
  type: 'draw' | 'play' | 'attack';
  cost: number;
  summary: string;
};

export type TurnReport = {
  turn: number;
  actor: string;
  startMana: number;
  endMana: number;
  playerHeroHealth: number;
  enemyHeroHealth: number;
  actions: TurnAction[];
};

export type EncounterResult = {
  winner: string;
  turns: TurnReport[];
  player: SideSnapshot;
  enemy: SideSnapshot;
};

export type SideSnapshot = {
  name: string;
  heroHealth: number;
  maxMana: number;
  handCount: number;
  deckCount: number;
  discardCount: number;
  board: Unit[];
};

const MAX_MANA = 10;
const MAX_BOARD_SIZE = 3;
const STARTING_HEALTH = 20;
const STARTING_HAND_SIZE = 3;
const TURN_LIMIT = 12;

const skyforgeDeck: Card[] = [
  creature('sky-vanguard', 'Sky Vanguard', 1, 1, 2, 'A steady opener.'),
  creature('stormblade', 'Stormblade', 2, 2, 2, 'Trades up through pressure.'),
  spell('arc-bolt', 'Arc Bolt', 2, 2, 'Direct damage to the opposing hero.'),
  creature('cloud-knight', 'Cloud Knight', 3, 3, 3, 'Reliable mid-game attacker.'),
  spell('sunlance', 'Sunlance', 3, 3, 'A clean burst of finishing damage.'),
  creature('dawn-titan', 'Dawn Titan', 4, 4, 5, 'Large threat for the late game.'),
  creature('sky-vanguard-b', 'Sky Vanguard', 1, 1, 2, 'A steady opener.'),
  spell('arc-bolt-b', 'Arc Bolt', 2, 2, 'Direct damage to the opposing hero.'),
  creature('cloud-knight-b', 'Cloud Knight', 3, 3, 3, 'Reliable mid-game attacker.'),
  spell('sunlance-b', 'Sunlance', 3, 3, 'A clean burst of finishing damage.'),
];

const emberDeck: Card[] = [
  creature('ember-whelp', 'Ember Whelp', 1, 1, 1, 'Fast pressure.'),
  spell('cinder-burst', 'Cinder Burst', 1, 1, 'Chip damage to keep races honest.'),
  creature('ash-raider', 'Ash Raider', 2, 2, 3, 'Solid two-drop pressure.'),
  spell('flame-javelin', 'Flame Javelin', 3, 3, 'Clean burn to the opposing hero.'),
  creature('magma-brute', 'Magma Brute', 4, 5, 4, 'Big top-end attacker.'),
  creature('ember-whelp-b', 'Ember Whelp', 1, 1, 1, 'Fast pressure.'),
  spell('cinder-burst-b', 'Cinder Burst', 1, 1, 'Chip damage to keep races honest.'),
  creature('ash-raider-b', 'Ash Raider', 2, 2, 3, 'Solid two-drop pressure.'),
  spell('flame-javelin-b', 'Flame Javelin', 3, 3, 'Clean burn to the opposing hero.'),
  creature('magma-brute-b', 'Magma Brute', 4, 5, 4, 'Big top-end attacker.'),
];

export function simulateEncounter(): EncounterResult {
  const player = createSide('Player', skyforgeDeck);
  const enemy = createSide('Enemy AI', emberDeck);
  const turns: TurnReport[] = [];

  for (let turn = 1; turn <= TURN_LIMIT; turn += 1) {
    const active = turn % 2 === 1 ? player : enemy;
    const defending = turn % 2 === 1 ? enemy : player;
    const report = takeTurn(active, defending, turn);
    turns.push(report);

    if (defending.heroHealth <= 0) {
      return {
        winner: active.name,
        turns,
        player: snapshotSide(player),
        enemy: snapshotSide(enemy),
      };
    }
  }

  return {
    winner: player.heroHealth >= enemy.heroHealth ? player.name : enemy.name,
    turns,
    player: snapshotSide(player),
    enemy: snapshotSide(enemy),
  };
}

function takeTurn(active: Side, defending: Side, turn: number): TurnReport {
  const actions: TurnAction[] = [];

  active.maxMana = Math.min(MAX_MANA, active.maxMana + 1);
  active.mana = active.maxMana;
  drawCard(active, actions);
  const startMana = active.mana;

  while (true) {
    const nextCard = chooseCardToPlay(active, defending);
    if (!nextCard) {
      break;
    }

    const cardIndex = active.hand.findIndex((card) => card.id === nextCard.id);
    const [card] = active.hand.splice(cardIndex, 1);
    active.mana -= card.cost;

    if (card.kind === 'creature') {
      active.board.push({
        id: card.id,
        name: card.name,
        attack: card.attack,
        health: card.health,
      });
      actions.push({
        type: 'play',
        cost: card.cost,
        summary: `${active.name} plays ${card.name} (${card.attack}/${card.health}).`,
      });
    } else {
      defending.heroHealth -= card.damage;
      active.discard.push(card);
      actions.push({
        type: 'play',
        cost: card.cost,
        summary: `${active.name} casts ${card.name} for ${card.damage} damage.`,
      });
    }

    if (defending.heroHealth <= 0) {
      break;
    }
  }

  if (defending.heroHealth > 0 && active.board.length > 0) {
    const totalAttack = active.board.reduce((sum, unit) => sum + unit.attack, 0);
    defending.heroHealth -= totalAttack;
    actions.push({
      type: 'attack',
      cost: 0,
      summary: `${active.name} attacks with ${active.board.map((unit) => unit.name).join(', ')} for ${totalAttack}.`,
    });
  }

  return {
    turn,
    actor: active.name,
    startMana,
    endMana: active.mana,
    playerHeroHealth: Math.max(0, active.name === 'Player' ? active.heroHealth : defending.heroHealth),
    enemyHeroHealth: Math.max(0, active.name === 'Enemy AI' ? active.heroHealth : defending.heroHealth),
    actions,
  };
}

function chooseCardToPlay(active: Side, defending: Side): Card | undefined {
  const playableCards = active.hand.filter((card) => {
    if (card.cost > active.mana) {
      return false;
    }

    if (card.kind === 'creature' && active.board.length >= MAX_BOARD_SIZE) {
      return false;
    }

    return true;
  });

  if (playableCards.length === 0) {
    return undefined;
  }

  const lethalSpell = playableCards.find(
    (card): card is Extract<Card, { kind: 'spell' }> => card.kind === 'spell' && card.damage >= defending.heroHealth,
  );

  if (lethalSpell) {
    return lethalSpell;
  }

  return [...playableCards].sort(compareCards)[0];
}

function compareCards(left: Card, right: Card) {
  const leftPriority = getCardPriority(left);
  const rightPriority = getCardPriority(right);

  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  if (left.cost !== right.cost) {
    return left.cost - right.cost;
  }

  return left.name.localeCompare(right.name);
}

function getCardPriority(card: Card) {
  if (card.kind === 'creature') {
    return card.attack * 10 + card.health;
  }

  return card.damage * 10;
}

function drawCard(side: Side, actions: TurnAction[]) {
  const nextCard = side.deck.shift();
  if (!nextCard) {
    actions.push({
      type: 'draw',
      cost: 0,
      summary: `${side.name} has no cards left to draw.`,
    });
    return;
  }

  side.hand.push(nextCard);
  actions.push({
    type: 'draw',
    cost: 0,
    summary: `${side.name} draws ${nextCard.name}.`,
  });
}

function createSide(name: string, deckList: Card[]): Side {
  const side: Side = {
    name,
    heroHealth: STARTING_HEALTH,
    mana: 0,
    maxMana: 0,
    deck: deckList.map((card) => ({ ...card })),
    hand: [],
    board: [],
    discard: [],
  };

  for (let index = 0; index < STARTING_HAND_SIZE; index += 1) {
    drawCard(side, []);
  }

  return side;
}

function snapshotSide(side: Side): SideSnapshot {
  return {
    name: side.name,
    heroHealth: Math.max(0, side.heroHealth),
    maxMana: side.maxMana,
    handCount: side.hand.length,
    deckCount: side.deck.length,
    discardCount: side.discard.length,
    board: side.board.map((unit) => ({ ...unit })),
  };
}

function creature(id: string, name: string, cost: number, attack: number, health: number, text: string): Card {
  return {
    id,
    name,
    kind: 'creature',
    cost,
    attack,
    health,
    text,
  };
}

function spell(id: string, name: string, cost: number, damage: number, text: string): Card {
  return {
    id,
    name,
    kind: 'spell',
    cost,
    damage,
    text,
  };
}
