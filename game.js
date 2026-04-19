const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl');

if (!gl) {
  alert('WebGL not supported');
  throw new Error('WebGL not supported');
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const vsSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  uniform vec2 u_resolution;
  uniform vec2 u_translation;
  uniform vec2 u_scale;
  uniform float u_rotation;
  varying vec2 v_texCoord;

  void main() {
    float c = cos(u_rotation);
    float s = sin(u_rotation);
    mat2 rotation = mat2(c, -s, s, c);
    vec2 position = rotation * a_position * u_scale + u_translation;
    vec2 clipSpace = (position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
  }
`;

const fsSource = `
  precision mediump float;
  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  void main() {
    gl_FragColor = texture2D(u_image, v_texCoord);
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

const program = createProgram(gl, vsSource, fsSource);
const positionLocation = gl.getAttribLocation(program, 'a_position');
const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
const translationLocation = gl.getUniformLocation(program, 'u_translation');
const scaleLocation = gl.getUniformLocation(program, 'u_scale');
const rotationLocation = gl.getUniformLocation(program, 'u_rotation');
const imageLocation = gl.getUniformLocation(program, 'u_image');

const positionBuffer = gl.createBuffer();
const texCoordBuffer = gl.createBuffer();

const quadPositions = [
  0, 0, 1, 0, 0, 1,
  0, 1, 1, 0, 1, 1
];

const quadTexCoords = [
  0, 1, 1, 1, 0, 0,
  0, 0, 1, 1, 1, 0
];

gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadPositions), gl.STATIC_DRAW);

gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadTexCoords), gl.STATIC_DRAW);

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

const textureCache = {};

function loadTexture(path) {
  if (textureCache[path]) {
    return textureCache[path];
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255]));
  const image = new Image();
  image.src = path;
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  };
  textureCache[path] = texture;
  return texture;
}

loadTexture('assets/backgrounds/solaris-bg.png');
loadTexture('assets/backgrounds/lunara-bg.png');

for (let i = 1; i <= 20; i++) {
  loadTexture(`assets/cards/card-${i.toString().padStart(2, '0')}.png`);
}
loadTexture('assets/factions/solaris-frame.png');
loadTexture('assets/factions/lunara-frame.png');
loadTexture('assets/heroes/solaris-hero.png');
loadTexture('assets/heroes/lunara-hero.png');
loadTexture('assets/factions/solaris-sigil.png');
loadTexture('assets/factions/lunara-sigil.png');

let batch = [];
const MAX_BATCH_SIZE = 1000;

function addToBatch(image, x, y, width, height, rotation = 0) {
  batch.push({ image, x, y, width, height, rotation });
  if (batch.length >= MAX_BATCH_SIZE) {
    flushBatch();
  }
}

function flushBatch() {
  if (batch.length === 0) return;
  gl.useProgram(program);
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
  let currentTexture = null;
  for (const item of batch) {
    if (currentTexture !== item.image) {
      currentTexture = item.image;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentTexture);
      gl.uniform1i(imageLocation, 0);
    }
    gl.uniform2f(translationLocation, item.x, item.y);
    gl.uniform2f(scaleLocation, item.width, item.height);
    gl.uniform1f(rotationLocation, item.rotation);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  batch = [];
}

const CARD_WIDTH = 120;
const CARD_HEIGHT = 160;
const HAND_Y = canvas.height - 200;
const ENEMY_HAND_Y = 50;
const BOARD_Y = canvas.height / 2;

const gameState = {
  player: {
    board: [],
    hand: [],
    deck: [],
    hp: 30,
    maxHp: 30,
    currentMana: 0,
    manaCap: 0,
    graveyard: [],
    faction: 'light'
  },
  opponent: {
    board: [],
    hand: [],
    deck: [],
    hp: 30,
    maxHp: 30,
    currentMana: 0,
    manaCap: 0,
    graveyard: [],
    faction: 'shadow'
  },
  lastEffect: null
};

let currentPlayer = 'player';

function drawHand() {
  const handCards = gameState[currentPlayer].hand;
  const handWidth = handCards.length * (CARD_WIDTH + 10) - 10;
  const startX = (canvas.width - handWidth) / 2;
  for (let i = 0; i < handCards.length; i++) {
    const x = startX + i * (CARD_WIDTH + 10);
    const card = handCards[i];
    const texture = textureCache[`assets/cards/card-${card.id}.png`];
    if (texture) {
      addToBatch(texture, x, HAND_Y + card.hoverOffset, CARD_WIDTH, CARD_HEIGHT, card.hoverRotation);
    }
  }
}

function drawBoard() {
  const boardCards = gameState[currentPlayer].board;
  const boardWidth = boardCards.length * (CARD_WIDTH + 15) - 15;
  const startX = (canvas.width - boardWidth) / 2;
  for (let i = 0; i < boardCards.length; i++) {
    const x = startX + i * (CARD_WIDTH + 15);
    const card = boardCards[i];
    const texture = textureCache[`assets/cards/card-${card.id}.png`];
    if (texture) {
      addToBatch(texture, x, BOARD_Y - CARD_HEIGHT / 2 + card.yOffset, CARD_WIDTH, CARD_HEIGHT, card.rotation);
    }
  }
}

function drawDeck() {
  if (gameState[currentPlayer].deck.length > 0) {
    const deckTexture = textureCache['assets/factions/solaris-frame.png'];
    if (deckTexture) {
      addToBatch(deckTexture, 50, BOARD_Y - CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT);
    }
  }
}

let mouseX = 0;
let mouseY = 0;
let draggingCard = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  updateHoverEffects();
  if (draggingCard) {
    draggingCard.x = mouseX - dragOffsetX;
    draggingCard.y = mouseY - dragOffsetY;
  }
});

function updateHoverEffects() {
  const handCards = gameState[currentPlayer].hand;
  const handWidth = handCards.length * (CARD_WIDTH + 10) - 10;
  const startX = (canvas.width - handWidth) / 2;
  for (let i = 0; i < handCards.length; i++) {
    const card = handCards[i];
    const x = startX + i * (CARD_WIDTH + 10);
    const y = HAND_Y;
    if (mouseX >= x && mouseX <= x + CARD_WIDTH && mouseY >= y && mouseY <= y + CARD_HEIGHT) {
      card.hoverOffset = -30;
      card.hoverRotation = (mouseX - (x + CARD_WIDTH / 2)) * 0.01;
    } else {
      card.hoverOffset = card.hoverOffset * 0.9;
      card.hoverRotation = card.hoverRotation * 0.9;
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  const handCards = gameState[currentPlayer].hand;
  const handWidth = handCards.length * (CARD_WIDTH + 10) - 10;
  const startX = (canvas.width - handWidth) / 2;
  for (let i = handCards.length - 1; i >= 0; i--) {
    const card = handCards[i];
    const x = startX + i * (CARD_WIDTH + 10);
    const y = HAND_Y + card.hoverOffset;
    if (mouseX >= x && mouseX <= x + CARD_WIDTH && mouseY >= y && mouseY <= y + CARD_HEIGHT) {
      draggingCard = card;
      dragOffsetX = mouseX - x;
      dragOffsetY = mouseY - y;
      draggingCard.x = x;
      draggingCard.y = y;
      draggingCard.index = i;
      break;
    }
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (draggingCard) {
    if (mouseY < HAND_Y - 50 && mouseY > BOARD_Y - CARD_HEIGHT) {
      const card = draggingCard;
      
      if (card.cost > gameState[currentPlayer].currentMana) {
        draggingCard = null;
        return;
      }
      
      gameState[currentPlayer].currentMana -= card.cost;
      
      const newMinion = {
        id: card.id,
        name: card.name,
        cost: card.cost,
        attack: card.attack,
        hp: card.hp,
        maxHp: card.hp,
        effect: card.effect,
        faction: card.faction,
        canAttack: false,
        hasTaunt: false,
        hasDivineShield: false,
        hasDeathrattle: false,
        yOffset: 0,
        rotation: 0
      };
      
      effects.applyEffect(gameState, currentPlayer, newMinion, true);
      effects.triggerOnPlay(gameState, currentPlayer, card);
      
      gameState[currentPlayer].board.push(newMinion);
      gameState[currentPlayer].hand.splice(draggingCard.index, 1);
    }
    draggingCard = null;
  }
});

function drawBackground() {
  const bgTexture = textureCache['assets/backgrounds/solaris-bg.png'];
  if (bgTexture) {
    addToBatch(bgTexture, 0, 0, canvas.width, canvas.height);
  }
}

let lastTime = 0;
let time = 0;
function gameLoop(timestamp) {
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;
  time += deltaTime * 0.001;
  render(deltaTime);
  requestAnimationFrame(gameLoop);
}

function drawEnemyBoard() {
  const enemyPlayer = currentPlayer === 'player' ? 'opponent' : 'player';
  const boardCards = gameState[enemyPlayer].board;
  const boardWidth = boardCards.length * (CARD_WIDTH + 15) - 15;
  const startX = (canvas.width - boardWidth) / 2;
  for (let i = 0; i < boardCards.length; i++) {
    const x = startX + i * (CARD_WIDTH + 15);
    const card = boardCards[i];
    const texture = textureCache[`assets/cards/card-${card.id}.png`];
    if (texture) {
      addToBatch(texture, x, ENEMY_HAND_Y, CARD_WIDTH, CARD_HEIGHT);
    }
  }
}

function drawSelectedMinion() {
  if (selectedMinion) {
    const board = gameState[selectedMinion.player].board;
    const minion = board[selectedMinion.minionIndex];
    const boardWidth = board.length * (CARD_WIDTH + 15) - 15;
    const startX = (canvas.width - boardWidth) / 2;
    const x = startX + selectedMinion.minionIndex * (CARD_WIDTH + 15);
    const y = BOARD_Y - CARD_HEIGHT / 2;
    const texture = textureCache['assets/factions/solaris-sigil.png'];
    if (texture) {
      addToBatch(texture, x - 10, y - 10, CARD_WIDTH + 20, CARD_HEIGHT + 20);
    }
  }
}

function drawMinionStats() {
  const board = gameState[currentPlayer].board;
  const boardWidth = board.length * (CARD_WIDTH + 15) - 15;
  const startX = (canvas.width - boardWidth) / 2;
  for (let i = 0; i < board.length; i++) {
    const minion = board[i];
    const x = startX + i * (CARD_WIDTH + 15);
    const y = BOARD_Y - CARD_HEIGHT / 2;
    
    if (minion.hasTaunt) {
      const tauntTexture = textureCache['assets/factions/solaris-frame.png'];
      if (tauntTexture) {
        addToBatch(tauntTexture, x, y, 20, 20);
      }
    }
    
    if (minion.hasDivineShield) {
      const shieldTexture = textureCache['assets/factions/lunara-frame.png'];
      if (shieldTexture) {
        addToBatch(shieldTexture, x + CARD_WIDTH - 20, y, 20, 20);
      }
    }
  }
}

function render(dt) {
  gl.clearColor(0.05, 0.05, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawBackground();
  drawDeck();
  drawEnemyBoard();
  drawBoard();
  drawMinionStats();
  drawSelectedMinion();
  drawHand();
  if (draggingCard) {
    const texture = textureCache[`assets/cards/card-${draggingCard.id}.png`];
    if (texture) {
      addToBatch(texture, draggingCard.x, draggingCard.y, CARD_WIDTH, CARD_HEIGHT, draggingCard.hoverRotation);
    }
  }
  flushBatch();
}

function initGame() {
  gameState.player.manaCap = 1;
  gameState.player.currentMana = 1;
  gameState.opponent.manaCap = 1;
  gameState.opponent.currentMana = 1;
  
  const starterCards = [
    { id: 1, name: 'Light Priest', cost: 2, attack: 1, hp: 3, effect: 'deathrattle', faction: 'light', hoverOffset: 0, hoverRotation: 0 },
    { id: 2, name: 'Light Paladin', cost: 4, attack: 3, hp: 5, effect: 'taunt', faction: 'light', hoverOffset: 0, hoverRotation: 0 },
    { id: 3, name: 'Solar Guardian', cost: 5, attack: 4, hp: 6, effect: 'divineShield', faction: 'light', hoverOffset: 0, hoverRotation: 0 },
    { id: 4, name: 'Shadow Wisp', cost: 1, attack: 1, hp: 1, effect: 'deathrattle', faction: 'shadow', hoverOffset: 0, hoverRotation: 0 },
    { id: 5, name: 'Void Walker', cost: 3, attack: 2, hp: 4, effect: 'taunt', faction: 'shadow', hoverOffset: 0, hoverRotation: 0 }
  ];
  
  gameState.player.hand = [...starterCards];
  gameState.player.deck = Array.from({ length: 15 }, (_, i) => ({
    id: (i % 5) + 1,
    name: ['Light Priest', 'Light Paladin', 'Solar Guardian', 'Shadow Wisp', 'Void Walker'][i % 5],
    cost: [2, 4, 5, 1, 3][i % 5],
    attack: [1, 3, 4, 1, 2][i % 5],
    hp: [3, 5, 6, 1, 4][i % 5],
    effect: ['deathrattle', 'taunt', 'divineShield', 'deathrattle', 'taunt'][i % 5],
    faction: ['light', 'light', 'light', 'shadow', 'shadow'][i % 5],
    hoverOffset: 0,
    hoverRotation: 0
  }));
  
  gameState.opponent.hand = Array.from({ length: 4 }, (_, i) => ({
    id: (i % 5) + 1,
    name: ['Light Priest', 'Light Paladin', 'Solar Guardian', 'Shadow Wisp', 'Void Walker'][i % 5],
    cost: [2, 4, 5, 1, 3][i % 5],
    attack: [1, 3, 4, 1, 2][i % 5],
    hp: [3, 5, 6, 1, 4][i % 5],
    effect: ['deathrattle', 'taunt', 'divineShield', 'deathrattle', 'taunt'][i % 5],
    faction: ['light', 'light', 'light', 'shadow', 'shadow'][i % 5],
    hoverOffset: 0,
    hoverRotation: 0
  }));
  gameState.opponent.deck = Array.from({ length: 16 }, (_, i) => ({
    id: (i % 5) + 1,
    name: ['Light Priest', 'Light Paladin', 'Solar Guardian', 'Shadow Wisp', 'Void Walker'][i % 5],
    cost: [2, 4, 5, 1, 3][i % 5],
    attack: [1, 3, 4, 1, 2][i % 5],
    hp: [3, 5, 6, 1, 4][i % 5],
    effect: ['deathrattle', 'taunt', 'divineShield', 'deathrattle', 'taunt'][i % 5],
    faction: ['light', 'light', 'light', 'shadow', 'shadow'][i % 5],
    hoverOffset: 0,
    hoverRotation: 0
  }));
}

initGame();

let selectedMinion = null;
let targetMinion = null;

function handleMinionClick(player, minionIndex) {
  const board = gameState[player].board;
  const minion = board[minionIndex];
  
  if (player === currentPlayer && effects.canMinionAttack(minion)) {
    selectedMinion = { player, minionIndex };
  } else if (selectedMinion) {
    const targetPlayer = player === 'player' ? 'opponent' : 'player';
    if (player === targetPlayer) {
      if (canAttackTarget(selectedMinion, minion)) {
        executeAttack(selectedMinion, { player, minionIndex });
      }
    }
  }
}

function canAttackTarget(attacker, target) {
  const attackerPlayer = attacker.player;
  const defenderPlayer = target.player;
  
  if (effects.mustAttackTaunt(gameState, attackerPlayer)) {
    const tauntTargets = effects.getTauntTargets(gameState, defenderPlayer);
    return tauntTargets.includes(target);
  }
  return true;
}

function executeAttack(attacker, target) {
  const attackerBoard = gameState[attacker.player].board;
  const targetBoard = gameState[target.player].board;
  
  const attackerMinion = attackerBoard[attacker.minionIndex];
  const targetMinion = targetBoard[target.minionIndex];
  
  let attackerDamage = effects.applyDivineShield(targetMinion, attackerMinion.attack);
  let targetDamage = effects.applyDivineShield(attackerMinion, targetMinion.attack);
  
  attackerMinion.canAttack = false;
  
  if (attackerDamage > 0) {
    targetMinion.hp -= attackerDamage;
  }
  
  if (targetDamage > 0) {
    attackerMinion.hp -= targetDamage;
  }
  
  processDeaths(attacker.player, gameState[attacker.player].board);
  processDeaths(target.player, gameState[target.player].board);
  
  selectedMinion = null;
  targetMinion = null;
}

function processDeaths(player, board) {
  for (let i = board.length - 1; i >= 0; i--) {
    if (board[i].hp <= 0) {
      const deadMinion = board[i];
      effects.triggerOnDeath(gameState, player, deadMinion);
      gameState[player].graveyard.push(deadMinion);
      board.splice(i, 1);
    }
  }
}

canvas.addEventListener('click', (e) => {
  const boardCards = gameState[currentPlayer].board;
  const boardWidth = boardCards.length * (CARD_WIDTH + 15) - 15;
  const startX = (canvas.width - boardWidth) / 2;
  
  for (let i = 0; i < boardCards.length; i++) {
    const x = startX + i * (CARD_WIDTH + 15);
    const y = BOARD_Y - CARD_HEIGHT / 2;
    if (mouseX >= x && mouseX <= x + CARD_WIDTH && mouseY >= y && mouseY <= y + CARD_HEIGHT) {
      handleMinionClick(currentPlayer, i);
      return;
    }
  }
});

function startTurn(player) {
  gameState[player].manaCap = Math.min(gameState[player].manaCap + 1, 10);
  gameState[player].currentMana = gameState[player].manaCap;
  
  gameState[player].board.forEach(minion => {
    minion.canAttack = true;
  });
  
  if (gameState[player].hand.length < 10 && gameState[player].deck.length > 0) {
    gameState[player].hand.push(gameState[player].deck.shift());
  }
}

function switchTurn() {
  currentPlayer = currentPlayer === 'player' ? 'opponent' : 'player';
  startTurn(currentPlayer);
}

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  selectedMinion = null;
  targetMinion = null;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'e') {
    switchTurn();
  }
});

requestAnimationFrame(gameLoop);