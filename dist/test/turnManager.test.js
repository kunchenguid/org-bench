import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TurnManager } from '../turnManager.js';
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
    it('alternates between players', () => {
        const turnManager = new TurnManager();
        assert.equal(turnManager.getCurrentPlayer(), 1);
        turnManager.endTurn();
        assert.equal(turnManager.getCurrentPlayer(), 2);
        turnManager.endTurn();
        assert.equal(turnManager.getCurrentPlayer(), 1);
    });
    it('tracks turn number', () => {
        const turnManager = new TurnManager();
        assert.equal(turnManager.getTurnNumber(), 1);
        turnManager.endTurn();
        assert.equal(turnManager.getCurrentPlayer(), 2);
        turnManager.endTurn();
        assert.equal(turnManager.getCurrentPlayer(), 1);
        assert.equal(turnManager.getTurnNumber(), 2);
    });
});
