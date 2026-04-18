import type { CardFrameProps } from './CardFrame';

export const showcaseCards: CardFrameProps[] = [
  {
    faction: 'ember',
    title: 'Cinder Archivist',
    cost: 3,
    kind: 'Spellwright',
    attack: 4,
    health: 2,
    rules: 'When played, deal 1 ember damage to each opposing unit.',
  },
  {
    faction: 'verdant',
    title: 'Rootwhisper Keeper',
    cost: 2,
    kind: 'Warden',
    attack: 1,
    health: 5,
    rules: 'At end of turn, restore 1 health to your champion.',
  },
];
