import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateFanLayout, getCardDimensions } from '../fanLayout.js';
import { createCardState } from '../cardState.js';

describe('fanLayout', () => {
  it('calculates fan layout for single card', () => {
    const cards = [createCardState({
      id: 'test-1',
      name: 'Card 1',
      cost: 1,
      health: 1,
      mana: 1,
      artColor: '#ff0000'
    })];
    
    const positions = calculateFanLayout(cards, 400, 500);
    
    assert.equal(positions.length, 1);
    assert.equal(positions[0].x, 400);
    assert.equal(positions[0].y, 500);
    assert.equal(positions[0].rotation, 0);
    assert.equal(positions[0].scale, 1);
  });
  
  it('calculates fan layout for multiple cards', () => {
    const cards = [
      createCardState({ id: '1', name: 'A', cost: 1, health: 1, mana: 1, artColor: '#f00' }),
      createCardState({ id: '2', name: 'B', cost: 1, health: 1, mana: 1, artColor: '#0f0' }),
      createCardState({ id: '3', name: 'C', cost: 1, health: 1, mana: 1, artColor: '#00f' })
    ];
    
    const positions = calculateFanLayout(cards, 400, 500);
    
    assert.equal(positions.length, 3);
    assert.equal(positions[0].rotation, -5);
    assert.equal(positions[1].rotation, 0);
    assert.equal(positions[2].rotation, 5);
  });
  
  it('returns card dimensions', () => {
    const dims = getCardDimensions();
    assert.equal(dims.width, 120);
    assert.equal(dims.height, 180);
  });
});