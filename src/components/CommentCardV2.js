/**
 * Comment Card Component (V2)
 * Manages individual comment bubble UI with drawing support
 *
 * V2 Changes:
 * - Simple bubble UI that opens immediately next to tap point
 * - Includes "Draw on page" button
 * - Minimizes to floating pill when drawing
 * - Auto-focus on open
 * - ESC to cancel, Enter to submit
 */

import { CONFIG } from '../config.js';
import { RecordingManager } from '../managers/RecordingManager.js';
import {
  createElement,
  removeElement,
  sanitizeHTML,
  dispatchCustomEvent,
  getFeedbackPosition,
  getBrowserInfo,
  getCurrentBreakpoint
} from '../utils/dom.js';

class CommentCardV2 {
  constructor(target, coordinates, apiClient) {
    this.target = target;
    this.coordinates = coordinates;
    this.apiClient = apiClient;
    this.card = null;
    this.pinMarker = null;
    this.recordingManager = new RecordingManager();
    this.selectedEmoji = null;
    this.isSubmitting = false;
    this.isMinimized = false;
    this.drawingData = null;

    // Recording UI elements
    this.micIcon = null;
    this.recordingPill = null;
    this.timerSpan = null;
    this.timerInterval = null;

    // Callbacks
    this.onDrawRequested = null;

    // Scroll handler
    this.scrollHandler = null;

    // Store initial offset from element (click position relative to element)
    const targetRect = target.getBoundingClientRect();
    this.clickOffsetX = coordinates.x - targetRect.left;
    this.clickOffsetY = coordinates.y - targetRect.top;

    this._init();
  }

  /**
   * Initialize comment card
   */
  _init() {
    this._createPinMarker();
    this.card = this._createCard();
    this._positionCard();
    this._attachEventListeners();
    this._setupScrollListener();
    this._show();
  }

  /**
   * Create pin marker at tap location
   */
  _createPinMarker() {
    this.pinMarker = createElement('div', `${CONFIG.CLASS_PREFIX}comment-pin`);
    this.pinMarker.style.position = 'absolute';

    // Use the exact click coordinates, not the element's top-left
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // Position at exact click location
    this.pinMarker.style.left = `${this.coordinates.x + scrollX}px`;
    this.pinMarker.style.top = `${this.coordinates.y + scrollY}px`;
    this.pinMarker.style.zIndex = CONFIG.UI.zIndex;

    document.body.appendChild(this.pinMarker);
  }

  /**
   * Setup scroll listener to update positions
   */
  _setupScrollListener() {
    this.scrollHandler = () => {
      this._updatePositions();
    };

    window.addEventListener('scroll', this.scrollHandler, { passive: true });
    window.addEventListener('resize', this.scrollHandler, { passive: true });
  }

  /**
   * Update pin and card positions on scroll
   */
  _updatePositions() {
    if (!this.target || !this.pinMarker) return;

    const targetRect = this.target.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // Update pin marker position using the original click offset
    this.pinMarker.style.left = `${targetRect.left + scrollX + this.clickOffsetX}px`;
    this.pinMarker.style.top = `${targetRect.top + scrollY + this.clickOffsetY}px`;

    // Update card position if not minimized
    if (!this.isMinimized && this.card) {
      this._positionCard();
    }
  }

  /**
   * Create card DOM structure
   */
  _createCard() {
    const card = createElement('div', `${CONFIG.CLASS_PREFIX}comment-card-v2`);

    card.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}comment-bubble">
        <textarea
          class="${CONFIG.CLASS_PREFIX}comment-textarea"
          rows="3"
          placeholder="What's on your mind?"
          maxlength="500"
        ></textarea>
        <div class="${CONFIG.CLASS_PREFIX}comment-actions">
          <button type="button" class="${CONFIG.CLASS_PREFIX}btn-cancel">Cancel</button>
          <button type="button" class="${CONFIG.CLASS_PREFIX}btn-draw">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M12 19l7-7 3 3-7 7-3-3z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M2 2l7.586 7.586" stroke="currentColor" stroke-width="2"/>
              <circle cx="11" cy="11" r="2" fill="currentColor"/>
            </svg>
            Draw on page
          </button>
          <button type="button" class="${CONFIG.CLASS_PREFIX}btn-submit">Submit</button>
        </div>
      </div>
    `;

    document.body.appendChild(card);
    return card;
  }

  /**
   * Position card next to pin marker
   */
  _positionCard() {
    requestAnimationFrame(() => {
      const cardWidth = this.card.offsetWidth || CONFIG.UI.cardMinWidth;
      const cardHeight = this.card.offsetHeight || 150;

      // Get element's position relative to document
      const targetRect = this.target.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      // Calculate position based on actual click location (using stored offset)
      const clickAbsoluteX = targetRect.left + scrollX + this.clickOffsetX;
      const clickAbsoluteY = targetRect.top + scrollY + this.clickOffsetY;

      // Position card next to click location
      let left = clickAbsoluteX + 10;
      let top = clickAbsoluteY;

      // Adjust if overflowing viewport (considering scroll)
      const viewportRight = window.innerWidth + scrollX;
      const viewportBottom = window.innerHeight + scrollY;

      if (left + cardWidth > viewportRight) {
        left = clickAbsoluteX - cardWidth - 10;
      }

      if (top + cardHeight > viewportBottom) {
        top = viewportBottom - cardHeight - 10;
      }

      if (left < scrollX + 10) left = scrollX + 10;
      if (top < scrollY + 10) top = scrollY + 10;

      this.card.style.position = 'absolute';
      this.card.style.left = `${left}px`;
      this.card.style.top = `${top}px`;
      this.card.style.zIndex = CONFIG.UI.zIndex;
    });
  }

  /**
   * Show card with animation
   */
  _show() {
    requestAnimationFrame(() => {
      if (this.pinMarker) {
        this.pinMarker.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
      }
      if (this.card) {
        this.card.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
        this._focusTextarea();
      }
    });
  }

  /**
   * Focus textarea
   */
  _focusTextarea() {
    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    if (textarea) textarea.focus();
  }

  /**
   * Attach event listeners
   */
  _attachEventListeners() {
    // Cancel button
    const cancelBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-cancel`);
    cancelBtn.addEventListener('click', () => this.close());

    // Submit button
    const submitBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-submit`);
    submitBtn.addEventListener('click', () => this.submit());

    // Draw button
    const drawBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-draw`);
    drawBtn.addEventListener('click', () => this._handleDrawClick());

    // Keyboard shortcuts
    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });
  }

  /**
   * Handle draw button click
   */
  _handleDrawClick() {
    this.minimize();

    if (this.onDrawRequested) {
      this.onDrawRequested((drawingData) => {
        this.drawingData = drawingData;
        this.restore();
      });
    }

    dispatchCustomEvent(CONFIG.EVENTS.DRAWING_STARTED);
  }

  /**
   * Minimize card to floating pill
   */
  minimize() {
    if (this.isMinimized) return;

    this.isMinimized = true;
    this.card.classList.add(`${CONFIG.CLASS_PREFIX}minimized`);

    const bubble = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-bubble`);
    if (bubble) {
      bubble.innerHTML = `
        <div class="${CONFIG.CLASS_PREFIX}minimized-label">
          <span>Comment #1 — Drawing</span>
        </div>
      `;
    }
  }

  /**
   * Restore card from minimized state
   */
  restore() {
    if (!this.isMinimized) return;

    this.isMinimized = false;
    this.card.classList.remove(`${CONFIG.CLASS_PREFIX}minimized`);

    // Re-create bubble content
    const bubble = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-bubble`);
    if (bubble) {
      const currentText = this._getCurrentText();

      bubble.innerHTML = `
        <textarea
          class="${CONFIG.CLASS_PREFIX}comment-textarea"
          rows="3"
          placeholder="What's on your mind?"
          maxlength="500"
        >${currentText}</textarea>
        <div class="${CONFIG.CLASS_PREFIX}comment-actions">
          <button type="button" class="${CONFIG.CLASS_PREFIX}btn-cancel">Cancel</button>
          <button type="button" class="${CONFIG.CLASS_PREFIX}btn-draw">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M12 19l7-7 3 3-7 7-3-3z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M2 2l7.586 7.586" stroke="currentColor" stroke-width="2"/>
              <circle cx="11" cy="11" r="2" fill="currentColor"/>
            </svg>
            ${this.drawingData ? 'Edit drawing' : 'Draw on page'}
          </button>
          <button type="button" class="${CONFIG.CLASS_PREFIX}btn-submit">Submit</button>
        </div>
      `;

      // Re-attach events
      this._attachEventListeners();
    }

    this._focusTextarea();
  }

  /**
   * Get current textarea text
   */
  _getCurrentText() {
    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    return textarea ? textarea.value : '';
  }

  /**
   * Set draw request callback
   */
  setDrawCallback(callback) {
    this.onDrawRequested = callback;
  }

  /**
   * Submit comment
   */
  async submit() {
    if (this.isSubmitting) return;

    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    const text = textarea ? textarea.value.trim() : '';

    // Validate input
    if (!text && !this.drawingData) {
      this._showError('Please enter a comment or add a drawing');
      return;
    }

    this.isSubmitting = true;
    this._showLoading();

    try {
      // Collect feedback position and metadata
      const feedbackPosition = getFeedbackPosition(this.target);
      const browserInfo = getBrowserInfo();
      const breakpoint = getCurrentBreakpoint();

      // Prepare feedback data with enhanced metadata
      const feedbackData = {
        feedbackTitle: this._generateFeedbackTitle(text),
        feedbackDescription: sanitizeHTML(text),
        feedbackPosition: feedbackPosition,
        browserInfo: browserInfo,
        breakpoint: breakpoint,
        hasDrawing: !!this.drawingData,
        drawingData: this.drawingData ? this.drawingData.dataURL : null
      };

      // Submit feedback
      const response = await this.apiClient.submitFeedback(feedbackData);

      // Show success state
      this._showSuccess(text || '(Drawing)');

      // Dispatch event
      dispatchCustomEvent(CONFIG.EVENTS.COMMENT_SUBMITTED, {
        feedbackId: response.feedbackId,
        data: feedbackData
      });
    } catch (error) {
      console.error('[Tapko] Submit error:', error);
      this._showError('Failed to submit comment. Please try again.');
      this.isSubmitting = false;
    }
  }

  /**
   * Generate a feedback title from the text content
   */
  _generateFeedbackTitle(text) {
    if (!text) return 'Drawing feedback';

    // Use first 50 characters as title
    const title = text.substring(0, 50);
    return title.length < text.length ? `${title}...` : title;
  }

  /**
   * Show loading state
   */
  _showLoading() {
    const submitBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-submit`);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }
  }

  /**
   * Show success state
   */
  _showSuccess(text) {
    const bubble = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-bubble`);
    if (bubble) {
      bubble.innerHTML = `
        <div class="${CONFIG.CLASS_PREFIX}comment-success">
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M20 6L9 17l-5-5" stroke="#10b981" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>Got it. Your team will see this.</p>
        </div>
      `;
    }

    // Auto-close after 3 seconds
    setTimeout(() => this.close(), 3000);
  }

  /**
   * Show error message
   */
  _showError(message) {
    let errorEl = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-error`);
    if (!errorEl) {
      errorEl = createElement('div', `${CONFIG.CLASS_PREFIX}comment-error`);
      const bubble = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-bubble`);
      bubble.appendChild(errorEl);
    }
    errorEl.textContent = message;

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (errorEl && errorEl.parentNode) {
        errorEl.remove();
      }
    }, 3000);
  }

  /**
   * Close comment card
   */
  close() {
    // Stop recording if active
    if (this.recordingManager && this.recordingManager.isRecording) {
      this.recordingManager.cancelRecording();
    }

    // Cleanup
    this._cleanup();

    // Remove pin marker with animation
    if (this.pinMarker) {
      this.pinMarker.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
      setTimeout(() => {
        if (this.pinMarker && this.pinMarker.parentNode) {
          this.pinMarker.parentNode.removeChild(this.pinMarker);
        }
      }, 800);
    }

    // Remove card with animation
    removeElement(this.card, true);

    // Dispatch event
    dispatchCustomEvent(CONFIG.EVENTS.COMMENT_CLOSED);
  }

  /**
   * Cleanup resources
   */
  _cleanup() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.recordingManager) {
      this.recordingManager.destroy();
    }
    // Remove scroll listener
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      window.removeEventListener('resize', this.scrollHandler);
      this.scrollHandler = null;
    }
  }

  /**
   * Destroy component
   */
  destroy() {
    this._cleanup();
    if (this.card && this.card.parentNode) {
      this.card.parentNode.removeChild(this.card);
    }
    if (this.pinMarker && this.pinMarker.parentNode) {
      this.pinMarker.parentNode.removeChild(this.pinMarker);
    }
  }
}

export { CommentCardV2 };
