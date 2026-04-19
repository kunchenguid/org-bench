import { CardState, TextureAtlas, Card, CardPosition } from './types.js';
import { getCardDimensions, calculateFanLayout } from './fanLayout.js';
import { CardRenderer } from './cardRenderer.js';
import { TextureManager } from './textureManager.js';
import { createCardState, hoverCard, scaleCard } from './cardState.js';

export class CardGame {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private textureManager: TextureManager;
  private cardRenderer: CardRenderer;
  private cards: CardState[] = [];
  private mouseX = 0;
  private mouseY = 0;
  private lastTime = 0;
  private frameCount = 0;
  private fps = 0;
  private hudCanvas!: HTMLCanvasElement;
  private hudCtx!: CanvasRenderingContext2D;
  private damageCanvas!: HTMLCanvasElement;
  private damageCtx!: CanvasRenderingContext2D;
  private playerHealth = 30;
  private playerMana = 5;
  private playerMaxHealth = 30;
  private playerMaxMana = 10;
  private opponentHealth = 30;
  private opponentMana = 5;
  private opponentMaxHealth = 30;
  private opponentMaxMana = 10;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;
    this.textureManager = new TextureManager(gl);
    this.cardRenderer = new CardRenderer(gl);
    this.setupCanvas();
    this.setupHUDCanvas();
    this.setupDamageCanvas();
  }

  private setupCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clearColor(0.1, 0.1, 0.18, 1);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  private setupHUDCanvas(): void {
    this.hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;
    this.hudCanvas.width = window.innerWidth;
    this.hudCanvas.height = window.innerHeight;
    this.hudCtx = this.hudCanvas.getContext('2d')!;
  }

  private setupDamageCanvas(): void {
    this.damageCanvas = document.getElementById('damage-canvas') as HTMLCanvasElement;
    this.damageCanvas.width = window.innerWidth;
    this.damageCanvas.height = window.innerHeight;
    this.damageCtx = this.damageCanvas.getContext('2d')!;
  }

  initialize(): void {
    this.textureManager.initialize();
    this.createInitialCards();
    this.setupEventListeners();
    this.setupTurnSystem();
    this.startRenderLoop();
  }

  private createInitialCards(): void {
    const sampleCards: Card[] = [
      { id: '1', name: 'Dragon', cost: 5, health: 8, mana: 3, artColor: '#ff4444' },
      { id: '2', name: 'Wizard', cost: 3, health: 4, mana: 6, artColor: '#4444ff' },
      { id: '3', name: 'Knight', cost: 4, health: 6, mana: 2, artColor: '#44ff44' },
      { id: '4', name: 'Mage', cost: 2, health: 3, mana: 5, artColor: '#ff44ff' },
      { id: '5', name: 'Archer', cost: 2, health: 4, mana: 2, artColor: '#ffff44' }
    ];

    this.cards = sampleCards.map(card => createCardState(card));
    this.updateCardPositions();
  }

  private updateCardPositions(): void {
    const centerY = this.canvas.height - 150;
    const centerX = this.canvas.width / 2;
    
    const positions = calculateFanLayout(this.cards, centerX, centerY);
    this.cards.forEach((card, i) => {
      card.position = positions[i];
    });
  }

  private setupEventListeners(): void {
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

  private setupTurnSystem(): void {
    const endTurnBtn = document.getElementById('end-turn-btn');
    if (endTurnBtn) {
      endTurnBtn.addEventListener('click', () => {
        console.log('End turn clicked');
      });
    }
  }

  private handleHover(): void {
    this.cards.forEach(card => {
      const { width, height } = getCardDimensions();
      const halfW = width / 2;
      const halfH = height / 2;
      
      const isOver =
        this.mouseX >= card.position.x - halfW &&
        this.mouseX <= card.position.x + halfW &&
        this.mouseY >= card.position.y - halfH &&
        this.mouseY <= card.position.y + halfH;

      if (isOver !== card.isHovering) {
        card = hoverCard(card, isOver);
        if (isOver) {
          card = scaleCard(card, 1.1);
          card.position.rotation += 5;
        } else {
          card = scaleCard(card, 1);
          card.position.rotation -= 5;
        }
      }
    });
  }

  private startRenderLoop(): void {
    const render = (time: number) => {
      this.updateFPS(time);
      this.render();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  private updateFPS(time: number): void {
    this.frameCount++;
    if (time - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = time;
      document.getElementById('fps')!.textContent = this.fps.toString();
    }
  }

  private render(): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    const atlas = this.textureManager.getAtlas();
    if (!atlas) return;

    this.cards.forEach(card => {
      this.cardRenderer.renderCard(card, atlas, this.mouseX, this.mouseY);
    });

    this.renderHUD();
  }

  private renderHUD(): void {
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

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const game = new CardGame(canvas);
game.initialize();
