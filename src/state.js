(function (global) {
  'use strict';

  function createStorageKey(namespace, key) {
    return String(namespace || 'facebook-duel') + ':' + key;
  }

  function createInitialState() {
    return {
      turn: 1,
      playerHealth: 20,
      opponentHealth: 20,
      playerMana: 1,
      opponentMana: 1,
      log: ['A new duel begins.'],
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function loadGameState(options) {
    var settings = options || {};
    var storage = settings.storage;
    var namespace = settings.namespace;
    var fallback = createInitialState();

    if (!storage) {
      return fallback;
    }

    try {
      var rawValue = storage.getItem(createStorageKey(namespace, 'save'));
      if (!rawValue) {
        return fallback;
      }
      var parsed = JSON.parse(rawValue);
      return cloneState(parsed);
    } catch (error) {
      return fallback;
    }
  }

  function saveGameState(options) {
    var settings = options || {};
    var storage = settings.storage;
    var namespace = settings.namespace;
    var state = settings.state;

    if (!storage) {
      return;
    }

    storage.setItem(createStorageKey(namespace, 'save'), JSON.stringify(state));
  }

  function readStorageNamespace() {
    if (typeof global === 'undefined') {
      return 'facebook-duel';
    }

    return global.__FB_RUN_STORAGE_NAMESPACE__ ||
      global.__RUN_STORAGE_NAMESPACE__ ||
      global.__STORAGE_NAMESPACE__ ||
      'facebook-duel';
  }

  var api = {
    createStorageKey: createStorageKey,
    createInitialState: createInitialState,
    loadGameState: loadGameState,
    saveGameState: saveGameState,
    readStorageNamespace: readStorageNamespace,
  };

  global.DuelState = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
