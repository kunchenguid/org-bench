(function () {
  var Game = window.FBDuelGame || window.FBDuelGameState;
  var Renderer = window.FBDuelRendererCore;
  var gameCanvas = document.getElementById('game');
  var playCardButton = document.getElementById('play-card');
  var endTurnButton = document.getElementById('end-turn');
  var resetButton = document.getElementById('reset-game');
  var turnLabel = document.getElementById('turn-label');
  var matchupLabel = document.getElementById('matchup-label');
  var saveLabel = document.getElementById('save-label');
  var cueTitle = document.getElementById('cue-title');
  var cueBody = document.getElementById('cue-body');

  if (!gameCanvas || !Game || !Renderer) {
    return;
  }

  var gl = gameCanvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    cueTitle.textContent = 'WebGL is unavailable in this browser.';
    cueBody.textContent = 'Open the file in a modern browser with WebGL enabled.';
    return;
  }

  var backgroundVertexShaderSource = [
    'attribute vec2 a_position;',
    'void main() {',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}',
  ].join('\n');

  var backgroundFragmentShaderSource = [
    'precision mediump float;',
    'uniform vec2 u_resolution;',
    'uniform float u_time;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;',
    '  float pulse = 0.08 * sin(u_time * 0.0018) + 0.92;',
    '  float nebula = 0.5 + 0.5 * sin((uv.x + uv.y) * 10.0 + u_time * 0.0013);',
    '  float stars = step(0.997, fract(sin(dot(floor(uv * 90.0), vec2(12.9898, 78.233))) * 43758.5453));',
    '  vec3 top = vec3(0.06, 0.09, 0.20) * pulse;',
    '  vec3 bottom = vec3(0.01, 0.02, 0.06);',
    '  vec3 color = mix(bottom, top, uv.y) + nebula * vec3(0.05, 0.03, 0.08);',
    '  color += stars * vec3(0.6, 0.7, 0.9);',
    '  gl_FragColor = vec4(color, 1.0);',
    '}',
  ].join('\n');

  var rectVertexShaderSource = [
    'attribute vec2 a_unit;',
    'uniform vec2 u_resolution;',
    'uniform vec4 u_rect;',
    'void main() {',
    '  vec2 position = u_rect.xy + a_unit * u_rect.zw;',
    '  vec2 zeroToOne = position / u_resolution;',
    '  vec2 clip = vec2(zeroToOne.x * 2.0 - 1.0, 1.0 - zeroToOne.y * 2.0);',
    '  gl_Position = vec4(clip, 0.0, 1.0);',
    '}',
  ].join('\n');

  var rectFragmentShaderSource = [
    'precision mediump float;',
    'uniform vec4 u_color;',
    'void main() {',
    '  gl_FragColor = u_color;',
    '}',
  ].join('\n');

  function createShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed.');
    }
    return shader;
  }

  function createProgram(vertexSource, fragmentSource) {
    var program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Program link failed.');
    }
    return program;
  }

  var backgroundProgram = createProgram(backgroundVertexShaderSource, backgroundFragmentShaderSource);
  var rectProgram = createProgram(rectVertexShaderSource, rectFragmentShaderSource);

  var backgroundBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  var rectBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, rectBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

  var backgroundPositionLocation = gl.getAttribLocation(backgroundProgram, 'a_position');
  var backgroundResolutionLocation = gl.getUniformLocation(backgroundProgram, 'u_resolution');
  var backgroundTimeLocation = gl.getUniformLocation(backgroundProgram, 'u_time');
  var rectUnitLocation = gl.getAttribLocation(rectProgram, 'a_unit');
  var rectResolutionLocation = gl.getUniformLocation(rectProgram, 'u_resolution');
  var rectRectLocation = gl.getUniformLocation(rectProgram, 'u_rect');
  var rectColorLocation = gl.getUniformLocation(rectProgram, 'u_color');

  function resolveNamespace() {
    return (
      window.__BENCHMARK_RUN_NAMESPACE__ ||
      window.__RUN_NAMESPACE__ ||
      document.documentElement.getAttribute('data-run-namespace') ||
      'local-dev'
    );
  }

  var storageKey = Game.createStorageKey(resolveNamespace(), 'save');
  var state = Game.hydrateState(window.localStorage.getItem(storageKey));
  var enemyTimer = null;
  var turnBanner = {
    actor: state.currentActor,
    startedAt: performance.now(),
  };
  var effects = [];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotState(currentState) {
    return clone({
      currentActor: currentState.currentActor,
      turn: currentState.turn,
      player: currentState.player,
      enemy: currentState.enemy,
      winner: currentState.winner,
    });
  }

  function saveState() {
    var serializer = Game.serializeState || JSON.stringify;
    window.localStorage.setItem(storageKey, serializer(state));
    saveLabel.textContent = 'Saved to ' + storageKey;
  }

  function heroHealth(side) {
    return side.heroHealth != null ? side.heroHealth : side.health;
  }

  function syncHud() {
    matchupLabel.textContent = (Game.describeEncounter && Game.describeEncounter(state)) || state.encounter.name;
    turnLabel.textContent =
      'Turn ' +
      state.turn +
      ' - ' +
      (state.currentActor === 'player' ? 'Your move' : 'Enemy move') +
      ' - P ' +
      heroHealth(state.player) +
      ' HP / E ' +
      heroHealth(state.enemy) +
      ' HP';
    cueTitle.textContent = state.tutorialCue.title;
    cueBody.textContent = state.tutorialCue.body || state.tutorialCue.detail || '';

    playCardButton.disabled = state.currentActor !== 'player' || Boolean(state.winner) || state.player.hand.length === 0;
    endTurnButton.disabled = state.currentActor !== 'player' || Boolean(state.winner);
  }

  function firstPlayableCardId() {
    for (var index = 0; index < state.player.hand.length; index += 1) {
      if (state.player.hand[index].cost <= state.player.mana) {
        return state.player.hand[index].id;
      }
    }
    return null;
  }

  function queueEnemyTurn() {
    if (enemyTimer || state.currentActor !== 'enemy' || state.winner) {
      return;
    }

    enemyTimer = window.setTimeout(function () {
      enemyTimer = null;
      var previousState = snapshotState(state);
      state = (Game.resolveEnemyTurn || Game.runEnemyTurn)(state);
      queueSceneTransition(previousState, state, 'enemy-turn');
      saveState();
      syncHud();
    }, 900);
  }

  function easeOutCubic(value) {
    var t = 1 - Math.max(0, Math.min(1, value));
    return 1 - t * t * t;
  }

  function easeInOutSine(value) {
    var t = Math.max(0, Math.min(1, value));
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function createEffect(type, options) {
    var effect = clone(options || {});
    effect.type = type;
    effect.startedAt = performance.now();
    effects.push(effect);
  }

  function canvasMetrics() {
    return {
      width: gameCanvas.width || Math.max(1, Math.floor(gameCanvas.clientWidth * (window.devicePixelRatio || 1))),
      height: gameCanvas.height || Math.max(1, Math.floor(gameCanvas.clientHeight * (window.devicePixelRatio || 1))),
    };
  }

  function centerOf(rect) {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  }

  function queueSceneTransition(previousState, nextState, reason) {
    var now = performance.now();
    var metrics = canvasMetrics();
    var width = metrics.width;
    var height = metrics.height;
    var prevPlayerHand = Renderer.layoutHandCards(previousState.player.hand, width, height, now, 'player');
    var nextPlayerHand = Renderer.layoutHandCards(nextState.player.hand, width, height, now, 'player');
    var nextPlayerBoard = Renderer.layoutBoardCards(nextState.player.board, width, height, now, 'player');
    var prevEnemyBoard = Renderer.layoutBoardCards(previousState.enemy.board, width, height, now, 'enemy');
    var nextPlayerBoardById = indexById(nextPlayerBoard);
    var prevPlayerBoardById = indexById(Renderer.layoutBoardCards(previousState.player.board, width, height, now, 'player'));
    var nextEnemyBoardById = indexById(Renderer.layoutBoardCards(nextState.enemy.board, width, height, now, 'enemy'));
    var layout = Renderer.computeBoardLayout(width, height);

    if (previousState.currentActor !== nextState.currentActor || previousState.turn !== nextState.turn) {
      turnBanner = {
        actor: nextState.currentActor,
        startedAt: now,
      };
    }

    if (nextState.player.hand.length < previousState.player.hand.length && nextState.player.board.length > previousState.player.board.length) {
      var playedCardId = findMissingId(previousState.player.hand, nextState.player.hand);
      var sourceIndex = findIndexById(previousState.player.hand, playedCardId);
      var targetCard = nextState.player.board[nextState.player.board.length - 1];
      var targetRect = targetCard ? nextPlayerBoardById[targetCard.id] : null;
      if (sourceIndex !== -1 && targetRect) {
        createEffect('flight', {
          from: centerOf(prevPlayerHand[sourceIndex]),
          to: centerOf(targetRect),
          duration: 620,
          color: [0.6, 0.9, 0.72, 0.86],
          width: prevPlayerHand[sourceIndex].width,
          height: prevPlayerHand[sourceIndex].height,
        });
      }
    }

    if (nextState.player.hand.length > previousState.player.hand.length && reason === 'enemy-turn') {
      createEffect('flight', {
        from: { x: width * 0.86, y: height * 0.88 },
        to: centerOf(nextPlayerHand[nextPlayerHand.length - 1]),
        duration: 560,
        color: [0.58, 0.84, 1.0, 0.82],
        width: nextPlayerHand[nextPlayerHand.length - 1].width,
        height: nextPlayerHand[nextPlayerHand.length - 1].height,
      });
    }

    if (nextState.player.health < previousState.player.health) {
      createImpactBurst(layout.playerHero, previousState.player.health - nextState.player.health);
    }
    if (nextState.enemy.health < previousState.enemy.health) {
      createImpactBurst(layout.enemyHero, previousState.enemy.health - nextState.enemy.health);
    }

    queueBoardDamage(previousState.player.board, nextState.player.board, prevPlayerBoardById, nextPlayerBoardById);
    queueBoardDamage(previousState.enemy.board, nextState.enemy.board, prevEnemyBoard, nextEnemyBoardById);
    queueEnemyAttacks(previousState, nextState, width, height);
  }

  function queueBoardDamage(previousBoard, nextBoard, previousRects, nextRects) {
    for (var lane = 0; lane < previousBoard.length; lane += 1) {
      var previousCard = previousBoard[lane];
      if (!previousCard) {
        continue;
      }
      var nextCard = nextBoard[lane];
      var previousRect = previousRects[previousCard.id] || previousRects[lane];

      if (!nextCard && previousRect) {
        createEffect('death', {
          origin: centerOf(previousRect),
          duration: 560,
          width: previousRect.width,
          height: previousRect.height,
        });
        continue;
      }

      if (nextCard && nextCard.id === previousCard.id && nextCard.health < previousCard.health) {
        var rect = nextRects[nextCard.id] || previousRect;
        if (rect) {
          createImpactBurst(rect, previousCard.health - nextCard.health);
        }
      }
    }
  }

  function queueEnemyAttacks(previousState, nextState, width, height) {
    var previousEnemyRects = Renderer.layoutBoardCards(previousState.enemy.board, width, height, performance.now(), 'enemy');
    var previousPlayerRects = Renderer.layoutBoardCards(previousState.player.board, width, height, performance.now(), 'player');
    var layout = Renderer.computeBoardLayout(width, height);

    for (var lane = 0; lane < previousState.enemy.board.length; lane += 1) {
      var previousEnemy = previousState.enemy.board[lane];
      var nextEnemy = nextState.enemy.board[lane];
      if (!previousEnemy || !nextEnemy || previousEnemy.id !== nextEnemy.id) {
        continue;
      }
      if (previousEnemy.exhausted || !nextEnemy.exhausted) {
        continue;
      }

      createEffect('lunge', {
        from: centerOf(previousEnemyRects[lane]),
        to: previousState.player.board[lane] ? centerOf(previousPlayerRects[lane]) : centerOf(layout.playerHero),
        duration: 480,
        color: [1.0, 0.56, 0.34, 0.86],
        width: previousEnemyRects[lane].width * 0.76,
        height: previousEnemyRects[lane].height * 0.76,
      });
    }
  }

  function createImpactBurst(targetRect, amount) {
    var origin = centerOf(targetRect);
    createEffect('impact', {
      origin: origin,
      duration: 420,
      size: Math.max(targetRect.width, targetRect.height) * 0.7,
    });
    createEffect('damage', {
      origin: origin,
      duration: 720,
      amount: Math.max(1, amount || 1),
    });
  }

  function findMissingId(previousList, nextList) {
    var nextIds = nextList.map(function (card) {
      return card.id;
    });
    for (var index = 0; index < previousList.length; index += 1) {
      if (nextIds.indexOf(previousList[index].id) === -1) {
        return previousList[index].id;
      }
    }
    return null;
  }

  function findIndexById(cards, cardId) {
    for (var index = 0; index < cards.length; index += 1) {
      if (cards[index].id === cardId) {
        return index;
      }
    }
    return -1;
  }

  function indexById(rects) {
    var byId = {};
    for (var index = 0; index < rects.length; index += 1) {
      byId[rects[index].id] = rects[index];
    }
    return byId;
  }

  playCardButton.addEventListener('click', function () {
    var cardId = firstPlayableCardId();
    if (!cardId) {
      return;
    }
    var previousState = snapshotState(state);
    state = Game.playCard(state, cardId);
    queueSceneTransition(previousState, state, 'play-card');
    saveState();
    syncHud();
  });

  endTurnButton.addEventListener('click', function () {
    var previousState = snapshotState(state);
    state = Game.endTurn(state);
    queueSceneTransition(previousState, state, 'end-turn');
    saveState();
    syncHud();
    queueEnemyTurn();
  });

  resetButton.addEventListener('click', function () {
    state = Game.createInitialState();
    turnBanner = {
      actor: state.currentActor,
      startedAt: performance.now(),
    };
    effects = [];
    saveState();
    syncHud();
  });

  function resizeCanvas() {
    var size = Renderer.computeCanvasSize(gameCanvas.clientWidth, gameCanvas.clientHeight, window.devicePixelRatio || 1);

    if (gameCanvas.width !== size.pixelWidth || gameCanvas.height !== size.pixelHeight) {
      gameCanvas.width = size.pixelWidth;
      gameCanvas.height = size.pixelHeight;
    }
    gl.viewport(0, 0, size.pixelWidth, size.pixelHeight);
  }

  function drawBackground(time) {
    gl.useProgram(backgroundProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
    gl.enableVertexAttribArray(backgroundPositionLocation);
    gl.vertexAttribPointer(backgroundPositionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(backgroundResolutionLocation, gameCanvas.width, gameCanvas.height);
    gl.uniform1f(backgroundTimeLocation, time);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawRect(x, y, width, height, color) {
    gl.useProgram(rectProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, rectBuffer);
    gl.enableVertexAttribArray(rectUnitLocation);
    gl.vertexAttribPointer(rectUnitLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(rectResolutionLocation, gameCanvas.width, gameCanvas.height);
    gl.uniform4f(rectColorLocation, color[0], color[1], color[2], color[3]);
    gl.uniform4f(rectRectLocation, x, y, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function scaledRect(rect, scale) {
    var scaledWidth = rect.width * scale;
    var scaledHeight = rect.height * scale;
    return {
      x: rect.x + (rect.width - scaledWidth) / 2,
      y: rect.y + (rect.height - scaledHeight) / 2,
      width: scaledWidth,
      height: scaledHeight,
    };
  }

  function factionColor(card, alpha) {
    var base = card && card.faction === 'ironbound' ? [0.84, 0.42, 0.28, alpha] : [0.34, 0.72, 0.45, alpha];
    if (card && card.exhausted) {
      base[0] *= 0.55;
      base[1] *= 0.55;
      base[2] *= 0.65;
    }
    return base;
  }

  function drawCard(rect, card, alpha, accentScale) {
    var outer = scaledRect(rect, accentScale || 1);
    var inner = scaledRect(outer, 0.88);
    drawRect(outer.x, outer.y, outer.width, outer.height, factionColor(card, alpha));
    drawRect(inner.x, inner.y, inner.width, inner.height, [0.08, 0.11, 0.18, alpha]);
    drawRect(inner.x + inner.width * 0.08, inner.y + inner.height * 0.08, inner.width * 0.84, inner.height * 0.42, [0.92, 0.95, 1.0, alpha * 0.14]);
    if (card && card.type === 'spell') {
      drawRect(inner.x + inner.width * 0.16, inner.y + inner.height * 0.6, inner.width * 0.68, inner.height * 0.08, [1.0, 0.78, 0.38, alpha * 0.82]);
    } else {
      drawRect(inner.x + inner.width * 0.12, inner.y + inner.height * 0.64, inner.width * 0.24, inner.height * 0.14, [0.97, 0.74, 0.26, alpha * 0.86]);
      drawRect(inner.x + inner.width * 0.64, inner.y + inner.height * 0.64, inner.width * 0.24, inner.height * 0.14, [0.94, 0.37, 0.37, alpha * 0.86]);
    }
  }

  function drawHero(rect, card, time) {
    var pulse = 1 + Math.sin(time * 0.0018 + (card.faction === 'ironbound' ? 0.7 : 0)) * 0.03;
    var scaled = scaledRect(rect, pulse);
    drawRect(scaled.x, scaled.y, scaled.width, scaled.height, factionColor(card, 0.92));
    drawRect(scaled.x + scaled.width * 0.08, scaled.y + scaled.height * 0.12, scaled.width * 0.84, scaled.height * 0.62, [0.05, 0.08, 0.16, 0.96]);
    drawRect(scaled.x + scaled.width * 0.16, scaled.y + scaled.height * 0.78, scaled.width * 0.68, scaled.height * 0.08, [0.98, 0.86, 0.36, 0.9]);
  }

  function drawLaneSlots(layout) {
    var slots = layout.enemyLanes.concat(layout.playerLanes);
    for (var index = 0; index < slots.length; index += 1) {
      drawRect(slots[index].x, slots[index].y, slots[index].width, slots[index].height, [0.12, 0.17, 0.28, 0.24]);
      drawRect(slots[index].x + 6, slots[index].y + 6, slots[index].width - 12, slots[index].height - 12, [0.02, 0.03, 0.08, 0.22]);
    }
  }

  function drawParticles(time) {
    var count = 18;
    for (var index = 0; index < count; index += 1) {
      var progress = (time * 0.000035 + index * 0.07) % 1;
      var x = (Math.sin(index * 19.17) * 0.5 + 0.5) * gameCanvas.width;
      var y = gameCanvas.height * progress;
      drawRect(x, y, 4, 4, [0.7, 0.84, 1.0, 0.08]);
    }
  }

  function drawBoardState(time) {
    var layout = Renderer.computeBoardLayout(gameCanvas.width, gameCanvas.height);
    drawLaneSlots(layout);
    drawParticles(time);
    drawHero(layout.enemyHero, state.enemy.hero, time);
    drawHero(layout.playerHero, state.player.hero, time + 400);

    var enemyBoard = Renderer.layoutBoardCards(state.enemy.board, gameCanvas.width, gameCanvas.height, time, 'enemy');
    var playerBoard = Renderer.layoutBoardCards(state.player.board, gameCanvas.width, gameCanvas.height, time, 'player');
    var playerHand = Renderer.layoutHandCards(state.player.hand, gameCanvas.width, gameCanvas.height, time, 'player');

    for (var enemyIndex = 0; enemyIndex < enemyBoard.length; enemyIndex += 1) {
      drawCard(enemyBoard[enemyIndex], state.enemy.board[enemyIndex], 0.94, 1);
    }
    for (var playerIndex = 0; playerIndex < playerBoard.length; playerIndex += 1) {
      drawCard(playerBoard[playerIndex], state.player.board[playerIndex], 0.96, 1);
    }
    for (var handIndex = 0; handIndex < playerHand.length; handIndex += 1) {
      var playable = state.currentActor === 'player' && state.player.hand[handIndex].cost <= state.player.mana;
      drawCard(playerHand[handIndex], state.player.hand[handIndex], playable ? 0.96 : 0.74, playable ? 1.05 + Math.sin(time * 0.004 + handIndex) * 0.03 : 1);
    }
  }

  function drawTurnBanner(time) {
    if (!turnBanner) {
      return;
    }
    var sample = Renderer.sampleTurnBanner(time - turnBanner.startedAt, gameCanvas.width, gameCanvas.height, turnBanner.actor);
    if (sample.opacity <= 0) {
      return;
    }
    drawRect(sample.x - sample.width / 2, sample.y, sample.width, sample.height, [0.98, 0.84, 0.36, sample.opacity * 0.8]);
    drawRect(sample.x - sample.width * 0.42, sample.y + 10, sample.width * 0.84, sample.height - 20, [0.09, 0.08, 0.15, sample.opacity * 0.92]);
    drawRect(sample.x - sample.width * 0.28, sample.y + 20, sample.width * 0.56, sample.height - 40, [1.0, 0.92, 0.58, sample.opacity * sample.glow * 0.45]);
  }

  function drawEffects(time) {
    var active = [];
    for (var index = 0; index < effects.length; index += 1) {
      var effect = effects[index];
      var elapsed = time - effect.startedAt;
      if (elapsed > effect.duration) {
        continue;
      }
      active.push(effect);

      if (effect.type === 'flight') {
        var flightProgress = easeOutCubic(elapsed / effect.duration);
        var flightX = lerp(effect.from.x, effect.to.x, flightProgress);
        var flightY = lerp(effect.from.y, effect.to.y, easeInOutSine(elapsed / effect.duration));
        drawRect(flightX - effect.width * 0.42, flightY - effect.height * 0.42, effect.width * 0.84, effect.height * 0.84, [effect.color[0], effect.color[1], effect.color[2], effect.color[3] * (1 - flightProgress * 0.4)]);
      } else if (effect.type === 'lunge') {
        var attackProgress = elapsed / effect.duration;
        var attackX;
        var attackY;
        if (attackProgress < 0.56) {
          attackX = lerp(effect.from.x, effect.to.x, easeOutCubic(attackProgress / 0.56));
          attackY = lerp(effect.from.y, effect.to.y, easeOutCubic(attackProgress / 0.56));
        } else {
          attackX = lerp(effect.to.x, effect.from.x, easeInOutSine((attackProgress - 0.56) / 0.44));
          attackY = lerp(effect.to.y, effect.from.y, easeInOutSine((attackProgress - 0.56) / 0.44));
        }
        drawRect(attackX - effect.width * 0.46, attackY - effect.height * 0.46, effect.width * 0.92, effect.height * 0.92, [effect.color[0], effect.color[1], effect.color[2], effect.color[3] * (1 - attackProgress * 0.2)]);
      } else if (effect.type === 'impact') {
        var impactProgress = elapsed / effect.duration;
        var size = effect.size * (0.45 + easeOutCubic(impactProgress) * 0.8);
        drawRect(effect.origin.x - size / 2, effect.origin.y - size / 2, size, size, [1.0, 0.86, 0.5, (1 - impactProgress) * 0.42]);
      } else if (effect.type === 'damage') {
        var damageProgress = elapsed / effect.duration;
        for (var pip = 0; pip < Math.min(effect.amount, 4); pip += 1) {
          drawRect(effect.origin.x - 14 + pip * 9, effect.origin.y - 28 - damageProgress * 46 - pip * 4, 7, 14, [1.0, 0.32, 0.3, (1 - damageProgress) * 0.9]);
        }
      } else if (effect.type === 'death') {
        var deathProgress = elapsed / effect.duration;
        var deathWidth = effect.width * (1 - deathProgress * 0.4);
        var deathHeight = effect.height * (1 - deathProgress * 0.4);
        drawRect(effect.origin.x - deathWidth / 2, effect.origin.y - deathHeight / 2 + deathProgress * 18, deathWidth, deathHeight, [0.08, 0.08, 0.12, (1 - deathProgress) * 0.55]);
      }
    }
    effects = active;
  }

  function drawBoard(time) {
    resizeCanvas();
    drawBackground(time);
    drawBoardState(time);
    drawEffects(time);
    drawTurnBanner(time);
    requestAnimationFrame(drawBoard);
  }

  saveState();
  syncHud();
  queueEnemyTurn();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(drawBoard);
})();
