(function () {
  var core = window.ShardDuelCore;
  var canvas = document.getElementById('game');
  var statusNode = document.getElementById('status');
  var playerSummaryNode = document.getElementById('player-summary');
  var enemySummaryNode = document.getElementById('enemy-summary');
  var endTurnButton = document.getElementById('end-turn');
  var newRunButton = document.getElementById('new-run');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: false });

  if (!gl) {
    statusNode.textContent = 'WebGL is unavailable in this browser.';
    return;
  }

  var namespace = detectNamespace();
  var saveKey = core.storageKey(namespace, 'save');
  var state = restoreState() || core.createInitialState({ seed: Date.now() % 100000 });
  var program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  var positionLocation = gl.getAttribLocation(program, 'a_position');
  var timeLocation = gl.getUniformLocation(program, 'u_time');
  var resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  var buffer = gl.createBuffer();
  var lastFrame = 0;

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  endTurnButton.addEventListener('click', function () {
    state.turn += 1;
    state.currentSide = state.currentSide === 'player' ? 'enemy' : 'player';
    state.player.mana = Math.min(10, state.turn);
    state.enemy.mana = Math.min(10, state.turn);
    persistState();
    syncHud();
  });

  newRunButton.addEventListener('click', function () {
    state = core.createInitialState({ seed: Date.now() % 100000 });
    persistState();
    syncHud();
  });

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  persistState();
  syncHud();
  requestAnimationFrame(render);

  function detectNamespace() {
    return (
      window.__BENCHMARK_RUN_NAMESPACE__ ||
      window.BENCHMARK_RUN_NAMESPACE ||
      new URLSearchParams(window.location.search).get('storageNamespace') ||
      'duel:'
    );
  }

  function restoreState() {
    try {
      var raw = window.localStorage.getItem(saveKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      statusNode.textContent = 'Starting fresh duel. Saved data could not be restored.';
      return null;
    }
  }

  function persistState() {
    try {
      window.localStorage.setItem(saveKey, JSON.stringify(state));
    } catch (error) {
      statusNode.textContent = 'Autosave failed in this browser session.';
    }
  }

  function syncHud() {
    statusNode.textContent =
      'Turn ' +
      state.turn +
      ' - ' +
      (state.currentSide === 'player' ? 'your move. The duel seed is saved locally.' : 'enemy planning a response.');
    playerSummaryNode.textContent = summaryFor(state.player);
    enemySummaryNode.textContent = summaryFor(state.enemy);
  }

  function summaryFor(side) {
    return side.health + ' health, ' + side.mana + ' mana, ' + side.hand.length + ' in hand, ' + side.deck.length + ' in deck';
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.floor(window.innerWidth * dpr);
    var height = Math.floor(window.innerHeight * dpr);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(now) {
    var seconds = now * 0.001;
    lastFrame = seconds;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(timeLocation, seconds);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
  }

  function createProgram(glContext, vertexSource, fragmentSource) {
    var vertexShader = compileShader(glContext, glContext.VERTEX_SHADER, vertexSource);
    var fragmentShader = compileShader(glContext, glContext.FRAGMENT_SHADER, fragmentSource);
    var shaderProgram = glContext.createProgram();
    glContext.attachShader(shaderProgram, vertexShader);
    glContext.attachShader(shaderProgram, fragmentShader);
    glContext.linkProgram(shaderProgram);

    if (!glContext.getProgramParameter(shaderProgram, glContext.LINK_STATUS)) {
      throw new Error(glContext.getProgramInfoLog(shaderProgram));
    }

    return shaderProgram;
  }

  function compileShader(glContext, type, source) {
    var shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);

    if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
      throw new Error(glContext.getShaderInfoLog(shader));
    }

    return shader;
  }

  var VERTEX_SHADER = [
    'attribute vec2 a_position;',
    'void main() {',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAGMENT_SHADER = [
    'precision mediump float;',
    'uniform float u_time;',
    'uniform vec2 u_resolution;',
    '',
    'float ring(vec2 uv, vec2 center, float radius, float width) {',
    '  float distanceToCenter = distance(uv, center);',
    '  return smoothstep(radius + width, radius, distanceToCenter) * smoothstep(radius - width, radius, distanceToCenter);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;',
    '  vec2 centered = uv - 0.5;',
    '  centered.x *= u_resolution.x / u_resolution.y;',
    '  float pulse = 0.55 + 0.45 * sin(u_time * 0.8);',
    '  float boardGlow = 0.15 / max(length(centered) * 1.7, 0.2);',
    '  float topSigil = ring(uv, vec2(0.5, 0.26), 0.13 + 0.01 * sin(u_time), 0.011);',
    '  float bottomSigil = ring(uv, vec2(0.5, 0.74), 0.13 + 0.01 * cos(u_time * 1.2), 0.011);',
    '  vec3 base = mix(vec3(0.02, 0.05, 0.10), vec3(0.03, 0.12, 0.20), uv.y);',
    '  vec3 lane = vec3(0.15, 0.11, 0.22) * smoothstep(0.42, 0.08, abs(uv.y - 0.5));',
    '  vec3 highlight = vec3(0.12, 0.25, 0.45) * boardGlow * pulse;',
    '  vec3 sigils = vec3(0.31, 0.72, 0.98) * topSigil + vec3(0.88, 0.44, 0.96) * bottomSigil;',
    '  gl_FragColor = vec4(base + lane + highlight + sigils, 1.0);',
    '}'
  ].join('\n');
})();
