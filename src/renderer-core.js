(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.FBDuelRendererCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function computeCanvasSize(cssWidth, cssHeight, devicePixelRatio) {
    const ratio = Math.max(1, devicePixelRatio || 1);
    return {
      cssWidth: cssWidth,
      cssHeight: cssHeight,
      pixelWidth: Math.round(cssWidth * ratio),
      pixelHeight: Math.round(cssHeight * ratio),
    };
  }

  function resolveAssetUrl(assetPath, documentUrl) {
    return new URL(assetPath, documentUrl).toString();
  }

  return {
    computeCanvasSize,
    resolveAssetUrl,
  };
});
