import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { canAttack, getValidTargets, resolveCombat, dealDamageToPlayer, healPlayer } from '../combatSystem.js';
import { PlayerType, TurnPhase } from '../gameState.js';
import { createInitialGameState, updatePlayerState, setTurnPhase } from '../stateManager.js';
import { Card } from '../types.js';

describe('combatSystem', () => {
  let state: any;
  
  beforeEach(() => {
    const cards = new Map<string, Card>([
      ['attacker1', { id: 'attacker1', name: 'Attacker', cost: 1, health: 5, mana: 1, artColor: '#ff0000' }],
      ['defender1', { id: 'defender1', name: 'Defender', cost: 1, health: 3, mana: 1, artColor: '#00ff00' }],
      ['attacker2', { id: 'attacker2', name: 'Attacker2', cost: 1, health: 3, mana: 1, artColor: '#ff0000' }]
    ]);
    state = createInitialGameState(cards);
    state.currentPhase = TurnPhase.COMBAT;
    state.currentPlayer = PlayerType.PLAYER;
    state = updatePlayerState(state, PlayerType.PLAYER, { board: ['attacker1', 'attacker2'] });
    state = updatePlayerState(state, PlayerType.OPPONENT, { board: ['defender1'] });
  });
  
  describe('canAttack', () => {
    it('returns true in combat phase with card on board', () => {
      assert.strictEqual(canAttack(state, 'attacker1'), true);
    });
    
    it('returns false outside combat phase', () => {
      state = setTurnPhase(state, TurnPhase.MAIN);
      assert.strictEqual(canAttack(state, 'attacker1'), false);
    });
    
    it('returns false when card not on board', () => {
      assert.strictEqual(canAttack(state, 'defender1'), false);
    });
  });
  
  describe('getValidTargets', () => {
    it('returns opponent cards and player when attackable', () => {
      const targets = getValidTargets(state, 'attacker1');
      assert.ok(targets.includes('defender1'));
      assert.ok(targets.includes('opponent'));
    });
    
    it('returns empty array when cannot attack', () => {
      state = setTurnPhase(state, TurnPhase.MAIN);
      const targets = getValidTargets(state, 'attacker1');
      assert.strictEqual(targets.length, 0);
    });
  });
  
  describe('resolveCombat', () => {
    it('resolves card vs card combat', () => {
      const result = resolveCombat(state, { attackerCardId: 'attacker1', targetCardId: 'defender1' });
      
      assert.strictEqual(result.attackerCardId, 'attacker1');
      assert.strictEqual(result.targetCardId, 'defender1');
      assert.strictEqual(result.damageToTarget, 5);
      assert.strictEqual(result.damageToAttacker, 3);
      assert.strictEqual(result.attackerDestroyed, false);
      assert.strictEqual(result.targetDestroyed, true);
    });
    
    it('resolves card vs player combat', () => {
      const result = resolveCombat(state, { attackerCardId: 'attacker1', targetPlayer: PlayerType.OPPONENT });
      
      assert.strictEqual(result.damageToTarget, 5);
      assert.strictEqual(result.damageToAttacker, 0);
    });
    
    it('destroys attacker when takes enough damage', () => {
      const result = resolveCombat(state, { attackerCardId: 'attacker2', targetCardId: 'defender1' });
      
      assert.strictEqual(result.damageToAttacker, 3);
      assert.strictEqual(result.attackerDestroyed, true);
    });
  });
  
  describe('dealDamageToPlayer', () => {
    it('deals damage to player', () => {
      const updated = dealDamageToPlayer(state, PlayerType.OPPONENT, 5);
      assert.strictEqual(updated.opponent.health, 25);
    });
    
    it('clamps health at zero', () => {
      const updated = dealDamageToPlayer(state, PlayerType.OPPONENT, 35);
      assert.strictEqual(updated.opponent.health, 0);
    });
  });
  
  describe('healPlayer', () => {
    it('heals player', () => {
      state = updatePlayerState(state, PlayerType.PLAYER, { health: 20 });
      const updated = healPlayer(state, PlayerType.PLAYER, 5);
      assert.strictEqual(updated.player.health, 25);
    });
    
    it('caps at max health', () => {
      state = updatePlayerState(state, PlayerType.PLAYER, { health: 28 });
      const updated = healPlayer(state, PlayerType.PLAYER, 5);
      assert.strictEqual(updated.player.health, 30);
    });
  });
});