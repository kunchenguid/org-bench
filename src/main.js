(function () {
  'use strict';

  var runtimeApi = window.GlassReefRenderRuntime;
  var canvas = document.getElementById('game');
  var particles = [];
  var bounds = [];
  var hovered = null;
  var backgroundPromise;
  var backgroundAsset;

  for (var index = 0; index < 36; index += 1) {
    particles.push({
      x: Math.random() * 1600,
      y: Math.random() * 900,
      radius: 1 + Math.random() * 3,
      speed: 14 + Math.random() * 20,
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
      drawFrame(frame.scene, frame.elapsed, frame.pointer);
    },
  });

  runtime.start();

  function updateParticles(deltaTime) {
    particles.forEach(function (particle) {
      particle.y -= particle.speed * deltaTime;
      particle.x += Math.sin(particle.phase + particle.y * 0.01) * 4 * deltaTime;
      if (particle.y < -20) {
        particle.y = 940;
        particle.x = Math.random() * 1600;
      }
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
      ctx.fillStyle = 'rgba(122, 240, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    drawPanel(ctx, 64, 56, 324, 128, '#6eeaff', 'Render Runtime', 'WebGL backbuffer + pointer tracking + file-safe assets');
    drawPanel(ctx, 1212, 56, 324, 128, '#ffd38a', 'HUD lane', 'HUD, buttons, and battle feed can sit above board layers');
    drawLane(ctx, 208, 224, 1184, 174, elapsed, '#72ebff', 'Enemy board');
    drawLane(ctx, 208, 502, 1184, 174, elapsed, '#ffc27a', 'Player board');
    drawCards(ctx, elapsed);
    drawHud(ctx, pointer);
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
    ctx.fillStyle = 'rgba(7, 18, 30, 0.52)';
    roundRect(ctx, x, y, width, height, 28);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, width, height, 28);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.font = '700 24px Georgia';
    ctx.fillText(label, x + 26, y + 38);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 20, y + height - 26, width - 40, 8 + Math.sin(elapsed * 1.4) * 2);
  }

  function drawCards(ctx, elapsed) {
    var cardRows = [
      { y: 254, accent: '#74eaff', label: 'Enemy cards' },
      { y: 532, accent: '#ffc27a', label: 'Player cards' },
    ];

    cardRows.forEach(function (row, rowIndex) {
      for (var index = 0; index < 5; index += 1) {
        var x = 276 + index * 206;
        var y = row.y + Math.sin(elapsed * 1.4 + index + rowIndex) * 5;
        var isHovered = hovered === row.label + index;
        ctx.save();
        ctx.translate(x + 82, y + 108);
        ctx.rotate((index - 2) * 0.015);
        ctx.scale(isHovered ? 1.03 : 1, isHovered ? 1.03 : 1);
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
        ctx.fillText('Card ' + (index + 1), x + 20, y + 130);
        ctx.font = '15px Georgia';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText('Scene graph node', x + 20, y + 160);
        ctx.fillText('Texture-backed art', x + 20, y + 182);
        ctx.restore();
        bounds.push({ id: row.label + index, x: x, y: y, width: 164, height: 216 });
      }
    });
  }

  function drawHud(ctx, pointer) {
    drawChip(ctx, 242, 748, 118, 42, '#ffd38a', '60 fps');
    drawChip(ctx, 374, 748, 146, 42, '#73e7ff', 'Pointer input');
    drawChip(ctx, 534, 748, 164, 42, '#c9f0a3', 'Texture loading');

    ctx.fillStyle = 'rgba(6, 16, 26, 0.84)';
    roundRect(ctx, 1040, 742, 352, 110, 22);
    ctx.fill();
    ctx.fillStyle = '#f5fbff';
    ctx.font = '700 22px Georgia';
    ctx.fillText('Runtime status', 1064, 774);
    ctx.font = '17px Georgia';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText('Pointer: ' + Math.round(pointer.x) + ', ' + Math.round(pointer.y), 1064, 804);
    ctx.fillText('Hover target: ' + (hovered || 'none'), 1064, 832);
  }

  function drawChip(ctx, x, y, width, height, color, label) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, width, height, 18);
    ctx.fill();
    ctx.fillStyle = '#08111b';
    ctx.font = '700 18px Georgia';
    ctx.fillText(label, x + 20, y + 27);
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
