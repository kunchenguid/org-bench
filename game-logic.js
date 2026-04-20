(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.AppleDuelLogic = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_SLOT = 'apple-duel-save';
  const MAX_MANA = 8;
  const BOARD_LIMIT = 5;

  const CARD_LIBRARY = {
    emberling: { id: 'emberling', name: 'Emberling Scout', faction: 'sol', type: 'unit', cost: 1, attack: 1, health: 2, keywords: [] },
    shieldmate: { id: 'shieldmate', name: 'Sunshield Mate', faction: 'sol', type: 'unit', cost: 2, attack: 1, health: 4, keywords: ['guard'] },
    charger: { id: 'charger', name: 'Radiant Charger', faction: 'sol', type: 'unit', cost: 3, attack: 3, health: 2, keywords: ['swift'] },
    archivist: { id: 'archivist', name: 'Dawn Archivist', faction: 'sol', type: 'unit', cost: 2, attack: 2, health: 3, keywords: ['draw'] },
    flare: { id: 'flare', name: 'Solar Flare', faction: 'sol', type: 'spell', cost: 2, effect: { kind: 'damage', amount: 2, target: 'any' } },
    anthem: { id: 'anthem', name: 'Banner of Noon', faction: 'sol', type: 'spell', cost: 3, effect: { kind: 'buff-board', attack: 1, health: 1 } },
    shade: { id: 'shade', name: 'Shade Prowler', faction: 'umbra', type: 'unit', cost: 1, attack: 2, health: 1, keywords: [] },
    bulwark: { id: 'bulwark', name: 'Grave Bulwark', faction: 'umbra', type: 'unit', cost: 2, attack: 1, health: 5, keywords: ['guard'] },
    harrier: { id: 'harrier', name: 'Night Harrier', faction: 'umbra', type: 'unit', cost: 3, attack: 3, health: 2, keywords: ['swift'] },
    siphon: { id: 'siphon', name: 'Soul Siphon', faction: 'umbra', type: 'spell', cost: 2, effect: { kind: 'drain', amount: 2 } },
    hex: { id: 'hex', name: 'Moon Hex', faction: 'umbra', type: 'spell', cost: 3, effect: { kind: 'damage', amount: 3, target: 'unit' } },
    seer: { id: 'seer', name: 'Ashen Seer', faction: 'umbra', type: 'unit', cost: 2, attack: 2, health: 2, keywords: ['draw'] },
  };

  function createRng(seed) {
    let value = seed % 2147483647;
    if (value <= 0) {
      value += 2147483646;
    }
    return function () {
      value = value * 16807 % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createDeck(cardIds, rng, prefix) {
    const deck = cardIds.map(function (cardId, index) {
      const card = clone(CARD_LIBRARY[cardId]);
      card.instanceId = prefix + '-' + index + '-' + Math.floor(rng() * 100000);
      return card;
    });
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      const swap = deck[index];
      deck[index] = deck[swapIndex];
      deck[swapIndex] = swap;
    }
    return deck;
  }

  function solDeck(rng) {
    return createDeck([
      'emberling', 'emberling', 'shieldmate', 'archivist', 'flare',
      'charger', 'shieldmate', 'anthem', 'archivist', 'flare',
      'charger', 'emberling', 'shieldmate', 'anthem', 'flare',
      'charger', 'archivist', 'emberling', 'shieldmate', 'anthem',
    ], rng, 'p');
  }

  function umbraDeck(rng) {
    return createDeck([
      'shade', 'shade', 'bulwark', 'seer', 'siphon',
      'harrier', 'bulwark', 'hex', 'seer', 'siphon',
      'harrier', 'shade', 'bulwark', 'hex', 'siphon',
      'harrier', 'seer', 'shade', 'bulwark', 'hex',
    ], rng, 'e');
  }

  function emptySide(name, deck) {
    return {
      id: name,
      heroHealth: 20,
      mana: 0,
      maxMana: 0,
      deck: deck,
      hand: [],
      board: [],
      fatigue: 0,
    };
  }

  function drawCard(side, log, reason) {
    if (side.deck.length === 0) {
      side.fatigue += 1;
      side.heroHealth -= side.fatigue;
      log.push({ type: 'fatigue', side: side.id, amount: side.fatigue, reason: reason });
      return;
    }

    side.hand.push(side.deck.shift());
    log.push({ type: 'draw', side: side.id, reason: reason });
  }

  function setupOpeningHand(side, size, log) {
    while (side.hand.length < size) {
      drawCard(side, log, 'opening');
    }
  }

  function ensureOpeningPlayable(side) {
    const hasPlayable = side.hand.some(function (card) {
      return card.cost <= 1;
    });
    if (hasPlayable) {
      return;
    }

    const deckIndex = side.deck.findIndex(function (card) {
      return card.cost <= 1;
    });
    if (deckIndex === -1) {
      return;
    }

    side.hand[0] = side.deck.splice(deckIndex, 1, side.hand[0])[0];
  }

  function readyBoard(side) {
    side.board.forEach(function (unit) {
      unit.canAttack = true;
    });
  }

  function summonUnit(side, card) {
    const unit = clone(card);
    unit.damage = 0;
    unit.canAttack = card.keywords.indexOf('swift') !== -1;
    side.board.push(unit);
  }

  function removeCardFromHand(side, instanceId) {
    const index = side.hand.findIndex(function (card) {
      return card.instanceId === instanceId;
    });
    if (index === -1) {
      return null;
    }
    return side.hand.splice(index, 1)[0];
  }

  function getOpposingSide(state, sideName) {
    return sideName === 'player' ? state.enemy : state.player;
  }

  function cleanupBoard(side, log) {
    side.board = side.board.filter(function (unit) {
      const alive = unit.health - unit.damage > 0;
      if (!alive) {
        log.push({ type: 'unit-died', side: side.id, cardId: unit.id, instanceId: unit.instanceId });
      }
      return alive;
    });
  }

  function applySpell(state, actingSide, opposingSide, card) {
    const effect = card.effect;
    if (effect.kind === 'damage') {
      if (effect.target === 'unit' && opposingSide.board.length) {
        opposingSide.board[0].damage += effect.amount;
      } else if (effect.target === 'any' && opposingSide.board.length) {
        opposingSide.board[0].damage += effect.amount;
      } else {
        opposingSide.heroHealth -= effect.amount;
      }
    }
    if (effect.kind === 'drain') {
      opposingSide.heroHealth -= effect.amount;
      actingSide.heroHealth = Math.min(20, actingSide.heroHealth + effect.amount);
    }
    if (effect.kind === 'buff-board') {
      actingSide.board.forEach(function (unit) {
        unit.attack += effect.attack;
        unit.health += effect.health;
      });
    }
    cleanupBoard(opposingSide, state.log);
  }

  function playCard(state, sideName, instanceId) {
    const sourceSide = state[sideName];
    const sourceCard = sourceSide.hand.find(function (entry) {
      return entry.instanceId === instanceId;
    });
    if (!sourceCard) {
      return state;
    }
    if (state.currentPlayer !== sideName || sourceCard.cost > sourceSide.mana) {
      return state;
    }
    if (sourceCard.type === 'unit' && sourceSide.board.length >= BOARD_LIMIT) {
      return state;
    }

    const next = clone(state);
    const side = next[sideName];
    const opposingSide = getOpposingSide(next, sideName);
    const card = removeCardFromHand(side, instanceId);

    side.mana -= card.cost;
    next.log.push({ type: 'play-card', side: sideName, cardId: card.id, instanceId: card.instanceId });

    if (card.type === 'unit') {
      summonUnit(side, card);
      if (card.keywords.indexOf('draw') !== -1) {
        drawCard(side, next.log, 'on-summon');
      }
    } else {
      applySpell(next, side, opposingSide, card);
    }

    next.winner = getWinner(next);
    return next;
  }

  function getGuardUnits(side) {
    return side.board.filter(function (unit) {
      return unit.keywords.indexOf('guard') !== -1 && unit.health - unit.damage > 0;
    });
  }

  function attackWithUnit(state, sideName, attackerId, targetId) {
    const next = clone(state);
    const side = next[sideName];
    const opposingSide = getOpposingSide(next, sideName);
    const attacker = side.board.find(function (unit) { return unit.instanceId === attackerId; });
    if (!attacker || !attacker.canAttack) {
      return next;
    }

    const guardUnits = getGuardUnits(opposingSide);
    let target = null;
    let targetIsHero = false;
    if (!targetId || targetId === 'hero') {
      targetIsHero = true;
    } else {
      target = opposingSide.board.find(function (unit) { return unit.instanceId === targetId; }) || null;
    }

    if (guardUnits.length && (!target || guardUnits.every(function (unit) { return unit.instanceId !== target.instanceId; }))) {
      target = guardUnits[0];
      targetIsHero = false;
    }

    attacker.canAttack = false;
    if (targetIsHero) {
      opposingSide.heroHealth -= attacker.attack;
      next.log.push({ type: 'attack-hero', side: sideName, attackerId: attacker.instanceId, amount: attacker.attack });
    } else if (target) {
      target.damage += attacker.attack;
      attacker.damage += target.attack;
      next.log.push({ type: 'attack-unit', side: sideName, attackerId: attacker.instanceId, targetId: target.instanceId });
    }

    cleanupBoard(side, next.log);
    cleanupBoard(opposingSide, next.log);
    next.winner = getWinner(next);
    return next;
  }

  function beginTurn(state, sideName) {
    const side = state[sideName];
    side.maxMana = Math.min(MAX_MANA, side.maxMana + 1);
    side.mana = side.maxMana;
    readyBoard(side);
    drawCard(side, state.log, 'turn-start');
    state.currentPlayer = sideName;
    state.turnOwner = sideName;
  }

  function endPlayerTurn(state) {
    const next = clone(state);
    next.currentPlayer = 'enemy';
    next.log.push({ type: 'end-turn', side: 'player' });
    return runAiTurn(next);
  }

  function choosePlayableCard(side) {
    return side.hand
      .filter(function (card) { return card.cost <= side.mana; })
      .sort(function (left, right) {
        if (right.cost !== left.cost) {
          return right.cost - left.cost;
        }
        return (right.attack || 0) - (left.attack || 0);
      })[0] || null;
  }

  function runAiTurn(state) {
    const next = clone(state);
    if (next.winner) {
      return next;
    }

    beginTurn(next, 'enemy');
    let card = choosePlayableCard(next.enemy);
    while (card) {
      next.currentPlayer = 'enemy';
      const beforeHand = next.enemy.hand.length;
      const progressed = playCard(next, 'enemy', card.instanceId);
      if (progressed.enemy.hand.length === beforeHand) {
        break;
      }
      next.player = progressed.player;
      next.enemy = progressed.enemy;
      next.log = progressed.log;
      next.winner = progressed.winner;
      if (next.winner) {
        return next;
      }
      card = choosePlayableCard(next.enemy);
    }

    next.enemy.board.slice().forEach(function (unit) {
      if (!unit.canAttack || next.winner) {
        return;
      }
      const guard = getGuardUnits(next.player)[0];
      const targetId = guard ? guard.instanceId : 'hero';
      const progressed = attackWithUnit(next, 'enemy', unit.instanceId, targetId);
      next.player = progressed.player;
      next.enemy = progressed.enemy;
      next.log = progressed.log;
      next.winner = progressed.winner;
    });

    if (!next.winner) {
      next.turn += 1;
      beginTurn(next, 'player');
      next.log.push({ type: 'ai-turn-complete' });
    }
    return next;
  }

  function getWinner(state) {
    if (state.player.heroHealth <= 0 && state.enemy.heroHealth <= 0) {
      return 'draw';
    }
    if (state.enemy.heroHealth <= 0) {
      return 'player';
    }
    if (state.player.heroHealth <= 0) {
      return 'enemy';
    }
    return null;
  }

  function createInitialState(seed) {
    const rng = createRng(seed || Math.floor(Date.now() % 100000));
    const player = emptySide('player', solDeck(rng));
    const enemy = emptySide('enemy', umbraDeck(rng));
    const state = {
      seed: seed || 1,
      turn: 1,
      currentPlayer: 'player',
      turnOwner: 'player',
      player: player,
      enemy: enemy,
      winner: null,
      log: [],
      tutorialStep: 0,
    };

    state.log.push({ type: 'tutorial', step: 0, text: 'Play a glowing card from your hand, then end your turn.' });
    setupOpeningHand(player, 4, state.log);
    setupOpeningHand(enemy, 4, state.log);
    ensureOpeningPlayable(player);
    player.maxMana = 1;
    player.mana = 1;
    enemy.maxMana = 0;
    enemy.mana = 0;
    return state;
  }

  function createStorageKey(namespace) {
    return String(namespace || 'apple:') + STORAGE_SLOT;
  }

  function serializeState(state) {
    return JSON.stringify(state);
  }

  function deserializeState(serialized) {
    return JSON.parse(serialized);
  }

  return {
    BOARD_LIMIT: BOARD_LIMIT,
    CARD_LIBRARY: CARD_LIBRARY,
    STORAGE_SLOT: STORAGE_SLOT,
    attackWithUnit: attackWithUnit,
    createInitialState: createInitialState,
    createStorageKey: createStorageKey,
    deserializeState: deserializeState,
    endPlayerTurn: endPlayerTurn,
    getWinner: getWinner,
    playCard: playCard,
    runAiTurn: runAiTurn,
    serializeState: serializeState,
  };
});
