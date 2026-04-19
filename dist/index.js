import { getCardDimensions, calculateFanLayout } from './fanLayout.js';
import { CardRenderer } from './cardRenderer.js';
import { TextureManager } from './textureManager.js';
import { createCardState, hoverCard, scaleCard } from './cardState.js';
export class CardGame {
    canvas;
    gl;
    textureManager;
    cardRenderer;
    cards = [];
    mouseX = 0;
    mouseY = 0;
    lastTime = 0;
    frameCount = 0;
    fps = 0;
    hudCanvas;
    hudCtx;
    damageCanvas;
    damageCtx;
    playerHealth = 30;
    playerMana = 5;
    playerMaxHealth = 30;
    playerMaxMana = 10;
    opponentHealth = 30;
    opponentMana = 5;
    opponentMaxHealth = 30;
    opponentMaxMana = 10;
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl');
        if (!gl)
            throw new Error('WebGL not supported');
        this.gl = gl;
        this.textureManager = new TextureManager(gl);
        this.cardRenderer = new CardRenderer(gl);
        this.setupCanvas();
        this.setupHUDCanvas();
        this.setupDamageCanvas();
    }
    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0.1, 0.1, 0.18, 1);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }
    setupHUDCanvas() {
        this.hudCanvas = document.getElementById('hud-canvas');
        this.hudCanvas.width = window.innerWidth;
        this.hudCanvas.height = window.innerHeight;
        this.hudCtx = this.hudCanvas.getContext('2d');
    }
    setupDamageCanvas() {
        this.damageCanvas = document.getElementById('damage-canvas');
        this.damageCanvas.width = window.innerWidth;
        this.damageCanvas.height = window.innerHeight;
        this.damageCtx = this.damageCanvas.getContext('2d');
    }
    initialize() {
        this.textureManager.initialize();
        this.createInitialCards();
        this.setupEventListeners();
        this.setupTurnSystem();
        this.startRenderLoop();
    }
    createInitialCards() {
        const sampleCards = [
            { id: '1', name: 'Dragon', cost: 5, health: 8, mana: 3, artColor: '#ff4444' },
            { id: '2', name: 'Wizard', cost: 3, health: 4, mana: 6, artColor: '#4444ff' },
            { id: '3', name: 'Knight', cost: 4, health: 6, mana: 2, artColor: '#44ff44' },
            { id: '4', name: 'Mage', cost: 2, health: 3, mana: 5, artColor: '#ff44ff' },
            { id: '5', name: 'Archer', cost: 2, health: 4, mana: 2, artColor: '#ffff44' }
        ];
        this.cards = sampleCards.map(card => createCardState(card));
        this.updateCardPositions();
    }
    updateCardPositions() {
        const centerY = this.canvas.height - 150;
        const centerX = this.canvas.width / 2;
        const positions = calculateFanLayout(this.cards, centerX, centerY);
        this.cards.forEach((card, i) => {
            card.position = positions[i];
        });
    }
    setupEventListeners() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            this.handleHover();
        });
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.updateCardPositions();
            this.hudCanvas.width = window.innerWidth;
            this.hudCanvas.height = window.innerHeight;
            this.damageCanvas.width = window.innerWidth;
            this.damageCanvas.height = window.innerHeight;
        });
    }
    setupTurnSystem() {
        const endTurnBtn = document.getElementById('end-turn-btn');
        if (endTurnBtn) {
            endTurnBtn.addEventListener('click', () => {
                console.log('End turn clicked');
            });
        }
    }
    handleHover() {
        this.cards.forEach(card => {
            const { width, height } = getCardDimensions();
            const halfW = width / 2;
            const halfH = height / 2;
            const isOver = this.mouseX >= card.position.x - halfW &&
                this.mouseX <= card.position.x + halfW &&
                this.mouseY >= card.position.y - halfH &&
                this.mouseY <= card.position.y + halfH;
            if (isOver !== card.isHovering) {
                card = hoverCard(card, isOver);
                if (isOver) {
                    card = scaleCard(card, 1.1);
                    card.position.rotation += 5;
                }
                else {
                    card = scaleCard(card, 1);
                    card.position.rotation -= 5;
                }
            }
        });
    }
    startRenderLoop() {
        const render = (time) => {
            this.updateFPS(time);
            this.render();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
    updateFPS(time) {
        this.frameCount++;
        if (time - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = time;
            document.getElementById('fps').textContent = this.fps.toString();
        }
    }
    render() {
        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT);
        const atlas = this.textureManager.getAtlas();
        if (!atlas)
            return;
        this.cards.forEach(card => {
            this.cardRenderer.renderCard(card, atlas, this.mouseX, this.mouseY);
        });
        this.renderHUD();
    }
    renderHUD() {
        const ctx = this.hudCtx;
        ctx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
        const gaugeWidth = 120;
        const gaugeHeight = 12;
        const gaugeY = this.hudCanvas.height - 50;
        ctx.font = '12px Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText('Health', 20, gaugeY - 5);
        ctx.fillStyle = '#333';
        ctx.fillRect(20, gaugeY, gaugeWidth, gaugeHeight);
        ctx.fillStyle = '#4a4';
        ctx.fillRect(20, gaugeY, gaugeWidth * (this.playerHealth / this.playerMaxHealth), gaugeHeight);
        ctx.fillStyle = '#fff';
        ctx.fillText('Mana', 20, gaugeY + 30);
        ctx.fillStyle = '#333';
        ctx.fillRect(20, gaugeY + 35, gaugeWidth, gaugeHeight);
        ctx.fillStyle = '#44a';
        ctx.fillRect(20, gaugeY + 35, gaugeWidth * (this.playerMana / this.playerMaxMana), gaugeHeight);
        const opponentGaugeY = 150;
        ctx.fillStyle = '#fff';
        ctx.fillText('Opponent Health', 20, opponentGaugeY - 5);
        ctx.fillStyle = '#333';
        ctx.fillRect(20, opponentGaugeY, gaugeWidth, gaugeHeight);
        ctx.fillStyle = '#a44';
        ctx.fillRect(20, opponentGaugeY, gaugeWidth * (this.opponentHealth / this.opponentMaxHealth), gaugeHeight);
        ctx.fillStyle = '#fff';
        ctx.fillText('Opponent Mana', 20, opponentGaugeY + 30);
        ctx.fillStyle = '#333';
        ctx.fillRect(20, opponentGaugeY + 35, gaugeWidth, gaugeHeight);
        ctx.fillStyle = '#44a';
        ctx.fillRect(20, opponentGaugeY + 35, gaugeWidth * (this.opponentMana / this.opponentMaxMana), gaugeHeight);
    }
}
const canvas = document.getElementById('gameCanvas');
const game = new CardGame(canvas);
game.initialize();
