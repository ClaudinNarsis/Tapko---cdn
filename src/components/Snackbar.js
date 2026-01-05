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
    this.exitButton = null;
    this.onExitCallback = null;
  }

  /**
   * Create the snackbar container
   * @param {ShadowRoot} shadowRoot - Shadow root to append the snackbar to (defaults to document.body for backward compatibility)
   */
  create(shadowRoot = document.body) {
    if (this.container) {
      return this.container;
    }

    this.container = createElement('div', `${CONFIG.CLASS_PREFIX}snackbar`);
    shadowRoot.appendChild(this.container);

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
      type = 'info', // 'info', 'success', 'error'
      showExitButton = false, // Show integrated exit button
      onExit = null // Exit button callback
    } = options;

    if (!this.container) {
      this.create();
    }

    // Clear any existing timeout
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }

    // Clear container
    this.container.innerHTML = '';

    // Update type class
    this.container.className = `${CONFIG.CLASS_PREFIX}snackbar ${CONFIG.CLASS_PREFIX}snackbar-${type}`;

    // Create message text
    const messageSpan = createElement('span', `${CONFIG.CLASS_PREFIX}snackbar-message`);
    messageSpan.textContent = message;
    this.container.appendChild(messageSpan);

    // Add exit button if requested
    if (showExitButton && onExit) {
      this.onExitCallback = onExit;

      // Remove old exit button if exists
      if (this.exitButton && this.exitButton.parentNode) {
        this.exitButton.remove();
      }

      this.exitButton = createElement('button', `${CONFIG.CLASS_PREFIX}snackbar-exit-btn`);
      this.exitButton.setAttribute('type', 'button');
      this.exitButton.setAttribute('aria-label', 'Exit feedback mode');
      this.exitButton.innerHTML = `
        <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}snackbar-exit-icon">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      `;
      this.exitButton.addEventListener('click', () => {
        if (this.onExitCallback) {
          this.onExitCallback();
        }
      });

      this.container.appendChild(this.exitButton);
      this.container.classList.add(`${CONFIG.CLASS_PREFIX}with-exit-btn`);
    } else {
      this.container.classList.remove(`${CONFIG.CLASS_PREFIX}with-exit-btn`);
    }

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
