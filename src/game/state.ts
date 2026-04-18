import {
  encounters,
  getStorageKey,
  starterDeck,
  uniqueCards,
  type CardDefinition,
  type EncounterDefinition
} from '../content/gameData'

export type DuelPhase = 'draw' | 'main' | 'combat' | 'end'

export interface ResourceState {
  current: number
  max: number
}

export interface CardInstance extends CardDefinition {
  cardId: string
  instanceId: string
  ownerId: string
}

export interface CombatantState {
  id: string
  health: number
  resources: ResourceState
  deck: CardInstance[]
  hand: CardInstance[]
  battlefield: CardInstance[]
  discard: CardInstance[]
}

export interface CampaignState {
  storageKey: string
  namespace: string
  currentEncounterId: string
  remainingEncounterIds: string[]
  completedEncounterIds: string[]
}

export interface DuelState {
  storageKey: string
  encounterId: string
  activePlayerId: string
  turnNumber: number
  phase: DuelPhase
  player: CombatantState
  opponent: CombatantState
}

const STARTING_HEALTH = 20
const STARTING_HAND_SIZE = 4

const cardsById = new Map(uniqueCards.map((card) => [card.id, card]))

export function createCampaignState(namespace: string): CampaignState {
  const [currentEncounter, ...remainingEncounters] = encounters

  return {
    storageKey: getStorageKey(namespace, 'campaign'),
    namespace,
    currentEncounterId: currentEncounter.id,
    remainingEncounterIds: remainingEncounters.map((encounter) => encounter.id),
    completedEncounterIds: []
  }
}

export function createDuelState(namespace: string, encounterId: string): DuelState {
  const encounter = getEncounter(encounterId)
  const player = createCombatant('player', starterDeck.cards, { current: 1, max: 1 })
  const opponent = createCombatant(encounter.id, encounter.deck.cards, { current: 0, max: 0 })

  return {
    storageKey: getStorageKey(namespace, `duel:${encounter.id}`),
    encounterId: encounter.id,
    activePlayerId: player.id,
    turnNumber: 1,
    phase: 'draw',
    player,
    opponent
  }
}

function createCombatant(
  ownerId: string,
  cardIds: string[],
  resources: ResourceState
): CombatantState {
  const fullDeck = cardIds.map((cardId, index) => createCardInstance(cardId, ownerId, index))

  return {
    id: ownerId,
    health: STARTING_HEALTH,
    resources,
    hand: fullDeck.slice(0, STARTING_HAND_SIZE),
    deck: fullDeck.slice(STARTING_HAND_SIZE),
    battlefield: [],
    discard: []
  }
}

function createCardInstance(cardId: string, ownerId: string, index: number): CardInstance {
  const definition = cardsById.get(cardId)

  if (!definition) {
    throw new Error(`Unknown card id: ${cardId}`)
  }

  return {
    ...definition,
    cardId,
    instanceId: `${ownerId}-${cardId}-${index + 1}`,
    ownerId
  }
}

function getEncounter(encounterId: string): EncounterDefinition {
  const encounter = encounters.find((entry) => entry.id === encounterId)

  if (!encounter) {
    throw new Error(`Unknown encounter id: ${encounterId}`)
  }

  return encounter
}
