/**
 * First Comment Prompt Component
 * A dismissible coach mark anchored beside the floating entry button,
 * shown only when a Tapko onboarding link carries ?tapko_feedback=1.
 *
 * Specifications:
 * - Points at the entry button rather than replacing the press
 * - Dismissible by the owner at any time, and self-dismissing once they
 *   enter feedback mode (at which point it has done its job)
 * - No auto-hide timer: unlike the disabled-feedback popup this is an
 *   instruction someone may still be reading while they look around
 */

import { CONFIG } from '../config.js';
import { createElement } from '../utils/dom.js';

class FirstCommentPrompt {
  constructor() {
    this.prompt = null;
    this.onDismiss = null;
  }

  /**
   * Create and show the prompt.
   * @param {ShadowRoot} shadowRoot - shadow root to append into
   * @param {Function} onDismiss - called when the owner dismisses it
   */
  show(shadowRoot, onDismiss = null) {
    if (this.prompt) return this.prompt;

    this.onDismiss = onDismiss;
    this.prompt = createElement('div', `${CONFIG.CLASS_PREFIX}first-comment-prompt`);
    // Announced politely rather than assertively: it is guidance, not an
    // alert, and it must not interrupt whatever a screen reader is already
    // working through on the owner's own page.
    this.prompt.setAttribute('role', 'status');
    this.prompt.setAttribute('aria-live', 'polite');

    this.prompt.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}first-comment-prompt-body">
        <p class="${CONFIG.CLASS_PREFIX}first-comment-prompt-title">Leave your first comment</p>
        <p class="${CONFIG.CLASS_PREFIX}first-comment-prompt-text">
          Click the Tapko button to start leaving feedback, then click anywhere on the page.
        </p>
      </div>
      <button class="${CONFIG.CLASS_PREFIX}first-comment-prompt-close" type="button" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;

    const closeBtn = this.prompt.querySelector(`.${CONFIG.CLASS_PREFIX}first-comment-prompt-close`);
    closeBtn.addEventListener('click', () => {
      this.hide();
      if (this.onDismiss) this.onDismiss();
    });

    shadowRoot.appendChild(this.prompt);

    // Force reflow so the entrance transition actually runs rather than the
    // element appearing already settled (same technique as
    // FeedbackDisabledPopup).
    this.prompt.offsetHeight;
    this.prompt.classList.add(`${CONFIG.CLASS_PREFIX}visible`);

    return this.prompt;
  }

  /**
   * Hide without recording a dismissal — used when the owner enters feedback
   * mode, where the prompt has been followed rather than rejected.
   */
  hide() {
    if (!this.prompt) return;
    this.prompt.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
  }

  isVisible() {
    return !!(
      this.prompt && this.prompt.classList.contains(`${CONFIG.CLASS_PREFIX}visible`)
    );
  }

  destroy() {
    if (this.prompt && this.prompt.parentNode) {
      this.prompt.parentNode.removeChild(this.prompt);
    }
    this.prompt = null;
    this.onDismiss = null;
  }
}

export { FirstCommentPrompt };
