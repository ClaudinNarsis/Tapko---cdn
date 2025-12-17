/**
 * Tapko Widget - Main Entry Point
 * CDN-served feedback widget with gesture-free, discoverable design
 *
 * Architecture:
 * - Floating Entry Button (always visible)
 * - Feedback Mode Overlay (4% tint, intercepts clicks)
 * - Single-tap comment creation
 * - Explicit drawing mode via button
 * - No hidden gestures
 *
 * Usage:
 *   <script src="https://cdn.tapko.com/tapko-widget.min.js"></script>
 *   <script>
 *     await Tapko.init({
 *       projectId: 'your-project-id',
 *       apiKey: 'your-api-key',
 *       userId: 'user-123'
 *     });
 *   </script>
 */

import { CONFIG } from './config.js';
import { APIClient } from './api/client.js';
import { FloatingEntryButton } from './components/FloatingEntryButton.js';
import { FeedbackModeOverlay } from './components/FeedbackModeOverlay.js';
import { CommentCard } from './components/CommentCard.js';
import { DrawingCanvas } from './components/DrawingCanvas.js';
import { FeedbackDisabledPopup } from './components/FeedbackDisabledPopup.js';
import { dispatchCustomEvent } from './utils/dom.js';
import { logManager } from './managers/LogManager.js';
import FeedbackQueueManager from './managers/FeedbackQueueManager.js';
import SyncStatusIndicator from './components/SyncStatusIndicator.js';
import QueueViewerModal from './components/QueueViewerModal.js';
import SyncLifecycleManager from './managers/SyncLifecycleManager.js';
import NetworkStatusManager from './managers/NetworkStatusManager.js';

(function (window, document) {
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

      // Initialize log capture immediately
      logManager.init();

      // V2 Components
      this.floatingButton = new FloatingEntryButton();
      this.feedbackOverlay = null;
      this.drawingCanvas = null;
      this.disabledPopup = new FeedbackDisabledPopup();

      // Queue system components (NEW)
      this.queueManager = null;
      this.syncIndicator = null;
      this.queueViewer = null;
      this.lifecycleManager = null;
      this.networkManager = null;

      // State
      this.isInFeedbackMode = false;
      this.activeCard = null;
      this.escPressCount = 0;
      this.escTimeout = null;
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

      // Validate project before initializing
      try {
        const validation = await this.apiClient.validateProject();

        if (!validation.success || !validation.status.exists) {
          const error = new Error('[Tapko] Project not found. Please check your projectId.');
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
          // dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
          //   message: 'Project is not collecting feedback',
          //   type: 'PROJECT_DISABLED',
          //   validation
          // });
          // Don't return, allow initialization in disabled state
        }



        this.projectData = validation.data;
      } catch (error) {
        if (error.message.includes('Project not found')) {
          throw error;
        }
        console.warn('[Tapko] Failed to validate project:', error.message);
      }

      // Inject styles
      this._injectStyles();

      // Initialize queue system (NEW)
      await this._initializeQueueSystem();

      // Create floating entry button
      this.floatingButton.create(() => this._toggleFeedbackMode());
      if (this.isDisabled) {
        this.floatingButton.setDisabled(true);
      }
      this.floatingButton.show();

      // Setup ESC key handler
      this._setupEscapeHandler();

      this.isInitialized = true;

      // Dispatch initialized event
      dispatchCustomEvent(CONFIG.EVENTS.INITIALIZED, {
        version: CONFIG.VERSION,
        config: this.config,
        projectData: this.projectData,
        isDisabled: this.isDisabled,
        queueEnabled: this.queueManager?.initialized || false
      });

      console.log('[Tapko] Widget initialized', CONFIG.VERSION);
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
     * Setup ESC key handler
     */
    _setupEscapeHandler() {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this._handleEscape();
        }
      });
    }

    /**
     * Handle ESC key press
     * First ESC closes active card, second ESC exits feedback mode
     */
    _handleEscape() {
      // Clear previous timeout
      if (this.escTimeout) {
        clearTimeout(this.escTimeout);
      }

      this.escPressCount++;

      if (this.escPressCount === 1) {
        // First ESC: close active card or drawing
        if (this.activeCard) {
          this.activeCard.close();
          this.activeCard = null;
        } else if (this.drawingCanvas) {
          this._exitDrawingMode();
        }

        // Reset count after 1 second
        this.escTimeout = setTimeout(() => {
          this.escPressCount = 0;
        }, 1000);
      } else if (this.escPressCount === 2) {
        // Second ESC: exit feedback mode
        if (this.isInFeedbackMode) {
          this._exitFeedbackMode();
        }
        this.escPressCount = 0;
      }
    }

    /**
     * Toggle feedback mode
     */
    _toggleFeedbackMode() {
      if (this.isDisabled) {
        this.disabledPopup.show();
        return;
      }

      if (this.isInFeedbackMode) {
        this._exitFeedbackMode();
      } else {
        this._enterFeedbackMode();
      }
    }

    /**
     * Enter feedback mode
     */
    _enterFeedbackMode() {
      if (this.isInFeedbackMode || this.isDisabled) return;

      this.isInFeedbackMode = true;

      // Update floating button
      this.floatingButton.setFeedbackMode(true);

      // Create overlay
      this.feedbackOverlay = new FeedbackModeOverlay();
      this.feedbackOverlay.create((element, coordinates) => {
        this._createCommentCard(element, coordinates);
      });

      // Dispatch event
      dispatchCustomEvent(CONFIG.EVENTS.FEEDBACK_MODE_ENTERED);

      console.log('[Tapko] Entered feedback mode');
    }

    /**
     * Exit feedback mode
     */
    _exitFeedbackMode() {
      if (!this.isInFeedbackMode) return;

      this.isInFeedbackMode = false;

      // Update floating button
      this.floatingButton.setFeedbackMode(false);

      // Close active card
      if (this.activeCard) {
        this.activeCard.close();
        this.activeCard = null;
      }

      // Exit drawing mode
      if (this.drawingCanvas) {
        this._exitDrawingMode();
      }

      // Destroy overlay
      if (this.feedbackOverlay) {
        this.feedbackOverlay.destroy();
        this.feedbackOverlay = null;
      }

      // Dispatch event
      dispatchCustomEvent(CONFIG.EVENTS.FEEDBACK_MODE_EXITED);

      console.log('[Tapko] Exited feedback mode');
    }

    /**
     * Create comment card at tapped location
     */
    _createCommentCard(element, coordinates) {
      if (!this.isInitialized || this.isDisabled) {
        return;
      }

      // Close existing card
      if (this.activeCard) {
        this.activeCard.close();
      }

      try {
        const card = new CommentCard(element, coordinates, this.apiClient);

        // Set draw callback
        card.setDrawCallback((onComplete) => {
          this._enterDrawingMode(onComplete);
        });

        this.activeCard = card;

        // Remove from active when closed
        const originalClose = card.close.bind(card);
        card.close = () => {
          originalClose();
          if (this.activeCard === card) {
            this.activeCard = null;
            // Show snackbar again when card is closed
            if (this.isInFeedbackMode && this.feedbackOverlay && this.feedbackOverlay.snackbar) {
              this.feedbackOverlay.snackbar.show('Feedback mode — tap anything', { type: 'info' });
            }
          }
        };

        dispatchCustomEvent(CONFIG.EVENTS.COMMENT_CREATED, {
          targetTag: element.tagName
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
     * Enter drawing mode
     */
    _enterDrawingMode(onComplete) {
      if (this.drawingCanvas) return;

      // Update overlay label
      if (this.feedbackOverlay) {
        this.feedbackOverlay.setDrawingMode(true);
      }

      // Create drawing canvas
      this.drawingCanvas = new DrawingCanvas();
      this.drawingCanvas.create(
        (drawingData) => {
          // Done callback
          if (onComplete) {
            onComplete(drawingData);
          }
          this._exitDrawingMode();
        },
        () => {
          // Cancel callback
          this._exitDrawingMode();
        }
      );

      dispatchCustomEvent(CONFIG.EVENTS.DRAWING_STARTED);
    }

    /**
     * Exit drawing mode
     */
    _exitDrawingMode() {
      if (!this.drawingCanvas) return;

      // Update overlay label
      if (this.feedbackOverlay) {
        this.feedbackOverlay.setDrawingMode(false);
      }

      // Destroy canvas
      this.drawingCanvas.destroy();
      this.drawingCanvas = null;
    }

    /**
     * Programmatically enter feedback mode
     */
    enterFeedbackMode() {
      this._enterFeedbackMode();
    }

    /**
     * Programmatically exit feedback mode
     */
    exitFeedbackMode() {
      this._exitFeedbackMode();
    }

    /**
     * Close all active components
     */
    closeAll() {
      if (this.activeCard) {
        this.activeCard.close();
        this.activeCard = null;
      }
      if (this.isInFeedbackMode) {
        this._exitFeedbackMode();
      }
    }

    /**
     * Destroy widget and cleanup
     */
    destroy() {
      if (!this.isInitialized) return;

      // Exit feedback mode
      this._exitFeedbackMode();

      // Destroy floating button
      if (this.floatingButton) {
        this.floatingButton.destroy();
      }

      // Destroy disabled popup
      if (this.disabledPopup) {
        this.disabledPopup.destroy();
      }

      // Destroy queue system components (NEW)
      if (this.queueManager) {
        this.queueManager.destroy();
      }
      if (this.syncIndicator) {
        this.syncIndicator.destroy();
      }
      if (this.queueViewer) {
        this.queueViewer.destroy();
      }
      if (this.lifecycleManager) {
        this.lifecycleManager.destroy();
      }
      if (this.networkManager) {
        this.networkManager.destroy();
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
        isInFeedbackMode: this.isInFeedbackMode,
        projectData: this.projectData
      };
    }

    /**
     * Initialize queue system (NEW)
     */
    async _initializeQueueSystem() {
      try {
        console.log('[Tapko] Initializing queue system...');

        // Create queue manager
        this.queueManager = new FeedbackQueueManager(this.apiClient, {
          maxRetries: 5,
          baseRetryDelay: 5000,
          maxRetryDelay: 120000,
          autoCleanup: true,
          completedRetentionDays: 1
        });

        // Initialize queue manager
        const initialized = await this.queueManager.init();

        if (initialized) {
          // Create UI components
          this.syncIndicator = new SyncStatusIndicator(this.queueManager);
          this.queueViewer = new QueueViewerModal(this.queueManager);
          this.lifecycleManager = new SyncLifecycleManager(this.queueManager, this.syncIndicator);
          this.networkManager = new NetworkStatusManager(this.queueManager, this.syncIndicator);

          console.log('[Tapko] Queue system initialized successfully');
        } else {
          console.warn('[Tapko] Queue system not available (IndexedDB not supported)');
        }
      } catch (error) {
        console.error('[Tapko] Failed to initialize queue system:', error);
      }
    }

    /**
     * Show queue viewer modal (NEW)
     */
    showQueueViewer() {
      if (this.queueViewer) {
        this.queueViewer.open();
      }
    }

    /**
     * Close queue viewer modal (NEW)
     */
    closeQueueViewer() {
      if (this.queueViewer) {
        this.queueViewer.close();
      }
    }

    /**
     * Retry a specific queue item (NEW)
     */
    async retryQueueItem(itemId) {
      if (!this.queueManager) return;

      try {
        const item = await this.queueManager.getById(itemId);
        if (item) {
          item.attempts = 0;
          item.error = null;
          await this.queueManager.updateItem(itemId, item);
          await this.queueManager.updateStatus(itemId, 'pending');

          // Trigger processing
          setTimeout(() => this.queueManager.processQueue(), 500);
        }
      } catch (error) {
        console.error('[Tapko] Error retrying queue item:', error);
      }
    }

    /**
     * Remove a specific queue item (NEW)
     */
    async removeQueueItem(itemId) {
      if (!this.queueManager) return;

      try {
        await this.queueManager.remove(itemId);
      } catch (error) {
        console.error('[Tapko] Error removing queue item:', error);
      }
    }

    /**
     * Get queue statistics (NEW)
     */
    async getQueueStats() {
      if (!this.queueManager) {
        return { pending: 0, processing: 0, failed: 0, completed: 0 };
      }

      return await this.queueManager.getQueueStats();
    }
  }

  // Create global instance
  const tapko = new TapkoWidget();

  // Expose public API
  window[CONFIG.NAMESPACE] = {
    // Core methods
    init: tapko.init.bind(tapko),
    destroy: tapko.destroy.bind(tapko),

    // Feedback mode control
    enterFeedbackMode: tapko.enterFeedbackMode.bind(tapko),
    exitFeedbackMode: tapko.exitFeedbackMode.bind(tapko),

    // Utility methods
    closeAll: tapko.closeAll.bind(tapko),
    getVersion: tapko.getVersion.bind(tapko),
    isReady: tapko.isReady.bind(tapko),
    getProjectStatus: tapko.getProjectStatus.bind(tapko),

    // Queue system methods (NEW)
    showQueueViewer: tapko.showQueueViewer.bind(tapko),
    closeQueueViewer: tapko.closeQueueViewer.bind(tapko),
    retryQueueItem: tapko.retryQueueItem.bind(tapko),
    removeQueueItem: tapko.removeQueueItem.bind(tapko),
    getQueueStats: tapko.getQueueStats.bind(tapko),

    // Direct access to managers (for advanced usage)
    get queueManager() { return tapko.queueManager; },
    get syncIndicator() { return tapko.syncIndicator; },
    get queueViewer() { return tapko.queueViewer; },

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
