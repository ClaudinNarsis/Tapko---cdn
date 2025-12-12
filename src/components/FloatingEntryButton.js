/**
 * Floating Entry Button Component
 * A small, elegant button that triggers Feedback Mode
 *
 * Specifications:
 * - Size: 38-44px circular button
 * - Position: Bottom-right corner
 * - Icon: Simple "+" or chat bubble
 * - Morphs into "Exit Feedback" when in feedback mode
 */

import { CONFIG } from '../config.js';
import { createElement, dispatchCustomEvent } from '../utils/dom.js';

class FloatingEntryButton {
  constructor() {
    this.button = null;
    this.isInFeedbackMode = false;
    this.onClick = null;
  }

  /**
   * Create and show the floating button
   */
  create(onClickCallback) {
    if (this.button) {
      return; // Already created
    }

    this.onClick = onClickCallback;

    // Create button container
    this.button = createElement('button', `${CONFIG.CLASS_PREFIX}floating-entry-button`);
    this.button.setAttribute('type', 'button');
    this.button.setAttribute('aria-label', 'Enter feedback mode');

    // Set initial icon (chat bubble)
    this._updateIcon(false);

    // Attach click event
    this.button.addEventListener('click', () => this._handleClick());

    document.body.appendChild(this.button);

    return this.button;
  }

  /**
   * Handle button click
   */
  _handleClick() {
    if (this.onClick) {
      this.onClick();
    }
  }

  /**
   * Update button to feedback mode state
   */
  setFeedbackMode(isActive) {
    if (!this.button) return;

    this.isInFeedbackMode = isActive;

    if (isActive) {
      this.button.classList.add(`${CONFIG.CLASS_PREFIX}feedback-mode-active`);
      this.button.setAttribute('aria-label', 'Exit feedback mode');
    } else {
      this.button.classList.remove(`${CONFIG.CLASS_PREFIX}feedback-mode-active`);
      this.button.setAttribute('aria-label', 'Enter feedback mode');
    }

    this._updateIcon(isActive);
  }

  /**
   * Update icon based on state
   */
  _updateIcon(isInFeedbackMode) {
    if (!this.button) return;

    if (isInFeedbackMode) {
      // Show X icon for exit
      this.button.innerHTML = `
        <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}button-icon">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    } else {
      // Show chat bubble icon for entry
      this.button.innerHTML = `
        <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}button-icon">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }
  }

  /**
   * Show the button
   */
  show() {
    if (this.button) {
      this.button.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Hide the button
   */
  hide() {
    if (this.button) {
      this.button.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Remove the button
   */
  destroy() {
    if (this.button && this.button.parentNode) {
      this.button.parentNode.removeChild(this.button);
    }
    this.button = null;
    this.onClick = null;
  }
}

export { FloatingEntryButton };
