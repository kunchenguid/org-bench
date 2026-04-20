(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AppleDuelGameCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SAVE_KEY = 'duel-tcg-save';
  const MAX_MANA = 7;
  const MAX_BOARD = 5;
  const STARTING_HEALTH = 20;
  const STARTING_HAND = 3;

  const CARD_LIBRARY = {
    sparkimp: makeCard('sparkimp', 'Spark Imp', 'sol', 1, 2, 1, 'A fast opener that teaches the board.', 'assets/cards/sparkimp.svg', []),
    sunlance: makeCard('sunlance', 'Sunlance Sentry', 'sol', 2, 2, 3, 'Durable frontline fighter.', 'assets/cards/sunlance.svg', ['guard']),
    dawnchorus: makeCard('dawnchorus', 'Dawn Chorus', 'sol', 2, 1, 3, 'Rally - the next ally this turn enters with +1 attack.', 'assets/cards/dawnchorus.svg', ['rally']),
    auriclion: makeCard('auriclion', 'Auric Lion', 'sol', 3, 3, 2, 'Charge - can attack on the turn it is played.', 'assets/cards/auriclion.svg', ['charge']),
    emberdrake: makeCard('emberdrake', 'Ember Drake', 'sol', 4, 4, 3, 'A blunt finisher for pushing damage.', 'assets/cards/emberdrake.svg', []),
    solarbastion: makeCard('solarbastion', 'Solar Bastion', 'sol', 4, 3, 5, 'Guard - locks combat into the frontline.', 'assets/cards/solarbastion.svg', ['guard']),
    mistfox: makeCard('mistfox', 'Mistfox', 'luna', 1, 1, 1, 'Quick skirmisher that rewards trading first.', 'assets/cards/mistfox.svg', []),
    moonwarden: makeCard('moonwarden', 'Moonwarden', 'luna', 2, 2, 2, 'Balanced defender with clear stats.', 'assets/cards/moonwarden.svg', []),
    frostscribe: makeCard('frostscribe', 'Frost Scribe', 'luna', 2, 2, 2, 'Chill - weakens the strongest opposing unit by 1 attack.', 'assets/cards/frostscribe.svg', ['chill']),
    eclipseshell: makeCard('eclipseshell', 'Eclipse Shell', 'luna', 3, 2, 4, 'Guard - buys time for the archive.', 'assets/cards/eclipseshell.svg', ['guard']),
    tideoracle: makeCard('tideoracle', 'Tide Oracle', 'luna', 3, 3, 3, 'Drain - hitting a hero restores 1 health.', 'assets/cards/tideoracle.svg', ['drain']),
    nightbloom: makeCard('nightbloom', 'Night Bloom Hydra', 'luna', 4, 4, 4, 'A premium threat for late turns.', 'assets/cards/nightbloom.svg', []),
  };

  const PLAYER_DECK = [
    'sparkimp', 'sparkimp', 'sunlance', 'sunlance', 'dawnchorus',
    'dawnchorus', 'auriclion', 'auriclion', 'emberdrake', 'emberdrake',
    'solarbastion', 'solarbastion', 'sparkimp', 'sunlance', 'dawnchorus',
    'auriclion', 'emberdrake', 'solarbastion', 'sparkimp', 'emberdrake',
  ];

  const ENEMY_DECK = [
    'mistfox', 'mistfox', 'moonwarden', 'moonwarden', 'frostscribe',
    'frostscribe', 'eclipseshell', 'eclipseshell', 'tideoracle', 'tideoracle',
    'nightbloom', 'nightbloom', 'mistfox', 'moonwarden', 'frostscribe',
    'eclipseshell', 'tideoracle', 'nightbloom', 'mistfox', 'moonwarden',
  ];

  function makeCard(cardId, name, faction, cost, attack, health, text, art, keywords) {
    return { cardId: cardId, name: name, faction: faction, cost: cost, attack: attack, health: health, maxHealth: health, text: text, art: art, keywords: keywords.slice() };
  }

  function createRng(rng) {
    if (typeof rng === 'function') {
      return rng;
    }

    let seed = 1234567;
    return function () {
      seed = (seed * 48271) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function shuffle(list, rng) {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      const temp = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = temp;
    }
    return copy;
  }

  function instantiate(cardId, owner, serial) {
    const base = CARD_LIBRARY[cardId];
    return {
      uid: owner + '-' + cardId + '-' + serial,
      owner: owner,
      cardId: base.cardId,
      name: base.name,
      faction: base.faction,
      cost: base.cost,
      attack: base.attack,
      health: base.health,
      maxHealth: base.maxHealth,
      text: base.text,
      art: base.art,
      ready: false,
      summoningSickness: true,
      keywords: base.keywords.slice(),
    };
  }

  function createSide(id, deckList, rng) {
    return {
      id: id,
      hero: { health: STARTING_HEALTH, maxHealth: STARTING_HEALTH },
      maxMana: 1,
      mana: 1,
      deck: shuffle(deckList, rng),
      hand: [],
      board: [],
      serial: 0,
      nextSummonBonusAttack: 0,
    };
  }

  function drawCard(side) {
    if (!side.deck.length || side.hand.length >= 7) {
      return null;
    }

    side.serial += 1;
    const cardId = side.deck.shift();
    const card = instantiate(cardId, side.id, side.serial);
    side.hand.push(card);
    return card;
  }

  function ensurePlayableOpening(state) {
    if (state.player.hand.some(function (card) { return card.cost <= state.player.mana; })) {
      return;
    }

    const deckIndex = state.player.deck.findIndex(function (cardId) {
      return CARD_LIBRARY[cardId].cost <= state.player.mana;
    });
    if (deckIndex === -1) {
      return;
    }

    state.player.serial += 1;
    state.player.hand[0] = instantiate(state.player.deck.splice(deckIndex, 1)[0], 'player', state.player.serial);
  }

  function createInitialState(options) {
    const rng = createRng(options && options.rng);
    const state = {
      turn: 1,
      activeSide: 'player',
      pendingAi: false,
      winner: null,
      tutorial: {
        step: 'play-a-card',
        message: 'Play a glowing card from your hand. Frontline units with Guard protect the hero.',
      },
      message: 'Your turn - play a unit or inspect the glowing hand.',
      player: createSide('player', PLAYER_DECK, rng),
      enemy: createSide('enemy', ENEMY_DECK, rng),
      combatLog: [],
    };

    for (let count = 0; count < STARTING_HAND; count += 1) {
      drawCard(state.player);
      drawCard(state.enemy);
    }
    ensurePlayableOpening(state);
    return state;
  }

  function createStorageAdapter(storage, namespace) {
    const prefix = String(namespace || 'local') + ':' + SAVE_KEY;
    return {
      key: prefix,
      save: function (payload) {
        storage.setItem(prefix, JSON.stringify(payload));
      },
      load: function () {
        try {
          const raw = storage.getItem(prefix);
          return raw ? JSON.parse(raw) : null;
        } catch (error) {
          return null;
        }
      },
      clear: function () {
        storage.removeItem(prefix);
      },
    };
  }

  function playCard(state, handIndex) {
    if (state.activeSide !== 'player' || state.winner) {
      return false;
    }

    const card = state.player.hand[handIndex];
    if (!card || card.cost > state.player.mana || state.player.board.length >= MAX_BOARD) {
      return false;
    }

    state.player.hand.splice(handIndex, 1);
    state.player.mana -= card.cost;
    if (state.player.mana === 0) {
      card.attack += 1;
    }
    card.attack += state.player.nextSummonBonusAttack;
    state.player.nextSummonBonusAttack = 0;
    card.ready = hasKeyword(card, 'charge');
    card.summoningSickness = !card.ready;
    state.player.board.push(card);
    applyOnPlay(state, card, 'player', 'enemy');
    state.tutorial.step = 'end-turn';
    state.tutorial.message = 'Good. End your turn to let the enemy answer.';
    state.message = 'Unit deployed. End your turn when you are ready.';
    return true;
  }

  function endPlayerTurn(state) {
    if (state.activeSide !== 'player' || state.winner) {
      return false;
    }

    state.activeSide = 'enemy';
    state.pendingAi = true;
    readySide(state.enemy);
    refillManaAndDraw(state.enemy, state.turn + 1);
    state.message = 'Enemy turn. Their frontline will intercept attacks first.';
    return true;
  }

  function performEnemyTurn(state) {
    if (state.activeSide !== 'enemy' || !state.pendingAi || state.winner) {
      return false;
    }

    let changed = false;
    changed = enemyPlayBestAffordableUnit(state) || changed;
    changed = enemyAttackWithReadyUnits(state) || changed;

    state.pendingAi = false;
    state.activeSide = 'player';
    state.turn += 1;
    readySide(state.player);
    refillManaAndDraw(state.player, state.turn);
    state.tutorial.step = state.player.board.some(function (unit) { return unit.ready; }) ? 'make-an-attack' : 'play-a-card';
    state.tutorial.message = state.player.board.some(function (unit) { return unit.ready; }) ? 'Your ready units can attack. Guard units must be cleared first.' : 'Play another card to build a board.';
    state.message = state.winner ? (state.winner === 'player' ? 'Victory.' : 'Defeat.') : 'Your turn. Ready units can attack now.';
    return changed;
  }

  function enemyPlayBestAffordableUnit(state) {
    const playableIndex = state.enemy.hand
      .map(function (card, index) { return { card: card, index: index }; })
      .filter(function (entry) { return entry.card.cost <= state.enemy.mana; })
      .sort(function (left, right) {
        if (right.card.cost !== left.card.cost) {
          return right.card.cost - left.card.cost;
        }
        return right.card.attack - left.card.attack;
      })[0];

    if (!playableIndex || state.enemy.board.length >= MAX_BOARD) {
      return false;
    }

    const card = state.enemy.hand.splice(playableIndex.index, 1)[0];
    state.enemy.mana -= card.cost;
    if (state.enemy.mana === 0) {
      card.attack += 1;
    }
    card.attack += state.enemy.nextSummonBonusAttack;
    state.enemy.nextSummonBonusAttack = 0;
    card.ready = true;
    card.summoningSickness = false;
    state.enemy.board.push(card);
    applyOnPlay(state, card, 'enemy', 'player');
    return true;
  }

  function enemyAttackWithReadyUnits(state) {
    const attacker = state.enemy.board.slice().sort(function (left, right) {
      if (right.attack !== left.attack) {
        return right.attack - left.attack;
      }
      return right.health - left.health;
    }).find(function (unit) {
      return unit.ready;
    });

    if (!attacker || state.winner) {
      return false;
    }

    const target = getPriorityTarget(state.player);
    if (target) {
      dealCombat(state, attacker, target, 'enemy', 'player');
    } else {
      dealHeroDamage(state, attacker, state.player, state.enemy);
    }
    return true;
  }

  function getPriorityTarget(side) {
    const guards = side.board.filter(function (unit) {
      return hasKeyword(unit, 'guard');
    });
    const candidates = guards.length ? guards : side.board;
    return candidates.slice().sort(function (left, right) {
      if (left.health !== right.health) {
        return left.health - right.health;
      }
      return left.attack - right.attack;
    })[0] || null;
  }

  function dealCombat(state, attacker, defender, attackingSideId, defendingSideId) {
    attacker.ready = false;
    attacker.summoningSickness = false;
    defender.health -= attacker.attack;
    attacker.health -= defender.attack;
    cleanupDead(state[attackingSideId]);
    cleanupDead(state[defendingSideId]);
    state.combatLog.push(attacker.uid + ' attacked ' + defender.uid);
  }

  function dealHeroDamage(state, attacker, defendingSide, attackingSide) {
    attacker.ready = false;
    attacker.summoningSickness = false;
    defendingSide.hero.health -= attacker.attack;
    if (hasKeyword(attacker, 'drain')) {
      attackingSide.hero.health = Math.min(attackingSide.hero.maxHealth, attackingSide.hero.health + 1);
    }
    if (defendingSide.hero.health <= 0) {
      state.winner = attacker.owner;
    }
    state.combatLog.push(attacker.uid + ' hit hero');
  }

  function readySide(side) {
    side.board.forEach(function (unit) {
      unit.ready = true;
      unit.summoningSickness = false;
    });
  }

  function refillManaAndDraw(side, turn) {
    side.maxMana = Math.min(MAX_MANA, Math.max(side.maxMana, Math.min(MAX_MANA, turn)));
    side.mana = side.maxMana;
    drawCard(side);
  }

  function cleanupDead(side) {
    side.board = side.board.filter(function (unit) {
      return unit.health > 0;
    });
  }

  function applyOnPlay(state, card, ownerKey, opponentKey) {
    if (hasKeyword(card, 'rally')) {
      state[ownerKey].nextSummonBonusAttack = 1;
    }
    if (hasKeyword(card, 'chill')) {
      const strongest = state[opponentKey].board.slice().sort(function (left, right) {
        if (right.attack !== left.attack) {
          return right.attack - left.attack;
        }
        return right.health - left.health;
      })[0];
      if (strongest) {
        strongest.attack = Math.max(0, strongest.attack - 1);
      }
    }
  }

  function hasKeyword(card, keyword) {
    return Array.isArray(card.keywords) && card.keywords.indexOf(keyword) !== -1;
  }

  return {
    CARD_LIBRARY: CARD_LIBRARY,
    PLAYER_DECK: PLAYER_DECK,
    ENEMY_DECK: ENEMY_DECK,
    SAVE_KEY: SAVE_KEY,
    createInitialState: createInitialState,
    createStorageAdapter: createStorageAdapter,
    playCard: playCard,
    endPlayerTurn: endPlayerTurn,
    performEnemyTurn: performEnemyTurn,
  };
});
