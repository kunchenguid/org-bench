(function () {
  'use strict';

  var runtimeApi = window.GlassReefRenderRuntime;
  var motionApi = window.AppleDuelMotion;
  var gameCoreApi = window.AppleDuelGameCore;
  var canvas = document.getElementById('game');
  var particles = [];
  var bounds = [];
  var hovered = null;
  var previousHovered = null;
  var backgroundPromise;
  var backgroundAsset;
  var banner = null;
  var lunges = [];
  var demoState = gameCoreApi ? gameCoreApi.createInitialState({ rng: function () { return 0.25; } }) : null;

  for (var index = 0; index < 36; index += 1) {
    particles.push({
      x: Math.random() * 1600,
      y: Math.random() * 900,
      vx: (Math.random() - 0.5) * 8,
      vy: -16 - Math.random() * 20,
      size: 1 + Math.random() * 3,
      alpha: 0.1 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
    });
  }

  var runtime = runtimeApi.createRenderRuntime({
    canvas: canvas,
    sceneSize: { width: 1600, height: 900 },
    beforeRender: function (frame) {
      if (!backgroundPromise) {
        backgroundPromise = frame.loader.load('assets/board/glass-reef-runtime.svg').then(function (asset) {
          backgroundAsset = asset;
        });
      }
      updateParticles(frame.deltaTime);
      hovered = locateBounds(frame.pointer);
      if (hovered && hovered !== previousHovered) {
        banner = { text: hovered, ttl: 1.1, duration: 1.1 };
      }
      if (frame.pointer.justPressed && hovered) {
        spawnPulse(hovered);
      }
      previousHovered = hovered;
      drawFrame(frame.scene, frame.elapsed, frame.pointer);
    },
  });

  runtime.start();

  function updateParticles(deltaTime) {
    particles = motionApi.stepParticles(particles, deltaTime, 1600, 940).map(function (particle) {
      particle.x += Math.sin(particle.phase + particle.y * 0.01) * 4 * deltaTime;
      particle.phase += deltaTime * 0.8;
      if (particle.y > 900) {
        particle.y = 940;
      }
      return particle;
    });
    if (banner) {
      banner.ttl = Math.max(0, banner.ttl - deltaTime);
      if (!banner.ttl) {
        banner = null;
      }
    }
    lunges = lunges.filter(function (lunge) {
      lunge.elapsed += deltaTime;
      return lunge.elapsed < lunge.duration;
    });
  }

  function locateBounds(pointer) {
    if (!pointer.inside) {
      return null;
    }
    for (var index = bounds.length - 1; index >= 0; index -= 1) {
      var bound = bounds[index];
      if (pointer.x >= bound.x && pointer.x <= bound.x + bound.width && pointer.y >= bound.y && pointer.y <= bound.y + bound.height) {
        return bound.id;
      }
    }
    return null;
  }

  function drawFrame(ctx, elapsed, pointer) {
    bounds = [];
    ctx.clearRect(0, 0, 1600, 900);
    if (backgroundAsset) {
      ctx.drawImage(backgroundAsset.image, 0, 0, 1600, 900);
    }

    particles.forEach(function (particle) {
      ctx.fillStyle = 'rgba(122, 240, 255,' + particle.alpha + ')';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });

    drawLane(ctx, 208, 224, 1184, 174, elapsed, '#72ebff', demoState ? 'Enemy opening hand' : 'Enemy board');
    drawLane(ctx, 208, 502, 1184, 174, elapsed, '#ffc27a', demoState ? 'Player opening hand' : 'Player board');
    drawCards(ctx, elapsed);
    drawBoardStatus(ctx, pointer, elapsed);
    drawBanner(ctx);
  }

  function drawPanel(ctx, x, y, width, height, accent, title, subtitle) {
    ctx.fillStyle = 'rgba(6, 15, 26, 0.88)';
    roundRect(ctx, x, y, width, height, 24);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    roundRect(ctx, x + 2, y + 2, width - 4, height - 4, 22);
    ctx.stroke();
    ctx.fillStyle = '#f5fbff';
    ctx.font = '700 28px Georgia';
    ctx.fillText(title, x + 22, y + 42);
    ctx.font = '17px Georgia';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(subtitle, x + 22, y + 76, width - 40);
  }

  function drawLane(ctx, x, y, width, height, elapsed, accent, label) {
    var groove = ctx.createLinearGradient(x, y, x + width, y + height);
    groove.addColorStop(0, 'rgba(7, 18, 30, 0.58)');
    groove.addColorStop(1, 'rgba(11, 26, 42, 0.38)');
    ctx.fillStyle = groove;
    roundRect(ctx, x, y, width, height, 28);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, width, height, 28);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '700 22px Georgia';
    ctx.fillText(label, x + 28, y + 38);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 20, y + height - 28, width - 40, 6 + Math.sin(elapsed * 1.4) * 2);
    for (var index = 0; index < 6; index += 1) {
      var shimmer = motionApi.manaShimmer(elapsed * 0.35, index * 0.19 + (y > 400 ? 0.4 : 0));
      var crystalX = x + width - 220 + index * 28;
      var crystalY = y + height - 44;
      ctx.save();
      ctx.globalAlpha = 0.18 + shimmer.glow * 0.26;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(crystalX + 10, crystalY);
      ctx.lineTo(crystalX + 20, crystalY + 14);
      ctx.lineTo(crystalX + 10, crystalY + 28);
      ctx.lineTo(crystalX, crystalY + 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCards(ctx, elapsed) {
    var enemyCards = demoState ? demoState.enemy.hand.slice(0, 5) : [];
    var playerCards = demoState ? demoState.player.hand.slice(0, 5) : [];
    var cardRows = [
      { y: 254, accent: '#74eaff', label: 'Enemy cards', cards: enemyCards },
      { y: 532, accent: '#ffc27a', label: 'Player cards', cards: playerCards },
    ];

    cardRows.forEach(function (row, rowIndex) {
      for (var index = 0; index < 5; index += 1) {
        var card = row.cards[index] || null;
        var fan = motionApi.fanCardTransform(index, 5, hovered === row.label + index, rowIndex === 1 ? 0.18 : -0.12);
        var x = 276 + index * 206 + fan.offsetX;
        var y = row.y + Math.sin(elapsed * 1.4 + index + rowIndex) * 5 + fan.offsetY;
        var isHovered = hovered === row.label + index;
        var lunge = getLunge(row.label + index);
        ctx.save();
        ctx.translate(x + 82 + lunge.x, y + 108 + lunge.y);
        ctx.rotate((index - 2) * 0.015 + fan.angle);
        ctx.scale((isHovered ? 1.03 : 1) * fan.scale, (isHovered ? 1.03 : 1) * fan.scale);
        ctx.translate(-(x + 82), -(y + 108));
        ctx.fillStyle = 'rgba(18, 22, 36, 0.96)';
        roundRect(ctx, x, y, 164, 216, 22);
        ctx.fill();
        ctx.strokeStyle = row.accent;
        ctx.lineWidth = isHovered ? 5 : 3;
        roundRect(ctx, x + 2, y + 2, 160, 212, 20);
        ctx.stroke();
        ctx.fillStyle = row.accent;
        ctx.fillRect(x + 16, y + 18, 132, 82);
        ctx.fillStyle = '#09121d';
        ctx.fillRect(x + 24, y + 26, 116, 66);
        ctx.fillStyle = '#f6fbff';
        ctx.font = '700 20px Georgia';
        ctx.fillText(card ? card.name : 'Empty slot', x + 20, y + 130);
        ctx.font = '15px Georgia';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(card ? ('Cost ' + card.cost + '  ATK ' + card.attack) : 'Scene graph node', x + 20, y + 160);
        ctx.fillText(card ? card.text.slice(0, 18) : 'Texture-backed art', x + 20, y + 182);
        ctx.restore();
        drawDamageText(ctx, row.label + index, x + 82, y + 38);
        bounds.push({ id: row.label + index, x: x, y: y, width: 164, height: 216 });
      }
    });
  }

  function drawBoardStatus(ctx, pointer, elapsed) {
    ctx.fillStyle = 'rgba(6, 16, 26, 0.52)';
    roundRect(ctx, 238, 732, 1124, 74, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    roundRect(ctx, 238, 732, 1124, 74, 28);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,251,255,0.84)';
    ctx.font = '700 18px Georgia';
    ctx.fillText(demoState ? 'Rules core preview surface' : 'Glass Reef runtime surface', 270, 762);
    ctx.font = '16px Georgia';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(demoState ? demoState.tutorial.message : 'Hover a card to lift it. Press to lunge and float damage text through the board lanes.', 270, 790);
    ctx.textAlign = 'right';
    ctx.fillText(demoState ? ('Turn ' + demoState.turn + ' • ' + demoState.activeSide + ' • ' + demoState.player.hand.length + ' playable cards in view') : ('Pointer ' + Math.round(pointer.x) + ', ' + Math.round(pointer.y) + '  •  ' + (hovered || 'no target')), 1330, 790);
    ctx.textAlign = 'left';
  }

  function drawBanner(ctx) {
    if (!banner) {
      return;
    }
    var sweep = motionApi.bannerSweep(banner.duration - banner.ttl, banner.duration);
    ctx.save();
    ctx.globalAlpha = sweep.alpha;
    roundRect(ctx, 610, 146, 380, 64, 24);
    ctx.fillStyle = 'rgba(10, 24, 40, 0.88)';
    ctx.fill();
    ctx.strokeStyle = '#ffd38a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.92, sweep.glow) + ')';
    ctx.fillRect(620 + sweep.x * 120, 154, 76, 48);
    ctx.fillStyle = '#08111b';
    ctx.font = '700 22px Georgia';
    ctx.fillText(banner.text, 710, 186);
    ctx.restore();
  }

  function spawnPulse(id) {
    lunges.push({ id: id, elapsed: 0, duration: 0.32, text: '-2' });
  }

  function getLunge(id) {
    var lunge = lunges.find(function (entry) { return entry.id === id; });
    if (!lunge) {
      return { x: 0, y: 0 };
    }
    return motionApi.attackLungeOffset({ x: 0, y: -48 }, lunge.elapsed / lunge.duration);
  }

  function drawDamageText(ctx, id, x, y) {
    var lunge = lunges.find(function (entry) { return entry.id === id; });
    if (!lunge) {
      return;
    }
    var state = motionApi.damageNumberState({ x: x, y: y, driftX: 10 }, lunge.elapsed, lunge.duration);
    ctx.save();
    ctx.globalAlpha = state.alpha;
    ctx.fillStyle = '#ffd0c4';
    ctx.font = '700 ' + Math.round(24 * state.scale) + 'px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(lunge.text, state.x, state.y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
})();
