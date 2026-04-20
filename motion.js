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

  function attackLungeOffset(vector, progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    let pulse = Math.sin(clamped * Math.PI);
    if (Math.abs(pulse) < 1e-9) {
      pulse = 0;
    }
    const x = (vector.x || 0) * pulse * 0.32;
    const y = (vector.y || 0) * pulse * 0.32;
    return {
      x: Math.abs(x) < 1e-9 ? 0 : x,
      y: Math.abs(y) < 1e-9 ? 0 : y,
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

  function bannerSweep(elapsed, duration) {
    const span = Math.max(0.0001, duration || 1);
    const t = Math.max(0, Math.min(1, elapsed / span));
    return {
      x: -1 + t * 2,
      alpha: Math.sin(t * Math.PI),
      glow: 0.35 + Math.sin(t * Math.PI) * 0.65,
    };
  }

  function manaShimmer(elapsed, phase) {
    const t = elapsed + (phase || 0);
    return {
      glow: 0.5 + Math.sin(t * Math.PI * 2) * 0.5,
      spark: 0.5 + Math.cos(t * Math.PI * 3) * 0.5,
    };
  }

  function wrap(value, max) {
    if (max <= 0) {
      return 0;
    }
    while (value < 0) {
      value += max;
    }
    while (value > max) {
      value -= max;
    }
    return value;
  }

  function stepParticles(particles, dt, width, height) {
    return particles.map(function (particle) {
      return {
        x: wrap(particle.x + particle.vx * dt, width),
        y: wrap(particle.y + particle.vy * dt, height),
        vx: particle.vx,
        vy: particle.vy,
        size: particle.size,
        alpha: particle.alpha,
        phase: particle.phase,
      };
    });
  }

  return {
    fanCardTransform: fanCardTransform,
    attackLungeOffset: attackLungeOffset,
    damageNumberState: damageNumberState,
    bannerSweep: bannerSweep,
    manaShimmer: manaShimmer,
    stepParticles: stepParticles,
  };
});
