(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DuelGameState = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_SUFFIX = 'duel-state';

  const PLAYER_DECK = [
    'Sunblade Squire',
    'Auric Familiar',
    'Banner Guard',
    'Dawn Charger',
    'Sunblade Squire',
    'Auric Familiar',
    'Banner Guard',
    'Dawn Charger',
  ];

  const ENEMY_DECK = [
    'Nightglass Hexer',
    'Shade Prowler',
    'Grave Lantern',
    'Dusk Marauder',
    'Nightglass Hexer',
    'Shade Prowler',
    'Grave Lantern',
    'Dusk Marauder',
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function drawOpeningHand(deck) {
    const pile = deck.slice();
    return {
      hand: pile.splice(0, 3),
      deck: pile,
    };
  }

  function createInitialState() {
    const playerOpening = drawOpeningHand(PLAYER_DECK);
    const enemyOpening = drawOpeningHand(ENEMY_DECK);

    return {
      turn: 1,
      currentPlayer: 'player',
      winner: null,
      log: [
        'The first duel begins. Play a follower, then end your turn.',
      ],
      player: {
        heroHealth: 24,
        mana: 1,
        maxMana: 1,
        hand: playerOpening.hand,
        deck: playerOpening.deck,
        board: [],
      },
      enemy: {
        heroHealth: 24,
        mana: 1,
        maxMana: 1,
        hand: enemyOpening.hand,
        deck: enemyOpening.deck,
        board: [],
      },
    };
  }

  function resolveStorageNamespace(runtime) {
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

    storage.setItem(
      createStorageKey(runtime, STORAGE_SUFFIX),
      JSON.stringify(state)
    );
  }

  function appendLog(state, message) {
    const next = clone(state);
    next.log = next.log.concat(message).slice(-6);
    return next;
  }

  function endPlayerTurn(state) {
    let next = clone(state);
    next.currentPlayer = 'enemy';
    next = appendLog(next, 'You pass the initiative to the Night Court.');
    return next;
  }

  function runEnemyTurn(state) {
    let next = clone(state);
    next.turn += 1;
    next.currentPlayer = 'player';
    next.player.heroHealth = Math.max(0, next.player.heroHealth - 1);
    next.player.maxMana = Math.min(10, next.turn);
    next.player.mana = next.player.maxMana;
    next.enemy.maxMana = Math.min(10, next.turn);
    next.enemy.mana = next.enemy.maxMana;
    next = appendLog(next, 'Nightglass pressure hits you for 1 damage.');
    if (next.player.heroHealth === 0) {
      next.winner = 'enemy';
      next = appendLog(next, 'Defeat. The eclipse swallows the arena.');
    }
    return next;
  }

  return {
    createInitialState: createInitialState,
    createStorageKey: createStorageKey,
    endPlayerTurn: endPlayerTurn,
    loadState: loadState,
    resolveStorageNamespace: resolveStorageNamespace,
    runEnemyTurn: runEnemyTurn,
    saveState: saveState,
  };
});
