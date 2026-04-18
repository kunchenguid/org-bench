function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function createInitialState() {
  return {
    status: 'active',
    turn: 'player',
    player: { hp: 30, shielded: false },
    enemy: { hp: 24 },
    log: ['Rogue AI boots into the arena and angles for an opening strike.'],
  };
}

function performPlayerAction(state, action) {
  const next = cloneState(state);

  if (next.status !== 'active' || next.turn !== 'player') {
    return next;
  }

  if (action === 'attack') {
    next.enemy.hp = Math.max(0, next.enemy.hp - 6);
    next.log.push('You strike through the front line for 6 damage.');

    if (next.enemy.hp === 0) {
      next.status = 'won';
      next.turn = 'complete';
      return next;
    }

    next.turn = 'enemy';
    return next;
  }

  if (action === 'defend') {
    next.player.shielded = true;
    next.turn = 'enemy';
    next.log.push('You brace behind a crackling shield wall.');
  }

  return next;
}

function resolveEnemyTurn(state) {
  const next = cloneState(state);

  if (next.status !== 'active' || next.turn !== 'enemy') {
    return next;
  }

  const incomingDamage = next.player.shielded ? 3 : 6;
  next.player.hp = Math.max(0, next.player.hp - incomingDamage);
  next.player.shielded = false;
  next.log.push(`Rogue AI counterfires for ${incomingDamage} damage.`);

  if (next.player.hp === 0) {
    next.status = 'lost';
    next.turn = 'complete';
    return next;
  }

  next.turn = 'player';
  return next;
}

module.exports = {
  createInitialState,
  performPlayerAction,
  resolveEnemyTurn,
};
