(function () {
  var canvas = document.getElementById('game-canvas');
  var status = document.getElementById('boot-status');

  if (!canvas || !window.DuelRenderer) {
    return;
  }

  canvas.getContext('webgl', { alpha: false, antialias: true });

  try {
    var renderer = window.DuelRenderer.createRenderer({
      canvas: canvas,
    });
    var requestAnimationFrame = window.requestAnimationFrame;

    window.addEventListener('resize', renderer.resize);
    renderer.resize();
    renderer.start();
    window.duelGame = window.duelGame || {};
    window.duelGame.requestAnimationFrame = requestAnimationFrame;
    window.duelGame.renderer = renderer;
    status.textContent = 'Canvas shell ready for game systems.';
  } catch (error) {
    status.textContent = error && error.message ? error.message : 'WebGL is unavailable in this browser.';
  }
})();
