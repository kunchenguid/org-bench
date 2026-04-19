export class ManaSystem {
  private maxMana: number;
  private currentMana: number;

  constructor() {
    this.maxMana = 10;
    this.currentMana = 10;
  }

  getMaxMana(): number {
    return this.maxMana;
  }

  getCurrentMana(): number {
    return this.currentMana;
  }

  incrementMaxMana(): void {
    if (this.maxMana < 10) {
      this.maxMana++;
    }
  }

  refillMana(): void {
    this.currentMana = this.maxMana;
  }

  spendMana(amount: number): boolean {
    if (amount > this.currentMana) {
      return false;
    }
    this.currentMana -= amount;
    return true;
  }
}
