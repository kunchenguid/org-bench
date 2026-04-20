function getPlayableCardIds(state) {
  const mana = state.mana || 0;
  const hand = state.hand || [];

  return hand
    .filter((card) => card.owner === 'player' && card.cost <= mana)
    .map((card) => card.id);
}

function getAttackCue(state) {
  const board = state.board || {};
  const attacker = (board.player || []).find((unit) => unit.canAttack);
  const target = (board.enemy || []).find((unit) => unit.canBeAttacked);

  if (!attacker || !target) {
    return null;
  }

  return {
    attackerId: attacker.id,
    targetId: target.id,
  };
}

function getTutorialStep(state) {
  if (state.phase !== 'player') {
    return {
      id: 'enemy-turn',
      message: 'Enemy is moving. Watch the board and plan your next play.',
    };
  }

  if (getPlayableCardIds(state).length > 0 && !state.tutorial.playedCardThisTurn) {
    return {
      id: 'play-card',
      message: 'Pulse cards in your hand are playable now. Hover one to inspect it, then click to deploy it.',
    };
  }

  if (getAttackCue(state) && !state.tutorial.attackedThisTurn) {
    return {
      id: 'attack',
      message: 'Your ready ally can strike. Click it, then pick a glowing enemy target.',
    };
  }

  return {
    id: 'end-turn',
    message: 'No better move left - the glowing End Turn button hands play to the rival.',
  };
}

const api = {
  getPlayableCardIds,
  getTutorialStep,
  getAttackCue,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.TutorialState = api;
}
