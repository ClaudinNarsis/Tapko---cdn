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
  constructor(target, coordinates, apiClient, shadowRoot = document.body) {
    this.target = target;
    this.coordinates = coordinates;
    this.apiClient = apiClient;
    this.shadowRoot = shadowRoot;
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
    this.screenshotProvider = null; // NEW: Callback to get current screenshot from background

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

    // Position at exact client location (shadow host is fixed/full-screen)
    this.pinMarker.style.left = `${this.coordinates.x}px`;
    this.pinMarker.style.top = `${this.coordinates.y}px`;
    this.pinMarker.style.zIndex = CONFIG.UI.zIndex;

    // Append to shadow root
    this.shadowRoot.appendChild(this.pinMarker);
  }

  /**
   * Setup scroll listener to update positions
   */
  _setupScrollListener() {
    if (this.screenshotProvider) return; // Static background, no need to follow scroll

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

    // Update pin marker position relative to viewport (shadow host is fixed)
    this.pinMarker.style.left = `${targetRect.left + this.clickOffsetX}px`;
    this.pinMarker.style.top = `${targetRect.top + this.clickOffsetY}px`;

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

    // Append to shadow root
    this.shadowRoot.appendChild(card);
    return card;
  }

  /**
   * Position card next to pin marker
   */
  _positionCard() {
    requestAnimationFrame(() => {
      const cardWidth = this.card.offsetWidth || CONFIG.UI.cardMinWidth;
      const cardHeight = this.card.offsetHeight || 150;

      const targetRect = this.target.getBoundingClientRect();

      // Calculate position relative to viewport (shadow host is fixed)
      const clickAbsoluteX = targetRect.left + this.clickOffsetX;
      const clickAbsoluteY = targetRect.top + this.clickOffsetY;

      // Position card next to click location
      let left = clickAbsoluteX + 10;
      let top = clickAbsoluteY;

      // Adjust if overflowing viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left + cardWidth > viewportWidth) {
        left = clickAbsoluteX - cardWidth - 10;
      }

      if (top + cardHeight > viewportHeight) {
        top = viewportHeight - cardHeight - 10;
      }

      if (left < 10) left = 10;
      if (top < 10) top = 10;

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
   * NEW: Captures screenshot FIRST, then enters drawing mode
   */
  async _handleDrawClick() {
    // Get draw button for loading state
    const drawBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-draw`);

    // If we don't have a screenshot yet, capture it first
    if (!this.screenshot && this.onDrawRequested) {
      try {
        // Show loading state on button
        if (drawBtn) {
          drawBtn.disabled = true;
          drawBtn.innerHTML = `
            <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}spinner">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
              <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
            </svg>
            Capturing screenshot...
          `;
        }

        // Capture screenshot of current viewport
        const screenshotData = await captureViewportScreenshot();

        // Reset button
        if (drawBtn) {
          drawBtn.disabled = false;
          drawBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M12 19l7-7 3 3-7 7-3-3z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M2 2l7.586 7.586" stroke="currentColor" stroke-width="2"/>
              <circle cx="11" cy="11" r="2" fill="currentColor"/>
            </svg>
            ${this.screenshot ? 'Edit drawing' : 'Draw on page'}
          `;
        }

        // Minimize card
        this.minimize();

        // Pass screenshot to drawing mode
        this.onDrawRequested((drawingData) => {
          // Handle drawing completion
          if (drawingData) {
            this.screenshot = drawingData.finalScreenshot;  // Canvas with screenshot + annotations
            this.thumbnail = drawingData.thumbnail;
            this.screenshotMetadata = drawingData.metadata;
            this.drawingData = drawingData.finalScreenshot;  // For compatibility
          }
          this.restore();
        }, screenshotData);

      } catch (error) {
        console.error('[Tapko] Screenshot capture failed:', error);

        // Reset button on error
        if (drawBtn) {
          drawBtn.disabled = false;
          drawBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M12 19l7-7 3 3-7 7-3-3z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M2 2l7.586 7.586" stroke="currentColor" stroke-width="2"/>
              <circle cx="11" cy="11" r="2" fill="currentColor"/>
            </svg>
            Draw on page
          `;
        }

        // Show error to user
        alert('Failed to capture screenshot. Please try again.');
      }
    } else if (this.onDrawRequested) {
      // Edit existing drawing - pass existing screenshot
      this.minimize();
      this.onDrawRequested((drawingData) => {
        if (drawingData) {
          this.screenshot = drawingData.finalScreenshot;
          this.thumbnail = drawingData.thumbnail;
          this.screenshotMetadata = drawingData.metadata;
          this.drawingData = drawingData.finalScreenshot;
        }
        this.restore();
      }, { dataURL: this.screenshot, metadata: this.screenshotMetadata });
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

    // Re-render bubble content
    this._renderBubbleContent();

    this._focusTextarea();
  }

  /**
   * Render or re-render the bubble content
   */
  _renderBubbleContent() {
    const bubble = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-bubble`);
    if (!bubble) return;

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
        ${!this.screenshotProvider ? `
        <button type="button" class="${CONFIG.CLASS_PREFIX}btn-draw">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M12 19l7-7 3 3-7 7-3-3z" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M2 2l7.586 7.586" stroke="currentColor" stroke-width="2"/>
            <circle cx="11" cy="11" r="2" fill="currentColor"/>
          </svg>
          ${this.drawingData ? 'Edit drawing' : 'Draw on page'}
        </button>
        ` : ''}
        <button type="button" class="${CONFIG.CLASS_PREFIX}btn-submit">Submit</button>
      </div>
    `;

    // Re-attach events
    this._attachEventListeners();

    // Attach remove screenshot button event if present
    if (this.thumbnail) {
      const removeBtn = bubble.querySelector(`.${CONFIG.CLASS_PREFIX}remove-screenshot`);
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.drawingData = null;
          this.screenshot = null;
          this.thumbnail = null;
          this.screenshotMetadata = null;
          this._renderBubbleContent(); // Re-render without screenshot
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

    // Add to shadow root
    this.shadowRoot.appendChild(overlay);

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
  /**
   * Set draw request callback
   */
  setDrawCallback(callback) {
    this.onDrawRequested = callback;
  }

  /**
   * Set screenshot provider callback
   */
  setScreenshotProvider(callback) {
    this.screenshotProvider = callback;
    this._renderBubbleContent();
  }

  /**
   * Submit comment
   */
  async submit() {
    const timingStart = performance.now();
    console.log('[Tapko] ========== QUEUED SUBMIT STARTED ==========');

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
      // Check if queue is available (IndexedDB supported)
      const useQueue = window.Tapko?.queueManager?.initialized;

      if (useQueue) {
        // NEW QUEUED FLOW - Instant submission with background sync
        await this._submitQueued(text, textarea);
      } else {
        // LEGACY SYNCHRONOUS FLOW - Fallback for unsupported browsers
        console.warn('[Tapko] Queue not available, using legacy synchronous submission');
        await this._submitLegacy(text, textarea, timingStart);
      }

    } catch (error) {
      console.error('[Tapko] Submit error:', error);
      this._showError('Failed to submit comment. Please try again.');
      this.isSubmitting = false;
    }
  }

  /**
   * NEW: Queued submission flow - instant with background sync
   */
  async _submitQueued(text, textarea) {
    console.log('[Tapko] Using queued submission flow...');

    this._showLoading('Preparing...');

    // 1. Auto-capture screenshot if not already present
    if (!this.screenshot) {
      if (this.screenshotProvider) {
        // Use external provider (integrated flow)
        const data = await this.screenshotProvider();
        if (data) {
          this.screenshot = data.finalScreenshot;
          this.thumbnail = data.thumbnail;
          this.screenshotMetadata = data.metadata;
        }
      } else {
        // Normal flow capture
        await this._captureScreenshot(textarea);
      }
    }

    // 2. Prepare screenshot blob
    let screenshotBlob = null;
    if (this.screenshot) {
      screenshotBlob = dataURLToBlob(this.screenshot);
      console.log('[Tapko Queue] Screenshot blob prepared:', screenshotBlob.size, 'bytes');
    }

    // 3. Prepare logs blob
    const logsBlob = logManager.getLogsAsTextBlob();
    console.log('[Tapko Queue] Logs blob prepared:', logsBlob.size, 'bytes');

    // 4. Prepare context
    const feedbackPosition = getFeedbackPosition(this.target);
    const browserInfo = getBrowserInfo();
    const breakpoint = getCurrentBreakpoint();

    const feedbackData = {
      title: this._generateFeedbackTitle(text),
      description: sanitizeHTML(text),
      screenshot: screenshotBlob,
      logs: logsBlob,
      context: {
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        viewport: this.screenshotMetadata ? {
          width: this.screenshotMetadata.viewportWidth,
          height: this.screenshotMetadata.viewportHeight,
          devicePixelRatio: this.screenshotMetadata.devicePixelRatio
        } : {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        },
        browserInfo,
        breakpoint,
        feedbackPosition,
        commentPosition: {
          x: this.coordinates.x + (window.pageXOffset || document.documentElement.scrollLeft),
          y: this.coordinates.y + (window.pageYOffset || document.documentElement.scrollTop)
        }
      },
      idempotencyKey: `${this.apiClient.userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      projectId: this.apiClient.projectId,
      userId: this.apiClient.userId
    };

    // 5. Add to queue (instant!)
    const queueId = await window.Tapko.queueManager.enqueue(feedbackData);
    console.log('[Tapko Queue] Feedback queued successfully:', queueId);

    // 6. Show "queued" success state
    this._showQueued();

    // 7. Dispatch events
    dispatchCustomEvent('tapko:comment:queued', { queueId });
    dispatchCustomEvent(CONFIG.EVENTS.COMMENT_SUBMITTED, {
      queueId,
      hasText: !!text,
      hasEmoji: !!this.selectedEmoji,
      hasScreenshot: !!this.screenshot,
      hasDrawing: !!this.drawingData,
      hasRecording: this.recordingManager.hasRecording(),
      targetTag: this.target.tagName,
      commentLength: text.length,
      wasQueued: true
    });

    // 8. Close card after brief confirmation display
    setTimeout(() => {
      this.close();
    }, 1500);

    // 9. Trigger queue processing (async, non-blocking)
    setTimeout(() => {
      window.Tapko.queueManager.processQueue();
    }, 100);
  }

  /**
   * LEGACY: Original synchronous submission flow
   */
  async _submitLegacy(text, textarea, timingStart) {
    console.log('[Tapko Timing] ========== LEGACY SUBMIT STARTED ==========');

    // 0. Auto-capture screenshot if not already present
    const screenshotStart = performance.now();
    if (!this.screenshot) {
      await this._captureScreenshot(textarea);
    }
    const screenshotEnd = performance.now();
    console.log(`[Tapko Timing] Screenshot capture: ${(screenshotEnd - screenshotStart).toFixed(2)}ms`);

    this._showLoading('Submitting...');

    // 1. Prepare assets
    const prepareStart = performance.now();
    const assets = {
      screenshot: null,
      logs: null
    };

    // 1a. Prepare screenshot if available
    if (this.screenshot) {
      const blob = dataURLToBlob(this.screenshot);
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      assets.screenshot = { blob, fileName, type: 'image/jpeg', folder: 'screenshots' };
    }

    // 1b. Prepare logs
    const logsBlob = logManager.getLogsAsTextBlob();
    const logsFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.txt`;
    assets.logs = { blob: logsBlob, fileName: logsFileName, type: 'text/plain', folder: 'logs' };

    const prepareEnd = performance.now();
    console.log(`[Tapko Timing] Asset preparation: ${(prepareEnd - prepareStart).toFixed(2)}ms`);

    // 2. Upload assets to S3 (in parallel for performance)
    const uploadStart = performance.now();
    const uploadedAssets = {};

    const uploadPromises = Object.entries(assets).map(async ([key, asset]) => {
      if (!asset) return null;

      try {
        const presigned = await this.apiClient.getPresignedUrl({
          folderName: asset.folder,
          fileName: asset.fileName,
          fileType: asset.type
        });

        if (!presigned || !presigned.success || !presigned.data) {
          return null;
        }

        await this.apiClient.uploadToS3(
          presigned.data.uploadUrl,
          asset.blob,
          asset.type
        );

        const uploadInfo = {
          key: presigned.data.key,
          url: presigned.data.url,
          bucket: presigned.data.bucket,
          mimeType: asset.type,
          ...(key === 'screenshot' && this.screenshotMetadata ? { metadata: this.screenshotMetadata } : {})
        };

        return { key, uploadInfo };
      } catch (e) {
        console.error(`[Tapko Upload] Failed to upload ${key}:`, e);
        return null;
      }
    });

    const uploadResults = await Promise.all(uploadPromises);
    uploadResults.forEach(result => {
      if (result && result.uploadInfo) {
        uploadedAssets[result.key] = result.uploadInfo;
      }
    });

    const uploadEnd = performance.now();
    console.log(`[Tapko Timing] Total upload time: ${(uploadEnd - uploadStart).toFixed(2)}ms`);

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
        commentPosition: {
          x: this.coordinates.x + (window.pageXOffset || document.documentElement.scrollLeft),
          y: this.coordinates.y + (window.pageYOffset || document.documentElement.scrollTop)
        }
      },
      idempotencyKey: `${this.apiClient.userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      projectId: this.apiClient.projectId,
      userId: this.apiClient.userId
    };

    // 4. Submit feedback
    const submitStart = performance.now();
    const response = await this.apiClient.submitFeedback(payload);
    const submitEnd = performance.now();
    console.log(`[Tapko Timing] Feedback API submission: ${(submitEnd - submitStart).toFixed(2)}ms`);

    // Show success state
    this._showSuccess(text || '(Drawing)');

    // Dispatch event
    dispatchCustomEvent(CONFIG.EVENTS.COMMENT_SUBMITTED, {
      feedbackId: response.feedbackId,
      data: payload,
      hasText: !!text,
      hasEmoji: !!this.selectedEmoji,
      hasScreenshot: !!this.screenshot,
      hasDrawing: !!this.drawingData,
      hasRecording: this.recordingManager.hasRecording(),
      targetTag: this.target.tagName,
      commentLength: text.length,
      wasQueued: false
    });

    const timingEnd = performance.now();
    console.log(`[Tapko Timing] ========== TOTAL SUBMIT TIME: ${(timingEnd - timingStart).toFixed(2)}ms ==========`);
  }

  /**
   * Capture screenshot helper
   */
  async _captureScreenshot(textarea) {
    this._showLoading('Capturing screenshot...');

    // Set screenshot mode to clean up UI
    this.card.classList.add(`${CONFIG.CLASS_PREFIX}screenshot-mode`);

    // Handle text rendering for screenshot
    let textDiv = null;
    if (textarea) {
      textDiv = document.createElement('div');
      textDiv.className = textarea.className;
      textDiv.textContent = textarea.value;

      const style = window.getComputedStyle(textarea);
      textDiv.style.font = style.font;
      textDiv.style.lineHeight = style.lineHeight;
      textDiv.style.padding = style.padding;
      textDiv.style.minHeight = style.height;
      textDiv.style.whiteSpace = 'pre-wrap';
      textDiv.style.wordBreak = 'break-word';
      textDiv.style.color = style.color;

      textarea.parentNode.insertBefore(textDiv, textarea);
      textarea.style.display = 'none';
    }

    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // Don't include widget elements in screenshot - they're in shadow DOM and just UI
      // The screenshot should capture the actual page content only
      const screenshotData = await captureViewportScreenshot();

      this.screenshot = screenshotData.dataURL;
      this.screenshotMetadata = screenshotData.metadata;
      this.thumbnail = await generateThumbnail(this.screenshot);
    } catch (e) {
      console.warn('[Tapko] Auto-screenshot failed:', e);
    } finally {
      this.card.classList.remove(`${CONFIG.CLASS_PREFIX}screenshot-mode`);

      if (textDiv) {
        textDiv.remove();
        textarea.style.display = '';
      }
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
   * Show queued state (NEW for queued flow)
   */
  _showQueued() {
    const bubble = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-bubble`);
    const text = this._getCurrentText() || '(Drawing)';

    if (bubble) {
      bubble.innerHTML = `
        <div class="${CONFIG.CLASS_PREFIX}comment-queued">
          <div class="${CONFIG.CLASS_PREFIX}feedback-text">${sanitizeHTML(text)}</div>
          <div class="${CONFIG.CLASS_PREFIX}queued-status">
            <svg class="${CONFIG.CLASS_PREFIX}checkmark-icon" viewBox="0 0 52 52" width="52" height="52">
              <circle class="${CONFIG.CLASS_PREFIX}checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
              <path class="${CONFIG.CLASS_PREFIX}checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
        </div>
      `;
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
