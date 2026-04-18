import {
  encounters,
  factions,
  getStorageKey,
  keywordGlossary,
  starterDeck,
  uniqueCards
} from './gameData';

describe('game data foundation', () => {
  it('defines two factions, a 20-card starter deck, and a small encounter ladder', () => {
    expect(factions).toHaveLength(2);
    expect(uniqueCards.length).toBeGreaterThanOrEqual(12);
    expect(uniqueCards.length).toBeLessThanOrEqual(24);
    expect(keywordGlossary.map((entry) => entry.keyword)).toEqual([
      'Guard',
      'Charge',
      'Freeze'
    ]);
    expect(starterDeck.cards).toHaveLength(20);
    expect(encounters).toHaveLength(3);
    expect(encounters.map((encounter) => encounter.id)).toEqual([
      'ashen-adept',
      'mirror-warden',
      'cinder-tyrant'
    ]);
  });

  it('prefixes saved state keys with the injected run namespace', () => {
    expect(getStorageKey('oracle-seed-01', 'campaign')).toBe(
      'oracle-seed-01:campaign'
    );
  });
});
