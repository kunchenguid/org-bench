import { describe, expect, it } from 'vitest';

import { attackOpponent, beginAttackPhase, createEncounter, endTurn, playCard } from './engine';
import { createDeck } from './decks';
import { deserializeEncounter, serializeEncounter } from './serialization';

describe('encounter engine', () => {
  it('runs a deterministic player turn into an automated AI turn', () => {
    const state = createEncounter({
      playerDeck: createDeck([
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
        'shellguard-ray',
        'reef-whisper',
        'fogweave',
        'undertow-leviathan',
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
      ]),
      aiDeck: createDeck([
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
        'shellguard-ray',
        'reef-whisper',
        'fogweave',
        'undertow-leviathan',
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
      ]),
    });

    const afterPlay = playCard(state, { playerId: 'player', handIndex: 0 });
    const afterTurn = endTurn(afterPlay);

    expect(afterTurn.round).toBe(2);
    expect(afterTurn.activePlayer).toBe('player');
    expect(afterTurn.phase).toBe('main');
    expect(afterTurn.players.player.maxMana).toBe(2);
    expect(afterTurn.players.player.mana).toBe(2);
    expect(afterTurn.players.player.board).toHaveLength(1);
    expect(afterTurn.players.player.board[0].exhausted).toBe(false);
    expect(afterTurn.players.ai.board).toHaveLength(1);
    expect(afterTurn.players.ai.board[0].cardId).toBe('lantern-initiate');
    expect(afterTurn.players.ai.mana).toBe(0);
  });

  it('round-trips serialized state and preserves pure combat transitions', () => {
    const state = createEncounter({
      playerDeck: createDeck([
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
        'shellguard-ray',
        'reef-whisper',
        'fogweave',
        'undertow-leviathan',
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
      ]),
      aiDeck: createDeck([
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
        'shellguard-ray',
        'reef-whisper',
        'fogweave',
        'undertow-leviathan',
        'lantern-initiate',
        'ashen-battlemage',
        'cinder-lancer',
        'phoenix-vow',
        'molten-colossus',
        'ashfall-rite',
        'tidal-archivist',
        'moonpool-sage',
      ]),
    });

    const afterPlay = playCard(state, { playerId: 'player', handIndex: 0 });
    const afterLoop = endTurn(afterPlay);
    const restored = deserializeEncounter(serializeEncounter(afterLoop));
    const readyToAttack = beginAttackPhase(restored, 'player');
    const afterAttack = attackOpponent(readyToAttack, {
      playerId: 'player',
      attackerId: restored.players.player.board[0].instanceId,
    });

    expect(restored).toEqual(afterLoop);
    expect(afterAttack.players.ai.health).toBe(afterLoop.players.ai.health - 1);
    expect(afterAttack.players.player.board[0].exhausted).toBe(true);
    expect(restored.players.ai.health).toBe(afterLoop.players.ai.health);
  });
});
