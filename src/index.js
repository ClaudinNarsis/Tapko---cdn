/**
 * Tapko Widget - Main Entry Point
 * CDN-served commenting widget for third-party websites
 *
 * Usage:
 *   <script src="https://cdn.tapko.com/v1/tapko-widget.min.js"></script>
 *   <script>
 *     // init() is async and validates the project before initializing
 *     await Tapko.init({
 *       projectId: 'your-project-id',
 *       apiKey: 'your-api-key', // Optional
 *       userId: 'user-123' // Optional: identify the current user
 *     });
 *   </script>
 *
 * The widget will:
 * - Validate the projectId and userId with the backend
 * - Throw an error if the project doesn't exist
 * - Disable itself if the project is not collecting feedback
 */

import { CONFIG } from './config.js';
import { APIClient } from './api/client.js';
import { CommentCard } from './components/CommentCard.js';
import { StatusWidget } from './components/StatusWidget.js';
import { dispatchCustomEvent } from './utils/dom.js';

(function(window, document) {
  'use strict';

  // Prevent multiple initializations
  if (window[CONFIG.NAMESPACE]) {
    console.warn('[Tapko] Widget already initialized');
    return;
  }

  /**
   * Main Tapko Widget Class
   */
  class TapkoWidget {
    constructor() {
      this.config = { ...CONFIG.DEFAULTS };
      this.apiClient = null;
      this.isInitialized = false;
      this.isDisabled = false;
      this.projectData = null;
      this.activeCards = new Set();
      this.statusWidget = new StatusWidget();

      // Event handlers (stored for cleanup)
      this.handleDoubleClick = null;
      this.handleTouchStart = null;
      this.handleDragStart = null;

      // Double-tap tracking
      this.lastTapTime = 0;
      this.lastTapTarget = null;
    }

    /**
     * Initialize the widget
     */
    async init(options = {}) {
      if (this.isInitialized) {
        console.warn('[Tapko] Already initialized');
        return;
      }

      // Validate required options
      if (!options.projectId) {
        throw new Error('[Tapko] projectId is required');
      }

      // Merge config
      this.config = { ...this.config, ...options };

      // Initialize API client
      this.apiClient = new APIClient({
        projectId: this.config.projectId,
        apiKey: this.config.apiKey,
        userId: this.config.userId,
        baseUrl: this.config.apiUrl
      });

      // Show status widget with loading state
      this.statusWidget.create();
      this.statusWidget.setStatus('loading');

      // Validate project before initializing
      try {
        const validation = await this.apiClient.validateProject();

        if (!validation.success || !validation.status.exists) {
          const error = new Error('[Tapko] Project not found. Please check your projectId.');
          this.statusWidget.setStatus('error');
          dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
            message: error.message,
            type: 'PROJECT_NOT_FOUND',
            validation
          });
          throw error;
        }

        if (!validation.status.isCollectingFeedback) {
          console.warn('[Tapko] Project is not currently collecting feedback. Widget is disabled.');
          this.isDisabled = true;
          this.statusWidget.setStatus('disabled');
          dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
            message: 'Project is not collecting feedback',
            type: 'PROJECT_DISABLED',
            validation
          });
        } else {
          // Validation successful and collecting feedback
          this.statusWidget.setStatus('success');
        }

        this.projectData = validation.data;
      } catch (error) {
        // If validation fails, throw error
        if (error.message.includes('Project not found')) {
          throw error;
        }
        // For network errors, warn but continue (fail gracefully)
        console.warn('[Tapko] Failed to validate project:', error.message);
        this.statusWidget.setStatus('error');
      }

      // Inject styles
      this._injectStyles();

      // Setup event listeners (only if not disabled)
      if (!this.isDisabled) {
        this._setupEventListeners();
      }

      this.isInitialized = true;

      // Dispatch initialized event
      dispatchCustomEvent(CONFIG.EVENTS.INITIALIZED, {
        version: CONFIG.VERSION,
        config: this.config,
        projectData: this.projectData,
        isDisabled: this.isDisabled
      });

      console.log('[Tapko] Widget initialized', CONFIG.VERSION, this.isDisabled ? '(disabled - not collecting feedback)' : '');
    }

    /**
     * Inject widget styles into page
     */
    _injectStyles() {
      if (document.getElementById('__tapko_widget_styles')) return;

      const style = document.createElement('style');
      style.id = '__tapko_widget_styles';
      style.textContent = INJECTED_CSS; // Will be replaced by build process

      document.head.appendChild(style);
    }

    /**
     * Setup event listeners for double-click and double-tap
     */
    _setupEventListeners() {
      // Double-click (desktop)
      if (this.config.doubleClickEnabled) {
        this.handleDoubleClick = this._onDoubleClick.bind(this);
        document.addEventListener('dblclick', this.handleDoubleClick, true);
      }

      // Double-tap (mobile)
      if (this.config.doubleTapEnabled) {
        this.handleTouchStart = this._onTouchStart.bind(this);
        document.addEventListener('touchstart', this.handleTouchStart, true);
      }

      // Prevent image dragging from interfering
      this.handleDragStart = (e) => {
        if (e.target.tagName === 'IMG') {
          e.preventDefault();
        }
      };
      document.addEventListener('dragstart', this.handleDragStart, true);
    }

    /**
     * Handle double-click event
     */
    _onDoubleClick(event) {
      // Prevent default behaviors
      event.preventDefault();
      event.stopPropagation();

      // Make images explicitly support comments
      if (event.target.tagName === 'IMG') {
        event.target.style.userSelect = 'none';
      }

      this._createCommentCard(event.target);
    }

    /**
     * Handle touch start for double-tap detection
     */
    _onTouchStart(event) {
      const now = Date.now();
      const tapTarget = event.target;
      const delta = now - this.lastTapTime;

      if (delta > 0 && delta < this.config.doubleTapDelay && tapTarget === this.lastTapTarget) {
        event.preventDefault();
        event.stopPropagation();
        this._createCommentCard(tapTarget);
        this.lastTapTime = 0;
        this.lastTapTarget = null;
      } else {
        this.lastTapTime = now;
        this.lastTapTarget = tapTarget;
      }
    }

    /**
     * Create comment card
     */
    _createCommentCard(target) {
      if (!this.isInitialized) {
        console.warn('[Tapko] Widget not initialized');
        return;
      }

      if (this.isDisabled) {
        console.warn('[Tapko] Widget is disabled. Project is not collecting feedback.');
        dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
          message: 'Widget is disabled. Project is not collecting feedback.',
          type: 'WIDGET_DISABLED'
        });
        return;
      }

      try {
        const card = new CommentCard(target, this.apiClient);
        this.activeCards.add(card);

        // Remove from active cards when closed
        const originalClose = card.close.bind(card);
        card.close = () => {
          originalClose();
          this.activeCards.delete(card);
        };

        dispatchCustomEvent(CONFIG.EVENTS.COMMENT_CREATED, {
          targetTag: target.tagName
        });
      } catch (error) {
        console.error('[Tapko] Error creating comment card:', error);
        dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
          message: error.message,
          stack: error.stack
        });
      }
    }

    /**
     * Programmatically create comment on element
     */
    createComment(selector) {
      const element = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;

      if (!element) {
        console.error('[Tapko] Element not found:', selector);
        return;
      }

      this._createCommentCard(element);
    }

    /**
     * Close all active comment cards
     */
    closeAll() {
      this.activeCards.forEach(card => card.close());
      this.activeCards.clear();
    }

    /**
     * Destroy widget and cleanup
     */
    destroy() {
      if (!this.isInitialized) return;

      // Remove event listeners
      if (this.handleDoubleClick) {
        document.removeEventListener('dblclick', this.handleDoubleClick, true);
      }
      if (this.handleTouchStart) {
        document.removeEventListener('touchstart', this.handleTouchStart, true);
      }
      if (this.handleDragStart) {
        document.removeEventListener('dragstart', this.handleDragStart, true);
      }

      // Close all cards
      this.closeAll();

      // Remove status widget
      if (this.statusWidget) {
        this.statusWidget.destroy();
      }

      // Remove styles
      const styleEl = document.getElementById('__tapko_widget_styles');
      if (styleEl) styleEl.remove();

      this.isInitialized = false;
      console.log('[Tapko] Widget destroyed');
    }

    /**
     * Get widget version
     */
    getVersion() {
      return CONFIG.VERSION;
    }

    /**
     * Check if widget is initialized
     */
    isReady() {
      return this.isInitialized;
    }

    /**
     * Get project status
     */
    getProjectStatus() {
      return {
        isInitialized: this.isInitialized,
        isDisabled: this.isDisabled,
        projectData: this.projectData
      };
    }
  }

  // Create global instance
  const tapko = new TapkoWidget();

  // Expose public API
  window[CONFIG.NAMESPACE] = {
    // Core methods
    init: tapko.init.bind(tapko),
    destroy: tapko.destroy.bind(tapko),

    // Utility methods
    createComment: tapko.createComment.bind(tapko),
    closeAll: tapko.closeAll.bind(tapko),
    getVersion: tapko.getVersion.bind(tapko),
    isReady: tapko.isReady.bind(tapko),
    getProjectStatus: tapko.getProjectStatus.bind(tapko),

    // Config (read-only)
    config: CONFIG,

    // Events enum
    events: CONFIG.EVENTS
  };

  // Auto-init if data attribute is present
  const autoInitScript = document.querySelector('script[data-tapko-project-id]');
  if (autoInitScript) {
    const projectId = autoInitScript.getAttribute('data-tapko-project-id');
    const apiKey = autoInitScript.getAttribute('data-tapko-api-key');
    const userId = autoInitScript.getAttribute('data-tapko-user-id');

    if (projectId) {
      window[CONFIG.NAMESPACE].init({ projectId, apiKey, userId }).catch(error => {
        console.error('[Tapko] Auto-init failed:', error);
      });
    }
  }

})(window, document);
