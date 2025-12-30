/**
 * Feedback Widget Component
 * Extends the floating button in feedback mode into a small widget
 * with exit button and feedback counter
 *
 * Specifications:
 * - Shows when in feedback mode
 * - Contains exit button (cross icon)
 * - Contains feedback counter button
 * - Opens feedback URL when counter is clicked
 */

import { CONFIG } from '../config.js';
import { createElement } from '../utils/dom.js';

class FeedbackWidget {
  constructor() {
    this.widget = null;
    this.viewAllButton = null;
    this.projectId = null;
    this.feedbackUrl = null;
  }

  /**
   * Create and show the widget
   */
  create(projectId, feedbackUrl) {
    if (this.widget) {
      return; // Already created
    }

    this.projectId = projectId;
    this.feedbackUrl = feedbackUrl || CONFIG.FEEDBACK_URL;

    // Create view all feedback button (standalone)
    this.viewAllButton = createElement('button', `${CONFIG.CLASS_PREFIX}widget-view-all-btn`);
    this.viewAllButton.setAttribute('type', 'button');
    this.viewAllButton.setAttribute('aria-label', 'View all feedbacks');
    this.viewAllButton.innerHTML = `
      <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}widget-icon">
        <path d="M9 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M8 12h8M8 16h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="${CONFIG.CLASS_PREFIX}widget-label">View All Feedback</span>
    `;
    this.viewAllButton.addEventListener('click', () => this._handleViewAllClick());

    document.body.appendChild(this.viewAllButton);

    // Show with animation
    requestAnimationFrame(() => {
      this.viewAllButton.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    return this.viewAllButton;
  }

  /**
   * Handle view all button click - redirect to feedback URL
   */
  _handleViewAllClick() {
    if (this.projectId && this.feedbackUrl) {
      const url = `${this.feedbackUrl}/${this.projectId}`;
      console.log('[Tapko Widget] Opening feedback URL:', url);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Show the button
   */
  show() {
    if (this.viewAllButton) {
      this.viewAllButton.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Hide the button
   */
  hide() {
    if (this.viewAllButton) {
      this.viewAllButton.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Remove the button
   */
  destroy() {
    if (this.viewAllButton) {
      this.viewAllButton.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);

      setTimeout(() => {
        if (this.viewAllButton && this.viewAllButton.parentNode) {
          this.viewAllButton.parentNode.removeChild(this.viewAllButton);
        }
        this.viewAllButton = null;
      }, CONFIG.UI.animationDuration);
    }
  }
}

export { FeedbackWidget };
