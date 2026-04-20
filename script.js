(function () {
  var canvas = document.getElementById('game-canvas');
  var status = document.getElementById('boot-status');
  var gl = canvas.getContext('webgl', { alpha: false, antialias: true });

  if (!gl) {
    status.textContent = 'WebGL is unavailable in this browser.';
    return;
  }

  function resizeCanvas() {
    var ratio = window.devicePixelRatio || 1;
    var width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    var height = Math.max(1, Math.floor(canvas.clientHeight * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(now) {
    var t = now * 0.001;
    var glow = 0.08 + Math.sin(t * 0.9) * 0.03;

    resizeCanvas();
    gl.clearColor(0.02, 0.07 + glow, 0.14 + glow * 1.8, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    requestAnimationFrame(render);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  status.textContent = 'Canvas shell ready for game systems.';
  requestAnimationFrame(render);
})();
