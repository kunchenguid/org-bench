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

  it('creates a game storage wrapper that saves and loads the current session', async () => {
    const { createGameSession, createGameStorage } = await import('./engine');

    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key) {
        return values.get(key) ?? null;
      },
      key(index) {
        return Array.from(values.keys())[index] ?? null;
      },
      removeItem(key) {
        values.delete(key);
      },
      setItem(key, value) {
        values.set(key, value);
      }
    };
    const session = createGameSession({ encounterId: 'encounter-1' });
    const gameStorage = createGameStorage(storage, 'amazon-seed-01');

    gameStorage.save(session);

    expect(storage.getItem('amazon-seed-01:duel-tcg:game-state')).toBeTruthy();
    expect(gameStorage.load()).toEqual(session);

    gameStorage.clear();

    expect(storage.getItem('amazon-seed-01:duel-tcg:game-state')).toBeNull();
  });

  it('hands the turn to the opponent and refreshes their resources', async () => {
    const { createGameSession, endTurn } = await import('./engine');

    const session = createGameSession({ encounterId: 'encounter-1' });
    const next = endTurn(session);

    expect(next.turn).toEqual({ activePlayerId: 'ai', number: 2 });
    expect(next.players.ai.resources).toEqual({ current: 1, max: 1 });
    expect(next.players.player.resources).toEqual({ current: 1, max: 1 });
  });

  it('caps refreshed resources at ten for extended runs', async () => {
    const { endTurn } = await import('./engine');

    const next = endTurn({
      encounter: {
        id: 'encounter-9',
        opponentName: 'Clockwork Regent'
      },
      status: 'in_progress',
      turn: {
        number: 12,
        activePlayerId: 'player'
      },
      players: {
        player: {
          health: 11,
          resources: { current: 9, max: 9 },
          deck: [],
          hand: [],
          discardPile: []
        },
        ai: {
          health: 14,
          resources: { current: 9, max: 10 },
          deck: [],
          hand: [],
          discardPile: []
        }
      }
    });

    expect(next.turn).toEqual({ activePlayerId: 'ai', number: 13 });
    expect(next.players.ai.resources).toEqual({ current: 10, max: 10 });
  });
});
