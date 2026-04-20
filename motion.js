(function (globalScope, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  globalScope.AppleDuelMotion = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fanCardTransform(index, count, hovered, pointerBias) {
    const safeCount = Math.max(1, count);
    const midpoint = (safeCount - 1) * 0.5;
    const offset = index - midpoint;
    const normalized = midpoint ? offset / midpoint : 0;
    const bias = pointerBias || 0;

    return {
      offsetX: offset * 28 + bias * 10,
      offsetY: Math.abs(normalized) * 16,
      angle: normalized * 0.18 + bias * 0.04,
      lift: hovered ? 34 : 8 - Math.abs(normalized) * 4,
      scale: hovered ? 1.04 : 1,
    };
  }

  function damageNumberState(origin, elapsed, duration) {
    const span = Math.max(0.0001, duration || 1);
    const t = Math.max(0, Math.min(1, elapsed / span));
    return {
      x: (origin.x || 0) + (origin.driftX || 0) * t,
      y: (origin.y || 0) - 42 * t,
      alpha: 1 - t,
      scale: 1 + Math.sin(t * Math.PI) * 0.16,
    };
  }

  function manaShimmer(elapsed, phase) {
    const t = elapsed + (phase || 0);
    return {
      glow: 0.5 + Math.sin(t * Math.PI * 2) * 0.5,
      spark: 0.5 + Math.cos(t * Math.PI * 3) * 0.5,
    };
  }

  return {
    fanCardTransform: fanCardTransform,
    damageNumberState: damageNumberState,
    manaShimmer: manaShimmer,
  };
});
