(function (global) {
  function createStorageKey(namespace, key) {
    return namespace + ':' + key;
  }

  function readStorageNamespace() {
    if (typeof globalThis.__FB_RUN_STORAGE_PREFIX__ === 'string') {
      return globalThis.__FB_RUN_STORAGE_PREFIX__;
    }
    return 'fb-local';
  }

  function createInitialState() {
    return {
      turn: 1,
      playerHealth: 20,
      opponentHealth: 20,
      playerMana: 1,
      opponentMana: 0,
      log: ['Ashen Duel begins.'],
    };
  }

  function loadGameState(options) {
    var storage = options.storage;
    var namespace = options.namespace;
    var raw = storage.getItem(createStorageKey(namespace, 'save'));

    if (!raw) {
      return createInitialState();
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return createInitialState();
    }
  }

  function saveGameState(options) {
    options.storage.setItem(createStorageKey(options.namespace, 'save'), JSON.stringify(options.state));
  }

  var api = {
    createStorageKey: createStorageKey,
    createInitialState: createInitialState,
    loadGameState: loadGameState,
    saveGameState: saveGameState,
    readStorageNamespace: readStorageNamespace,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.DuelState = api;
})(typeof window !== 'undefined' ? window : globalThis);
