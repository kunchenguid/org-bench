import { createCampaignState, createDuelState, playCard } from './state';

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

  it('moves creatures from hand to battlefield and spends resources', () => {
    const duel = createDuelState('oracle-seed-01', 'ashen-adept');

    duel.phase = 'main';
    const playedCardId = duel.player.hand[0].instanceId;

    const next = playCard(duel, 'player', playedCardId);

    expect(next.player.resources).toEqual({ current: 0, max: 1 });
    expect(next.player.hand).toHaveLength(3);
    expect(next.player.battlefield).toHaveLength(1);
    expect(next.player.battlefield[0]).toMatchObject({
      instanceId: playedCardId,
      cardId: 'cinder-scout',
      type: 'creature'
    });
    expect(next.player.discard).toEqual([]);
  });

  it('moves spells from hand to discard and spends resources', () => {
    const duel = createDuelState('oracle-seed-01', 'ashen-adept');

    duel.phase = 'main';
    duel.player.resources = { current: 3, max: 3 };
    const spellIndex = duel.player.deck.findIndex((card) => card.type === 'spell');

    expect(spellIndex).toBeGreaterThanOrEqual(0);

    const [spell] = duel.player.deck.splice(spellIndex, 1);
    duel.player.hand = [...duel.player.hand.slice(0, 3), spell];

    expect(spell).toBeDefined();

    const next = playCard(duel, 'player', spell!.instanceId);

    expect(next.player.resources).toEqual({ current: 1, max: 3 });
    expect(next.player.hand).toHaveLength(3);
    expect(next.player.battlefield).toEqual([]);
    expect(next.player.discard).toHaveLength(1);
    expect(next.player.discard[0]).toMatchObject({
      instanceId: spell!.instanceId,
      type: 'spell'
    });
  });
});
