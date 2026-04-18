import { describe, expect, test } from 'vitest';

import {
  createEncounterState,
  createLadder,
  drawCard,
  endTurn,
  loadEncounterState,
  persistEncounterState,
  playCard,
  type SpellCard,
  storageKey,
} from './duel-engine';

describe('duel engine', () => {
  test('creates a three-encounter ladder with 20-card decks and visible zones', () => {
    const ladder = createLadder();
    const encounter = createEncounterState(ladder[0]);

    expect(ladder).toHaveLength(3);
    expect(encounter.player.health).toBe(20);
    expect(encounter.opponent.health).toBe(20);
    expect(encounter.player.hand).toHaveLength(4);
    expect(encounter.opponent.hand).toHaveLength(4);
    expect(encounter.player.deck).toHaveLength(16);
    expect(encounter.opponent.deck).toHaveLength(16);
    expect(encounter.player.discard).toHaveLength(0);
    expect(encounter.player.battlefield).toHaveLength(0);
    expect(encounter.turn.number).toBe(1);
    expect(encounter.turn.activeSide).toBe('player');
  });

  test('plays creature and spell cards into the correct zones', () => {
    const encounter = createEncounterState(createLadder()[0]);
    const creatureIndex = encounter.player.hand.findIndex((card) => card.type === 'creature');

    const afterCreature = playCard(encounter, 'player', creatureIndex);

    expect(afterCreature.player.battlefield).toHaveLength(1);
    expect(afterCreature.player.discard).toHaveLength(0);
    expect(afterCreature.player.resources.available).toBe(0);

    const testSpell: SpellCard = {
      id: 'test-cinder-burst',
      name: 'Test Cinder Burst',
      type: 'spell',
      cost: 1,
      effect: { kind: 'damage', amount: 3 },
    };

    const spellReady = {
      ...afterCreature,
      player: {
        ...afterCreature.player,
        hand: [testSpell],
        resources: {
          current: 1,
          available: 1,
        },
      },
    };

    const afterSpell = playCard(spellReady, 'player', 0);

    expect(afterSpell.opponent.health).toBe(17);
    expect(afterSpell.player.discard).toHaveLength(1);
    expect(afterSpell.player.battlefield).toHaveLength(1);
  });

  test('advances turn state deterministically and runs the AI turn', () => {
    const encounter = createEncounterState(createLadder()[0]);
    const afterPlayerTurn = endTurn(encounter);

    expect(afterPlayerTurn.turn.activeSide).toBe('player');
    expect(afterPlayerTurn.turn.number).toBe(2);
    expect(afterPlayerTurn.player.resources.current).toBe(2);
    expect(afterPlayerTurn.player.hand).toHaveLength(5);
    expect(afterPlayerTurn.log.some((entry) => entry.includes('Rook'))).toBe(true);
  });

  test('stores and loads encounter state with the injected run namespace', () => {
    const encounter = drawCard(createEncounterState(createLadder()[1]), 'player');
    const key = storageKey('run/amazon-seed-01', encounter.ladderIndex);

    persistEncounterState('run/amazon-seed-01', encounter);

    expect(window.localStorage.getItem(key)).not.toBeNull();
    expect(loadEncounterState('run/amazon-seed-01', encounter.ladderIndex)).toEqual(encounter);
  });
});
