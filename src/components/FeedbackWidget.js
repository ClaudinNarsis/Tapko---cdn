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
    this.exitButton = null;
    this.counterButton = null;
    this.feedbackCount = 0;
    this.projectId = null;
    this.onExit = null;
    this.feedbackUrl = null;
  }

  /**
   * Create and show the widget
   */
  create(onExitCallback, projectId, feedbackUrl) {
    if (this.widget) {
      return; // Already created
    }

    this.onExit = onExitCallback;
    this.projectId = projectId;
    this.feedbackUrl = feedbackUrl || CONFIG.FEEDBACK_URL;

    // Create widget container
    this.widget = createElement('div', `${CONFIG.CLASS_PREFIX}feedback-widget`);
    this.widget.setAttribute('role', 'toolbar');
    this.widget.setAttribute('aria-label', 'Feedback controls');

    // Create exit button (cross icon)
    this.exitButton = createElement('button', `${CONFIG.CLASS_PREFIX}widget-exit-btn`);
    this.exitButton.setAttribute('type', 'button');
    this.exitButton.setAttribute('aria-label', 'Exit feedback mode');
    this.exitButton.innerHTML = `
      <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}widget-icon">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
    this.exitButton.addEventListener('click', () => this._handleExit());

    // Create counter button
    this.counterButton = createElement('button', `${CONFIG.CLASS_PREFIX}widget-counter-btn`);
    this.counterButton.setAttribute('type', 'button');
    this.counterButton.setAttribute('aria-label', 'View all feedbacks');
    this._updateCounterDisplay(0);
    this.counterButton.addEventListener('click', () => this._handleCounterClick());

    // Append buttons to widget
    this.widget.appendChild(this.exitButton);
    this.widget.appendChild(this.counterButton);

    document.body.appendChild(this.widget);

    // Fetch feedback count
    this._fetchFeedbackCount();

    // Show with animation
    requestAnimationFrame(() => {
      this.widget.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    return this.widget;
  }

  /**
   * Handle exit button click
   */
  _handleExit() {
    if (this.onExit) {
      this.onExit();
    }
  }

  /**
   * Handle counter button click - redirect to feedback URL
   */
  _handleCounterClick() {
    if (this.projectId && this.feedbackUrl) {
      const url = `${this.feedbackUrl}/${this.projectId}`;
      console.log('[Tapko Widget] Opening feedback URL:', url);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Fetch feedback count for current project
   */
  async _fetchFeedbackCount() {
    try {
      // For now, we'll use a placeholder count
      // In a real implementation, this would fetch from the API
      // The API endpoint would need to be created to return feedback count
      const count = await this._getFeedbackCountFromAPI();
      this.setFeedbackCount(count);
    } catch (error) {
      console.error('[Tapko Widget] Failed to fetch feedback count:', error);
      // Show 0 if fetch fails
      this.setFeedbackCount(0);
    }
  }

  /**
   * Get feedback count from API (placeholder)
   * TODO: Implement actual API call when endpoint is available
   */
  async _getFeedbackCountFromAPI() {
    // This is a placeholder - in production, you would call the API
    // Example: return await this.apiClient.get('/feedback/count', { projectId: this.projectId });

    // For now, return 0 as placeholder
    // The actual implementation would require adding this endpoint to the API
    return 0;
  }

  /**
   * Update counter display
   */
  _updateCounterDisplay(count) {
    if (!this.counterButton) return;

    const displayCount = count > 99 ? '99+' : count.toString();
    this.counterButton.innerHTML = `
      <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}widget-icon">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="${CONFIG.CLASS_PREFIX}widget-counter-badge">${displayCount}</span>
    `;
  }

  /**
   * Set feedback count and update display
   */
  setFeedbackCount(count) {
    this.feedbackCount = count;
    this._updateCounterDisplay(count);
  }

  /**
   * Refresh feedback count
   */
  async refreshCount() {
    await this._fetchFeedbackCount();
  }

  /**
   * Show the widget
   */
  show() {
    if (this.widget) {
      this.widget.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Hide the widget
   */
  hide() {
    if (this.widget) {
      this.widget.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
    }
  }

  /**
   * Remove the widget
   */
  destroy() {
    if (this.widget) {
      this.widget.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);

      setTimeout(() => {
        if (this.widget && this.widget.parentNode) {
          this.widget.parentNode.removeChild(this.widget);
        }
        this.widget = null;
        this.exitButton = null;
        this.counterButton = null;
        this.onExit = null;
      }, CONFIG.UI.animationDuration);
    }
  }
}

export { FeedbackWidget };
