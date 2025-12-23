/**
 * FeedbackPulseMarker Component
 * Shows a green pulsing dot at feedback submission points
 * Expands to show feedback details when clicked
 */

import { CONFIG } from '../config.js';
import { createElement, removeElement, sanitizeHTML } from '../utils/dom.js';

class FeedbackPulseMarker {
  constructor(feedbackData) {
    this.feedbackData = feedbackData;
    this.marker = null;
    this.detailsCard = null;
    this.isExpanded = false;
    this.scrollHandler = null;

    this._init();
  }

  /**
   * Initialize the pulse marker
   */
  _init() {
    this._createMarker();
    this._setupScrollListener();
    this._show();
  }

  /**
   * Create the pulse marker element
   */
  _createMarker() {
    this.marker = createElement('div', `${CONFIG.CLASS_PREFIX}feedback-pulse`);

    // Position at the feedback point
    this.marker.style.position = 'absolute';
    this.marker.style.left = `${this.feedbackData.position.x}px`;
    this.marker.style.top = `${this.feedbackData.position.y}px`;
    this.marker.style.zIndex = CONFIG.UI.zIndex - 1;

    // Create pulse structure
    this.marker.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}pulse-dot"></div>
      <div class="${CONFIG.CLASS_PREFIX}pulse-ring"></div>
    `;

    // Click handler
    this.marker.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleDetails();
    });

    document.body.appendChild(this.marker);
  }

  /**
   * Setup scroll listener to update position
   */
  _setupScrollListener() {
    this.scrollHandler = () => {
      this._updatePosition();
    };

    window.addEventListener('scroll', this.scrollHandler, { passive: true });
    window.addEventListener('resize', this.scrollHandler, { passive: true });
  }

  /**
   * Update marker position on scroll
   */
  _updatePosition() {
    if (!this.marker || !this.feedbackData.position) return;

    // Position is already absolute from page top, no need to adjust for scroll
    // Just ensure it stays in the correct position relative to the document
  }

  /**
   * Show marker with animation
   */
  _show() {
    requestAnimationFrame(() => {
      if (this.marker) {
        this.marker.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
      }
    });
  }

  /**
   * Toggle details card
   */
  _toggleDetails() {
    if (this.isExpanded) {
      this._hideDetails();
    } else {
      this._showDetails();
    }
  }

  /**
   * Show details card
   */
  _showDetails() {
    if (this.detailsCard) return;

    this.isExpanded = true;
    this.marker.classList.add(`${CONFIG.CLASS_PREFIX}expanded`);

    // Create details card
    this.detailsCard = createElement('div', `${CONFIG.CLASS_PREFIX}feedback-details`);

    // Format timestamp
    const timestamp = new Date(this.feedbackData.timestamp);
    const formattedTime = this._formatTimestamp(timestamp);

    // Build details HTML
    this.detailsCard.innerHTML = `
      <div class="${CONFIG.CLASS_PREFIX}details-header">
        <span class="${CONFIG.CLASS_PREFIX}details-title">Feedback Submitted</span>
        <button class="${CONFIG.CLASS_PREFIX}details-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="${CONFIG.CLASS_PREFIX}details-content">
        <div class="${CONFIG.CLASS_PREFIX}details-row">
          <span class="${CONFIG.CLASS_PREFIX}details-label">Title:</span>
          <span class="${CONFIG.CLASS_PREFIX}details-value">${sanitizeHTML(this.feedbackData.title || 'No title')}</span>
        </div>
        ${this.feedbackData.description ? `
          <div class="${CONFIG.CLASS_PREFIX}details-row">
            <span class="${CONFIG.CLASS_PREFIX}details-label">Description:</span>
            <span class="${CONFIG.CLASS_PREFIX}details-value">${sanitizeHTML(this.feedbackData.description)}</span>
          </div>
        ` : ''}
        <div class="${CONFIG.CLASS_PREFIX}details-row">
          <span class="${CONFIG.CLASS_PREFIX}details-label">Submitted:</span>
          <span class="${CONFIG.CLASS_PREFIX}details-value">${formattedTime}</span>
        </div>
        ${this.feedbackData.status ? `
          <div class="${CONFIG.CLASS_PREFIX}details-row">
            <span class="${CONFIG.CLASS_PREFIX}details-label">Status:</span>
            <span class="${CONFIG.CLASS_PREFIX}details-value ${CONFIG.CLASS_PREFIX}status-${this.feedbackData.status}">
              ${this._formatStatus(this.feedbackData.status)}
            </span>
          </div>
        ` : ''}
      </div>
    `;

    // Position card near marker
    this._positionDetailsCard();

    document.body.appendChild(this.detailsCard);

    // Show with animation
    requestAnimationFrame(() => {
      this.detailsCard.classList.add(`${CONFIG.CLASS_PREFIX}visible`);
    });

    // Close button handler
    const closeBtn = this.detailsCard.querySelector(`.${CONFIG.CLASS_PREFIX}details-close`);
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideDetails();
    });

    // Close when clicking outside
    setTimeout(() => {
      document.addEventListener('click', this._outsideClickHandler);
    }, 100);
  }

  /**
   * Hide details card
   */
  _hideDetails() {
    if (!this.detailsCard) return;

    this.isExpanded = false;
    this.marker.classList.remove(`${CONFIG.CLASS_PREFIX}expanded`);

    this.detailsCard.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);

    setTimeout(() => {
      removeElement(this.detailsCard);
      this.detailsCard = null;
    }, 300);

    // Remove outside click listener
    document.removeEventListener('click', this._outsideClickHandler);
  }

  /**
   * Handle clicks outside the details card
   */
  _outsideClickHandler = (e) => {
    if (this.detailsCard && !this.detailsCard.contains(e.target) && !this.marker.contains(e.target)) {
      this._hideDetails();
    }
  }

  /**
   * Position details card near the marker
   */
  _positionDetailsCard() {
    if (!this.detailsCard || !this.marker) return;

    requestAnimationFrame(() => {
      const markerRect = this.marker.getBoundingClientRect();
      const cardWidth = 320;
      const cardHeight = this.detailsCard.offsetHeight || 200;

      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      // Start position: to the right of marker
      let left = markerRect.right + scrollX + 10;
      let top = markerRect.top + scrollY;

      // Check viewport boundaries
      const viewportRight = window.innerWidth + scrollX;
      const viewportBottom = window.innerHeight + scrollY;

      // If overflowing right, show on left
      if (left + cardWidth > viewportRight) {
        left = markerRect.left + scrollX - cardWidth - 10;
      }

      // If overflowing bottom, adjust top
      if (top + cardHeight > viewportBottom) {
        top = viewportBottom - cardHeight - 10;
      }

      // Ensure not off-screen
      if (left < scrollX + 10) left = scrollX + 10;
      if (top < scrollY + 10) top = scrollY + 10;

      this.detailsCard.style.position = 'absolute';
      this.detailsCard.style.left = `${left}px`;
      this.detailsCard.style.top = `${top}px`;
      this.detailsCard.style.zIndex = CONFIG.UI.zIndex;
    });
  }

  /**
   * Format timestamp for display
   */
  _formatTimestamp(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  }

  /**
   * Format status for display
   */
  _formatStatus(status) {
    const statusMap = {
      'completed': 'Submitted',
      'pending': 'Pending',
      'processing': 'Processing',
      'failed': 'Failed'
    };
    return statusMap[status] || status;
  }

  /**
   * Update feedback data (for status updates)
   */
  updateData(newData) {
    this.feedbackData = { ...this.feedbackData, ...newData };

    // If details are showing, refresh them
    if (this.isExpanded && this.detailsCard) {
      this._hideDetails();
      setTimeout(() => this._showDetails(), 100);
    }
  }

  /**
   * Destroy the marker
   */
  destroy() {
    // Remove scroll listener
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      window.removeEventListener('resize', this.scrollHandler);
      this.scrollHandler = null;
    }

    // Remove outside click listener
    document.removeEventListener('click', this._outsideClickHandler);

    // Remove details card
    if (this.detailsCard) {
      removeElement(this.detailsCard);
      this.detailsCard = null;
    }

    // Remove marker
    if (this.marker) {
      removeElement(this.marker, true);
      this.marker = null;
    }
  }
}

export { FeedbackPulseMarker };
