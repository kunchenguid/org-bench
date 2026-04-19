import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GameStateManager } from '../gameStateManager.js';
import { TurnManager } from '../turnManager.js';
import { ManaSystem } from '../manaSystem.js';

describe('gameStateManager', () => {
  it('transitions from main to draw phase correctly', () => {
    const turnManager = new TurnManager();
    const manaSystem = new ManaSystem();
    const gameStateManager = new GameStateManager(turnManager, manaSystem);

    gameStateManager.transitionTo('draw');
    assert.equal(gameStateManager.getCurrentPhase(), 'draw');
  });

  it('transitions from draw to main phase', () => {
    const turnManager = new TurnManager();
    const manaSystem = new ManaSystem();
    const gameStateManager = new GameStateManager(turnManager, manaSystem);

    gameStateManager.transitionTo('draw');
    gameStateManager.transitionTo('main');
    assert.equal(gameStateManager.getCurrentPhase(), 'main');
  });

  it('initializes in draw phase', () => {
    const turnManager = new TurnManager();
    const manaSystem = new ManaSystem();
    const gameStateManager = new GameStateManager(turnManager, manaSystem);

    assert.equal(gameStateManager.getCurrentPhase(), 'draw');
  });

  it('validates phase transitions', () => {
    const turnManager = new TurnManager();
    const manaSystem = new ManaSystem();
    const gameStateManager = new GameStateManager(turnManager, manaSystem);

    gameStateManager.transitionTo('draw');
    assert.doesNotThrow(() => gameStateManager.transitionTo('main'));
    assert.doesNotThrow(() => gameStateManager.transitionTo('combat'));
    assert.doesNotThrow(() => gameStateManager.transitionTo('end'));
    assert.doesNotThrow(() => gameStateManager.transitionTo('draw'));
  });
});
