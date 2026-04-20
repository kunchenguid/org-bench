(function () {
  const DuelData = typeof require === 'function'
    ? require('./duel-data.js')
    : globalThis.DuelData;

  let nextInstanceId = 1;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createPlayer(deckIds, heroName) {
    return {
      hero: { name: heroName, health: 20, maxHealth: 20 },
      deck: deckIds.map((id) => ({ id })),
      hand: [],
      board: [],
      discard: [],
      mana: 0,
      maxMana: 0,
      fatigue: 0,
    };
  }

  function drawCard(player) {
    if (player.deck.length === 0) {
      player.fatigue += 1;
      player.hero.health -= player.fatigue;
      return null;
    }

    const card = player.deck.shift();
    player.hand.push(card);
    return card;
  }

  function createUnit(card) {
    return {
      instanceId: `unit-${nextInstanceId++}`,
      id: card.id,
      name: card.name,
      attack: card.attack,
      baseAttack: card.attack,
      health: card.health,
      maxHealth: card.health,
      cost: card.cost,
      keywords: clone(card.keywords || []),
      canAttack: card.keywords && card.keywords.includes('charge'),
      exhausted: !(card.keywords && card.keywords.includes('charge')),
      attackBuff: 0,
    };
  }

  function removeDeadUnits(player) {
    player.board = player.board.filter((unit) => unit.health > 0);
  }

  function getOpponentIndex(playerIndex) {
    return playerIndex === 0 ? 1 : 0;
  }

  function checkGameOver(game) {
    const defeated = game.players.findIndex((player) => player.hero.health <= 0);
    if (defeated === -1) {
      return false;
    }

    game.winner = getOpponentIndex(defeated);
    game.turn.step = 'gameOver';
    return true;
  }

  function refreshUnits(player) {
    for (const unit of player.board) {
      unit.attack = unit.baseAttack;
      unit.attackBuff = 0;
      unit.exhausted = false;
      unit.canAttack = true;
    }
  }

  function assertTurn(game, playerIndex, step) {
    if (game.winner !== null) {
      throw new Error('The game is already over.');
    }
    if (game.turn.currentPlayer !== playerIndex) {
      throw new Error('It is not that player\'s turn.');
    }
    if (game.turn.step !== step) {
      throw new Error(`Action requires ${step} phase.`);
    }
  }

  function applyCardEffect(game, playerIndex, card) {
    const effect = card.onPlay;
    if (!effect) {
      return;
    }

    const player = game.players[playerIndex];
    const opponent = game.players[getOpponentIndex(playerIndex)];

    if (effect.buffAlliesAttack) {
      for (const unit of player.board) {
        if (unit.instanceId) {
          unit.attack += effect.buffAlliesAttack;
          unit.attackBuff += effect.buffAlliesAttack;
        }
      }
    }

    if (effect.dealHeroDamage) {
      opponent.hero.health -= effect.dealHeroDamage;
      checkGameOver(game);
    }

    if (effect.drawCards) {
      for (let drawIndex = 0; drawIndex < effect.drawCards; drawIndex += 1) {
        drawCard(player);
      }
      checkGameOver(game);
    }

    if (effect.dealUnitDamage) {
      const target = opponent.board[0];
      if (target) {
        target.health -= effect.dealUnitDamage;
        removeDeadUnits(opponent);
      }
    }
  }

  function createGame(options) {
    const starterDecks = DuelData.createStarterDecks();
    const game = {
      version: 1,
      players: [
        createPlayer(options && options.playerDeck ? options.playerDeck : starterDecks.player, 'Captain Sol'),
        createPlayer(options && options.aiDeck ? options.aiDeck : starterDecks.ai, 'Vesper Shade'),
      ],
      turn: {
        currentPlayer: 0,
        number: 1,
        step: 'draw',
      },
      winner: null,
      log: [],
    };

    for (let playerIndex = 0; playerIndex < game.players.length; playerIndex += 1) {
      for (let cardIndex = 0; cardIndex < 3; cardIndex += 1) {
        drawCard(game.players[playerIndex]);
      }
    }

    return game;
  }

  function startTurn(game) {
    const player = game.players[game.turn.currentPlayer];
    if (game.turn.step !== 'draw') {
      throw new Error('Turn must begin in draw step.');
    }

    player.maxMana = Math.min(10, player.maxMana + 1);
    player.mana = player.maxMana;
    refreshUnits(player);
    drawCard(player);

    if (!checkGameOver(game)) {
      game.turn.step = 'main';
    }
  }

  function playCard(game, playerIndex, handIndex) {
    assertTurn(game, playerIndex, 'main');
    const player = game.players[playerIndex];
    const cardRef = player.hand[handIndex];
    if (!cardRef) {
      throw new Error('No card in that hand slot.');
    }

    const card = DuelData.getCardDefinition(cardRef.id);
    if (card.cost > player.mana) {
      throw new Error('Not enough mana.');
    }

    player.hand.splice(handIndex, 1);
    player.mana -= card.cost;

    if (card.type === 'unit') {
      player.board.push(createUnit(card));
    } else {
      player.discard.push({ id: card.id });
    }

    applyCardEffect(game, playerIndex, card);
  }

  function advanceToAttackPhase(game) {
    if (game.turn.step !== 'main') {
      throw new Error('Attack phase begins after main phase.');
    }

    game.turn.step = 'attack';
  }

  function findUnitByInstanceId(board, instanceId) {
    return board.find((unit) => unit.instanceId === instanceId);
  }

  function attackTarget(game, attackerIndex, targetId) {
    assertTurn(game, game.turn.currentPlayer, 'attack');
    const player = game.players[game.turn.currentPlayer];
    const opponent = game.players[getOpponentIndex(game.turn.currentPlayer)];
    const attacker = player.board[attackerIndex];

    if (!attacker) {
      throw new Error('No attacker in that board slot.');
    }
    if (!attacker.canAttack || attacker.exhausted) {
      throw new Error('That unit cannot attack.');
    }

    const guards = opponent.board.filter((unit) => unit.keywords.includes('guard'));
    if (targetId === 'hero' && guards.length > 0) {
      throw new Error('A guard is protecting the enemy hero.');
    }

    if (targetId === 'hero') {
      opponent.hero.health -= attacker.attack;
      if (attacker.keywords.includes('drain')) {
        player.hero.health = Math.min(player.hero.maxHealth, player.hero.health + attacker.attack);
      }
    } else {
      const defender = findUnitByInstanceId(opponent.board, targetId);
      if (!defender) {
        throw new Error('Target unit not found.');
      }
      if (guards.length > 0 && !defender.keywords.includes('guard')) {
        throw new Error('A guard must be attacked first.');
      }

      defender.health -= attacker.attack;
      attacker.health -= defender.attack;
      removeDeadUnits(player);
      removeDeadUnits(opponent);
    }

    attacker.exhausted = true;
    attacker.canAttack = false;
    checkGameOver(game);
  }

  function endTurn(game) {
    if (game.winner !== null) {
      throw new Error('The game is already over.');
    }
    if (game.turn.step !== 'attack' && game.turn.step !== 'main') {
      throw new Error('You can only end the turn from main or attack phase.');
    }

    game.turn.currentPlayer = getOpponentIndex(game.turn.currentPlayer);
    game.turn.number += 1;
    game.turn.step = 'draw';
  }

  const api = {
    createGame,
    startTurn,
    playCard,
    advanceToAttackPhase,
    attackTarget,
    endTurn,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalThis.DuelEngine = api;
})();
