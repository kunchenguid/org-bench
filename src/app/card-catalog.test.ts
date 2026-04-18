import { describe, expect, it } from 'vitest';

import { cardCatalog, getCardsByFaction, getFactionSummaries } from './card-catalog';

describe('card catalog', () => {
  it('surfaces the full shared pool across the two starter factions', () => {
    expect(cardCatalog).toHaveLength(20);
    expect(new Set(cardCatalog.map((card) => card.faction))).toEqual(new Set(['Skyforge', 'Wildroot']));
    expect(new Set(cardCatalog.map((card) => card.type))).toEqual(new Set(['Creature', 'Spell']));
  });

  it('groups cards by faction for the gallery page', () => {
    expect(getCardsByFaction('Skyforge').map((card) => card.name)).toEqual([
      'Skyforge Squire',
      'Lane Warden',
      'Cloudlance Rider',
      'Banner Captain',
      'Sunsteel Colossus',
      'Tactical Order',
      'Swift Formation',
      'Lance Barrage',
      'Rally Signal',
      'Final Approach',
    ]);
    expect(getCardsByFaction('Wildroot').map((card) => card.name)).toEqual([
      'Sprout Tender',
      'Barkhide Guard',
      'Grove Stag',
      'Mossback Giant',
      'Canopy Elder',
      'Sap Mending',
      'Fertile Rain',
      'Rootsnare',
      'Wild Surplus',
      'Stampede Call',
    ]);
  });

  it('summarizes each faction with copy that matches the shared pool', () => {
    expect(getFactionSummaries()).toEqual([
      {
        faction: 'Skyforge',
        blurb: 'disciplined tempo and formation combat',
        creatureCount: 5,
        spellCount: 5,
      },
      {
        faction: 'Wildroot',
        blurb: 'growth, healing, and oversized bodies',
        creatureCount: 5,
        spellCount: 5,
      },
    ]);
  });
});
