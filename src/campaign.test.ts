import { describe, expect, it } from 'vitest';

import { createEncounterDuelState, ladderEncounters } from './campaign';

describe('campaign encounter bridge', () => {
  it('creates deterministic duel state from the encounter deck recipes', () => {
    const encounter = ladderEncounters[0];
    const duel = createEncounterDuelState(encounter.id);

    expect(duel.encounter.name).toBe('Cinder Bridge Ambush');
    expect(duel.state.turn).toBe(1);
    expect(duel.state.activePlayer).toBe('player');
    expect(duel.state.players.player.hand).toEqual([
      'Spark Initiate',
      'Spark Initiate',
      'Spark Initiate'
    ]);
    expect(duel.state.players.player.deck).toHaveLength(10);
    expect(duel.state.players.opponent.hand).toEqual([
      'Coal Runner',
      'Coal Runner',
      'Coal Runner'
    ]);
    expect(duel.encounter.aiPlan[0]).toMatch(/play the cheapest pressure unit first/i);
  });
});
