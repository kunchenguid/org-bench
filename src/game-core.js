(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.GameCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PLAYER_DECK = [
    { id: 'ember-mage', name: 'Ember Mage', cost: 1, attack: 1, health: 2 },
    { id: 'sunlancer', name: 'Sunlancer', cost: 2, attack: 2, health: 2 },
    { id: 'sky-warden', name: 'Sky Warden', cost: 3, attack: 3, health: 3 },
    { id: 'dawn-giant', name: 'Dawn Giant', cost: 4, attack: 4, health: 5 },
  ];

  const ENCOUNTERS = [
    {
      id: 'bog-witch',
      name: 'Fen Mire Ambush',
      enemyHero: { name: 'Bog Witch', health: 16 },
      enemyDeck: [
        { id: 'bog-spider', name: 'Bog Spider', cost: 2, attack: 2, health: 2 },
        { id: 'mire-hound', name: 'Mire Hound', cost: 1, attack: 1, health: 2 },
        { id: 'toad-brute', name: 'Toad Brute', cost: 3, attack: 3, health: 4 },
      ],
      enemyStyle: { primary: '#6c8f4e', secondary: '#2e4423' },
      hint: 'Bog Witch floods the board with sticky beasts.',
    },
    {
      id: 'reef-queen',
      name: 'Tideglass Raid',
      enemyHero: { name: 'Reef Queen', health: 14 },
      enemyDeck: [
        { id: 'reef-raider', name: 'Reef Raider', cost: 1, attack: 1, health: 1 },
        { id: 'foam-archer', name: 'Foam Archer', cost: 2, attack: 3, health: 1 },
        { id: 'tidal-guardian', name: 'Tidal Guardian', cost: 3, attack: 2, health: 4 },
      ],
      enemyStyle: { primary: '#4f88c7', secondary: '#173a67' },
      hint: 'Reef Queen races damage at your hero when lanes are open.',
    },
  ];

  function cloneCard(card) {
    return {
      id: card.id,
      name: card.name,
      cost: card.cost,
      attack: card.attack,
      health: card.health,
      currentHealth: card.health,
      exhausted: true,
    };
  }

  function createEncounterSet() {
    return ENCOUNTERS.map((encounter) => ({
      id: encounter.id,
      name: encounter.name,
      enemyHero: { ...encounter.enemyHero },
      enemyDeck: encounter.enemyDeck.map((card) => ({ ...card })),
      enemyStyle: { ...encounter.enemyStyle },
      hint: encounter.hint,
    }));
  }

  function drawCard(deck, rng) {
    if (!deck.length) {
      return null;
    }

    const index = Math.floor(rng() * deck.length);
    const [card] = deck.splice(index, 1);
    return { ...card };
  }

  function createInitialState(encounter, seed) {
    const rng = createRng(seed || 1);
    const playerDeck = PLAYER_DECK.flatMap((card) => [{ ...card }, { ...card }]);
    const enemyDeck = encounter.enemyDeck.flatMap((card) => [{ ...card }, { ...card }]);
    const state = {
      seed: seed || 1,
      turn: 1,
      currentSide: 'player',
      encounter: {
        id: encounter.id,
        name: encounter.name,
        hint: encounter.hint,
        enemyStyle: { ...encounter.enemyStyle },
      },
      player: createSide('Captain Nova', 18, playerDeck, rng),
      enemy: createSide(encounter.enemyHero.name, encounter.enemyHero.health, enemyDeck, rng),
      log: ['Battle start. Play a card, attack, then end your turn.'],
      winner: null,
    };

    state.player.maxMana = 1;
    state.player.mana = 1;
    state.enemy.maxMana = 1;
    state.enemy.mana = 1;
    state.player.hand.push(drawCard(state.player.deck, rng));
    state.player.hand.push(drawCard(state.player.deck, rng));
    state.enemy.hand.push(drawCard(state.enemy.deck, rng));
    state.enemy.hand.push(drawCard(state.enemy.deck, rng));
    compactHands(state);
    return state;
  }

  function createSide(name, health, deck, rng) {
    return {
      name,
      health,
      maxMana: 0,
      mana: 0,
      board: [],
      hand: [],
      deck,
      rngState: Math.floor(rng() * 1000000),
    };
  }

  function compactHands(state) {
    state.player.hand = state.player.hand.filter(Boolean);
    state.enemy.hand = state.enemy.hand.filter(Boolean);
  }

  function createRng(seed) {
    let value = seed % 2147483647;
    if (value <= 0) {
      value += 2147483646;
    }

    return function next() {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function getEnemyTurnPlan(state) {
    const plan = [];
    const playable = state.enemy.hand
      .filter((card) => card.cost <= state.enemy.mana)
      .sort((left, right) => right.cost - left.cost || right.attack - left.attack);

    if (playable[0] && state.enemy.board.length < 4) {
      plan.push({ type: 'play-card', card: playable[0] });
    }

    const readyAttacker = state.enemy.board.find((card) => !card.exhausted && card.currentHealth > 0);
    const defender = state.player.board.find((card) => card.currentHealth > 0);
    if (readyAttacker) {
      if (defender) {
        plan.push({ type: 'attack-minion', attackerId: readyAttacker.id, targetId: defender.id });
      } else {
        plan.push({ type: 'attack-hero', attackerId: readyAttacker.id });
      }
    }

    plan.push({ type: 'end-turn' });
    return plan;
  }

  function applyEnemyTurn(state) {
    const nextState = cloneState(state);
    const events = [];
    const plan = getEnemyTurnPlan(nextState);

    for (const step of plan) {
      if (step.type === 'play-card') {
        const handIndex = nextState.enemy.hand.findIndex((card) => card.id === step.card.id);
        if (handIndex >= 0 && nextState.enemy.board.length < 4) {
          const [card] = nextState.enemy.hand.splice(handIndex, 1);
          nextState.enemy.mana -= card.cost;
          nextState.enemy.board.push(cloneCard(card));
          events.push({ type: 'enemy-play-card', cardName: card.name });
          nextState.log.unshift(nextState.enemy.name + ' plays ' + card.name + '.');
        }
      }

      if (step.type === 'attack-minion') {
        const attacker = nextState.enemy.board.find((card) => card.id === step.attackerId);
        const target = nextState.player.board.find((card) => card.id === step.targetId);
        if (attacker && target && !attacker.exhausted) {
          target.currentHealth -= attacker.attack;
          attacker.currentHealth -= target.attack;
          attacker.exhausted = true;
          events.push({ type: 'enemy-attack-minion', attackerId: attacker.id, targetId: target.id });
          nextState.log.unshift(attacker.name + ' trades into ' + target.name + '.');
          cleanupBoard(nextState.player.board);
          cleanupBoard(nextState.enemy.board);
        }
      }

      if (step.type === 'attack-hero') {
        const attacker = nextState.enemy.board.find((card) => card.id === step.attackerId);
        if (attacker && !attacker.exhausted) {
          nextState.player.health -= attacker.attack;
          attacker.exhausted = true;
          events.push({ type: 'enemy-attack-hero', attackerId: attacker.id, damage: attacker.attack });
          nextState.log.unshift(attacker.name + ' hits your hero for ' + attacker.attack + '.');
        }
      }
    }

    endEnemyTurn(nextState, events);
    return { state: nextState, events, plan };
  }

  function cleanupBoard(board) {
    for (let index = board.length - 1; index >= 0; index -= 1) {
      if (board[index].currentHealth <= 0) {
        board.splice(index, 1);
      }
    }
  }

  function endEnemyTurn(state, events) {
    if (state.player.health <= 0) {
      state.winner = 'enemy';
      state.currentSide = 'game-over';
      events.push({ type: 'enemy-win' });
      return;
    }

    state.turn += 1;
    state.currentSide = 'player';
    state.player.maxMana = Math.min(6, state.turn);
    state.player.mana = state.player.maxMana;
    state.player.board.forEach((card) => {
      card.exhausted = false;
    });
    const rng = createRng(state.seed + state.turn * 17);
    const draw = drawCard(state.player.deck, rng);
    if (draw) {
      state.player.hand.push(draw);
      state.log.unshift('You draw ' + draw.name + '.');
      events.push({ type: 'player-draw', cardName: draw.name });
    }
    compactHands(state);
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function playPlayerCard(state, handIndex) {
    const nextState = cloneState(state);
    const card = nextState.player.hand[handIndex];
    if (!card || card.cost > nextState.player.mana || nextState.player.board.length >= 4) {
      return nextState;
    }

    nextState.player.mana -= card.cost;
    nextState.player.board.push(cloneCard(card));
    nextState.player.hand.splice(handIndex, 1);
    nextState.log.unshift('You summon ' + card.name + '.');
    return nextState;
  }

  function playerAttackHero(state, boardIndex) {
    const nextState = cloneState(state);
    const card = nextState.player.board[boardIndex];
    if (!card || card.exhausted) {
      return nextState;
    }

    nextState.enemy.health -= card.attack;
    card.exhausted = true;
    nextState.log.unshift(card.name + ' strikes ' + nextState.enemy.name + ' for ' + card.attack + '.');
    if (nextState.enemy.health <= 0) {
      nextState.winner = 'player';
      nextState.currentSide = 'game-over';
    }
    return nextState;
  }

  function startEnemyTurn(state) {
    const nextState = cloneState(state);
    nextState.currentSide = 'enemy';
    nextState.enemy.maxMana = Math.min(6, nextState.turn);
    nextState.enemy.mana = nextState.enemy.maxMana;
    nextState.enemy.board.forEach((card) => {
      card.exhausted = false;
    });
    return nextState;
  }

  return {
    createEncounterSet,
    createInitialState,
    getEnemyTurnPlan,
    applyEnemyTurn,
    playPlayerCard,
    playerAttackHero,
    startEnemyTurn,
  };
});
