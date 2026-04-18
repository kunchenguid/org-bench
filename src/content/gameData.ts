export type FactionId = 'ember' | 'tide'

export type CardType = 'creature' | 'spell'

export interface Faction {
  id: FactionId
  name: string
  style: string
}

export interface CardDefinition {
  id: string
  name: string
  faction: FactionId
  type: CardType
  cost: number
  text: string
  attack?: number
  health?: number
}

export interface DeckDefinition {
  id: string
  name: string
  cards: string[]
}

export interface EncounterDefinition {
  id: string
  name: string
  summary: string
  deck: DeckDefinition
}

export const factions: Faction[] = [
  {
    id: 'ember',
    name: 'Ember Covenant',
    style: 'Aggressive creatures backed by burst damage.'
  },
  {
    id: 'tide',
    name: 'Tide Circle',
    style: 'Patient board control and resilient spellcraft.'
  }
]

export const uniqueCards: CardDefinition[] = [
  {
    id: 'cinder-scout',
    name: 'Cinder Scout',
    faction: 'ember',
    type: 'creature',
    cost: 1,
    attack: 2,
    health: 1,
    text: 'Charge. Strike creatures the turn this enters play.'
  },
  {
    id: 'forge-guard',
    name: 'Forge Guard',
    faction: 'ember',
    type: 'creature',
    cost: 2,
    attack: 2,
    health: 3,
    text: 'Guard. A steady frontline for ember-aligned decks.'
  },
  {
    id: 'slag-giant',
    name: 'Slag Giant',
    faction: 'ember',
    type: 'creature',
    cost: 5,
    attack: 5,
    health: 5,
    text: 'A top-end finisher that closes games fast.'
  },
  {
    id: 'ember-surge',
    name: 'Ember Surge',
    faction: 'ember',
    type: 'spell',
    cost: 2,
    text: 'Deal 3 damage to any target.'
  },
  {
    id: 'volcanic-answer',
    name: 'Volcanic Answer',
    faction: 'ember',
    type: 'spell',
    cost: 3,
    text: 'Destroy a damaged creature.'
  },
  {
    id: 'phoenix-banner',
    name: 'Phoenix Banner',
    faction: 'ember',
    type: 'spell',
    cost: 4,
    text: 'Creatures you control get +1 attack this turn.'
  },
  {
    id: 'mist-scribe',
    name: 'Mist Scribe',
    faction: 'tide',
    type: 'creature',
    cost: 1,
    attack: 1,
    health: 2,
    text: 'Draw smoothing for slower tide turns.'
  },
  {
    id: 'reef-sentinel',
    name: 'Reef Sentinel',
    faction: 'tide',
    type: 'creature',
    cost: 2,
    attack: 1,
    health: 4,
    text: 'A sturdy blocker for the slower tide game plan.'
  },
  {
    id: 'undertow-mage',
    name: 'Undertow Mage',
    faction: 'tide',
    type: 'creature',
    cost: 3,
    attack: 3,
    health: 3,
    text: 'Turns your next spell into a tempo swing.'
  },
  {
    id: 'sea-titan',
    name: 'Sea Titan',
    faction: 'tide',
    type: 'creature',
    cost: 5,
    attack: 4,
    health: 6,
    text: 'An anchor threat that stabilizes contested boards.'
  },
  {
    id: 'tidal-reset',
    name: 'Tidal Reset',
    faction: 'tide',
    type: 'spell',
    cost: 2,
    text: 'Return a creature to its owner\'s hand.'
  },
  {
    id: 'glass-current',
    name: 'Glass Current',
    faction: 'tide',
    type: 'spell',
    cost: 3,
    text: 'Freeze an enemy creature for one turn.'
  }
]

export const starterDeck: DeckDefinition = {
  id: 'dual-discipline-starter',
  name: 'Dual Discipline Starter',
  cards: expandDeck([
    { cardId: 'cinder-scout', quantity: 2 },
    { cardId: 'forge-guard', quantity: 2 },
    { cardId: 'slag-giant', quantity: 1 },
    { cardId: 'ember-surge', quantity: 2 },
    { cardId: 'volcanic-answer', quantity: 2 },
    { cardId: 'phoenix-banner', quantity: 1 },
    { cardId: 'mist-scribe', quantity: 2 },
    { cardId: 'reef-sentinel', quantity: 2 },
    { cardId: 'undertow-mage', quantity: 2 },
    { cardId: 'sea-titan', quantity: 1 },
    { cardId: 'tidal-reset', quantity: 2 },
    { cardId: 'glass-current', quantity: 1 }
  ])
}

function expandDeck(entries: Array<{ cardId: string; quantity: number }>): string[] {
  return entries.flatMap((entry) => Array.from({ length: entry.quantity }, () => entry.cardId))
}

function createEncounterDeck(
  id: string,
  name: string,
  cards: Array<{ cardId: string; quantity: number }>
): DeckDefinition {
  return { id, name, cards: expandDeck(cards) }
}

export const encounters: EncounterDefinition[] = [
  {
    id: 'ashen-adept',
    name: 'Ashen Adept',
    summary: 'Teaches creature combat and direct-damage pressure.',
    deck: createEncounterDeck('ashen-adept-deck', 'Ashen Adept Deck', [
      { cardId: 'cinder-scout', quantity: 4 },
      { cardId: 'forge-guard', quantity: 4 },
      { cardId: 'ember-surge', quantity: 4 },
      { cardId: 'volcanic-answer', quantity: 4 },
      { cardId: 'slag-giant', quantity: 2 },
      { cardId: 'phoenix-banner', quantity: 2 }
    ])
  },
  {
    id: 'mirror-warden',
    name: 'Mirror Warden',
    summary: 'Adds bounce, stall, and careful resource pacing.',
    deck: createEncounterDeck('mirror-warden-deck', 'Mirror Warden Deck', [
      { cardId: 'mist-scribe', quantity: 4 },
      { cardId: 'reef-sentinel', quantity: 4 },
      { cardId: 'undertow-mage', quantity: 3 },
      { cardId: 'tidal-reset', quantity: 4 },
      { cardId: 'glass-current', quantity: 3 },
      { cardId: 'sea-titan', quantity: 2 }
    ])
  },
  {
    id: 'cinder-tyrant',
    name: 'Cinder Tyrant',
    summary: 'Mixes both factions into a tougher final AI ladder deck.',
    deck: createEncounterDeck('cinder-tyrant-deck', 'Cinder Tyrant Deck', [
      { cardId: 'cinder-scout', quantity: 2 },
      { cardId: 'forge-guard', quantity: 3 },
      { cardId: 'slag-giant', quantity: 2 },
      { cardId: 'ember-surge', quantity: 2 },
      { cardId: 'mist-scribe', quantity: 2 },
      { cardId: 'reef-sentinel', quantity: 3 },
      { cardId: 'undertow-mage', quantity: 2 },
      { cardId: 'sea-titan', quantity: 2 },
      { cardId: 'tidal-reset', quantity: 1 },
      { cardId: 'phoenix-banner', quantity: 1 }
    ])
  }
]

export const keywordGlossary = [
  {
    keyword: 'Guard',
    text: 'Enemies must clear this defender before attacking the hero.'
  },
  {
    keyword: 'Charge',
    text: 'A creature can attack on the turn it enters play.'
  },
  {
    keyword: 'Freeze',
    text: 'A frozen creature cannot attack during its next combat step.'
  }
]

export function getStorageKey(namespace: string, key: string): string {
  return `${namespace}:${key}`
}
