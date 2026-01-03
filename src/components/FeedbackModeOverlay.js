/**
 * Feedback Mode Overlay Component
 * Creates a semi-transparent overlay that intercepts clicks while allowing scrolling
 *
 * Specifications:
 * - 4-5% opacity tint (rgba(0,0,0,0.04))
 * - Intercepts all pointer events except scrolling
 * - Uses Snackbar component for messages
 * - Custom cursor (target indicator)
 * - Full-screen coverage
 */

import { CONFIG } from '../config.js';
import { createElement, dispatchCustomEvent } from '../utils/dom.js';
import { Snackbar } from './Snackbar.js';

class FeedbackModeOverlay {
  constructor() {
    this.overlay = null;
    this.snackbar = null;
    this.onTap = null;
    this.onExit = null;
  }

  /**
   * Create and show the overlay
   */
  create(onTapCallback, onExitCallback) {
    if (this.overlay) {
      return; // Already created
    }

    this.onTap = onTapCallback;
    this.onExit = onExitCallback;

    // Create overlay container
    this.overlay = createElement('div', `${CONFIG.CLASS_PREFIX}feedback-overlay`);

    // Create snackbar for messages
    this.snackbar = new Snackbar();
    this.snackbar.create();

    // Attach events
    this._attachEventListeners();

    document.body.appendChild(this.overlay);

    // Show with animation
    requestAnimationFrame(() => {
      this.overlay.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
      // Show initial message with integrated exit button
      this.snackbar.show('Feedback mode ON', {
        type: 'error',
        showExitButton: true,
        onExit: this.onExit
      });
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
        targetElement.classList.contains(`${CONFIG.CLASS_PREFIX}snackbar`) ||
        targetElement.closest(`.${CONFIG.CLASS_PREFIX}comment-card`) ||
        targetElement.closest(`.${CONFIG.CLASS_PREFIX}floating-entry-button`)) {
      return;
    }

    // Hide snackbar when comment card is about to be created
    if (this.snackbar) {
      this.snackbar.hide();
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
   * Show drawing mode indicator
   */
  setDrawingMode(isActive) {
    if (!this.overlay || !this.snackbar) return;

    if (isActive) {
      this.overlay.classList.add(`${CONFIG.CLASS_PREFIX}drawing-mode`);
      this.snackbar.show('Drawing mode — Press Done when finished', { type: 'info' });
    } else {
      this.overlay.classList.remove(`${CONFIG.CLASS_PREFIX}drawing-mode`);
      this.snackbar.show('Feedback mode ON', {
        type: 'error',
        showExitButton: true,
        onExit: this.onExit
      });
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

      // Hide and destroy snackbar
      if (this.snackbar) {
        this.snackbar.destroy();
      }

      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.snackbar = null;
        this.onTap = null;
      }, CONFIG.UI.animationDuration);
    }
  }
}

export { FeedbackModeOverlay };
