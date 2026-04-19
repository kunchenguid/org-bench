export class ManaSystem {
    maxMana;
    currentMana;
    constructor() {
        this.maxMana = 10;
        this.currentMana = 10;
    }
    getMaxMana() {
        return this.maxMana;
    }
    getCurrentMana() {
        return this.currentMana;
    }
    incrementMaxMana() {
        if (this.maxMana < 10) {
            this.maxMana++;
        }
    }
    refillMana() {
        this.currentMana = this.maxMana;
    }
    spendMana(amount) {
        if (amount > this.currentMana) {
            return false;
        }
        this.currentMana -= amount;
        return true;
    }
}
