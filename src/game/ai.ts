import { cards } from './cards';
import type { EncounterPlayerState } from './engine';

export function chooseAiHandIndex(player: EncounterPlayerState): number {
  let bestIndex = -1;

  for (const [index, cardId] of player.hand.entries()) {
    const card = cards[cardId];
    if (card.cost > player.mana) {
      continue;
    }

    if (bestIndex === -1) {
      bestIndex = index;
      continue;
    }

    const bestCard = cards[player.hand[bestIndex]];
    if (card.cost > bestCard.cost || (card.cost === bestCard.cost && card.attack > bestCard.attack)) {
      bestIndex = index;
    }
  }

  return bestIndex;
}
