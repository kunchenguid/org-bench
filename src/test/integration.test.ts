import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { showDamageNumber } from '../animationSystem.js';
import { GameStateManager } from '../gameStateManager.js';
import { ManaSystem } from '../manaSystem.js';
import { TurnManager } from '../turnManager.js';

describe('animationSystem', () => {
  let mockDocument: any;
  let mockElement: any;

  it.beforeEach(() => {
    mockElement = {
      style: {},
      remove: mock.fn(() => {}),
      classList: { add: mock.fn(() => {}) }
    };
    mockDocument = {
      createElement: mock.fn(() => mockElement),
      body: {
        appendChild: mock.fn(() => {})
      }
    };
    global.document = mockDocument;
  });

  it('showDamageNumber returns timeline', () => {
    const timeline = showDamageNumber(100, 200, 5, 'damage');
    assert.ok(timeline);
    assert.equal(typeof timeline.play, 'function');
  });

  it('showDamageNumber creates element with correct class', () => {
    showDamageNumber(100, 200, 5, 'damage');
  });

  it('showDamageNumber sets position', () => {
    showDamageNumber(150, 250, 3, 'heal');
  });
});

describe('gameStateManager', () => {
  it('initializes in draw phase', () => {
    const turnManager = new TurnManager();
    const manaSystem = new ManaSystem();
    const gameStateManager = new GameStateManager(turnManager, manaSystem);
    assert.equal(gameStateManager.getCurrentPhase(), 'draw');
  });
});

describe('manaSystem', () => {
  it('initializes with max mana 10', () => {
    const manaSystem = new ManaSystem();
    assert.equal(manaSystem.getMaxMana(), 10);
  });

  it('increments max mana up to 10', () => {
    const manaSystem = new ManaSystem();
    for (let i = 0; i < 15; i++) {
      manaSystem.incrementMaxMana();
    }
    assert.equal(manaSystem.getMaxMana(), 10);
  });
});

describe('turnManager', () => {
  it('initializes with current player as player 1', () => {
    const turnManager = new TurnManager();
    assert.equal(turnManager.getCurrentPlayer(), 1);
  });

  it('switches to next player on end turn', () => {
    const turnManager = new TurnManager();
    turnManager.endTurn();
    assert.equal(turnManager.getCurrentPlayer(), 2);
  });
});
