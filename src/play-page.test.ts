import { describe, expect, it } from 'vitest';

import {
  createInitialPlayState,
  getPlayBannerCopy,
  getPlayBoardZones,
  getPlayInteractionChecklist,
  performAction,
  restorePlayState,
  startEncounter,
} from './play-page';

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

  it('summarizes the clickable duel flow in player-facing language', () => {
    expect(getPlayInteractionChecklist()).toEqual([
      'Start from the Play route and review the visible turn state before acting.',
      'Use the action controls to play cards, advance combat, and end the turn.',
      'Watch the turn flow panel after each click to confirm the next expected step.',
    ]);
  });

  it('explains when the player is starting fresh versus resuming a live encounter', () => {
    expect(getPlayBannerCopy(createInitialPlayState())).toEqual({
      kicker: 'Campaign ladder',
      title: 'Start an encounter',
      body:
        'Choose one of the visible enemies below. Once a duel starts, every legal action appears as a button and the board updates in place after your move and the AI response.',
    });

    const activeState = startEncounter(createInitialPlayState(), 'cinder-raider');

    expect(getPlayBannerCopy(activeState)).toEqual({
      kicker: 'Saved duel resumed',
      title: 'Continue against Cinder Raider',
      body:
        'Your last active encounter is back on screen. Review the board, then use the visible legal actions to keep the duel moving.',
    });
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

  it('restores a saved active encounter from persisted state', () => {
    const encounterState = startEncounter(createInitialPlayState(), 'cinder-raider');
    const savedState = performAction(encounterState, encounterState.legalActions[0]);

    const restoredState = restorePlayState(savedState);

    expect(restoredState.mode).toBe('active');

    if (restoredState.mode !== 'active') {
      throw new Error('expected an active restored state');
    }

    expect(restoredState.encounter.id).toBe(savedState.encounter.id);
    expect(restoredState.game.turn).toBe(savedState.game.turn);
    expect(restoredState.statusMessage).toBe(savedState.statusMessage);
    expect(restoredState.log).toEqual(savedState.log);
  });

  it('announces the next encounter after a player win', () => {
    const activeState = startEncounter(createInitialPlayState(), 'cinder-raider');
    const forcedWinState = {
      ...activeState,
      game: {
        ...activeState.game,
        players: {
          ...activeState.game.players,
          player: {
            ...activeState.game.players.player,
            resources: 1,
            hand: [{ instanceId: 999, cardId: 'coalburst' }],
          },
          enemy: {
            ...activeState.game.players.enemy,
            health: 2,
          },
        },
      },
      legalActions: [{ type: 'play_card' as const, playerId: 'player' as const, cardInstanceId: 999 }],
    };

    const nextState = performAction(forcedWinState, forcedWinState.legalActions[0]);

    expect(nextState.statusMessage).toBe('You defeated Cinder Raider. Next encounter: Grove Warden.');
  });

  it('announces ladder completion after the final encounter win', () => {
    const activeState = startEncounter(createInitialPlayState(), 'storm-ascendant');
    const forcedWinState = {
      ...activeState,
      game: {
        ...activeState.game,
        players: {
          ...activeState.game.players,
          player: {
            ...activeState.game.players.player,
            resources: 1,
            hand: [{ instanceId: 1000, cardId: 'coalburst' }],
          },
          enemy: {
            ...activeState.game.players.enemy,
            health: 2,
          },
        },
      },
      legalActions: [{ type: 'play_card' as const, playerId: 'player' as const, cardInstanceId: 1000 }],
    };

    const nextState = performAction(forcedWinState, forcedWinState.legalActions[0]);

    expect(nextState.statusMessage).toBe('You defeated Storm Ascendant and cleared the encounter ladder.');
  });
});
