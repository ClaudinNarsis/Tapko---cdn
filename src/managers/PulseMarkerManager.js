/**
 * PulseMarkerManager
 * Manages feedback pulse markers on the page
 * Shows green pulses at locations where feedback was successfully submitted
 */

import { FeedbackPulseMarker } from '../components/FeedbackPulseMarker.js';

class PulseMarkerManager {
  constructor(queueManager) {
    this.queueManager = queueManager;
    this.markers = new Map(); // id -> FeedbackPulseMarker
    this.initialized = false;
  }

  /**
   * Initialize the pulse marker manager
   */
  async init() {
    if (this.initialized || !this.queueManager) {
      return;
    }

    console.log('[PulseMarkerManager] Initializing...');

    // Load existing completed feedback and create markers
    await this._loadExistingMarkers();

    // Listen to queue events for new completions
    this._setupEventListeners();

    this.initialized = true;
    console.log('[PulseMarkerManager] Initialized with', this.markers.size, 'markers');
  }

  /**
   * Load existing completed feedback from queue
   */
  async _loadExistingMarkers() {
    try {
      const completedItems = await this.queueManager.getAll({ status: 'completed' });

      for (const item of completedItems) {
        // Only create marker if we have position data
        if (item.feedbackData?.context?.commentPosition) {
          this._createMarker(item);
        }
      }
    } catch (error) {
      console.error('[PulseMarkerManager] Error loading existing markers:', error);
    }
  }

  /**
   * Setup event listeners for queue events
   */
  _setupEventListeners() {
    // Listen for item completions
    this.queueManager.on('queue:item-completed', (data) => {
      this._handleItemCompleted(data.id);
    });

    // Listen for item removals
    this.queueManager.on('queue:removed', (data) => {
      this._removeMarker(data.id);
    });
  }

  /**
   * Handle queue item completion
   */
  async _handleItemCompleted(itemId) {
    try {
      const item = await this.queueManager.getById(itemId);

      if (!item) {
        console.warn('[PulseMarkerManager] Item not found:', itemId);
        return;
      }

      // Create marker if position data exists
      if (item.feedbackData?.context?.commentPosition) {
        this._createMarker(item);
      }
    } catch (error) {
      console.error('[PulseMarkerManager] Error handling completion:', error);
    }
  }

  /**
   * Create a pulse marker for a feedback item
   */
  _createMarker(item) {
    // Don't create duplicate markers
    if (this.markers.has(item.id)) {
      return;
    }

    try {
      const markerData = {
        id: item.id,
        title: item.feedbackData.title || 'Feedback',
        description: item.feedbackData.description || '',
        position: item.feedbackData.context.commentPosition,
        timestamp: item.feedbackData.context.timestamp,
        status: item.status,
        pageUrl: item.feedbackData.context.pageUrl
      };

      // Only show markers for current page
      const currentUrl = window.location.href;
      if (markerData.pageUrl !== currentUrl) {
        return;
      }

      const marker = new FeedbackPulseMarker(markerData);
      this.markers.set(item.id, marker);

      // Hide marker by default (will be shown when entering feedback mode)
      if (marker.marker) {
        marker.marker.style.display = 'none';
      }

      console.log('[PulseMarkerManager] Created marker for:', item.id);
    } catch (error) {
      console.error('[PulseMarkerManager] Error creating marker:', error);
    }
  }

  /**
   * Remove a pulse marker
   */
  _removeMarker(itemId) {
    const marker = this.markers.get(itemId);
    if (marker) {
      marker.destroy();
      this.markers.delete(itemId);
      console.log('[PulseMarkerManager] Removed marker:', itemId);
    }
  }

  /**
   * Update marker data (for status updates)
   */
  async updateMarker(itemId) {
    const marker = this.markers.get(itemId);
    if (!marker) {
      return;
    }

    try {
      const item = await this.queueManager.getById(itemId);
      if (item && item.feedbackData?.context) {
        marker.updateData({
          title: item.feedbackData.title,
          description: item.feedbackData.description,
          status: item.status,
          timestamp: item.feedbackData.context.timestamp
        });
      }
    } catch (error) {
      console.error('[PulseMarkerManager] Error updating marker:', error);
    }
  }

  /**
   * Clear all markers
   */
  clearAll() {
    this.markers.forEach(marker => marker.destroy());
    this.markers.clear();
    console.log('[PulseMarkerManager] Cleared all markers');
  }

  /**
   * Hide all markers (without destroying them)
   */
  hideAll() {
    this.markers.forEach(marker => {
      if (marker.marker) {
        marker.marker.style.display = 'none';
      }
    });
  }

  /**
   * Show all markers
   */
  showAll() {
    this.markers.forEach(marker => {
      if (marker.marker) {
        marker.marker.style.display = '';
      }
    });
  }

  /**
   * Get number of active markers
   */
  getMarkerCount() {
    return this.markers.size;
  }

  /**
   * Destroy the manager and all markers
   */
  destroy() {
    this.clearAll();
    this.initialized = false;
    console.log('[PulseMarkerManager] Destroyed');
  }
}

export default PulseMarkerManager;
