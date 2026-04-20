(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.FBDuelRendererCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function computeCanvasSize(cssWidth, cssHeight, devicePixelRatio) {
    var ratio = Math.max(1, devicePixelRatio || 1);
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

  function computeBoardLayout(width, height) {
    var safeWidth = Math.max(960, width || 0);
    var safeHeight = Math.max(540, height || 0);
    var edge = Math.round(safeWidth * 0.06);
    var board = {
      x: edge,
      y: Math.round(safeHeight * 0.1),
      width: safeWidth - edge * 2,
      height: Math.round(safeHeight * 0.72),
    };
    var laneGap = Math.round(board.width * 0.022);
    var laneWidth = Math.round((board.width - laneGap * 4) / 3);
    var laneHeight = Math.round(board.height * 0.16);
    var topLaneY = board.y + Math.round(board.height * 0.26);
    var bottomLaneY = board.y + Math.round(board.height * 0.58);
    var heroWidth = Math.round(board.width * 0.22);
    var heroHeight = Math.round(board.height * 0.18);
    var heroX = board.x + Math.round(board.width * 0.5 - heroWidth * 0.5);
    var handSlotWidth = Math.round(board.width * 0.16);
    var handSlotHeight = Math.round(board.height * 0.24);
    var handGap = Math.round(board.width * 0.016);
    var handStartX = board.x + Math.round(board.width * 0.5 - ((handSlotWidth * 4 + handGap * 3) * 0.5));
    var handY = safeHeight - handSlotHeight - Math.round(safeHeight * 0.045);
    var deckInset = Math.round(board.width * 0.03);

    return {
      board: board,
      enemyHero: {
        x: heroX,
        y: board.y + Math.round(board.height * 0.04),
        width: heroWidth,
        height: heroHeight,
      },
      playerHero: {
        x: heroX,
        y: board.y + board.height - heroHeight - Math.round(board.height * 0.04),
        width: heroWidth,
        height: heroHeight,
      },
      enemyLanes: buildLaneRects(board.x, laneGap, laneWidth, laneHeight, topLaneY),
      playerLanes: buildLaneRects(board.x, laneGap, laneWidth, laneHeight, bottomLaneY),
      playerHand: buildHandSlots(handStartX, handY, handSlotWidth, handSlotHeight, handGap),
      enemyDeck: {
        x: board.x + board.width - handSlotWidth - deckInset,
        y: board.y + Math.round(board.height * 0.04),
        width: handSlotWidth,
        height: handSlotHeight,
      },
      playerDeck: {
        x: board.x + deckInset,
        y: handY,
        width: handSlotWidth,
        height: handSlotHeight,
      },
      turnBadge: {
        x: safeWidth - edge - 220,
        y: Math.round(safeHeight * 0.03),
        width: 220,
        height: 56,
      },
      tutorialPanel: {
        x: edge,
        y: safeHeight - Math.round(safeHeight * 0.16),
        width: Math.round(safeWidth * 0.34),
        height: Math.round(safeHeight * 0.11),
      },
    };
  }

  function layoutHandCards(cards, width, height, time, side) {
    var layout = computeBoardLayout(width, height);
    var slots = side === 'enemy' ? layout.enemyLanes : layout.playerHand;
    var centerIndex = (cards.length - 1) * 0.5;
    var items = [];

    for (var index = 0; index < cards.length; index += 1) {
      var slot = slots[Math.min(index, slots.length - 1)] || layout.playerHand[0];
      var offset = index - centerIndex;
      var lift = Math.abs(offset) * 14;
      items.push({
        id: cards[index].id,
        x: slot.x + offset * 18,
        y: slot.y + lift + Math.sin(time * 0.0015 + index) * 3,
        rotation: offset * 0.08,
        width: slot.width - 16,
        height: slot.height - 16,
      });
    }

    return items;
  }

  function layoutBoardCards(cards, width, height, time, side) {
    var layout = computeBoardLayout(width, height);
    var lanes = side === 'enemy' ? layout.enemyLanes : layout.playerLanes;
    var cardsInLane = [];

    for (var index = 0; index < cards.length; index += 1) {
      var lane = lanes[index] || lanes[lanes.length - 1];
      cardsInLane.push({
        id: cards[index].id,
        x: lane.x + lane.width * 0.5 - lane.width * 0.28,
        y: lane.y + 26 + Math.sin(time * 0.003 + index) * 6,
        width: lane.width * 0.56,
        height: lane.height - 38,
      });
    }

    return cardsInLane;
  }

  function sampleTurnBanner(time, width, height, actor) {
    var layout = computeBoardLayout(width, height);
    var progress = Math.max(0, Math.min(1, time / 1000));
    var entry = easeOutCubic(Math.min(progress / 0.5, 1));
    var x = -layout.turnBadge.width + (width * 0.5 + layout.turnBadge.width) * entry;
    var opacity = time >= 1200 ? 0 : 1 - Math.max(0, (time - 850) / 350);

    return {
      x: x,
      y: height * 0.18,
      width: 320,
      height: 72,
      opacity: opacity,
      label: actor === 'enemy' ? 'Enemy Turn' : 'Your Turn',
    };
  }

  function buildLaneRects(startX, laneGap, laneWidth, laneHeight, y) {
    var lanes = [];
    for (var index = 0; index < 3; index += 1) {
      lanes.push({
        x: startX + laneGap + index * (laneWidth + laneGap),
        y: y,
        width: laneWidth,
        height: laneHeight,
      });
    }
    return lanes;
  }

  function buildHandSlots(startX, y, width, height, gap) {
    var slots = [];
    for (var index = 0; index < 4; index += 1) {
      slots.push({
        x: startX + index * (width + gap),
        y: y,
        width: width,
        height: height,
      });
    }
    return slots;
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  return {
    computeCanvasSize: computeCanvasSize,
    computeBoardLayout: computeBoardLayout,
    layoutBoardCards: layoutBoardCards,
    layoutHandCards: layoutHandCards,
    resolveAssetUrl: resolveAssetUrl,
    sampleTurnBanner: sampleTurnBanner,
  };
});
