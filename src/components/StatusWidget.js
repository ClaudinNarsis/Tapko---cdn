/**
 * Status Widget Component
 * Shows a small round status indicator at the bottom right corner
 */

import { CONFIG } from '../config.js';
import { createElement } from '../utils/dom.js';

class StatusWidget {
  constructor() {
    this.widget = null;
    this.statusDot = null;
  }

  /**
   * Create and show the status widget
   */
  create() {
    if (this.widget) {
      return; // Already created
    }

    // Create widget container
    this.widget = createElement('div', `${CONFIG.CLASS_PREFIX}status-widget`);

    // Create status dot
    this.statusDot = createElement('div', `${CONFIG.CLASS_PREFIX}status-dot`);

    this.widget.appendChild(this.statusDot);
    document.body.appendChild(this.widget);

    return this.widget;
  }

  /**
   * Update status
   * @param {string} status - 'loading', 'success', 'error', 'disabled'
   */
  setStatus(status) {
    if (!this.widget) {
      this.create();
    }

    // Remove all status classes
    this.widget.classList.remove(
      `${CONFIG.CLASS_PREFIX}status-loading`,
      `${CONFIG.CLASS_PREFIX}status-success`,
      `${CONFIG.CLASS_PREFIX}status-error`,
      `${CONFIG.CLASS_PREFIX}status-disabled`
    );

    // Add the new status class
    this.widget.classList.add(`${CONFIG.CLASS_PREFIX}status-${status}`);

    // Update title attribute for tooltip
    const statusMessages = {
      loading: 'Validating project...',
      success: 'Ready - Double-click to comment',
      error: 'Validation failed',
      disabled: 'Not collecting feedback'
    };

    this.widget.setAttribute('title', statusMessages[status] || 'Tapko Widget');
  }

  /**
   * Remove the status widget
   */
  destroy() {
    if (this.widget && this.widget.parentNode) {
      this.widget.parentNode.removeChild(this.widget);
    }
    this.widget = null;
    this.statusDot = null;
  }
}

export { StatusWidget };
