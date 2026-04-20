(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.DuelMotion = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function clamp01(value) {
    if (value <= 0) {
      return 0;
    }
    if (value >= 1) {
      return 1;
    }
    return value;
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function endpointValue(progress, start, end, value) {
    if (progress <= 0) {
      return start;
    }
    if (progress >= 1) {
      return end;
    }
    return value;
  }

  function outCubic(t) {
    var p = 1 - clamp01(t);
    return 1 - p * p * p;
  }

  function inCubic(t) {
    var p = clamp01(t);
    return p * p * p;
  }

  function inOutCubic(t) {
    var p = clamp01(t);
    if (p < 0.5) {
      return 4 * p * p * p;
    }
    return 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function outBack(t) {
    var p = clamp01(t);
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  function normalize(time, delay, duration) {
    return clamp01((time - delay) / duration);
  }

  function makeClip(duration, delay, sampler) {
    return {
      delay: delay,
      duration: duration,
      endTime: delay + duration,
      sample: function (time) {
        return sampler(time, normalize(time, delay, duration));
      },
    };
  }

  function MotionTimeline() {
    this.entries = [];
    this.duration = 0;
  }

  MotionTimeline.prototype.add = function (clip, offset) {
    var start = offset || 0;
    this.entries.push({ clip: clip, offset: start });
    this.duration = Math.max(this.duration, start + clip.endTime);
    return this;
  };

  MotionTimeline.prototype.sample = function (time) {
    var active = [];

    for (var index = 0; index < this.entries.length; index += 1) {
      var entry = this.entries[index];
      var localTime = time - entry.offset;

      if (localTime < entry.clip.delay || localTime > entry.clip.endTime) {
        continue;
      }

      active.push(entry.clip.sample(localTime));
    }

    return active;
  };

  function createCardFlyIn(options) {
    var settings = options || {};
    var delay = settings.delay || 0;
    var duration = settings.duration || 600;
    var lift = settings.lift || 0;

    return makeClip(duration, delay, function (_, progress) {
      var move = outCubic(progress);
      return {
        kind: 'cardFlyIn',
        progress: progress,
        x: endpointValue(progress, settings.fromX || 0, settings.toX || 0, lerp(settings.fromX || 0, settings.toX || 0, move)),
        y: endpointValue(progress, settings.fromY || 0, settings.toY || 0, lerp(settings.fromY || 0, settings.toY || 0, move) - Math.sin(progress * Math.PI) * lift),
        rotation: endpointValue(progress, settings.fromRotation || 0, settings.toRotation || 0, lerp(settings.fromRotation || 0, settings.toRotation || 0, inOutCubic(progress))),
        scale: endpointValue(progress, settings.fromScale == null ? 1 : settings.fromScale, settings.toScale == null ? 1 : settings.toScale, lerp(settings.fromScale == null ? 1 : settings.fromScale, settings.toScale == null ? 1 : settings.toScale, outBack(progress))),
      };
    });
  }

  function createPlayToBoard(options) {
    var settings = options || {};
    var duration = settings.duration || 700;
    var delay = settings.delay || 0;
    var arcHeight = settings.arcHeight || 100;

    return makeClip(duration, delay, function (_, progress) {
      var move = outCubic(progress);
      return {
        kind: 'playToBoard',
        progress: progress,
        x: endpointValue(progress, settings.fromX || 0, settings.toX || 0, lerp(settings.fromX || 0, settings.toX || 0, move)),
        y: endpointValue(progress, settings.fromY || 0, settings.toY || 0, lerp(settings.fromY || 0, settings.toY || 0, move) - Math.sin(progress * Math.PI) * arcHeight),
        rotation: endpointValue(progress, settings.fromRotation || 0, settings.toRotation || 0, lerp(settings.fromRotation || 0, settings.toRotation || 0, inOutCubic(progress))),
        scale: endpointValue(progress, settings.fromScale == null ? 1 : settings.fromScale, settings.toScale == null ? 1 : settings.toScale, lerp(settings.fromScale == null ? 1 : settings.fromScale, settings.toScale == null ? 1 : settings.toScale, outBack(progress))),
      };
    });
  }

  function createAttackLunge(options) {
    var settings = options || {};
    var duration = settings.duration || 420;
    var delay = settings.delay || 0;
    var impactDistance = settings.impactDistance == null ? 0.28 : settings.impactDistance;

    return makeClip(duration, delay, function (_, progress) {
      var x;
      var y;

      if (progress < 0.6) {
        var forward = outCubic(progress / 0.6) * impactDistance;
        x = lerp(settings.fromX || 0, settings.targetX || 0, forward);
        y = lerp(settings.fromY || 0, settings.targetY || 0, forward);
      } else {
        var retreat = inOutCubic((progress - 0.6) / 0.4);
        x = lerp(lerp(settings.fromX || 0, settings.targetX || 0, impactDistance), settings.fromX || 0, retreat);
        y = lerp(lerp(settings.fromY || 0, settings.targetY || 0, impactDistance), settings.fromY || 0, retreat);
      }

      return {
        kind: 'attackLunge',
        progress: progress,
        x: x,
        y: y,
      };
    });
  }

  function createHitFlash(options) {
    var settings = options || {};
    var duration = settings.duration || 220;
    var delay = settings.delay || 0;
    var amplitude = settings.amplitude || 14;
    var flashes = settings.flashes || 2;

    return makeClip(duration, delay, function (_, progress) {
      var fade = 1 - outCubic(progress);
      var shake = Math.sin(progress * Math.PI * flashes * 2) * amplitude * fade;

      return {
        kind: 'hitFlash',
        progress: progress,
        alpha: fade,
        flash: 0.5 + 0.5 * Math.cos(progress * Math.PI * flashes),
        shakeX: progress === 0 || progress === 1 ? 0 : shake,
        shakeY: progress === 0 || progress === 1 ? 0 : shake * 0.35,
      };
    });
  }

  function createFloatingDamage(options) {
    var settings = options || {};
    var duration = settings.duration || 900;
    var delay = settings.delay || 0;
    var rise = settings.rise || 64;

    return makeClip(duration, delay, function (_, progress) {
      return {
        kind: 'floatingDamage',
        progress: progress,
        text: (settings.amount || 0) > 0 ? '-' + settings.amount : String(settings.amount || 0),
        x: settings.x || 0,
        y: lerp(settings.y || 0, (settings.y || 0) - rise, outCubic(progress)),
        scale: lerp(0.8, 1.15, Math.sin(progress * Math.PI)),
        alpha: 1 - inCubic(progress),
      };
    });
  }

  function createDissolveDeath(options) {
    var settings = options || {};
    var duration = settings.duration || 500;
    var delay = settings.delay || 0;

    return makeClip(duration, delay, function (_, progress) {
      return {
        kind: 'dissolveDeath',
        progress: progress,
        alpha: endpointValue(progress, 1, 0, 1 - progress),
        dissolve: endpointValue(progress, 0, 1, progress),
        scale: endpointValue(progress, 1, settings.shrink == null ? 0.15 : settings.shrink, lerp(1, settings.shrink == null ? 0.15 : settings.shrink, outCubic(progress))),
        rotation: endpointValue(progress, 0, settings.spin || 0, lerp(0, settings.spin || 0, outCubic(progress))),
      };
    });
  }

  function createTurnBannerSweep(options) {
    var settings = options || {};
    var duration = settings.duration || 1100;
    var delay = settings.delay || 0;
    var width = settings.width || 1280;
    var height = settings.height || 720;
    var bannerWidth = settings.bannerWidth || width * 0.4;

    return makeClip(duration, delay, function (_, progress) {
      var alpha = endpointValue(progress, 0, 0, Math.sin(progress * Math.PI));
      return {
        kind: 'turnBannerSweep',
        progress: progress,
        label: settings.label || '',
        centerX: endpointValue(progress, -bannerWidth / 2, width + bannerWidth / 2, lerp(-bannerWidth / 2, width + bannerWidth / 2, inOutCubic(progress))),
        centerY: settings.centerY == null ? height * 0.18 : settings.centerY,
        alpha: alpha,
      };
    });
  }

  return {
    MotionTimeline: MotionTimeline,
    createCardFlyIn: createCardFlyIn,
    createPlayToBoard: createPlayToBoard,
    createAttackLunge: createAttackLunge,
    createHitFlash: createHitFlash,
    createFloatingDamage: createFloatingDamage,
    createDissolveDeath: createDissolveDeath,
    createTurnBannerSweep: createTurnBannerSweep,
    eases: {
      clamp01: clamp01,
      inCubic: inCubic,
      outCubic: outCubic,
      inOutCubic: inOutCubic,
      outBack: outBack,
    },
  };
});
