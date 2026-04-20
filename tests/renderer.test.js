const test = require('node:test');
const assert = require('node:assert/strict');

function createMockCanvas() {
  const listeners = new Map();
  const gl = {
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    TRIANGLES: 0x0004,
    FLOAT: 0x1406,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    getUniformLocation: (_, name) => name,
    viewport: (...args) => {
      gl.lastViewport = args;
    },
    clearColor: (...args) => {
      gl.lastClearColor = args;
    },
    clear: (mask) => {
      gl.lastClearMask = mask;
    },
    useProgram: () => {},
    uniform1f: (location, value) => {
      gl.uniforms = gl.uniforms || {};
      gl.uniforms[location] = value;
    },
    uniform2f: (location, a, b) => {
      gl.uniforms = gl.uniforms || {};
      gl.uniforms[location] = [a, b];
    },
    drawArrays: (...args) => {
      gl.lastDrawArrays = args;
    },
  };

  return {
    canvas: {
      clientWidth: 640,
      clientHeight: 360,
      width: 0,
      height: 0,
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: (type) => listeners.delete(type),
      getContext: (type) => (type === 'webgl' ? gl : null),
      dispatchEvent: (type) => listeners.get(type)?.(),
    },
    gl,
  };
}

function createAnimationClock() {
  let nextFrameId = 1;
  const frames = new Map();

  return {
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    flush(time) {
      const pending = Array.from(frames.entries());
      frames.clear();
      for (const [, callback] of pending) {
        callback(time);
      }
    },
    size() {
      return frames.size;
    },
  };
}

test('createRenderer exposes start stop resize and render methods', () => {
  const { createRenderer } = require('../src/renderer.js');
  const { canvas } = createMockCanvas();
  const clock = createAnimationClock();

  const renderer = createRenderer({
    canvas,
    devicePixelRatio: 2,
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
  });

  assert.equal(typeof renderer.start, 'function');
  assert.equal(typeof renderer.stop, 'function');
  assert.equal(typeof renderer.resize, 'function');
  assert.equal(typeof renderer.render, 'function');
  assert.equal(typeof renderer.getState, 'function');
});

test('renderer resizes the canvas using devicePixelRatio and updates viewport', () => {
  const { createRenderer } = require('../src/renderer.js');
  const { canvas, gl } = createMockCanvas();
  const clock = createAnimationClock();

  const renderer = createRenderer({
    canvas,
    devicePixelRatio: 1.5,
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
  });

  renderer.resize();

  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 540);
  assert.deepEqual(gl.lastViewport, [0, 0, 960, 540]);
});

test('renderer runs a continuous animation loop until stopped', () => {
  const { createRenderer } = require('../src/renderer.js');
  const { canvas } = createMockCanvas();
  const clock = createAnimationClock();

  const renderer = createRenderer({
    canvas,
    devicePixelRatio: 1,
    requestAnimationFrame: clock.requestAnimationFrame.bind(clock),
    cancelAnimationFrame: clock.cancelAnimationFrame.bind(clock),
  });

  renderer.start();
  assert.equal(clock.size(), 1);

  clock.flush(16);
  const firstState = renderer.getState();
  assert.equal(firstState.frame, 1);
  assert.equal(clock.size(), 1);

  clock.flush(32);
  const secondState = renderer.getState();
  assert.equal(secondState.frame, 2);
  assert.equal(clock.size(), 1);

  renderer.stop();
  assert.equal(clock.size(), 0);
});
