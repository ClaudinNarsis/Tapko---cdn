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
import { networkLogManager } from '../managers/NetworkLogManager.js';
import debugLogger from '../utils/DebugLogger.js';
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
  constructor(target, coordinates, apiClient, shadowRoot = document.body, pinManager = null) {
    this.target = target;
    this.coordinates = coordinates;
    this.apiClient = apiClient;
    this.shadowRoot = shadowRoot;
    this.pinManager = pinManager; // NEW: Pin manager for persistent pins
    this.feedbackWidget = null; // NEW: Feedback widget reference for hiding during screenshot
    this.card = null;
    this.pinMarker = null;
    this.draftPinId = null; // NEW: Track draft pin ID
    this.recordingManager = new RecordingManager();
    this.selectedEmoji = null;
    this.isSubmitting = false;
    this.isMinimized = false;
    this.drawingData = null;
    this.screenshot = null;  // For backward compatibility (will be set to merged or unmerged)
    this.thumbnail = null;
    this.screenshotMetadata = null;
    // NEW: Separate storage for unmerged screenshot and annotation data
    this.screenshotDataURL = null;  // Unmerged screenshot for editing
    this.annotationData = null;     // {paths, strokeColor, strokeWidth}

    // Recording UI elements
    this.micIcon = null;
    this.recordingPill = null;
    this.timerSpan = null;
    this.timerInterval = null;

    // Callbacks
    this.onDrawRequested = null;
    this.screenshotProvider = null; // NEW: Callback to get current screenshot from background
    this.onSuccess = null; // NEW: Callback for successful submission

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
   * Create pin marker at tap location (draft pin - temporary)
   */
  _createPinMarker() {
    // Create draft pin with special styling
    this.pinMarker = createElement('div', `${CONFIG.CLASS_PREFIX}comment-pin ${CONFIG.CLASS_PREFIX}draft`);
    this.pinMarker.style.position = 'absolute';

    // Position at exact client location (shadow host is fixed/full-screen)
    this.pinMarker.style.left = `${this.coordinates.x}px`;
    this.pinMarker.style.top = `${this.coordinates.y}px`;
    this.pinMarker.style.zIndex = CONFIG.UI.zIndex;

    // Generate draft pin ID
    this.draftPinId = `draft-${Date.now()}`;

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
            Attach annotations
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
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        debugLogger.logUserAction('comment-card-cancel');
        this.close();
      });
    }

    // Submit button
    const submitBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-submit`);
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        debugLogger.logUserAction('comment-card-submit-click', { hasScreenshot: !!this.screenshot, hasAnnotation: !!this.annotationData });
        this.submit();
      });
    }

    // Draw button
    const drawBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-draw`);
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        debugLogger.logUserAction('comment-card-draw-click', { hasExistingScreenshot: !!this.screenshot });
        this._handleDrawClick();
      });
    }

    // Keyboard shortcuts
    const textarea = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
    if (textarea) {
      // Prevent all keyboard events from bubbling to the document
      // This stops website keyboard shortcuts from interfering with typing
      textarea.addEventListener('keydown', (e) => {
        e.stopPropagation();

        if (e.key === 'Escape') {
          this.close();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submit();
        }
      });

      // Also stop propagation for keyup and keypress to be thorough
      textarea.addEventListener('keyup', (e) => {
        e.stopPropagation();
      });

      textarea.addEventListener('keypress', (e) => {
        e.stopPropagation();
      });
    }
  }

  /**
   * Handle draw button click
   * NEW: Captures screenshot FIRST, then enters drawing mode
   */
  async _handleDrawClick() {
    debugLogger.startOperation('Handle draw click');
    debugLogger.logMemory('At start of draw click');

    // Get draw button for loading state
    const drawBtn = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-draw`);

    // If we don't have a screenshot yet, capture it first
    if (!this.screenshot && this.onDrawRequested) {
      try {
        debugLogger.info('No existing screenshot, will capture new one');

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

        // First, scroll pin to center if it's not visible
        await this._scrollPinToCenter();

        // Hide card and pin marker temporarily for clean screenshot
        this.card.style.display = 'none';
        this.pinMarker.style.display = 'none';

        // Hide old history pins and view all feedbacks button during screenshot
        if (this.pinManager) {
          this.pinManager.hide();
        }
        if (this.feedbackWidget) {
          this.feedbackWidget.hide();
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        try {
          debugLogger.info('Calling captureViewportScreenshot');
          // Capture screenshot of current viewport
          const screenshotData = await captureViewportScreenshot({ shadowRoot: this.shadowRoot });
          debugLogger.info('Screenshot capture returned', {
            hasDataURL: !!screenshotData.dataURL,
            dataURLLength: screenshotData.dataURL?.length
          });

          // Restore card and pin marker visibility
          this.card.style.display = '';
          this.pinMarker.style.display = '';

          // Restore old history pins and view all feedbacks button
          if (this.pinManager) {
            this.pinManager.show();
          }
          if (this.feedbackWidget) {
            this.feedbackWidget.show();
          }

          // Show processing message
          if (drawBtn) {
            drawBtn.disabled = true;
            drawBtn.innerHTML = `
              <svg viewBox="0 0 24 24" class="${CONFIG.CLASS_PREFIX}spinner">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
                <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
              </svg>
              Processing screenshot...
            `;
          }

          // Resize screenshot to safe dimensions BEFORE passing to drawing canvas
          debugLogger.info('Calling _resizeScreenshotForAnnotation');
          const resizedScreenshot = await this._resizeScreenshotForAnnotation(screenshotData.dataURL);
          debugLogger.info('Resize completed', { resizedLength: resizedScreenshot.length });

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
              ${this.annotationData ? 'Edit annotations' : 'Attach annotations'}
            `;
          }

          // Minimize card
          this.minimize();

          // Pass resized screenshot to drawing mode (with existing annotations if any)
          console.log('[Tapko CommentCard] Opening drawing mode with existing annotations:', this.annotationData);
          debugLogger.info('Opening drawing mode', {
            hasExistingAnnotations: !!this.annotationData,
            screenshotLength: resizedScreenshot.length
          });
          debugLogger.endOperation('Handle draw click', { success: true });
          this.onDrawRequested((drawingData) => {
            // Handle Done callback (NEW: receives unmerged data when user clicks Done)
            if (drawingData) {
              this.screenshotDataURL = drawingData.screenshotDataURL;  // Unmerged screenshot
              this.annotationData = drawingData.annotationData;        // Annotation data
              this.thumbnail = drawingData.thumbnail;                  // Merged preview
              this.screenshotMetadata = drawingData.metadata;

              console.log('[Tapko CommentCard] Annotation data saved after Done:', {
                hasAnnotations: this.annotationData?.hasAnnotations,
                pathCount: this.annotationData?.paths?.length
              });

              // For backward compatibility, set screenshot to unmerged
              this.screenshot = drawingData.screenshotDataURL;
              this.drawingData = drawingData.screenshotDataURL;
            }
            this.restore();
          }, { dataURL: resizedScreenshot, metadata: screenshotData.metadata }, this.annotationData);
        } catch (screenshotError) {
          // Restore visibility even on error
          this.card.style.display = '';
          this.pinMarker.style.display = '';

          // Restore old history pins and view all feedbacks button even on error
          if (this.pinManager) {
            this.pinManager.show();
          }
          if (this.feedbackWidget) {
            this.feedbackWidget.show();
          }

          throw screenshotError;
        }

      } catch (error) {
        debugLogger.error('Screenshot capture failed in _handleDrawClick', {
          error: error.message,
          stack: error.stack
        });
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
            Attach annotations
          `;
        }

        debugLogger.endOperation('Handle draw click', { success: false, error: error.message });

        // Show error to user
        alert('Failed to capture screenshot. Please try again.');
      }
    } else if (this.onDrawRequested) {
      // Edit existing drawing - pass existing screenshot and annotation data
      console.log('[Tapko CommentCard] Reopening drawing mode with annotations:', {
        hasScreenshot: !!this.screenshotDataURL,
        hasAnnotationData: !!this.annotationData,
        pathCount: this.annotationData?.paths?.length,
        annotationData: this.annotationData
      });
      this.minimize();
      this.onDrawRequested((drawingData) => {
        if (drawingData) {
          this.screenshotDataURL = drawingData.screenshotDataURL;  // Unmerged screenshot
          this.annotationData = drawingData.annotationData;        // Annotation data
          this.thumbnail = drawingData.thumbnail;                  // Merged preview
          this.screenshotMetadata = drawingData.metadata;

          console.log('[Tapko CommentCard] Annotation data updated after reopen Done:', {
            hasAnnotations: this.annotationData?.hasAnnotations,
            pathCount: this.annotationData?.paths?.length
          });

          // For backward compatibility
          this.screenshot = drawingData.screenshotDataURL;
          this.drawingData = drawingData.screenshotDataURL;
        }
        this.restore();
      }, { dataURL: this.screenshotDataURL || this.screenshot, metadata: this.screenshotMetadata }, this.annotationData);
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
          ${this.drawingData ? 'Edit annotations' : 'Attach annotations'}
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

      // Add click handler on thumbnail to edit annotations
      const thumbnailImg = bubble.querySelector(`.${CONFIG.CLASS_PREFIX}screenshot-preview img`);
      if (thumbnailImg) {
        thumbnailImg.style.cursor = 'pointer';
        thumbnailImg.addEventListener('click', () => {
          // Open drawing canvas with existing annotations (same as "Edit annotations" button)
          this._handleDrawClick();
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
   * Set success callback
   */
  setOnSuccess(callback) {
    this.onSuccess = callback;
  }

  /**
   * Set screenshot provider callback
   */
  setScreenshotProvider(callback) {
    this.screenshotProvider = callback;
    this._renderBubbleContent();
  }

  /**
   * Set feedback widget reference for hiding during screenshots
   */
  setFeedbackWidget(feedbackWidget) {
    this.feedbackWidget = feedbackWidget;
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

    // 2. Prepare screenshot blob (UNMERGED)
    let screenshotBlob = null;
    if (this.screenshotDataURL || this.screenshot) {
      // Prefer screenshotDataURL (unmerged), fallback to screenshot for backward compat
      const dataURL = this.screenshotDataURL || this.screenshot;
      screenshotBlob = dataURLToBlob(dataURL);
      console.log('[Tapko Queue] Screenshot blob prepared (unmerged):', screenshotBlob.size, 'bytes');
    }

    // 3. Prepare logs blob
    const logsBlob = logManager.getLogsAsTextBlob();
    console.log('[Tapko Queue] Logs blob prepared:', logsBlob.size, 'bytes');

    // 3b. Prepare network logs blob
    const networkLogsBlob = networkLogManager.getNetworkLogsAsJsonBlob();
    console.log('[Tapko Queue] Network logs blob prepared:', networkLogsBlob.size, 'bytes');

    // 4. Prepare context
    const feedbackPosition = getFeedbackPosition(this.target);
    const browserInfo = getBrowserInfo();
    const breakpoint = getCurrentBreakpoint();

    const feedbackData = {
      title: this._generateFeedbackTitle(text),
      description: sanitizeHTML(text),
      screenshot: screenshotBlob,              // Unmerged screenshot blob
      annotationData: this.annotationData,     // NEW: Annotation data
      logs: logsBlob,
      networkLogs: networkLogsBlob,
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

    // 6. Show success state
    this._showQueued();

    // 8. Trigger success callback
    if (this.onSuccess) {
      setTimeout(() => this.onSuccess(), 1000); // Small delay to show success UI
    }

    // 9. Dispatch events
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

    // 1a. Prepare screenshot if available (merge annotations if needed)
    if (this.screenshotDataURL || this.screenshot) {
      let screenshotBlob = dataURLToBlob(this.screenshotDataURL || this.screenshot);

      // Merge annotations if they exist
      if (this.annotationData && this.annotationData.paths && this.annotationData.paths.length > 0) {
        console.log('[Tapko Legacy] Merging', this.annotationData.paths.length, 'annotations...');
        screenshotBlob = await this._mergeAnnotationsHelper(screenshotBlob, this.annotationData);
      }

      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      assets.screenshot = { blob: screenshotBlob, fileName, type: 'image/jpeg', folder: 'screenshots' };
    }

    // 1b. Prepare logs
    const logsBlob = logManager.getLogsAsTextBlob();
    const logsFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.txt`;
    assets.logs = { blob: logsBlob, fileName: logsFileName, type: 'text/plain', folder: 'logs' };

    // 1c. Prepare network logs
    const networkLogsBlob = networkLogManager.getNetworkLogsAsJsonBlob();
    const networkLogsFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-network.txt`;
    assets.networkLogs = { blob: networkLogsBlob, fileName: networkLogsFileName, type: 'text/plain', folder: 'logs' };

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
   * Check if pin marker is visible in the viewport
   */
  _isPinVisible() {
    if (!this.pinMarker) return true; // If no pin, consider it visible

    const pinRect = this.pinMarker.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check if pin is within viewport bounds
    const isVisible = (
      pinRect.top >= 0 &&
      pinRect.left >= 0 &&
      pinRect.bottom <= viewportHeight &&
      pinRect.right <= viewportWidth
    );

    return isVisible;
  }

  /**
   * Scroll the pin marker to the center of the viewport
   * Only scrolls if pin is completely out of view
   */
  async _scrollPinToCenter() {
    if (!this.target || !this.pinMarker) return;

    // Check if pin is visible
    if (this._isPinVisible()) {
      console.log('[Tapko] Pin is visible, no scrolling needed');
      return;
    }

    console.log('[Tapko] Pin not visible, scrolling to center...');

    // Get the pin's absolute position on the page
    const targetRect = this.target.getBoundingClientRect();
    const pinAbsoluteX = targetRect.left + this.clickOffsetX + (window.pageXOffset || document.documentElement.scrollLeft);
    const pinAbsoluteY = targetRect.top + this.clickOffsetY + (window.pageYOffset || document.documentElement.scrollTop);

    // Calculate scroll position to center the pin
    const scrollX = pinAbsoluteX - (window.innerWidth / 2);
    const scrollY = pinAbsoluteY - (window.innerHeight / 2);

    // Smooth scroll to position
    window.scrollTo({
      left: scrollX,
      top: scrollY,
      behavior: 'smooth'
    });

    // Wait for scroll to complete (smooth scroll animation)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Capture screenshot helper
   */
  async _captureScreenshot(textarea) {
    this._showLoading('Capturing screenshot...');

    // First, scroll pin to center if it's not visible
    await this._scrollPinToCenter();

    // Set screenshot mode to clean up UI
    this.card.classList.add(`${CONFIG.CLASS_PREFIX}screenshot-mode`);

    // Hide old history pins and view all feedbacks button during screenshot
    if (this.pinManager) {
      this.pinManager.hide();
    }
    if (this.feedbackWidget) {
      this.feedbackWidget.hide();
    }

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
      // Capture screenshot with pin marker visible so user can see where they commented
      const screenshotData = await captureViewportScreenshot({
        shadowRoot: this.shadowRoot,
        keepWidgetVisible: true  // Keep pin marker visible in screenshot
      });

      this.screenshot = screenshotData.dataURL;
      this.screenshotMetadata = screenshotData.metadata;
      this.thumbnail = await generateThumbnail(this.screenshot);
    } catch (e) {
      console.warn('[Tapko] Auto-screenshot failed:', e);
    } finally {
      this.card.classList.remove(`${CONFIG.CLASS_PREFIX}screenshot-mode`);

      // Restore old history pins and view all feedbacks button
      if (this.pinManager) {
        this.pinManager.show();
      }
      if (this.feedbackWidget) {
        this.feedbackWidget.show();
      }

      if (textDiv) {
        textDiv.remove();
        textarea.style.display = '';
      }
    }
  }

  /**
   * Resize screenshot to safe dimensions for annotation
   * This prevents browser crashes from overly large images
   */
  async _resizeScreenshotForAnnotation(dataURL) {
    debugLogger.startOperation('Resize screenshot for annotation');

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          const maxDimension = 2048;
          const originalWidth = img.width;
          const originalHeight = img.height;

          if (originalWidth > maxDimension || originalHeight > maxDimension) {
            const scale = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
            const width = Math.floor(originalWidth * scale);
            const height = Math.floor(originalHeight * scale);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const resizedDataURL = canvas.toDataURL('image/jpeg', 0.9);

            // Clean up to prevent memory leak
            canvas.width = 0;
            canvas.height = 0;
            img.src = '';

            debugLogger.endOperation('Resize screenshot for annotation', { success: true });
            resolve(resizedDataURL);
          } else {
            // Clean up image even when not resizing
            img.src = '';

            debugLogger.endOperation('Resize screenshot for annotation', { success: true, resized: false });
            resolve(dataURL);
          }
        } catch (error) {
          console.error('[Tapko] Resize failed:', error);
          debugLogger.endOperation('Resize screenshot for annotation', { success: false });
          reject(error);
        }
      };

      img.onerror = (err) => {
        console.error('[Tapko] Failed to load screenshot for resizing:', err);
        debugLogger.endOperation('Resize screenshot for annotation', { success: false });
        reject(new Error('Failed to load screenshot'));
      };

      img.src = dataURL;
    });
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

    // Clean up screenshot data to prevent memory leaks
    this.screenshot = null;
    this.screenshotDataURL = null;
    this.thumbnail = null;
    this.screenshotMetadata = null;
    this.annotationData = null;
    this.drawingData = null;
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
    this.card = null;
    this.pinMarker = null;
    this.target = null;
  }

  /**
   * Prepare UI for screenshot capture
   */
  prepareForCapture() {
    if (this.card) {
      const actions = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-actions`);
      if (actions) actions.style.display = 'none';
      this.card.classList.add(`${CONFIG.CLASS_PREFIX}capture-mode`);
    }
    if (this.pinMarker) {
      // Pin should stay visible!
    }
  }

  /**
   * Restore UI after screenshot capture
   */
  restoreAfterCapture() {
    if (this.card) {
      const actions = this.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-actions`);
      if (actions) actions.style.display = '';
      this.card.classList.remove(`${CONFIG.CLASS_PREFIX}capture-mode`);
    }
  }

  /**
   * Merge annotations into screenshot (for legacy flow)
   * Returns a blob with annotations merged
   */
  async _mergeAnnotationsHelper(screenshotBlob, annotationData) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw screenshot
          ctx.drawImage(img, 0, 0);

          // Apply annotation settings
          ctx.strokeStyle = annotationData.strokeColor || '#ff0000';
          ctx.lineWidth = annotationData.strokeWidth || 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Draw each annotation
          annotationData.paths.forEach(item => {
            if (item.type === 'path' || Array.isArray(item)) {
              // Freehand path
              const path = item.type === 'path' ? item.data : item;
              if (path.length === 0) return;
              ctx.beginPath();
              ctx.moveTo(path[0].x, path[0].y);
              for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
              }
              ctx.stroke();

            } else if (item.type === 'ellipse') {
              // Ellipse
              const centerX = (item.startX + item.endX) / 2;
              const centerY = (item.startY + item.endY) / 2;
              const radiusX = Math.abs(item.endX - item.startX) / 2;
              const radiusY = Math.abs(item.endY - item.startY) / 2;
              ctx.beginPath();
              ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
              ctx.stroke();

            } else if (item.type === 'rectangle') {
              // Rectangle
              const width = item.endX - item.startX;
              const height = item.endY - item.startY;
              ctx.beginPath();
              ctx.rect(item.startX, item.startY, width, height);
              ctx.stroke();

            } else if (item.type === 'arrow') {
              // Arrow
              ctx.beginPath();
              ctx.moveTo(item.startX, item.startY);
              ctx.lineTo(item.endX, item.endY);
              ctx.stroke();

              // Draw arrowhead
              const angle = Math.atan2(item.endY - item.startY, item.endX - item.startX);
              const arrowLength = 15;
              const arrowAngle = Math.PI / 6;

              ctx.beginPath();
              ctx.moveTo(item.endX, item.endY);
              ctx.lineTo(
                item.endX - arrowLength * Math.cos(angle - arrowAngle),
                item.endY - arrowLength * Math.sin(angle - arrowAngle)
              );
              ctx.moveTo(item.endX, item.endY);
              ctx.lineTo(
                item.endX - arrowLength * Math.cos(angle + arrowAngle),
                item.endY - arrowLength * Math.sin(angle + arrowAngle)
              );
              ctx.stroke();

            } else if (item.type === 'text') {
              // Text
              ctx.font = '16px sans-serif';
              ctx.fillStyle = annotationData.strokeColor || '#ff0000';
              ctx.fillText(item.text, item.x, item.y);
            }
          });

          // Convert to blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create merged screenshot blob'));
            }
          }, 'image/jpeg', 0.85);
        };
        img.onerror = (err) => {
          reject(new Error('Failed to load screenshot image: ' + err));
        };
        img.src = e.target.result;
      };
      reader.onerror = (err) => {
        reject(new Error('Failed to read screenshot blob: ' + err));
      };
      reader.readAsDataURL(screenshotBlob);
    });
  }
}

export { CommentCard };
