/**
 * Drawing Canvas Component
 * Canvas for drawing annotations on top of a captured screenshot
 *
 * NEW APPROACH: Screenshot is captured BEFORE drawing, user annotates on top
 *
 * Specifications:
 * - Screenshot displayed as canvas background
 * - 2px stroke width for annotations
 * - Red or yellow default color (configurable)
 * - Undo, Clear, Done buttons
 * - Final output = screenshot + annotations in single canvas
 */

import { CONFIG } from '../config.js';
import { createElement, dispatchCustomEvent } from '../utils/dom.js';
import { generateThumbnail } from '../utils/screenshot.js';

class DrawingCanvas {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.toolbar = null;

    this.isDrawing = false;
    this.paths = []; // Store paths for undo
    this.currentPath = [];

    this.strokeColor = CONFIG.DRAWING.defaultColor;
    this.strokeWidth = CONFIG.DRAWING.strokeWidth;

    this.onDone = null;
    this.onCancel = null;

    // NEW: Store screenshot data
    this.screenshotData = null;
    this.screenshotImage = null;
  }

  /**
   * Create and show the drawing canvas with screenshot background
   * @param {Function} onDoneCallback - Callback when done drawing
   * @param {Function} onCancelCallback - Callback when cancelled
   * @param {ShadowRoot} shadowRoot - Shadow root to append the canvas to
   * @param {Object} screenshotData - Screenshot data (dataURL and metadata)
   */
  async create(onDoneCallback, onCancelCallback, shadowRoot = document.body, screenshotData = null) {
    if (this.container) {
      return; // Already created
    }

    this.onDone = onDoneCallback;
    this.onCancel = onCancelCallback;
    this.screenshotData = screenshotData;

    // Create container
    this.container = createElement('div', `${CONFIG.CLASS_PREFIX}drawing-container`);

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = `${CONFIG.CLASS_PREFIX}drawing-canvas`;

    // Set canvas size to full viewport with device pixel ratio support
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);

    // NEW: Draw screenshot as background if provided
    if (screenshotData && screenshotData.dataURL) {
      await this._drawScreenshotBackground(screenshotData.dataURL);
    }

    // Set drawing properties for annotations
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Create toolbar
    this._createToolbar();

    // Append to container
    this.container.appendChild(this.canvas);
    this.container.appendChild(this.toolbar);

    // Attach events
    this._attachEventListeners();

    // Append to shadow root
    shadowRoot.appendChild(this.container);

    // Show with animation
    requestAnimationFrame(() => {
      this.container.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    return this.container;
  }


  /**
   * Create toolbar with drawing controls
   */
  _createToolbar() {
    this.toolbar = createElement('div', `${CONFIG.CLASS_PREFIX}drawing-toolbar`);

    this.toolbar.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}drawing-controls">
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-undo" aria-label="Undo">
          <svg viewBox="0 0 24 24">
            <path d="M9 14L4 9l5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 9h12.5a5.5 5.5 0 1 1 0 11H11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Undo
        </button>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-clear" aria-label="Clear all">
          <svg viewBox="0 0 24 24">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6"
                  stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Clear
        </button>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-done" aria-label="Finish drawing">
          <svg viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Done
        </button>
      </div>
    `;

    // Attach toolbar events
    const undoBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-undo`);
    const clearBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-clear`);
    const doneBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-done`);

    undoBtn.addEventListener('click', () => this.undo());
    clearBtn.addEventListener('click', () => this.clear());
    doneBtn.addEventListener('click', () => this._handleDone());
  }

  /**
   * Attach event listeners for drawing
   */
  _attachEventListeners() {
    // Mouse events
    this.canvas.addEventListener('pointerdown', (e) => this._startDrawing(e));
    this.canvas.addEventListener('pointermove', (e) => this._draw(e));
    this.canvas.addEventListener('pointerup', (e) => this._stopDrawing(e));
    this.canvas.addEventListener('pointercancel', (e) => this._stopDrawing(e));

    // Prevent default touch behaviors
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        e.preventDefault(); // Prevent scrolling on single touch
      }
    }, { passive: false });

    // Allow scroll with mouse wheel
    this.canvas.addEventListener('wheel', (e) => {
      // Let scroll events pass through
    }, { passive: true });

    // Handle window resize
    this.resizeHandler = () => this._handleResize();
    window.addEventListener('resize', this.resizeHandler);
  }

  /**
   * Start drawing
   */
  _startDrawing(event) {
    // Ignore multi-touch (allow two-finger scroll)
    if (event.pointerType === 'touch' && event.isPrimary === false) {
      return;
    }

    this.isDrawing = true;
    this.currentPath = [];

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Debug: Log first drawing point
    if (this.paths.length === 0) {
      console.log('[Tapko Drawing] Canvas bounding rect:', {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      });
      console.log('[Tapko Drawing] Event coords:', {
        clientX: event.clientX,
        clientY: event.clientY,
        calculated: { x, y }
      });
    }

    this.currentPath.push({ x, y });

    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  /**
   * Draw on canvas
   */
  _draw(event) {
    if (!this.isDrawing) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.currentPath.push({ x, y });

    this.ctx.lineTo(x, y);
    this.ctx.stroke();
  }

  /**
   * Stop drawing
   */
  _stopDrawing(event) {
    if (!this.isDrawing) return;

    this.isDrawing = false;

    // Save current path to history
    if (this.currentPath.length > 0) {
      this.paths.push([...this.currentPath]);
      this.currentPath = [];
    }
  }

  /**
   * Undo last path
   */
  undo() {
    if (this.paths.length === 0) return;

    this.paths.pop();
    this._redraw();

    dispatchCustomEvent(CONFIG.EVENTS.DRAWING_UNDO);
  }

  /**
   * Clear all drawings (keep screenshot background)
   */
  clear() {
    this.paths = [];
    this.currentPath = [];
    this._redraw();

    dispatchCustomEvent(CONFIG.EVENTS.DRAWING_CLEARED);
  }

  /**
   * Redraw canvas (screenshot + all paths)
   */
  _redraw() {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Redraw screenshot background first
    if (this.screenshotImage) {
      this.ctx.drawImage(this.screenshotImage, 0, 0, window.innerWidth, window.innerHeight);
    }

    // Redraw all annotation paths
    this.paths.forEach(path => {
      if (path.length === 0) return;

      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);

      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }

      this.ctx.stroke();
    });
  }

  /**
   * Handle resize event
   */
  _handleResize() {
    if (!this.ctx || !this.canvas) return;

    const oldCanvas = this.canvas;
    // Safety check just in case
    try {
      const oldImageData = this.ctx.getImageData(0, 0, oldCanvas.width, oldCanvas.height);

      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.width = `${window.innerWidth}px`;
      this.canvas.style.height = `${window.innerHeight}px`;

      this.ctx.scale(dpr, dpr);
      this.ctx.strokeStyle = this.strokeColor;
      this.ctx.lineWidth = this.strokeWidth;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      // Redraw
      this._redraw();
    } catch (e) {
      console.warn('[Tapko] Error handling resize:', e);
    }
  }

  /**
   * Handle done button click
   * Returns the canvas directly (already contains screenshot + annotations)
   */
  async _handleDone() {
    const doneBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-done`);

    try {
      // Show loading state
      if (doneBtn) {
        doneBtn.disabled = true;
        doneBtn.innerHTML = `
          <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}spinner">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
            <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
          </svg>
          Generating thumbnail...
        `;
      }

      // The canvas already contains screenshot + annotations!
      // Just convert it to data URL
      const finalScreenshot = this.canvas.toDataURL('image/jpeg', 0.85);

      // Generate thumbnail
      const thumbnail = await generateThumbnail(finalScreenshot);

      // Return everything via callback
      if (this.onDone) {
        this.onDone({
          finalScreenshot: finalScreenshot,  // Canvas with screenshot + annotations
          thumbnail: thumbnail,
          metadata: {
            ...this.screenshotData?.metadata,
            hasAnnotations: this.paths.length > 0,
            annotationCount: this.paths.length
          }
        });
      }

      dispatchCustomEvent(CONFIG.EVENTS.DRAWING_COMPLETED, {
        hasAnnotations: this.paths.length > 0,
        annotationCount: this.paths.length
      });

      console.log('[Tapko] Drawing complete, screenshot + annotations ready');

    } catch (error) {
      console.error('[Tapko] Failed to process drawing:', error);

      // Reset button state
      if (doneBtn) {
        doneBtn.disabled = false;
        doneBtn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Done
        `;
      }

      // Show error to user
      alert('Failed to process drawing. Please try again.');
    }
  }

  /**
   * Draw the screenshot as the background of the drawing canvas
   */
  async _drawScreenshotBackground(dataURL) {
    if (!dataURL) return;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        console.log('[Tapko] Drawing screenshot background:', img.width, 'x', img.height);

        // Save current context state
        this.ctx.save();

        // Draw the high-res screenshot to fill the viewport
        // The context is already scaled by DPR, so we draw at CSS dimensions
        this.ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);

        this.ctx.restore();

        // Store image for redrawing on resize
        this.screenshotImage = img;

        resolve();
      };
      img.onerror = (err) => {
        console.error('[Tapko] Failed to load screenshot image for background:', err);
        resolve();
      };
      img.src = dataURL;
    });
  }

  /**
   * Get drawing data as data URL
   */
  getDrawingData() {
    if (this.paths.length === 0) {
      return null;
    }

    return {
      dataURL: this.canvas.toDataURL('image/png'),
      width: this.canvas.width,
      height: this.canvas.height,
      paths: this.paths
    };
  }

  /**
   * Check if canvas has any drawings
   */
  hasDrawing() {
    return this.paths.length > 0;
  }

  /**
   * Hide the canvas
   */
  hide() {
    if (this.container) {
      this.container.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Show the canvas
   */
  show() {
    if (this.container) {
      this.container.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Remove the canvas
   */
  destroy() {
    if (this.container) {
      this.container.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);

      // Cleanup resize listener immediately
      if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler);
        this.resizeHandler = null;
      }

      setTimeout(() => {
        if (this.container && this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.toolbar = null;
        this.paths = [];
        this.currentPath = [];
      }, CONFIG.UI.animationDuration);
    }
  }
}

export { DrawingCanvas };
