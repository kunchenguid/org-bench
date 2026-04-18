export type FactionId = 'emberfire' | 'aether';

export type Faction = {
  id: FactionId;
  name: string;
  epithet: string;
  identity: string;
};

export type Card = {
  id: string;
  name: string;
  faction: FactionId;
  type: 'Unit' | 'Spell' | 'Relic';
  cost: number;
  stats?: string;
  rulesText: string;
  artLabel: string;
};

export const factions: Faction[] = [
  {
    id: 'emberfire',
    name: 'Emberfire Syndicate',
    epithet: 'Pressure through scorch marks, hasty units, and damage that keeps stacking.',
    identity: 'Emberfire closes games quickly by turning every spark into immediate tempo.'
  },
  {
    id: 'aether',
    name: 'Aether Covenant',
    epithet: 'Shielded engines, precision timing, and battlefield control from above.',
    identity: 'Aether wins by buying time, redirecting pressure, and extracting value from positioning.'
  }
];

export const cardPool: Card[] = [
  {
    id: 'ashmarked-scout',
    name: 'Ashmarked Scout',
    faction: 'emberfire',
    type: 'Unit',
    cost: 1,
    stats: '2/1',
    rulesText: 'Rush. When this hits the opposing champion, deal 1 extra ember damage.',
    artLabel: 'A masked runner vaulting through smoke with a glowing blade.'
  },
  {
    id: 'cinder-tactician',
    name: 'Cinder Tactician',
    faction: 'emberfire',
    type: 'Unit',
    cost: 3,
    stats: '3/3',
    rulesText: 'Your next spell this turn costs 1 less and scorches a nearby enemy.',
    artLabel: 'A battlefield captain sketching attack lines in falling ash.'
  },
  {
    id: 'furnace-volley',
    name: 'Furnace Volley',
    faction: 'emberfire',
    type: 'Spell',
    cost: 2,
    rulesText: 'Deal 3 damage to a unit. If it was already damaged, deal 5 instead.',
    artLabel: 'Twin firebolts crossing over a shattered brass shield.'
  },
  {
    id: 'ward-current',
    name: 'Ward Current',
    faction: 'aether',
    type: 'Spell',
    cost: 1,
    rulesText: 'Give a unit barrier until your next turn. Draw a card if it stays intact.',
    artLabel: 'Blue current wrapping around a duelist in a circular shield.'
  },
  {
    id: 'sky-archive-lens',
    name: 'Sky Archive Lens',
    faction: 'aether',
    type: 'Relic',
    cost: 2,
    rulesText: 'At end of turn, forecast your top card. If it is a spell, discount it by 1.',
    artLabel: 'A floating crystal lens projecting diagrams into a night sky.'
  },
  {
    id: 'zephyr-scribe',
    name: 'Zephyr Scribe',
    faction: 'aether',
    type: 'Unit',
    cost: 3,
    stats: '2/4',
    rulesText: 'When you cast your second spell in a turn, return an enemy attacker to its lane.',
    artLabel: 'A robed scholar writing wind sigils across hovering sheets.'
  }
];

export function getFaction(id: FactionId) {
  return factions.find((faction) => faction.id === id)!;
}
