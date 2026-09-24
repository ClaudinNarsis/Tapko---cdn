/**
 * Tap Anywhere Prompt Component
 * The second half of the guided first comment: once the owner has pressed
 * the entry button, feedback mode looks like a faint tint and a snackbar,
 * neither of which says what to do next. This tells them to click the page.
 *
 * Specifications:
 * - Shown only inside a guided session (an onboarding link carried
 *   ?tapko_feedback=1), never to an ordinary visitor on a client's site
 * - Top-centre, clear of the snackbar (bottom: 150px) and of the entry
 *   button's corner, so nothing it explains is hidden behind it
 * - Dismissible, and self-dismissing the moment a comment card opens, since
 *   at that point the instruction has been carried out
 * - Click-through everywhere except its own close button: it sits over the
 *   page the owner is being told to click, and must not eat that click
 */

import { CONFIG } from '../config.js';
import { createElement } from '../utils/dom.js';

class TapAnywherePrompt {
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
    this.onDismiss = onDismiss;

    if (this.prompt) {
      this.prompt.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
      return this.prompt;
    }

    this.prompt = createElement('div', `${CONFIG.CLASS_PREFIX}tap-anywhere-prompt`);
    this.prompt.setAttribute('role', 'status');
    this.prompt.setAttribute('aria-live', 'polite');

    this.prompt.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-body">
        <p class="${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-title">Try tapping here</p>
        <p class="${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-text">
          Click anywhere on your page to pin a comment to that spot.
        </p>
      </div>
      <button class="${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-close" type="button" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;

    const closeBtn = this.prompt.querySelector(`.${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-close`);
    closeBtn.addEventListener('click', (event) => {
      // The feedback overlay captures pointer events on the way down, so a
      // click meant for this button would otherwise also drop a comment pin
      // behind it.
      event.stopPropagation();
      this.hide();
      if (this.onDismiss) this.onDismiss();
    });

    shadowRoot.appendChild(this.prompt);

    // Force reflow so the entrance transition runs (same technique as
    // FirstCommentPrompt and FeedbackDisabledPopup).
    this.prompt.offsetHeight;
    this.prompt.classList.add(`${CONFIG.CLASS_PREFIX}visible`);

    return this.prompt;
  }

  /**
   * Hide without recording a dismissal — used when the owner follows the
   * instruction, or leaves feedback mode.
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

export { TapAnywherePrompt };
