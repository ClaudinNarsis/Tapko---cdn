/**
 * Comment Card Component
 * Manages individual comment card UI and interactions
 */

import { CONFIG } from '../config.js';
import { RecordingManager } from '../managers/RecordingManager.js';
import {
  createElement,
  getAnchorContainer,
  calculateCardPosition,
  removeElement,
  sanitizeHTML,
  dispatchCustomEvent
} from '../utils/dom.js';

class CommentCard {
  constructor(target, apiClient) {
    this.target = target;
    this.apiClient = apiClient;
    this.card = null;
    this.recordingManager = new RecordingManager();
    this.selectedEmoji = null;
    this.anchor = null;
    this.isSubmitting = false;

    // Recording UI elements
    this.micIcon = null;
    this.recordingPill = null;
    this.timerSpan = null;
    this.timerInterval = null;

    this._init();
  }

  /**
   * Initialize comment card
   */
  _init() {
    this.anchor = getAnchorContainer(this.target);
    this.card = this._createCard();
    this._positionCard();
    this._attachEventListeners();
    this._show();

    // Track event
    this.apiClient.trackEvent('comment_card_opened', {
      targetTag: this.target.tagName
    });
  }

  /**
   * Create card DOM structure
   */
  _createCard() {
    const card = createElement('div', `${CONFIG.CLASS_PREFIX}comment-card`);

    card.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}comment-header">
        <div class="${CONFIG.CLASS_PREFIX}comment-dot"></div>
        <button class="${CONFIG.CLASS_PREFIX}comment-close" title="Remove comment">&times;</button>
        <div class="${CONFIG.CLASS_PREFIX}comment-input-wrapper">
          <div class="${CONFIG.CLASS_PREFIX}comment-input-row">
            <textarea
              class="${CONFIG.CLASS_PREFIX}comment-textarea"
              rows="2"
              placeholder="Write your comment here"
              maxlength="500"
            ></textarea>
            ${RecordingManager.isSupported() ? this._getMicIconSVG() : ''}
          </div>
        </div>
      </div>
      <hr class="${CONFIG.CLASS_PREFIX}comment-divider" />
      <div class="${CONFIG.CLASS_PREFIX}comment-footer">
        <div class="${CONFIG.CLASS_PREFIX}comment-emojis">
          <span class="${CONFIG.CLASS_PREFIX}comment-emoji" data-emoji="👍">👍</span>
          <span class="${CONFIG.CLASS_PREFIX}comment-emoji" data-emoji="❤️">❤️</span>
          <span class="${CONFIG.CLASS_PREFIX}comment-emoji" data-emoji="👎">👎</span>
        </div>
        <button class="${CONFIG.CLASS_PREFIX}comment-submit">Submit</button>
      </div>
    `;

    this.anchor.appendChild(card);
    return card;
  }

  /**
   * Get microphone icon SVG
   */
  _getMicIconSVG() {
    return `
      <svg class="${CONFIG.CLASS_PREFIX}comment-mic" viewBox="0 0 24 24">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor"/>
        <path d="M5 11a1 1 0 0 0-2 0 9 9 0 0 0 8 8.94V22a1 1 0 0 0 2 0v-2.06A9 9 0 0 0 21 11a1 1 0 0 0-2 0 7 7 0 0 1-14 0z" fill="currentColor"/>
      </svg>
    `;
  }

  /**
   * Position card relative to target
   */
  _positionCard() {
    const targetRect = this.target.getBoundingClientRect();
    const anchorRect = this.anchor.getBoundingClientRect();

    requestAnimationFrame(() => {
      const cardWidth = this.card.offsetWidth || CONFIG.UI.cardMinWidth;
      const cardHeight = this.card.offsetHeight || 150;

      const { left, top } = calculateCardPosition(
        targetRect,
        anchorRect,
        cardWidth,
        cardHeight
      );

      this.card.style.left = `${left}px`;
      this.card.style.top = `${top}px`;
    });
  }

  /**
   * Show card with animation
   */
  _show() {
    requestAnimationFrame(() => {
      this.card.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
      this._focusTextarea();
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
    // Close button
    const closeBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-close`);
    closeBtn.addEventListener('click', () => this.close());

    // Submit button
    const submitBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-submit`);
    submitBtn.addEventListener('click', () => this.submit());

    // Emoji clicks
    const emojis = this.card.querySelectorAll(`.${CONFIG.CLASS_PREFIX}comment-emoji`);
    emojis.forEach(emoji => {
      emoji.addEventListener('click', (e) => this._handleEmojiClick(e, emojis));
    });

    // Mic icon (if supported)
    if (RecordingManager.isSupported()) {
      this.micIcon = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-mic`);
      if (this.micIcon) {
        this.micIcon.addEventListener('click', () => this._toggleRecording());
      }
    }

    // Keyboard shortcuts
    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        this.submit();
      }
    });
  }

  /**
   * Handle emoji click
   */
  _handleEmojiClick(event, allEmojis) {
    const emoji = event.target;
    const emojiValue = emoji.dataset.emoji;

    // Add emoji to textarea
    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    const currentText = textarea.value;
    textarea.value = currentText ? `${currentText} ${emojiValue}` : emojiValue;

    // Visual feedback
    this.selectedEmoji = emojiValue;
    allEmojis.forEach(e => {
      e.style.transform = '';
      e.style.filter = '';
    });
    emoji.style.transform = 'translateY(-2px) scale(1.2)';
    emoji.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';

    // Auto-submit after delay
    setTimeout(() => this.submit(), 500);
  }

  /**
   * Toggle recording
   */
  async _toggleRecording() {
    if (this.recordingManager.isRecording) {
      await this._stopRecording();
    } else {
      await this._startRecording();
    }
  }

  /**
   * Start recording
   */
  async _startRecording() {
    try {
      await this.recordingManager.startRecording();
      this.micIcon.classList.add(`${CONFIG.CLASS_PREFIX}recording`);
      this._showRecordingUI();
    } catch (error) {
      console.error('[Tapko] Recording error:', error);
      this._showError(error.message);
    }
  }

  /**
   * Stop recording
   */
  async _stopRecording() {
    try {
      const result = await this.recordingManager.stopRecording();
      this.micIcon.classList.remove(`${CONFIG.CLASS_PREFIX}recording`);
      this._hideRecordingUI();
      return result;
    } catch (error) {
      console.error('[Tapko] Stop recording error:', error);
      this._showError('Failed to stop recording');
      return null;
    }
  }

  /**
   * Show recording UI
   */
  _showRecordingUI() {
    const inputWrapper = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-input-wrapper`);

    this.recordingPill = createElement('div', `${CONFIG.CLASS_PREFIX}recording-pill`);
    this.recordingPill.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}recording-dot"></div>
      <span>Recording</span>
      <span class="${CONFIG.CLASS_PREFIX}recording-timer">00:00</span>
    `;

    this.timerSpan = this.recordingPill.querySelector(`.${CONFIG.CLASS_PREFIX}recording-timer`);
    inputWrapper.appendChild(this.recordingPill);

    // Update timer
    this.timerInterval = setInterval(() => {
      if (this.timerSpan) {
        this.timerSpan.textContent = this.recordingManager.getFormattedDuration();
      }
    }, 1000);
  }

  /**
   * Hide recording UI
   */
  _hideRecordingUI() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.recordingPill) {
      this.recordingPill.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.recordingPill.style.opacity = '0';
      this.recordingPill.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (this.recordingPill) this.recordingPill.remove();
      }, 300);
    }
  }

  /**
   * Submit comment
   */
  async submit() {
    if (this.isSubmitting) return;

    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    const text = textarea.value.trim();

    // Stop recording if active
    let audioData = null;
    if (this.recordingManager.isRecording) {
      audioData = await this._stopRecording();
    }

    // Validate input
    if (!text && !audioData) {
      this._showError('Please enter a comment or record audio');
      return;
    }

    this.isSubmitting = true;
    this._showLoading();

    try {
      // Prepare comment data
      const commentData = {
        text: sanitizeHTML(text),
        emoji: this.selectedEmoji,
        targetElement: {
          tag: this.target.tagName,
          id: this.target.id,
          className: this.target.className
        },
        hasAudio: !!audioData
      };

      // Submit comment
      const response = await this.apiClient.submitComment(commentData);

      // Upload audio if available
      if (audioData && response.commentId) {
        await this.apiClient.uploadVoiceRecording(audioData.blob, response.commentId);
      }

      // Track success
      this.apiClient.trackEvent('comment_submitted', {
        hasText: !!text,
        hasAudio: !!audioData,
        hasEmoji: !!this.selectedEmoji
      });

      // Show success state
      this._showSuccess(text || '(Voice comment)');

      // Dispatch event
      dispatchCustomEvent(CONFIG.EVENTS.COMMENT_SUBMITTED, {
        commentId: response.commentId,
        data: commentData
      });
    } catch (error) {
      console.error('[Tapko] Submit error:', error);
      this._showError('Failed to submit comment. Please try again.');
      this.isSubmitting = false;
    }
  }

  /**
   * Show loading state
   */
  _showLoading() {
    const footer = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-footer`);
    const submitBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-submit`);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  /**
   * Show success state
   */
  _showSuccess(text) {
    const inputWrapper = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-input-wrapper`);
    const divider = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-divider`);
    const footer = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-footer`);

    if (inputWrapper) inputWrapper.remove();
    if (divider) divider.remove();
    if (footer) footer.remove();

    const finalEl = createElement('div', `${CONFIG.CLASS_PREFIX}comment-final`);
    finalEl.textContent = text;
    this.card.appendChild(finalEl);

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
      const footer = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-footer`);
      footer.parentNode.insertBefore(errorEl, footer);
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
    if (this.recordingManager.isRecording) {
      this.recordingManager.cancelRecording();
    }

    // Cleanup
    this._cleanup();

    // Remove with animation
    removeElement(this.card, true);

    // Track event
    this.apiClient.trackEvent('comment_card_closed');

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
  }

  /**
   * Destroy component
   */
  destroy() {
    this._cleanup();
    if (this.card && this.card.parentNode) {
      this.card.parentNode.removeChild(this.card);
    }
  }
}

export { CommentCard };
