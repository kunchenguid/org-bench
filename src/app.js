(function () {
  'use strict';

  const RendererCore = window.RendererCore;

  const canvas = document.getElementById('game-canvas');
  const statusNode = document.getElementById('loading-status');
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });

  if (!gl) {
    statusNode.textContent = 'WebGL is unavailable in this browser.';
    return;
  }

  const vertexSource = [
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  const fragmentSource = [
    'precision mediump float;',
    'uniform sampler2D uTexture;',
    'uniform vec2 uResolution;',
    'uniform float uTime;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 rippleUv = vUv;',
    '  rippleUv.y += sin((vUv.x * 12.0) + (uTime * 0.8)) * 0.015;',
    '  rippleUv.x += cos((vUv.y * 9.0) + (uTime * 0.6)) * 0.012;',
    '  vec4 base = texture2D(uTexture, rippleUv);',
    '  float vignette = smoothstep(1.05, 0.15, distance(vUv, vec2(0.5)));',
    '  float sweep = 0.08 * sin((vUv.x + vUv.y) * 18.0 + uTime * 1.7);',
    '  float spark = step(0.985, fract(sin(dot(floor(vUv * 42.0), vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.04));',
    '  vec3 ambient = vec3(0.08, 0.14, 0.18) * vignette + vec3(0.16, 0.08, 0.02) * sweep;',
    '  vec3 color = base.rgb + ambient + vec3(0.85, 0.7, 0.35) * spark * 0.22;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  const program = createProgram(gl, vertexSource, fragmentSource);
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const textureLocation = gl.getUniformLocation(program, 'uTexture');
  const resolutionLocation = gl.getUniformLocation(program, 'uResolution');
  const timeLocation = gl.getUniformLocation(program, 'uTime');
  const texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let boardImage = null;
  let boardReady = false;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const size = RendererCore.computeCanvasSize(bounds.width, bounds.height, window.devicePixelRatio || 1);

    canvas.width = size.pixelWidth;
    canvas.height = size.pixelHeight;
    canvas.style.width = size.cssWidth + 'px';
    canvas.style.height = size.cssHeight + 'px';

    gl.viewport(0, 0, size.pixelWidth, size.pixelHeight);
  }

  function renderFrame(now) {
    resize();
    gl.clearColor(0.02, 0.03, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (boardReady) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(textureLocation, 0);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, now * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    requestAnimationFrame(renderFrame);
  }

  loadImage(RendererCore.resolveAssetUrl('assets/board-background.svg', window.location.href))
    .then(function (image) {
      boardImage = image;
      boardReady = true;
      statusNode.textContent = 'Board texture loaded.';
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, boardImage);
    })
    .catch(function (error) {
      statusNode.textContent = 'Failed to load board texture: ' + error.message;
    });

  requestAnimationFrame(renderFrame);

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error(src));
      };
      image.src = src;
    });
  }

  function createProgram(glContext, vertexShaderSource, fragmentShaderSource) {
    const vertexShader = createShader(glContext, glContext.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(glContext, glContext.FRAGMENT_SHADER, fragmentShaderSource);
    const shaderProgram = glContext.createProgram();

    glContext.attachShader(shaderProgram, vertexShader);
    glContext.attachShader(shaderProgram, fragmentShader);
    glContext.linkProgram(shaderProgram);

    if (!glContext.getProgramParameter(shaderProgram, glContext.LINK_STATUS)) {
      throw new Error(glContext.getProgramInfoLog(shaderProgram) || 'Program link failed');
    }

    return shaderProgram;
  }

  function createShader(glContext, type, source) {
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);

    if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
      throw new Error(glContext.getShaderInfoLog(shader) || 'Shader compile failed');
    }

    return shader;
  }
})();
