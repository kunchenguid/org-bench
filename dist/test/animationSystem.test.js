import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { showDamageNumber } from '../animationSystem.js';
describe('animationSystem', () => {
    let mockDocument;
    let mockElement;
    it.beforeEach(() => {
        mockElement = {
            style: {},
            remove: mock.fn(() => { }),
            classList: { add: mock.fn(() => { }) }
        };
        mockDocument = {
            createElement: mock.fn(() => mockElement),
            body: {
                appendChild: mock.fn(() => { })
            }
        };
        global.document = mockDocument;
    });
    it('showDamageNumber returns timeline', () => {
        const timeline = showDamageNumber(100, 200, 5, 'damage');
        assert.ok(timeline);
        assert.equal(typeof timeline.play, 'function');
        assert.equal(mockDocument.createElement.mock.calls.length, 1);
        assert.equal(mockDocument.body.appendChild.mock.calls.length, 1);
    });
    it('showDamageNumber creates element with correct class', () => {
        showDamageNumber(100, 200, 5, 'damage');
        assert.equal(mockDocument.createElement.mock.calls[0].arguments[0], 'div');
        assert.equal(mockElement.classList.add.mock.calls[0].arguments[0], 'damage-number');
    });
    it('showDamageNumber sets position', () => {
        showDamageNumber(150, 250, 3, 'heal');
        assert.equal(mockElement.style.left, '150px');
        assert.equal(mockElement.style.top, '250px');
    });
});
