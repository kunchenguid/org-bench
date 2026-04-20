(function (globalScope) {
  'use strict';

  function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    var n = 1 - clamp01(t);
    return 1 - (n * n * n);
  }

  function easeInOutSine(t) {
    var n = clamp01(t);
    return -(Math.cos(Math.PI * n) - 1) / 2;
  }

  function idleBreath(timeMs, options) {
    var settings = options || {};
    var amplitudeY = settings.amplitudeY == null ? 4 : settings.amplitudeY;
    var amplitudeScale = settings.amplitudeScale == null ? 0.018 : settings.amplitudeScale;
    var periodMs = settings.periodMs == null ? 1600 : settings.periodMs;
    var phase = ((timeMs % periodMs) / periodMs) * Math.PI * 2;

    return {
      y: Math.sin(phase) * amplitudeY,
      scale: 1 + ((Math.sin(phase - Math.PI / 2) + 1) / 2) * amplitudeScale,
    };
  }

  function cardFanTransform(index, total, width, height) {
    var safeTotal = Math.max(total, 1);
    var center = (safeTotal - 1) / 2;
    var offset = index - center;
    var spread = Math.min(width * 0.08, 96);
    var normalized = center === 0 ? 0 : offset / center;

    return {
      x: width * 0.5 + offset * spread,
      y: height - 110 + (1 - Math.abs(normalized)) * 28,
      rotation: normalized * 0.22,
      lift: Math.abs(normalized) * 6,
      tilt: normalized * 0.08,
    };
  }

  function sampleAttack(config, timeMs) {
    var duration = 480;
    var t = clamp01(timeMs / duration);
    var from = config.from;
    var to = config.to;

    if (t < 0.45) {
      var windupT = easeOutCubic(t / 0.45);
      return {
        progress: t,
        position: {
          x: lerp(from.x, to.x, windupT * 0.88),
          y: lerp(from.y, to.y, windupT * 0.88),
        },
        impactFlash: 0,
        shake: 0,
      };
    }

    if (t < 0.62) {
      var impactT = (t - 0.45) / 0.17;
      return {
        progress: t,
        position: {
          x: lerp(to.x - 10, to.x + 14, impactT),
          y: lerp(to.y + 4, to.y - 8, impactT),
        },
        impactFlash: 1 - impactT * 0.15,
        shake: lerp(7, 5, impactT),
      };
    }

    var settleT = easeInOutSine((t - 0.62) / 0.38);
    return {
      progress: t,
      position: {
        x: lerp(to.x + 14, from.x, settleT),
        y: lerp(to.y - 8, from.y, settleT),
      },
      impactFlash: lerp(0.55, 0, settleT),
      shake: lerp(4, 0, settleT),
    };
  }

  function sampleDamageNumber(config, timeMs) {
    var duration = 720;
    var t = clamp01(timeMs / duration);
    var drift = easeOutCubic(t);

    return {
      progress: t,
      label: '-' + String(config.amount),
      position: {
        x: config.origin.x,
        y: config.origin.y - drift * 72,
      },
      scale: lerp(1.3, 0.96, t),
      opacity: t >= 0.95 ? 0 : 1 - (t / 0.95),
    };
  }

  function sampleTurnBanner(config, timeMs) {
    var duration = 1280;
    var t = clamp01(timeMs / duration);
    var width = config.width;
    var centerX = width * 0.5;
    var entryX = -width * 0.28;
    var exitX = width * 1.28;
    var x;

    if (t < 0.4) {
      x = lerp(entryX, centerX, easeOutCubic(t / 0.4));
    } else {
      x = lerp(centerX, exitX, easeInOutSine((t - 0.4) / 0.6));
    }

    return {
      progress: t,
      text: config.text,
      position: {
        x: x,
        y: config.height * 0.22,
      },
      opacity: t >= 0.96 ? 0 : (t < 0.75 ? 1 : 1 - ((t - 0.75) / 0.21)),
      glow: t < 0.5 ? 1 : lerp(1, 0.35, (t - 0.5) / 0.5),
    };
  }

  function sampleDraw(config, timeMs) {
    var duration = 560;
    var t = clamp01(timeMs / duration);

    return {
      progress: t,
      position: {
        x: lerp(config.from.x, config.to.x, easeOutCubic(t)),
        y: lerp(config.from.y, config.to.y, easeInOutSine(t)),
      },
      rotation: lerp(config.from.rotation || -0.35, config.to.rotation || 0, easeInOutSine(t)),
      scale: lerp(0.76, 1, easeOutCubic(t)),
      shadow: lerp(0.2, 0.45, 1 - t),
    };
  }

  function samplePlay(config, timeMs) {
    var duration = 680;
    var t = clamp01(timeMs / duration);

    return {
      progress: t,
      position: {
        x: lerp(config.from.x, config.to.x, easeInOutSine(t)),
        y: lerp(config.from.y, config.to.y, easeOutCubic(t)),
      },
      rotation: lerp(config.from.rotation || 0.16, config.to.rotation || 0, easeOutCubic(t)),
      scale: t < 0.45 ? lerp(1, 1.12, t / 0.45) : lerp(1.12, 1, (t - 0.45) / 0.55),
      glow: 1 - t * 0.7,
    };
  }

  function sampleDeath(config, timeMs) {
    var duration = 620;
    var t = clamp01(timeMs / duration);

    return {
      progress: t,
      position: {
        x: config.origin.x,
        y: config.origin.y + lerp(0, 16, t),
      },
      opacity: 1 - t,
      crumble: easeOutCubic(t),
      scale: lerp(1, 0.82, t),
    };
  }

  function createEffectTimeline(type, config) {
    var samplers = {
      attack: { duration: 480, sample: sampleAttack },
      'damage-number': { duration: 720, sample: sampleDamageNumber },
      'turn-banner': { duration: 1280, sample: sampleTurnBanner },
      draw: { duration: 560, sample: sampleDraw },
      play: { duration: 680, sample: samplePlay },
      death: { duration: 620, sample: sampleDeath },
    };
    var entry = samplers[type];

    if (!entry) {
      throw new Error('Unknown effect timeline: ' + type);
    }

    return {
      type: type,
      duration: entry.duration,
      sample: function (timeMs) {
        return entry.sample(config || {}, timeMs);
      },
    };
  }

  var api = {
    clamp01: clamp01,
    easeOutCubic: easeOutCubic,
    idleBreath: idleBreath,
    cardFanTransform: cardFanTransform,
    createEffectTimeline: createEffectTimeline,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.AnimationSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
