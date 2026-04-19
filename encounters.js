const ENCOUNTERS = {
  lunara: {
    name: 'Lunara Grove',
    description: 'Nature spells and beast minions',
    hero: {
      name: 'Lunara',
      health: 30,
      mana: 0,
      maxMana: 10,
      portrait: 'lunara'
    },
    deck: [
      { id: 'wild_growth', name: 'Wild Growth', cost: 2, type: 'spell', effect: 'gain 2 mana this turn' },
      { id: 'bear', name: 'Forest Bear', cost: 3, attack: 3, health: 4, type: 'minion' },
      { id: 'heal', name: 'Moonlight', cost: 2, type: 'spell', effect: 'heal 3 damage' },
      { id: 'wolf', name: 'Timber Wolf', cost: 2, attack: 2, health: 2, type: 'minion' },
      { id: 'mark', name: 'Mark of the Wild', cost: 1, type: 'spell', effect: 'target minion +1/+1' },
      { id: 'snake', name: 'Viper', cost: 1, attack: 1, health: 1, type: 'minion', effect: 'poison' },
      { id: 'swarm', name: 'Insect Swarm', cost: 3, type: 'spell', effect: 'deal 2 damage to all enemy minions' },
      { id: 'treant', name: 'Treant', cost: 4, attack: 3, health: 5, type: 'minion', effect: 'taunt' },
      { id: 'root', name: 'Entangling Roots', cost: 2, type: 'spell', effect: 'target minion cannot attack' },
      { id: 'sprint', name: 'Nature\'s Grace', cost: 1, type: 'spell', effect: 'draw a card' }
    ],
    specialRules: {
      heroPower: 'Sapling: Summon a 1/1 Treant (cost 2 mana)',
      startingHand: 3
    }
  },
  solaris: {
    name: 'Solaris Citadel',
    description: 'High-attack aggressive minions',
    hero: {
      name: 'Solaris',
      health: 25,
      mana: 0,
      maxMana: 10,
      portrait: 'solaris'
    },
    deck: [
      { id: 'knight', name: 'Sun Knight', cost: 3, attack: 4, health: 2, type: 'minion' },
      { id: 'strike', name: 'Solar Strike', cost: 2, type: 'spell', effect: 'deal 3 damage' },
      { id: 'paladin', name: 'Dawn Paladin', cost: 4, attack: 3, health: 5, type: 'minion', effect: 'divine_shield' },
      { id: 'raider', name: 'Sun Raider', cost: 2, attack: 3, health: 1, type: 'minion' },
      { id: 'smite', name: 'Solar Smite', cost: 1, type: 'spell', effect: 'deal 2 damage to enemy minion' },
      { id: 'guardian', name: 'Sun Guardian', cost: 5, attack: 4, health: 6, type: 'minion', effect: 'taunt' },
      { id: 'rage', name: 'Solar Rage', cost: 3, type: 'spell', effect: 'all friendly minions +2 attack' },
      { id: 'charger', name: 'Light Charger', cost: 3, attack: 5, health: 1, type: 'minion', effect: 'charge' },
      { id: 'immolate', name: 'Solar Immolate', cost: 4, type: 'spell', effect: 'deal 2 damage to all enemies' },
      { id: 'champion', name: 'Solar Champion', cost: 6, attack: 7, health: 7, type: 'minion', effect: 'charge' }
    ],
    specialRules: {
      heroPower: 'Solar Flare: Deal 2 damage (cost 1 mana)',
      startingHand: 4
    }
  }
};

function getEncounter(encounterId) {
  return ENCOUNTERS[encounterId] || null;
}

function getEncounterIds() {
  return Object.keys(ENCOUNTERS);
}
