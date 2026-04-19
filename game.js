const hudCanvas = document.getElementById('hud-canvas');
const damageCanvas = document.getElementById('damage-canvas');
const hudCtx = hudCanvas.getContext('2d');
const damageCtx = damageCanvas.getContext('2d');
const turnDisplay = document.getElementById('turn-display');
const timerDisplay = document.getElementById('timer-display');
const endTurnBtn = document.getElementById('end-turn-btn');
const enemyReticle = document.getElementById('enemy-reticle');

const cards = [
  { id: 'fireball', name: 'Fireball', cost: 4, health: 0, mana: 4, artColor: '#ff6b35' },
  { id: 'heal', name: 'Holy Light', cost: 3, health: 3, mana: 3, artColor: '#ffd700' },
  { id: 'shield', name: 'Divine Shield', cost: 2, health: 5, mana: 2, artColor: '#87ceeb' },
  { id: 'draw_card', name: 'Arcane Intellect', cost: 3, health: 0, mana: 3, artColor: '#9370db' },
  { id: 'attack_buff', name: 'Blessing of Might', cost: 1, health: 0, mana: 1, artColor: '#ff4500' },
  { id: 'charge', name: 'Charge', cost: 1, health: 2, mana: 1, artColor: '#32cd32' }
];

let cardElements = [];
let hoveredCard = null;

let gameState = {
    playerHealth: 30,
    playerMaxHealth: 30,
    playerMana: 3,
    playerMaxMana: 3,
    opponentHealth: 30,
    opponentMaxHealth: 30,
    opponentMana: 0,
    opponentMaxMana: 10,
    playerDeckCount: 5,
    opponentDeckCount: 5,
    currentTurn: 1,
    turnTimer: 30,
    isPlayerTurn: true
};

let damagePopups = [];

class DamagePopup {
    constructor(x, y, damage) {
        this.x = x;
        this.y = y;
        this.damage = damage;
        this.life = 1.5;
        this.maxLife = 1.5;
        this.velocity = -50;
    }

    update(dt) {
        this.y += this.velocity * dt;
        this.life -= dt;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 24px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`-${this.damage}`, this.x, this.y);
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

function resizeCanvas() {
    hudCanvas.width = window.innerWidth;
    hudCanvas.height = window.innerHeight;
    damageCanvas.width = window.innerWidth;
    damageCanvas.height = window.innerHeight;
}

function drawGauge(ctx, x, y, width, height, current, max, color, label) {
    const padding = 4;
    const barWidth = width - padding * 2;
    const barHeight = height - padding * 2;
    const fillWidth = barWidth * (current / max);
    
    ctx.save();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, width, height);
    
    ctx.fillStyle = color;
    ctx.fillRect(x + padding, y + padding, fillWidth, barHeight);
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${label}: ${current}/${max}`, x + width / 2, y + height / 2 + 5);
    
    ctx.restore();
}

function drawDeckIndicator(ctx, x, y, count, label) {
    ctx.save();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#4a90e2';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(count.toString(), x, y + 6);
    
    ctx.font = '12px system-ui';
    ctx.fillText(label, x, y - 30);
    
    ctx.restore();
}

function drawHUD() {
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    
    const opponentPortraitX = window.innerWidth - 140;
    const opponentPortraitY = 80;
    const playerPortraitX = 20;
    const playerPortraitY = window.innerHeight - 260;
    
    const gaugeWidth = 140;
    const gaugeHeight = 30;
    const gaugeGap = 5;
    
    drawGauge(hudCtx, opponentPortraitX, opponentPortraitY - gaugeHeight * 2 - gaugeGap, 
               gaugeWidth, gaugeHeight, gameState.opponentHealth, gameState.opponentMaxHealth, '#ff4444', 'HP');
    drawGauge(hudCtx, opponentPortraitX, opponentPortraitY - gaugeHeight, 
               gaugeWidth, gaugeHeight, gameState.opponentMana, gameState.opponentMaxMana, '#4a90e2', 'MP');
    
    drawDeckIndicator(hudCtx, window.innerWidth - 70, 80, gameState.opponentDeckCount, 'Opponent');
    
    drawGauge(hudCtx, playerPortraitX, playerPortraitY + 180 + gaugeGap, 
               gaugeWidth, gaugeHeight, gameState.playerHealth, gameState.playerMaxHealth, '#ff4444', 'HP');
    drawGauge(hudCtx, playerPortraitX, playerPortraitY + 180, 
               gaugeWidth, gaugeHeight, gameState.playerMana, gameState.playerMaxMana, '#4a90e2', 'MP');
    
    drawDeckIndicator(hudCtx, 70, window.innerHeight - 70, gameState.playerDeckCount, 'Player');
}

function spawnDamagePopup(target, damage) {
    let x, y;
    
    if (target === 'player') {
        x = 80;
        y = window.innerHeight - 150;
    } else {
        x = window.innerWidth - 80;
        y = 150;
    }
    
    damagePopups.push(new DamagePopup(x, y, damage));
}

function updateDamagePopups(dt) {
    damageCtx.clearRect(0, 0, damageCanvas.width, damageCanvas.height);
    
    damagePopups = damagePopups.filter(popup => {
        popup.update(dt);
        popup.draw(damageCtx);
        return !popup.isDead();
    });
}

let lastTime = performance.now();

function gameLoop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    drawHUD();
    updateDamagePopups(dt);
    
    requestAnimationFrame(gameLoop);
}

function endTurn() {
    if (gameState.isPlayerTurn) {
        gameState.isPlayerTurn = false;
        gameState.currentTurn++;
        gameState.turnTimer = 30;
        gameState.playerMana = 0;
        turnDisplay.textContent = `Turn ${gameState.currentTurn}`;
        endTurnBtn.disabled = true;
        endTurnBtn.style.opacity = '0.5';
        
        setTimeout(() => {
            gameState.isPlayerTurn = true;
            gameState.playerMaxMana = Math.min(gameState.playerMaxMana + 1, 10);
            gameState.playerMana = gameState.playerMaxMana;
            endTurnBtn.disabled = false;
            endTurnBtn.style.opacity = '1';
            updateCardPlayability();
        }, 1000);
    }
}

let timerInterval;

function startTurnTimer() {
    timerInterval = setInterval(() => {
        if (gameState.isPlayerTurn && gameState.turnTimer > 0) {
            gameState.turnTimer--;
            timerDisplay.textContent = gameState.turnTimer.toString();
            
            if (gameState.turnTimer <= 5) {
                timerDisplay.style.color = '#ff4444';
            } else {
                timerDisplay.style.color = 'white';
            }
        }
    }, 1000);
}

function dealDamage(target, amount) {
    if (target === 'player') {
        gameState.playerHealth = Math.max(0, gameState.playerHealth - amount);
    } else {
        gameState.opponentHealth = Math.max(0, gameState.opponentHealth - amount);
    }
    spawnDamagePopup(target, amount);
}

window.addEventListener('resize', () => {
    resizeCanvas();
    positionReticle();
});
endTurnBtn.addEventListener('click', endTurn);

resizeCanvas();
positionReticle();
startTurnTimer();
requestAnimationFrame(gameLoop);

window.dealDamage = dealDamage;

function isPlayable(card, playerMana) {
    return card.cost <= playerMana;
}

function updateCardPlayability() {
    cardElements.forEach(cardEl => {
        const cardIndex = parseInt(cardEl.dataset.cardIndex);
        const card = cards[cardIndex];
        
        cardEl.classList.remove('playable', 'unplayable');
        
        if (gameState.isPlayerTurn && isPlayable(card, gameState.playerMana)) {
            cardEl.classList.add('playable');
        } else {
            cardEl.classList.add('unplayable');
        }
    });
}

function createCardElement(card, index) {
  const cardEl = document.createElement('div');
  cardEl.className = 'game-card';
  cardEl.dataset.cardIndex = index;
  
  if (gameState.isPlayerTurn && isPlayable(card, gameState.playerMana)) {
    cardEl.classList.add('playable');
  } else {
    cardEl.classList.add('unplayable');
  }
  
  const handX = 100 + index * 130;
  const handY = window.innerHeight - 220;
  
  cardEl.innerHTML = `
    <div class="card-cost">${card.cost}</div>
    <div class="card-art" style="background: linear-gradient(135deg, ${card.artColor} 0%, ${card.artColor}88 100%)"></div>
    <div class="card-name">${card.name}</div>
    <div class="card-stats">
      <span class="card-stat health">${card.health > 0 ? card.health : ''}</span>
      <span class="card-stat mana">${card.mana > 0 ? card.mana : ''}</span>
    </div>
  `;
  
  cardEl.style.left = `${handX}px`;
  cardEl.style.top = `${handY}px`;
  
  return cardEl;
}

function positionReticle() {
    const opponentPortrait = document.querySelector('.hero-portrait.opponent');
    if (opponentPortrait) {
        const rect = opponentPortrait.getBoundingClientRect();
        enemyReticle.style.left = `${rect.left - 10}px`;
        enemyReticle.style.top = `${rect.top - 10}px`;
    }
}

function showReticle() {
    enemyReticle.classList.add('active');
}

function hideReticle() {
    enemyReticle.classList.remove('active');
}

function setupCardTooltips() {
  const cardElements = document.querySelectorAll('.game-card');
  
  cardElements.forEach(cardEl => {
    const cardIndex = parseInt(cardEl.dataset.cardIndex);
    const card = cards[cardIndex];
    
    cardEl.addEventListener('mouseenter', (e) => {
      hoveredCard = card;
      showTooltip(card, e.clientX, e.clientY);
      
      if (gameState.isPlayerTurn && isPlayable(card, gameState.playerMana)) {
        showReticle();
      }
    });
    
    cardEl.addEventListener('mouseleave', () => {
      hoveredCard = null;
      hideTooltip();
      hideReticle();
    });
    
    cardEl.addEventListener('mousemove', (e) => {
      if (hoveredCard) {
        updateTooltipPosition(e.clientX, e.clientY);
      }
    });
    
    cardEl.addEventListener('click', () => {
      if (gameState.isPlayerTurn && isPlayable(card, gameState.playerMana)) {
        gameState.playerMana -= card.cost;
        updateCardPlayability();
      }
    });
  });
}

function renderCards() {
  const existingCards = document.querySelectorAll('.game-card');
  existingCards.forEach(card => card.remove());
  cardElements = [];
  
  cards.forEach((card, index) => {
    const cardEl = createCardElement(card, index);
    document.getElementById('game').appendChild(cardEl);
    cardElements.push(cardEl);
  });
  
  updateCardPlayability();
  setTimeout(setupCardTooltips, 100);
}

const cardStyle = document.createElement('style');
cardStyle.textContent = `
  .game-card {
    position: absolute;
    width: 120px;
    height: 180px;
    border-radius: 12px;
    background: linear-gradient(135deg, #2a2a4a 0%, #1a1a2e 100%);
    border: 3px solid #4a90e2;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s, border-color 0.3s, opacity 0.3s, filter 0.3s;
    overflow: hidden;
  }
  .game-card.playable {
    border-color: #ffd700;
    box-shadow: 0 4px 20px rgba(255, 215, 0, 0.6);
    transform: translateY(-5px);
  }
  .game-card.playable:hover {
    transform: translateY(-10px);
    box-shadow: 0 8px 30px rgba(255, 215, 0, 0.8);
    z-index: 50;
  }
  .game-card.unplayable {
    opacity: 0.6;
    filter: grayscale(0.5);
  }
  .game-card.unplayable:hover {
    opacity: 0.7;
    transform: translateY(-5px);
  }
  .card-cost {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
    border: 2px solid #fff;
  }
  .card-art {
    position: absolute;
    top: 40px;
    left: 10px;
    right: 10px;
    bottom: 60px;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }
  .card-name {
    position: absolute;
    bottom: 45px;
    left: 10px;
    right: 10px;
    color: white;
    font-size: 12px;
    font-weight: bold;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-stats {
    position: absolute;
    bottom: 10px;
    left: 10px;
    right: 10px;
    display: flex;
    justify-content: space-between;
  }
  .card-stat {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    color: white;
    border: 2px solid #fff;
  }
  .card-stat.health {
    background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
  }
  .card-stat.mana {
    background: linear-gradient(135deg, #4a90e2 0%, #0066cc 100%);
  }
`;
document.head.appendChild(cardStyle);

renderCards();
