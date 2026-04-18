import { decks, encounterLadder } from '../game-data';

export function buildPlayBoardReference() {
  const playerDeck = decks[0];
  const encounter = encounterLadder[0];
  const variant = encounter.variants[1];
  const enemyDeck = decks.find((deck) => deck.id === variant.enemyDeckId) ?? decks[1];

  return {
    battlefieldLabel: `${playerDeck.name} vs ${enemyDeck.name}`,
    encounterTitle: encounter.title,
    encounterVariantName: variant.name,
    enemyDeckCount: `${enemyDeck.list.reduce((total, entry) => total + entry.count, 0)}-card deck`,
    enemyDeckName: enemyDeck.name,
    playerDeckCount: `${playerDeck.list.reduce((total, entry) => total + entry.count, 0)}-card deck`,
    playerDeckName: playerDeck.name,
  };
}
