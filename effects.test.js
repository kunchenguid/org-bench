const effects = require('./effects');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    return false;
  }
}

function createTestGameState() {
  return {
    player: {
      board: [],
      hand: [],
      deck: [],
      hp: 30,
      maxHp: 30,
      currentMana: 5,
      manaCap: 5,
      graveyard: [],
      faction: 'light'
    },
    opponent: {
      board: [],
      hand: [],
      deck: [],
      hp: 30,
      maxHp: 30,
      currentMana: 5,
      manaCap: 5,
      graveyard: [],
      faction: 'shadow'
    },
    lastEffect: null
  };
}

function createMinion(id, name, attack, hp, effect, faction) {
  return {
    id: id,
    name: name,
    attack: attack,
    hp: hp,
    maxHp: hp,
    effect: effect,
    faction: faction,
    canAttack: false,
    hasTaunt: false,
    hasDivineShield: false,
    hasDeathrattle: false
  };
}

function createCard(id, name, cost, attack, hp, effect, faction) {
  return {
    id: id,
    name: name,
    cost: cost,
    attack: attack,
    hp: hp,
    effect: effect,
    faction: faction
  };
}

console.log('Testing Effects Module\n');

let testsPassed = 0;
let testsFailed = 0;

testsPassed += test('Taunt keyword: mustAttackTaunt returns true when opponent has taunt minions', () => {
  const gameState = createTestGameState();
  gameState.opponent.board = [
    createMinion(1, 'Light Paladin', 3, 5, 'taunt', 'light')
  ];
  gameState.opponent.board[0].hasTaunt = true;

  const result = effects.mustAttackTaunt(gameState, 'player');
  assertEqual(result, true, 'mustAttackTaunt should return true');
});

testsPassed += test('Taunt keyword: mustAttackTaunt returns false when opponent has no taunt minions', () => {
  const gameState = createTestGameState();
  gameState.opponent.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light')
  ];

  const result = effects.mustAttackTaunt(gameState, 'player');
  assertEqual(result, false, 'mustAttackTaunt should return false');
});

testsPassed += test('Taunt keyword: getTauntTargets returns correct taunt minions', () => {
  const gameState = createTestGameState();
  gameState.opponent.board = [
    createMinion(1, 'Light Paladin', 3, 5, 'taunt', 'light'),
    createMinion(2, 'Light Priest', 1, 3, 'deathrattle', 'light'),
    createMinion(3, 'Void Walker', 2, 4, 'taunt', 'shadow')
  ];
  gameState.opponent.board[0].hasTaunt = true;
  gameState.opponent.board[2].hasTaunt = true;

  const tauntTargets = effects.getTauntTargets(gameState, 'opponent');
  assertEqual(tauntTargets.length, 2, 'Should return 2 taunt targets');
  assertEqual(tauntTargets[0].name, 'Light Paladin', 'First target should be Light Paladin');
  assertEqual(tauntTargets[1].name, 'Void Walker', 'Second target should be Void Walker');
});

testsPassed += test('Taunt keyword: getTauntTargets returns empty array when no taunt minions', () => {
  const gameState = createTestGameState();
  gameState.opponent.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light')
  ];

  const tauntTargets = effects.getTauntTargets(gameState, 'opponent');
  assertEqual(tauntTargets.length, 0, 'Should return 0 taunt targets');
});

testsPassed += test('Charge keyword: applyEffect sets canAttack to true', () => {
  const gameState = createTestGameState();
  const minion = createMinion(1, 'Charge Minion', 2, 2, 'charge', 'light');

  effects.applyEffect(gameState, 'player', minion, true);
  assertEqual(minion.canAttack, true, 'canAttack should be true after charge effect');
});

testsPassed += test('Charge keyword: canMinionAttack returns true for charged minions', () => {
  const minion = createMinion(1, 'Charge Minion', 2, 2, 'charge', 'light');
  minion.canAttack = true;

  const result = effects.canMinionAttack(minion);
  assertEqual(result, true, 'canMinionAttack should return true');
});

testsPassed += test('Charge keyword: canMinionAttack returns false for non-charged minions', () => {
  const minion = createMinion(1, 'Regular Minion', 2, 2, null, 'light');
  minion.canAttack = false;

  const result = effects.canMinionAttack(minion);
  assertEqual(result, false, 'canMinionAttack should return false');
});

testsPassed += test('Divine Shield keyword: applyEffect sets hasDivineShield to true', () => {
  const gameState = createTestGameState();
  const minion = createMinion(1, 'Shield Minion', 2, 4, 'divineShield', 'light');

  effects.applyEffect(gameState, 'player', minion, true);
  assertEqual(minion.hasDivineShield, true, 'hasDivineShield should be true after effect');
});

testsPassed += test('Divine Shield keyword: applyDivineShield blocks first damage', () => {
  const minion = createMinion(1, 'Shield Minion', 2, 4, 'divineShield', 'light');
  minion.hasDivineShield = true;
  const damage = 3;

  const actualDamage = effects.applyDivineShield(minion, damage);
  assertEqual(actualDamage, 0, 'Damage should be 0 when divine shield is active');
  assertEqual(minion.hasDivineShield, false, 'Divine shield should be consumed');
});

testsPassed += test('Divine Shield keyword: applyDivineShield does not block without shield', () => {
  const minion = createMinion(1, 'Regular Minion', 2, 4, null, 'light');
  minion.hasDivineShield = false;
  const damage = 3;

  const actualDamage = effects.applyDivineShield(minion, damage);
  assertEqual(actualDamage, damage, 'Damage should be full amount without divine shield');
  assertEqual(minion.hasDivineShield, false, 'hasDivineShield should remain false');
});

testsPassed += test('Divine Shield keyword: applyDivineShield blocks only once', () => {
  const minion = createMinion(1, 'Shield Minion', 2, 4, 'divineShield', 'light');
  minion.hasDivineShield = true;

  const firstDamage = effects.applyDivineShield(minion, 3);
  const secondDamage = effects.applyDivineShield(minion, 2);

  assertEqual(firstDamage, 0, 'First damage should be blocked');
  assertEqual(secondDamage, 2, 'Second damage should not be blocked');
  assertEqual(minion.hasDivineShield, false, 'Divine shield should be consumed after first hit');
});

testsPassed += test('Deathrattle keyword: applyEffect sets hasDeathrattle to true', () => {
  const gameState = createTestGameState();
  const minion = createMinion(1, 'Deathrattle Minion', 2, 2, 'deathrattle', 'light');

  effects.applyEffect(gameState, 'player', minion, true);
  assertEqual(minion.hasDeathrattle, true, 'hasDeathrattle should be true after effect');
});

testsPassed += test('Deathrattle keyword: triggerOnDeath is called when minion dies', () => {
  const gameState = createTestGameState();
  gameState.player.hp = 28;
  const minion = createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light');
  minion.id = 'light_priest';

  effects.triggerOnDeath(gameState, 'player', minion);

  assertEqual(gameState.player.hp, 30, 'Hero HP should increase by 2');
  assertEqual(gameState.lastEffect.type, 'onDeath', 'Last effect type should be onDeath');
  assertEqual(gameState.lastEffect.description, 'Light Priest heals hero for 2', 'Effect description should match');
});

testsPassed += test('Light Paladin synergy: onPlay grants Divine Shield to all light allies', () => {
  const gameState = createTestGameState();
  gameState.player.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light'),
    createMinion(2, 'Solar Guardian', 4, 6, 'divineShield', 'light')
  ];
  const card = createCard('light_paladin', 'Light Paladin', 4, 3, 5, 'taunt', 'light');
  card.id = 'light_paladin';

  effects.triggerOnPlay(gameState, 'player', card);

  assertEqual(gameState.player.board[0].hasDivineShield, true, 'First ally should have Divine Shield');
  assertEqual(gameState.player.board[1].hasDivineShield, true, 'Second ally should have Divine Shield');
  assertEqual(gameState.lastEffect.type, 'onPlay', 'Last effect type should be onPlay');
  assertEqual(gameState.lastEffect.description, 'Light Paladin grants Divine Shield to all allies', 'Effect description should match');
});

testsPassed += test('Light Paladin synergy: onPlay only grants Divine Shield to light faction allies', () => {
  const gameState = createTestGameState();
  gameState.player.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light'),
    createMinion(2, 'Shadow Wisp', 1, 1, 'deathrattle', 'shadow')
  ];
  const card = createCard('light_paladin', 'Light Paladin', 4, 3, 5, 'taunt', 'light');
  card.id = 'light_paladin';

  effects.triggerOnPlay(gameState, 'player', card);

  assertEqual(gameState.player.board[0].hasDivineShield, true, 'Light ally should have Divine Shield');
  assertEqual(gameState.player.board[1].hasDivineShield, false, 'Shadow ally should not have Divine Shield');
});

testsPassed += test('Shadow Necromancer synergy: onPlay revives enemy minion', () => {
  const gameState = createTestGameState();
  gameState.opponent.graveyard = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light')
  ];
  const card = createCard('shadow_necromancer', 'Shadow Necromancer', 5, 4, 4, 'deathrattle', 'shadow');
  card.id = 'shadow_necromancer';

  effects.triggerOnPlay(gameState, 'player', card);

  assertEqual(gameState.player.board.length, 1, 'Player should have 1 minion on board');
  assertEqual(gameState.opponent.graveyard.length, 0, 'Enemy graveyard should be empty');
  assertEqual(gameState.player.board[0].canAttack, true, 'Revived minion can attack');
  assertEqual(gameState.player.board[0].hp, 1, 'Revived minion has 1 HP');
  assertEqual(gameState.lastEffect.type, 'onPlay', 'Last effect type should be onPlay');
  assertEqual(gameState.lastEffect.description, 'Shadow Necromancer revives enemy minion', 'Effect description should match');
});

testsPassed += test('Shadow Necromancer synergy: onPlay does nothing when enemy graveyard is empty', () => {
  const gameState = createTestGameState();
  gameState.opponent.graveyard = [];
  const card = createCard('shadow_necromancer', 'Shadow Necromancer', 5, 4, 4, 'deathrattle', 'shadow');
  card.id = 'shadow_necromancer';

  effects.triggerOnPlay(gameState, 'player', card);

  assertEqual(gameState.player.board.length, 0, 'Player should have 0 minions on board');
  assertEqual(gameState.lastEffect, null, 'No effect should be triggered');
});

testsPassed += test('Solar Guardian synergy: onPlay heals hero for 3', () => {
  const gameState = createTestGameState();
  gameState.player.hp = 27;
  const card = createCard('solar_guardian', 'Solar Guardian', 5, 4, 6, 'divineShield', 'light');
  card.id = 'solar_guardian';

  effects.triggerOnPlay(gameState, 'player', card);

  assertEqual(gameState.player.hp, 30, 'Hero HP should increase by 3');
  assertEqual(gameState.lastEffect.type, 'onPlay', 'Last effect type should be onPlay');
  assertEqual(gameState.lastEffect.description, 'Solar Guardian heals hero for 3', 'Effect description should match');
});

testsPassed += test('Solar Guardian synergy: onPlay caps healing at max HP', () => {
  const gameState = createTestGameState();
  gameState.player.hp = 28;
  const card = createCard('solar_guardian', 'Solar Guardian', 5, 4, 6, 'divineShield', 'light');
  card.id = 'solar_guardian';

  effects.triggerOnPlay(gameState, 'player', card);

  assertEqual(gameState.player.hp, 30, 'Hero HP should be capped at 30');
});

testsPassed += test('Light Priest synergy: onDeath heals hero for 2', () => {
  const gameState = createTestGameState();
  gameState.player.hp = 28;
  const minion = createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light');
  minion.id = 'light_priest';

  effects.triggerOnDeath(gameState, 'player', minion);

  assertEqual(gameState.player.hp, 30, 'Hero HP should increase by 2');
  assertEqual(gameState.lastEffect.type, 'onDeath', 'Last effect type should be onDeath');
  assertEqual(gameState.lastEffect.description, 'Light Priest heals hero for 2', 'Effect description should match');
});

testsPassed += test('Light Priest synergy: onDeath caps healing at max HP', () => {
  const gameState = createTestGameState();
  gameState.player.hp = 29;
  const minion = createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light');
  minion.id = 'light_priest';

  effects.triggerOnDeath(gameState, 'player', minion);

  assertEqual(gameState.player.hp, 30, 'Hero HP should be capped at 30');
});

testsPassed += test('Void Walker synergy: onDeath destroys 1 enemy mana', () => {
  const gameState = createTestGameState();
  gameState.opponent.currentMana = 5;
  const minion = createMinion(1, 'Void Walker', 2, 4, 'taunt', 'shadow');
  minion.id = 'void_walker';

  effects.triggerOnDeath(gameState, 'player', minion);

  assertEqual(gameState.opponent.currentMana, 4, 'Enemy mana should decrease by 1');
  assertEqual(gameState.lastEffect.type, 'onDeath', 'Last effect type should be onDeath');
  assertEqual(gameState.lastEffect.description, 'Void Walker destroys 1 enemy mana', 'Effect description should match');
});

testsPassed += test('Void Walker synergy: onDeath caps mana destruction at 0', () => {
  const gameState = createTestGameState();
  gameState.opponent.currentMana = 0;
  const minion = createMinion(1, 'Void Walker', 2, 4, 'taunt', 'shadow');
  minion.id = 'void_walker';

  effects.triggerOnDeath(gameState, 'player', minion);

  assertEqual(gameState.opponent.currentMana, 0, 'Enemy mana should not go below 0');
});

testsPassed += test('Void Walker synergy: onDeath from opponent destroys player mana', () => {
  const gameState = createTestGameState();
  gameState.player.currentMana = 5;
  const minion = createMinion(1, 'Void Walker', 2, 4, 'taunt', 'shadow');
  minion.id = 'void_walker';

  effects.triggerOnDeath(gameState, 'opponent', minion);

  assertEqual(gameState.player.currentMana, 4, 'Player mana should decrease by 1');
});

testsPassed += test('Shadow Wisp synergy: onDeath buffs all allies', () => {
  const gameState = createTestGameState();
  gameState.player.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light'),
    createMinion(2, 'Solar Guardian', 4, 6, 'divineShield', 'light')
  ];
  const minion = createMinion(3, 'Shadow Wisp', 1, 1, 'deathrattle', 'shadow');
  minion.id = 'shadow_wisp';

  effects.triggerOnDeath(gameState, 'player', minion);

  assertEqual(gameState.player.board[0].attack, 2, 'First ally attack should increase by 1');
  assertEqual(gameState.player.board[1].attack, 5, 'Second ally attack should increase by 1');
  assertEqual(gameState.lastEffect.type, 'onDeath', 'Last effect type should be onDeath');
  assertEqual(gameState.lastEffect.description, 'Shadow Wisp buffs allies', 'Effect description should match');
});

testsPassed += test('Shadow Wisp synergy: onDeath does not buff itself', () => {
  const gameState = createTestGameState();
  gameState.player.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light'),
    createMinion(2, 'Shadow Wisp', 1, 1, 'deathrattle', 'shadow')
  ];
  gameState.player.board[1].id = 'shadow_wisp';
  const dyingMinion = gameState.player.board[1];

  effects.triggerOnDeath(gameState, 'player', dyingMinion);

  assertEqual(gameState.player.board[0].attack, 2, 'Ally should be buffed');
  assertEqual(dyingMinion.attack, 1, 'Shadow Wisp should not buff itself');
});

testsPassed += test('Shadow Wisp synergy: onDeath from opponent buffs enemy allies', () => {
  const gameState = createTestGameState();
  gameState.opponent.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light'),
    createMinion(2, 'Solar Guardian', 4, 6, 'divineShield', 'light')
  ];
  const minion = createMinion(3, 'Shadow Wisp', 1, 1, 'deathrattle', 'shadow');
  minion.id = 'shadow_wisp';

  effects.triggerOnDeath(gameState, 'opponent', minion);

  assertEqual(gameState.opponent.board[0].attack, 2, 'Enemy ally should be buffed');
  assertEqual(gameState.opponent.board[1].attack, 5, 'Enemy ally should be buffed');
});

testsPassed += test('ApplyEffect: invalid effect key does nothing', () => {
  const gameState = createTestGameState();
  const minion = createMinion(1, 'Regular Minion', 2, 2, 'invalid_effect', 'light');

  effects.applyEffect(gameState, 'player', minion, true);

  assertEqual(minion.canAttack, false, 'canAttack should remain false');
  assertEqual(minion.hasTaunt, false, 'hasTaunt should remain false');
  assertEqual(minion.hasDivineShield, false, 'hasDivineShield should remain false');
});

testsPassed += test('ApplyEffect: null effect key does nothing', () => {
  const gameState = createTestGameState();
  const minion = createMinion(1, 'Regular Minion', 2, 2, null, 'light');

  effects.applyEffect(gameState, 'player', minion, true);

  assertEqual(minion.canAttack, false, 'canAttack should remain false');
  assertEqual(minion.hasTaunt, false, 'hasTaunt should remain false');
  assertEqual(minion.hasDivineShield, false, 'hasDivineShield should remain false');
});

testsPassed += test('TriggerOnPlay: non-matching card ID does nothing', () => {
  const gameState = createTestGameState();
  gameState.player.board = [
    createMinion(1, 'Light Priest', 1, 3, 'deathrattle', 'light')
  ];
  const card = createCard('regular_card', 'Regular Card', 2, 2, 2, null, 'light');

  effects.triggerOnPlay(gameState, 'player', card);

  assertEqual(gameState.player.board[0].hasDivineShield, false, 'Ally should not have Divine Shield');
  assertEqual(gameState.lastEffect, null, 'No effect should be triggered');
});

testsPassed += test('TriggerOnDeath: non-matching minion ID does nothing', () => {
  const gameState = createTestGameState();
  gameState.player.hp = 28;
  const minion = createMinion(1, 'Regular Minion', 2, 2, null, 'light');
  minion.id = 'regular_minion';

  effects.triggerOnDeath(gameState, 'player', minion);

  assertEqual(gameState.player.hp, 28, 'Hero HP should remain unchanged');
  assertEqual(gameState.lastEffect, null, 'No effect should be triggered');
});

const totalTests = testsPassed + testsFailed;
console.log(`\n${testsPassed}/${totalTests} tests passed`);

if (testsFailed > 0) {
  console.log(`${testsFailed} tests failed`);
  process.exit(1);
} else {
  console.log('All tests passed!');
  process.exit(0);
}