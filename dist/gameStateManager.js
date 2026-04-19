export class GameStateManager {
    currentPhase;
    turnManager;
    manaSystem;
    constructor(turnManager, manaSystem) {
        this.turnManager = turnManager;
        this.manaSystem = manaSystem;
        this.currentPhase = 'draw';
    }
    transitionTo(phase) {
        this.currentPhase = phase;
    }
    getCurrentPhase() {
        return this.currentPhase;
    }
}
