import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCardState } from '../cardState.js';

describe('cardState', () => {
  it('creates card state with position defaults', () => {
    const state = createCardState({
      id: 'test-1',
      name: 'Test Card',
      cost: 3,
      health: 5,
      mana: 2,
      artColor: '#ff0000'
    });
    
    assert.equal(state.card.id, 'test-1');
    assert.equal(state.position.x, 0);
    assert.equal(state.position.y, 0);
    assert.equal(state.position.rotation, 0);
    assert.equal(state.position.scale, 1);
    assert.equal(state.isFlipped, false);
    assert.equal(state.isHovering, false);
  });
  
  it('creates card state with custom position', () => {
    const state = createCardState({
      id: 'test-2',
      name: 'Test Card',
      cost: 2,
      health: 4,
      mana: 3,
      artColor: '#00ff00'
    }, { x: 100, y: 50, rotation: 10, scale: 1.5 });
    
    assert.equal(state.position.x, 100);
    assert.equal(state.position.y, 50);
    assert.equal(state.position.rotation, 10);
    assert.equal(state.position.scale, 1.5);
  });
});