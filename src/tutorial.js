(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.DuelTutorial = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getPlayableHandIndices(game) {
    var indices = [];
    for (var index = 0; index < game.player.hand.length; index += 1) {
      var card = game.player.hand[index];
      if (card.cost <= game.player.mana) {
        indices.push(index);
      }
    }
    return indices;
  }

  function getOpenLaneIndices(board) {
    var indices = [];
    for (var index = 0; index < board.length; index += 1) {
      if (!board[index]) {
        indices.push(index);
      }
    }
    return indices;
  }

  function getReadyAttackIndices(board) {
    var indices = [];
    for (var index = 0; index < board.length; index += 1) {
      if (board[index] && board[index].exhausted === false) {
        indices.push(index);
      }
    }
    return indices;
  }

  function getTutorialState(view) {
    var game = view.game;
    var playableHandIndices = getPlayableHandIndices(game);
    var openLaneIndices = getOpenLaneIndices(game.player.board);
    var attackLaneIndices = getReadyAttackIndices(game.player.board);
    var prompt = 'Watch the enemy turn.';

    if (game.turn === 'player') {
      if (view.selectedCard !== -1 && game.player.hand[view.selectedCard]) {
        prompt = 'Choose a glowing lane to summon ' + game.player.hand[view.selectedCard].name + '.';
      } else if (playableHandIndices.length) {
        prompt = 'Play a glowing card from your hand.';
      } else if (attackLaneIndices.length) {
        prompt = 'Attack with your glowing unit or end the turn.';
      } else {
        prompt = 'No plays left - press the glowing End Turn button.';
      }
    }

    return {
      prompt: prompt,
      highlightHandIndices: view.selectedCard === -1 ? playableHandIndices : [],
      highlightLaneIndices: view.selectedCard !== -1 ? openLaneIndices : [],
      attackLaneIndices: attackLaneIndices,
      endTurnPulse: game.turn === 'player' && (attackLaneIndices.length > 0 || (!playableHandIndices.length && view.selectedCard === -1)),
    };
  }

  return {
    getTutorialState: getTutorialState,
  };
});
