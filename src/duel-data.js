(function () {
  const CARD_LIBRARY = {
    'sun-scout': {
      id: 'sun-scout',
      name: 'Sun Scout',
      faction: 'Solari',
      type: 'unit',
      cost: 1,
      attack: 1,
      health: 2,
      keywords: [],
      text: 'A steady opener that claims the board early.',
    },
    'sun-charge-knight': {
      id: 'sun-charge-knight',
      name: 'Dawn Charger',
      faction: 'Solari',
      type: 'unit',
      cost: 2,
      attack: 3,
      health: 2,
      keywords: ['charge'],
      text: 'Charge',
    },
    'sun-banner-mage': {
      id: 'sun-banner-mage',
      name: 'Banner Mage',
      faction: 'Solari',
      type: 'unit',
      cost: 3,
      attack: 2,
      health: 3,
      keywords: ['inspire'],
      text: 'Inspire - Your other units gain +1 attack this turn.',
      onPlay: { buffAlliesAttack: 1 },
    },
    'sun-warden': {
      id: 'sun-warden',
      name: 'Sun Warden',
      faction: 'Solari',
      type: 'unit',
      cost: 3,
      attack: 2,
      health: 4,
      keywords: ['guard'],
      text: 'Guard',
    },
    'sun-spark': {
      id: 'sun-spark',
      name: 'Solar Spark',
      faction: 'Solari',
      type: 'spell',
      cost: 1,
      keywords: ['spell'],
      text: 'Deal 2 damage to the enemy hero.',
      onPlay: { dealHeroDamage: 2 },
    },
    'moon-raider': {
      id: 'moon-raider',
      name: 'Moon Raider',
      faction: 'Umbral',
      type: 'unit',
      cost: 1,
      attack: 2,
      health: 1,
      keywords: [],
      text: 'A fragile threat that races life totals.',
    },
    'moon-guard': {
      id: 'moon-guard',
      name: 'Moon Guard',
      faction: 'Umbral',
      type: 'unit',
      cost: 2,
      attack: 1,
      health: 4,
      keywords: ['guard'],
      text: 'Guard',
    },
    'moon-hexmage': {
      id: 'moon-hexmage',
      name: 'Hexmage',
      faction: 'Umbral',
      type: 'unit',
      cost: 3,
      attack: 3,
      health: 2,
      keywords: ['ambush'],
      text: 'On play: Deal 1 damage to an enemy unit if one exists.',
      onPlay: { dealUnitDamage: 1 },
    },
    'moon-bat': {
      id: 'moon-bat',
      name: 'Night Bat',
      faction: 'Umbral',
      type: 'unit',
      cost: 2,
      attack: 1,
      health: 2,
      keywords: ['drain'],
      text: 'Drain - When this damages a hero, restore that much health to yours.',
    },
    'moon-ritual': {
      id: 'moon-ritual',
      name: 'Moon Ritual',
      faction: 'Umbral',
      type: 'spell',
      cost: 2,
      keywords: ['spell'],
      text: 'Draw 2 cards.',
      onPlay: { drawCards: 2 },
    },
  };

  const STARTER_DECKS = {
    player: [
      'sun-scout', 'sun-scout', 'sun-scout', 'sun-scout',
      'sun-charge-knight', 'sun-charge-knight', 'sun-charge-knight', 'sun-charge-knight',
      'sun-banner-mage', 'sun-banner-mage', 'sun-banner-mage', 'sun-banner-mage',
      'sun-warden', 'sun-warden', 'sun-warden', 'sun-warden',
      'sun-spark', 'sun-spark', 'sun-spark', 'sun-spark',
    ],
    ai: [
      'moon-raider', 'moon-raider', 'moon-raider', 'moon-raider',
      'moon-guard', 'moon-guard', 'moon-guard', 'moon-guard',
      'moon-hexmage', 'moon-hexmage', 'moon-hexmage', 'moon-hexmage',
      'moon-bat', 'moon-bat', 'moon-bat', 'moon-bat',
      'moon-ritual', 'moon-ritual', 'moon-ritual', 'moon-ritual',
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getCardDefinition(cardId) {
    const definition = CARD_LIBRARY[cardId];
    if (!definition) {
      throw new Error(`Unknown card: ${cardId}`);
    }

    return clone(definition);
  }

  function createStarterDecks() {
    return clone(STARTER_DECKS);
  }

  const api = {
    CARD_LIBRARY,
    createStarterDecks,
    getCardDefinition,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.DuelData = api;
})();
