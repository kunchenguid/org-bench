(function () {
  var Game = window.FBDuelGame || window.FBDuelGameState;
  var gameCanvas = document.getElementById('game');
  var playCardButton = document.getElementById('play-card');
  var endTurnButton = document.getElementById('end-turn');
  var resetButton = document.getElementById('reset-game');
  var turnLabel = document.getElementById('turn-label');
  var saveLabel = document.getElementById('save-label');
  var cueTitle = document.getElementById('cue-title');
  var cueBody = document.getElementById('cue-body');

  if (!gameCanvas || !Game) {
    return;
  }

  var gl = gameCanvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    cueTitle.textContent = 'WebGL is unavailable in this browser.';
    cueBody.textContent = 'Open the file in a modern browser with WebGL enabled.';
    return;
  }

  var vertexShaderSource = [
    'attribute vec2 a_position;',
    'void main() {',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}',
  ].join('\n');

  var fragmentShaderSource = [
    'precision mediump float;',
    'uniform vec2 u_resolution;',
    'uniform float u_time;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;',
    '  float pulse = 0.08 * sin(u_time * 0.0018) + 0.92;',
    '  float nebula = 0.5 + 0.5 * sin((uv.x + uv.y) * 10.0 + u_time * 0.0013);',
    '  vec3 top = vec3(0.06, 0.09, 0.20) * pulse;',
    '  vec3 bottom = vec3(0.01, 0.02, 0.06);',
    '  vec3 color = mix(bottom, top, uv.y) + nebula * vec3(0.05, 0.03, 0.08);',
    '  gl_FragColor = vec4(color, 1.0);',
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

  function createProgram() {
    var program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexShaderSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Program link failed.');
    }
    return program;
  }

  var program = createProgram();
  var positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  var positionLocation = gl.getAttribLocation(program, 'a_position');
  var resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  var timeLocation = gl.getUniformLocation(program, 'u_time');

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

  function saveState() {
    var serializer = Game.serializeState || JSON.stringify;
    window.localStorage.setItem(storageKey, serializer(state));
    saveLabel.textContent = 'Saved to ' + storageKey;
  }

  function heroHealth(side) {
    return side.heroHealth != null ? side.heroHealth : side.health;
  }

  function syncHud() {
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
      state = (Game.resolveEnemyTurn || Game.runEnemyTurn)(state);
      saveState();
      syncHud();
    }, 900);
  }

  playCardButton.addEventListener('click', function () {
    var cardId = firstPlayableCardId();
    if (!cardId) {
      return;
    }
    state = Game.playCard(state, cardId);
    saveState();
    syncHud();
  });

  endTurnButton.addEventListener('click', function () {
    state = Game.endTurn(state);
    saveState();
    syncHud();
    queueEnemyTurn();
  });

  resetButton.addEventListener('click', function () {
    state = Game.createInitialState();
    saveState();
    syncHud();
  });

  function resizeCanvas() {
    var devicePixelRatio = window.devicePixelRatio || 1;
    var width = Math.max(1, Math.floor(gameCanvas.clientWidth * devicePixelRatio));
    var height = Math.max(1, Math.floor(gameCanvas.clientHeight * devicePixelRatio));

    if (gameCanvas.width !== width || gameCanvas.height !== height) {
      gameCanvas.width = width;
      gameCanvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }

  function drawBoard(time) {
    resizeCanvas();

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolutionLocation, gameCanvas.width, gameCanvas.height);
    gl.uniform1f(timeLocation, time);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(drawBoard);
  }

  saveState();
  syncHud();
  queueEnemyTurn();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(drawBoard);
})();
