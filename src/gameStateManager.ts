export class GameStateManager {
  private currentPhase: string;
  private turnManager: any;
  private manaSystem: any;

  constructor(turnManager: any, manaSystem: any) {
    this.turnManager = turnManager;
    this.manaSystem = manaSystem;
    this.currentPhase = 'draw';
  }

  transitionTo(phase: string): void {
    this.currentPhase = phase;
  }

  getCurrentPhase(): string {
    return this.currentPhase;
  }
}
