(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GlassReefRenderRuntime = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clampDpr(value) {
    var next = Number(value) || 1;
    return Math.max(1, Math.min(2, next));
  }

  function computeViewport(sceneSize, windowSize, devicePixelRatio) {
    var sceneWidth = sceneSize.width;
    var sceneHeight = sceneSize.height;
    var scale = Math.min(windowSize.width / sceneWidth, windowSize.height / sceneHeight);
    var cssWidth = sceneWidth * scale;
    var cssHeight = sceneHeight * scale;
    var dpr = clampDpr(devicePixelRatio);

    return {
      cssWidth: cssWidth,
      cssHeight: cssHeight,
      pixelWidth: Math.round(cssWidth * dpr),
      pixelHeight: Math.round(cssHeight * dpr),
      offsetX: (windowSize.width - cssWidth) * 0.5,
      offsetY: (windowSize.height - cssHeight) * 0.5,
      scale: scale,
      dpr: dpr,
    };
  }

  function normalizePointer(point, rect, sceneSize) {
    return {
      x: ((point.x - rect.left) / rect.width) * sceneSize.width,
      y: ((point.y - rect.top) / rect.height) * sceneSize.height,
    };
  }

  function resolveAssetUrl(assetPath, baseHref) {
    return new URL(assetPath, baseHref || (typeof document !== 'undefined' ? document.baseURI : 'file:///')).toString();
  }

  function createSceneGraph() {
    var nodes = [];

    return {
      add: function (node) {
        nodes.push(node);
        return node;
      },
      clear: function () {
        nodes.length = 0;
      },
      getDrawList: function () {
        return nodes.slice().sort(function (left, right) {
          if (left.layer !== right.layer) {
            return left.layer - right.layer;
          }
          return (left.order || 0) - (right.order || 0);
        });
      },
    };
  }

  function createPointerTracker(canvas, sceneSize) {
    var state = {
      sceneX: 0,
      sceneY: 0,
      isDown: false,
      justPressed: false,
      justReleased: false,
      inside: false,
    };

    function updateFromEvent(event) {
      var rect = canvas.getBoundingClientRect();
      var point = normalizePointer({ x: event.clientX, y: event.clientY }, rect, sceneSize);
      state.sceneX = point.x;
      state.sceneY = point.y;
      state.inside = point.x >= 0 && point.x <= sceneSize.width && point.y >= 0 && point.y <= sceneSize.height;
    }

    canvas.addEventListener('pointermove', function (event) {
      updateFromEvent(event);
    });
    canvas.addEventListener('pointerdown', function (event) {
      updateFromEvent(event);
      state.isDown = true;
      state.justPressed = true;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointerup', function (event) {
      updateFromEvent(event);
      state.isDown = false;
      state.justReleased = true;
      canvas.releasePointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointerleave', function () {
      state.inside = false;
      state.isDown = false;
    });

    return {
      sample: function () {
        var snapshot = {
          x: state.sceneX,
          y: state.sceneY,
          isDown: state.isDown,
          justPressed: state.justPressed,
          justReleased: state.justReleased,
          inside: state.inside,
        };
        state.justPressed = false;
        state.justReleased = false;
        return snapshot;
      },
    };
  }

  function createTextureLoader(baseHref) {
    var cache = {};

    function load(path) {
      if (cache[path]) {
        return cache[path];
      }
      cache[path] = new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          resolve({
            path: path,
            url: resolveAssetUrl(path, baseHref),
            image: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        };
        image.onerror = reject;
        image.src = resolveAssetUrl(path, baseHref);
      });
      return cache[path];
    }

    return {
      load: load,
      preload: function (paths) {
        return Promise.all(paths.map(load));
      },
    };
  }

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function createFullscreenProgram(gl) {
    var vertexShader = compileShader(gl, gl.VERTEX_SHADER, [
      'attribute vec2 a_position;',
      'varying vec2 v_uv;',
      'void main() {',
      '  v_uv = a_position * 0.5 + 0.5;',
      '  gl_Position = vec4(a_position, 0.0, 1.0);',
      '}',
    ].join('\n'));
    var fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, [
      'precision mediump float;',
      'uniform sampler2D u_scene;',
      'uniform float u_time;',
      'varying vec2 v_uv;',
      'void main() {',
      '  vec2 centered = v_uv - 0.5;',
      '  float vignette = 1.0 - dot(centered, centered) * 0.52;',
      '  vec4 color = texture2D(u_scene, vec2(v_uv.x, 1.0 - v_uv.y));',
      '  float pulse = 0.012 * sin(u_time + v_uv.y * 12.0);',
      '  color.rgb += vec3(0.02, 0.05, 0.08) * pulse;',
      '  gl_FragColor = vec4(color.rgb * vignette, 1.0);',
      '}',
    ].join('\n'));
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]), gl.STATIC_DRAW);

    return {
      program: program,
      buffer: buffer,
      positionLocation: gl.getAttribLocation(program, 'a_position'),
      sceneLocation: gl.getUniformLocation(program, 'u_scene'),
      timeLocation: gl.getUniformLocation(program, 'u_time'),
    };
  }

  function createSceneTexture(gl) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  function createRenderRuntime(options) {
    var settings = options || {};
    var canvas = settings.canvas;
    var sceneSize = settings.sceneSize || { width: 1600, height: 900 };
    var gl = canvas.getContext('webgl', { alpha: false, antialias: true });

    if (!gl) {
      throw new Error('WebGL is required');
    }

    var sceneCanvas = document.createElement('canvas');
    var sceneContext = sceneCanvas.getContext('2d');
    sceneCanvas.width = sceneSize.width;
    sceneCanvas.height = sceneSize.height;

    var pointer = createPointerTracker(canvas, sceneSize);
    var graph = createSceneGraph();
    var loader = createTextureLoader(settings.baseHref || document.baseURI);
    var program = createFullscreenProgram(gl);
    var sceneTexture = createSceneTexture(gl);
    var beforeRender = settings.beforeRender || function () {};
    var timeScale = 0.001;
    var lastTime = 0;
    var rafId = 0;

    function resize() {
      var viewport = computeViewport(sceneSize, {
        width: window.innerWidth,
        height: window.innerHeight,
      }, window.devicePixelRatio || 1);

      canvas.width = viewport.pixelWidth;
      canvas.height = viewport.pixelHeight;
      canvas.style.width = viewport.cssWidth + 'px';
      canvas.style.height = viewport.cssHeight + 'px';
      canvas.style.marginLeft = viewport.offsetX + 'px';
      canvas.style.marginTop = viewport.offsetY + 'px';
      gl.viewport(0, 0, viewport.pixelWidth, viewport.pixelHeight);
      return viewport;
    }

    function drawFullscreen(time) {
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
      gl.useProgram(program.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, program.buffer);
      gl.enableVertexAttribArray(program.positionLocation);
      gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(program.sceneLocation, 0);
      gl.uniform1f(program.timeLocation, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function frame(now) {
      var deltaTime = lastTime ? (now - lastTime) * timeScale : 0;
      lastTime = now;
      beforeRender({
        graph: graph,
        scene: sceneContext,
        sceneSize: sceneSize,
        deltaTime: deltaTime,
        elapsed: now * timeScale,
        pointer: pointer.sample(),
        loader: loader,
      });
      drawFullscreen(now * timeScale);
      rafId = window.requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);

    return {
      gl: gl,
      graph: graph,
      loader: loader,
      resize: resize,
      start: function () {
        if (!rafId) {
          rafId = window.requestAnimationFrame(frame);
        }
      },
      stop: function () {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
    };
  }

  return {
    createRenderRuntime: createRenderRuntime,
    createSceneGraph: createSceneGraph,
    computeViewport: computeViewport,
    normalizePointer: normalizePointer,
    resolveAssetUrl: resolveAssetUrl,
  };
});
