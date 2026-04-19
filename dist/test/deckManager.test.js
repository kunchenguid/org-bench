import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { drawCard, playCardToBoard, discardCard, getHandSize, getBoardSize, getDeckSize, getHand, getBoard, shuffleDeck, isCardInHand, isCardOnBoard, isCardInDeck } from '../deckManager.js';
import { PlayerType } from '../gameState.js';
import { createInitialGameState, updatePlayerState } from '../stateManager.js';
describe('deckManager', () => {
    let state;
    beforeEach(() => {
        const cards = new Map([
            ['card1', { id: 'card1', name: 'Card 1', cost: 1, health: 1, mana: 1, artColor: '#ff0000' }],
            ['card2', { id: 'card2', name: 'Card 2', cost: 1, health: 1, mana: 1, artColor: '#00ff00' }],
            ['card3', { id: 'card3', name: 'Card 3', cost: 1, health: 1, mana: 1, artColor: '#0000ff' }]
        ]);
        state = createInitialGameState(cards);
    });
    describe('drawCard', () => {
        it('draws card from deck to hand', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { deck: ['card1', 'card2'] });
            const updated = drawCard(state, PlayerType.PLAYER, 1);
            assert.strictEqual(updated.player.hand.length, 1);
            assert.strictEqual(updated.player.deck.length, 1);
            assert.strictEqual(updated.player.hand[0], 'card1');
        });
        it('draws multiple cards', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { deck: ['card1', 'card2', 'card3'] });
            const updated = drawCard(state, PlayerType.PLAYER, 2);
            assert.strictEqual(updated.player.hand.length, 2);
            assert.strictEqual(updated.player.deck.length, 1);
        });
        it('draws up to deck size', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { deck: ['card1'] });
            const updated = drawCard(state, PlayerType.PLAYER, 5);
            assert.strictEqual(updated.player.hand.length, 1);
            assert.strictEqual(updated.player.deck.length, 0);
        });
        it('does nothing when deck is empty', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { deck: [] });
            const updated = drawCard(state, PlayerType.PLAYER, 1);
            assert.strictEqual(updated.player.hand.length, 0);
        });
    });
    describe('playCardToBoard', () => {
        it('moves card from hand to board', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: ['card1'], board: [] });
            const updated = playCardToBoard(state, PlayerType.PLAYER, 'card1');
            assert.strictEqual(updated.player.hand.length, 0);
            assert.strictEqual(updated.player.board.length, 1);
            assert.strictEqual(updated.player.board[0], 'card1');
        });
        it('throws error when card not in hand', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: [], board: [] });
            assert.throws(() => playCardToBoard(state, PlayerType.PLAYER, 'card1'), /Card .* not in hand/);
        });
    });
    describe('discardCard', () => {
        it('removes card from hand', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: ['card1', 'card2'] });
            const updated = discardCard(state, PlayerType.PLAYER, 'card1');
            assert.strictEqual(updated.player.hand.length, 1);
            assert.strictEqual(updated.player.hand.includes('card1'), false);
        });
        it('throws error when card not in hand', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: [] });
            assert.throws(() => discardCard(state, PlayerType.PLAYER, 'card1'), /Card .* not in hand/);
        });
    });
    describe('getHandSize', () => {
        it('returns hand size', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: ['card1', 'card2'] });
            assert.strictEqual(getHandSize(state, PlayerType.PLAYER), 2);
        });
    });
    describe('getBoardSize', () => {
        it('returns board size', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { board: ['card1', 'card2', 'card3'] });
            assert.strictEqual(getBoardSize(state, PlayerType.PLAYER), 3);
        });
    });
    describe('getDeckSize', () => {
        it('returns deck size', () => {
            assert.strictEqual(getDeckSize(state, PlayerType.PLAYER), 20);
        });
    });
    describe('getHand', () => {
        it('returns hand cards', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: ['card1', 'card2'] });
            const hand = getHand(state, PlayerType.PLAYER);
            assert.strictEqual(hand.length, 2);
            assert.strictEqual(hand[0], 'card1');
        });
    });
    describe('getBoard', () => {
        it('returns board cards', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { board: ['card1', 'card2'] });
            const board = getBoard(state, PlayerType.PLAYER);
            assert.strictEqual(board.length, 2);
            assert.strictEqual(board[0], 'card1');
        });
    });
    describe('shuffleDeck', () => {
        it('shuffles deck', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { deck: ['card1', 'card2', 'card3'] });
            const original = state.player.deck;
            const updated = shuffleDeck(state, PlayerType.PLAYER);
            assert.strictEqual(updated.player.deck.length, original.length);
            assert.deepStrictEqual([...updated.player.deck].sort(), [...original].sort());
        });
    });
    describe('isCardInHand', () => {
        it('returns true when card in hand', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: ['card1'] });
            assert.strictEqual(isCardInHand(state, PlayerType.PLAYER, 'card1'), true);
        });
        it('returns false when card not in hand', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { hand: [] });
            assert.strictEqual(isCardInHand(state, PlayerType.PLAYER, 'card1'), false);
        });
    });
    describe('isCardOnBoard', () => {
        it('returns true when card on board', () => {
            state = updatePlayerState(state, PlayerType.PLAYER, { board: ['card1'] });
            assert.strictEqual(isCardOnBoard(state, PlayerType.PLAYER, 'card1'), true);
        });
    });
    describe('isCardInDeck', () => {
        it('returns true when card in deck', () => {
            assert.strictEqual(isCardInDeck(state, PlayerType.PLAYER, 'player_0'), true);
        });
    });
});
