(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.DuelAnimation = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createAnimationState() {
    return {
      motions: [],
      damageNumbers: [],
      flashes: [],
      sweeps: [],
      ghosts: [],
    };
  }

  function cloneRect(rect) {
    return {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
    };
  }

  function queueCardMotion(state, options) {
    state.motions.push({
      card: options.card,
      from: cloneRect(options.from),
      to: cloneRect(options.to),
      rect: cloneRect(options.from),
      duration: options.duration || 0.45,
      elapsed: 0,
      lift: options.lift || 0,
      yoyo: Boolean(options.yoyo),
      alpha: 1,
      rotation: options.rotation || 0,
    });
  }

  function queueDamageNumber(state, options) {
    state.damageNumbers.push({
      x: options.x,
      y: options.y,
      startY: options.y,
      text: options.text,
      life: options.life || 1,
      elapsed: 0,
      color: options.color || '#ff8f7a',
      alpha: 1,
    });
  }

  function queueFlash(state, options) {
    state.flashes.push({
      x: options.x,
      y: options.y,
      w: options.w,
      h: options.h,
      life: options.life || 0.32,
      elapsed: 0,
      color: options.color || '255,240,180',
      alpha: 1,
    });
  }

  function queueSweep(state, options) {
    state.sweeps.push({
      text: options.text,
      life: options.life || 1,
      elapsed: 0,
      color: options.color || '#fff0b3',
      alpha: 1,
      progress: 0,
    });
  }

  function queueGhost(state, options) {
    state.ghosts.push({
      card: options.card,
      rect: cloneRect(options.rect),
      life: options.life || 0.45,
      elapsed: 0,
      alpha: 1,
      drift: options.drift || 18,
    });
  }

  function lerp(from, to, t) {
    return from + (to - from) * t;
  }

  function stepAnimationState(state, delta) {
    state.motions = state.motions.filter(function (motion) {
      motion.elapsed += delta;
      if (motion.elapsed >= motion.duration) {
        return false;
      }
      var raw = motion.elapsed / motion.duration;
      var progress = motion.yoyo ? (raw < 0.5 ? raw * 2 : (1 - raw) * 2) : raw;
      motion.rect.x = lerp(motion.from.x, motion.to.x, progress);
      motion.rect.y = lerp(motion.from.y, motion.to.y, progress) - Math.sin(progress * Math.PI) * motion.lift;
      motion.rect.w = lerp(motion.from.w, motion.to.w, progress);
      motion.rect.h = lerp(motion.from.h, motion.to.h, progress);
      motion.alpha = motion.yoyo ? 1 : 1 - raw * 0.1;
      return true;
    });

    state.damageNumbers = state.damageNumbers.filter(function (pop) {
      pop.elapsed += delta;
      if (pop.elapsed >= pop.life) {
        return false;
      }
      var progress = pop.elapsed / pop.life;
      pop.y = pop.startY - progress * 42;
      pop.alpha = 1 - progress;
      return true;
    });

    state.flashes = state.flashes.filter(function (flash) {
      flash.elapsed += delta;
      if (flash.elapsed >= flash.life) {
        return false;
      }
      flash.alpha = 1 - flash.elapsed / flash.life;
      return true;
    });

    state.sweeps = state.sweeps.filter(function (sweep) {
      sweep.elapsed += delta;
      if (sweep.elapsed >= sweep.life) {
        return false;
      }
      sweep.progress = sweep.elapsed / sweep.life;
      sweep.alpha = Math.sin(sweep.progress * Math.PI);
      return true;
    });

    state.ghosts = state.ghosts.filter(function (ghost) {
      ghost.elapsed += delta;
      if (ghost.elapsed >= ghost.life) {
        return false;
      }
      var progress = ghost.elapsed / ghost.life;
      ghost.rect.y -= ghost.drift * delta;
      ghost.alpha = 1 - progress;
      return true;
    });

    return state;
  }

  return {
    createAnimationState: createAnimationState,
    queueCardMotion: queueCardMotion,
    queueDamageNumber: queueDamageNumber,
    queueFlash: queueFlash,
    queueSweep: queueSweep,
    queueGhost: queueGhost,
    stepAnimationState: stepAnimationState,
  };
});
