import { cardLibrary, keywordGlossary as sharedKeywords } from './card-data';

export type CardEntry = {
  id: string;
  name: string;
  type: 'Creature' | 'Spell';
  cost: number;
  stats: string;
  text: string;
  keywords: string[];
};

export type CardGroup = {
  id: string;
  title: string;
  description: string;
  cards: CardEntry[];
};

export type KeywordEntry = {
  keyword: string;
  explanation: string;
};

export const cardGroups: CardGroup[] = [
  {
    id: 'ember',
    title: 'Ember Vanguard',
    description: 'Aggressive fire-aligned cards built to pressure life totals and finish games quickly.',
    cards: cardLibrary
      .filter((card) => card.faction === 'ember')
      .map((card) => ({
        id: card.id,
        name: card.name,
        type: card.kind === 'creature' ? 'Creature' : 'Spell',
        cost: card.cost,
        stats: card.kind === 'creature' ? `${card.attack}/${card.health}` : 'Spell',
        text: card.text,
        keywords: card.keywords.map((keyword) => keyword.toUpperCase()),
      })),
  },
  {
    id: 'tide',
    title: 'Tide Anchor',
    description: 'Control-oriented water cards focused on shields, tempo swings, and patient board play.',
    cards: cardLibrary
      .filter((card) => card.faction === 'tide')
      .map((card) => ({
        id: card.id,
        name: card.name,
        type: card.kind === 'creature' ? 'Creature' : 'Spell',
        cost: card.cost,
        stats: card.kind === 'creature' ? `${card.attack}/${card.health}` : 'Spell',
        text: card.text,
        keywords: card.keywords.map((keyword) => keyword.toUpperCase()),
      })),
  },
];

export const keywordGlossary: KeywordEntry[] = sharedKeywords.map((entry) => ({
  keyword: entry.name,
  explanation: entry.reminderText,
}));
