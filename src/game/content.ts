export type FactionId = 'skyforge' | 'wildroot';
export type CardType = 'creature' | 'spell';
export type KeywordId = 'guard' | 'charge' | 'renew' | 'overrun';

export type FactionDefinition = {
  id: FactionId;
  name: string;
  theme: string;
  summary: string;
};

export type KeywordDefinition = {
  id: KeywordId;
  name: string;
  rulesText: string;
};

export type CardDefinition = {
  id: string;
  name: string;
  factionId: FactionId;
  type: CardType;
  cost: number;
  attack?: number;
  health?: number;
  keywords: KeywordId[];
  text: string;
};

export type DeckEntry = {
  cardId: string;
  count: number;
};

export type StarterDeck = {
  id: string;
  name: string;
  factionId: FactionId;
  cards: DeckEntry[];
};

export type EncounterDefinition = {
  id: string;
  name: string;
  difficulty: number;
  factionId: FactionId;
  deckId: string;
  aiFocus: string;
  reward: string;
};

export const factions: FactionDefinition[] = [
  {
    id: 'skyforge',
    name: 'Skyforge',
    theme: 'disciplined tempo and formation combat',
    summary: 'A tempo faction that wins by curving out, protecting lanes, and turning small edges into clean finishes.',
  },
  {
    id: 'wildroot',
    name: 'Wildroot',
    theme: 'growth, healing, and oversized bodies',
    summary: 'A ramp faction that stabilizes early, then takes over with durable creatures and steady recovery.',
  },
];

export const keywords: KeywordDefinition[] = [
  {
    id: 'guard',
    name: 'Guard',
    rulesText: 'Enemy creatures must attack this creature first if able.',
  },
  {
    id: 'charge',
    name: 'Charge',
    rulesText: 'This creature can attack on the turn it enters play.',
  },
  {
    id: 'renew',
    name: 'Renew',
    rulesText: 'When this enters play, restore the listed amount of health to your hero.',
  },
  {
    id: 'overrun',
    name: 'Overrun',
    rulesText: 'Excess combat damage from this creature hits the opposing hero.',
  },
];

export const cardPool: CardDefinition[] = [
  { id: 'skyforge-squire', name: 'Skyforge Squire', factionId: 'skyforge', type: 'creature', cost: 1, attack: 1, health: 2, keywords: [], text: 'A clean opener that helps Skyforge contest the board from turn one.' },
  { id: 'lane-warden', name: 'Lane Warden', factionId: 'skyforge', type: 'creature', cost: 2, attack: 2, health: 3, keywords: ['guard'], text: 'Guard. Holds the line while smaller allies keep attacking.' },
  { id: 'cloudlance-rider', name: 'Cloudlance Rider', factionId: 'skyforge', type: 'creature', cost: 3, attack: 3, health: 2, keywords: ['charge'], text: 'Charge. Converts tempo into immediate pressure.' },
  { id: 'banner-captain', name: 'Banner Captain', factionId: 'skyforge', type: 'creature', cost: 4, attack: 4, health: 4, keywords: [], text: 'A reliable top-end threat for the aggressive Skyforge curve.' },
  { id: 'sunsteel-colossus', name: 'Sunsteel Colossus', factionId: 'skyforge', type: 'creature', cost: 5, attack: 5, health: 5, keywords: ['overrun'], text: 'Overrun. Punishes weak blockers and closes games quickly.' },
  { id: 'tactical-order', name: 'Tactical Order', factionId: 'skyforge', type: 'spell', cost: 1, keywords: [], text: 'Give a friendly creature +1 attack this turn.' },
  { id: 'swift-formation', name: 'Swift Formation', factionId: 'skyforge', type: 'spell', cost: 2, keywords: [], text: 'Draw a card. The next creature you play this turn costs 1 less.' },
  { id: 'lance-barrage', name: 'Lance Barrage', factionId: 'skyforge', type: 'spell', cost: 3, keywords: [], text: 'Deal 3 damage to an enemy creature.' },
  { id: 'rally-signal', name: 'Rally Signal', factionId: 'skyforge', type: 'spell', cost: 4, keywords: [], text: 'Friendly creatures get +1/+1 this turn.' },
  { id: 'final-approach', name: 'Final Approach', factionId: 'skyforge', type: 'spell', cost: 5, keywords: [], text: 'Deal 4 damage to the opposing hero. Draw a card if you control a creature.' },
  { id: 'sprout-tender', name: 'Sprout Tender', factionId: 'wildroot', type: 'creature', cost: 1, attack: 1, health: 3, keywords: ['renew'], text: 'Renew 1. A sticky early body that buys time.' },
  { id: 'barkhide-guard', name: 'Barkhide Guard', factionId: 'wildroot', type: 'creature', cost: 2, attack: 2, health: 4, keywords: ['guard'], text: 'Guard. Stops fast starts and protects your bigger threats.' },
  { id: 'grove-stag', name: 'Grove Stag', factionId: 'wildroot', type: 'creature', cost: 3, attack: 3, health: 4, keywords: [], text: 'A sturdy midgame creature with no extra text to keep the set readable.' },
  { id: 'mossback-giant', name: 'Mossback Giant', factionId: 'wildroot', type: 'creature', cost: 4, attack: 4, health: 6, keywords: [], text: 'The core Wildroot stabilizer and payoff for surviving the early turns.' },
  { id: 'canopy-elder', name: 'Canopy Elder', factionId: 'wildroot', type: 'creature', cost: 5, attack: 5, health: 7, keywords: ['renew', 'overrun'], text: 'Renew 3. Overrun. The ladder boss finisher.' },
  { id: 'sap-mending', name: 'Sap Mending', factionId: 'wildroot', type: 'spell', cost: 1, keywords: [], text: 'Restore 2 health to your hero and draw a card.' },
  { id: 'fertile-rain', name: 'Fertile Rain', factionId: 'wildroot', type: 'spell', cost: 2, keywords: [], text: 'Gain 1 extra resource this turn. Draw a card.' },
  { id: 'rootsnare', name: 'Rootsnare', factionId: 'wildroot', type: 'spell', cost: 3, keywords: [], text: 'An enemy creature gets -3 attack this turn.' },
  { id: 'wild-surplus', name: 'Wild Surplus', factionId: 'wildroot', type: 'spell', cost: 4, keywords: [], text: 'Summon a 2/2 Sapling creature token with Guard.' },
  { id: 'stampede-call', name: 'Stampede Call', factionId: 'wildroot', type: 'spell', cost: 5, keywords: [], text: 'A friendly creature gets +3 attack and Overrun this turn.' },
];

export const starterDecks: StarterDeck[] = [
  { id: 'skyforge-starter', name: 'Skyforge Starter', factionId: 'skyforge', cards: [
    { cardId: 'skyforge-squire', count: 2 }, { cardId: 'lane-warden', count: 2 }, { cardId: 'cloudlance-rider', count: 2 }, { cardId: 'banner-captain', count: 2 }, { cardId: 'sunsteel-colossus', count: 2 }, { cardId: 'tactical-order', count: 2 }, { cardId: 'swift-formation', count: 2 }, { cardId: 'lance-barrage', count: 2 }, { cardId: 'rally-signal', count: 2 }, { cardId: 'final-approach', count: 2 },
  ] },
  { id: 'wildroot-starter', name: 'Wildroot Starter', factionId: 'wildroot', cards: [
    { cardId: 'sprout-tender', count: 2 }, { cardId: 'barkhide-guard', count: 2 }, { cardId: 'grove-stag', count: 2 }, { cardId: 'mossback-giant', count: 2 }, { cardId: 'canopy-elder', count: 2 }, { cardId: 'sap-mending', count: 2 }, { cardId: 'fertile-rain', count: 2 }, { cardId: 'rootsnare', count: 2 }, { cardId: 'wild-surplus', count: 2 }, { cardId: 'stampede-call', count: 2 },
  ] },
];

export const encounterLadder: EncounterDefinition[] = [
  { id: 'sparring-partner', name: 'Sparring Partner', difficulty: 1, factionId: 'skyforge', deckId: 'skyforge-starter', aiFocus: 'Curves out with creatures first and only uses removal on blockers.', reward: 'Unlock the rules tips overlay.' },
  { id: 'grove-tender', name: 'Grove Tender', difficulty: 2, factionId: 'wildroot', deckId: 'wildroot-starter', aiFocus: 'Prioritizes healing and stabilizing before committing larger creatures.', reward: 'Unlock the full card gallery.' },
  { id: 'vanguard-captain', name: 'Vanguard Captain', difficulty: 3, factionId: 'skyforge', deckId: 'skyforge-starter', aiFocus: 'Uses buffs aggressively and looks for lethal with direct damage.', reward: 'Unlock rematch shortcuts.' },
  { id: 'canopy-elder', name: 'Canopy Elder', difficulty: 4, factionId: 'wildroot', deckId: 'wildroot-starter', aiFocus: 'Mulligans for ramp, then tries to stick one giant threat at a time.', reward: 'Clear the ladder and finish the campaign.' },
];
