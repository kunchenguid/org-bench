(function initGlassReefDuel() {
  const canvas = document.getElementById('game');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });

  if (!gl) {
    document.body.textContent = 'WebGL is required to play Glass Reef Duel.';
    return;
  }

  const Core = window.GameCore;
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d');
  const DPR_LIMIT = 2;
  const STORAGE_KEY = `${resolveStorageNamespace()}:glass-reef-duel:state`;
  const sceneTexture = createSceneTexture(gl);
  const pipeline = createPipeline(gl);
  const assets = new Map();
  const particles = createParticles(40);
  const hitBubbles = [];
  const ui = { hover: null, pressed: null, selectedAttacker: null, rects: [] };
  const baseLayout = { width: 1600, height: 900 };
  let lastTime = performance.now();
  let bannerTimer = 1.8;
  let winnerTimer = 0;
  let state = loadSavedState() || Core.createInitialState(Date.now() % 100000);

  const imagePaths = [
    'assets/board/glass-reef.svg',
    'assets/heroes/astra.svg',
    'assets/heroes/morrow.svg',
  ];

  Object.keys(Core.CARD_LIBRARY).forEach((key) => imagePaths.push(Core.CARD_LIBRARY[key].art));

  Promise.all(imagePaths.map(loadImage)).then((loaded) => {
    loaded.forEach((image, index) => assets.set(imagePaths[index], image));
    saveState();
    requestAnimationFrame(frame);
  });

  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerLeave);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  resize();

  function resolveStorageNamespace() {
    return window.__RUN_STORAGE_NAMESPACE__
      || window.__BENCHMARK_RUN_NAMESPACE__
      || window.__BENCHMARK_STORAGE_NAMESPACE__
      || window.__APPLE_RUN_STORAGE_NAMESPACE__
      || 'glass-reef-local';
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Core.restoreState(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, Core.serializeState(state));
    } catch (error) {
      // Ignore storage failures so play continues.
    }
  }

  function clearState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Ignore storage failures so reset still works.
    }
  }

  function createSceneTexture(context) {
    const texture = context.createTexture();
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    return texture;
  }

  function createPipeline(context) {
    const vertexShader = compileShader(context, context.VERTEX_SHADER, [
      'attribute vec2 position;',
      'varying vec2 uv;',
      'void main() {',
      '  uv = (position + 1.0) * 0.5;',
      '  gl_Position = vec4(position, 0.0, 1.0);',
      '}',
    ].join('\n'));
    const fragmentShader = compileShader(context, context.FRAGMENT_SHADER, [
      'precision mediump float;',
      'varying vec2 uv;',
      'uniform sampler2D scene;',
      'uniform float time;',
      'void main() {',
      '  vec2 centered = uv - 0.5;',
      '  float vignette = 1.0 - dot(centered, centered) * 0.65;',
      '  vec4 color = texture2D(scene, vec2(uv.x, 1.0 - uv.y));',
      '  float shimmer = 0.015 * sin(time * 0.75 + uv.y * 10.0);',
      '  color.rgb += vec3(0.0, 0.06, 0.09) * shimmer;',
      '  gl_FragColor = vec4(color.rgb * vignette, 1.0);',
      '}',
    ].join('\n'));
    const program = context.createProgram();
    context.attachShader(program, vertexShader);
    context.attachShader(program, fragmentShader);
    context.linkProgram(program);

    const buffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      context.STATIC_DRAW,
    );

    return {
      program,
      buffer,
      position: context.getAttribLocation(program, 'position'),
      scene: context.getUniformLocation(program, 'scene'),
      time: context.getUniformLocation(program, 'time'),
    };
  }

  function compileShader(context, type, source) {
    const shader = context.createShader(type);
    context.shaderSource(shader, source);
    context.compileShader(shader);
    return shader;
  }

  function createParticles(count) {
    const output = [];
    for (let index = 0; index < count; index += 1) {
      output.push({
        x: Math.random() * baseLayout.width,
        y: Math.random() * baseLayout.height,
        speed: 18 + Math.random() * 26,
        radius: 1 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return output;
  }

  function loadImage(path) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = path;
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function frame(now) {
    const delta = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    bannerTimer = Math.max(0, bannerTimer - delta);
    winnerTimer += state.winner ? delta : 0;

    updateParticles(delta);
    updateBubbles(delta);
    renderScene(now / 1000);
    blitScene(now / 1000);
    requestAnimationFrame(frame);
  }

  function updateParticles(delta) {
    particles.forEach((particle) => {
      particle.y -= particle.speed * delta;
      particle.x += Math.sin((lastTime / 1000) + particle.phase) * 6 * delta;
      if (particle.y < -20) {
        particle.y = baseLayout.height + 20;
        particle.x = Math.random() * baseLayout.width;
      }
    });
  }

  function updateBubbles(delta) {
    for (let index = hitBubbles.length - 1; index >= 0; index -= 1) {
      hitBubbles[index].life -= delta;
      hitBubbles[index].y -= 70 * delta;
      if (hitBubbles[index].life <= 0) {
        hitBubbles.splice(index, 1);
      }
    }
  }

  function blitScene(time) {
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
    gl.useProgram(pipeline.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, pipeline.buffer);
    gl.enableVertexAttribArray(pipeline.position);
    gl.vertexAttribPointer(pipeline.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(pipeline.scene, 0);
    gl.uniform1f(pipeline.time, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function renderScene(time) {
    sceneCanvas.width = baseLayout.width;
    sceneCanvas.height = baseLayout.height;
    ui.rects = [];

    const background = assets.get('assets/board/glass-reef.svg');
    sceneCtx.clearRect(0, 0, sceneCanvas.width, sceneCanvas.height);
    if (background) {
      sceneCtx.drawImage(background, 0, 0, baseLayout.width, baseLayout.height);
    }

    drawAmbient(time);
    drawTurnLanes();
    drawHeroPanel(state.enemy, 1040, 92, 340, 170, assets.get('assets/heroes/morrow.svg'), true, time);
    drawHeroPanel(state.player, 220, 638, 340, 170, assets.get('assets/heroes/astra.svg'), false, time);
    drawDeckHud();
    drawBoard(state.enemy.board, 470, 235, true, time);
    drawBoard(state.player.board, 470, 495, false, time);
    drawHand(time);
    drawHints();
    drawButtons();
    drawLog();
    drawBubbles();
    drawBanner();
    drawWinner();
  }

  function drawAmbient(time) {
    sceneCtx.save();
    particles.forEach((particle) => {
      const alpha = 0.24 + 0.15 * Math.sin(time * 1.8 + particle.phase);
      sceneCtx.fillStyle = `rgba(123, 235, 255, ${alpha})`;
      sceneCtx.beginPath();
      sceneCtx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      sceneCtx.fill();
    });
    sceneCtx.restore();
  }

  function drawTurnLanes() {
    sceneCtx.save();
    sceneCtx.strokeStyle = 'rgba(138, 242, 255, 0.18)';
    sceneCtx.lineWidth = 6;
    sceneCtx.strokeRect(440, 210, 720, 160);
    sceneCtx.strokeRect(440, 470, 720, 160);
    sceneCtx.restore();
  }

  function drawHeroPanel(side, x, y, width, height, portrait, isEnemy, time) {
    const pulse = state.currentSide === (isEnemy ? 'enemy' : 'player') ? 1 : 0.65;
    sceneCtx.save();
    sceneCtx.fillStyle = isEnemy ? 'rgba(7, 19, 36, 0.92)' : 'rgba(41, 18, 12, 0.92)';
    roundRect(sceneCtx, x, y, width, height, 28, true, false);
    sceneCtx.strokeStyle = isEnemy ? 'rgba(121, 222, 255, 0.6)' : 'rgba(255, 183, 102, 0.65)';
    sceneCtx.lineWidth = 4;
    roundRect(sceneCtx, x, y, width, height, 28, false, true);
    if (portrait) {
      const bob = Math.sin(time * 1.8 + (isEnemy ? 2 : 0)) * 4;
      sceneCtx.drawImage(portrait, x + 16, y + 14 + bob, 132, 132);
    }
    sceneCtx.fillStyle = '#f2f7ff';
    sceneCtx.font = '700 30px Georgia';
    sceneCtx.fillText(side.hero.name, x + 164, y + 48);
    sceneCtx.fillStyle = 'rgba(255,255,255,0.7)';
    sceneCtx.font = '600 18px Georgia';
    sceneCtx.fillText(isEnemy ? 'Moon Tide Regent' : 'Sun Court Duelist', x + 164, y + 74);
    drawHealthBar(x + 164, y + 102, 150, 20, side.hero.health, side.hero.maxHealth, isEnemy ? '#6de4ff' : '#ffad66');
    drawManaPips(side, x + 164, y + 132, isEnemy ? '#6de4ff' : '#ffd37a');
    sceneCtx.fillStyle = `rgba(255,255,255,${0.28 + 0.3 * pulse})`;
    sceneCtx.font = '600 16px Georgia';
    sceneCtx.fillText(state.currentSide === (isEnemy ? 'enemy' : 'player') ? 'Active turn' : 'Waiting', x + 164, y + 158);
    sceneCtx.restore();

    if (isEnemy) {
      const heroRect = { x: x + 16, y: y + 14, width: 132, height: 132, type: 'enemy-hero' };
      ui.rects.push(heroRect);
    }
  }

  function drawHealthBar(x, y, width, height, value, maxValue, color) {
    sceneCtx.save();
    sceneCtx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(sceneCtx, x, y, width, height, 10, true, false);
    sceneCtx.fillStyle = color;
    roundRect(sceneCtx, x, y, width * Math.max(0, value) / maxValue, height, 10, true, false);
    sceneCtx.fillStyle = '#08141f';
    sceneCtx.font = '700 15px Arial';
    sceneCtx.fillText(`${value} / ${maxValue}`, x + 50, y + 15);
    sceneCtx.restore();
  }

  function drawManaPips(side, x, y, color) {
    for (let index = 0; index < 10; index += 1) {
      sceneCtx.save();
      sceneCtx.translate(x + index * 16, y);
      sceneCtx.fillStyle = index < side.mana ? color : 'rgba(255,255,255,0.14)';
      sceneCtx.beginPath();
      sceneCtx.moveTo(0, 8);
      sceneCtx.lineTo(7, 0);
      sceneCtx.lineTo(14, 8);
      sceneCtx.lineTo(7, 16);
      sceneCtx.closePath();
      sceneCtx.fill();
      sceneCtx.restore();
    }
  }

  function drawDeckHud() {
    sceneCtx.save();
    sceneCtx.fillStyle = 'rgba(255,255,255,0.82)';
    sceneCtx.font = '600 18px Georgia';
    sceneCtx.fillText(`Your deck ${state.player.deck.length}`, 220, 612);
    sceneCtx.fillText(`Enemy deck ${state.enemy.deck.length}`, 1042, 286);
    sceneCtx.restore();
  }

  function drawBoard(board, startX, startY, isEnemy, time) {
    board.forEach((unit, index) => {
      const x = startX + index * 138;
      const y = startY + Math.sin(time * 1.7 + index) * 5;
      const rect = drawCardUnit(unit, x, y, 120, 148, isEnemy, index, time);
      ui.rects.push(rect);
    });
  }

  function drawCardUnit(unit, x, y, width, height, isEnemy, index, time) {
    const hovered = isPointInRect(ui.hover, { x, y, width, height });
    const selected = !isEnemy && ui.selectedAttacker === index;
    sceneCtx.save();
    sceneCtx.translate(x + width / 2, y + height / 2);
    sceneCtx.rotate((hovered ? 0.01 : 0) + Math.sin(time * 1.3 + index) * 0.015);
    const scale = hovered || selected ? 1.04 : 1;
    sceneCtx.scale(scale, scale);
    sceneCtx.translate(-width / 2, -height / 2);
    sceneCtx.fillStyle = isEnemy ? 'rgba(8, 31, 57, 0.96)' : 'rgba(56, 23, 12, 0.96)';
    roundRect(sceneCtx, 0, 0, width, height, 18, true, false);
    sceneCtx.strokeStyle = isEnemy ? 'rgba(110, 228, 255, 0.72)' : 'rgba(255, 176, 92, 0.78)';
    sceneCtx.lineWidth = selected ? 6 : 3;
    roundRect(sceneCtx, 0, 0, width, height, 18, false, true);

    const art = assets.get(unit.art);
    if (art) {
      sceneCtx.drawImage(art, 10, 10, width - 20, 70);
    }

    sceneCtx.fillStyle = '#f4fbff';
    sceneCtx.font = '700 16px Georgia';
    sceneCtx.fillText(unit.name, 12, 100, width - 20);
    sceneCtx.fillStyle = 'rgba(255,255,255,0.78)';
    sceneCtx.font = '14px Georgia';
    sceneCtx.fillText(unit.sleeping ? 'Summoning sway' : (unit.hasAttacked ? 'Spent' : 'Ready'), 12, 120, width - 20);
    drawBadge(12, 126, 28, 28, '#ffb066', String(unit.attack));
    drawBadge(width - 40, 126, 28, 28, '#72e6ff', String(unit.health));
    sceneCtx.restore();

    return { x, y, width, height, type: isEnemy ? 'enemy-unit' : 'player-unit', index };
  }

  function drawBadge(x, y, width, height, color, value) {
    sceneCtx.save();
    sceneCtx.fillStyle = color;
    roundRect(sceneCtx, x, y, width, height, 10, true, false);
    sceneCtx.fillStyle = '#07101a';
    sceneCtx.font = '700 16px Arial';
    sceneCtx.fillText(value, x + 10, y + 19);
    sceneCtx.restore();
  }

  function drawHand(time) {
    const hand = state.player.hand;
    const baseX = 470;
    hand.forEach((card, index) => {
      const x = baseX + index * 126;
      const y = 706 - Math.abs(index - (hand.length - 1) / 2) * 14;
      const hovered = isPointInRect(ui.hover, { x, y, width: 118, height: 162 });
      const playable = Core.canPlayCard(state, index);

      sceneCtx.save();
      sceneCtx.translate(x + 59, y + 81);
      sceneCtx.rotate((index - (hand.length - 1) / 2) * 0.05 + Math.sin(time * 1.5 + index) * 0.01);
      sceneCtx.translate(-(x + 59), -(y + 81));
      if (hovered) {
        sceneCtx.translate(0, -18);
      }
      sceneCtx.fillStyle = playable ? 'rgba(56, 24, 10, 0.98)' : 'rgba(34, 34, 40, 0.95)';
      roundRect(sceneCtx, x, y, 118, 162, 20, true, false);
      sceneCtx.strokeStyle = playable ? 'rgba(255, 204, 110, 0.86)' : 'rgba(157, 170, 184, 0.4)';
      sceneCtx.lineWidth = hovered ? 5 : 3;
      roundRect(sceneCtx, x, y, 118, 162, 20, false, true);

      const art = assets.get(card.art);
      if (art) {
        sceneCtx.drawImage(art, x + 10, y + 10, 98, 76);
      }

      sceneCtx.fillStyle = '#f5fbff';
      sceneCtx.font = '700 16px Georgia';
      sceneCtx.fillText(card.name, x + 10, y + 106, 96);
      sceneCtx.fillStyle = 'rgba(255,255,255,0.74)';
      sceneCtx.font = '13px Georgia';
      sceneCtx.fillText(card.text, x + 10, y + 124, 96);
      drawBadge(x + 10, y + 130, 24, 24, '#ffd27a', String(card.cost));
      drawBadge(x + 40, y + 130, 24, 24, '#ffb066', String(card.attack));
      drawBadge(x + 70, y + 130, 24, 24, '#72e6ff', String(card.health));
      sceneCtx.restore();

      ui.rects.push({ x, y, width: 118, height: 162, type: 'hand-card', index });
    });
  }

  function drawHints() {
    const hint = getHint();
    sceneCtx.save();
    sceneCtx.fillStyle = 'rgba(8, 16, 26, 0.84)';
    roundRect(sceneCtx, 520, 22, 560, 64, 22, true, false);
    sceneCtx.strokeStyle = 'rgba(116, 230, 255, 0.38)';
    sceneCtx.lineWidth = 3;
    roundRect(sceneCtx, 520, 22, 560, 64, 22, false, true);
    sceneCtx.fillStyle = '#f7fbff';
    sceneCtx.font = '700 22px Georgia';
    sceneCtx.fillText('Glass Reef Duel', 548, 48);
    sceneCtx.font = '17px Georgia';
    sceneCtx.fillStyle = 'rgba(255,255,255,0.82)';
    sceneCtx.fillText(hint, 548, 70, 500);
    sceneCtx.restore();
  }

  function drawButtons() {
    drawButton(1210, 760, 180, 62, 'End Turn', state.currentSide === 'player' && !state.winner, 'end-turn');
    drawButton(1210, 830, 180, 42, 'New Duel', true, 'new-game');
  }

  function drawButton(x, y, width, height, label, active, type) {
    const hovered = isPointInRect(ui.hover, { x, y, width, height });
    sceneCtx.save();
    sceneCtx.fillStyle = active ? (hovered ? 'rgba(255, 193, 106, 0.95)' : 'rgba(255, 170, 80, 0.88)') : 'rgba(108, 112, 124, 0.68)';
    roundRect(sceneCtx, x, y, width, height, 18, true, false);
    sceneCtx.fillStyle = '#06101b';
    sceneCtx.font = '700 22px Georgia';
    sceneCtx.fillText(label, x + 36, y + height / 2 + 8);
    sceneCtx.restore();
    ui.rects.push({ x, y, width, height, type });
  }

  function drawLog() {
    sceneCtx.save();
    sceneCtx.fillStyle = 'rgba(6, 14, 24, 0.8)';
    roundRect(sceneCtx, 1180, 300, 250, 250, 20, true, false);
    sceneCtx.fillStyle = '#f5fbff';
    sceneCtx.font = '700 20px Georgia';
    sceneCtx.fillText('Battle feed', 1202, 332);
    sceneCtx.font = '16px Georgia';
    sceneCtx.fillStyle = 'rgba(255,255,255,0.78)';
    state.log.slice(0, 6).forEach((entry, index) => {
      sceneCtx.fillText(entry, 1202, 364 + index * 28, 214);
    });
    sceneCtx.restore();
  }

  function drawBubbles() {
    sceneCtx.save();
    hitBubbles.forEach((bubble) => {
      sceneCtx.fillStyle = `rgba(255, 238, 196, ${Math.max(0, bubble.life)})`;
      sceneCtx.font = '700 32px Georgia';
      sceneCtx.fillText(bubble.label, bubble.x, bubble.y);
    });
    sceneCtx.restore();
  }

  function drawBanner() {
    if (bannerTimer <= 0) {
      return;
    }
    sceneCtx.save();
    sceneCtx.globalAlpha = Math.min(1, bannerTimer);
    sceneCtx.fillStyle = 'rgba(5, 12, 20, 0.72)';
    roundRect(sceneCtx, 615, 396, 370, 88, 26, true, false);
    sceneCtx.fillStyle = '#f8fbff';
    sceneCtx.font = '700 34px Georgia';
    sceneCtx.fillText(state.currentSide === 'player' ? 'Your turn' : 'Enemy turn', 700, 448);
    sceneCtx.restore();
  }

  function drawWinner() {
    if (!state.winner) {
      return;
    }
    sceneCtx.save();
    const alpha = Math.min(0.9, 0.35 + winnerTimer * 0.3);
    sceneCtx.fillStyle = `rgba(4, 10, 16, ${alpha})`;
    sceneCtx.fillRect(0, 0, baseLayout.width, baseLayout.height);
    sceneCtx.fillStyle = '#f8fbff';
    sceneCtx.font = '700 56px Georgia';
    sceneCtx.fillText(state.winner === 'player' ? 'Victory at the Glass Reef' : 'Defeat beneath the tide', 360, 420);
    sceneCtx.font = '26px Georgia';
    sceneCtx.fillText('Tap New Duel to begin another encounter.', 510, 468);
    sceneCtx.restore();
  }

  function getHint() {
    if (state.winner) {
      return 'The duel is over. Start a fresh encounter whenever you are ready.';
    }
    if (state.currentSide !== 'player') {
      return 'The Moon Tide is acting. Watch the enemy lane and prepare your next answer.';
    }
    if (state.player.board.length === 0 && state.player.hand.some((card, index) => Core.canPlayCard(state, index))) {
      return 'Your glowing hand cards are playable. Click one to summon it onto the front line.';
    }
    if (state.player.board.some((unit) => !unit.sleeping && !unit.hasAttacked)) {
      return 'Ready allies pulse on the lower lane. Click one, then click an enemy unit or portrait to attack.';
    }
    return 'When you have spent your mana and attacks, press End Turn to hand the board to the enemy.';
  }

  function onPointerMove(event) {
    ui.hover = eventToScenePoint(event.clientX, event.clientY);
  }

  function onPointerDown(event) {
    ui.pressed = eventToScenePoint(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    const point = eventToScenePoint(event.clientX, event.clientY);
    const pressed = ui.pressed;
    ui.pressed = null;
    if (!pressed) {
      return;
    }
    handleClick(point);
  }

  function onPointerLeave() {
    ui.hover = null;
    ui.pressed = null;
  }

  function onTouchStart(event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    ui.pressed = eventToScenePoint(touch.clientX, touch.clientY);
    ui.hover = ui.pressed;
  }

  function onTouchMove(event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    ui.hover = eventToScenePoint(touch.clientX, touch.clientY);
  }

  function onTouchEnd(event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    handleClick(eventToScenePoint(touch.clientX, touch.clientY));
    ui.pressed = null;
  }

  function eventToScenePoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * baseLayout.width,
      y: ((clientY - rect.top) / rect.height) * baseLayout.height,
    };
  }

  function isPointInRect(point, rect) {
    if (!point || !rect) {
      return false;
    }
    return point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  function handleClick(point) {
    const target = ui.rects.slice().reverse().find((rect) => isPointInRect(point, rect));
    if (!target) {
      ui.selectedAttacker = null;
      return;
    }
    if (target.type === 'new-game') {
      resetGame();
      return;
    }
    if (target.type === 'end-turn' && state.currentSide === 'player' && !state.winner) {
      ui.selectedAttacker = null;
      consumeEvents(Core.endPlayerTurn(state));
      bannerTimer = 1.5;
      saveState();
      return;
    }
    if (state.currentSide !== 'player' || state.winner) {
      return;
    }
    if (target.type === 'hand-card') {
      const result = Core.playCard(state, target.index);
      if (result.ok) {
        state.log.unshift('A solar sigil flares across your hand.');
        bannerTimer = 0.35;
        saveState();
      }
      return;
    }
    if (target.type === 'player-unit') {
      const unit = state.player.board[target.index];
      if (unit && !unit.sleeping && !unit.hasAttacked) {
        ui.selectedAttacker = target.index;
      }
      return;
    }
    if (ui.selectedAttacker !== null && target.type === 'enemy-unit') {
      consumeEvents(Core.attackWithUnit(state, 'player', ui.selectedAttacker, target.index));
      ui.selectedAttacker = null;
      saveState();
      return;
    }
    if (ui.selectedAttacker !== null && target.type === 'enemy-hero') {
      consumeEvents(Core.attackWithUnit(state, 'player', ui.selectedAttacker, 'hero'));
      ui.selectedAttacker = null;
      saveState();
    }
  }

  function consumeEvents(events) {
    events.forEach((event) => {
      if (event.type === 'hero-hit') {
        hitBubbles.push({
          x: event.side === 'player' ? 1090 : 330,
          y: event.side === 'player' ? 180 : 690,
          label: `-${event.amount}`,
          life: 1,
        });
      }
      if (event.type === 'unit-clash') {
        hitBubbles.push({ x: 760, y: 418, label: 'CLASH', life: 0.9 });
      }
      if (event.type === 'turn-pass') {
        bannerTimer = 1.3;
      }
    });
  }

  function resetGame() {
    state = Core.createInitialState(Date.now() % 100000);
    clearState();
    saveState();
    hitBubbles.length = 0;
    ui.selectedAttacker = null;
    bannerTimer = 1.6;
    winnerTimer = 0;
  }

  function roundRect(context, x, y, width, height, radius, fill, stroke) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
    if (fill) {
      context.fill();
    }
    if (stroke) {
      context.stroke();
    }
  }
}());
