(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  const api = factory();
  root.FBDuelGameState = api;
  root.FBDuelGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_PREFIX = 'fb-duel-tcg';
  const MAX_BOARD_SIZE = 3;
  const PLAYER_HERO = {
    id: 'lys-heartroot-warden',
    name: 'Lys, Heartroot Warden',
    faction: 'verdant',
    title: 'Heartroot Warden',
    portraitKey: 'lys',
    powerName: 'Heartroot Mend',
    powerText: 'Spend 2 mana to heal a friendly unit for 2.',
  };
  const ENEMY_HERO = {
    id: 'commander-varka',
    name: 'Commander Varka',
    faction: 'ironbound',
    title: 'Legion Commander',
    portraitKey: 'varka',
    powerName: 'Cinder Shot',
    powerText: 'Spend 2 mana to deal 1 damage to a unit.',
  };

  const CARD_LIBRARY = {
    'seedling-scout': {
      name: 'Seedling Scout',
      templateId: 'seedling-scout',
      faction: 'verdant',
      artKey: 'seedlingScout',
      type: 'unit',
      cost: 1,
      attack: 1,
      health: 2,
      keywords: ['grow'],
      rulesText: 'Grow +1/+0 - Gains attack at end of turn if it survived.',
    },
    'thornhide-cub': {
      name: 'Thornhide Cub',
      templateId: 'thornhide-cub',
      faction: 'verdant',
      artKey: 'thornhideCub',
      type: 'unit',
      cost: 2,
      attack: 2,
      health: 3,
      keywords: ['guard'],
      rulesText: 'Guard - Enemies must attack this first.',
    },
    rootsnare: {
      name: 'Rootsnare',
      templateId: 'rootsnare',
      faction: 'verdant',
      artKey: 'rootsnare',
      type: 'spell',
      cost: 2,
      damage: 2,
      rulesText: 'Deal 2 to an already damaged enemy, otherwise deal 1.',
    },
    'ash-recruit': {
      name: 'Ash Recruit',
      templateId: 'ash-recruit',
      faction: 'ironbound',
      artKey: 'ashRecruit',
      type: 'unit',
      cost: 1,
      attack: 2,
      health: 1,
      rulesText: 'A fast attacker from the Legion front line.',
    },
    shieldmate: {
      name: 'Shieldmate',
      templateId: 'shieldmate',
      faction: 'ironbound',
      artKey: 'shieldmate',
      type: 'unit',
      cost: 2,
      attack: 1,
      health: 4,
      keywords: ['guard'],
      rulesText: 'Guard - A plated defender that holds the breach.',
    },
    'ember-volley': {
      name: 'Ember Volley',
      templateId: 'ember-volley',
      faction: 'ironbound',
      artKey: 'emberVolley',
      type: 'spell',
      cost: 3,
      damage: 1,
      rulesText: 'Split burning shrapnel into up to two 1-damage pings.',
    },
  };

  const ENCOUNTER_VARIANTS = [
    {
      id: 'glasshouse-shieldwall',
      name: 'The Breach at Glasshouse Gate',
      enemyBoard: [createCard('shieldmate', 'variant-shieldmate')],
      enemyDeckBias: ['shieldmate', 'ember-volley'],
      modifier: 'Enemy opens behind a Guard unit.',
      lesson: 'Play into an open lane, then break through Guard.',
    },
    {
      id: 'glasshouse-rush',
      name: 'The Breach at Glasshouse Gate',
      enemyBoard: [createCard('ash-recruit', 'variant-ash-recruit')],
      enemyDeckBias: ['ash-recruit', 'ash-recruit'],
      modifier: 'Enemy opens with an exposed attacker.',
      lesson: 'Contest the lane before early damage snowballs.',
    },
    {
      id: 'glasshouse-volley',
      name: 'The Breach at Glasshouse Gate',
      enemyBoard: [createCard('shieldmate', 'variant-volley-shieldmate')],
      enemyDeckBias: ['ember-volley', 'shieldmate'],
      modifier: 'Enemy is more likely to hold a damage spell.',
      lesson: 'Damaged targets are vulnerable to follow-up spells.',
    },
  ];

  function createStorageKey(runNamespace, suffix) {
    return runNamespace + ':' + STORAGE_PREFIX + ':' + suffix;
  }

  function chooseEncounterVariant(seed) {
    const normalizedSeed = String(seed || 'default-seed').toLowerCase();
    if (normalizedSeed.indexOf('shield') !== -1) {
      return clone(ENCOUNTER_VARIANTS[0]);
    }
    if (normalizedSeed.indexOf('rush') !== -1) {
      return clone(ENCOUNTER_VARIANTS[1]);
    }

    const index = hashSeed(seed || 'default-seed') % ENCOUNTER_VARIANTS.length;
    return clone(ENCOUNTER_VARIANTS[index]);
  }

  function createInitialState(options) {
    const config = options || {};
    const encounter = chooseEncounterVariant(config.encounterSeed);

    return {
      turn: 1,
      currentActor: 'player',
      encounter,
      tutorialCue: {
        title: 'Play a unit into an open lane.',
        detail: encounter.lesson + ' ' + encounter.modifier,
      },
      lastEnemyPlan: null,
      player: {
        hero: clone(PLAYER_HERO),
        health: 20,
        maxMana: 1,
        mana: 1,
        deck: [createCard('seedling-scout', 'p-deck-1'), createCard('thornhide-cub', 'p-deck-2'), createCard('rootsnare', 'p-deck-3')],
        hand: [createCard('seedling-scout', 'p-hand-1'), createCard('thornhide-cub', 'p-hand-2'), createCard('rootsnare', 'p-hand-3')],
        board: [],
        discard: [],
      },
      enemy: {
        hero: clone(ENEMY_HERO),
        health: 20,
        maxMana: 0,
        mana: 0,
        deck: buildEnemyDeck(encounter.enemyDeckBias),
        hand: [createCard('ash-recruit', 'e-hand-1'), createCard('shieldmate', 'e-hand-2'), createCard('ember-volley', 'e-hand-3')],
        board: encounter.enemyBoard,
        discard: [],
      },
    };
  }

  function hydrateState(serialized, options) {
    if (!serialized) {
      return createInitialState(options);
    }

    if (typeof serialized === 'string') {
      return JSON.parse(serialized);
    }

    return clone(serialized);
  }

  function serializeState(state) {
    return JSON.stringify(state);
  }

  function playCard(state, cardId) {
    const nextState = clone(state);
    const actor = nextState[nextState.currentActor];
    const handIndex = actor.hand.findIndex(function (card) {
      return card.id === cardId;
    });

    if (handIndex === -1) {
      return nextState;
    }

    const card = actor.hand[handIndex];
    if (card.cost > actor.mana) {
      return nextState;
    }

    actor.mana -= card.cost;
    actor.hand.splice(handIndex, 1);

    if (card.type === 'unit' && actor.board.length < MAX_BOARD_SIZE) {
      card.exhausted = false;
      actor.board.push(card);
      nextState.tutorialCue = {
        title: 'Attack when a lane opens.',
        detail: card.name + ' can pressure the enemy once the blocker is gone.',
      };
      return nextState;
    }

    actor.discard.push(card);
    nextState.tutorialCue = {
      title: 'End Turn after your best spell.',
      detail: 'Spells resolve immediately and clear the way for combat.',
    };
    return nextState;
  }

  function endTurn(state) {
    const nextState = clone(state);

    if (nextState.currentActor === 'player') {
      beginActorTurn(nextState, 'enemy', nextState.turn);
      return nextState;
    }

    nextState.turn += 1;
    beginActorTurn(nextState, 'player', nextState.turn);
    return nextState;
  }

  function runEnemyTurn(state) {
    const nextState = clone(state);

    if (nextState.currentActor !== 'enemy') {
      return nextState;
    }

    const playedCards = [];
    const enemy = nextState.enemy;

    while (true) {
      const card = chooseEnemyPlay(nextState);
      if (!card) {
        break;
      }

      enemy.mana -= card.cost;
      enemy.hand = enemy.hand.filter(function (handCard) {
        return handCard.id !== card.id;
      });

      if (card.type === 'unit' && enemy.board.length < MAX_BOARD_SIZE) {
        card.exhausted = false;
        enemy.board.push(card);
      } else {
        resolveEnemySpell(nextState, card);
        enemy.discard.push(card);
      }

      playedCards.push(card.name || formatTemplateName(card.templateId));
      if (playedCards.length >= 2) {
        break;
      }
    }

    const attackSummaries = [];
    for (let lane = 0; lane < enemy.board.length; lane += 1) {
      const attacker = enemy.board[lane];
      if (!attacker || attacker.exhausted) {
        continue;
      }

      const defender = nextState.player.board[lane];
      if (defender) {
        defender.health -= attacker.attack;
        attacker.health -= defender.attack || 0;
        attackSummaries.push((attacker.name || formatTemplateName(attacker.templateId)) + ' traded into ' + (defender.name || formatTemplateName(defender.templateId)));
      } else {
        nextState.player.health -= attacker.attack;
        attackSummaries.push((attacker.name || formatTemplateName(attacker.templateId)) + ' hit the player captain for ' + attacker.attack);
      }

      attacker.exhausted = true;
    }

    cleanupBoard(nextState.player.board);
    cleanupBoard(nextState.enemy.board);

    nextState.lastEnemyPlan = {
      cardsPlayed: playedCards,
      summary: buildEnemySummary(playedCards, attackSummaries),
    };

    nextState.turn += 1;
    beginActorTurn(nextState, 'player', nextState.turn);
    nextState.tutorialCue = {
      title: 'Enemy turn resolved. Push back now.',
      detail: nextState.lastEnemyPlan.summary,
    };
    return nextState;
  }

  function beginActorTurn(state, actorName, turnNumber) {
    const actor = state[actorName];
    actor.maxMana = Math.min(8, Math.max(1, turnNumber));
    actor.mana = actor.maxMana;
    drawCard(actor);
    readyBoard(actor.board);
    state.currentActor = actorName;
  }

  function chooseEnemyPlay(state) {
    const enemy = state.enemy;
    const playableCards = enemy.hand.filter(function (card) {
      return card.cost <= enemy.mana && (card.type !== 'unit' || enemy.board.length < MAX_BOARD_SIZE);
    });

    if (!playableCards.length) {
      return null;
    }

    const guardUnit = playableCards.find(function (card) {
      return card.type === 'unit' && Array.isArray(card.keywords) && card.keywords.indexOf('guard') !== -1;
    });
    if (guardUnit) {
      return hydrateCard(guardUnit);
    }

    const strongestUnit = playableCards
      .filter(function (card) {
        return card.type === 'unit';
      })
      .sort(function (left, right) {
        return (right.attack + right.health) - (left.attack + left.health);
      })[0];
    if (strongestUnit) {
      return hydrateCard(strongestUnit);
    }

    return hydrateCard(playableCards[0]);
  }

  function resolveEnemySpell(state, card) {
    const target = state.player.board[0];
    if (target) {
      target.health -= card.damage || 1;
      cleanupBoard(state.player.board);
      return;
    }

    state.player.health -= card.damage || 1;
  }

  function drawCard(actor) {
    if (!actor.deck.length) {
      actor.health -= 2;
      return;
    }

    actor.hand.push(actor.deck.shift());
  }

  function readyBoard(board) {
    board.forEach(function (card) {
      card.exhausted = false;
    });
  }

  function cleanupBoard(board) {
    for (let index = board.length - 1; index >= 0; index -= 1) {
      if (board[index].health <= 0) {
        board.splice(index, 1);
      }
    }
  }

  function buildEnemyDeck(deckBias) {
    return [
      createCard(deckBias[0], 'e-deck-1'),
      createCard(deckBias[1], 'e-deck-2'),
      createCard('ash-recruit', 'e-deck-3'),
    ];
  }

  function buildEnemySummary(playedCards, attackSummaries) {
    const played = playedCards.length ? 'Played ' + playedCards.join(', ') + '.' : 'Held cards.';
    const attacks = attackSummaries.length ? ' ' + attackSummaries.join(' Then ') + '.' : ' No attack.';
    return played + attacks;
  }

  function createCard(templateId, instanceId) {
    const template = CARD_LIBRARY[templateId];
    return Object.assign({ id: instanceId }, clone(template));
  }

  function hydrateCard(card) {
    if (card.name) {
      return clone(card);
    }

    const template = CARD_LIBRARY[card.templateId] || {};
    return Object.assign({}, clone(template), clone(card));
  }

  function formatTemplateName(templateId) {
    return String(templateId || 'card')
      .split('-')
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  }

  function hashSeed(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  return {
    chooseEncounterVariant,
    createInitialState,
    createStorageKey,
    endTurn,
    hydrateState,
    playCard,
    resolveEnemyTurn: runEnemyTurn,
    runEnemyTurn,
    serializeState,
  };
});
