class Card {
    constructor(id, name, type, cost, attack, defense, effect, element) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.cost = cost;
        this.attack = attack;
        this.defense = defense;
        this.effect = effect;
        this.element = element;
    }
}

class Player {
    constructor(name, hp, mana) {
        this.name = name;
        this.hp = hp;
        this.mana = mana;
        this.maxHp = hp;
        this.maxMana = mana;
        this.hand = [];
        this.field = [];
    }
}

class Game {
    constructor() {
        this.player = new Player('Player', 30, 10);
        this.opponent = new Player('Opponent', 30, 10);
        this.turn = 0;
        this.phase = 'draw';
        this.selectedCard = null;
        this.cardDatabase = this.createCardDatabase();
    }

    createCardDatabase() {
        return [
            new Card(1, 'Fireball', 'spell', 2, 4, 0, 'Deal 4 damage to target', 'fire'),
            new Card(2, 'Healing Light', 'spell', 2, 0, 4, 'Restore 4 HP', 'water'),
            new Card(3, 'Stone Wall', 'unit', 3, 1, 6, 'High defense unit', 'earth'),
            new Card(4, 'Wind Strike', 'spell', 1, 3, 0, 'Quick attack spell', 'air'),
            new Card(5, 'Flame Guardian', 'unit', 4, 5, 4, 'Balanced fire unit', 'fire'),
            new Card(6, 'Water Spirit', 'unit', 3, 4, 5, 'Defensive water unit', 'water'),
            new Card(7, 'Earth Golem', 'unit', 5, 6, 7, 'Strong earth unit', 'earth'),
            new Card(8, 'Air Elemental', 'unit', 3, 5, 3, 'Fast air unit', 'air'),
            new Card(9, 'Inferno', 'spell', 5, 8, 0, 'Massive fire damage', 'fire'),
            new Card(10, 'Tidal Wave', 'spell', 4, 0, 8, 'Massive healing', 'water'),
        ];
    }

    createCardElement(card, isHidden = false) {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.element}`;
        cardEl.dataset.cardId = card.id;

        if (isHidden) {
            return cardEl;
        }

        const costEl = document.createElement('div');
        costEl.className = 'cost';
        costEl.textContent = card.cost;

        const nameEl = document.createElement('div');
        nameEl.className = 'card-name';
        nameEl.textContent = card.name;

        const typeEl = document.createElement('div');
        typeEl.className = 'card-type';
        typeEl.textContent = card.type;

        const statsEl = document.createElement('div');
        statsEl.className = 'card-stats';
        statsEl.innerHTML = `
            <span class="card-attack">${card.attack}</span>
            <span class="card-defense">${card.defense}</span>
        `;

        const effectEl = document.createElement('div');
        effectEl.className = 'card-effect';
        effectEl.textContent = card.effect;

        cardEl.appendChild(costEl);
        cardEl.appendChild(nameEl);
        cardEl.appendChild(typeEl);
        cardEl.appendChild(effectEl);
        cardEl.appendChild(statsEl);

        cardEl.addEventListener('click', () => this.selectCard(card, cardEl));

        return cardEl;
    }

    selectCard(card, cardEl) {
        if (this.selectedCard) {
            const prevSelected = document.querySelector('.card.selected');
            if (prevSelected) {
                prevSelected.classList.remove('selected');
            }
        }

        this.selectedCard = { card, element: cardEl };
        cardEl.classList.add('selected');
        this.playCard(card);
    }

    playCard(card) {
        if (this.player.mana >= card.cost) {
            this.player.mana -= card.cost;
            this.updateUI();
            
            if (card.type === 'unit') {
                this.player.field.push(card);
                this.renderField();
            }
            
            const index = this.player.hand.findIndex(c => c.id === card.id);
            if (index > -1) {
                this.player.hand.splice(index, 1);
            }
            
            this.renderHand();
        } else {
            alert('Not enough mana!');
        }
    }

    updateUI() {
        document.getElementById('mana-count').textContent = this.player.mana;
        document.getElementById('hp-count').textContent = this.player.hp;
    }

    renderHand() {
        const playerCardsEl = document.getElementById('player-cards');
        playerCardsEl.innerHTML = '';

        this.player.hand.forEach(card => {
            const cardEl = this.createCardElement(card);
            playerCardsEl.appendChild(cardEl);
        });
    }

    renderOpponentHand() {
        const opponentCardsEl = document.getElementById('opponent-cards');
        opponentCardsEl.innerHTML = '';

        this.opponent.hand.forEach(card => {
            const cardEl = this.createCardElement(card, true);
            opponentCardsEl.appendChild(cardEl);
        });
    }

    renderField() {
        const playerActiveEl = document.getElementById('player-active');
        playerActiveEl.innerHTML = '';

        this.player.field.forEach(card => {
            const cardEl = this.createCardElement(card);
            cardEl.style.cursor = 'default';
            playerActiveEl.appendChild(cardEl);
        });
    }

    startNewGame() {
        this.player.hand = [];
        this.opponent.hand = [];
        this.player.field = [];
        this.opponent.field = [];
        this.player.hp = this.player.maxHp;
        this.opponent.hp = this.opponent.maxHp;
        this.player.mana = this.player.maxMana;
        this.opponent.mana = this.opponent.maxMana;
        this.turn = 0;

        for (let i = 0; i < 5; i++) {
            this.player.hand.push(this.getRandomCard());
            this.opponent.hand.push(this.getRandomCard());
        }

        this.updateUI();
        this.renderHand();
        this.renderOpponentHand();
        this.renderField();
    }

    getRandomCard() {
        const index = Math.floor(Math.random() * this.cardDatabase.length);
        return this.cardDatabase[index];
    }
}

const game = new Game();

document.addEventListener('DOMContentLoaded', () => {
    game.startNewGame();
});
