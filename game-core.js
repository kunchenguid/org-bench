const logic = require('./src/logic.js');

function getStorageKey(namespace) {
  return namespace + 'duel-tcg-state';
}

function createInitialGameState() {
  const state = logic.createInitialState({ seed: 7 });
  return {
    turn: 1,
    activeSide: 'player',
    player: {
      health: state.player.health,
      mana: state.player.mana,
      maxMana: state.player.maxMana,
      hand: state.player.hand.map((card) => card.id),
    },
    opponent: {
      health: state.enemy.health,
      handCount: state.enemy.hand.length,
    },
    tutorialStep: 'intro',
  };
}

function saveGameState(storage, namespace, state) {
  storage.setItem(getStorageKey(namespace), JSON.stringify(state));
}

function loadGameState(storage, namespace) {
  const raw = storage.getItem(getStorageKey(namespace));
  return raw ? JSON.parse(raw) : createInitialGameState();
}

module.exports = {
  getStorageKey,
  saveGameState,
  loadGameState,
  createInitialGameState,
};
