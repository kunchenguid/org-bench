(function () {
  var catalog = {
    board: {
      path: 'assets/art/board/astral-duel-board.svg',
    },
    heroes: {
      player: 'assets/art/heroes/solar-warden-placeholder.svg',
      enemy: 'assets/art/heroes/umbral-oracle-placeholder.svg',
    },
    hud: {
      health: 'assets/art/icons/health-glyph.svg',
      mana: 'assets/art/icons/mana-crystal.svg',
    },
    accents: {
      player: ['#f8d36a', '#ff9f43', '#5b2d0f', '#fff4cf'],
      enemy: ['#69e6ff', '#5777ff', '#21163d', '#cbe9ff'],
    },
  };

  function createArtCatalog() {
    return JSON.parse(JSON.stringify(catalog));
  }

  var api = {
    createArtCatalog: createArtCatalog,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.ArtConfig = api;
  }
})();
