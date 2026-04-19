import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ManaSystem } from '../manaSystem.js';
describe('manaSystem', () => {
    it('initializes with max mana 10', () => {
        const manaSystem = new ManaSystem();
        assert.equal(manaSystem.getMaxMana(), 10);
    });
    it('increments max mana up to 10', () => {
        const manaSystem = new ManaSystem();
        for (let i = 0; i < 15; i++) {
            manaSystem.incrementMaxMana();
        }
        assert.equal(manaSystem.getMaxMana(), 10);
    });
    it('refills mana to max', () => {
        const manaSystem = new ManaSystem();
        manaSystem.spendMana(5);
        manaSystem.refillMana();
        assert.equal(manaSystem.getCurrentMana(), 10);
    });
    it('spends mana correctly', () => {
        const manaSystem = new ManaSystem();
        const success = manaSystem.spendMana(3);
        assert.equal(success, true);
        assert.equal(manaSystem.getCurrentMana(), 7);
    });
    it('returns false when spending more than available', () => {
        const manaSystem = new ManaSystem();
        const success = manaSystem.spendMana(15);
        assert.equal(success, false);
        assert.equal(manaSystem.getCurrentMana(), 10);
    });
});
