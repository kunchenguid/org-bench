import { describe, expect, it } from 'vitest';

describe('game engine contract', () => {
  it('creates a deterministic opening duel state for the first encounter', async () => {
    const { createGameSession } = await import('./engine');

    const first = createGameSession({ encounterId: 'encounter-1' });
    const second = createGameSession({ encounterId: 'encounter-1' });

    expect(first.encounter.id).toBe('encounter-1');
    expect(first.turn.activePlayerId).toBe('player');
    expect(first.turn.number).toBe(1);
    expect(first.status).toBe('in_progress');
    expect(first.players.player.resources).toEqual({ current: 1, max: 1 });
    expect(first.players.ai.resources).toEqual({ current: 0, max: 0 });
    expect(first.players.player.hand).toHaveLength(3);
    expect(first.players.ai.hand).toHaveLength(3);
    expect(first.players.player.deck.length).toBeGreaterThan(0);
    expect(first.players.ai.deck.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
  });

  it('builds a run-scoped persistence key', async () => {
    const { getPersistenceKey } = await import('./engine');

    expect(getPersistenceKey('amazon-seed-01')).toBe('amazon-seed-01:duel-tcg:game-state');
  });
});
