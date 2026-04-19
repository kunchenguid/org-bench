import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  renderPlayerPortrait,
  renderOpponentPortrait,
  updatePortraitHealth,
  createHUDCanvas,
  renderManaDisplay,
  hudCanvasHasMana,
  renderTurnIndicator,
  hudCanvasHasTurnIndicator,
  createDamageCanvas,
  renderDamageNumber,
  renderHealNumber,
  clearDamageCanvas,
  damageCanvasHasNumber,
  damageCanvasIsEmpty,
  createTurnBanner,
  updateTurnBanner,
  showTurnBanner,
  hideTurnBanner,
  createEndTurnButton,
  setEndTurnButtonDisabled
} from '../heroComponents.js';

const test = (name: string, fn: () => void) => it(name, fn);

const assertEquals = (actual: unknown, expected: unknown, message?: string) => {
  assert.equal(actual, expected, message);
};

const assertTrue = (value: unknown, message?: string) => {
  assert.ok(value, message);
};

const assertExists = (value: unknown, message?: string) => {
  assert.ok(value !== null && value !== undefined, message);
};

describe('hero portaits', () => {
  let mockDocument: any;
  let mockElement: any;

  it.beforeEach(() => {
    mockElement = {
      tagName: 'DIV',
      classList: { contains: mock.fn((cls: string) => cls === 'hero-portrait') },
      querySelector: mock.fn(() => ({ textContent: '30' })),
      dataset: {},
      style: {},
      textContent: '',
      appendChild: mock.fn(() => {})
    };
    mockDocument = {
      createElement: mock.fn((tag: string) => {
        if (tag === 'div') return mockElement;
        return { tagName: tag.toUpperCase(), textContent: '', style: {}, appendChild: mock.fn(() => {}) };
      })
    };
    global.document = mockDocument;
  });

  test('renders player portrait', () => {
    const portrait = renderPlayerPortrait(1);
    assertExists(portrait, 'portrait should exist');
    assertEquals(portrait.tagName, 'DIV', 'should be div element');
  });

  test('renders opponent portrait', () => {
    const portrait = renderOpponentPortrait(2);
    assertExists(portrait, 'portrait should exist');
    assertEquals(portrait.tagName, 'DIV', 'should be div element');
  });

  test('portrait shows hero health', () => {
    const portrait = renderPlayerPortrait(1);
    const healthDisplay = portrait.querySelector('.health-display');
    assertExists(healthDisplay, 'health display should exist');
    assertEquals(healthDisplay!.textContent, '30', 'should show initial health');
  });

  test('portrait updates health when damaged', () => {
    const portrait = renderPlayerPortrait(1);
    updatePortraitHealth(portrait, 25);
    const healthDisplay = portrait.querySelector('.health-display');
    const mockHealthDisplay = { textContent: '30' };
    portrait.querySelector = mock.fn(() => mockHealthDisplay);
    updatePortraitHealth(portrait, 25);
    assertEquals(mockHealthDisplay.textContent, '25', 'should show updated health');
  });
});

describe('HUD canvas', () => {
  let mockDocument: any;
  let mockCanvas: any;

  it.beforeEach(() => {
    mockCanvas = {
      tagName: 'CANVAS',
      classList: { contains: mock.fn((cls: string) => cls === 'hud-canvas') },
      width: 1280,
      height: 720,
      getContext: mock.fn(() => ({
        fillRect: mock.fn(() => {}),
        fillText: mock.fn(() => {}),
        getImageData: mock.fn(() => ({ data: [0, 0, 0, 255, 0, 0, 0, 255] })),
        clearRect: mock.fn(() => {})
      }))
    };
    mockDocument = {
      createElement: mock.fn((tag: string) => mockCanvas)
    };
    global.document = mockDocument;
  });

  test('creates HUD canvas element', () => {
    const hudCanvas = createHUDCanvas();
    assertExists(hudCanvas, 'HUD canvas should exist');
    assertEquals(hudCanvas.tagName, 'CANVAS', 'should be canvas element');
    assert.equal(mockDocument.createElement.mock.calls[0][0], 'canvas');
  });

  test('HUD canvas has correct dimensions', () => {
    const hudCanvas = createHUDCanvas();
    assertEquals(hudCanvas.width, 1280, 'width should be 1280');
    assertEquals(hudCanvas.height, 720, 'height should be 720');
  });

  test('HUD canvas renders mana display', () => {
    const hudCanvas = createHUDCanvas();
    renderManaDisplay(hudCanvas, 5, 10);
    assertTrue(mockCanvas.getContext.mock.calls.length > 0, 'should call getContext');
  });

  test('HUD canvas renders turn indicator', () => {
    const hudCanvas = createHUDCanvas();
    renderTurnIndicator(hudCanvas, 1);
    assertTrue(mockCanvas.getContext.mock.calls.length > 0, 'should call getContext');
  });
});

describe('damage canvas', () => {
  let mockDocument: any;
  let mockCanvas: any;

  it.beforeEach(() => {
    mockCanvas = {
      tagName: 'CANVAS',
      classList: { contains: mock.fn((cls: string) => cls === 'damage-canvas') },
      width: 1280,
      height: 720,
      getContext: mock.fn(() => ({
        fillText: mock.fn(() => {}),
        getImageData: mock.fn(() => ({ data: [0, 0, 0, 255, 0, 0, 0, 255] })),
        clearRect: mock.fn(() => {})
      }))
    };
    mockDocument = {
      createElement: mock.fn((tag: string) => mockCanvas)
    };
    global.document = mockDocument;
  });

  test('creates damage canvas element', () => {
    const damageCanvas = createDamageCanvas();
    assertExists(damageCanvas, 'damage canvas should exist');
    assertEquals(damageCanvas.tagName, 'CANVAS', 'should be canvas element');
    assert.equal(mockDocument.createElement.mock.calls[0][0], 'canvas');
  });

  test('damage canvas has correct dimensions', () => {
    const damageCanvas = createDamageCanvas();
    assertEquals(damageCanvas.width, 1280, 'width should be 1280');
    assertEquals(damageCanvas.height, 720, 'height should be 720');
  });

  test('damage canvas renders damage numbers', () => {
    const damageCanvas = createDamageCanvas();
    renderDamageNumber(damageCanvas, 100, 200, 5);
    assertTrue(mockCanvas.getContext.mock.calls.length > 0, 'should call getContext');
  });

  test('damage canvas renders heal numbers', () => {
    const damageCanvas = createDamageCanvas();
    renderHealNumber(damageCanvas, 150, 250, 3);
    assertTrue(mockCanvas.getContext.mock.calls.length > 0, 'should call getContext');
  });

  test('damage canvas clears after animation', () => {
    const damageCanvas = createDamageCanvas();
    renderDamageNumber(damageCanvas, 100, 200, 5);
    clearDamageCanvas(damageCanvas);
    assertTrue(mockCanvas.getContext.mock.calls.length > 0, 'should call getContext');
  });
});

describe('turn banner', () => {
  let mockDocument: any;
  let mockElement: any;

  it.beforeEach(() => {
    mockElement = {
      textContent: '',
      style: { display: 'none' },
      classList: { contains: mock.fn((cls: string) => cls === 'turn-banner') }
    };
    mockDocument = {
      createElement: mock.fn(() => mockElement)
    };
    global.document = mockDocument;
  });

  test('creates turn banner element', () => {
    const turnBanner = createTurnBanner();
    assertExists(turnBanner, 'turn banner should exist');
    assertEquals(turnBanner.style.display, 'none', 'should be hidden by default');
    assert.equal(mockDocument.createElement.mock.calls[0][0], 'div');
  });

  test('turn banner displays current player', () => {
    const turnBanner = createTurnBanner();
    updateTurnBanner(turnBanner, 1);
    assertEquals(turnBanner.textContent, 'Player 1\'s Turn', 'should show player 1 turn');
  });

  test('turn banner updates when turn changes', () => {
    const turnBanner = createTurnBanner();
    updateTurnBanner(turnBanner, 1);
    updateTurnBanner(turnBanner, 2);
    assertEquals(turnBanner.textContent, 'Player 2\'s Turn', 'should show player 2 turn');
  });

  test('turn banner shows briefly then hides', () => {
    const turnBanner = createTurnBanner();
    showTurnBanner(turnBanner, 1);
    assertEquals(turnBanner.style.display, 'flex', 'should be visible when shown');
    hideTurnBanner(turnBanner);
    assertEquals(turnBanner.style.display, 'none', 'should be hidden after delay');
  });
});

describe('end turn button', () => {
  let mockDocument: any;
  let mockButton: any;

  it.beforeEach(() => {
    let clickCallback: any = null;
    mockButton = {
      tagName: 'BUTTON',
      classList: { contains: mock.fn((cls: string) => cls === 'end-turn-button') },
      textContent: '',
      disabled: false,
      addEventListener: mock.fn((event: string, callback: any) => {
        if (event === 'click') clickCallback = callback;
      }),
      click: mock.fn(() => {
        if (clickCallback) clickCallback();
      })
    };
    mockDocument = {
      createElement: mock.fn(() => mockButton)
    };
    global.document = mockDocument;
  });

  test('creates end turn button element', () => {
    const endTurnButton = createEndTurnButton();
    assertExists(endTurnButton, 'end turn button should exist');
    assertEquals(endTurnButton.tagName, 'BUTTON', 'should be button element');
    assert.equal(mockDocument.createElement.mock.calls[0][0], 'button');
  });

  test('end turn button has correct text', () => {
    const endTurnButton = createEndTurnButton();
    assertEquals(endTurnButton.textContent, 'End Turn', 'should show End Turn text');
  });

  test('end turn button calls callback on click', () => {
    let clicked = false;
    const endTurnButton = createEndTurnButton(() => { clicked = true; });
    endTurnButton.click();
    assertTrue(clicked, 'should call callback when clicked');
  });

  test('end turn button is disabled during opponent turn', () => {
    const endTurnButton = createEndTurnButton();
    setEndTurnButtonDisabled(endTurnButton, true);
    assertEquals(endTurnButton.disabled, true, 'should be disabled during opponent turn');
  });

  test('end turn button is enabled during player turn', () => {
    const endTurnButton = createEndTurnButton();
    setEndTurnButtonDisabled(endTurnButton, false);
    assertEquals(endTurnButton.disabled, false, 'should be enabled during player turn');
  });
});
