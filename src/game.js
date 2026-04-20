(function () {
  const logic = window.DuelLogic;
  const tutorial = window.DuelTutorial;
  const animation = window.DuelAnimation;
  const canvas = document.getElementById('game-canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });

  if (!gl) {
    document.body.textContent = 'WebGL is required to play Emberfall Duel.';
    return;
  }

  const storageNamespace = DuelState.readStorageNamespace();
  const saveKey = DuelState.createStorageKey(storageNamespace, 'save');
  const assetPaths = {
    board: 'assets/board-bg.svg',
    heroPlayer: 'assets/hero-player.svg',
    heroAi: 'assets/hero-ai.svg',
    frameEmber: 'assets/card-frame-ember.svg',
    frameVerdant: 'assets/card-frame-verdant.svg',
    'ember-fox': 'assets/ember-fox.svg',
    'flare-guard': 'assets/flare-guard.svg',
    sunlance: 'assets/sunlance.svg',
    'ash-drake': 'assets/ash-drake.svg',
    'mist-wisp': 'assets/mist-wisp.svg',
    'grove-keeper': 'assets/grove-keeper.svg',
    'sap-burst': 'assets/sap-burst.svg',
    'thorn-beast': 'assets/thorn-beast.svg',
  };
  const uiCanvas = document.createElement('canvas');
  const uiCtx = uiCanvas.getContext('2d');
  const drawCanvas = document.createElement('canvas');
  const drawCtx = drawCanvas.getContext('2d');

  const state = {
    game: loadGame(),
    hoveredCard: -1,
    hoveredLane: -1,
    pointerX: 0,
    pointerY: 0,
    selectedCard: -1,
    lastTime: 0,
    time: 0,
    particles: createParticles(48),
    fx: animation.createAnimationState(),
    message: 'Open on the battlefield. Play a glowing card, then press End Turn.',
  };

  const renderer = createRenderer(gl);
  const imageCache = Object.create(null);
  const cardArtCache = {};

  saveGame();
  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mouseleave', function () {
    state.hoveredCard = -1;
    state.hoveredLane = -1;
  });

  loadAssets().finally(function () {
    requestAnimationFrame(frame);
  });

  function loadAssets() {
    return Promise.all(Object.keys(assetPaths).map(function (key) {
      return new Promise(function (resolve) {
        const image = new Image();
        image.onload = function () {
          imageCache[key] = image;
          resolve();
        };
        image.onerror = function () {
          resolve();
        };
        image.src = assetPaths[key];
      });
    }));
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(saveKey);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (error) {
      console.warn('Load failed', error);
    }
    return logic.createInitialState({ seed: 17 });
  }

  function saveGame() {
    try {
      localStorage.setItem(saveKey, JSON.stringify(state.game));
    } catch (error) {
      console.warn('Save failed', error);
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    canvas.width = width;
    canvas.height = height;
    uiCanvas.width = width;
    uiCanvas.height = height;
    drawCanvas.width = 1024;
    drawCanvas.height = 1024;
    gl.viewport(0, 0, width, height);
  }

  function frame(time) {
    const delta = Math.min(0.033, (time - state.lastTime) / 1000 || 0.016);
    state.lastTime = time;
    state.time += delta;
    updateAmbient(delta);
    render();
    requestAnimationFrame(frame);
  }

  function updateAmbient(delta) {
    for (let index = 0; index < state.particles.length; index += 1) {
      const particle = state.particles[index];
      particle.y -= particle.speed * delta;
      particle.x += Math.sin(state.time + particle.offset) * delta * 6;
      if (particle.y < -20) {
        particle.y = canvas.height + 20;
        particle.x = Math.random() * canvas.width;
      }
    }
    animation.stepAnimationState(state.fx, delta);
  }

  function createParticles(count) {
    const particles = [];
    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        speed: 12 + Math.random() * 24,
        offset: Math.random() * Math.PI * 2,
        size: 2 + Math.random() * 3,
      });
    }
    return particles;
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    state.pointerX = (event.clientX - rect.left) * (canvas.width / rect.width);
    state.pointerY = (event.clientY - rect.top) * (canvas.height / rect.height);
    const layout = getLayout();
    state.hoveredCard = findHoveredCard(layout.playerHand);
    state.hoveredLane = findHoveredLane(layout.playerLanes);
  }

  function onPointerDown() {
    if (state.game.winner) {
      state.game = logic.createInitialState({ seed: Date.now() % 100000 });
      state.selectedCard = -1;
      state.message = 'Fresh duel. Play onto any empty lane.';
      animation.queueSweep(state.fx, { text: 'Fresh Duel', life: 0.9 });
      saveGame();
      return;
    }

    const layout = getLayout();
    const endTurnButton = layout.endTurn;
    if (hitRect(endTurnButton, state.pointerX, state.pointerY)) {
      const previousGame = state.game;
      state.game = logic.endTurn(state.game);
      queueGameDiff(previousGame, state.game, layout, getLayout());
      if (state.game.player.hand.length > previousGame.player.hand.length) {
        animation.queueCardMotion(state.fx, {
          card: state.game.player.hand[state.game.player.hand.length - 1],
          from: { x: 148, y: canvas.height - 126, w: 36, h: 54 },
          to: getLayout().playerHand[state.game.player.hand.length - 1],
          duration: 0.42,
          lift: 24,
        });
      }
      animation.queueSweep(state.fx, {
        text: state.game.winner ? (state.game.winner === 'player' ? 'Victory' : 'Defeat') : 'Enemy Turn',
        life: 1.2,
      });
      state.message = state.game.log[state.game.log.length - 1];
      state.selectedCard = -1;
      saveGame();
      return;
    }

    if (state.hoveredCard !== -1) {
      state.selectedCard = state.hoveredCard;
      const card = state.game.player.hand[state.selectedCard];
      const sourceRect = layout.playerHand[state.selectedCard];
      state.message = card.type === 'unit' ? 'Now click an empty lane to summon ' + card.name + '.' : 'Click the card again to cast ' + card.name + '.';
      if (card.type === 'spell') {
        const previousGame = state.game;
        state.game = logic.playCard(state.game, 'player', state.selectedCard, null);
        animation.queueCardMotion(state.fx, {
          card: card,
          from: sourceRect,
          to: { x: 78, y: 36, w: 160, h: 108 },
          duration: 0.28,
          lift: 18,
        });
        queueGameDiff(previousGame, state.game, layout, getLayout());
        state.message = state.game.log[state.game.log.length - 1];
        state.selectedCard = -1;
        saveGame();
      }
      return;
    }

    if (state.selectedCard !== -1 && state.hoveredLane !== -1) {
      const previousGame = state.game;
      const card = previousGame.player.hand[state.selectedCard];
      const sourceRect = layout.playerHand[state.selectedCard];
      const targetRect = layout.playerLanes[state.hoveredLane];
      const previous = state.game.player.hand.length;
      state.game = logic.playCard(state.game, 'player', state.selectedCard, state.hoveredLane);
      if (state.game.player.hand.length !== previous) {
        animation.queueCardMotion(state.fx, {
          card: card,
          from: sourceRect,
          to: targetRect,
          duration: 0.4,
          lift: 42,
        });
        animation.queueSweep(state.fx, { text: 'Summon', life: 0.5 });
        queueGameDiff(previousGame, state.game, layout, getLayout());
        state.message = state.game.log[state.game.log.length - 1];
        state.selectedCard = -1;
        saveGame();
      }
      return;
    }

    const laneAttack = findHoveredLane(layout.playerLanes);
    if (laneAttack !== -1 && state.game.player.board[laneAttack] && !state.game.player.board[laneAttack].exhausted) {
      const previousGame = state.game;
      const attacker = state.game.player.board[laneAttack];
      const targetRect = state.game.enemy.board[laneAttack] ? layout.enemyLanes[laneAttack] : { x: 78, y: 36, w: 160, h: 108 };
      state.game = logic.attackWithLane(state.game, 'player', laneAttack);
      animation.queueCardMotion(state.fx, {
        card: attacker,
        from: layout.playerLanes[laneAttack],
        to: targetRect,
        duration: 0.26,
        lift: 26,
        yoyo: true,
      });
      queueGameDiff(previousGame, state.game, layout, getLayout());
      state.message = state.game.log[state.game.log.length - 1];
      saveGame();
    }
  }

  function queueGameDiff(previousGame, nextGame, previousLayout, nextLayout) {
    const playerDelta = previousGame.player.health - nextGame.player.health;
    const enemyDelta = previousGame.enemy.health - nextGame.enemy.health;

    if (playerDelta > 0) {
      animation.queueDamageNumber(state.fx, {
        x: 148,
        y: canvas.height - 162,
        text: '-' + playerDelta,
      });
      animation.queueFlash(state.fx, {
        x: 28,
        y: canvas.height - 152,
        w: 236,
        h: 116,
        color: '255,120,120',
      });
    }

    if (enemyDelta > 0) {
      animation.queueDamageNumber(state.fx, {
        x: 148,
        y: 146,
        text: '-' + enemyDelta,
      });
      animation.queueFlash(state.fx, {
        x: 28,
        y: 28,
        w: 236,
        h: 116,
        color: '255,214,140',
      });
    }

    for (let lane = 0; lane < 3; lane += 1) {
      if (previousGame.player.board[lane] && !nextGame.player.board[lane]) {
        animation.queueGhost(state.fx, { card: previousGame.player.board[lane], rect: previousLayout.playerLanes[lane] });
      }
      if (previousGame.enemy.board[lane] && !nextGame.enemy.board[lane]) {
        animation.queueGhost(state.fx, { card: previousGame.enemy.board[lane], rect: previousLayout.enemyLanes[lane] });
      }
      if (previousGame.enemy.board[lane] && nextGame.enemy.board[lane]) {
        animation.queueFlash(state.fx, {
          x: nextLayout.enemyLanes[lane].x,
          y: nextLayout.enemyLanes[lane].y,
          w: nextLayout.enemyLanes[lane].w,
          h: nextLayout.enemyLanes[lane].h,
          color: '255,240,180',
          life: 0.18,
        });
      }
    }
  }

  function getLayout() {
    const width = canvas.width;
    const height = canvas.height;
    const handCount = state.game.player.hand.length || 1;
    const handCardWidth = Math.min(150, width / (handCount + 2));
    const cardHeight = handCardWidth * 1.45;
    const handY = height - cardHeight - 28;
    const hand = [];
    for (let index = 0; index < state.game.player.hand.length; index += 1) {
      const x = width * 0.5 + (index - (handCount - 1) / 2) * (handCardWidth * 0.78);
      hand.push({ x: x - handCardWidth / 2, y: handY, w: handCardWidth, h: cardHeight });
    }
    const lanes = [];
    for (let lane = 0; lane < 3; lane += 1) {
      const x = width * 0.25 + lane * width * 0.25;
      lanes.push({ x: x - 70, y: height * 0.58, w: 140, h: 182 });
    }
    const enemyLanes = [];
    for (let slot = 0; slot < 3; slot += 1) {
      const x = width * 0.25 + slot * width * 0.25;
      enemyLanes.push({ x: x - 70, y: height * 0.21, w: 140, h: 182 });
    }
    return {
      playerHand: hand,
      playerLanes: lanes,
      enemyLanes: enemyLanes,
      endTurn: { x: width - 178, y: height * 0.5 - 34, w: 148, h: 68 },
    };
  }

  function findHoveredCard(rects) {
    for (let index = rects.length - 1; index >= 0; index -= 1) {
      if (hitRect(rects[index], state.pointerX, state.pointerY)) {
        return index;
      }
    }
    return -1;
  }

  function findHoveredLane(rects) {
    for (let index = 0; index < rects.length; index += 1) {
      if (hitRect(rects[index], state.pointerX, state.pointerY)) {
        return index;
      }
    }
    return -1;
  }

  function hitRect(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function render() {
    uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    drawBoardBase();
    const layout = getLayout();
    const tutorialState = tutorial.getTutorialState(state);
    drawLanes(layout.enemyLanes, state.game.enemy.board, true, tutorialState);
    drawLanes(layout.playerLanes, state.game.player.board, false, tutorialState);
    drawHand(layout.playerHand, tutorialState);
    drawHud(layout, tutorialState);
    drawTooltip(layout, tutorialState);
    drawAnimationGhosts();
    drawAnimationMotions();
    drawAnimationFlashes();
    renderer.draw(uiCanvas);
  }

  function drawBoardBase() {
    const width = uiCanvas.width;
    const height = uiCanvas.height;
    if (imageCache.board) {
      uiCtx.drawImage(imageCache.board, 0, 0, width, height);
    } else {
      const gradient = uiCtx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#10203c');
      gradient.addColorStop(0.55, '#201633');
      gradient.addColorStop(1, '#0d0d16');
      uiCtx.fillStyle = gradient;
      uiCtx.fillRect(0, 0, width, height);
    }

    uiCtx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let index = 0; index < state.particles.length; index += 1) {
      const particle = state.particles[index];
      uiCtx.beginPath();
      uiCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      uiCtx.fill();
    }

    uiCtx.fillStyle = 'rgba(0,0,0,0.22)';
    uiCtx.fillRect(0, height * 0.45, width, height * 0.1);
    uiCtx.fillStyle = 'rgba(255,180,120,0.08)';
    uiCtx.fillRect(0, height * 0.53, width, height * 0.24);
  }

  function drawLanes(rects, board, isEnemy, tutorialState) {
    for (let index = 0; index < rects.length; index += 1) {
      const rect = rects[index];
      const summonLane = !isEnemy && tutorialState.highlightLaneIndices.indexOf(index) !== -1;
      const attackLane = !isEnemy && tutorialState.attackLaneIndices.indexOf(index) !== -1;
      const lanePulse = 0.55 + 0.45 * Math.sin(state.time * 6);
      uiCtx.strokeStyle = isEnemy
        ? 'rgba(119, 220, 255, 0.35)'
        : summonLane
          ? 'rgba(255, 222, 123, ' + (0.55 + lanePulse * 0.45) + ')'
          : attackLane
            ? 'rgba(125, 230, 200, ' + (0.5 + lanePulse * 0.5) + ')'
            : (state.selectedCard !== -1 && !board[index] ? 'rgba(255, 222, 123, 0.95)' : 'rgba(255, 255, 255, 0.18)');
      uiCtx.lineWidth = state.hoveredLane === index && !isEnemy ? 4 : 2;
      roundRect(uiCtx, rect.x, rect.y, rect.w, rect.h, 18);
      uiCtx.stroke();
      if (!board[index]) {
        uiCtx.fillStyle = 'rgba(255,255,255,0.08)';
        uiCtx.font = 'bold 24px Arial';
        uiCtx.textAlign = 'center';
        uiCtx.fillText(isEnemy ? 'Enemy lane' : (summonLane ? 'Summon here' : 'Drop here'), rect.x + rect.w / 2, rect.y + rect.h / 2);
      } else {
        drawCard(rect, board[index], isEnemy, false);
        if (attackLane) {
          uiCtx.fillStyle = 'rgba(125, 230, 200, 0.18)';
          roundRect(uiCtx, rect.x, rect.y, rect.w, rect.h, 18);
          uiCtx.fill();
          uiCtx.fillStyle = '#d8fff2';
          uiCtx.font = 'bold 18px Arial';
          uiCtx.fillText('Ready to attack', rect.x + rect.w / 2, rect.y - 10);
        }
      }
    }
  }

  function drawHand(rects, tutorialState) {
    for (let index = 0; index < rects.length; index += 1) {
      const rect = rects[index];
      const hovered = index === state.hoveredCard;
      const centerOffset = index - (rects.length - 1) / 2;
      const pointerShift = ((state.pointerX / Math.max(canvas.width, 1)) - 0.5) * 0.12;
      const lift = hovered ? -24 : Math.abs(centerOffset) * -4;
      const rotation = centerOffset * 0.08 + pointerShift;
      const card = state.game.player.hand[index];
      const playable = state.game.turn === 'player' && card.cost <= state.game.player.mana;
      drawCard({ x: rect.x, y: rect.y + lift, w: rect.w, h: rect.h }, card, false, playable, { rotation: rotation });
      if (playable) {
        const tutorialGlow = tutorialState.highlightHandIndices.indexOf(index) !== -1;
        const glowAlpha = tutorialGlow ? 0.55 + 0.45 * Math.sin(state.time * 7) : 0.95;
        uiCtx.strokeStyle = hovered ? 'rgba(255, 243, 164, 1)' : 'rgba(255, 206, 86, ' + glowAlpha + ')';
        uiCtx.lineWidth = 4;
        roundRect(uiCtx, rect.x - 2, rect.y + lift - 2, rect.w + 4, rect.h + 4, 20);
        uiCtx.stroke();
      }
    }
  }

  function drawAnimationGhosts() {
    for (let index = 0; index < state.fx.ghosts.length; index += 1) {
      const ghost = state.fx.ghosts[index];
      drawCard(ghost.rect, ghost.card, false, false, { alpha: ghost.alpha * 0.75, rotation: 0.03 });
    }
  }

  function drawAnimationMotions() {
    for (let index = 0; index < state.fx.motions.length; index += 1) {
      const motion = state.fx.motions[index];
      drawCard(motion.rect, motion.card, false, false, { alpha: motion.alpha, rotation: motion.rotation || 0.02 });
    }
  }

  function drawAnimationFlashes() {
    for (let index = 0; index < state.fx.flashes.length; index += 1) {
      const flash = state.fx.flashes[index];
      uiCtx.fillStyle = 'rgba(' + flash.color + ',' + flash.alpha + ')';
      roundRect(uiCtx, flash.x, flash.y, flash.w, flash.h, 18);
      uiCtx.fill();
    }
  }

  function drawCard(rect, card, isEnemy, playable, options) {
    const settings = options || {};
    const frame = card.faction === 'ember' ? imageCache.frameEmber : imageCache.frameVerdant;
    const art = imageCache[card.key];
    const localRect = { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h };
    uiCtx.save();
    uiCtx.globalAlpha = settings.alpha === undefined ? 1 : settings.alpha;
    uiCtx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    if (settings.rotation) {
      uiCtx.rotate(settings.rotation);
    }
    if (frame) {
      uiCtx.drawImage(frame, localRect.x, localRect.y, localRect.w, localRect.h);
      if (art) {
        uiCtx.drawImage(art, localRect.x + localRect.w * 0.08, localRect.y + localRect.h * 0.12, localRect.w * 0.84, localRect.h * 0.42);
      }
      uiCtx.fillStyle = 'rgba(255,255,255,0.94)';
      uiCtx.font = 'bold 18px Georgia';
      uiCtx.textAlign = 'left';
      uiCtx.fillText(card.name, localRect.x + 18, localRect.y + 24);
      uiCtx.font = '16px Georgia';
      uiCtx.fillText(String(card.cost), localRect.x + 20, localRect.y + 52);
      uiCtx.font = '14px Georgia';
      wrapCardText(card.text, localRect.x + 16, localRect.y + localRect.h - 56, localRect.w - 32, 16);
    } else {
      const fallback = getCardTexture(card);
      uiCtx.drawImage(fallback, localRect.x, localRect.y, localRect.w, localRect.h);
    }
    uiCtx.strokeStyle = playable ? '#ffd461' : (card.faction === 'ember' ? '#ff9866' : '#7de6c8');
    uiCtx.lineWidth = playable ? 4 : 2;
    roundRect(uiCtx, localRect.x, localRect.y, localRect.w, localRect.h, 18);
    uiCtx.stroke();
    if (card.type === 'unit') {
      badge(localRect.x + 18, localRect.y + localRect.h - 24, card.attack, '#f46752');
      badge(localRect.x + localRect.w - 18, localRect.y + localRect.h - 24, card.health, '#4ac7a0');
      if (card.exhausted) {
        uiCtx.fillStyle = 'rgba(8, 14, 20, 0.52)';
        roundRect(uiCtx, localRect.x, localRect.y, localRect.w, localRect.h, 18);
        uiCtx.fill();
      }
    } else {
      uiCtx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      uiCtx.font = 'bold 22px Arial';
      uiCtx.textAlign = 'center';
      uiCtx.fillText('Spell', 0, localRect.y + localRect.h - 22);
    }
    if (isEnemy) {
      uiCtx.fillStyle = 'rgba(7, 11, 20, 0.32)';
      roundRect(uiCtx, localRect.x, localRect.y, localRect.w, localRect.h, 18);
      uiCtx.fill();
    }
    uiCtx.restore();
  }

  function badge(x, y, value, color) {
    uiCtx.fillStyle = color;
    uiCtx.beginPath();
    uiCtx.arc(x, y, 16, 0, Math.PI * 2);
    uiCtx.fill();
    uiCtx.fillStyle = 'white';
    uiCtx.font = 'bold 18px Arial';
    uiCtx.textAlign = 'center';
    uiCtx.fillText(String(value), x, y + 6);
  }

  function drawHud(layout, tutorialState) {
    const player = state.game.player;
    const enemy = state.game.enemy;
    panel(28, canvas.height - 152, 236, 116, '#ff9d68', player.hero || 'Captain Sol', player.health, player.mana, player.maxMana, player.deck.length, imageCache.heroPlayer);
    panel(28, 28, 236, 116, '#7de6c8', enemy.hero || 'Oracle Nera', enemy.health, enemy.mana, enemy.maxMana, enemy.deck.length, imageCache.heroAi);
    const endTurnColor = tutorialState.endTurnPulse
      ? 'rgba(255, 208, 109, ' + (0.62 + 0.38 * Math.sin(state.time * 7)) + ')'
      : (state.game.turn === 'player' ? '#ffc66d' : '#71849b');
    button(layout.endTurn.x, layout.endTurn.y, layout.endTurn.w, layout.endTurn.h, endTurnColor, state.game.turn === 'player' ? 'End Turn' : 'Enemy Turn');

    uiCtx.fillStyle = 'rgba(255,255,255,0.92)';
    uiCtx.font = 'bold 28px Arial';
    uiCtx.textAlign = 'center';
    uiCtx.fillText('Emberfall Duel', canvas.width * 0.5, 44);
    uiCtx.font = '20px Arial';
    uiCtx.fillText(tutorialState.prompt || state.message, canvas.width * 0.5, canvas.height - 18);

    for (let index = 0; index < state.fx.sweeps.length; index += 1) {
      const sweep = state.fx.sweeps[index];
      uiCtx.fillStyle = 'rgba(255, 236, 186,' + (sweep.alpha * 0.22) + ')';
      uiCtx.fillRect(0, canvas.height * 0.5 - 120, canvas.width, 64);
      uiCtx.fillStyle = sweep.color;
      uiCtx.font = 'bold 46px Arial';
      uiCtx.fillText(sweep.text, canvas.width * 0.5, canvas.height * 0.5 - 78);
    }

    for (let popIndex = 0; popIndex < state.fx.damageNumbers.length; popIndex += 1) {
      const pop = state.fx.damageNumbers[popIndex];
      uiCtx.fillStyle = pop.color;
      uiCtx.globalAlpha = pop.alpha;
      uiCtx.font = 'bold 34px Arial';
      uiCtx.fillText(pop.text, pop.x, pop.y);
      uiCtx.globalAlpha = 1;
    }

    if (state.game.winner) {
      uiCtx.fillStyle = 'rgba(5, 8, 20, 0.74)';
      uiCtx.fillRect(0, 0, canvas.width, canvas.height);
      uiCtx.fillStyle = '#fff2ca';
      uiCtx.font = 'bold 64px Arial';
      uiCtx.fillText(state.game.winner === 'player' ? 'Victory' : 'Defeat', canvas.width * 0.5, canvas.height * 0.46);
      uiCtx.font = '26px Arial';
      uiCtx.fillText('Click anywhere to start a new duel.', canvas.width * 0.5, canvas.height * 0.54);
    }
  }

  function panel(x, y, w, h, accent, hero, health, mana, maxMana, deck, art) {
    uiCtx.fillStyle = 'rgba(5, 10, 20, 0.62)';
    roundRect(uiCtx, x, y, w, h, 20);
    uiCtx.fill();
    uiCtx.fillStyle = accent;
    uiCtx.fillRect(x, y, 10, h);
    if (art) {
      uiCtx.drawImage(art, x + 20, y + 14, 72, 72);
    }
    uiCtx.fillStyle = 'white';
    uiCtx.font = 'bold 24px Arial';
    uiCtx.textAlign = 'left';
    uiCtx.fillText(hero, x + 104, y + 34);
    uiCtx.font = '20px Arial';
    uiCtx.fillText('Health ' + health, x + 104, y + 62);
    uiCtx.fillText('Mana ' + mana + '/' + maxMana, x + 104, y + 88);
    uiCtx.fillText('Deck ' + deck, x + 104, y + 110);
  }

  function button(x, y, w, h, color, label) {
    uiCtx.fillStyle = color;
    roundRect(uiCtx, x, y, w, h, 16);
    uiCtx.fill();
    uiCtx.fillStyle = '#111827';
    uiCtx.font = 'bold 24px Arial';
    uiCtx.textAlign = 'center';
    uiCtx.fillText(label, x + w / 2, y + 42);
  }

  function drawTooltip(layout, tutorialState) {
    if (state.hoveredCard === -1) {
      return;
    }
    const card = state.game.player.hand[state.hoveredCard];
    const rect = layout.playerHand[state.hoveredCard];
    const x = Math.max(20, Math.min(canvas.width - 290, rect.x));
    const y = rect.y - 112;
    uiCtx.fillStyle = 'rgba(5, 10, 20, 0.95)';
    roundRect(uiCtx, x, y, 280, 96, 14);
    uiCtx.fill();
    uiCtx.fillStyle = 'white';
    uiCtx.textAlign = 'left';
    uiCtx.font = 'bold 20px Arial';
    uiCtx.fillText(card.name + ' - ' + card.cost + ' mana', x + 16, y + 28);
    uiCtx.font = '18px Arial';
    uiCtx.fillText(card.text, x + 16, y + 56);
    uiCtx.fillText(tutorialState.highlightHandIndices.indexOf(state.hoveredCard) !== -1 ? tutorialState.prompt : (card.type === 'unit' ? 'Click, then choose a lane.' : 'Click to cast at the first enemy.'), x + 16, y + 82);
  }

  function getCardTexture(card) {
    if (!cardArtCache[card.id]) {
      const art = document.createElement('canvas');
      art.width = 280;
      art.height = 400;
      const ctx = art.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, 400);
      if (card.faction === 'ember') {
        bg.addColorStop(0, '#552012');
        bg.addColorStop(1, '#1d0f1f');
      } else {
        bg.addColorStop(0, '#183f39');
        bg.addColorStop(1, '#142133');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 280, 400);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(14, 14, 252, 372);
      const artGradient = ctx.createRadialGradient(140, 160, 10, 140, 160, 130);
      artGradient.addColorStop(0, card.faction === 'ember' ? '#ffd39a' : '#d7fff1');
      artGradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = artGradient;
      ctx.beginPath();
      ctx.arc(140, 154, 116, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = card.faction === 'ember' ? '#ff9059' : '#78dfc6';
      if (card.key.indexOf('fox') !== -1 || card.key.indexOf('wisp') !== -1) {
        ctx.beginPath();
        ctx.moveTo(140, 78); ctx.lineTo(198, 170); ctx.lineTo(140, 238); ctx.lineTo(82, 170); ctx.closePath();
        ctx.fill();
      } else if (card.key.indexOf('drake') !== -1 || card.key.indexOf('beast') !== -1) {
        ctx.beginPath();
        ctx.moveTo(72, 206); ctx.lineTo(140, 84); ctx.lineTo(208, 206); ctx.lineTo(140, 252); ctx.closePath();
        ctx.fill();
        ctx.fillRect(128, 206, 24, 74);
      } else if (card.type === 'spell') {
        for (let index = 0; index < 3; index += 1) {
          ctx.beginPath();
          ctx.moveTo(112 + index * 12, 80 + index * 12);
          ctx.lineTo(172 - index * 10, 154 + index * 18);
          ctx.lineTo(128 + index * 14, 272 - index * 18);
          ctx.lineTo(162 - index * 8, 174);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillRect(96, 86, 88, 144);
      }
      ctx.fillStyle = 'white';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(card.cost), 40, 42);
      ctx.font = 'bold 26px Arial';
      ctx.fillText(card.name, 140, 318);
      ctx.font = '18px Arial';
      wrapText(ctx, card.text, 140, 346, 214, 22);
      cardArtCache[card.id] = art;
    }
    return cardArtCache[card.id];
  }

  function wrapText(ctx, text, centerX, startY, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let y = startY;
    for (let index = 0; index < words.length; index += 1) {
      const trial = line ? line + ' ' + words[index] : words[index];
      if (ctx.measureText(trial).width > maxWidth && line) {
        ctx.fillText(line, centerX, y);
        line = words[index];
        y += lineHeight;
      } else {
        line = trial;
      }
    }
    if (line) {
      ctx.fillText(line, centerX, y);
    }
  }

  function wrapCardText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let index = 0; index < words.length; index += 1) {
      const trial = line ? line + ' ' + words[index] : words[index];
      if (uiCtx.measureText(trial).width > maxWidth && line) {
        uiCtx.fillText(line, x, currentY);
        line = words[index];
        currentY += lineHeight;
      } else {
        line = trial;
      }
    }
    if (line) {
      uiCtx.fillText(line, x, currentY);
    }
  }

  function roundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function createRenderer(glContext) {
    const vertexShader = compile(glContext, glContext.VERTEX_SHADER, 'attribute vec2 a_position; attribute vec2 a_uv; varying vec2 v_uv; void main(){ v_uv=a_uv; gl_Position=vec4(a_position,0.0,1.0);}');
    const fragmentShader = compile(glContext, glContext.FRAGMENT_SHADER, 'precision mediump float; varying vec2 v_uv; uniform sampler2D u_tex; void main(){ gl_FragColor = texture2D(u_tex, v_uv);}');
    const program = glContext.createProgram();
    glContext.attachShader(program, vertexShader);
    glContext.attachShader(program, fragmentShader);
    glContext.linkProgram(program);
    const buffer = glContext.createBuffer();
    const texture = glContext.createTexture();
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);
    return {
      draw: function (sourceCanvas) {
        glContext.clearColor(0, 0, 0, 1);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
        glContext.useProgram(program);
        glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([
          -1, -1, 0, 1,
           1, -1, 1, 1,
          -1,  1, 0, 0,
          -1,  1, 0, 0,
           1, -1, 1, 1,
           1,  1, 1, 0,
        ]), glContext.STATIC_DRAW);
        glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, sourceCanvas);
        const position = glContext.getAttribLocation(program, 'a_position');
        const uv = glContext.getAttribLocation(program, 'a_uv');
        glContext.enableVertexAttribArray(position);
        glContext.enableVertexAttribArray(uv);
        glContext.vertexAttribPointer(position, 2, glContext.FLOAT, false, 16, 0);
        glContext.vertexAttribPointer(uv, 2, glContext.FLOAT, false, 16, 8);
        glContext.drawArrays(glContext.TRIANGLES, 0, 6);
      },
    };
  }

  function compile(glContext, type, source) {
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);
    return shader;
  }
})();
