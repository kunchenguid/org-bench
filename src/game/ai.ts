import { getUnitCard } from './cards';
import type { EncounterPlayerState } from './engine';

export function chooseAiHandIndex(player: EncounterPlayerState): number {
  let bestIndex = -1;

  for (const [index, cardId] of player.hand.entries()) {
    const card = getUnitCard(cardId);
    if (!card) {
      continue;
    }
    if (card.cost > player.mana) {
      continue;
    }

    if (bestIndex === -1) {
      bestIndex = index;
      continue;
    }

    const bestCard = getUnitCard(player.hand[bestIndex]);
    if (!bestCard) {
      bestIndex = index;
      continue;
    }
    if (card.cost > bestCard.cost || (card.cost === bestCard.cost && card.attack > bestCard.attack)) {
      bestIndex = index;
    }
  }

  return bestIndex;
}
