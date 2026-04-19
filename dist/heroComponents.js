export function renderPlayerPortrait(playerId) {
    const portrait = document.createElement('div');
    portrait.className = 'hero-portrait player';
    portrait.dataset.playerId = playerId.toString();
    const healthDisplay = document.createElement('div');
    healthDisplay.className = 'health-display';
    healthDisplay.textContent = '30';
    portrait.appendChild(healthDisplay);
    return portrait;
}
export function renderOpponentPortrait(playerId) {
    const portrait = document.createElement('div');
    portrait.className = 'hero-portrait opponent';
    portrait.dataset.playerId = playerId.toString();
    const healthDisplay = document.createElement('div');
    healthDisplay.className = 'health-display';
    healthDisplay.textContent = '30';
    portrait.appendChild(healthDisplay);
    return portrait;
}
export function updatePortraitHealth(portrait, health) {
    const healthDisplay = portrait.querySelector('.health-display');
    if (healthDisplay) {
        healthDisplay.textContent = health.toString();
    }
}
export function createHUDCanvas() {
    const canvas = document.createElement('canvas');
    canvas.className = 'hud-canvas';
    canvas.width = 1280;
    canvas.height = 720;
    return canvas;
}
export function renderManaDisplay(canvas, currentMana, maxMana) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.fillStyle = '#44a';
    ctx.fillRect(20, 20, 100 * (currentMana / maxMana), 20);
}
export function renderTurnIndicator(canvas, playerId) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.fillStyle = '#fff';
    ctx.fillText(`Player ${playerId}'s Turn`, 20, 60);
}
export function hudCanvasHasMana(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return false;
    const imageData = ctx.getImageData(20, 20, 10, 10);
    return imageData.data.some((val, i) => i % 4 === 3 && val > 0);
}
export function hudCanvasHasTurnIndicator(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return false;
    const imageData = ctx.getImageData(20, 50, 100, 20);
    return imageData.data.some((val, i) => i % 4 === 3 && val > 0);
}
export function createDamageCanvas() {
    const canvas = document.createElement('canvas');
    canvas.className = 'damage-canvas';
    canvas.width = 1280;
    canvas.height = 720;
    return canvas;
}
export function renderDamageNumber(canvas, x, y, value) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.fillStyle = '#f00';
    ctx.font = '24px Arial';
    ctx.fillText(`-${value}`, x, y);
}
export function renderHealNumber(canvas, x, y, value) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.fillStyle = '#0f0';
    ctx.font = '24px Arial';
    ctx.fillText(`+${value}`, x, y);
}
export function clearDamageCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}
export function damageCanvasHasNumber(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return false;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return imageData.data.some((val, i) => i % 4 === 3 && val > 0);
}
export function damageCanvasIsEmpty(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return true;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return !imageData.data.some((val, i) => i % 4 === 3 && val > 0);
}
export function createTurnBanner() {
    const banner = document.createElement('div');
    banner.className = 'turn-banner';
    banner.style.display = 'none';
    return banner;
}
export function updateTurnBanner(banner, playerId) {
    banner.textContent = `Player ${playerId}'s Turn`;
}
export function showTurnBanner(banner, playerId) {
    banner.textContent = `Player ${playerId}'s Turn`;
    banner.style.display = 'flex';
}
export function hideTurnBanner(banner) {
    banner.style.display = 'none';
}
export function createEndTurnButton(callback) {
    const button = document.createElement('button');
    button.className = 'end-turn-button';
    button.textContent = 'End Turn';
    if (callback) {
        button.addEventListener('click', callback);
    }
    return button;
}
export function setEndTurnButtonDisabled(button, disabled) {
    button.disabled = disabled;
}
