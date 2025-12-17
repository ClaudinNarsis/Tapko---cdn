/**
 * Snackbar Component
 * Displays feedback messages at the bottom center of the screen
 *
 * Specifications:
 * - Positioned at bottom center
 * - Slides up with animation
 * - Auto-dismisses or can be persistent
 * - Supports different message types (info, success, error)
 */

import { CONFIG } from '../config.js';
import { createElement } from '../utils/dom.js';

class Snackbar {
  constructor() {
    this.container = null;
    this.currentTimeout = null;
  }

  /**
   * Create the snackbar container
   */
  create() {
    if (this.container) {
      return this.container;
    }

    this.container = createElement('div', `${CONFIG.CLASS_PREFIX}snackbar`);
    document.body.appendChild(this.container);

    return this.container;
  }

  /**
   * Show a message in the snackbar
   * @param {string} message - The message to display
   * @param {object} options - Display options
   */
  show(message, options = {}) {
    const {
      duration = 0, // 0 means persistent (no auto-hide)
      type = 'info' // 'info', 'success', 'error'
    } = options;

    if (!this.container) {
      this.create();
    }

    // Clear any existing timeout
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }

    // Update message
    this.container.textContent = message;

    // Update type class
    this.container.className = `${CONFIG.CLASS_PREFIX}snackbar ${CONFIG.CLASS_PREFIX}snackbar-${type}`;

    // Show with animation
    requestAnimationFrame(() => {
      this.container.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    // Auto-hide if duration is set
    if (duration > 0) {
      this.currentTimeout = setTimeout(() => {
        this.hide();
      }, duration);
    }
  }

  /**
   * Hide the snackbar
   */
  hide() {
    if (this.container) {
      this.container.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
    }

    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
  }

  /**
   * Destroy the snackbar
   */
  destroy() {
    this.hide();

    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }

    setTimeout(() => {
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.container = null;
    }, CONFIG.UI.animationDuration);
  }
}

export { Snackbar };
