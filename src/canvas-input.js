class CanvasInputController {
  constructor(options) {
    this.canvas = options.canvas;
    this.getRegions = options.getRegions || (() => []);
    this.onEvent = options.onEvent || (() => {});
    this.dragThreshold = options.dragThreshold || 12;
    this.hoveredRegionId = null;
    this.activePointerId = null;
    this.pressedRegionId = null;
    this.pressPoint = null;
    this.dragging = false;
    this.lastPoint = null;

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
  }

  destroy() {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
  }

  getRegionAt(point) {
    const regions = this.getRegions().filter((region) => region && region.visible !== false && region.enabled !== false);
    let topRegion = null;
    for (const region of regions) {
      if (!containsPoint(region, point)) {
        continue;
      }
      if (!topRegion || (region.zIndex || 0) >= (topRegion.zIndex || 0)) {
        topRegion = region;
      }
    }
    return topRegion;
  }

  handlePointerMove(event) {
    const point = this.toCanvasPoint(event);
    const hoveredRegion = this.getRegionAt(point);
    this.updateHover(hoveredRegion, point);

    if (this.activePointerId !== event.pointerId || !this.pressPoint || !this.pressedRegionId) {
      return;
    }

    const distance = Math.hypot(point.x - this.pressPoint.x, point.y - this.pressPoint.y);
    if (!this.dragging && distance >= this.dragThreshold) {
      this.dragging = true;
      this.emit('dragstart', this.pressedRegionId, point);
    }

    if (this.dragging) {
      this.emit('dragmove', this.pressedRegionId, point);
    }
  }

  handlePointerDown(event) {
    const point = this.toCanvasPoint(event);
    const region = this.getRegionAt(point);
    this.activePointerId = event.pointerId;
    this.pressPoint = point;
    this.pressedRegionId = region ? region.id : null;
    this.dragging = false;
    this.emit('pointerdown', this.pressedRegionId, point);
  }

  handlePointerUp(event) {
    const point = this.toCanvasPoint(event);
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    this.emit('pointerup', this.pressedRegionId, point);
    if (this.dragging && this.pressedRegionId) {
      this.emit('dragend', this.pressedRegionId, point);
    } else {
      const region = this.getRegionAt(point);
      if (region && region.id === this.pressedRegionId) {
        this.emit('click', region.id, point);
      }
    }

    this.activePointerId = null;
    this.pressedRegionId = null;
    this.pressPoint = null;
    this.dragging = false;
  }

  updateHover(region, point) {
    const nextRegionId = region ? region.id : null;
    if (nextRegionId === this.hoveredRegionId) {
      this.lastPoint = point;
      return;
    }

    if (this.hoveredRegionId) {
      this.emit('hoverend', this.hoveredRegionId, point);
    }
    this.hoveredRegionId = nextRegionId;
    this.lastPoint = point;
    if (this.hoveredRegionId) {
      this.emit('hoverstart', this.hoveredRegionId, point);
    }
  }

  toCanvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    return { x, y };
  }

  emit(type, regionId, point) {
    this.onEvent({ type, regionId, point });
  }
}

function containsPoint(region, point) {
  if (typeof region.contains === 'function') {
    return region.contains(point);
  }
  return point.x >= region.x && point.x <= region.x + region.width && point.y >= region.y && point.y <= region.y + region.height;
}

module.exports = {
  CanvasInputController,
};
