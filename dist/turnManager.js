export class TurnManager {
    currentPlayer;
    turnNumber;
    constructor() {
        this.currentPlayer = 1;
        this.turnNumber = 1;
    }
    getCurrentPlayer() {
        return this.currentPlayer;
    }
    endTurn() {
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        if (this.currentPlayer === 1) {
            this.turnNumber++;
        }
    }
    getTurnNumber() {
        return this.turnNumber;
    }
}
