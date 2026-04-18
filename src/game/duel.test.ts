import { describe, expect, it } from 'vitest';

import { simulateEncounter } from './duel';

describe('simulateEncounter', () => {
  it('resolves a complete deterministic duel with a winner', () => {
    const result = simulateEncounter();

    expect(result.winner).toBeTruthy();
    expect(result.turns.length).toBeGreaterThan(0);
    expect(result.turns.length).toBeLessThanOrEqual(12);
    expect(result.player.heroHealth === 0 || result.enemy.heroHealth === 0 || result.turns.length === 12).toBe(true);
  });

  it('alternates actors and never overspends mana', () => {
    const result = simulateEncounter();

    result.turns.forEach((turn, index) => {
      expect(turn.actor).toBe(index % 2 === 0 ? 'Player' : 'Enemy AI');

      const spentMana = turn.actions.reduce((sum, action) => sum + action.cost, 0);
      expect(spentMana).toBeLessThanOrEqual(turn.startMana);
      expect(turn.endMana).toBe(turn.startMana - spentMana);
      expect(turn.endMana).toBeGreaterThanOrEqual(0);
    });
  });

  it('produces readable action logs for each turn', () => {
    const result = simulateEncounter();

    expect(result.turns.every((turn) => turn.actions.length > 0)).toBe(true);
    expect(result.turns.some((turn) => turn.actions.some((action) => action.summary.includes('draws')))).toBe(true);
    expect(result.turns.some((turn) => turn.actions.some((action) => action.summary.includes('attacks')))).toBe(true);
  });
});
