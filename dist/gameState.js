export var TurnPhase;
(function (TurnPhase) {
    TurnPhase["DRAW"] = "draw";
    TurnPhase["MAIN"] = "main";
    TurnPhase["COMBAT"] = "combat";
    TurnPhase["END"] = "end";
})(TurnPhase || (TurnPhase = {}));
export var PhaseActionType;
(function (PhaseActionType) {
    PhaseActionType["DRAW"] = "draw";
    PhaseActionType["MANA_REFILL"] = "mana_refill";
    PhaseActionType["COMBAT_RESET"] = "combat_reset";
    PhaseActionType["END_TURN"] = "end_turn";
})(PhaseActionType || (PhaseActionType = {}));
export var PlayerType;
(function (PlayerType) {
    PlayerType["PLAYER"] = "player";
    PlayerType["OPPONENT"] = "opponent";
})(PlayerType || (PlayerType = {}));
export var GameStateType;
(function (GameStateType) {
    GameStateType["IN_PROGRESS"] = "in_progress";
    GameStateType["PLAYER_WINS"] = "player_wins";
    GameStateType["OPPONENT_WINS"] = "opponent_wins";
    GameStateType["DRAW"] = "draw";
})(GameStateType || (GameStateType = {}));
