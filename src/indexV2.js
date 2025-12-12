/**
 * Tapko Widget V2 - Main Entry Point
 * CDN-served feedback widget with gesture-free, discoverable design
 *
 * V2 Architecture:
 * - Floating Entry Button (always visible)
 * - Feedback Mode Overlay (4% tint, intercepts clicks)
 * - Single-tap comment creation
 * - Explicit drawing mode via button
 * - No hidden gestures
 *
 * Usage:
 *   <script src="https://cdn.tapko.com/v2/tapko-widget.min.js"></script>
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
import { CommentCardV2 } from './components/CommentCardV2.js';
import { DrawingCanvas } from './components/DrawingCanvas.js';
import { dispatchCustomEvent } from './utils/dom.js';

(function(window, document) {
  'use strict';

  // Prevent multiple initializations
  if (window[CONFIG.NAMESPACE]) {
    console.warn('[Tapko] Widget already initialized');
    return;
  }

  /**
   * Main Tapko Widget Class (V2)
   */
  class TapkoWidgetV2 {
    constructor() {
      this.config = { ...CONFIG.DEFAULTS };
      this.apiClient = null;
      this.isInitialized = false;
      this.isDisabled = false;
      this.projectData = null;

      // V2 Components
      this.floatingButton = new FloatingEntryButton();
      this.feedbackOverlay = null;
      this.drawingCanvas = null;

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
          dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
            message: 'Project is not collecting feedback',
            type: 'PROJECT_DISABLED',
            validation
          });
          // Don't show button if disabled
          this.isInitialized = true;
          return;
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

      // Create floating entry button
      this.floatingButton.create(() => this._toggleFeedbackMode());
      this.floatingButton.show();

      // Setup ESC key handler
      this._setupEscapeHandler();

      this.isInitialized = true;

      // Dispatch initialized event
      dispatchCustomEvent(CONFIG.EVENTS.INITIALIZED, {
        version: CONFIG.VERSION,
        config: this.config,
        projectData: this.projectData,
        isDisabled: this.isDisabled
      });

      console.log('[Tapko] Widget V2 initialized', CONFIG.VERSION);
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
        const card = new CommentCardV2(element, coordinates, this.apiClient);

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
  }

  // Create global instance
  const tapko = new TapkoWidgetV2();

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
