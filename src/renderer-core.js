(function (global) {
  'use strict';

  function clampDimension(value) {
    return Math.max(1, Math.floor(Number.isFinite(value) ? value : 0));
  }

  function computeCanvasSize(width, height, devicePixelRatio) {
    const cssWidth = clampDimension(width);
    const cssHeight = clampDimension(height);
    const scale = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);

    return {
      cssWidth: cssWidth,
      cssHeight: cssHeight,
      pixelWidth: clampDimension(cssWidth * scale),
      pixelHeight: clampDimension(cssHeight * scale),
    };
  }

  function resolveAssetUrl(relativePath, baseHref) {
    return new URL(relativePath, baseHref).toString();
  }

  const api = {
    computeCanvasSize: computeCanvasSize,
    resolveAssetUrl: resolveAssetUrl,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.RendererCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
