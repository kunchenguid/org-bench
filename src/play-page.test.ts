import { describe, expect, it } from 'vitest';

import { createInitialPlayState, getPlayBoardZones, performAction, startEncounter } from './play-page';

describe('getPlayBoardZones', () => {
  it('returns the evaluator-facing board zones needed on the play page', () => {
    expect(getPlayBoardZones()).toEqual([
      'Enemy health',
      'Player health',
      'Resources',
      'Battlefield',
      'Hand',
      'Deck',
      'Discard',
      'Action controls',
      'Turn flow',
    ]);
  });

  it('starts an encounter and resolves a legal player turn into an enemy response', () => {
    const idleState = createInitialPlayState();
    expect(idleState.mode).toBe('idle');

    const encounterState = startEncounter(idleState, 'cinder-raider');
    expect(encounterState.mode).toBe('active');
    expect(encounterState.encounter.name).toBe('Cinder Raider');
    expect(encounterState.game.activePlayerId).toBe('player');

    const playableAction = encounterState.legalActions.find((action) => action.type === 'play_card');
    const nextState = playableAction ? performAction(encounterState, playableAction) : performAction(encounterState, encounterState.legalActions[0]);

    expect(nextState.mode).toBe('active');
    expect(nextState.game.activePlayerId).toBe('player');
    expect(nextState.log.length).toBeGreaterThan(encounterState.log.length);
    expect(nextState.statusMessage.length).toBeGreaterThan(0);
  });
});
