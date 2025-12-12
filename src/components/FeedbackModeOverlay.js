/**
 * Feedback Mode Overlay Component
 * Creates a semi-transparent overlay that intercepts clicks while allowing scrolling
 *
 * Specifications:
 * - 4-5% opacity tint (rgba(0,0,0,0.04))
 * - Intercepts all pointer events except scrolling
 * - Shows "Feedback mode — tap anything" label
 * - Custom cursor (target indicator)
 * - Full-screen coverage
 */

import { CONFIG } from '../config.js';
import { createElement, dispatchCustomEvent } from '../utils/dom.js';

class FeedbackModeOverlay {
  constructor() {
    this.overlay = null;
    this.label = null;
    this.onTap = null;
  }

  /**
   * Create and show the overlay
   */
  create(onTapCallback) {
    if (this.overlay) {
      return; // Already created
    }

    this.onTap = onTapCallback;

    // Create overlay container
    this.overlay = createElement('div', `${CONFIG.CLASS_PREFIX}feedback-overlay`);

    // Create label
    this.label = createElement('div', `${CONFIG.CLASS_PREFIX}feedback-label`);
    this.label.textContent = 'Feedback mode — tap anything';

    this.overlay.appendChild(this.label);

    // Attach events
    this._attachEventListeners();

    document.body.appendChild(this.overlay);

    // Show with animation
    requestAnimationFrame(() => {
      this.overlay.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    return this.overlay;
  }

  /**
   * Attach event listeners
   */
  _attachEventListeners() {
    // Intercept pointer events (clicks, taps)
    this.overlay.addEventListener('pointerdown', (e) => this._handlePointerDown(e), true);

    // Allow scrolling via wheel events
    this.overlay.addEventListener('wheel', (e) => {
      // Let wheel events pass through
      e.stopPropagation();
    }, { passive: true });

    // Prevent default behaviors but allow scrolling gestures
    this.overlay.addEventListener('touchmove', (e) => {
      // Allow touch scroll
      e.stopPropagation();
    }, { passive: true });

    // Prevent context menu
    this.overlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    }, true);
  }

  /**
   * Handle pointer down event
   */
  _handlePointerDown(event) {
    // Prevent the event from reaching underlying elements
    event.preventDefault();
    event.stopPropagation();

    // Get the element that was clicked (below the overlay)
    const x = event.clientX;
    const y = event.clientY;

    // Temporarily hide overlay to get element below
    this.overlay.style.pointerEvents = 'none';
    const targetElement = document.elementFromPoint(x, y);
    this.overlay.style.pointerEvents = '';

    // Ignore clicks on the overlay itself or feedback UI elements
    if (!targetElement ||
        targetElement === this.overlay ||
        targetElement.classList.contains(`${CONFIG.CLASS_PREFIX}feedback-label`) ||
        targetElement.closest(`.${CONFIG.CLASS_PREFIX}comment-card`) ||
        targetElement.closest(`.${CONFIG.CLASS_PREFIX}floating-entry-button`)) {
      return;
    }

    // Dispatch tap event with target element
    if (this.onTap) {
      this.onTap(targetElement, { x, y });
    }

    dispatchCustomEvent(CONFIG.EVENTS.FEEDBACK_TARGET_SELECTED, {
      element: targetElement,
      coordinates: { x, y }
    });
  }

  /**
   * Update label text
   */
  setLabel(text) {
    if (this.label) {
      this.label.textContent = text;
    }
  }

  /**
   * Show drawing mode indicator
   */
  setDrawingMode(isActive) {
    if (!this.overlay) return;

    if (isActive) {
      this.overlay.classList.add(`${CONFIG.CLASS_PREFIX}drawing-mode`);
      this.setLabel('Drawing mode — Press Done when finished');
    } else {
      this.overlay.classList.remove(`${CONFIG.CLASS_PREFIX}drawing-mode`);
      this.setLabel('Feedback mode — tap anything');
    }
  }

  /**
   * Hide the overlay
   */
  hide() {
    if (this.overlay) {
      this.overlay.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Show the overlay
   */
  show() {
    if (this.overlay) {
      this.overlay.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Remove the overlay
   */
  destroy() {
    if (this.overlay) {
      this.overlay.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.label = null;
        this.onTap = null;
      }, CONFIG.UI.animationDuration);
    }
  }
}

export { FeedbackModeOverlay };
