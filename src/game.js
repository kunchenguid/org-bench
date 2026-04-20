(function () {
  const STORAGE_PREFIX = (window.__BENCHMARK_RUN_NAMESPACE__ || 'facebook-run') + ':';
  const SAVE_KEY = STORAGE_PREFIX + 'duel-save';
  const RUN_KEY = STORAGE_PREFIX + 'encounter-index';
  const canvas = document.getElementById('game');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  const encounterName = document.getElementById('encounter-name');
  const encounterHint = document.getElementById('encounter-hint');
  const turnStatus = document.getElementById('turn-status');
  const battleLog = document.getElementById('battle-log');
  const playerActions = document.getElementById('player-actions');
  const endTurnButton = document.getElementById('end-turn');
  const newRunButton = document.getElementById('new-run');
  const encounters = window.GameCore.createEncounterSet();
  const state = loadState() || createRunState();
  let animationTime = 0;

  if (!gl) {
    turnStatus.textContent = 'WebGL is unavailable in this browser.';
    return;
  }

  const renderer = createRenderer(gl);
  wireActions();
  renderUi();
  requestAnimationFrame(frame);

  function createRunState() {
    const runIndex = Number(localStorage.getItem(RUN_KEY) || '0');
    const encounter = encounters[runIndex % encounters.length];
    localStorage.setItem(RUN_KEY, String(runIndex + 1));
    return window.GameCore.createInitialState(encounter, Date.now() % 10000 || 7);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveState() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function wireActions() {
    endTurnButton.addEventListener('click', function () {
      if (state.currentSide !== 'player' || state.winner) {
        return;
      }

      const enemyStart = window.GameCore.startEnemyTurn(state);
      Object.assign(state, enemyStart);
      renderUi();
      saveState();

      window.setTimeout(function () {
        const result = window.GameCore.applyEnemyTurn(state);
        Object.assign(state, result.state);
        renderUi();
        saveState();
      }, 850);
    });

    newRunButton.addEventListener('click', function () {
      const fresh = createRunState();
      replaceState(fresh);
      saveState();
      renderUi();
    });
  }

  function replaceState(nextState) {
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, nextState);
  }

  function renderUi() {
    encounterName.textContent = state.encounter.name + ' - Enemy: ' + state.enemy.name;
    encounterHint.textContent = state.encounter.hint;
    turnStatus.textContent = getStatusText();
    battleLog.innerHTML = '';
    state.log.slice(0, 6).forEach(function (entry) {
      const item = document.createElement('li');
      item.textContent = entry;
      battleLog.appendChild(item);
    });

    playerActions.innerHTML = '';
    state.player.hand.forEach(function (card, index) {
      const button = document.createElement('button');
      button.textContent = 'Play ' + card.name + ' (' + card.cost + ')';
      button.disabled = state.currentSide !== 'player' || card.cost > state.player.mana || state.winner;
      button.addEventListener('click', function () {
        replaceState(window.GameCore.playPlayerCard(state, index));
        renderUi();
        saveState();
      });
      playerActions.appendChild(button);
    });

    state.player.board.forEach(function (card, index) {
      const button = document.createElement('button');
      button.textContent = 'Attack with ' + card.name;
      button.disabled = state.currentSide !== 'player' || card.exhausted || state.winner;
      button.addEventListener('click', function () {
        replaceState(window.GameCore.playerAttackHero(state, index));
        renderUi();
        saveState();
      });
      playerActions.appendChild(button);
    });

    endTurnButton.disabled = state.currentSide !== 'player' || Boolean(state.winner);
  }

  function getStatusText() {
    if (state.winner === 'player') {
      return 'Victory. Start a new encounter to see a different enemy deck.';
    }

    if (state.winner === 'enemy') {
      return 'Defeat. Reload or start a new encounter to try a different matchup.';
    }

    return (
      'Turn ' + state.turn + ' - ' +
      (state.currentSide === 'player' ? 'Your move' : state.enemy.name + ' is taking a visible turn') +
      ' | You ' + state.player.health + ' HP / ' + state.player.mana + ' mana' +
      ' | Enemy ' + state.enemy.health + ' HP / ' + state.enemy.mana + ' mana'
    );
  }

  function frame(timestamp) {
    animationTime = timestamp * 0.001;
    renderer.draw(state, animationTime);
    requestAnimationFrame(frame);
  }

  function createRenderer(glContext) {
    const vertexShader = compileShader(glContext, glContext.VERTEX_SHADER, [
      'attribute vec2 aPosition;',
      'uniform vec2 uResolution;',
      'void main() {',
      '  vec2 zeroToOne = aPosition / uResolution;',
      '  vec2 zeroToTwo = zeroToOne * 2.0;',
      '  vec2 clipSpace = zeroToTwo - 1.0;',
      '  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);',
      '}',
    ].join(''));
    const fragmentShader = compileShader(glContext, glContext.FRAGMENT_SHADER, [
      'precision mediump float;',
      'uniform vec4 uColor;',
      'void main() {',
      '  gl_FragColor = uColor;',
      '}',
    ].join(''));
    const program = createProgram(glContext, vertexShader, fragmentShader);
    const positionLocation = glContext.getAttribLocation(program, 'aPosition');
    const resolutionLocation = glContext.getUniformLocation(program, 'uResolution');
    const colorLocation = glContext.getUniformLocation(program, 'uColor');
    const buffer = glContext.createBuffer();

    glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer);
    glContext.enableVertexAttribArray(positionLocation);
    glContext.vertexAttribPointer(positionLocation, 2, glContext.FLOAT, false, 0, 0);

    return {
      draw: function (gameState, time) {
        resizeCanvas();
        glContext.viewport(0, 0, canvas.width, canvas.height);
        glContext.clearColor(0.03, 0.07, 0.12, 1.0);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
        glContext.useProgram(program);
        glContext.uniform2f(resolutionLocation, canvas.width, canvas.height);

        const pulse = 0.08 * Math.sin(time * 2.4);
        drawRect(0, 0, canvas.width, canvas.height, [0.04, 0.09 + pulse, 0.14, 1]);
        drawRect(70, 70, canvas.width - 140, 180, hexToColor(gameState.encounter.enemyStyle.secondary, 1));
        drawRect(70, canvas.height - 250, canvas.width - 140, 180, [0.22, 0.27, 0.36, 1]);
        drawHero(110, 92, gameState.enemy.health, gameState.enemy.name, true, time);
        drawHero(110, canvas.height - 228, gameState.player.health, gameState.player.name, false, time);
        drawBoardRow(gameState.enemy.board, 320, 100, true, time);
        drawBoardRow(gameState.player.board, 320, canvas.height - 220, false, time);
        drawHand(gameState.player.hand, 240, canvas.height - 118, time);
      },
    };

    function drawHero(x, y, health, name, enemy, time) {
      const sway = Math.sin(time * 1.6 + (enemy ? 0.8 : 0)) * 6;
      drawRect(x + sway, y, 160, 120, enemy ? hexToColor('#8a4f5f', 1) : hexToColor('#5070c5', 1));
      drawRect(x + sway + 12, y + 12, 136, 96, enemy ? hexToColor('#d07a92', 1) : hexToColor('#9ac0ff', 1));
      drawRect(x + sway + 116, y + 76, 26, 20, [0.12, 0.12, 0.16, 1]);
      drawRect(x + sway + 20, y + 76, Math.max(0, health) * 6, 18, [0.85, 0.21, 0.33, 1]);
    }

    function drawBoardRow(cards, startX, y, enemy, time) {
      cards.forEach(function (card, index) {
        const offset = enemy ? Math.sin(time * 1.4 + index) * 4 : Math.cos(time * 1.7 + index) * 4;
        const x = startX + index * 150;
        drawRect(x, y + offset, 120, 140, enemy ? hexToColor('#51774a', 1) : hexToColor('#4764a5', 1));
        drawRect(x + 8, y + 10 + offset, 104, 78, enemy ? hexToColor('#92bb7f', 1) : hexToColor('#9dc0ff', 1));
        drawRect(x + 8, y + 100 + offset, card.attack * 16, 12, [0.95, 0.74, 0.25, 1]);
        drawRect(x + 8, y + 118 + offset, Math.max(0, card.currentHealth) * 12, 12, [0.86, 0.22, 0.3, 1]);
      });
    }

    function drawHand(cards, startX, y, time) {
      cards.forEach(function (card, index) {
        const lift = Math.sin(time * 2 + index * 0.4) * 3;
        const x = startX + index * 120;
        drawRect(x, y + lift, 96, 108, [0.86, 0.82, 0.69, 1]);
        drawRect(x + 6, y + 10 + lift, 84, 62, [0.96, 0.93, 0.84, 1]);
        drawRect(x + 6, y + 78 + lift, card.cost * 18, 10, [0.34, 0.58, 1, 1]);
      });
    }

    function drawRect(x, y, width, height, color) {
      const x1 = x;
      const x2 = x + width;
      const y1 = y;
      const y2 = y + height;
      const vertices = new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2,
      ]);
      glContext.bufferData(glContext.ARRAY_BUFFER, vertices, glContext.STATIC_DRAW);
      glContext.uniform4fv(colorLocation, color);
      glContext.drawArrays(glContext.TRIANGLES, 0, 6);
    }
  }

  function resizeCanvas() {
    const scale = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * scale);
    const displayHeight = Math.floor(canvas.clientHeight * scale);
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }
  }

  function compileShader(glContext, type, source) {
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);
    return shader;
  }

  function createProgram(glContext, vertexShader, fragmentShader) {
    const program = glContext.createProgram();
    glContext.attachShader(program, vertexShader);
    glContext.attachShader(program, fragmentShader);
    glContext.linkProgram(program);
    return program;
  }

  function hexToColor(hex, alpha) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
      alpha,
    ];
  }
})();
