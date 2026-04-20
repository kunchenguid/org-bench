(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.DuelLogic = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LANE_COUNT = 3;

  const FACTIONS = [
    {
      id: 'ember',
      name: 'Emberfall Vanguard',
      theme: 'Sunlit sky-knights who pressure early and finish with fire.',
    },
    {
      id: 'verdant',
      name: 'Verdant Hollow',
      theme: 'Mire spirits and rooted beasts that stabilize then overpower.',
    },
  ];

  const MECHANICS = [
    { id: 'rush', label: 'Rush', text: 'Fast pressure and direct damage.' },
    { id: 'guard', label: 'Guard', text: 'Sturdy blockers that anchor lanes.' },
    { id: 'burn', label: 'Burn', text: 'Spells or effects that chip heroes and units.' },
    { id: 'growth', label: 'Growth', text: 'Midgame units that outscale early drops.' },
    { id: 'tempo', label: 'Tempo', text: 'Efficient plays that keep initiative.' },
  ];

  const CARD_LIBRARY = [
    { key: 'ember-fox', name: 'Ember Fox', type: 'unit', faction: 'ember', cost: 1, attack: 2, health: 1, text: 'Fast early pressure.' },
    { key: 'flare-guard', name: 'Flare Guard', type: 'unit', faction: 'ember', cost: 2, attack: 2, health: 3, text: 'A sturdy frontline sentinel.' },
    { key: 'sunlance', name: 'Sunlance', type: 'spell', faction: 'ember', cost: 2, damage: 2, text: 'Deal 2 damage.' },
    { key: 'ash-drake', name: 'Ash Drake', type: 'unit', faction: 'ember', cost: 4, attack: 4, health: 3, text: 'A high-damage finisher.' },
    { key: 'mist-wisp', name: 'Mist Wisp', type: 'unit', faction: 'verdant', cost: 1, attack: 1, health: 2, text: 'Buys time and contests lanes.' },
    { key: 'grove-keeper', name: 'Grove Keeper', type: 'unit', faction: 'verdant', cost: 3, attack: 3, health: 4, text: 'Large body for the cost.' },
    { key: 'sap-burst', name: 'Sap Burst', type: 'spell', faction: 'verdant', cost: 2, damage: 2, text: 'Deal 2 damage.' },
    { key: 'thorn-beast', name: 'Thorn Beast', type: 'unit', faction: 'verdant', cost: 4, attack: 4, health: 4, text: 'Overwhelms slow starts.' },
  ];

  const ENCOUNTER_PROFILES = [
    {
      id: 'marsh-ambush',
      name: 'Marsh Ambush',
      playerDeckKeys: [
        'ember-fox', 'ember-fox', 'flare-guard', 'flare-guard', 'sunlance', 'sunlance', 'ash-drake', 'ash-drake',
        'mist-wisp', 'mist-wisp', 'grove-keeper', 'grove-keeper', 'sap-burst', 'sap-burst', 'thorn-beast', 'thorn-beast',
        'ember-fox', 'flare-guard', 'sunlance', 'ash-drake',
      ],
      enemyDeckKeys: [
        'mist-wisp', 'mist-wisp', 'grove-keeper', 'grove-keeper', 'sap-burst', 'sap-burst', 'thorn-beast', 'thorn-beast',
        'ember-fox', 'ember-fox', 'flare-guard', 'flare-guard', 'sunlance', 'sunlance', 'ash-drake', 'ash-drake',
        'mist-wisp', 'grove-keeper', 'sap-burst', 'thorn-beast',
      ],
      playerFaction: 'ember',
      enemyFaction: 'verdant',
      enemyStyle: 'midrange-growth',
    },
    {
      id: 'sunflare-raid',
      name: 'Sunflare Raid',
      playerDeckKeys: [
        'mist-wisp', 'mist-wisp', 'grove-keeper', 'grove-keeper', 'sap-burst', 'sap-burst', 'thorn-beast', 'thorn-beast',
        'ember-fox', 'ember-fox', 'flare-guard', 'flare-guard', 'sunlance', 'sunlance', 'ash-drake', 'ash-drake',
        'mist-wisp', 'grove-keeper', 'sap-burst', 'thorn-beast',
      ],
      enemyDeckKeys: [
        'ember-fox', 'ember-fox', 'ember-fox', 'flare-guard', 'flare-guard', 'sunlance', 'sunlance', 'ash-drake',
        'ash-drake', 'ember-fox', 'flare-guard', 'sunlance', 'mist-wisp', 'grove-keeper', 'sap-burst', 'thorn-beast',
        'ember-fox', 'flare-guard', 'sunlance', 'ash-drake',
      ],
      playerFaction: 'verdant',
      enemyFaction: 'ember',
      enemyStyle: 'rush-burn',
    },
    {
      id: 'rootwall-siege',
      name: 'Rootwall Siege',
      playerDeckKeys: [
        'ember-fox', 'ember-fox', 'flare-guard', 'flare-guard', 'sunlance', 'sunlance', 'ash-drake', 'ash-drake',
        'mist-wisp', 'mist-wisp', 'grove-keeper', 'grove-keeper', 'sap-burst', 'sap-burst', 'thorn-beast', 'thorn-beast',
        'ember-fox', 'flare-guard', 'sunlance', 'ash-drake',
      ],
      enemyDeckKeys: [
        'mist-wisp', 'mist-wisp', 'mist-wisp', 'grove-keeper', 'grove-keeper', 'thorn-beast', 'thorn-beast', 'sap-burst',
        'sap-burst', 'mist-wisp', 'grove-keeper', 'thorn-beast', 'flare-guard', 'sunlance', 'ash-drake', 'ember-fox',
        'mist-wisp', 'grove-keeper', 'sap-burst', 'thorn-beast',
      ],
      playerFaction: 'ember',
      enemyFaction: 'verdant',
      enemyStyle: 'wall-growth',
    },
  ];

  function hashSeed(seed) {
    let value = seed >>> 0;
    return function () {
      value = (value + 0x6d2b79f5) | 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cardFromKey(key, uniqueId) {
    const base = CARD_LIBRARY.find(function (card) {
      return card.key === key;
    });
    const card = {
      id: uniqueId,
      key: base.key,
      name: base.name,
      type: base.type,
      faction: base.faction,
      cost: base.cost,
      text: base.text,
    };
    if (base.type === 'unit') {
      card.attack = base.attack;
      card.health = base.health;
      card.maxHealth = base.health;
      card.exhausted = false;
    } else {
      card.damage = base.damage;
    }
    return card;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function shuffle(deck, seed) {
    const random = hashSeed(seed || 1);
    const next = deck.slice();
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const current = next[index];
      next[index] = next[swapIndex];
      next[swapIndex] = current;
    }
    return next;
  }

  function buildDeck(keys, seed, side) {
    return shuffle(keys, seed).map(function (key, index) {
      return cardFromKey(key, side + '-' + key + '-' + index);
    });
  }

  function getEncounterProfile(seed) {
    const numericSeed = Number(seed || 0);
    return ENCOUNTER_PROFILES[Math.abs(numericSeed) % ENCOUNTER_PROFILES.length];
  }

  function drawCard(side) {
    if (!side.deck.length || side.hand.length >= 7) {
      return null;
    }
    const drawn = side.deck.shift();
    side.hand.push(drawn);
    return drawn;
  }

  function createSide(name, deck) {
    return {
      name: name,
      hero: name === 'player' ? 'Captain Sol' : 'Oracle Nera',
      health: 20,
      maxMana: name === 'player' ? 1 : 0,
      mana: name === 'player' ? 1 : 0,
      deck: deck,
      hand: [],
      board: [null, null, null],
    };
  }

  function createInitialState(options) {
    const seed = options && options.seed ? options.seed : Date.now();
    const encounter = getEncounterProfile(seed);
    const player = createSide('player', buildDeck(encounter.playerDeckKeys, seed, 'player'));
    const enemy = createSide('enemy', buildDeck(encounter.enemyDeckKeys, seed + 1, 'enemy'));
    for (let count = 0; count < 3; count += 1) {
      drawCard(player);
      drawCard(enemy);
    }
    const ensuredCardIndex = player.hand.findIndex(function (card) {
      return card.cost === 1 && card.type === 'unit';
    });
    if (ensuredCardIndex > 0) {
      const first = player.hand[0];
      player.hand[0] = player.hand[ensuredCardIndex];
      player.hand[ensuredCardIndex] = first;
    } else if (ensuredCardIndex === -1) {
      player.hand[0] = cardFromKey('ember-fox', 'player-ember-fox-opening');
    }
    return {
      seed: seed,
      encounter: {
        id: encounter.id,
        name: encounter.name,
        playerFaction: encounter.playerFaction,
        enemyFaction: encounter.enemyFaction,
        enemyStyle: encounter.enemyStyle,
      },
      turn: 'player',
      winner: null,
      turnCount: 1,
      log: ['Your turn. Play a glowing card, then press End Turn. ' + encounter.name + ' changes the enemy deck.'],
      player: player,
      enemy: enemy,
    };
  }

  function createStorageKey(namespace, key) {
    return String(namespace || 'duel-canvas') + ':' + key;
  }

  function getOpenLane(side, preferredLane) {
    if (preferredLane !== undefined && preferredLane !== null && !side.board[preferredLane]) {
      return preferredLane;
    }
    for (let lane = 0; lane < side.board.length; lane += 1) {
      if (!side.board[lane]) {
        return lane;
      }
    }
    return -1;
  }

  function updateWinner(state) {
    if (state.player.health <= 0) {
      state.winner = 'enemy';
    }
    if (state.enemy.health <= 0) {
      state.winner = 'player';
    }
  }

  function playCard(state, sideName, handIndex, lane) {
    const next = clone(state);
    if (next.winner || next.turn !== sideName) {
      return next;
    }
    const side = next[sideName];
    const opponent = sideName === 'player' ? next.enemy : next.player;
    const card = side.hand[handIndex];
    if (!card || card.cost > side.mana) {
      return next;
    }
    if (card.type === 'unit') {
      const openLane = getOpenLane(side, lane);
      if (openLane === -1) {
        return next;
      }
      const unit = side.hand.splice(handIndex, 1)[0];
      unit.exhausted = true;
      side.board[openLane] = unit;
      side.mana -= unit.cost;
      next.log.push((sideName === 'player' ? 'You summon ' : 'Enemy summons ') + unit.name + '.');
      return next;
    }
    const spell = side.hand.splice(handIndex, 1)[0];
    side.mana -= spell.cost;
    let targetLane = -1;
    for (let index = 0; index < opponent.board.length; index += 1) {
      if (opponent.board[index]) {
        targetLane = index;
        break;
      }
    }
    if (targetLane !== -1) {
      opponent.board[targetLane].health -= spell.damage;
      if (opponent.board[targetLane].health <= 0) {
        next.log.push(spell.name + ' destroys ' + opponent.board[targetLane].name + '.');
        opponent.board[targetLane] = null;
      } else {
        next.log.push(spell.name + ' hits ' + opponent.board[targetLane].name + ' for ' + spell.damage + '.');
      }
    } else {
      opponent.health -= spell.damage;
      next.log.push(spell.name + ' hits the enemy hero for ' + spell.damage + '.');
      updateWinner(next);
    }
    return next;
  }

  function attackWithLane(state, sideName, lane) {
    const next = clone(state);
    const side = next[sideName];
    const opponent = sideName === 'player' ? next.enemy : next.player;
    const attacker = side.board[lane];
    if (!attacker || attacker.exhausted || next.winner) {
      return next;
    }
    const blocker = opponent.board[lane];
    if (blocker) {
      blocker.health -= attacker.attack;
      attacker.health -= blocker.attack;
      next.log.push(attacker.name + ' clashes with ' + blocker.name + '.');
      if (blocker.health <= 0) {
        opponent.board[lane] = null;
      }
      if (attacker.health <= 0) {
        side.board[lane] = null;
      } else {
        attacker.exhausted = true;
      }
    } else {
      opponent.health -= attacker.attack;
      attacker.exhausted = true;
      next.log.push(attacker.name + ' strikes the opposing hero for ' + attacker.attack + '.');
      updateWinner(next);
    }
    return next;
  }

  function refreshBoard(side) {
    for (let lane = 0; lane < side.board.length; lane += 1) {
      if (side.board[lane]) {
        side.board[lane].exhausted = false;
      }
    }
  }

  function chooseEnemyPlay(state) {
    const enemy = state.enemy;
    let best = null;
    for (let index = 0; index < enemy.hand.length; index += 1) {
      const card = enemy.hand[index];
      if (card.cost > enemy.mana) {
        continue;
      }
      if (card.type === 'unit' && getOpenLane(enemy, null) !== -1) {
        if (!best || card.cost > best.card.cost) {
          best = { index: index, lane: getOpenLane(enemy, null), card: card };
        }
      }
      if (card.type === 'spell' && (!best || (best.card.type === 'spell' && card.cost >= best.card.cost))) {
        best = { index: index, lane: null, card: card };
      }
    }
    return best;
  }

  function endTurn(state) {
    const next = clone(state);
    if (next.winner || next.turn !== 'player') {
      return next;
    }
    next.turn = 'enemy';
    next.log.push('Enemy turn. Watch their line of play.');
    next.enemy.maxMana = Math.min(8, next.enemy.maxMana + 1);
    next.enemy.mana = next.enemy.maxMana;
    refreshBoard(next.enemy);
    drawCard(next.enemy);

    let play = chooseEnemyPlay(next);
    while (play) {
      const updated = playCard(next, 'enemy', play.index, play.lane);
      next.player = updated.player;
      next.enemy = updated.enemy;
      next.log = updated.log;
      next.winner = updated.winner;
      if (next.winner) {
        break;
      }
      play = chooseEnemyPlay(next);
    }

    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const attacker = next.enemy.board[lane];
      if (attacker && !attacker.exhausted && !next.winner) {
        const attacked = attackWithLane(next, 'enemy', lane);
        next.player = attacked.player;
        next.enemy = attacked.enemy;
        next.log = attacked.log;
        next.winner = attacked.winner;
      }
    }

    if (!next.winner) {
      next.turn = 'player';
      next.turnCount += 1;
      next.player.maxMana = Math.min(8, next.player.maxMana + 1);
      next.player.mana = next.player.maxMana;
      refreshBoard(next.player);
      drawCard(next.player);
      next.log.push('Your turn. Glowing cards can be played right now.');
    }
    return next;
  }

  return {
    FACTIONS: FACTIONS,
    MECHANICS: MECHANICS,
    CARD_LIBRARY: CARD_LIBRARY,
    ENCOUNTER_PROFILES: ENCOUNTER_PROFILES,
    LANE_COUNT: LANE_COUNT,
    createInitialState: createInitialState,
    createStorageKey: createStorageKey,
    attackWithLane: attackWithLane,
    playCard: playCard,
    endTurn: endTurn,
  };
});
