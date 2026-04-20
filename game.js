(function () {
  const logic = window.DuelGameLogic;
  const canvas = document.getElementById('game');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  const surface = document.createElement('canvas');
  const ctx = surface.getContext('2d');
  const storageNamespace = window.RUN_STORAGE_NAMESPACE || window.__RUN_STORAGE_NAMESPACE__ || 'sky-duel:';
  const storageKey = storageNamespace + 'save';
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const state = {
    duel: loadState(),
    hoverId: null,
    selectedAttacker: null,
    rects: [],
    lastTime: performance.now(),
    time: 0,
  };

  if (!gl || !ctx) {
    document.body.textContent = 'WebGL is required to play Sky Duel.';
    return;
  }

  const program = createProgram(gl,
    'attribute vec2 aPosition; attribute vec2 aTexCoord; varying vec2 vTexCoord; void main(){ vTexCoord = aTexCoord; gl_Position = vec4(aPosition, 0.0, 1.0); }',
    'precision mediump float; varying vec2 vTexCoord; uniform sampler2D uTexture; void main(){ gl_FragColor = texture2D(uTexture, vTexCoord); }'
  );
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const texCoordLocation = gl.getAttribLocation(program, 'aTexCoord');
  const texture = gl.createTexture();
  const buffer = gl.createBuffer();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 1,
     1, -1, 1, 1,
    -1,  1, 0, 0,
    -1,  1, 0, 0,
     1, -1, 1, 1,
     1,  1, 1, 0,
  ]), gl.STATIC_DRAW);

  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseleave', clearHover);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', onTouch, { passive: false });

  resize();
  requestAnimationFrame(frame);

  function loadState() {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? logic.deserializeState(saved) : logic.createInitialState(7);
    } catch (error) {
      return logic.createInitialState(7);
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, logic.serializeState(state.duel));
  }

  function resize() {
    const width = Math.floor(window.innerWidth * DPR);
    const height = Math.floor(window.innerHeight * DPR);
    canvas.width = width;
    canvas.height = height;
    surface.width = width;
    surface.height = height;
    gl.viewport(0, 0, width, height);
  }

  function frame(now) {
    const delta = Math.min(0.033, (now - state.lastTime) / 1000);
    state.lastTime = now;
    state.time += delta;
    drawSurface();
    renderSurface();
    requestAnimationFrame(frame);
  }

  function renderSurface() {
    gl.clearColor(0.02, 0.03, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawSurface() {
    const width = surface.width;
    const height = surface.height;
    const unit = Math.min(width, height) / 100;
    state.rects = [];

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#09142d');
    gradient.addColorStop(1, '#14091f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    drawSky(width, height);
    drawBoard(width, height, unit);
    drawHero(state.duel.enemy, width * 0.14, height * 0.18, unit * 7, '#8fd3ff');
    drawHero(state.duel.player, width * 0.14, height * 0.82, unit * 7, '#ffbf6b');

    drawRows(width, height, unit);
    drawHud(width, height, unit);
    drawHand(state.duel.player.hand, height * 0.83, false, unit);
    drawHand(state.duel.enemy.hand, height * 0.08, true, unit);
    drawBoardUnits(state.duel.enemy.board, height * 0.31, true, unit);
    drawBoardUnits(state.duel.player.board, height * 0.57, false, unit);
    drawLog(width, height, unit);
    drawTutorial(width, height, unit);
    drawEndTurnButton(width, height, unit);
    drawTooltip(unit);
    drawWinner(width, height, unit);
  }

  function drawSky(width, height) {
    for (let index = 0; index < 36; index += 1) {
      const x = (index * 173) % width;
      const y = ((index * 97) % height + state.time * 12 * (index % 3 + 1)) % height;
      const size = 1 + (index % 3);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, size, size);
    }
  }

  function drawBoard(width, height, unit) {
    roundRect(width * 0.22, height * 0.12, width * 0.72, height * 0.76, unit * 3, '#12233f');
    roundRect(width * 0.24, height * 0.14, width * 0.68, height * 0.72, unit * 2, '#1f3560');
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = unit * 0.2;
    ctx.strokeRect(width * 0.24, height * 0.49, width * 0.68, unit * 0.2);
  }

  function drawRows(width, height, unit) {
    label(width * 0.26, height * 0.28, 'Enemy Front', unit * 1.3, 'rgba(255,255,255,0.7)');
    label(width * 0.26, height * 0.54, 'Your Front', unit * 1.3, 'rgba(255,255,255,0.7)');
  }

  function drawHud(width, height, unit) {
    label(width * 0.5, unit * 4, 'Sky Duel', unit * 2.8, '#fef1c8', 'center');
    label(width * 0.5, unit * 7, 'Play a glowing card, attack with ready units, then end your turn.', unit * 1.4, 'rgba(255,255,255,0.84)', 'center');
    label(width * 0.77, unit * 5, 'Turn ' + state.duel.turn, unit * 1.9, '#d2e5ff');
    label(width * 0.77, unit * 8, 'Mana ' + state.duel.player.mana + '/' + state.duel.player.maxMana, unit * 1.7, '#88e0ff');
  }

  function drawHero(side, x, y, radius, glow) {
    const pulse = Math.sin(state.time * 2) * radius * 0.04;
    const gradient = ctx.createRadialGradient(x, y, radius * 0.25, x, y, radius + pulse);
    gradient.addColorStop(0, glow);
    gradient.addColorStop(1, '#101623');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius + pulse, 0, Math.PI * 2);
    ctx.fill();
    label(x, y - radius * 1.25, side.heroName, radius * 0.34, '#fff8da', 'center');
    label(x, y + radius * 1.55, 'Health ' + side.health, radius * 0.4, '#ffffff', 'center');
  }

  function drawHand(cards, top, faceDown, unit) {
    const width = surface.width;
    const count = Math.max(cards.length, 1);
    const spacing = Math.min(unit * 11, surface.width * 0.42 / count);
    const baseX = width * 0.5 - spacing * (cards.length - 1) * 0.5;
    cards.forEach(function (card, index) {
      const rect = cardRect(baseX + spacing * index, top, unit * 8, unit * 12);
      drawCard(card, rect, faceDown, false);
      state.rects.push({ id: (faceDown ? 'enemy-hand-' : 'player-hand-') + index, action: faceDown ? null : { type: 'play-card', index: index }, card: card, rect: rect });
    });
  }

  function drawBoardUnits(cards, top, enemy, unit) {
    const width = surface.width;
    const spacing = unit * 11;
    const baseX = width * 0.46 - spacing * (cards.length - 1) * 0.5;
    cards.forEach(function (card, index) {
      const rect = cardRect(baseX + spacing * index, top, unit * 8.6, unit * 11.5);
      drawCard(card, rect, false, true);
      if (!enemy) {
        state.rects.push({ id: 'player-board-' + index, action: { type: 'attack', index: index }, card: card, rect: rect });
      }
    });
  }

  function drawCard(card, rect, faceDown, onBoard) {
    const hovered = state.hoverId && state.hoverId === rect.id;
    const glow = !faceDown && card.cost <= state.duel.player.mana && state.duel.currentPlayer === 'player' && !onBoard;
    const outline = state.selectedAttacker === rect.index ? '#fff6a0' : 'rgba(255,255,255,0.18)';
    roundRect(rect.x, rect.y, rect.w, rect.h, rect.w * 0.08, faceDown ? '#30244a' : '#f4ead2');
    roundRect(rect.x + rect.w * 0.05, rect.y + rect.h * 0.08, rect.w * 0.9, rect.h * 0.42, rect.w * 0.06, faceDown ? '#6a5b9d' : '#263f78');
    if (!faceDown) {
      paintArt(card, rect);
      label(rect.x + rect.w * 0.12, rect.y + rect.h * 0.14, card.name, rect.w * 0.09, '#fff9ea');
      label(rect.x + rect.w * 0.12, rect.y + rect.h * 0.72, card.attack + ' / ' + card.health, rect.w * 0.13, '#201618');
      label(rect.x + rect.w * 0.78, rect.y + rect.h * 0.14, String(card.cost), rect.w * 0.16, '#fff4cb', 'center');
      if (onBoard && card.sleeping) {
        label(rect.x + rect.w * 0.5, rect.y + rect.h * 0.9, 'sleeping', rect.w * 0.08, '#5b4b38', 'center');
      }
    } else {
      label(rect.x + rect.w * 0.5, rect.y + rect.h * 0.52, 'Mistbound', rect.w * 0.12, '#fff0fa', 'center');
    }
    ctx.strokeStyle = glow ? '#8df6ff' : outline;
    ctx.lineWidth = rect.w * 0.04;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    if (hovered || glow) {
      ctx.fillStyle = glow ? 'rgba(141,246,255,0.13)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  function paintArt(card, rect) {
    const centerX = rect.x + rect.w * 0.5;
    const centerY = rect.y + rect.h * 0.31;
    const hue = card.cardId === 'emberling' ? '#ff9c4a' : card.cardId === 'sparksmith' ? '#89c5ff' : card.cardId === 'ashguard' ? '#ffcb72' : '#f88cff';
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.arc(centerX, centerY, rect.w * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(rect.x + rect.w * 0.18, rect.y + rect.h * 0.24, rect.w * 0.64, rect.h * 0.05);
  }

  function drawLog(width, height, unit) {
    roundRect(width * 0.74, height * 0.65, width * 0.2, height * 0.18, unit * 1.5, 'rgba(7,12,22,0.78)');
    label(width * 0.755, height * 0.69, 'Battle Log', unit * 1.2, '#f2ebcd');
    const recent = state.duel.log.slice(-3);
    recent.forEach(function (entry, index) {
      label(width * 0.755, height * (0.73 + index * 0.04), entry, unit * 1.05, 'rgba(255,255,255,0.85)');
    });
  }

  function drawTutorial(width, height, unit) {
    const message = state.duel.currentPlayer === 'player'
      ? 'Blue glow = playable. Tap a ready unit on your front line to strike the enemy hero.'
      : 'Enemy is taking its turn. Your game is saved automatically after every action.';
    roundRect(width * 0.24, height * 0.03, width * 0.45, height * 0.08, unit * 1.4, 'rgba(18,32,58,0.84)');
    label(width * 0.26, height * 0.08, message, unit * 1.2, '#eef8ff');
  }

  function drawEndTurnButton(width, height, unit) {
    const rect = { x: width * 0.78, y: height * 0.14, w: width * 0.13, h: height * 0.08 };
    const active = state.duel.currentPlayer === 'player' && !state.duel.winner;
    roundRect(rect.x, rect.y, rect.w, rect.h, unit, active ? '#53b5ff' : '#5c6477');
    label(rect.x + rect.w * 0.5, rect.y + rect.h * 0.58, 'End Turn', unit * 1.5, '#09131f', 'center');
    state.rects.push({ id: 'end-turn', action: { type: 'end-turn' }, rect: rect });
  }

  function drawTooltip(unit) {
    const target = state.rects.find(function (entry) {
      return entry.id === state.hoverId && entry.card;
    });
    if (!target) {
      return;
    }
    const rect = target.rect;
    roundRect(rect.x, rect.y - unit * 6, unit * 22, unit * 5, unit, 'rgba(9,14,23,0.92)');
    label(rect.x + unit, rect.y - unit * 3.8, target.card.text, unit * 1.05, '#f7f0d0');
  }

  function drawWinner(width, height, unit) {
    if (!state.duel.winner) {
      return;
    }
    roundRect(width * 0.34, height * 0.4, width * 0.32, height * 0.12, unit * 2, 'rgba(7,10,16,0.92)');
    label(width * 0.5, height * 0.47, state.duel.winner === 'player' ? 'Victory in the Sky Arena' : 'Defeat - try a new duel', unit * 2.1, '#fff0c0', 'center');
  }

  function onPointerMove(event) {
    const point = eventPoint(event);
    state.hoverId = hitTest(point.x, point.y);
  }

  function onTouch(event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    const point = eventPoint(touch);
    state.hoverId = hitTest(point.x, point.y);
    performAction(point.x, point.y);
  }

  function onClick(event) {
    const point = eventPoint(event);
    performAction(point.x, point.y);
  }

  function clearHover() {
    state.hoverId = null;
  }

  function performAction(x, y) {
    const target = state.rects.find(function (entry) {
      return inside(x, y, entry.rect);
    });
    if (!target || !target.action) {
      return;
    }
    if (target.action.type === 'play-card') {
      state.duel = logic.playCard(state.duel, 'player', target.action.index);
      saveState();
      return;
    }
    if (target.action.type === 'attack') {
      state.duel = logic.attackWithUnit(state.duel, 'player', target.action.index);
      saveState();
      return;
    }
    if (target.action.type === 'end-turn') {
      state.duel = logic.endTurn(state.duel);
      saveState();
    }
  }

  function hitTest(x, y) {
    const target = state.rects.find(function (entry) {
      return inside(x, y, entry.rect);
    });
    return target ? target.id : null;
  }

  function eventPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * DPR,
      y: (event.clientY - rect.top) * DPR,
    };
  }

  function inside(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function cardRect(x, y, w, h) {
    return { id: x + '-' + y, x: x - w / 2, y: y, w: w, h: h };
  }

  function label(x, y, text, size, color, align) {
    ctx.fillStyle = color;
    ctx.font = '600 ' + size + 'px Arial';
    ctx.textAlign = align || 'left';
    ctx.fillText(text, x, y);
  }

  function roundRect(x, y, w, h, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function createProgram(glContext, vertexSource, fragmentSource) {
    const vertexShader = compileShader(glContext, glContext.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(glContext, glContext.FRAGMENT_SHADER, fragmentSource);
    const shaderProgram = glContext.createProgram();
    glContext.attachShader(shaderProgram, vertexShader);
    glContext.attachShader(shaderProgram, fragmentShader);
    glContext.linkProgram(shaderProgram);
    return shaderProgram;
  }

  function compileShader(glContext, type, source) {
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);
    return shader;
  }
})();
