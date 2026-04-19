const effects = {
  keywords: {
    taunt: {
      name: 'Taunt',
      description: 'Must be attacked before other minions',
      apply: (gameState, player, minion) => {
        minion.hasTaunt = true;
      }
    },
    charge: {
      name: 'Charge',
      description: 'Can attack immediately',
      apply: (gameState, player, minion) => {
        minion.canAttack = true;
      }
    },
    divineShield: {
      name: 'Divine Shield',
      description: 'Blocks the first damage taken',
      apply: (gameState, player, minion) => {
        minion.hasDivineShield = true;
      }
    },
    deathrattle: {
      name: 'Deathrattle',
      description: 'Triggers an effect when this minion dies',
      apply: (gameState, player, minion) => {
        minion.hasDeathrattle = true;
      }
    }
  },

  synergies: {
    onPlay: {
      lightPaladin: {
        trigger: (gameState, player, card) => {
          if (card.id === 'light_paladin') {
            const allyMinions = gameState[player].board.filter(m => m.faction === 'light');
            allyMinions.forEach(m => {
              m.hasDivineShield = true;
            });
            gameState.lastEffect = { type: 'onPlay', description: 'Light Paladin grants Divine Shield to all allies' };
          }
        }
      },
      shadowNecromancer: {
        trigger: (gameState, player, card) => {
          if (card.id === 'shadow_necromancer') {
            const enemyPlayer = player === 'player' ? 'opponent' : 'player';
            const enemyGraveyard = gameState[enemyPlayer].graveyard || [];
            if (enemyGraveyard.length > 0) {
              const stolenMinion = enemyGraveyard.pop();
              stolenMinion.canAttack = true;
              stolenMinion.hp = 1;
              gameState[player].board.push(stolenMinion);
              gameState.lastEffect = { type: 'onPlay', description: 'Shadow Necromancer revives enemy minion' };
            }
          }
        }
      },
      solarGuardian: {
        trigger: (gameState, player, card) => {
          if (card.id === 'solar_guardian') {
            gameState[player].hp = Math.min(gameState[player].hp + 3, 30);
            gameState.lastEffect = { type: 'onPlay', description: 'Solar Guardian heals hero for 3' };
          }
        }
      }
    },
    onDeath: {
      lightPriest: {
        trigger: (gameState, player, minion) => {
          if (minion.id === 'light_priest') {
            gameState[player].hp = Math.min(gameState[player].hp + 2, 30);
            gameState.lastEffect = { type: 'onDeath', description: 'Light Priest heals hero for 2' };
          }
        }
      },
      voidWalker: {
        trigger: (gameState, player, minion) => {
          if (minion.id === 'void_walker') {
            const enemyPlayer = player === 'player' ? 'opponent' : 'player';
            gameState[enemyPlayer].currentMana = Math.max(0, gameState[enemyPlayer].currentMana - 1);
            gameState.lastEffect = { type: 'onDeath', description: 'Void Walker destroys 1 enemy mana' };
          }
        }
      },
      shadowWisp: {
        trigger: (gameState, player, minion) => {
          if (minion.id === 'shadow_wisp') {
            const allyMinions = gameState[player].board.filter(m => m.id !== minion.id);
            allyMinions.forEach(m => {
              m.attack += 1;
            });
            gameState.lastEffect = { type: 'onDeath', description: 'Shadow Wisp buffs allies' };
          }
        }
      }
    }
  },

  applyEffect: function(gameState, player, cardOrMinion, isMinion = false) {
    const effectKey = cardOrMinion.effect;
    if (!effectKey || !this.keywords[effectKey]) return;

    const keyword = this.keywords[effectKey];
    keyword.apply(gameState, player, cardOrMinion);
  },

  triggerOnPlay: function(gameState, player, card) {
    for (const synergyKey in this.synergies.onPlay) {
      const synergy = this.synergies.onPlay[synergyKey];
      synergy.trigger(gameState, player, card);
    }
  },

  triggerOnDeath: function(gameState, player, minion) {
    for (const synergyKey in this.synergies.onDeath) {
      const synergy = this.synergies.onDeath[synergyKey];
      synergy.trigger(gameState, player, minion);
    }
  },

  mustAttackTaunt: function(gameState, attackerPlayer) {
    const defenderPlayer = attackerPlayer === 'player' ? 'opponent' : 'player';
    const tauntMinions = gameState[defenderPlayer].board.filter(m => m.hasTaunt);
    return tauntMinions.length > 0;
  },

  getTauntTargets: function(gameState, defenderPlayer) {
    return gameState[defenderPlayer].board.filter(m => m.hasTaunt);
  },

  applyDivineShield: function(minion, damage) {
    if (minion.hasDivineShield) {
      minion.hasDivineShield = false;
      return 0;
    }
    return damage;
  },

  canMinionAttack: function(minion) {
    return minion.canAttack;
  }
};
