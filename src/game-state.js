(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DuelGameState = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_SUFFIX = 'duel-state';

  const CARD_LIBRARY = Object.freeze({
    sunlanceSquire: {
      cardId: 'sunlance-squire',
      name: 'Sunlance Squire',
      cost: 1,
      attack: 2,
      health: 2,
      tribe: 'dawn',
    },
    bloomkinTender: {
      cardId: 'bloomkin-tender',
      name: 'Bloomkin Tender',
      cost: 2,
      attack: 1,
      health: 3,
      tribe: 'grove',
    },
    duskfangRaider: {
      cardId: 'duskfang-raider',
      name: 'Duskfang Raider',
      cost: 1,
      attack: 1,
      health: 1,
      tribe: 'dusk',
    },
    emberwakeFox: {
      cardId: 'emberwake-fox',
      name: 'Emberwake Fox',
      cost: 3,
      attack: 3,
      health: 2,
      tribe: 'dawn',
    },
    moonwellAdept: {
      cardId: 'moonwell-adept',
      name: 'Moonwell Adept',
      cost: 2,
      attack: 2,
      health: 2,
      tribe: 'dusk',
    },
  });

  const PLAYER_DECK_ORDER = [
    'sunlanceSquire', 'sunlanceSquire', 'sunlanceSquire', 'sunlanceSquire',
    'bloomkinTender', 'bloomkinTender', 'bloomkinTender', 'bloomkinTender',
    'emberwakeFox', 'emberwakeFox', 'emberwakeFox', 'emberwakeFox',
    'moonwellAdept', 'moonwellAdept', 'moonwellAdept', 'moonwellAdept',
    'sunlanceSquire', 'bloomkinTender', 'emberwakeFox', 'moonwellAdept',
  ];

  const ENEMY_DECK_ORDER = [
    'duskfangRaider', 'duskfangRaider', 'duskfangRaider', 'duskfangRaider',
    'moonwellAdept', 'moonwellAdept', 'moonwellAdept', 'moonwellAdept',
    'bloomkinTender', 'bloomkinTender', 'bloomkinTender', 'bloomkinTender',
    'emberwakeFox', 'emberwakeFox', 'emberwakeFox', 'emberwakeFox',
    'duskfangRaider', 'moonwellAdept', 'bloomkinTender', 'emberwakeFox',
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function resolveStorageNamespace(runtime) {
    if (typeof runtime === 'string' && runtime.trim()) {
      return runtime.trim();
    }

    if (!runtime || typeof runtime !== 'object') {
      return 'apple-duel';
    }

    const knownKeys = [
      '__APPLE_RUN_STORAGE_NAMESPACE__',
      '__BENCHMARK_RUN_STORAGE_NAMESPACE__',
      '__RUN_STORAGE_NAMESPACE__',
      'RUN_STORAGE_NAMESPACE',
    ];

    for (let index = 0; index < knownKeys.length; index += 1) {
      const value = runtime[knownKeys[index]];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const runtimeKeys = Object.keys(runtime);
    for (let index = 0; index < runtimeKeys.length; index += 1) {
      const key = runtimeKeys[index];
      if (!/namespace/i.test(key)) {
        continue;
      }

      const value = runtime[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return 'apple-duel';
  }

  function createStorageKey(runtime, suffix) {
    return `${resolveStorageNamespace(runtime)}:${suffix}`;
  }

  function createCardInstance(cardKey, side, drawIndex) {
    const template = CARD_LIBRARY[cardKey];
    return {
      ...clone(template),
      instanceId: `${side}-${cardKey}-${drawIndex}`,
      currentHealth: template.health,
      canAttack: false,
      asleep: true,
    };
  }

  function buildDeck(cardKeys, side) {
    return cardKeys.map(function (cardKey, index) {
      return createCardInstance(cardKey, side, index);
    });
  }

  function drawCard(sideState) {
    if (!sideState.deck.length) {
      return;
    }

    sideState.hand.push(sideState.deck.shift());
  }

  function readyBoard(board) {
    board.forEach(function (unit) {
      unit.asleep = false;
      unit.canAttack = true;
    });
  }

  function createInitialState(options) {
    const seed = options && options.seed ? options.seed : 1;
    const state = {
      seed: seed,
      turn: 'player',
      player: {
        health: 20,
        mana: 1,
        maxMana: 1,
        deck: buildDeck(PLAYER_DECK_ORDER, 'player'),
        hand: [],
        board: [],
      },
      enemy: {
        health: 20,
        mana: 0,
        maxMana: 1,
        deck: buildDeck(ENEMY_DECK_ORDER, 'enemy'),
        hand: [],
        board: [],
      },
    };

    for (let index = 0; index < 4; index += 1) {
      drawCard(state.player);
      drawCard(state.enemy);
    }

    return state;
  }

  function playCard(state, side, instanceId) {
    const next = clone(state);
    const owner = next[side];
    const handIndex = owner.hand.findIndex(function (card) {
      return card.instanceId === instanceId;
    });

    if (handIndex === -1) {
      return next;
    }

    const card = owner.hand.splice(handIndex, 1)[0];
    owner.mana -= card.cost;
    owner.board.push({
      ...card,
      canAttack: false,
      asleep: true,
      currentHealth: card.currentHealth || card.health,
    });

    return next;
  }

  function removeDefeated(board) {
    return board.filter(function (unit) {
      return unit.currentHealth > 0;
    });
  }

  function attackTarget(state, side, attackerId, targetType, targetId) {
    const next = clone(state);
    const defenderSide = side === 'player' ? 'enemy' : 'player';
    const attacker = next[side].board.find(function (unit) {
      return unit.instanceId === attackerId;
    });

    if (!attacker || targetType !== 'unit') {
      return next;
    }

    const defender = next[defenderSide].board.find(function (unit) {
      return unit.instanceId === targetId;
    });
    if (!defender) {
      return next;
    }

    defender.currentHealth -= attacker.attack;
    attacker.currentHealth -= defender.attack;
    attacker.canAttack = false;

    next[side].board = removeDefeated(next[side].board);
    next[defenderSide].board = removeDefeated(next[defenderSide].board);

    return next;
  }

  function endPlayerTurn(state) {
    const next = clone(state);

    next.turn = 'enemy';
    next.enemy.maxMana = Math.min(10, next.enemy.maxMana + 1);
    next.enemy.mana = next.enemy.maxMana;
    readyBoard(next.enemy.board);
    drawCard(next.enemy);

    return next;
  }

  function loadState(runtime, storage) {
    if (!storage) {
      return createInitialState();
    }

    const raw = storage.getItem(createStorageKey(runtime, STORAGE_SUFFIX));
    if (!raw) {
      return createInitialState();
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return createInitialState();
    }
  }

  function saveState(runtime, storage, state) {
    if (!storage) {
      return;
    }

    storage.setItem(createStorageKey(runtime, STORAGE_SUFFIX), JSON.stringify(state));
  }

  return {
    CARD_LIBRARY: CARD_LIBRARY,
    attackTarget: attackTarget,
    createInitialState: createInitialState,
    createStorageKey: createStorageKey,
    endPlayerTurn: endPlayerTurn,
    loadState: loadState,
    playCard: playCard,
    resolveStorageNamespace: resolveStorageNamespace,
    saveState: saveState,
  };
});
