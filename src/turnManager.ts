export class TurnManager {
  private currentPlayer: number;
  private turnNumber: number;

  constructor() {
    this.currentPlayer = 1;
    this.turnNumber = 1;
  }

  getCurrentPlayer(): number {
    return this.currentPlayer;
  }

  endTurn(): void {
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    if (this.currentPlayer === 1) {
      this.turnNumber++;
    }
  }

  getTurnNumber(): number {
    return this.turnNumber;
  }
}
