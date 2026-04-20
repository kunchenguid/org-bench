const test = require('node:test');
const assert = require('node:assert/strict');

const { createStarterDecks } = require('../src/duel-data.js');
const {
  createGame,
  startTurn,
  playCard,
  advanceToAttackPhase,
  attackTarget,
  endTurn,
} = require('../src/duel-engine.js');

function createRiggedGame() {
  return createGame({
    playerDeck: [
      'sun-scout',
      'sun-charge-knight',
      'sun-banner-mage',
      'sun-warden',
      'sun-spark',
      'sun-scout',
    ],
    aiDeck: [
      'moon-raider',
      'moon-guard',
      'moon-hexmage',
      'moon-bat',
      'moon-raider',
      'moon-guard',
    ],
    shuffle: false,
  });
}

test('starter decks are prebuilt 20-card lists', () => {
  const decks = createStarterDecks();

  assert.equal(decks.player.length, 20);
  assert.equal(decks.ai.length, 20);
});

test('starting a turn draws, refills mana, and enters main phase', () => {
  const game = createRiggedGame();

  assert.equal(game.turn.step, 'draw');
  assert.equal(game.players[0].hand.length, 3);

  startTurn(game);

  assert.equal(game.turn.step, 'main');
  assert.equal(game.players[0].hand.length, 4);
  assert.equal(game.players[0].mana, 1);
  assert.equal(game.players[0].maxMana, 1);
});

test('playing a unit spends mana and leaves it exhausted unless it has charge', () => {
  const game = createRiggedGame();
  startTurn(game);

  const scoutIndex = game.players[0].hand.findIndex((card) => card.id === 'sun-scout');
  playCard(game, 0, scoutIndex);

  assert.equal(game.players[0].mana, 0);
  assert.equal(game.players[0].board.length, 1);
  assert.equal(game.players[0].board[0].canAttack, false);
});

test('charge units can attack on the turn they are played', () => {
  const game = createRiggedGame();
  game.players[0].hand = [{ id: 'sun-charge-knight' }];
  game.players[0].mana = 2;
  game.players[0].maxMana = 2;
  game.turn.step = 'main';

  playCard(game, 0, 0);

  assert.equal(game.players[0].board[0].canAttack, true);
});

test('attack phase requires guards to be attacked first', () => {
  const game = createRiggedGame();
  game.turn.step = 'attack';
  game.players[0].board = [
    {
      instanceId: 'ally-1',
      id: 'sun-charge-knight',
      name: 'Charge Knight',
      attack: 3,
      health: 2,
      maxHealth: 2,
      canAttack: true,
      exhausted: false,
      keywords: ['charge'],
    },
  ];
  game.players[1].board = [
    {
      instanceId: 'enemy-guard',
      id: 'moon-guard',
      name: 'Moon Guard',
      attack: 1,
      health: 4,
      maxHealth: 4,
      canAttack: false,
      exhausted: true,
      keywords: ['guard'],
    },
  ];

  assert.throws(() => attackTarget(game, 0, 'hero'), /guard/i);

  attackTarget(game, 0, 'enemy-guard');

  assert.equal(game.players[1].board[0].health, 1);
  assert.equal(game.players[0].board[0].health, 1);
});

test('ending the turn hands control to the opponent in draw step', () => {
  const game = createRiggedGame();
  startTurn(game);
  advanceToAttackPhase(game);

  endTurn(game);

  assert.equal(game.turn.currentPlayer, 1);
  assert.equal(game.turn.step, 'draw');
  assert.equal(game.turn.number, 2);
});

test('hero damage can end the game during the attack phase', () => {
  const game = createRiggedGame();
  game.turn.step = 'attack';
  game.players[1].hero.health = 2;
  game.players[0].board = [
    {
      instanceId: 'ally-finisher',
      id: 'sun-charge-knight',
      name: 'Charge Knight',
      attack: 3,
      health: 2,
      maxHealth: 2,
      canAttack: true,
      exhausted: false,
      keywords: ['charge'],
    },
  ];

  attackTarget(game, 0, 'hero');

  assert.equal(game.winner, 0);
  assert.equal(game.turn.step, 'gameOver');
});
