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
    this.paths = []; // Store paths for undo (now includes shapes)
    this.currentPath = [];

    this.strokeColor = CONFIG.DRAWING.defaultColor;
    this.strokeWidth = CONFIG.DRAWING.strokeWidth;

    this.onDone = null;
    this.onCancel = null;
    this.onTap = null; // NEW: Callback for placing comments

    // NEW: Store screenshot data
    this.screenshotData = null;
    this.screenshotImage = null;

    // Tap detection properties
    this.pressStartTime = 0;
    this.pressStartX = 0;
    this.pressStartY = 0;
    this.isStroke = false; // Distinguish between tap and drawing stroke

    // NEW: Tool selection (pen, ellipse, rectangle, arrow, text)
    this.currentTool = 'pen'; // Default to pen tool
    this.shapeStartX = 0;
    this.shapeStartY = 0;
    this.previewShape = null; // Store preview shape while dragging

    // Text tool properties
    this.textInput = null;
    this.textInputActive = false;
    this.textX = 0;
    this.textY = 0;
  }

  /**
   * Create and show the drawing canvas with screenshot background
   * @param {Function} onDoneCallback - Callback when done drawing
   * @param {Function} onCancelCallback - Callback when cancelled
   * @param {ShadowRoot} shadowRoot - Shadow root to append the canvas to
   * @param {Object} screenshotData - Screenshot data (dataURL and metadata)
   * @param {Function} onTapCallback - Callback when user taps to place a comment
   * @param {Object} existingAnnotations - Existing annotation data to restore (optional)
   */
  async create(onDoneCallback, onCancelCallback, shadowRoot = document.body, screenshotData = null, onTapCallback = null, existingAnnotations = null) {
    if (this.container) {
      return; // Already created
    }

    console.log('[Tapko DrawingCanvas] create() called with:', {
      hasScreenshotData: !!screenshotData,
      hasExistingAnnotations: !!existingAnnotations,
      existingAnnotationsPathCount: existingAnnotations?.paths?.length,
      existingAnnotations: existingAnnotations
    });

    this.onDone = onDoneCallback;
    this.onCancel = onCancelCallback;
    this.onTap = onTapCallback;
    this.screenshotData = screenshotData;

    // Create container
    this.container = createElement('div', `${CONFIG.CLASS_PREFIX}drawing-container`);

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = `${CONFIG.CLASS_PREFIX}drawing-canvas`;

    // Set canvas size to 90% of viewport to match CSS
    // Use DPR of 1 to minimize memory usage and prevent crashes
    const dpr = 1; // Force DPR to 1 for memory efficiency
    const canvasWidth = window.innerWidth * 0.9;
    const canvasHeight = window.innerHeight * 0.9;

    this.canvas.width = canvasWidth * dpr;
    this.canvas.height = canvasHeight * dpr;
    this.canvas.style.width = `${canvasWidth}px`;
    this.canvas.style.height = `${canvasHeight}px`;

    console.log('[Tapko] Canvas created:', this.canvas.width, 'x', this.canvas.height, 'Memory-safe mode (DPR=1)');

    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);

    // NEW: Draw screenshot as background if provided
    if (screenshotData && screenshotData.dataURL) {
      try {
        await this._drawScreenshotBackground(screenshotData.dataURL);
      } catch (error) {
        console.error('[Tapko] Failed to load screenshot background:', error);
        // Continue anyway - user can still draw without background
        alert('Failed to load screenshot. You can still annotate, but the background may be missing.');
      }
    }

    // NEW: Restore existing annotations if provided (reopening scenario)
    if (existingAnnotations && existingAnnotations.paths) {
      console.log('[Tapko] Restoring', existingAnnotations.paths.length, 'existing annotations');
      this.paths = JSON.parse(JSON.stringify(existingAnnotations.paths)); // Deep copy to prevent mutations
      if (existingAnnotations.strokeColor) {
        this.strokeColor = existingAnnotations.strokeColor;
      }
      if (existingAnnotations.strokeWidth) {
        this.strokeWidth = existingAnnotations.strokeWidth;
      }
    }

    // Set drawing properties for annotations
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // NEW: Redraw existing annotations if any were restored
    if (existingAnnotations && existingAnnotations.paths && existingAnnotations.paths.length > 0) {
      this._redraw();
    }

    // Create toolbar
    this._createToolbar();

    // NEW: Add "Clear All" button if reopening with existing annotations
    if (existingAnnotations && existingAnnotations.paths && existingAnnotations.paths.length > 0) {
      this._addClearAllButton();
    }

    // Create instructions bubble
    this._createInstructions();

    // Append to container
    this.container.appendChild(this.canvas);
    this.container.appendChild(this.toolbar);
    this.container.appendChild(this.instructions);

    // Attach events
    this._attachEventListeners();

    // Append to shadow root
    shadowRoot.appendChild(this.container);

    // Show with animation
    requestAnimationFrame(() => {
      this.container.classList.add(`${CONFIG.CLASS_PREFIX}visible`);

      // Show instructions with a delay
      setTimeout(() => {
        if (this.instructions) {
          this.instructions.classList.add(`${CONFIG.CLASS_PREFIX}visible`);

          // Auto-hide after 5 seconds
          setTimeout(() => {
            if (this.instructions) {
              this.instructions.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
            }
          }, 5000);
        }
      }, 500);
    });

    return this.container;
  }


  _createToolbar() {
    this.toolbar = createElement('div', `${CONFIG.CLASS_PREFIX}drawing-toolbar`);

    this.toolbar.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}drawing-controls">
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-cancel" aria-label="Cancel">
          <svg viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Exit
        </button>
        <div class="${CONFIG.CLASS_PREFIX}drawing-divider"></div>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-tool ${CONFIG.CLASS_PREFIX}btn-tool-pen ${CONFIG.CLASS_PREFIX}active" data-tool="pen" aria-label="Pen tool">
          <svg viewBox="0 0 24 24">
            <path d="M12 19l7-7 3 3-7 7-3-3z" stroke="currentColor" stroke-width="2" fill="none"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" stroke="currentColor" stroke-width="2" fill="none"/>
            <path d="M2 2l7.586 7.586" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-tool ${CONFIG.CLASS_PREFIX}btn-tool-ellipse" data-tool="ellipse" aria-label="Ellipse tool">
          <svg viewBox="0 0 24 24">
            <ellipse cx="12" cy="12" rx="9" ry="6" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-tool ${CONFIG.CLASS_PREFIX}btn-tool-rectangle" data-tool="rectangle" aria-label="Rectangle tool">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="6" width="16" height="12" stroke="currentColor" stroke-width="2" fill="none" rx="1"/>
          </svg>
        </button>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-tool ${CONFIG.CLASS_PREFIX}btn-tool-arrow" data-tool="arrow" aria-label="Arrow tool">
          <svg viewBox="0 0 24 24">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-tool ${CONFIG.CLASS_PREFIX}btn-tool-text" data-tool="text" aria-label="Text tool">
          <svg viewBox="0 0 24 24">
            <path d="M4 7V4h16v3M9 20h6M12 4v16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="${CONFIG.CLASS_PREFIX}drawing-divider"></div>
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
        <div class="${CONFIG.CLASS_PREFIX}drawing-divider"></div>
        <button type="button" class="${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-done" aria-label="Done">
          <svg viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Done
        </button>
      </div>
    `;

    // Attach toolbar events
    const cancelBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-cancel`);
    const undoBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-undo`);
    const clearBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-clear`);
    const doneBtn = this.toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-done`);

    cancelBtn.addEventListener('click', () => {
      this._handleCancel();
    });
    undoBtn.addEventListener('click', () => this.undo());
    clearBtn.addEventListener('click', () => this.clear());
    doneBtn.addEventListener('click', () => this._handleDone());

    // Attach tool selection events
    const toolButtons = this.toolbar.querySelectorAll(`.${CONFIG.CLASS_PREFIX}btn-tool`);
    toolButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = btn.getAttribute('data-tool');
        this._selectTool(tool);
      });
    });
  }

  /**
   * Select drawing tool
   */
  _selectTool(tool) {
    this.currentTool = tool;

    // Update button states
    const toolButtons = this.toolbar.querySelectorAll(`.${CONFIG.CLASS_PREFIX}btn-tool`);
    toolButtons.forEach(btn => {
      if (btn.getAttribute('data-tool') === tool) {
        btn.classList.add(`${CONFIG.CLASS_PREFIX}active`);
      } else {
        btn.classList.remove(`${CONFIG.CLASS_PREFIX}active`);
      }
    });

    console.log('[Tapko] Tool selected:', tool);
  }

  /**
   * Add "Clear All" button when reopening with existing annotations
   */
  _addClearAllButton() {
    const toolbar = this.toolbar;
    if (!toolbar || toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}btn-clear-all`)) {
      return; // Already exists
    }

    // Create clear all button
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = `${CONFIG.CLASS_PREFIX}drawing-btn ${CONFIG.CLASS_PREFIX}btn-clear-all`;
    clearAllBtn.setAttribute('aria-label', 'Clear all annotations');
    clearAllBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6M10 11v6M14 11v6"
              stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Clear All
    `;

    // Add event listener
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Clear all annotations? This cannot be undone.')) {
        this.paths = [];
        this.currentPath = [];
        this._redraw();
        // Remove the button after clearing
        clearAllBtn.remove();
        console.log('[Tapko] All annotations cleared');
      }
    });

    // Insert before the last divider (after Clear button)
    const controls = toolbar.querySelector(`.${CONFIG.CLASS_PREFIX}drawing-controls`);
    if (controls) {
      controls.appendChild(clearAllBtn);
    }
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

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Text tool: show text input on click
    if (this.currentTool === 'text') {
      this.isDrawing = false; // Don't enter drawing mode for text
      this._showTextInput(x, y);
      return;
    }

    this.isDrawing = true;
    this.isStroke = false;
    this.currentPath = [];

    this.pressStartTime = Date.now();
    this.pressStartX = event.clientX;
    this.pressStartY = event.clientY;

    if (this.currentTool === 'pen') {
      // Pen tool: start path
      this.currentPath.push({ x, y });
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
    } else {
      // Shape tools: store start position
      this.shapeStartX = x;
      this.shapeStartY = y;
      this.previewShape = { type: this.currentTool, startX: x, startY: y, endX: x, endY: y };
    }
  }

  /**
   * Draw on canvas
   */
  _draw(event) {
    if (!this.isDrawing) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // If moved significantly, consider it a stroke, not a tap
    if (!this.isStroke) {
      const dist = Math.sqrt(Math.pow(event.clientX - this.pressStartX, 2) + Math.pow(event.clientY - this.pressStartY, 2));
      if (dist > 5) {
        this.isStroke = true;
      }
    }

    if (this.currentTool === 'pen') {
      // Pen tool: continue drawing path
      this.currentPath.push({ x, y });
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
    } else {
      // Shape tools: update preview
      this.previewShape.endX = x;
      this.previewShape.endY = y;

      // Redraw canvas with preview
      this._redrawWithPreview();
    }
  }

  /**
   * Stop drawing
   */
  _stopDrawing(event) {
    if (!this.isDrawing) return;

    this.isDrawing = false;

    const duration = Date.now() - this.pressStartTime;
    const dist = Math.sqrt(Math.pow(event.clientX - this.pressStartX, 2) + Math.pow(event.clientY - this.pressStartY, 2));

    // If it was a quick tap without much movement, trigger the onTap callback
    if (!this.isStroke && duration < 300 && dist < 10) {
      if (this.onTap) {
        this.onTap({ x: event.clientX, y: event.clientY });
      }
      this.currentPath = [];
      this.previewShape = null;
      this._redraw(); // Clean up the point we started drawing
      return;
    }

    if (this.currentTool === 'pen') {
      // Save current path to history
      if (this.currentPath.length > 0) {
        this.paths.push({ type: 'path', data: [...this.currentPath] });
        this.currentPath = [];
      }
    } else {
      // Save shape to history
      if (this.previewShape) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        this.paths.push({
          type: this.currentTool,
          startX: this.shapeStartX,
          startY: this.shapeStartY,
          endX: x,
          endY: y
        });

        this.previewShape = null;
        this._redraw();
      }
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
   * Redraw canvas (screenshot + all paths and shapes)
   */
  _redraw() {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Redraw screenshot background first
    if (this.screenshotImage) {
      const canvasWidth = window.innerWidth * 0.9;
      const canvasHeight = window.innerHeight * 0.9;
      this.ctx.drawImage(this.screenshotImage, 0, 0, canvasWidth, canvasHeight);
    }

    // Redraw all annotation paths and shapes
    this.paths.forEach(item => {
      if (item.type === 'path') {
        // Draw freehand path
        const path = item.data;
        if (path.length === 0) return;

        this.ctx.beginPath();
        this.ctx.moveTo(path[0].x, path[0].y);

        for (let i = 1; i < path.length; i++) {
          this.ctx.lineTo(path[i].x, path[i].y);
        }

        this.ctx.stroke();
      } else if (item.type === 'ellipse') {
        // Draw ellipse
        this._drawEllipse(item.startX, item.startY, item.endX, item.endY);
      } else if (item.type === 'rectangle') {
        // Draw rectangle
        this._drawRectangle(item.startX, item.startY, item.endX, item.endY);
      } else if (item.type === 'arrow') {
        // Draw arrow
        this._drawArrow(item.startX, item.startY, item.endX, item.endY);
      } else if (item.type === 'text') {
        // Draw text
        this._drawText(item.x, item.y, item.text);
      } else {
        // Legacy support for old path format (array of points)
        if (Array.isArray(item) && item.length > 0) {
          this.ctx.beginPath();
          this.ctx.moveTo(item[0].x, item[0].y);

          for (let i = 1; i < item.length; i++) {
            this.ctx.lineTo(item[i].x, item[i].y);
          }

          this.ctx.stroke();
        }
      }
    });
  }

  /**
   * Redraw canvas with preview shape (during dragging)
   */
  _redrawWithPreview() {
    this._redraw();

    if (this.previewShape) {
      // Draw preview with slightly transparent stroke
      const originalAlpha = this.ctx.globalAlpha;
      this.ctx.globalAlpha = 0.7;

      if (this.previewShape.type === 'ellipse') {
        this._drawEllipse(this.previewShape.startX, this.previewShape.startY, this.previewShape.endX, this.previewShape.endY);
      } else if (this.previewShape.type === 'rectangle') {
        this._drawRectangle(this.previewShape.startX, this.previewShape.startY, this.previewShape.endX, this.previewShape.endY);
      } else if (this.previewShape.type === 'arrow') {
        this._drawArrow(this.previewShape.startX, this.previewShape.startY, this.previewShape.endX, this.previewShape.endY);
      }

      this.ctx.globalAlpha = originalAlpha;
    }
  }

  /**
   * Draw an ellipse
   */
  _drawEllipse(startX, startY, endX, endY) {
    const centerX = (startX + endX) / 2;
    const centerY = (startY + endY) / 2;
    const radiusX = Math.abs(endX - startX) / 2;
    const radiusY = Math.abs(endY - startY) / 2;

    this.ctx.beginPath();
    this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    this.ctx.stroke();
  }

  /**
   * Draw a rectangle
   */
  _drawRectangle(startX, startY, endX, endY) {
    const width = endX - startX;
    const height = endY - startY;

    this.ctx.beginPath();
    this.ctx.rect(startX, startY, width, height);
    this.ctx.stroke();
  }

  /**
   * Show text input at specified position
   */
  _showTextInput(x, y) {
    // If there's already an active text input, finalize it first
    if (this.textInputActive) {
      this._finalizeTextInput();
    }

    this.textX = x;
    this.textY = y;
    this.textInputActive = true;

    // Create text input element if it doesn't exist
    if (!this.textInput) {
      this.textInput = createElement('input', `${CONFIG.CLASS_PREFIX}text-input`);
      this.textInput.type = 'text';
      this.textInput.placeholder = 'Type text...';

      // Handle Enter key to confirm
      this.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._finalizeTextInput();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this._cancelTextInput();
        }
      });

      // Handle blur (clicking outside)
      this.textInput.addEventListener('blur', () => {
        setTimeout(() => this._finalizeTextInput(), 100);
      });

      this.container.appendChild(this.textInput);
    }

    // Position the text input
    this.textInput.style.left = `${x}px`;
    this.textInput.style.top = `${y}px`;
    this.textInput.value = '';
    this.textInput.style.display = 'block';

    // Focus the input
    setTimeout(() => {
      this.textInput.focus();
    }, 10);
  }

  /**
   * Finalize text input and add to canvas
   */
  _finalizeTextInput() {
    if (!this.textInputActive || !this.textInput) return;

    const text = this.textInput.value.trim();

    if (text.length > 0) {
      // Add text to paths
      this.paths.push({
        type: 'text',
        x: this.textX,
        y: this.textY,
        text: text
      });

      // Redraw canvas with new text
      this._redraw();
    }

    this._hideTextInput();
  }

  /**
   * Cancel text input without adding
   */
  _cancelTextInput() {
    this._hideTextInput();
  }

  /**
   * Hide text input
   */
  _hideTextInput() {
    if (this.textInput) {
      this.textInput.style.display = 'none';
      this.textInput.value = '';
    }
    this.textInputActive = false;
  }

  /**
   * Draw text on canvas
   */
  _drawText(x, y, text) {
    // Set text properties
    this.ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.ctx.fillStyle = this.strokeColor;
    this.ctx.textBaseline = 'top';

    // Draw text with background for better visibility
    const metrics = this.ctx.measureText(text);
    const padding = 4;

    // Draw semi-transparent background
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.fillRect(
      x - padding,
      y - padding,
      metrics.width + padding * 2,
      16 + padding * 2
    );

    // Draw text
    this.ctx.fillStyle = this.strokeColor;
    this.ctx.fillText(text, x, y);
  }

  /**
   * Draw an arrow with arrowhead
   */
  _drawArrow(startX, startY, endX, endY) {
    // Calculate the angle of the line
    const angle = Math.atan2(endY - startY, endX - startX);

    // Arrowhead size (proportional to stroke width)
    const headLength = 15 + (this.strokeWidth * 2);
    const headWidth = 10 + (this.strokeWidth * 1.5);

    // Draw the main line
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    // Draw the arrowhead
    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);

    // Left side of arrowhead
    this.ctx.lineTo(
      endX - headLength * Math.cos(angle) + headWidth * Math.sin(angle),
      endY - headLength * Math.sin(angle) - headWidth * Math.cos(angle)
    );

    // Right side of arrowhead
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX - headLength * Math.cos(angle) - headWidth * Math.sin(angle),
      endY - headLength * Math.sin(angle) + headWidth * Math.cos(angle)
    );

    this.ctx.stroke();
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

      // Use DPR of 1 to minimize memory usage
      const dpr = 1;
      const canvasWidth = window.innerWidth * 0.9;
      const canvasHeight = window.innerHeight * 0.9;

      this.canvas.width = canvasWidth * dpr;
      this.canvas.height = canvasHeight * dpr;
      this.canvas.style.width = `${canvasWidth}px`;
      this.canvas.style.height = `${canvasHeight}px`;

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
  /**
   * Handle Done button click - Save annotations and exit
   * Returns unmerged screenshot + annotation data
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
          Saving...
        `;
      }

      // Create annotation data
      const annotationData = {
        paths: JSON.parse(JSON.stringify(this.paths)), // Deep copy
        strokeColor: this.strokeColor,
        strokeWidth: this.strokeWidth,
        hasAnnotations: this.paths.length > 0
      };

      // Generate merged thumbnail for preview
      const mergedCanvas = this._createMergedCanvas();
      const thumbnail = mergedCanvas.toDataURL('image/jpeg', 0.85);

      // Count annotations
      const annotationCount = this.paths.length;
      const pathCount = this.paths.filter(item => item.type === 'path' || Array.isArray(item)).length;
      const shapeCount = this.paths.filter(item => item.type === 'ellipse' || item.type === 'rectangle' || item.type === 'arrow').length;
      const textCount = this.paths.filter(item => item.type === 'text').length;

      const resultData = {
        screenshotDataURL: this.screenshotData?.dataURL,  // UNMERGED original
        annotationData: annotationData,                    // Separate annotation data
        thumbnail: thumbnail,                              // Merged preview
        metadata: {
          ...this.screenshotData?.metadata,
          hasAnnotations: annotationCount > 0,
          annotationCount: annotationCount,
          pathCount: pathCount,
          shapeCount: shapeCount,
          textCount: textCount
        }
      };

      console.log('[Tapko DrawingCanvas] Done clicked, returning data:', {
        hasScreenshotDataURL: !!resultData.screenshotDataURL,
        hasAnnotationData: !!resultData.annotationData,
        pathCount: resultData.annotationData?.paths?.length,
        annotationData: resultData.annotationData
      });

      // Return unmerged data via callback
      if (this.onDone) {
        this.onDone(resultData);
      }

      dispatchCustomEvent(CONFIG.EVENTS.DRAWING_COMPLETED, {
        hasAnnotations: annotationCount > 0,
        annotationCount: annotationCount
      });

      console.log('[Tapko] Drawing saved:', annotationCount, 'annotations');

    } catch (error) {
      console.error('[Tapko] Failed to save annotations:', error);

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
      alert('Failed to save annotations. Please try again.');
    }
  }

  /**
   * Handle Cancel button click - Exit annotation mode with warning if there are unsaved changes
   */
  _handleCancel() {
    // Check if there are any annotations
    const hasAnnotations = this.paths.length > 0;

    if (!hasAnnotations) {
      // No annotations, exit immediately
      if (this.onCancel) this.onCancel();
      return;
    }

    // Show warning dialog with custom styling
    this._showExitWarningDialog();
  }

  /**
   * Show exit warning dialog with options to Save or Exit without saving
   * Returns true if user wants to exit, false otherwise
   */
  _showExitWarningDialog() {
    // Create custom dialog overlay
    const dialogOverlay = createElement('div', `${CONFIG.CLASS_PREFIX}exit-dialog-overlay`);

    const dialog = createElement('div', `${CONFIG.CLASS_PREFIX}exit-dialog`);
    dialog.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}exit-dialog-header">
        <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}exit-dialog-icon">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
        </svg>
        <h3>Unsaved Annotations</h3>
      </div>
      <div class="${CONFIG.CLASS_PREFIX}exit-dialog-content">
        <p>You have unsaved annotations. What would you like to do?</p>
      </div>
      <div class="${CONFIG.CLASS_PREFIX}exit-dialog-actions">
        <button type="button" class="${CONFIG.CLASS_PREFIX}exit-dialog-btn ${CONFIG.CLASS_PREFIX}btn-exit" aria-label="Exit without saving">
          Exit Without Saving
        </button>
        <button type="button" class="${CONFIG.CLASS_PREFIX}exit-dialog-btn ${CONFIG.CLASS_PREFIX}btn-save" aria-label="Save annotations">
          Save Annotations
        </button>
      </div>
    `;

    dialogOverlay.appendChild(dialog);

    // Append to container
    if (this.container) {
      this.container.appendChild(dialogOverlay);
    }

    // Show dialog with animation
    requestAnimationFrame(() => {
      dialogOverlay.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    // Handle button clicks
    const exitBtn = dialog.querySelector(`.${CONFIG.CLASS_PREFIX}btn-exit`);
    const saveBtn = dialog.querySelector(`.${CONFIG.CLASS_PREFIX}btn-save`);

    exitBtn.addEventListener('click', () => {
      // Exit without saving
      dialogOverlay.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
      setTimeout(() => {
        dialogOverlay.remove();
        if (this.onCancel) this.onCancel();
      }, 200);
    });

    saveBtn.addEventListener('click', () => {
      // Save annotations
      dialogOverlay.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
      setTimeout(() => {
        dialogOverlay.remove();
        this._handleDone();
      }, 200);
    });

    // Close on overlay click (outside dialog)
    dialogOverlay.addEventListener('click', (e) => {
      if (e.target === dialogOverlay) {
        dialogOverlay.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
        setTimeout(() => {
          dialogOverlay.remove();
        }, 200);
      }
    });
  }

  /**
   * Create a merged canvas with screenshot + annotations for thumbnail generation
   * Returns a temporary canvas element (not displayed)
   */
  _createMergedCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;

    // Draw screenshot background
    if (this.screenshotImage) {
      ctx.drawImage(this.screenshotImage, 0, 0, canvas.width, canvas.height);
    }

    // Apply annotation settings
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw all annotations (reuse logic from _redraw)
    this.paths.forEach(item => {
      if (item.type === 'path' || Array.isArray(item)) {
        // Freehand path
        const path = item.type === 'path' ? item.data : item;
        if (path.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();

      } else if (item.type === 'ellipse') {
        // Ellipse
        const centerX = (item.startX + item.endX) / 2;
        const centerY = (item.startY + item.endY) / 2;
        const radiusX = Math.abs(item.endX - item.startX) / 2;
        const radiusY = Math.abs(item.endY - item.startY) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();

      } else if (item.type === 'rectangle') {
        // Rectangle
        const width = item.endX - item.startX;
        const height = item.endY - item.startY;
        ctx.beginPath();
        ctx.rect(item.startX, item.startY, width, height);
        ctx.stroke();

      } else if (item.type === 'arrow') {
        // Arrow
        this._drawArrowOnContext(ctx, item.startX, item.startY, item.endX, item.endY);

      } else if (item.type === 'text') {
        // Text
        ctx.font = '16px sans-serif';
        ctx.fillStyle = this.strokeColor;
        ctx.fillText(item.text, item.x, item.y);
      }
    });

    return canvas;
  }

  /**
   * Helper to draw arrow on a given context
   */
  _drawArrowOnContext(ctx, startX, startY, endX, endY) {
    // Draw line
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw arrowhead
    const angle = Math.atan2(endY - startY, endX - startX);
    const arrowLength = 15;
    const arrowAngle = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowLength * Math.cos(angle - arrowAngle),
      endY - arrowLength * Math.sin(angle - arrowAngle)
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowLength * Math.cos(angle + arrowAngle),
      endY - arrowLength * Math.sin(angle + arrowAngle)
    );
    ctx.stroke();
  }

  /**
   * Draw the screenshot as the background of the drawing canvas
   */
  async _drawScreenshotBackground(dataURL) {
    if (!dataURL) return;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        console.log('[Tapko] Screenshot loaded for canvas:', img.width, 'x', img.height);

        try {
          this._drawImageToCanvas(img);
          this.screenshotImage = img;
          resolve();
        } catch (error) {
          console.error('[Tapko] Failed to draw screenshot to canvas:', error);
          reject(error);
        }
      };
      img.onerror = (err) => {
        console.error('[Tapko] Failed to load screenshot image for background:', err);
        reject(new Error('Failed to load screenshot image'));
      };
      img.src = dataURL;
    });
  }

  /**
   * Helper to draw image to canvas
   */
  _drawImageToCanvas(img) {
    try {
      console.log('[Tapko] Drawing screenshot to canvas:', img.width, 'x', img.height);

      // Save current context state
      this.ctx.save();

      // Draw the screenshot to fill the canvas (90% of viewport)
      // The context is already scaled by DPR, so we draw at CSS dimensions
      const canvasWidth = window.innerWidth * 0.9;
      const canvasHeight = window.innerHeight * 0.9;
      this.ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

      this.ctx.restore();
    } catch (error) {
      console.error('[Tapko] Error drawing image to canvas:', error);
      this.ctx.restore(); // Make sure to restore even on error
      throw error;
    }
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

      // Cleanup text input
      if (this.textInput) {
        this._hideTextInput();
      }

      setTimeout(() => {
        if (this.container && this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.toolbar = null;
        this.textInput = null;
        this.paths = [];
        this.currentPath = [];
      }, CONFIG.UI.animationDuration);
    }
  }

  /**
   * Create instructional notification
   */
  _createInstructions() {
    this.instructions = createElement('div', `${CONFIG.CLASS_PREFIX}drawing-instructions`);
    this.instructions.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}instruction-dot"></div>
      Select a tool and click-drag to annotate
    `;
  }

  /**
   * Prepare UI for screenshot capture
   * Hides toolbar, instructions, and glowing border
   */
  prepareForCapture() {
    if (this.toolbar) this.toolbar.style.opacity = '0';
    if (this.instructions) this.instructions.style.display = 'none';

    // Disable glowing border by removing visible class temporarily or adding a capture class
    // Cleaner to add a 'capture-mode' class that overrides the ::after
    if (this.container) {
      this.container.classList.add(`${CONFIG.CLASS_PREFIX}capture-mode`);
    }
  }

  /**
   * Restore UI after screenshot capture
   */
  restoreAfterCapture() {
    if (this.toolbar) this.toolbar.style.opacity = '';
    if (this.instructions) this.instructions.style.display = '';

    if (this.container) {
      this.container.classList.remove(`${CONFIG.CLASS_PREFIX}capture-mode`);
    }
  }
}

export { DrawingCanvas };
