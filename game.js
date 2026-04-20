(function () {
  const logic = window.AppleDuelLogic;
  const canvas = document.getElementById('game');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: true });

  if (!gl) {
    document.body.innerHTML = '<p style="color:white;padding:24px">WebGL is required to play Prism Duel.</p>';
    return;
  }

  const namespace = String(
    window.__RUN_STORAGE_NAMESPACE__ ||
    window.__BENCHMARK_RUN_STORAGE_NAMESPACE__ ||
    window.__APPLE_RUN_STORAGE_NAMESPACE__ ||
    window.APPLE_RUN_STORAGE_NAMESPACE ||
    window.RUN_STORAGE_NAMESPACE ||
    'apple:'
  );
  const storageKey = logic.createStorageKey(namespace);
  const designWidth = 1600;
  const designHeight = 900;
  const palette = {
    night: '#07131f',
    mist: '#0f2740',
    gold: '#ffd36a',
    coral: '#ff8b78',
    ink: '#e7eefc',
    sol: '#f7b85a',
    umbra: '#7f7bf7',
    panel: '#13263d',
  };

  let pointer = { x: 0, y: 0, down: false };
  let hitRegions = [];
  let sprites = {};
  let textCache = new Map();
  let previousLogLength = 0;
  let particles = [];
  let banner = { text: 'Your turn', ttl: 1.2 };
  let selectedAttacker = null;
  let cameraShake = 0;
  let entityMotion = {};
  let currentState = loadState() || logic.createInitialState(seedFromDate());
  saveState();
  pushLogEffects(currentState.log.slice(previousLogLength));
  previousLogLength = currentState.log.length;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const program = createProgram(
    'attribute vec2 a_position;attribute vec2 a_texcoord;uniform vec2 u_resolution;varying vec2 v_texcoord;void main(){vec2 zeroToOne=a_position/u_resolution;vec2 zeroToTwo=zeroToOne*2.0;vec2 clipSpace=zeroToTwo-1.0;gl_Position=vec4(clipSpace*vec2(1.0,-1.0),0.0,1.0);v_texcoord=a_texcoord;}',
    'precision mediump float;uniform sampler2D u_texture;uniform float u_alpha;varying vec2 v_texcoord;void main(){vec4 color=texture2D(u_texture,v_texcoord);gl_FragColor=vec4(color.rgb,color.a*u_alpha);}'
  );
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texcoordLocation = gl.getAttribLocation(program, 'a_texcoord');
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  const alphaLocation = gl.getUniformLocation(program, 'u_alpha');

  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mousedown', function () { pointer.down = true; });
  canvas.addEventListener('mouseup', function () { pointer.down = false; handleClick(); });
  canvas.addEventListener('mouseleave', function () { selectedAttacker = null; });
  canvas.addEventListener('touchstart', onTouch, { passive: false });
  canvas.addEventListener('touchmove', onTouch, { passive: false });
  canvas.addEventListener('touchend', function (event) {
    event.preventDefault();
    pointer.down = false;
    handleClick();
  }, { passive: false });

  resize();
  requestAnimationFrame(frame);

  function seedFromDate() {
    return Math.floor(Date.now() % 100000) + 1;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }
      return logic.deserializeState(raw);
    } catch (error) {
      return null;
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, logic.serializeState(currentState));
  }

  function replaceState(nextState, nextBanner) {
    currentState = nextState;
    if (nextBanner) {
      banner = { text: nextBanner, ttl: 1.4 };
    }
    pushLogEffects(currentState.log.slice(previousLogLength));
    previousLogLength = currentState.log.length;
    saveState();
  }

  function pushLogEffects(entries) {
    entries.forEach(function (entry, index) {
      if (entry.type === 'attack-hero' || entry.type === 'fatigue') {
        particles.push({
          type: 'text',
          text: '-' + entry.amount,
          x: designWidth * 0.5 + (Math.random() - 0.5) * 120,
          y: entry.side === 'player' ? 650 : 210,
          vy: -30,
          ttl: 1,
          color: '#ffb49b',
        });
        cameraShake = 14;
      }
      if (entry.type === 'unit-died') {
        particles.push({
          type: 'burst',
          x: entry.side === 'player' ? 520 + index * 8 : 1080 - index * 8,
          y: entry.side === 'player' ? 530 : 310,
          ttl: 0.8,
          color: entry.side === 'player' ? palette.sol : palette.umbra,
        });
      }
      if (entry.type === 'play-card') {
        particles.push({
          type: 'spark',
          x: entry.side === 'player' ? 530 : 1070,
          y: entry.side === 'player' ? 520 : 320,
          ttl: 0.6,
          color: entry.side === 'player' ? palette.sol : palette.umbra,
        });
      }
      if (entry.type === 'ai-turn-complete') {
        banner = { text: 'Your turn', ttl: 1.2 };
      }
    });
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) * canvas.width / rect.width;
    pointer.y = (event.clientY - rect.top) * canvas.height / rect.height;
  }

  function onTouch(event) {
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer.x = (touch.clientX - rect.left) * canvas.width / rect.width;
    pointer.y = (touch.clientY - rect.top) * canvas.height / rect.height;
    pointer.down = true;
  }

  function handleClick() {
    const region = hitRegions.slice().reverse().find(function (entry) {
      return pointer.x >= entry.x && pointer.x <= entry.x + entry.w && pointer.y >= entry.y && pointer.y <= entry.y + entry.h;
    });
    if (!region) {
      selectedAttacker = null;
      return;
    }

    if (region.type === 'new-game') {
      selectedAttacker = null;
      previousLogLength = 0;
      replaceState(logic.createInitialState(seedFromDate()), 'Fresh duel');
      return;
    }

    if (currentState.winner) {
      return;
    }

    if (region.type === 'end-turn' && currentState.currentPlayer === 'player') {
      selectedAttacker = null;
      banner = { text: 'Enemy turn', ttl: 1.0 };
      window.setTimeout(function () {
        replaceState(logic.endPlayerTurn(currentState), 'Enemy answered');
      }, 450);
      return;
    }

    if (region.type === 'hand-card' && currentState.currentPlayer === 'player') {
      const nextState = logic.playCard(currentState, 'player', region.id);
      if (nextState !== currentState) {
        replaceState(nextState, 'Card played');
      }
      return;
    }

    if (region.type === 'player-unit' && currentState.currentPlayer === 'player') {
      if (selectedAttacker === region.id) {
        selectedAttacker = null;
      } else {
        selectedAttacker = region.id;
      }
      return;
    }

    if ((region.type === 'enemy-unit' || region.type === 'enemy-hero') && selectedAttacker && currentState.currentPlayer === 'player') {
      const target = region.type === 'enemy-hero' ? 'hero' : region.id;
      const nextState = logic.attackWithUnit(currentState, 'player', selectedAttacker, target);
      selectedAttacker = null;
      replaceState(nextState, 'Strike');
    }
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function frame(now) {
    const time = now / 1000;
    hitRegions = [];
    updateParticles(1 / 60);
    drawScene(time);
    requestAnimationFrame(frame);
  }

  function updateParticles(dt) {
    banner.ttl = Math.max(0, banner.ttl - dt);
    cameraShake = Math.max(0, cameraShake - dt * 40);
    particles = particles.filter(function (particle) {
      particle.ttl -= dt;
      particle.y += (particle.vy || -10) * dt;
      return particle.ttl > 0;
    });
  }

  function drawScene(time) {
    const scale = Math.min(canvas.width / designWidth, canvas.height / designHeight);
    const offsetX = (canvas.width - designWidth * scale) * 0.5;
    const offsetY = (canvas.height - designHeight * scale) * 0.5;
    const shakeX = (Math.random() - 0.5) * cameraShake;
    const shakeY = (Math.random() - 0.5) * cameraShake;

    gl.clearColor(0.01, 0.04, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    drawTexture(getBoardTexture(), offsetX + shakeX, offsetY + shakeY, designWidth * scale, designHeight * scale, 1);
    drawHud(scale, offsetX + shakeX, offsetY + shakeY, time);
    drawHero('enemy', currentState.enemy, offsetX + 1150 * scale + shakeX, offsetY + 84 * scale + shakeY, 220 * scale, 220 * scale, time);
    drawHero('player', currentState.player, offsetX + 230 * scale + shakeX, offsetY + 592 * scale + shakeY, 220 * scale, 220 * scale, time);
    drawBoardSide('enemy', currentState.enemy.board, offsetX, offsetY, scale, time);
    drawBoardSide('player', currentState.player.board, offsetX, offsetY, scale, time);
    drawHand(currentState.player.hand, offsetX, offsetY, scale, time);
    drawDeckCount(currentState.enemy.deck.length, offsetX + 1360 * scale, offsetY + 95 * scale, scale, 'enemy');
    drawDeckCount(currentState.player.deck.length, offsetX + 62 * scale, offsetY + 684 * scale, scale, 'player');
    drawButtons(offsetX, offsetY, scale);
    drawGuide(offsetX, offsetY, scale);
    drawWinner(offsetX, offsetY, scale);
    drawParticles(offsetX, offsetY, scale);
  }

  function drawHud(scale, offsetX, offsetY, time) {
    drawTexture(getPanelTexture('enemy-hud', 400, 88, '#102138', '#7f7bf7'), offsetX + 600 * scale, offsetY + 26 * scale, 400 * scale, 88 * scale, 0.96);
    drawTexture(getPanelTexture('player-hud', 400, 88, '#15263f', '#f7b85a'), offsetX + 600 * scale, offsetY + 786 * scale, 400 * scale, 88 * scale, 0.96);
    drawText('Prism Duel', offsetX + 720 * scale, offsetY + 44 * scale, 30 * scale, palette.ink, 'center');
    drawText('Turn ' + currentState.turn, offsetX + 800 * scale, offsetY + 74 * scale, 18 * scale, '#d2ddf4', 'center');
    drawManaBar(currentState.enemy, offsetX + 620 * scale, offsetY + 85 * scale, scale, true, time);
    drawManaBar(currentState.player, offsetX + 620 * scale, offsetY + 845 * scale, scale, false, time);
  }

  function drawManaBar(side, x, y, scale, enemy, time) {
    for (let index = 0; index < 8; index += 1) {
      const filled = index < side.mana;
      const hue = enemy ? palette.umbra : palette.sol;
      const alpha = filled ? 0.96 : 0.3;
      const wobble = Math.sin(time * 2 + index) * 2 * scale;
      drawTexture(getCrystalTexture(hue, filled), x + index * 28 * scale, y + wobble, 22 * scale, 28 * scale, alpha);
    }
    drawText(side.mana + '/' + side.maxMana, x + 245 * scale, y + 14 * scale, 18 * scale, palette.ink, 'left');
  }

  function drawHero(sideName, side, x, y, w, h, time) {
    const pulse = Math.sin(time * 1.6 + (sideName === 'player' ? 0 : 1)) * 4;
    drawTexture(getHeroTexture(sideName), x, y + pulse, w, h, 1);
    drawText(sideName === 'player' ? 'Luma Captain' : 'Noctis Warden', x + w * 0.5, y + h + 24, 20, palette.ink, 'center');
    drawText(side.heroHealth + ' health', x + w * 0.5, y + h + 48, 18, sideName === 'player' ? '#ffd9c7' : '#d8d6ff', 'center');
    if (sideName === 'enemy') {
      hitRegions.push({ type: 'enemy-hero', id: 'hero', x: x, y: y, w: w, h: h });
    }
  }

  function drawBoardSide(sideName, board, offsetX, offsetY, scale, time) {
    const startX = sideName === 'player' ? 420 : 840;
    const y = sideName === 'player' ? 455 : 235;
    const direction = sideName === 'player' ? 1 : -1;

    board.forEach(function (card, index) {
      const x = startX + index * 138 * direction;
      const hover = pointerHits(offsetX + x * scale, offsetY + y * scale, 120 * scale, 160 * scale);
      const selected = selectedAttacker === card.instanceId;
      const targetY = y - (hover ? 12 : 0) - (selected ? 14 : 0) + Math.sin(time * 2 + index) * 3;
      const motion = getMotion(card.instanceId, x, targetY);
      drawTexture(getCardTexture(card), offsetX + motion.x * scale, offsetY + motion.y * scale, 120 * scale, 160 * scale, 1);
      drawText(card.attack + '', offsetX + (motion.x + 22) * scale, offsetY + (motion.y + 138) * scale, 24 * scale, '#ffe8d7', 'center');
      drawText((card.health - (card.damage || 0)) + '', offsetX + (motion.x + 98) * scale, offsetY + (motion.y + 138) * scale, 24 * scale, '#eaf4ff', 'center');
      if (card.keywords.indexOf('guard') !== -1) {
        drawText('Guard', offsetX + (motion.x + 60) * scale, offsetY + (motion.y + 22) * scale, 13 * scale, '#cfe5ff', 'center');
      }
      if (sideName === 'player' && card.canAttack) {
        drawTexture(getGlowTexture('#f8c86f'), offsetX + (motion.x - 8) * scale, offsetY + (motion.y - 8) * scale, 136 * scale, 176 * scale, 0.38);
      }
      hitRegions.push({ type: sideName === 'player' ? 'player-unit' : 'enemy-unit', id: card.instanceId, x: offsetX + motion.x * scale, y: offsetY + motion.y * scale, w: 120 * scale, h: 160 * scale });
    });
  }

  function drawHand(hand, offsetX, offsetY, scale, time) {
    const centerX = 800;
    const baseY = 690;
    hand.forEach(function (card, index) {
      const spread = (index - (hand.length - 1) / 2) * 110;
      const x = centerX + spread - 60;
      const y = baseY + Math.abs(spread) * 0.12;
      const hover = pointerHits(offsetX + x * scale, offsetY + y * scale, 120 * scale, 160 * scale);
      const playable = currentState.currentPlayer === 'player' && card.cost <= currentState.player.mana && currentState.player.board.length < logic.BOARD_LIMIT;
      const lift = hover ? 34 : 0;
      const pulse = playable ? 0.12 + 0.12 * (Math.sin(time * 4 + index) + 1) * 0.5 : 0;
      drawTexture(getCardTexture(card), offsetX + x * scale, offsetY + (y - lift) * scale, 120 * scale, 160 * scale, 1);
      if (playable) {
        drawTexture(getGlowTexture('#ffdc85'), offsetX + (x - 8) * scale, offsetY + (y - lift - 8) * scale, 136 * scale, 176 * scale, pulse + 0.15);
      }
      drawText(card.attack ? String(card.attack) : card.effect.amount + '', offsetX + (x + 22) * scale, offsetY + (y - lift + 138) * scale, 24 * scale, '#ffe8d7', 'center');
      drawText(card.type === 'unit' ? String(card.health) : card.type.toUpperCase(), offsetX + (x + 95) * scale, offsetY + (y - lift + 138) * scale, 18 * scale, '#e9f0ff', 'center');
      hitRegions.push({ type: 'hand-card', id: card.instanceId, x: offsetX + x * scale, y: offsetY + (y - lift) * scale, w: 120 * scale, h: 160 * scale });
    });
  }

  function drawDeckCount(count, x, y, scale, sideName) {
    drawTexture(getPanelTexture('deck-' + sideName, 112, 70, '#15263a', sideName === 'player' ? palette.sol : palette.umbra), x, y, 112 * scale, 70 * scale, 0.94);
    drawText('Deck ' + count, x + 56 * scale, y + 42 * scale, 18 * scale, palette.ink, 'center');
  }

  function drawButtons(offsetX, offsetY, scale) {
    const endTurnGlow = currentState.currentPlayer === 'player' && !currentState.winner;
    const newGameRect = { x: offsetX + 1260 * scale, y: offsetY + 785 * scale, w: 164 * scale, h: 54 * scale };
    const endTurnRect = { x: offsetX + 1100 * scale, y: offsetY + 785 * scale, w: 136 * scale, h: 54 * scale };
    drawTexture(getButtonTexture('End Turn', endTurnGlow ? '#ffb86d' : '#536173'), endTurnRect.x, endTurnRect.y, endTurnRect.w, endTurnRect.h, 1);
    drawTexture(getButtonTexture('New Duel', '#648fe8'), newGameRect.x, newGameRect.y, newGameRect.w, newGameRect.h, 1);
    hitRegions.push({ type: 'end-turn', id: 'end-turn', x: endTurnRect.x, y: endTurnRect.y, w: endTurnRect.w, h: endTurnRect.h });
    hitRegions.push({ type: 'new-game', id: 'new-game', x: newGameRect.x, y: newGameRect.y, w: newGameRect.w, h: newGameRect.h });
  }

  function drawGuide(offsetX, offsetY, scale) {
    const prompt = currentState.winner ? winnerText() : tutorialText();
    drawTexture(getPanelTexture('guide', 520, 84, '#11233b', '#7fb5ff'), offsetX + 42 * scale, offsetY + 26 * scale, 520 * scale, 84 * scale, 0.95);
    drawText(prompt.title, offsetX + 72 * scale, offsetY + 58 * scale, 22 * scale, palette.ink, 'left');
    drawText(prompt.body, offsetX + 72 * scale, offsetY + 88 * scale, 16 * scale, '#c7d7f2', 'left');
    if (banner.ttl > 0) {
      drawTexture(getPanelTexture('banner', 260, 64, '#1a3657', '#ffd36a'), offsetX + 670 * scale, offsetY + 418 * scale, 260 * scale, 64 * scale, Math.min(1, banner.ttl));
      drawText(banner.text, offsetX + 800 * scale, offsetY + 458 * scale, 24 * scale, palette.ink, 'center');
    }
  }

  function tutorialText() {
    const playerCanPlay = currentState.player.hand.some(function (card) { return card.cost <= currentState.player.mana; });
    const readyUnit = currentState.player.board.some(function (card) { return card.canAttack; });
    if (currentState.currentPlayer !== 'player') {
      return { title: 'Enemy is moving', body: 'Watch their plays, then answer when the board lights back up.' };
    }
    if (playerCanPlay) {
      return { title: 'Play a glowing card', body: 'Cards with a golden aura are affordable this turn. Tap one to summon it.' };
    }
    if (readyUnit) {
      return { title: 'Attack from the front line', body: 'Tap one of your glowing units, then choose an enemy or the enemy hero.' };
    }
    return { title: 'Pass when you are ready', body: 'End Turn refills mana and lets the AI take its response.' };
  }

  function winnerText() {
    if (currentState.winner === 'player') {
      return { title: 'Victory', body: 'The prism holds. Start a fresh duel to run it back.' };
    }
    if (currentState.winner === 'enemy') {
      return { title: 'Defeat', body: 'Noctis broke through. Start a fresh duel and pressure earlier.' };
    }
    return { title: 'Draw', body: 'Both heroes fell together. Start a new duel to settle it.' };
  }

  function drawWinner(offsetX, offsetY, scale) {
    if (!currentState.winner) {
      return;
    }
    drawTexture(getPanelTexture('winner', 540, 150, '#13263e', '#ffd36a'), offsetX + 530 * scale, offsetY + 358 * scale, 540 * scale, 150 * scale, 0.98);
    drawText(winnerText().title, offsetX + 800 * scale, offsetY + 420 * scale, 38 * scale, palette.ink, 'center');
    drawText(winnerText().body, offsetX + 800 * scale, offsetY + 458 * scale, 18 * scale, '#ccdcf5', 'center');
  }

  function drawParticles(offsetX, offsetY, scale) {
    particles.forEach(function (particle) {
      if (particle.type === 'text') {
        drawText(particle.text, offsetX + particle.x * scale, offsetY + particle.y * scale, 28 * scale, particle.color, 'center');
      } else {
        drawTexture(getGlowTexture(particle.color), offsetX + (particle.x - 42) * scale, offsetY + (particle.y - 42) * scale, 84 * scale, 84 * scale, Math.max(0, particle.ttl));
      }
    });
  }

  function pointerHits(x, y, w, h) {
    return pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;
  }

  function getMotion(id, targetX, targetY) {
    const current = entityMotion[id] || { x: targetX, y: targetY };
    current.x += (targetX - current.x) * 0.18;
    current.y += (targetY - current.y) * 0.18;
    entityMotion[id] = current;
    return current;
  }

  function createProgram(vertexSource, fragmentSource) {
    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    return shaderProgram;
  }

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function drawTexture(texture, x, y, w, h, alpha) {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texcoordLocation);
    gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 16, 8);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(alphaLocation, alpha == null ? 1 : alpha);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const x1 = x;
    const y1 = y;
    const x2 = x + w;
    const y2 = y + h;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      x1, y1, 0, 0,
      x2, y1, 1, 0,
      x1, y2, 0, 1,
      x1, y2, 0, 1,
      x2, y1, 1, 0,
      x2, y2, 1, 1,
    ]), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function makeTexture(key, width, height, painter) {
    if (sprites[key]) {
      return sprites[key];
    }
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    const ctx = surface.getContext('2d');
    painter(ctx, width, height);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface);
    sprites[key] = texture;
    return texture;
  }

  function getBoardTexture() {
    return makeTexture('board', 1600, 900, function (ctx, w, h) {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#0c1f33');
      gradient.addColorStop(0.55, '#16304f');
      gradient.addColorStop(1, '#08121d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      const nebula = ctx.createRadialGradient(800, 450, 40, 800, 450, 600);
      nebula.addColorStop(0, 'rgba(130,175,255,0.28)');
      nebula.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(225,236,255,0.12)';
      ctx.lineWidth = 3;
      roundedRect(ctx, 190, 120, 1220, 660, 38, false, true);
      roundedRect(ctx, 320, 210, 980, 180, 30, false, true);
      roundedRect(ctx, 320, 430, 980, 180, 30, false, true);
      for (let index = 0; index < 80; index += 1) {
        ctx.fillStyle = index % 2 ? 'rgba(255,213,122,0.08)' : 'rgba(129,126,255,0.08)';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function getCardTexture(card) {
    return makeTexture('card-' + card.id, 240, 320, function (ctx, w, h) {
      const isSol = card.faction === 'sol';
      const accent = isSol ? palette.sol : palette.umbra;
      const deep = isSol ? '#533516' : '#241f55';
      const sky = isSol ? '#ffe4ab' : '#d7d7ff';
      const frame = ctx.createLinearGradient(0, 0, 0, h);
      frame.addColorStop(0, accent);
      frame.addColorStop(1, deep);
      ctx.fillStyle = frame;
      roundedRect(ctx, 0, 0, w, h, 26, true);
      ctx.fillStyle = '#102030';
      roundedRect(ctx, 12, 12, w - 24, h - 24, 18, true);
      const art = ctx.createLinearGradient(0, 36, w, 230);
      art.addColorStop(0, isSol ? '#fff1d2' : '#d8d5ff');
      art.addColorStop(1, isSol ? '#c56d32' : '#4b4294');
      ctx.fillStyle = art;
      roundedRect(ctx, 24, 44, w - 48, 150, 18, true);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let index = 0; index < 6; index += 1) {
        ctx.beginPath();
        ctx.arc(40 + index * 30, 70 + (index % 2) * 20, 24 + index * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = sky;
      ctx.beginPath();
      ctx.moveTo(w * 0.48, 82);
      ctx.lineTo(w * 0.66, 168);
      ctx.lineTo(w * 0.34, 168);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(w * 0.45, 102, 22, 80);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(w * 0.5, 132, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f7ff';
      ctx.font = 'bold 22px Trebuchet MS';
      ctx.textAlign = 'left';
      ctx.fillText(card.name, 24, 230);
      ctx.font = '15px Trebuchet MS';
      ctx.fillStyle = '#d9e4ff';
      ctx.fillText(card.type === 'unit' ? keywordLine(card) : spellLine(card), 24, 258);
      ctx.fillStyle = accent;
      roundedRect(ctx, 18, 18, 42, 42, 14, true);
      ctx.fillStyle = '#091017';
      ctx.font = 'bold 26px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText(String(card.cost), 39, 48);
      ctx.textAlign = 'left';
    });
  }

  function keywordLine(card) {
    return card.keywords.length ? card.keywords.join(', ') : 'Frontline unit';
  }

  function spellLine(card) {
    if (card.effect.kind === 'damage') {
      return 'Deal ' + card.effect.amount + ' damage';
    }
    if (card.effect.kind === 'drain') {
      return 'Drain ' + card.effect.amount;
    }
    return 'Empower your board';
  }

  function getHeroTexture(sideName) {
    return makeTexture('hero-' + sideName, 220, 220, function (ctx, w, h) {
      const accent = sideName === 'player' ? palette.sol : palette.umbra;
      const glow = ctx.createRadialGradient(w / 2, h / 2, 12, w / 2, h / 2, w / 2);
      glow.addColorStop(0, sideName === 'player' ? '#fff1c1' : '#d8d2ff');
      glow.addColorStop(1, accent);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 104, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1420';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 88, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sideName === 'player' ? '#ffe4b1' : '#dbd9ff';
      ctx.beginPath();
      ctx.arc(w / 2, 85, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w / 2 - 28, 118, 56, 58);
      ctx.fillStyle = accent;
      ctx.fillRect(w / 2 - 50, 130, 100, 18);
      ctx.beginPath();
      ctx.moveTo(w / 2 - 58, 176);
      ctx.lineTo(w / 2 + 58, 176);
      ctx.lineTo(w / 2, 210);
      ctx.closePath();
      ctx.fill();
    });
  }

  function getPanelTexture(key, width, height, fill, stroke) {
    return makeTexture('panel-' + key, width, height, function (ctx, w, h) {
      ctx.fillStyle = fill;
      roundedRect(ctx, 0, 0, w, h, 24, true);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 4;
      roundedRect(ctx, 2, 2, w - 4, h - 4, 22, false, true);
    });
  }

  function getButtonTexture(label, accent) {
    return makeTexture('button-' + label + accent, 200, 80, function (ctx, w, h) {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, accent);
      gradient.addColorStop(1, '#132940');
      ctx.fillStyle = gradient;
      roundedRect(ctx, 0, 0, w, h, 24, true);
      ctx.strokeStyle = 'rgba(255,255,255,0.24)';
      ctx.lineWidth = 3;
      roundedRect(ctx, 2, 2, w - 4, h - 4, 22, false, true);
      ctx.fillStyle = '#08131f';
      ctx.font = 'bold 26px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, 48);
    });
  }

  function getGlowTexture(color) {
    return makeTexture('glow-' + color, 128, 128, function (ctx, w, h) {
      const glow = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function getCrystalTexture(color, filled) {
    return makeTexture('crystal-' + color + String(filled), 44, 56, function (ctx, w, h) {
      ctx.fillStyle = filled ? color : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w - 4, h * 0.34);
      ctx.lineTo(w * 0.68, h - 2);
      ctx.lineTo(w * 0.32, h - 2);
      ctx.lineTo(4, h * 0.34);
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawText(text, x, y, size, color, align) {
    const key = [text, Math.round(size), color, align].join('|');
    if (!textCache.has(key)) {
      const surface = document.createElement('canvas');
      const width = Math.max(4, Math.ceil(text.length * size * 0.72 + 30));
      const height = Math.ceil(size * 1.8 + 20);
      surface.width = width;
      surface.height = height;
      const ctx = surface.getContext('2d');
      ctx.font = 'bold ' + Math.round(size) + 'px Trebuchet MS';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(3,10,18,0.8)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      const drawX = align === 'center' ? width / 2 : 6;
      ctx.fillText(text, drawX, height / 2);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface);
      textCache.set(key, { texture: texture, width: width, height: height });
    }
    const entry = textCache.get(key);
    const drawX = align === 'center' ? x - entry.width / 2 : x;
    drawTexture(entry.texture, drawX, y - entry.height / 2, entry.width, entry.height, 1);
  }

  function roundedRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }
})();
