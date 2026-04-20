(function () {
  var canvas = document.getElementById('game-canvas');
  var status = document.getElementById('boot-status');
  var statusCopy = status ? status.querySelector('.boot-status__copy') : null;
  var artCatalog = window.ArtConfig ? window.ArtConfig.createArtCatalog() : null;
  var duelGame = window.duelGame || (window.duelGame = {});

  function preload(path) {
    if (!path || typeof Image === 'undefined') {
      return null;
    }

    var image = new Image();
    image.decoding = 'async';
    image.src = path;
    return image;
  }

  function buildArtAssets(catalog) {
    if (!catalog) {
      return null;
    }

    return {
      catalog: catalog,
      images: {
        board: preload(catalog.board.path),
        heroes: {
          player: preload(catalog.heroes.player),
          enemy: preload(catalog.heroes.enemy),
        },
        hud: {
          health: preload(catalog.hud.health),
          mana: preload(catalog.hud.mana),
        },
      },
    };
  }

  duelGame.art = buildArtAssets(artCatalog);

  if (!canvas || !window.DuelRenderer) {
    return;
  }

  canvas.getContext('webgl', { alpha: false, antialias: true });

  try {
    var renderer = window.DuelRenderer.createRenderer({
      canvas: canvas,
      art: duelGame.art,
    });
    var requestAnimationFrame = window.requestAnimationFrame;

    window.addEventListener('resize', renderer.resize);
    renderer.resize();
    renderer.start();
    duelGame.requestAnimationFrame = requestAnimationFrame;
    duelGame.renderer = renderer;

    if (statusCopy) {
      statusCopy.textContent = duelGame.art ? 'Renderer ready. Local art pack attached for board, hero, and HUD surfaces.' : 'Canvas shell ready for game systems.';
    }
  } catch (error) {
    if (statusCopy) {
      statusCopy.textContent = error && error.message ? error.message : 'WebGL is unavailable in this browser.';
    }
  }
})();
