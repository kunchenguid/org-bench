const CARD_LIBRARY = {
  emberling: { id: 'emberling', name: 'Emberling Scout', cost: 1, attack: 1, health: 2, text: 'Reliable opening unit.' },
  sparksmith: { id: 'sparksmith', name: 'Sparksmith Adept', cost: 2, attack: 2, health: 2, text: 'A balanced mid-game unit.' },
  ashguard: { id: 'ashguard', name: 'Ashguard Brute', cost: 3, attack: 3, health: 4, text: 'A sturdy frontliner.' },
  solarion: { id: 'solarion', name: 'Solarion Drake', cost: 4, attack: 4, health: 4, text: 'A heavy finisher.' },
};

const PLAYER_DECK = [
  'emberling', 'emberling', 'emberling',
  'sparksmith', 'sparksmith', 'sparksmith',
  'ashguard', 'ashguard',
  'solarion',
];

const ENEMY_DECK = [
  'emberling', 'emberling',
  'sparksmith', 'sparksmith', 'sparksmith',
  'ashguard', 'ashguard', 'ashguard',
  'solarion',
];

function createRng(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function shuffle(deck, seed) {
  const rng = createRng(seed);
  const cards = deck.map((cardId, index) => createCard(cardId, index));
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const temp = cards[index];
    cards[index] = cards[swapIndex];
    cards[swapIndex] = temp;
  }
  return cards;
}

function createCard(cardId, index) {
  const base = CARD_LIBRARY[cardId];
  return {
    uid: cardId + '-' + index,
    cardId: base.id,
    name: base.name,
    cost: base.cost,
    attack: base.attack,
    health: base.health,
    maxHealth: base.health,
    text: base.text,
    sleeping: false,
  };
}

function drawCard(side) {
  if (!side.deck.length || side.hand.length >= 7) {
    return;
  }
  side.hand.push(side.deck.shift());
}

function refreshBoard(side) {
  side.board.forEach((card) => {
    card.sleeping = false;
  });
}

function createSide(name, heroName, deck) {
  return {
    side: name,
    heroName,
    health: 20,
    maxHealth: 20,
    mana: 0,
    maxMana: 0,
    deck,
    hand: [],
    board: [],
  };
}

function createInitialState(seed = Date.now()) {
  const player = createSide('player', 'Captain Sol', shuffle(PLAYER_DECK, seed));
  const enemy = createSide('enemy', 'Mist Warden', shuffle(ENEMY_DECK, seed + 99));

  for (let index = 0; index < 3; index += 1) {
    drawCard(player);
    drawCard(enemy);
  }

  player.maxMana = 1;
  player.mana = 1;

  return {
    seed,
    turn: 1,
    currentPlayer: 'player',
    winner: null,
    tutorialStep: 0,
    player,
    enemy,
    log: ['Your turn - play a unit, then end the turn.'],
  };
}

function getSide(state, sideName) {
  return sideName === 'player' ? state.player : state.enemy;
}

function getOpponent(state, sideName) {
  return sideName === 'player' ? state.enemy : state.player;
}

function playCard(state, sideName, handIndex) {
  const next = clone(state);
  const side = getSide(next, sideName);
  if (next.winner || next.currentPlayer !== sideName) {
    return next;
  }

  const card = side.hand[handIndex];
  if (!card || card.cost > side.mana || side.board.length >= 5) {
    return next;
  }

  side.hand.splice(handIndex, 1);
  side.mana -= card.cost;
  card.sleeping = true;
  side.board.push(card);
  next.log.push((sideName === 'player' ? 'You' : 'Enemy') + ' played ' + card.name + '.');
  return next;
}

function attackHero(state, sideName, boardIndex) {
  const next = clone(state);
  const side = getSide(next, sideName);
  const opponent = getOpponent(next, sideName);
  const attacker = side.board[boardIndex];
  if (!attacker || attacker.sleeping) {
    return next;
  }

  attacker.sleeping = true;
  opponent.health = Math.max(0, opponent.health - attacker.attack);
  next.log.push(attacker.name + ' hit ' + opponent.heroName + ' for ' + attacker.attack + '.');
  if (opponent.health === 0) {
    next.winner = sideName;
    next.log.push((sideName === 'player' ? 'You win!' : 'You lose!'));
  }
  return next;
}

function attackWithUnit(state, sideName, boardIndex) {
  if (state.winner || state.currentPlayer !== sideName) {
    return clone(state);
  }
  return attackHero(state, sideName, boardIndex);
}

function startTurn(state, sideName) {
  const side = getSide(state, sideName);
  side.maxMana = Math.min(10, side.maxMana + 1);
  side.mana = side.maxMana;
  refreshBoard(side);
  drawCard(side);
}

function runEnemyTurn(state) {
  let next = clone(state);
  next.currentPlayer = 'enemy';
  next.log.push('Enemy turn - the Mist Warden advances.');
  startTurn(next, 'enemy');

  while (true) {
    const playableIndex = next.enemy.hand.findIndex((card) => card.cost <= next.enemy.mana);
    if (playableIndex === -1) {
      break;
    }
    next = playCard(next, 'enemy', playableIndex);
  }

  for (let index = 0; index < next.enemy.board.length; index += 1) {
    if (next.winner) {
      break;
    }
    next = attackHero(next, 'enemy', index);
  }

  next.currentPlayer = 'player';
  next.turn += 1;
  startTurn(next, 'player');
  next.log.push('Your turn - glowing cards can be played now.');
  return next;
}

function endTurn(state) {
  if (state.winner || state.currentPlayer !== 'player') {
    return clone(state);
  }

  const afterPlayerAttacks = clone(state);
  for (let index = 0; index < afterPlayerAttacks.player.board.length; index += 1) {
    if (afterPlayerAttacks.winner) {
      break;
    }
    afterPlayerAttacks.player.board[index].sleeping = false;
  }
  return runEnemyTurn(afterPlayerAttacks);
}

function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(value) {
  return JSON.parse(value);
}

const api = {
  CARD_LIBRARY,
  createInitialState,
  playCard,
  attackWithUnit,
  endTurn,
  serializeState,
  deserializeState,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.DuelGameLogic = api;
}
