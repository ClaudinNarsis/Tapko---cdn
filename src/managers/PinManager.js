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
    this._projectId = projectId;

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

          console.log(`[PinManager] Mapping feedback ${feedbackId}:`, {
            isOwner: feedback.isOwner,
            editedAt: feedback.editedAt,
            apiClientUserId: this.apiClient?.userId
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
            status: feedback.status || 'pending',
            createdAt: feedback.createdAt || new Date().toISOString(),
            editedAt: feedback.editedAt || null,
            isOwner: feedback.isOwner === true,
            createdInThisBrowser: false
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

    // A pin created in this session is always owned by the current user.
    // isOwner is only set during init() via the backend response, so new pins
    // would show without Edit/Delete until the next page refresh without this.
    pinData.isOwner = !!this.apiClient.userId;
    pinData.editedAt = pinData.editedAt || null;

    try {
      // 1. Save to IndexedDB
      await this.pinStorage.savePin(pinData);

      // 2. Render immediately
      this.renderPin(pinData);

      console.log('[PinManager] Pin created successfully:', pinData.id, '| isOwner:', pinData.isOwner);
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
      if (existingDetail._outsideClickHandler) {
        document.removeEventListener('click', existingDetail._outsideClickHandler);
      }
      existingDetail.remove();
    }

    const detailCard = this._createPinDetailCard(pinData);
    this.shadowRoot.appendChild(detailCard);

    // Position near the pin
    this._positionDetailCard(detailCard, pinData);

    // Prevent clicks inside the card from reaching the document outside-click handler.
    // In shadow DOM, event.target is retargeted to the shadow host at the document level,
    // so detailCard.contains(event.target) always returns false — the card would close
    // on every internal click without this stopPropagation guard.
    detailCard.addEventListener('click', (e) => e.stopPropagation());

    // Add close handler
    const closeBtn = detailCard.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-close`);
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('[PinManager] Detail card closed via × button');
        detailCard.remove();
        document.removeEventListener('click', outsideClickHandler);
      });
    }

    // Close on outside click — only fires for clicks outside the card (due to stopPropagation above)
    const outsideClickHandler = (event) => {
      console.log('[PinManager] Outside click detected, closing detail card');
      detailCard.remove();
      document.removeEventListener('click', outsideClickHandler);
    };
    detailCard._outsideClickHandler = outsideClickHandler;
    setTimeout(() => {
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
    console.log('[PinManager] _createPinDetailCard:', {
      id: pinData.id,
      isOwner: pinData.isOwner,
      editedAt: pinData.editedAt,
      apiClientUserId: this.apiClient?.userId
    });

    const card = createElement('div', `${CONFIG.CLASS_PREFIX}pin-detail`);

    const createdDate = new Date(pinData.comment.createdAt).toLocaleDateString();
    const status = pinData.status || 'pending';

    const statusLabels = {
      'pending': 'Pending',
      'in_progress': 'In Progress',
      'resolved': 'Resolved',
      'closed': 'Closed',
      'open': 'Open'
    };

    const statusLabel = statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1);
    const editedBadge = pinData.editedAt
      ? `<span class="${CONFIG.CLASS_PREFIX}pin-detail-edited">Edited</span>`
      : '';

    const ownerActions = pinData.isOwner ? `
      <div class="${CONFIG.CLASS_PREFIX}pin-detail-actions">
        <button class="${CONFIG.CLASS_PREFIX}pin-detail-edit" aria-label="Edit feedback">Edit</button>
        <button class="${CONFIG.CLASS_PREFIX}pin-detail-delete" aria-label="Delete feedback">Delete</button>
      </div>` : '';

    card.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}pin-detail-header">
        <div class="${CONFIG.CLASS_PREFIX}pin-detail-meta">
          <span class="${CONFIG.CLASS_PREFIX}pin-detail-date">${createdDate}</span>
          ${editedBadge}
          <span class="${CONFIG.CLASS_PREFIX}pin-detail-status ${CONFIG.CLASS_PREFIX}pin-detail-status-${status}">${statusLabel}</span>
        </div>
        <button class="${CONFIG.CLASS_PREFIX}pin-detail-close" aria-label="Close">×</button>
      </div>
      <div class="${CONFIG.CLASS_PREFIX}pin-detail-content">
        <p>${this._escapeHTML(pinData.comment.text)}</p>
      </div>
      ${ownerActions}
    `;

    if (pinData.isOwner) {
      const editBtn = card.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-edit`);
      const deleteBtn = card.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-delete`);
      console.log('[PinManager] Attaching owner action listeners:', { editBtnFound: !!editBtn, deleteBtnFound: !!deleteBtn });
      if (editBtn) editBtn.addEventListener('click', () => {
        console.log('[PinManager] Edit button clicked for pin:', pinData.id);
        this._handleEditClick(pinData, card);
      });
      if (deleteBtn) deleteBtn.addEventListener('click', () => {
        console.log('[PinManager] Delete button clicked for pin:', pinData.id);
        this._handleDeleteClick(pinData, card);
      });
    } else {
      console.log('[PinManager] Pin is not owned by current user — no edit/delete buttons');
    }

    return card;
  }

  /**
   * Handle delete button click — shows in-card confirm UI, pessimistic delete
   * @param {Object} pinData
   * @param {HTMLElement} card
   * @private
   */
  _handleDeleteClick(pinData, card) {
    console.log('[PinManager] _handleDeleteClick called:', {
      id: pinData.id,
      projectId: pinData.projectId,
      userId: this.apiClient?.userId
    });
    const actionsEl = card.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-actions`);
    console.log('[PinManager] actionsEl found:', !!actionsEl);
    if (!actionsEl) return;

    actionsEl.innerHTML = `
      <span class="${CONFIG.CLASS_PREFIX}pin-detail-confirm-text">Delete this feedback? This cannot be undone.</span>
      <button class="${CONFIG.CLASS_PREFIX}pin-detail-confirm-yes">Confirm</button>
      <button class="${CONFIG.CLASS_PREFIX}pin-detail-confirm-no">Cancel</button>
    `;

    actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-confirm-no`)
      .addEventListener('click', () => {
        actionsEl.innerHTML = `
          <button class="${CONFIG.CLASS_PREFIX}pin-detail-edit" aria-label="Edit feedback">Edit</button>
          <button class="${CONFIG.CLASS_PREFIX}pin-detail-delete" aria-label="Delete feedback">Delete</button>
        `;
        actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-edit`)
          .addEventListener('click', () => this._handleEditClick(pinData, card));
        actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-delete`)
          .addEventListener('click', () => this._handleDeleteClick(pinData, card));
      });

    actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-confirm-yes`)
      .addEventListener('click', async () => {
        actionsEl.innerHTML = `<span class="${CONFIG.CLASS_PREFIX}pin-detail-loading">Deleting…</span>`;
        console.log('[PinManager] Delete confirmed — calling API:', {
          projectId: pinData.projectId,
          feedbackId: pinData.id,
          userId: this.apiClient?.userId
        });
        try {
          const result = await this.apiClient.deleteFeedback(pinData.projectId, pinData.id, this.apiClient.userId);
          console.log('[PinManager] Delete API success:', result);
          await this.removePin(pinData.id);
          card.remove();
        } catch (err) {
          console.error('[PinManager] Delete failed:', err);
          actionsEl.innerHTML = `
            <span class="${CONFIG.CLASS_PREFIX}pin-detail-error">Delete failed. Try again.</span>
            <button class="${CONFIG.CLASS_PREFIX}pin-detail-edit" aria-label="Edit feedback">Edit</button>
            <button class="${CONFIG.CLASS_PREFIX}pin-detail-delete" aria-label="Delete feedback">Delete</button>
          `;
          actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-edit`)
            .addEventListener('click', () => this._handleEditClick(pinData, card));
          actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-delete`)
            .addEventListener('click', () => this._handleDeleteClick(pinData, card));
        }
      });
  }

  /**
   * Handle edit button click — inline textarea, save/cancel, updates pin on success
   * @param {Object} pinData
   * @param {HTMLElement} card
   * @param {string|null} initialText - pre-fill value for retry after failed save (never mutates pinData)
   * @private
   */
  _handleEditClick(pinData, card, initialText = null) {
    console.log('[PinManager] _handleEditClick called:', {
      id: pinData.id,
      projectId: pinData.projectId,
      userId: this.apiClient?.userId,
      initialText
    });
    const contentEl = card.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-content`);
    const actionsEl = card.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-actions`);
    console.log('[PinManager] contentEl found:', !!contentEl, '| actionsEl found:', !!actionsEl);
    if (!contentEl || !actionsEl) return;

    const savedText = pinData.comment.text;
    const startText = initialText !== null ? initialText : savedText;

    contentEl.innerHTML = `
      <textarea class="${CONFIG.CLASS_PREFIX}pin-detail-edit-textarea" rows="4">${this._escapeHTML(startText)}</textarea>
    `;

    actionsEl.innerHTML = `
      <button class="${CONFIG.CLASS_PREFIX}pin-detail-save">Save</button>
      <button class="${CONFIG.CLASS_PREFIX}pin-detail-cancel">Cancel</button>
    `;

    const textarea = contentEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-edit-textarea`);
    textarea.focus();

    const restoreView = () => {
      contentEl.innerHTML = `<p>${this._escapeHTML(pinData.comment.text)}</p>`;
      actionsEl.innerHTML = `
        <button class="${CONFIG.CLASS_PREFIX}pin-detail-edit" aria-label="Edit feedback">Edit</button>
        <button class="${CONFIG.CLASS_PREFIX}pin-detail-delete" aria-label="Delete feedback">Delete</button>
      `;
      actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-edit`)
        .addEventListener('click', () => this._handleEditClick(pinData, card));
      actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-delete`)
        .addEventListener('click', () => this._handleDeleteClick(pinData, card));
    };

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') restoreView();
    });

    actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-cancel`)
      .addEventListener('click', restoreView);

    actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-save`)
      .addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (!newText || newText === savedText) {
          restoreView();
          return;
        }

        actionsEl.innerHTML = `<span class="${CONFIG.CLASS_PREFIX}pin-detail-loading">Saving…</span>`;
        textarea.disabled = true;

        console.log('[PinManager] Saving edit — calling API:', {
          projectId: pinData.projectId,
          feedbackId: pinData.id,
          feedbackTitle: newText,
          userId: this.apiClient?.userId
        });
        try {
          const result = await this.apiClient.updateFeedback(pinData.projectId, pinData.id, {
            feedbackTitle: newText,
            userId: this.apiClient.userId
          });
          console.log('[PinManager] Update API success:', result);

          pinData.comment.text = newText;
          pinData.editedAt = Date.now();

          const metaEl = card.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-meta`);
          if (metaEl && !metaEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-edited`)) {
            const badge = document.createElement('span');
            badge.className = `${CONFIG.CLASS_PREFIX}pin-detail-edited`;
            badge.textContent = 'Edited';
            metaEl.insertBefore(badge, metaEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-status`));
          }

          const pinEntry = this.pins.get(pinData.id);
          if (pinEntry) pinEntry.data = pinData;

          restoreView();
        } catch (err) {
          console.error('[PinManager] Update failed:', err);
          // Re-enter edit mode pre-filled with what the user typed; pinData.comment.text is NOT mutated
          actionsEl.innerHTML = `
            <span class="${CONFIG.CLASS_PREFIX}pin-detail-error">Save failed — ${this._escapeHTML(err.message)}</span>
            <button class="${CONFIG.CLASS_PREFIX}pin-detail-save">Retry</button>
            <button class="${CONFIG.CLASS_PREFIX}pin-detail-cancel">Cancel</button>
          `;
          textarea.disabled = false;
          textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape') restoreView(); });
          actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-cancel`)
            .addEventListener('click', restoreView);
          actionsEl.querySelector(`.${CONFIG.CLASS_PREFIX}pin-detail-save`)
            .addEventListener('click', () => this._handleEditClick(pinData, card, textarea.value));
        }
      });
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
   * Re-fetch and re-render pins for a new page URL without touching local
   * pin storage — used on SPA client-side route changes, where the widget
   * itself stays mounted but the pins belong to the previous route.
   * @param {string} pageUrl - New page URL
   */
  async refreshForUrl(pageUrl) {
    this.pins.forEach(({ element }) => element.remove());
    this.pins.clear();
    this.initialized = false;
    await this.init(this._projectId, pageUrl);
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
