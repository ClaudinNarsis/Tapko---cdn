/**
 * Feedback Disabled Popup Component
 * Shows a message when the user clicks the feedback button but collection is disabled
 */

import { CONFIG } from '../config.js';
import { createElement } from '../utils/dom.js';

class FeedbackDisabledPopup {
    constructor() {
        this.popup = null;
        this.timer = null;
    }

    /**
     * Create the popup element
     */
    create() {
        if (this.popup) return;

        this.popup = createElement('div', `${CONFIG.CLASS_PREFIX}feedback-disabled-popup`);

        this.popup.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}popup-header">
        <h3 class="${CONFIG.CLASS_PREFIX}popup-title">Feedback Disabled</h3>
        <button class="${CONFIG.CLASS_PREFIX}popup-close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <p class="${CONFIG.CLASS_PREFIX}popup-message">
        Feedback collection has been temporarily disabled for this project.
      </p>
    `;

        // Close button handler
        const closeBtn = this.popup.querySelector(`.${CONFIG.CLASS_PREFIX}popup-close`);
        closeBtn.addEventListener('click', () => this.hide());

        // Use shadow root if available, otherwise document.body
        const shadowRoot = window.Tapko._internal?.shadowRoot || document.body;
        shadowRoot.appendChild(this.popup);
    }

    /**
     * Show the popup
     * @param {ShadowRoot} shadowRoot - Shadow root to append the popup to (defaults to internal shadow root or document.body)
     */
    show(shadowRoot) {
        if (!this.popup) this.create();

        // If shadowRoot is explicitly passed, move popup there
        if (shadowRoot && this.popup && this.popup.parentNode !== shadowRoot) {
            if (this.popup.parentNode) {
                this.popup.parentNode.removeChild(this.popup);
            }
            shadowRoot.appendChild(this.popup);
        }

        // Clear existing timer
        if (this.timer) {
            clearTimeout(this.timer);
        }

        // Force reflow
        this.popup.offsetHeight;

        this.popup.classList.add(`${CONFIG.CLASS_PREFIX}visible`);

        // Auto-hide after 5 seconds
        this.timer = setTimeout(() => {
            this.hide();
        }, 5000);
    }

    /**
     * Hide the popup
     */
    hide() {
        if (this.popup) {
            this.popup.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
        }
    }

    /**
     * Destroy the component
     */
    destroy() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        if (this.popup && this.popup.parentNode) {
            this.popup.parentNode.removeChild(this.popup);
        }
        this.popup = null;
    }
}

export { FeedbackDisabledPopup };
