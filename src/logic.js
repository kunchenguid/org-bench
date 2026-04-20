(function (global) {
  'use strict';

  var FACTIONS = [
    {
      id: 'solforged',
      name: 'Solforged Armada',
      theme: 'Sunlit skyfleet that wins with tempo, bursts of flame, and disciplined formations.',
    },
    {
      id: 'gloomwild',
      name: 'Gloomwild Circle',
      theme: 'Moonlit marsh coven that grows sticky boards, drains life, and overwhelms late.',
    },
  ];

  var MECHANICS = [
    { id: 'ambush', label: 'Ambush', text: 'This unit can attack on the turn it is played.' },
    { id: 'guard', label: 'Guard', text: 'Sticky frontliner that buys time.' },
    { id: 'scorch', label: 'Scorch', text: 'Deals direct damage when cast or deployed.' },
    { id: 'bloom', label: 'Bloom', text: 'Gains extra stats when joining another ally.' },
    { id: 'drain', label: 'Drain', text: 'Heals its controller when it hits the rival hero.' },
  ];

  var CARD_LIBRARY = [
    { id: 'cinder-scout', name: 'Cinder Scout', faction: 'solforged', type: 'unit', attack: 2, health: 1, maxHealth: 1, cost: 1, keywords: ['ambush'], rulesText: 'Ambush.' },
    { id: 'sunlance-squire', name: 'Sunlance Squire', faction: 'solforged', type: 'unit', attack: 2, health: 2, maxHealth: 2, cost: 2, keywords: [], rulesText: 'Efficient skyknight for the opening turns.' },
    { id: 'deckgun-marine', name: 'Deckgun Marine', faction: 'solforged', type: 'unit', attack: 3, health: 2, maxHealth: 2, cost: 3, keywords: ['scorch'], scorch: 1, rulesText: 'Scorch 1 on deploy.' },
    { id: 'aurora-standard', name: 'Aurora Standard', faction: 'solforged', type: 'unit', attack: 2, health: 4, maxHealth: 4, cost: 3, keywords: ['guard'], rulesText: 'Guard.' },
    { id: 'flare-javelin', name: 'Flare Javelin', faction: 'solforged', type: 'spell', cost: 2, damage: 2, keywords: ['scorch'], rulesText: 'Scorch 2 to the rival hero.' },
    { id: 'dawn-caravel', name: 'Dawn Caravel', faction: 'solforged', type: 'unit', attack: 4, health: 3, maxHealth: 3, cost: 4, keywords: [], rulesText: 'Heavy midgame pressure.' },
    { id: 'bog-wisp', name: 'Bog Wisp', faction: 'gloomwild', type: 'unit', attack: 1, health: 2, maxHealth: 2, cost: 1, keywords: ['bloom'], rulesText: 'Bloom: enters as 2/3 if you already control a unit.' },
    { id: 'reed-stalker', name: 'Reed Stalker', faction: 'gloomwild', type: 'unit', attack: 2, health: 3, maxHealth: 3, cost: 2, keywords: ['guard'], rulesText: 'Guard.' },
    { id: 'mire-bloom', name: 'Mire Bloom', faction: 'gloomwild', type: 'unit', attack: 3, health: 3, maxHealth: 3, cost: 3, keywords: ['bloom'], rulesText: 'Bloom: enters as 4/4 if you already control a unit.' },
    { id: 'hollow-leech', name: 'Hollow Leech', faction: 'gloomwild', type: 'unit', attack: 2, health: 4, maxHealth: 4, cost: 3, keywords: ['drain'], rulesText: 'Drain.' },
    { id: 'night-pollen', name: 'Night Pollen', faction: 'gloomwild', type: 'spell', cost: 2, damage: 1, heal: 1, keywords: ['drain'], rulesText: 'Deal 1 and heal 1.' },
    { id: 'eclipse-hydra', name: 'Eclipse Hydra', faction: 'gloomwild', type: 'unit', attack: 5, health: 5, maxHealth: 5, cost: 5, keywords: [], rulesText: 'Late-game marsh finisher.' },
  ];

  var CARD_BY_ID = Object.create(null);
  CARD_LIBRARY.forEach(function (card) {
    CARD_BY_ID[card.id] = card;
  });

  var ENCOUNTER_PROFILES = [
    {
      id: 'sun-surge-vanguard',
      name: 'Sun Surge Vanguard',
      enemyFaction: 'solforged',
      enemyStyle: 'rush',
      playerFaction: 'gloomwild',
      enemyDeck: ['cinder-scout', 'cinder-scout', 'cinder-scout', 'cinder-scout', 'sunlance-squire', 'sunlance-squire', 'deckgun-marine', 'deckgun-marine', 'aurora-standard', 'aurora-standard', 'flare-javelin', 'flare-javelin', 'dawn-caravel', 'dawn-caravel', 'sunlance-squire', 'sunlance-squire', 'deckgun-marine', 'flare-javelin', 'aurora-standard', 'dawn-caravel'],
      playerDeck: ['bog-wisp', 'bog-wisp', 'bog-wisp', 'reed-stalker', 'reed-stalker', 'mire-bloom', 'mire-bloom', 'hollow-leech', 'hollow-leech', 'night-pollen', 'night-pollen', 'eclipse-hydra', 'bog-wisp', 'reed-stalker', 'mire-bloom', 'hollow-leech', 'night-pollen', 'eclipse-hydra', 'reed-stalker', 'mire-bloom'],
    },
    {
      id: 'marsh-whisper-brood',
      name: 'Marsh Whisper Brood',
      enemyFaction: 'gloomwild',
      enemyStyle: 'swarm-drain',
      playerFaction: 'solforged',
      enemyDeck: ['bog-wisp', 'bog-wisp', 'bog-wisp', 'bog-wisp', 'reed-stalker', 'reed-stalker', 'mire-bloom', 'mire-bloom', 'hollow-leech', 'hollow-leech', 'night-pollen', 'night-pollen', 'eclipse-hydra', 'reed-stalker', 'mire-bloom', 'hollow-leech', 'night-pollen', 'bog-wisp', 'mire-bloom', 'eclipse-hydra'],
      playerDeck: ['cinder-scout', 'cinder-scout', 'sunlance-squire', 'sunlance-squire', 'deckgun-marine', 'deckgun-marine', 'aurora-standard', 'aurora-standard', 'flare-javelin', 'flare-javelin', 'dawn-caravel', 'dawn-caravel', 'cinder-scout', 'sunlance-squire', 'deckgun-marine', 'aurora-standard', 'flare-javelin', 'dawn-caravel', 'sunlance-squire', 'deckgun-marine'],
    },
    {
      id: 'eclipse-siege',
      name: 'Eclipse Siege',
      enemyFaction: 'gloomwild',
      enemyStyle: 'midrange-drain',
      playerFaction: 'solforged',
      enemyDeck: ['reed-stalker', 'reed-stalker', 'mire-bloom', 'mire-bloom', 'hollow-leech', 'hollow-leech', 'night-pollen', 'night-pollen', 'eclipse-hydra', 'eclipse-hydra', 'bog-wisp', 'bog-wisp', 'reed-stalker', 'mire-bloom', 'hollow-leech', 'night-pollen', 'eclipse-hydra', 'bog-wisp', 'mire-bloom', 'hollow-leech'],
      playerDeck: ['cinder-scout', 'cinder-scout', 'cinder-scout', 'sunlance-squire', 'sunlance-squire', 'deckgun-marine', 'deckgun-marine', 'flare-javelin', 'flare-javelin', 'dawn-caravel', 'dawn-caravel', 'aurora-standard', 'aurora-standard', 'cinder-scout', 'sunlance-squire', 'deckgun-marine', 'flare-javelin', 'dawn-caravel', 'aurora-standard', 'deckgun-marine'],
    },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hydrateCard(cardId) {
    return clone(CARD_BY_ID[cardId]);
  }

  function createDeckFromList(list) {
    return list.map(function (cardId) {
      return hydrateCard(cardId);
    });
  }

  function drawCard(side) {
    if (side.deck.length) {
      side.hand.push(side.deck.shift());
    }
  }

  function createStorageKey(namespace, key) {
    return String(namespace) + ':' + key;
  }

  function getEncounterProfile(seed) {
    var numericSeed = Number(seed || 0);
    var index = Math.abs(numericSeed) % ENCOUNTER_PROFILES.length;
    return ENCOUNTER_PROFILES[index];
  }

  function createSide(deckList, mana) {
    return {
      health: 20,
      mana: mana,
      maxMana: mana,
      hand: [],
      deck: createDeckFromList(deckList),
      board: [null, null, null],
    };
  }

  function createInitialState(options) {
    var settings = options || {};
    var encounter = getEncounterProfile(settings.seed);
    var player = createSide(encounter.playerDeck, 1);
    var enemy = createSide(encounter.enemyDeck, 0);

    drawCard(player);
    drawCard(player);
    drawCard(player);
    drawCard(enemy);
    drawCard(enemy);
    drawCard(enemy);

    return {
      turn: 'player',
      player: player,
      enemy: enemy,
      winner: null,
      encounter: {
        name: encounter.name,
        enemyDeckName: encounter.name,
        enemyStyle: encounter.enemyStyle,
        playerFaction: encounter.playerFaction,
        enemyFaction: encounter.enemyFaction,
      },
      log: ['The duel begins against ' + encounter.name + '.'],
    };
  }

  function summonUnit(card, actor) {
    var unit = {
      id: card.id,
      name: card.name,
      faction: card.faction,
      type: card.type,
      attack: card.attack,
      health: card.health,
      maxHealth: card.maxHealth,
      cost: card.cost,
      keywords: clone(card.keywords || []),
      exhausted: !(card.keywords || []).includes('ambush'),
    };

    var occupiedLane = actor.board.some(function (entry) {
      return !!entry;
    });

    if ((card.keywords || []).includes('bloom') && occupiedLane) {
      unit.attack += 1;
      unit.health += 1;
      unit.maxHealth += 1;
    }

    return unit;
  }

  function playSpell(next, side, actor, defenderSide, card) {
    var damage = Number(card.damage || 0);
    var heal = Number(card.heal || 0);
    if (damage) {
      defenderSide.health -= damage;
    }
    if (heal) {
      actor.health = Math.min(20, actor.health + heal);
    }
    next.log.push((side === 'player' ? 'You cast ' : 'Enemy cast ') + card.name + '.');
    if (defenderSide.health <= 0) {
      next.winner = side;
    }
  }

  function playCard(state, side, handIndex, laneIndex) {
    var next = clone(state);
    var actor = next[side];
    var defenderSide = next[side === 'player' ? 'enemy' : 'player'];
    var card = actor.hand[handIndex];
    if (!card || actor.mana < card.cost) {
      return next;
    }

    if (card.type === 'unit') {
      if (laneIndex === null || laneIndex === undefined || actor.board[laneIndex]) {
        return next;
      }
      actor.board[laneIndex] = summonUnit(card, actor);
      if (card.scorch) {
        defenderSide.health -= card.scorch;
        next.log.push(card.name + ' scorched for ' + card.scorch + '.');
      } else {
        next.log.push((side === 'player' ? 'You played ' : 'Enemy played ') + card.name + '.');
      }
      if (defenderSide.health <= 0) {
        next.winner = side;
      }
    } else {
      playSpell(next, side, actor, defenderSide, card);
    }

    actor.hand.splice(handIndex, 1);
    actor.mana -= card.cost;
    return next;
  }

  function attackWithLane(state, side, laneIndex) {
    var next = clone(state);
    var attackerSide = next[side];
    var defenderSide = next[side === 'player' ? 'enemy' : 'player'];
    var attacker = attackerSide.board[laneIndex];
    if (!attacker || attacker.exhausted) {
      return next;
    }

    var defender = defenderSide.board[laneIndex];
    attacker.exhausted = true;
    if (defender) {
      defender.health -= attacker.attack;
      attacker.health -= defender.attack;
      if (defender.health <= 0) {
        defenderSide.board[laneIndex] = null;
      }
      if (attacker.health <= 0) {
        attackerSide.board[laneIndex] = null;
      }
      next.log.push(attacker.name + ' traded with ' + defender.name + '.');
    } else {
      defenderSide.health -= attacker.attack;
      if ((attacker.keywords || []).includes('drain')) {
        attackerSide.health = Math.min(20, attackerSide.health + attacker.attack);
      }
      next.log.push(attacker.name + ' hit face for ' + attacker.attack + '.');
      if (defenderSide.health <= 0) {
        next.winner = side;
      }
    }
    return next;
  }

  function readyBoard(board) {
    for (var index = 0; index < board.length; index += 1) {
      if (board[index]) {
        board[index].exhausted = false;
      }
    }
  }

  function chooseEnemyPlay(next) {
    var encounter = next.encounter || {};
    var enemyHand = next.enemy.hand;
    var candidates = [];
    for (var index = 0; index < enemyHand.length; index += 1) {
      if (enemyHand[index].cost <= next.enemy.mana) {
        candidates.push({ card: enemyHand[index], index: index });
      }
    }
    if (!candidates.length) {
      return -1;
    }
    if (encounter.enemyStyle === 'rush') {
      candidates.sort(function (a, b) {
        return a.card.cost - b.card.cost || b.card.attack - a.card.attack;
      });
    } else if (encounter.enemyStyle === 'swarm-drain') {
      candidates.sort(function (a, b) {
        return (b.card.keywords || []).length - (a.card.keywords || []).length || a.card.cost - b.card.cost;
      });
    } else {
      candidates.sort(function (a, b) {
        return b.card.cost - a.card.cost || b.card.health - a.card.health;
      });
    }
    return candidates[0].index;
  }

  function endTurn(state) {
    var next = clone(state);
    next.turn = 'enemy';
    next.enemy.maxMana = Math.min(10, next.enemy.maxMana + 1 || 1);
    next.enemy.mana = next.enemy.maxMana;
    drawCard(next.enemy);

    for (var lane = 0; lane < next.enemy.board.length; lane += 1) {
      var unit = next.enemy.board[lane];
      if (unit && unit.exhausted === false) {
        next.player.health -= unit.attack;
        if ((unit.keywords || []).includes('drain')) {
          next.enemy.health = Math.min(20, next.enemy.health + unit.attack);
        }
        if (next.player.health <= 0) {
          next.winner = 'enemy';
        }
      }
    }

    var playableIndex = chooseEnemyPlay(next);
    var openLane = next.enemy.board.findIndex(function (unit) {
      return unit === null;
    });
    if (playableIndex !== -1) {
      var card = next.enemy.hand[playableIndex];
      if (card.type === 'spell') {
        next = playCard(next, 'enemy', playableIndex, null);
      } else if (openLane !== -1) {
        next = playCard(next, 'enemy', playableIndex, openLane);
      }
    }

    next.turn = 'player';
    next.player.maxMana = Math.min(10, next.player.maxMana + 1);
    next.player.mana = next.player.maxMana;
    drawCard(next.player);
    readyBoard(next.player.board);
    return next;
  }

  var api = {
    FACTIONS: FACTIONS,
    MECHANICS: MECHANICS,
    CARD_LIBRARY: CARD_LIBRARY,
    ENCOUNTER_PROFILES: ENCOUNTER_PROFILES,
    createInitialState: createInitialState,
    createStorageKey: createStorageKey,
    playCard: playCard,
    attackWithLane: attackWithLane,
    endTurn: endTurn,
  };

  global.DuelLogic = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
