import PinStorage from './PinStorage.js';
import { createElement } from '../utils/dom.js';
import { CONFIG } from '../config.js';
import {
  getCurrentDeviceInfo,
  extractFeedbackDeviceInfo,
  calculateDeviceSimilarity,
  getHiddenFeedbackStats,
  formatHiddenFeedbackMessage
} from '../utils/deviceMatcher.js';

/**
 * PinManager - Manages pin lifecycle (fetch, render, position, click)
 * Phase 1: Local browser only, coordinate-based positioning
 */
class PinManager {
  constructor(shadowRoot, apiClient) {
    this.shadowRoot = shadowRoot;
    this.apiClient = apiClient;
    this.pinStorage = new PinStorage();
    this.pins = new Map(); // In-memory registry: id -> { data, element }
    this.initialized = false;
    this.hiddenFeedbackStats = null; // Stats about hidden feedbacks
    this.currentDeviceInfo = null; // Current device info
    this.isPinsVisible = false; // Track whether pins should be visible
  }

  /**
   * Initialize PinManager on page load
   * Fetches feedbacks from backend and creates pins
   * @param {string} projectId - Project ID
   * @param {string} pageUrl - Current page URL
   */
  async init(projectId, pageUrl) {
    if (this.initialized) {
      console.log('[PinManager] Already initialized');
      return;
    }

    console.log('[PinManager] Initializing...');

    try {
      const normalizedUrl = this._normalizeUrl(pageUrl);

      // Get current device info for filtering
      this.currentDeviceInfo = getCurrentDeviceInfo();
      console.log('[PinManager] Current device:', this.currentDeviceInfo);

      // 1. Fetch all feedbacks from backend
      let backendFeedbacks = [];

      try {
        const response = await this.apiClient.getFeedbacks({ projectId });
        if (response && response.data && response.data.feedbacks) {
          backendFeedbacks = response.data.feedbacks;
          console.log(`[PinManager] Fetched ${backendFeedbacks.length} feedbacks from backend`);
        }
      } catch (error) {
        console.error('[PinManager] Failed to fetch backend feedbacks:', error);
        this.initialized = true;
        return;
      }

      // 2. Filter feedbacks for current page
      const feedbacksForPage = backendFeedbacks.filter(feedback => {
        const feedbackUrl = this._normalizeUrl(feedback.context?.pageUrl || '');
        return feedbackUrl === normalizedUrl;
      });

      console.log(`[PinManager] Found ${feedbacksForPage.length} feedbacks for current page`);

      

      // 3. Filter feedbacks based on device compatibility
      const threshold = 80;
      const compatibleFeedbacks = feedbacksForPage.filter(feedback => {
        const feedbackDeviceInfo = extractFeedbackDeviceInfo(feedback);
        const feedbackId = feedback.feedbackId || feedback.id;
        const comment = feedback.feedbackTitle || feedback.description || feedback.title || feedback.comment || feedback.message || 'No comment';

        // If no device info available, show the feedback (backward compatibility)
        if (!feedbackDeviceInfo) {
          console.log(`[PinManager] DEBUG - Feedback ${feedbackId}:`, {
            comment: comment.substring(0, 50) + (comment.length > 50 ? '...' : ''),
            score: 'N/A (no device info)',
            threshold: threshold,
            result: 'SHOWN (backward compatibility)'
          });
          return true;
        }

        // Calculate similarity score
        const score = calculateDeviceSimilarity(this.currentDeviceInfo, feedbackDeviceInfo);

        // Check if feedback should be shown on current device
        const shouldShow = score >= threshold;

        // Debug log for every feedback
        console.log(`[PinManager] DEBUG - Feedback ${feedbackId}:`, {
          comment: comment.substring(0, 50) + (comment.length > 50 ? '...' : ''),
          score: score,
          threshold: threshold,
          result: shouldShow ? 'SHOWN' : 'HIDDEN',
          feedbackDevice: feedbackDeviceInfo,
          currentDevice: this.currentDeviceInfo
        });

        return shouldShow;
      });

      console.log(`[PinManager] ${compatibleFeedbacks.length} feedbacks compatible with current device`);

      // Calculate stats for hidden feedbacks
      this.hiddenFeedbackStats = getHiddenFeedbackStats(feedbacksForPage, compatibleFeedbacks);
      console.log('[PinManager] Hidden feedback stats:', this.hiddenFeedbackStats);

      // 4. Create pins from compatible feedbacks with position data
      let pinsCreated = 0;
      let skippedNoPosition = 0;

      for (const feedback of compatibleFeedbacks) {
        // Validate feedback has required data (backend returns 'feedbackId', not 'id')
        const feedbackId = feedback.feedbackId || feedback.id;
        if (!feedbackId) {
          console.warn('[PinManager] Skipping feedback without ID:', feedback);
          continue;
        }

        // Check if feedback has comment position data
        const commentPosition = feedback.context?.commentPosition;

        if (!commentPosition || !commentPosition.x || !commentPosition.y) {
          console.log(`[PinManager] Skipping feedback ${feedbackId} - no position data`, {
            hasContext: !!feedback.context,
            hasCommentPosition: !!commentPosition,
            commentPosition: commentPosition
          });
          skippedNoPosition++;
          continue;
        }

        try {
          // Extract comment text - backend stores it in feedbackTitle
          const commentText = feedback.feedbackTitle
            || feedback.description
            || feedback.title
            || feedback.comment
            || feedback.message
            || 'No comment text';

          console.log(`[PinManager] Mapping feedback ${feedbackId}:`, {
            feedbackTitle: feedback.feedbackTitle,
            extractedText: commentText.substring(0, 50) + '...'
          });

          const pinData = {
            id: feedbackId,
            projectId: projectId,
            pageUrl: normalizedUrl,
            position: {
              documentX: commentPosition.x,
              documentY: commentPosition.y,
              viewportX: commentPosition.x,
              viewportY: commentPosition.y
            },
            comment: {
              text: commentText,
              createdAt: feedback.createdAt || new Date().toISOString()
            },
            createdAt: feedback.createdAt || new Date().toISOString(),
            createdInThisBrowser: false // From backend
          };

          // Save to IndexedDB
          await this.pinStorage.savePin(pinData);
          console.log(`[PinManager] Saved pin to IndexedDB:`, feedbackId);

          // Render immediately
          this.renderPin(pinData);
          console.log(`[PinManager] Rendered pin:`, feedbackId);

          pinsCreated++;
        } catch (error) {
          console.error(`[PinManager] Failed to create pin for feedback ${feedbackId}:`, error);
        }
      }

      console.log(`[PinManager] Created and rendered ${pinsCreated} pins`);

      this.initialized = true;
      console.log('[PinManager] Initialization complete');
    } catch (error) {
      console.error('[PinManager] Initialization failed:', error);
      this.initialized = true; // Mark as initialized even if failed
    }
  }

  /**
   * Create and save a new pin
   * @param {Object} pinData - Pin data object
   * @returns {Promise<string>} - Pin ID
   */
  async createPin(pinData) {
    console.log('[PinManager] Creating pin:', pinData.id);

    try {
      // 1. Save to IndexedDB
      await this.pinStorage.savePin(pinData);

      // 2. Render immediately
      this.renderPin(pinData);

      console.log('[PinManager] Pin created successfully:', pinData.id);
      return pinData.id;
    } catch (error) {
      console.error('[PinManager] Failed to create pin:', error);
      throw error;
    }
  }

  /**
   * Render a pin DOM element
   * @param {Object} pinData - Pin data object
   */
  renderPin(pinData) {
    // Check if pin already rendered
    if (this.pins.has(pinData.id)) {
      console.log('[PinManager] Pin already rendered:', pinData.id);
      return;
    }

    try {
      // Calculate position
      const position = this._calculatePinPosition(pinData);

      // Create pin element
      const pinElement = createElement('div', `${CONFIG.CLASS_PREFIX}comment-pin`);
      pinElement.style.position = 'absolute';
      pinElement.style.left = `${position.left}px`;
      pinElement.style.top = `${position.top}px`;
      pinElement.style.zIndex = CONFIG.UI.zIndex;
      // Set display based on current visibility state
      pinElement.style.display = this.isPinsVisible ? 'block' : 'none';

      // Store pin ID as data attribute
      pinElement.setAttribute('data-pin-id', pinData.id);

      // Add to shadow DOM
      this.shadowRoot.appendChild(pinElement);

      // Store reference
      this.pins.set(pinData.id, {
        data: pinData,
        element: pinElement
      });

      // Attach click handler
      this._attachPinClickHandler(pinElement, pinData);

      console.log('[PinManager] Pin rendered:', pinData.id, 'visible:', this.isPinsVisible);
    } catch (error) {
      console.error('[PinManager] Failed to render pin:', error);
    }
  }

  /**
   * Calculate pin position (coordinate-based for Phase 1)
   * @param {Object} pinData - Pin data object
   * @returns {Object} - {left, top} viewport coordinates
   * @private
   */
  _calculatePinPosition(pinData) {
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

    return {
      left: pinData.position.documentX - scrollX,
      top: pinData.position.documentY - scrollY
    };
  }

  /**
   * Update all pin positions (called on scroll/resize)
   */
  updateAllPinPositions() {
    this.pins.forEach(({ data, element }) => {
      const position = this._calculatePinPosition(data);
      element.style.left = `${position.left}px`;
      element.style.top = `${position.top}px`;
    });
  }

  /**
   * Attach click handler to pin element
   * @param {HTMLElement} pinElement - Pin DOM element
   * @param {Object} pinData - Pin data object
   * @private
   */
  _attachPinClickHandler(pinElement, pinData) {
    pinElement.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.showPinDetail(pinData);
    });
  }

  /**
   * Show pin detail card/popup
   * @param {Object} pinData - Pin data object
   */
  showPinDetail(pinData) {
    console.log('[PinManager] Showing pin detail:', pinData.id);

    // Create a simple detail popup
    const existingDetail = this.shadowRoot.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail`);
    if (existingDetail) {
      existingDetail.remove();
    }

    const detailCard = this._createPinDetailCard(pinData);
    this.shadowRoot.appendChild(detailCard);

    // Position near the pin
    this._positionDetailCard(detailCard, pinData);

    // Add close handler
    const closeBtn = detailCard.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-close`);
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        detailCard.remove();
      });
    }

    // Close on outside click
    setTimeout(() => {
      const outsideClickHandler = (event) => {
        if (!detailCard.contains(event.target)) {
          detailCard.remove();
          document.removeEventListener('click', outsideClickHandler);
        }
      };
      document.addEventListener('click', outsideClickHandler);
    }, 100);
  }

  /**
   * Create pin detail card DOM element
   * @param {Object} pinData - Pin data object
   * @returns {HTMLElement} - Detail card element
   * @private
   */
  _createPinDetailCard(pinData) {
    const card = createElement('div', `${CONFIG.CLASS_PREFIX}pin-detail`);

    const createdDate = new Date(pinData.comment.createdAt).toLocaleDateString();

    card.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}pin-detail-header">
        <span class="${CONFIG.CLASS_PREFIX}pin-detail-date">${createdDate}</span>
        <button class="${CONFIG.CLASS_PREFIX}pin-detail-close" aria-label="Close">×</button>
      </div>
      <div class="${CONFIG.CLASS_PREFIX}pin-detail-content">
        <p>${this._escapeHTML(pinData.comment.text)}</p>
      </div>
    `;

    return card;
  }

  /**
   * Position detail card near the pin
   * @param {HTMLElement} card - Detail card element
   * @param {Object} pinData - Pin data object
   * @private
   */
  _positionDetailCard(card, pinData) {
    const position = this._calculatePinPosition(pinData);

    // Position to the right of the pin by default
    let left = position.left + 20;
    let top = position.top - 10;

    // Adjust if it would overflow viewport
    const cardRect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left + cardRect.width > viewportWidth - 20) {
      // Position to the left instead
      left = position.left - cardRect.width - 20;
    }

    if (left < 20) {
      left = 20;
    }

    if (top + cardRect.height > viewportHeight - 20) {
      top = viewportHeight - cardRect.height - 20;
    }

    if (top < 20) {
      top = 20;
    }

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   * @private
   */
  _escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Remove a draft pin (for cancelled comments)
   * @param {string} pinId - Pin ID to remove
   */
  removeDraftPin(pinId) {
    const pin = this.pins.get(pinId);
    if (pin) {
      console.log('[PinManager] Removing draft pin:', pinId);
      pin.element.remove();
      this.pins.delete(pinId);
    }
  }

  /**
   * Remove a pin and delete from storage
   * @param {string} pinId - Pin ID to remove
   * @returns {Promise<boolean>}
   */
  async removePin(pinId) {
    try {
      // Remove from DOM
      const pin = this.pins.get(pinId);
      if (pin) {
        pin.element.remove();
        this.pins.delete(pinId);
      }

      // Delete from storage
      await this.pinStorage.deletePin(pinId);

      console.log('[PinManager] Pin removed:', pinId);
      return true;
    } catch (error) {
      console.error('[PinManager] Failed to remove pin:', error);
      return false;
    }
  }

  /**
   * Get all rendered pins
   * @returns {Map} - Map of pin IDs to pin objects
   */
  getPins() {
    return this.pins;
  }

  /**
   * Get count of rendered pins
   * @returns {number}
   */
  getCount() {
    return this.pins.size;
  }

  /**
   * Clear all pins (both DOM and storage)
   * @returns {Promise<boolean>}
   */
  async clearAll() {
    try {
      // Remove all from DOM
      this.pins.forEach(({ element }) => {
        element.remove();
      });
      this.pins.clear();

      // Clear storage
      await this.pinStorage.clearAll();

      console.log('[PinManager] All pins cleared');
      return true;
    } catch (error) {
      console.error('[PinManager] Failed to clear pins:', error);
      return false;
    }
  }

  /**
   * Show all pins (make visible)
   */
  show() {
    this.isPinsVisible = true;
    this.pins.forEach(({ element }) => {
      element.style.display = 'block';
    });
    console.log('[PinManager] Pins shown');
  }

  /**
   * Hide all pins (make invisible)
   */
  hide() {
    this.isPinsVisible = false;
    this.pins.forEach(({ element }) => {
      element.style.display = 'none';
    });
    console.log('[PinManager] Pins hidden');
  }

  /**
   * Get hidden feedback statistics
   * @returns {Object|null} - Hidden feedback stats or null if not initialized
   */
  getHiddenFeedbackStats() {
    return this.hiddenFeedbackStats;
  }

  /**
   * Get formatted message about hidden feedbacks
   * @returns {string} - Formatted message
   */
  getHiddenFeedbackMessage() {
    if (!this.hiddenFeedbackStats || this.hiddenFeedbackStats.total === 0) {
      return '';
    }
    return formatHiddenFeedbackMessage(this.hiddenFeedbackStats);
  }

  /**
   * Get current device info
   * @returns {Object|null} - Current device info
   */
  getCurrentDeviceInfo() {
    return this.currentDeviceInfo;
  }

  /**
   * Normalize URL (remove query params and hash)
   * @param {string} url - URL to normalize
   * @returns {string} - Normalized URL
   * @private
   */
  _normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      console.error('[PinManager] Invalid URL:', url);
      return url;
    }
  }
}

export default PinManager;
