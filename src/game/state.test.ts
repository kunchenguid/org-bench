import { createCampaignState, createDuelState } from './state';

describe('shared duel state', () => {
  it('creates a namespaced campaign ladder from the shared encounter list', () => {
    expect(createCampaignState('oracle-seed-01')).toEqual({
      storageKey: 'oracle-seed-01:campaign',
      namespace: 'oracle-seed-01',
      currentEncounterId: 'ashen-adept',
      remainingEncounterIds: ['mirror-warden', 'cinder-tyrant'],
      completedEncounterIds: []
    });
  });

  it('creates a deterministic opening duel state with health, resources, and zones', () => {
    const duel = createDuelState('oracle-seed-01', 'ashen-adept');

    expect(duel.storageKey).toBe('oracle-seed-01:duel:ashen-adept');
    expect(duel.activePlayerId).toBe('player');
    expect(duel.turnNumber).toBe(1);
    expect(duel.phase).toBe('draw');
    expect(duel.player.health).toBe(20);
    expect(duel.player.resources).toEqual({ current: 1, max: 1 });
    expect(duel.player.hand).toHaveLength(4);
    expect(duel.player.deck).toHaveLength(16);
    expect(duel.player.battlefield).toEqual([]);
    expect(duel.player.discard).toEqual([]);
    expect(duel.player.hand.every((card) => card.ownerId === 'player')).toBe(true);
    expect(duel.opponent.id).toBe('ashen-adept');
    expect(duel.opponent.health).toBe(20);
    expect(duel.opponent.resources).toEqual({ current: 0, max: 0 });
    expect(duel.opponent.hand).toHaveLength(4);
    expect(duel.opponent.deck).toHaveLength(16);
    expect(duel.opponent.battlefield).toEqual([]);
    expect(duel.opponent.discard).toEqual([]);
    expect(duel.opponent.hand.every((card) => card.ownerId === 'ashen-adept')).toBe(true);
    expect(duel.opponent.hand[0]).toMatchObject({
      cardId: 'cinder-scout',
      type: 'creature'
    });
    expect(duel.player.hand[0]).toMatchObject({
      cardId: 'cinder-scout',
      type: 'creature'
    });
  });
});
