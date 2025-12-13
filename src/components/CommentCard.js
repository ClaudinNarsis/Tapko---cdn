/**
 * Comment Card Component
 * Manages individual comment bubble UI with drawing support
 *
 * Features:
 * - Simple bubble UI that opens immediately next to tap point
 * - Includes "Draw on page" button
 * - Minimizes to floating pill when drawing
 * - Auto-focus on open
 * - ESC to cancel, Enter to submit
 */

import { CONFIG } from '../config.js';
import { RecordingManager } from '../managers/RecordingManager.js';
import { logManager } from '../managers/LogManager.js';
import { dataURLToBlob, captureViewportScreenshot, generateThumbnail } from '../utils/screenshot.js';
import {
  createElement,
  removeElement,
  sanitizeHTML,
  dispatchCustomEvent,
  getFeedbackPosition,
  getBrowserInfo,
  getCurrentBreakpoint
} from '../utils/dom.js';

class CommentCard {
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
    this.screenshot = null;
    this.thumbnail = null;
    this.screenshotMetadata = null;

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
      this.onDrawRequested((completeData) => {
        // Store all data from drawing completion
        if (completeData) {
          this.drawingData = completeData.dataURL ? completeData : null;
          this.screenshot = completeData.screenshot || null;
          this.thumbnail = completeData.thumbnail || null;
          this.screenshotMetadata = completeData.screenshotMetadata || null;
        }
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
    this.card.style.display = 'none';
  }

  /**
   * Restore card from minimized state
   */
  restore() {
    if (!this.isMinimized) return;

    this.isMinimized = false;
    this.card.classList.remove(`${CONFIG.CLASS_PREFIX}minimized`);
    this.card.style.display = '';

    // Re-create bubble content
    const bubble = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-bubble`);
    if (bubble) {
      const currentText = this._getCurrentText();

      // Build screenshot preview HTML if available
      let screenshotPreviewHTML = '';
      if (this.thumbnail && this.screenshotMetadata) {
        const meta = this.screenshotMetadata;
        screenshotPreviewHTML = `
          <div class="${CONFIG.CLASS_PREFIX}screenshot-preview">
            <img src="${this.thumbnail}" alt="Screenshot" />
            <span class="${CONFIG.CLASS_PREFIX}screenshot-info">
              Viewport: ${meta.viewportWidth}×${meta.viewportHeight} at scroll (${meta.scrollX}, ${meta.scrollY})
            </span>
            <button type="button" class="${CONFIG.CLASS_PREFIX}remove-screenshot" title="Remove screenshot">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        `;
      }

      bubble.innerHTML = `
        <textarea
          class="${CONFIG.CLASS_PREFIX}comment-textarea"
          rows="3"
          placeholder="What's on your mind?"
          maxlength="500"
        >${currentText}</textarea>
        ${screenshotPreviewHTML}
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

      // Attach remove screenshot button event if present
      if (this.thumbnail) {
        const removeBtn = bubble.querySelector(`.${CONFIG.CLASS_PREFIX}remove-screenshot`);
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            this.screenshot = null;
            this.thumbnail = null;
            this.screenshotMetadata = null;
            this.restore(); // Re-render without screenshot
          });
        }

        // Add click handler on thumbnail to show fullscreen
        const thumbnailImg = bubble.querySelector(`.${CONFIG.CLASS_PREFIX}screenshot-preview img`);
        if (thumbnailImg) {
          thumbnailImg.style.cursor = 'pointer';
          thumbnailImg.addEventListener('click', () => {
            this._showFullscreenScreenshot();
          });
        }
      }
    }

    this._focusTextarea();
  }

  /**
   * Show fullscreen screenshot preview
   */
  _showFullscreenScreenshot() {
    if (!this.screenshot) return;

    // Create fullscreen overlay
    const overlay = createElement('div', `${CONFIG.CLASS_PREFIX}screenshot-fullscreen`);
    overlay.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}screenshot-fullscreen-content">
        <button class="${CONFIG.CLASS_PREFIX}screenshot-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <img src="${this.screenshot}" alt="Full screenshot" />
      </div>
    `;

    // Add to body
    document.body.appendChild(overlay);

    // Show with animation
    requestAnimationFrame(() => {
      overlay.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    // Close handlers
    const closeBtn = overlay.querySelector(`.${CONFIG.CLASS_PREFIX}screenshot-close`);
    const closeFullscreen = () => {
      overlay.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    };

    closeBtn.addEventListener('click', closeFullscreen);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeFullscreen();
      }
    });

    // ESC key to close
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeFullscreen();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
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

    try {
      // 0. Auto-capture screenshot if not already present
      if (!this.screenshot) {
        this._showLoading('Capturing screenshot...');

        // Set screenshot mode to clean up UI
        this.card.classList.add(`${CONFIG.CLASS_PREFIX}screenshot-mode`);

        // Handle text rendering for screenshot
        // html2canvas issues with textarea: replace with div
        let textDiv = null;
        if (textarea) {
          // Create temporary div to display text
          textDiv = document.createElement('div');
          textDiv.className = textarea.className;
          textDiv.textContent = textarea.value;

          // Apply critical styles to match textarea look
          const style = window.getComputedStyle(textarea);
          textDiv.style.font = style.font;
          textDiv.style.lineHeight = style.lineHeight;
          textDiv.style.padding = style.padding;
          textDiv.style.minHeight = style.height; // Use current height
          textDiv.style.whiteSpace = 'pre-wrap';
          textDiv.style.wordBreak = 'break-word';
          textDiv.style.color = style.color;

          // Insert div and hide textarea
          textarea.parentNode.insertBefore(textDiv, textarea);
          textarea.style.display = 'none';
        }

        // Brief delay to ensure render update
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
          // Capture screenshot INCLUDING this card and the pin
          const screenshotData = await captureViewportScreenshot({
            elementsToInclude: [this.card, this.pinMarker]
          });

          this.screenshot = screenshotData.dataURL;
          this.screenshotMetadata = screenshotData.metadata;
          this.thumbnail = await generateThumbnail(this.screenshot);
        } catch (e) {
          console.warn('[Tapko] Auto-screenshot failed:', e);
          // Proceed without screenshot if it fails
        } finally {
          // Restore UI
          this.card.classList.remove(`${CONFIG.CLASS_PREFIX}screenshot-mode`);

          if (textDiv) {
            textDiv.remove();
            textarea.style.display = '';
          }
        }
      }

      this._showLoading('Submitting...');

      // 1. Prepare assets
      const assets = {
        screenshot: null,
        logs: null
      };

      // 1a. Prepare screenshot if available
      if (this.screenshot) {
        const blob = dataURLToBlob(this.screenshot);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        assets.screenshot = { blob, fileName, type: 'image/png', folder: 'screenshots' };
      }

      // 1b. Prepare logs
      const logsBlob = logManager.getLogsAsTextBlob();
      const logsFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.txt`;
      assets.logs = { blob: logsBlob, fileName: logsFileName, type: 'text/plain', folder: 'logs' };

      // 2. Upload assets to S3
      const uploadedAssets = {};

      for (const [key, asset] of Object.entries(assets)) {
        if (!asset) continue;

        try {
          // Get presigned URL
          const presigned = await this.apiClient.getPresignedUrl({
            folderName: asset.folder,
            fileName: asset.fileName,
            fileType: asset.type
          });

          if (!presigned || !presigned.success || !presigned.data) {
            console.warn(`[Tapko] Failed to get presigned URL for ${key}`);
            continue;
          }

          // Upload to S3
          await this.apiClient.uploadToS3(
            presigned.data.uploadUrl,
            asset.blob,
            asset.type
          );

          // Store successful upload info
          uploadedAssets[key] = {
            key: presigned.data.key,
            url: presigned.data.url, // Assuming backend returns public/signed URL or we construct it
            bucket: presigned.data.bucket, // Optional
            mimeType: asset.type,
            ...(key === 'screenshot' && this.screenshotMetadata ? { metadata: this.screenshotMetadata } : {})
          };
        } catch (e) {
          console.error(`[Tapko] Failed to upload ${key}:`, e);
          // Continue even if upload fails? Or fail hard?
          // For now, continue but maybe log it
        }
      }

      // 3. Prepare final payload
      const feedbackPosition = getFeedbackPosition(this.target);
      const browserInfo = getBrowserInfo();
      const breakpoint = getCurrentBreakpoint();

      const payload = {
        title: this._generateFeedbackTitle(text),
        description: sanitizeHTML(text),
        assets: uploadedAssets,
        context: {
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          viewport: this.screenshotMetadata ? {
            width: this.screenshotMetadata.viewportWidth,
            height: this.screenshotMetadata.viewportHeight,
            devicePixelRatio: this.screenshotMetadata.devicePixelRatio
          } : undefined,
          browserInfo,
          breakpoint,
          feedbackPosition,
          // Explicitly include the comment box location relative to the page
          commentPosition: {
            x: this.coordinates.x + (window.pageXOffset || document.documentElement.scrollLeft),
            y: this.coordinates.y + (window.pageYOffset || document.documentElement.scrollTop)
          }
        },
        // Legacy fields for backward compatibility if needed
        projectId: this.apiClient.projectId,
        userId: this.apiClient.userId
      };

      // 4. Submit feedback
      const response = await this.apiClient.submitFeedback(payload);

      // Show success state
      this._showSuccess(text || '(Drawing)');

      // Dispatch event
      dispatchCustomEvent(CONFIG.EVENTS.COMMENT_SUBMITTED, {
        feedbackId: response.feedbackId,
        data: payload
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
  _showLoading(text = 'Submitting...') {
    const submitBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-submit`);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = text;
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

export { CommentCard };
