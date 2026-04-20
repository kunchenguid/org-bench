(function (global) {
  'use strict';

  var vertexShaderSource = [
    'attribute vec2 a_position;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = 0.5 * (a_position + 1.0);',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var fragmentShaderSource = [
    'precision mediump float;',
    'uniform float u_time;',
    'uniform vec2 u_resolution;',
    'varying vec2 v_uv;',
    '',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    '',
    'float glow(vec2 uv, vec2 center, float radius) {',
    '  float dist = distance(uv, center);',
    '  return smoothstep(radius, 0.0, dist);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = v_uv;',
    '  vec2 centered = uv - 0.5;',
    '  centered.x *= u_resolution.x / max(u_resolution.y, 1.0);',
    '',
    '  float wave = sin((centered.x * 4.0) + u_time * 0.55) * 0.08;',
    '  wave += cos((centered.y * 6.0) - u_time * 0.35) * 0.06;',
    '  float energy = 0.5 + 0.5 * sin((centered.x + centered.y) * 5.0 + u_time * 0.45);',
    '',
    '  vec3 colorA = vec3(0.03, 0.05, 0.14);',
    '  vec3 colorB = vec3(0.06, 0.19, 0.33);',
    '  vec3 colorC = vec3(0.45, 0.19, 0.59);',
    '  vec3 background = mix(colorA, colorB, uv.y + wave);',
    '  background = mix(background, colorC, 0.18 * energy);',
    '',
    '  vec2 pulseCenter = vec2(0.5 + sin(u_time * 0.21) * 0.16, 0.58 + cos(u_time * 0.19) * 0.09);',
    '  float pulse = glow(uv, pulseCenter, 0.36 + sin(u_time * 0.4) * 0.05);',
    '  background += vec3(0.12, 0.08, 0.18) * pulse * 0.45;',
    '',
    '  float particles = 0.0;',
    '  for (int i = 0; i < 12; i++) {',
    '    float fi = float(i);',
    '    vec2 seed = vec2(fi, fi * 1.73);',
    '    vec2 point = vec2(hash(seed), fract(hash(seed + 3.1) + u_time * (0.02 + fi * 0.003)));',
    '    point.x += sin(u_time * (0.25 + fi * 0.04) + fi) * 0.04;',
    '    particles += glow(uv, point, 0.018 + hash(seed + 9.0) * 0.02) * (0.25 + hash(seed + 4.2));',
    '  }',
    '',
    '  vec3 particleColor = vec3(0.42, 0.75, 0.98) * particles;',
    '  vec3 vignette = vec3(1.0 - smoothstep(0.35, 0.95, length(centered) * 1.2));',
    '  vec3 finalColor = background + particleColor + vignette * 0.08;',
    '  gl_FragColor = vec4(finalColor, 1.0);',
    '}'
  ].join('\n');

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'WebGL shader compile failed');
    }

    return shader;
  }

  function createProgram(gl) {
    var vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    var fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'WebGL program link failed');
    }

    return program;
  }

  function createQuad(gl) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1
    ]), gl.STATIC_DRAW);
    return buffer;
  }

  function createRenderer(options) {
    options = options || {};

    if (!options.canvas) {
      throw new Error('createRenderer requires a canvas');
    }

    var canvas = options.canvas;
    var requestAnimationFrameImpl = options.requestAnimationFrame || global.requestAnimationFrame.bind(global);
    var cancelAnimationFrameImpl = options.cancelAnimationFrame || global.cancelAnimationFrame.bind(global);
    var devicePixelRatio = options.devicePixelRatio || global.devicePixelRatio || 1;
    var gl = canvas.getContext('webgl', { alpha: false, antialias: true });

    if (!gl) {
      throw new Error('WebGL is unavailable in this browser');
    }

    var program = createProgram(gl);
    var buffer = createQuad(gl);
    var positionLocation = gl.getAttribLocation(program, 'a_position');
    var timeLocation = gl.getUniformLocation(program, 'u_time');
    var resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    var frameHandle = null;
    var running = false;
    var state = {
      frame: 0,
      width: 0,
      height: 0,
      time: 0,
      startedAt: 0,
    };

    function resize() {
      var width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
      var height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      state.width = width;
      state.height = height;
      gl.viewport(0, 0, width, height);
      return state;
    }

    function render(now) {
      if (!state.startedAt) {
        state.startedAt = now || 0;
      }

      state.frame += 1;
      state.time = Math.max(0, ((now || 0) - state.startedAt) / 1000);

      if (!state.width || !state.height) {
        resize();
      }

      gl.clearColor(0.01, 0.02, 0.05, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(timeLocation, state.time);
      gl.uniform2f(resolutionLocation, state.width, state.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return state;
    }

    function tick(now) {
      frameHandle = null;
      render(now);

      if (running) {
        frameHandle = requestAnimationFrameImpl(tick);
      }
    }

    function start() {
      if (running) {
        return state;
      }

      running = true;
      resize();
      frameHandle = requestAnimationFrameImpl(tick);
      return state;
    }

    function stop() {
      running = false;

      if (frameHandle !== null) {
        cancelAnimationFrameImpl(frameHandle);
        frameHandle = null;
      }

      return state;
    }

    function getState() {
      return {
        frame: state.frame,
        width: state.width,
        height: state.height,
        time: state.time,
        startedAt: state.startedAt,
      };
    }

    return {
      canvas: canvas,
      gl: gl,
      start: start,
      stop: stop,
      resize: resize,
      render: render,
      getState: getState,
    };
  }

  var api = {
    createRenderer: createRenderer,
  };

  global.DuelRenderer = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
