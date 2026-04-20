(function () {
  const canvas = document.getElementById('game-canvas');
  const status = document.getElementById('boot-status');
  const ctx = canvas.getContext('2d');
  const storageNamespace = window.__BENCHMARK_RUN_NAMESPACE__ || 'sky-clash-dev';
  const storageKey = storageNamespace + ':save';
  const tooltipWidth = 250;
  const cardSize = { w: 140, h: 190 };

  function makeCard(id, name, cost, attack, health, text, accent) {
    return { id, name, cost, attack, health, maxHealth: health, text, accent };
  }

  function defaultState() {
    return {
      phase: 'player',
      turn: 1,
      message: 'Secure the lane. Play a glowing unit, attack a marked foe, then end the turn.',
      player: {
        hero: { id: 'player-hero', health: 18, maxHealth: 18 },
        mana: 1,
        maxMana: 1,
        hand: [
          makeCard('ember-fox', 'Ember Fox', 1, 2, 1, 'Rush - can attack on entry.', '#ff9f5a'),
          makeCard('storm-adept', 'Storm Adept', 2, 2, 3, 'Sturdy body for lane control.', '#77d7ff'),
        ],
        board: [],
      },
      enemy: {
        hero: { id: 'enemy-hero', health: 16, maxHealth: 16 },
        mana: 1,
        maxMana: 1,
        hand: [
          makeCard('dusk-raider', 'Dusk Raider', 1, 1, 2, 'Cheap pressure from the rival.', '#f46cbf'),
          makeCard('iron-bulwark', 'Iron Bulwark', 2, 2, 3, 'A slower defender.', '#9a8cff'),
        ],
        board: [
          { id: 'enemy-guard', name: 'Night Guard', attack: 1, health: 2, maxHealth: 2, text: 'A vulnerable frontliner.', accent: '#ff6e8d', canAttack: false },
        ],
      },
      tutorial: {
        playedCardThisTurn: false,
        attackedThisTurn: false,
      },
      selection: { attackerId: null },
      hover: null,
      effects: [],
      winner: null,
    };
  }

  let state = loadState() || defaultState();
  let layout = {};
  let animationStart = performance.now();

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // Ignore storage failures in sandboxed browsers.
    }
  }

  function syncUnits() {
    state.player.board.forEach((unit) => {
      if (typeof unit.canAttack !== 'boolean') {
        unit.canAttack = true;
      }
    });
    state.enemy.board.forEach((unit) => {
      if (typeof unit.canAttack !== 'boolean') {
        unit.canAttack = false;
      }
    });
  }

  function getTutorialView() {
    return {
      phase: state.phase,
      mana: state.player.mana,
      hand: state.player.hand.map((card) => ({ id: card.id, cost: card.cost, owner: 'player' })),
      board: {
        player: state.player.board.map((unit) => ({ id: unit.id, canAttack: !!unit.canAttack })),
        enemy: state.enemy.board.map((unit) => ({ id: unit.id, canBeAttacked: true })).concat([{ id: 'enemy-hero', canBeAttacked: true }]),
      },
      tutorial: state.tutorial,
    };
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function pointInRect(x, y, rect) {
    return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function animateText(text, x, y, color) {
    state.effects.push({ text, x, y, color, createdAt: performance.now() });
  }

  function removeDead(board) {
    for (let index = board.length - 1; index >= 0; index -= 1) {
      if (board[index].health <= 0) {
        animateText('KO', board[index].screenX || canvas.clientWidth / 2, board[index].screenY || canvas.clientHeight / 2, '#ffd36d');
        board.splice(index, 1);
      }
    }
  }

  function playCard(cardId) {
    if (state.phase !== 'player' || state.winner) {
      return;
    }
    const index = state.player.hand.findIndex((card) => card.id === cardId && card.cost <= state.player.mana);
    if (index === -1) {
      return;
    }
    const card = state.player.hand.splice(index, 1)[0];
    state.player.mana -= card.cost;
    state.player.board.push({
      id: card.id,
      name: card.name,
      attack: card.attack,
      health: card.health,
      maxHealth: card.maxHealth,
      text: card.text,
      accent: card.accent,
      canAttack: true,
    });
    state.tutorial.playedCardThisTurn = true;
    state.message = card.name + ' hits the field. Use it right away while enemy targets are glowing.';
    saveState();
  }

  function performAttack(attackerId, targetId) {
    const attacker = state.player.board.find((unit) => unit.id === attackerId);
    if (!attacker || !attacker.canAttack || state.phase !== 'player' || state.winner) {
      return;
    }

    if (targetId === 'enemy-hero') {
      state.enemy.hero.health -= attacker.attack;
      attacker.canAttack = false;
      state.tutorial.attackedThisTurn = true;
      animateText('-' + attacker.attack, layout.enemyHero.x + 70, layout.enemyHero.y + 50, '#ffb56b');
      state.message = 'Direct hit. End the turn once your units are spent.';
    } else {
      const target = state.enemy.board.find((unit) => unit.id === targetId);
      if (!target) {
        return;
      }
      target.health -= attacker.attack;
      attacker.health -= target.attack;
      attacker.canAttack = false;
      state.tutorial.attackedThisTurn = true;
      animateText('-' + attacker.attack, target.screenX || 0, target.screenY || 0, '#ffd36d');
      animateText('-' + target.attack, attacker.screenX || 0, attacker.screenY || 0, '#ff8ba7');
      state.message = 'Combat resolved. If nothing else is lit up, hit End Turn.';
      removeDead(state.enemy.board);
      removeDead(state.player.board);
    }

    state.selection.attackerId = null;
    checkWinner();
    saveState();
  }

  function enemyAct() {
    state.phase = 'enemy';
    state.message = 'Enemy turn. Watch their lane and get ready to answer.';
    syncUnits();
    saveState();

    window.setTimeout(() => {
      if (state.winner) {
        return;
      }
      const playable = state.enemy.hand.find((card) => card.cost <= state.enemy.mana);
      if (playable) {
        state.enemy.hand = state.enemy.hand.filter((card) => card.id !== playable.id);
        state.enemy.mana -= playable.cost;
        state.enemy.board.push({
          id: playable.id,
          name: playable.name,
          attack: playable.attack,
          health: playable.health,
          maxHealth: playable.maxHealth,
          text: playable.text,
          accent: playable.accent,
          canAttack: false,
        });
        state.message = playable.name + ' enters for the rival.';
        saveState();
      }
    }, 600);

    window.setTimeout(() => {
      const attacker = state.enemy.board.find((unit) => unit.canAttack);
      if (attacker) {
        state.player.hero.health -= attacker.attack;
        attacker.canAttack = false;
        animateText('-' + attacker.attack, layout.playerHero.x + 70, layout.playerHero.y + 50, '#ff8ba7');
        state.message = attacker.name + ' strikes your hero.';
        checkWinner();
        saveState();
      }
    }, 1200);

    window.setTimeout(startPlayerTurn, 1900);
  }

  function startPlayerTurn() {
    if (state.winner) {
      return;
    }
    state.turn += 1;
    state.phase = 'player';
    state.player.maxMana = Math.min(3, state.player.maxMana + 1);
    state.player.mana = state.player.maxMana;
    state.enemy.maxMana = Math.min(3, state.enemy.maxMana + 1);
    state.enemy.mana = state.enemy.maxMana;
    state.player.board.forEach((unit) => {
      unit.canAttack = true;
    });
    state.enemy.board.forEach((unit) => {
      unit.canAttack = true;
    });
    state.tutorial.playedCardThisTurn = false;
    state.tutorial.attackedThisTurn = false;
    state.selection.attackerId = null;
    state.message = 'Your turn. Glowing cards and targets show the next legal move.';
    saveState();
  }

  function endTurn() {
    if (state.phase !== 'player' || state.winner) {
      return;
    }
    state.selection.attackerId = null;
    enemyAct();
  }

  function checkWinner() {
    if (state.enemy.hero.health <= 0) {
      state.winner = 'Victory';
      state.message = 'Victory. You broke through the rival commander.';
    } else if (state.player.hero.health <= 0) {
      state.winner = 'Defeat';
      state.message = 'Defeat. Reload to resume or press R to restart.';
    }
  }

  function heroRect(side, width, height) {
    const y = side === 'enemy' ? 72 : height - 242;
    const x = side === 'enemy' ? width - 220 : 80;
    return { x, y, w: 140, h: 140 };
  }

  function unitRowRect(side, index, count, width, height) {
    const totalWidth = count * (cardSize.w + 16) - 16;
    const startX = (width - totalWidth) / 2;
    const y = side === 'enemy' ? 215 : height - 420;
    return { x: startX + index * (cardSize.w + 16), y, w: cardSize.w, h: cardSize.h };
  }

  function handRect(index, count, width, height) {
    const spread = Math.min(115, Math.max(92, width / Math.max(5, count + 1)));
    const totalWidth = spread * (count - 1) + cardSize.w;
    const startX = (width - totalWidth) / 2;
    return { x: startX + index * spread, y: height - 220, w: cardSize.w, h: cardSize.h };
  }

  function endTurnRect(width, height) {
    return { x: width - 220, y: height / 2 - 44, w: 156, h: 88 };
  }

  function drawBackdrop(width, height, time) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0c1430');
    gradient.addColorStop(1, '#221332');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 28; i += 1) {
      const x = (width / 28) * i + Math.sin(time / 1100 + i) * 18;
      const y = height * 0.16 + Math.cos(time / 1000 + i * 0.7) * 24;
      ctx.fillStyle = 'rgba(130, 214, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(48, 54, width - 96, height - 108);
    ctx.strokeStyle = 'rgba(173, 225, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 54, width - 96, height - 108);
  }

  function drawPanel(x, y, w, h, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();
  }

  function drawHero(hero, rect, side, time) {
    drawPanel(rect.x, rect.y, rect.w, rect.h, side === 'enemy' ? 'rgba(73, 22, 48, 0.92)' : 'rgba(18, 47, 82, 0.92)', side === 'enemy' ? '#ff7db2' : '#7fd2ff');
    const pulse = Math.sin(time / 700) * 4;
    ctx.fillStyle = side === 'enemy' ? '#ff9ec9' : '#8ad8ff';
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + 54 + pulse, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#07111f';
    ctx.fillRect(rect.x + 28, rect.y + 88, rect.w - 56, 20);
    ctx.fillStyle = '#f5fbff';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(side === 'enemy' ? 'Rival Ace' : 'You', rect.x + 34, rect.y + 28);
    ctx.fillText(hero.health + '/' + hero.maxHealth, rect.x + 46, rect.y + 104);
  }

  function drawCard(card, rect, options, time) {
    const lift = options.lift ? -12 : 0;
    const pulse = options.pulse ? (Math.sin(time / 240) + 1) * 0.5 : 0;
    const border = options.selected ? '#fff2a8' : options.target ? '#ff9ca2' : card.accent;
    const glow = options.pulse || options.target || options.selected;

    if (glow) {
      ctx.fillStyle = options.target ? 'rgba(255, 101, 122, 0.24)' : 'rgba(137, 220, 255,' + (0.12 + pulse * 0.18) + ')';
      ctx.beginPath();
      ctx.roundRect(rect.x - 8, rect.y - 8 + lift, rect.w + 16, rect.h + 16, 24);
      ctx.fill();
    }

    drawPanel(rect.x, rect.y + lift, rect.w, rect.h, 'rgba(14, 19, 34, 0.94)', border);
    ctx.fillStyle = card.accent;
    ctx.fillRect(rect.x + 14, rect.y + 14 + lift, rect.w - 28, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(rect.x + 14, rect.y + 94 + lift, rect.w - 28, 48);
    ctx.fillStyle = '#f4fbff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(card.name, rect.x + 16, rect.y + 168 + lift, rect.w - 32);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#d7e7ff';
    wrapText(card.text, rect.x + 16, rect.y + 108 + lift, rect.w - 32, 16, 2);
    badge(rect.x + 10, rect.y + 10 + lift, 26, String(card.cost), '#132640');
    if (typeof card.attack === 'number') {
      badge(rect.x + 10, rect.y + rect.h - 36 + lift, 26, String(card.attack), '#4e1a25');
      badge(rect.x + rect.w - 36, rect.y + rect.h - 36 + lift, 26, String(card.health), '#143922');
    }
  }

  function badge(x, y, size, text, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 13);
    ctx.fill();
    ctx.fillStyle = '#f6fbff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(text, x + 8, y + 18);
  }

  function wrapText(text, x, y, width, lineHeight, maxLines) {
    const words = text.split(' ');
    let line = '';
    let lineNumber = 0;
    for (let index = 0; index < words.length; index += 1) {
      const testLine = line + words[index] + ' ';
      if (ctx.measureText(testLine).width > width && line) {
        ctx.fillText(line.trim(), x, y + lineNumber * lineHeight);
        line = words[index] + ' ';
        lineNumber += 1;
        if (lineNumber >= maxLines) {
          return;
        }
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, y + lineNumber * lineHeight);
  }

  function drawHud(width, height) {
    const tutorial = window.TutorialState.getTutorialStep(getTutorialView());
    drawPanel(68, height / 2 - 70, 360, 124, 'rgba(10, 17, 33, 0.88)', '#7cd9ff');
    ctx.fillStyle = '#8ae0ff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('Turn ' + state.turn + ' - ' + (state.phase === 'player' ? 'Your Move' : 'Enemy Move'), 88, height / 2 - 32);
    ctx.fillStyle = '#f3fbff';
    ctx.font = '16px Arial';
    wrapText(tutorial.message, 88, height / 2, 320, 22, 3);
    ctx.fillStyle = 'rgba(243, 251, 255, 0.82)';
    wrapText(state.message, 88, height / 2 + 54, 320, 20, 2);
  }

  function drawEndTurnButton(rect, time) {
    const tutorial = window.TutorialState.getTutorialStep(getTutorialView());
    const active = state.phase === 'player' && tutorial.id === 'end-turn';
    const alpha = active ? 0.28 + (Math.sin(time / 220) + 1) * 0.12 : 0.12;
    drawPanel(rect.x, rect.y, rect.w, rect.h, 'rgba(16, 30, 49, 0.94)', active ? '#ffd36d' : '#84b7ff');
    ctx.fillStyle = 'rgba(255, 211, 109,' + alpha + ')';
    ctx.beginPath();
    ctx.roundRect(rect.x + 6, rect.y + 6, rect.w - 12, rect.h - 12, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('END TURN', rect.x + 22, rect.y + 50);
    ctx.font = '14px Arial';
    ctx.fillText('Pass to rival', rect.x + 32, rect.y + 72);
  }

  function drawTooltip(time, width, height) {
    if (!state.hover) {
      return;
    }
    const x = Math.min(width - tooltipWidth - 24, Math.max(24, state.hover.x + 18));
    const y = Math.min(height - 120, Math.max(24, state.hover.y - 20));
    drawPanel(x, y, tooltipWidth, 96, 'rgba(7, 12, 24, 0.95)', '#8ad8ff');
    ctx.fillStyle = '#f5fbff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(state.hover.title, x + 16, y + 24);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#d7e7ff';
    wrapText(state.hover.body, x + 16, y + 50, tooltipWidth - 32, 18, 2);
  }

  function drawEffects(time) {
    state.effects = state.effects.filter((effect) => time - effect.createdAt < 900);
    state.effects.forEach((effect) => {
      const age = (time - effect.createdAt) / 900;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = effect.color;
      ctx.font = 'bold 28px Arial';
      ctx.fillText(effect.text, effect.x, effect.y - age * 40);
      ctx.globalAlpha = 1;
    });
  }

  function updateHover(x, y) {
    state.hover = null;
    for (const item of layout.hand || []) {
      if (pointInRect(x, y, item.rect)) {
        state.hover = { x, y, title: item.card.name, body: item.card.text };
        return;
      }
    }
    for (const item of layout.playerBoard || []) {
      if (pointInRect(x, y, item.rect)) {
        state.hover = { x, y, title: item.unit.name, body: item.unit.canAttack ? 'Ready to attack this turn.' : 'Exhausted until next turn.' };
        return;
      }
    }
    for (const item of layout.enemyBoard || []) {
      if (pointInRect(x, y, item.rect)) {
        state.hover = { x, y, title: item.unit.name, body: 'Enemy unit. Attack it to clear the lane.' };
        return;
      }
    }
    if (pointInRect(x, y, layout.enemyHero)) {
      state.hover = { x, y, title: 'Rival Ace', body: 'If the lane is open, send damage here to win.' };
    } else if (pointInRect(x, y, layout.endTurn)) {
      state.hover = { x, y, title: 'End Turn', body: 'Use this when no glowing play or target remains.' };
    }
  }

  function handleClick(x, y) {
    if (state.winner) {
      state = defaultState();
      saveState();
      return;
    }

    for (const item of layout.hand || []) {
      if (pointInRect(x, y, item.rect)) {
        playCard(item.card.id);
        return;
      }
    }

    for (const item of layout.playerBoard || []) {
      if (pointInRect(x, y, item.rect) && item.unit.canAttack && state.phase === 'player') {
        state.selection.attackerId = item.unit.id;
        state.message = 'Target lit. Pick the enemy you want to hit.';
        saveState();
        return;
      }
    }

    if (state.selection.attackerId) {
      for (const item of layout.enemyBoard || []) {
        if (pointInRect(x, y, item.rect)) {
          performAttack(state.selection.attackerId, item.unit.id);
          return;
        }
      }
      if (pointInRect(x, y, layout.enemyHero)) {
        performAttack(state.selection.attackerId, 'enemy-hero');
        return;
      }
    }

    if (pointInRect(x, y, layout.endTurn)) {
      endTurn();
    }
  }

  function render(time) {
    syncUnits();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const tutorial = window.TutorialState.getTutorialStep(getTutorialView());
    const playableIds = new Set(window.TutorialState.getPlayableCardIds(getTutorialView()));
    const attackCue = window.TutorialState.getAttackCue(getTutorialView());
    layout = { hand: [], playerBoard: [], enemyBoard: [] };

    drawBackdrop(width, height, time);

    layout.enemyHero = heroRect('enemy', width, height);
    layout.playerHero = heroRect('player', width, height);
    drawHero(state.enemy.hero, layout.enemyHero, 'enemy', time);
    drawHero(state.player.hero, layout.playerHero, 'player', time);

    state.enemy.board.forEach((unit, index) => {
      const rect = unitRowRect('enemy', index, state.enemy.board.length, width, height);
      unit.screenX = rect.x + 32;
      unit.screenY = rect.y + 42;
      layout.enemyBoard.push({ unit, rect });
      drawCard(unit, rect, {
        pulse: false,
        target: state.selection.attackerId && (!attackCue || attackCue.targetId === unit.id),
        selected: false,
        lift: pointInRect(state.hover && state.hover.x, state.hover && state.hover.y, rect),
      }, time);
    });

    state.player.board.forEach((unit, index) => {
      const rect = unitRowRect('player', index, state.player.board.length, width, height);
      unit.screenX = rect.x + 32;
      unit.screenY = rect.y + 42;
      layout.playerBoard.push({ unit, rect });
      drawCard(unit, rect, {
        pulse: tutorial.id === 'attack' && attackCue && attackCue.attackerId === unit.id,
        target: false,
        selected: state.selection.attackerId === unit.id,
        lift: pointInRect(state.hover && state.hover.x, state.hover && state.hover.y, rect),
      }, time);
    });

    state.player.hand.forEach((card, index) => {
      const rect = handRect(index, state.player.hand.length, width, height);
      layout.hand.push({ card, rect });
      drawCard(card, rect, {
        pulse: tutorial.id === 'play-card' && playableIds.has(card.id),
        target: false,
        selected: false,
        lift: pointInRect(state.hover && state.hover.x, state.hover && state.hover.y, rect),
      }, time);
    });

    layout.endTurn = endTurnRect(width, height);
    drawEndTurnButton(layout.endTurn, time);
    drawHud(width, height);

    if (state.selection.attackerId) {
      ctx.strokeStyle = 'rgba(255, 234, 157, 0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 10]);
      const attacker = layout.playerBoard.find((item) => item.unit.id === state.selection.attackerId);
      const target = layout.enemyBoard[0];
      if (attacker && target) {
        ctx.beginPath();
        ctx.moveTo(attacker.rect.x + attacker.rect.w / 2, attacker.rect.y);
        ctx.lineTo(target.rect.x + target.rect.w / 2, target.rect.y + target.rect.h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    drawEffects(time);
    drawTooltip(time, width, height);

    if (state.winner) {
      drawPanel(width / 2 - 220, height / 2 - 84, 440, 168, 'rgba(8, 12, 24, 0.94)', '#ffd36d');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px Arial';
      ctx.fillText(state.winner, width / 2 - 78, height / 2 - 12);
      ctx.font = '18px Arial';
      ctx.fillText('Click anywhere to restart the skirmish.', width / 2 - 148, height / 2 + 34);
    }

    requestAnimationFrame(render);
  }

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    updateHover(event.clientX - rect.left, event.clientY - rect.top);
  });

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    handleClick(event.clientX - rect.left, event.clientY - rect.top);
  });

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r') {
      state = defaultState();
      saveState();
    }
  });

  resize();
  if (status) {
    status.textContent = 'Tutorial board ready. Hover cards to inspect, click glowing actions to play.';
  }
  saveState();
  requestAnimationFrame(render);
})();
