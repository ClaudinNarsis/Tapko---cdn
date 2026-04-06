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
import { FeedbackWidget } from './components/FeedbackWidget.js';
import { dispatchCustomEvent, getUrlParam } from './utils/dom.js';
import { logManager } from './managers/LogManager.js';
import { networkLogManager } from './managers/NetworkLogManager.js';
import { analyticsManager } from './managers/AnalyticsManager.js';
import FeedbackQueueManager from './managers/FeedbackQueueManager.js';
import PinManager from './managers/PinManager.js';
import SyncStatusIndicator from './components/SyncStatusIndicator.js';
import QueueViewerModal from './components/QueueViewerModal.js';
import SyncLifecycleManager from './managers/SyncLifecycleManager.js';
import NetworkStatusManager from './managers/NetworkStatusManager.js';
import { ShadowStyleManager } from './utils/ShadowStyleManager.js';
import { ShadowEventBridge } from './utils/ShadowEventBridge.js';
import debugLogger from './utils/DebugLogger.js';

(function (window, document) {
  'use strict';

  // Expose CONFIG globally for DebugLogger
  window.TapkoConfig = CONFIG;

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
      networkLogManager.init();

      // Initialize debug logger and check for crashes
      this._initializeDebugSystem();

      // Shadow DOM properties
      this.shadowHost = null;
      this.shadowRoot = null;
      this.shadowStyleManager = null;
      this.eventBridge = null;

      // V2 Components
      this.floatingButton = new FloatingEntryButton();
      this.feedbackOverlay = null;
      this.drawingCanvas = null;
      this.disabledPopup = new FeedbackDisabledPopup();
      this.feedbackWidget = null;

      // Queue system components (NEW)
      this.queueManager = null;
      this.syncIndicator = null;

      // Pin management (NEW - Phase 1)
      this.pinManager = null;
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
     * Initialize debug system and setup global error handlers
     */
    _initializeDebugSystem() {
      // Setup global error handler
      window.addEventListener('error', (event) => {
        debugLogger.error('Global error caught', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error?.message,
          stack: event.error?.stack
        });
      });

      // Setup unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        debugLogger.error('Unhandled promise rejection', {
          reason: event.reason?.message || event.reason,
          promise: event.promise,
          stack: event.reason?.stack
        });
      });

      // Check for crash on initialization (silent monitoring)
      const crashData = debugLogger.detectCrash();
      if (crashData.crashed) {
        console.warn('[Tapko Debug] Previous session crashed during:', crashData.operation?.name);
        // Silently clear the crash marker
        debugLogger.clearAll();
      }

      // Enable debug mode via URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('tapko_debug') === 'true') {
        debugLogger.enableDebugMode();
        console.log('[Tapko Debug] Debug mode enabled via URL parameter');
      }

      debugLogger.info('Tapko widget initializing', {
        version: CONFIG.VERSION,
        url: window.location.href
      });

      // Expose debug utilities globally for easy access
      window.TapkoDebug = {
        // Download memory report
        downloadMemoryReport: () => {
          debugLogger.downloadMemoryReport();
        },

        // Download all logs
        downloadLogs: () => {
          debugLogger.downloadLogs(`tapko-logs-${Date.now()}.json`);
        },

        // View memory report in console
        viewMemoryReport: () => {
          const report = debugLogger.getMemoryReport();
          console.log('='.repeat(60));
          console.log('TAPKO MEMORY REPORT');
          console.log('='.repeat(60));
          console.log('Total Checkpoints:', report.totalCheckpoints);
          if (report.largestIncrease) {
            console.log('\nLARGEST MEMORY INCREASE:');
            console.log(`  From: ${report.largestIncrease.from}`);
            console.log(`  To: ${report.largestIncrease.to}`);
            console.log(`  Delta: ${report.largestIncrease.deltaFormatted} (${report.largestIncrease.percentChange}%)`);
          }
          console.log('\nAll deltas:');
          report.deltas.forEach(d => {
            console.log(`  ${d.from} → ${d.to}: ${d.deltaFormatted} (${d.percentChange}%)`);
          });
          console.log('\nFull report object:', report);
          return report;
        },

        // View all logs
        viewLogs: () => {
          const logs = debugLogger.getLogs();
          console.log('='.repeat(60));
          console.log(`TAPKO LOGS (${logs.length} entries)`);
          console.log('='.repeat(60));
          logs.forEach((log, i) => {
            console.log(`${i + 1}. [${log.level}] ${log.message}`, log.data || '');
          });
          return logs;
        },

        // Enable debug mode
        enable: () => {
          debugLogger.enableDebugMode();
          console.log('✅ Debug mode enabled. Reload page to start fresh logging.');
        },

        // Disable debug mode
        disable: () => {
          debugLogger.disableDebugMode();
          console.log('✅ Debug mode disabled.');
        },

        // Clear all debug data
        clear: () => {
          debugLogger.clearAll();
          localStorage.removeItem('tapko_memory_checkpoints');
          console.log('✅ All debug data cleared.');
        },

        // View captured network requests
        viewNetworkLogs: () => {
          const logs = networkLogManager.getNetworkLogs();
          console.log('='.repeat(60));
          console.log(`TAPKO NETWORK LOGS (${logs.length} entries)`);
          console.log('='.repeat(60));
          logs.forEach((entry, i) => {
            const status = entry.status != null ? `${entry.status} ${entry.statusText || ''}`.trim() : (entry.error || 'pending');
            console.log(`${i + 1}. [${entry.type.toUpperCase()}] [${entry.method}] ${entry.url} → ${status} (${entry.duration != null ? entry.duration + 'ms' : '-'})`);
          });
          return logs;
        },

        // Check crash status
        checkCrash: () => {
          const crash = debugLogger.detectCrash();
          if (crash.crashed) {
            console.log('🚨 CRASH DETECTED during:', crash.operation.name);
            console.log('Details:', crash);
          } else {
            console.log('✅ No crash detected');
          }
          return crash;
        }
      };

      console.log('[Tapko Debug] Utilities available at window.TapkoDebug');
      console.log('  TapkoDebug.downloadMemoryReport() - Download memory analysis');
      console.log('  TapkoDebug.downloadLogs()         - Download all logs');
      console.log('  TapkoDebug.viewMemoryReport()     - View memory in console');
      console.log('  TapkoDebug.viewLogs()             - View all logs');
      console.log('  TapkoDebug.enable()               - Enable debug mode');
      console.log('  TapkoDebug.viewNetworkLogs()      - View captured network requests');
      console.log('  TapkoDebug.checkCrash()           - Check for crashes');
    }

    /**
     * Create shadow DOM container and initialize isolation
     */
    _createShadowDOM() {
      // Create shadow host element
      this.shadowHost = document.createElement('div');
      this.shadowHost.id = 'tapko-widget-shadow-host';
      this.shadowHost.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: ${CONFIG.UI.zIndex} !important;
      `;

      // Attach shadow root (closed mode for encapsulation)
      this.shadowRoot = this.shadowHost.attachShadow({
        mode: 'closed',
        delegatesFocus: true  // Automatically manage focus
      });

      // Create style manager
      this.shadowStyleManager = new ShadowStyleManager(this.shadowRoot);

      // Create event bridge
      this.eventBridge = new ShadowEventBridge(this.shadowRoot, window);

      // Expose internally for components (not on public API)
      window.Tapko._internal = {
        shadowRoot: this.shadowRoot,
        shadowStyleManager: this.shadowStyleManager,
        eventBridge: this.eventBridge
      };

      // Append to body
      document.body.appendChild(this.shadowHost);

      console.log('[Tapko] Shadow DOM initialized');
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

        // Verify URL secret key if security is enabled
        const security = validation.data?.security;

        if (security && security.is_url_secret_enabled === true) {
            const urlSecretKey = getUrlParam('tapko_url_secret_key');

            if (!urlSecretKey) {
              console.error('[Tapko Security] URL secret key is required but missing from URL parameters');
              const error = new Error('[Tapko] URL secret key is required but not provided in URL parameters.');
              dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
                message: error.message,
                type: 'URL_SECRET_KEY_MISSING',
                validation
              });
              throw error;
            }

            if (urlSecretKey !== security.url_secret_key) {
              console.error('[Tapko Security] Invalid URL secret key provided');
              const error = new Error('[Tapko] Invalid URL secret key.');
              dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
                message: error.message,
                type: 'URL_SECRET_KEY_INVALID',
                validation
              });
              throw error;
            }
        }
      } catch (error) {
        // Re-throw critical errors that should stop initialization
        if (error.message.includes('Project not found') ||
            error.message.includes('URL secret key')) {
          throw error;
        }
        console.warn('[Tapko] Failed to validate project:', error.message);
      }

      // Create shadow DOM BEFORE injecting styles
      this._createShadowDOM();

      // Inject styles (now goes into shadow DOM)
      this._injectStyles();

      // Initialize analytics (NEW)
      await analyticsManager.init(this.config.projectId, this.config.userId);

      // Initialize queue system (NEW)
      await this._initializeQueueSystem();

      // Initialize pin manager (NEW - Phase 1)
      await this._initializePinManager();

      // Create floating entry button (pass shadow root)
      this.floatingButton.create(() => this._toggleFeedbackMode(), this.shadowRoot);
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
     * Inject widget styles into shadow DOM
     */
    _injectStyles() {
      if (!this.shadowStyleManager) {
        console.error('[Tapko] Shadow style manager not initialized');
        return;
      }

      // Inject main widget styles into shadow DOM
      this.shadowStyleManager.injectStyles(
        '__tapko_widget_styles',
        INJECTED_CSS  // Will be replaced by build process
      );
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
    async _enterFeedbackMode() {
      if (this.isInFeedbackMode || this.isDisabled) return;

      this.isInFeedbackMode = true;

      // Save original overflow but DON'T lock scroll - allow normal scrolling
      this._originalOverflow = document.body.style.overflow;

      // Hide floating button
      this.floatingButton.hide();

      // Show pins in feedback mode
      if (this.pinManager) {
        this.pinManager.show();
      }

      try {
        // Create feedback widget (view all feedback button)
        this.feedbackWidget = new FeedbackWidget();
        this.feedbackWidget.create(this.config.projectId, CONFIG.FEEDBACK_URL, this.shadowRoot, this.pinManager);

        // Create feedback overlay (shows glowing border and handles clicks)
        this.feedbackOverlay = new FeedbackModeOverlay();
        this.feedbackOverlay.create(
          (targetElement, coordinates) => {
            // User clicked on the page - create comment card
            this._createCommentCard(targetElement, coordinates);
          },
          () => {
            // User clicked exit - exit feedback mode
            this._exitFeedbackMode();
          },
          this.shadowRoot
        );

        // Dispatch event
        dispatchCustomEvent(CONFIG.EVENTS.FEEDBACK_MODE_ENTERED);

        console.log('[Tapko] Entered feedback mode - click anywhere to add feedback');

      } catch (error) {
        console.error('[Tapko] Failed to enter feedback mode:', error);

        // Hide pins on error
        if (this.pinManager) {
          this.pinManager.hide();
        }

        // Clean up feedback widget if it was created
        if (this.feedbackWidget) {
          this.feedbackWidget.destroy();
          this.feedbackWidget = null;
        }

        // Clean up feedback overlay if it was created
        if (this.feedbackOverlay) {
          this.feedbackOverlay.destroy();
          this.feedbackOverlay = null;
        }

        // Reset state
        this.isInFeedbackMode = false;
        document.body.style.overflow = this._originalOverflow || '';
        this.floatingButton.show();

        // Notify user with a friendly error message
        alert('Failed to start feedback mode. Please try again.');

        // Dispatch error event
        dispatchCustomEvent(CONFIG.EVENTS.ERROR, {
          message: error.message,
          stack: error.stack
        });
      }
    }

    /**
     * Exit feedback mode
     */
    _exitFeedbackMode() {
      if (!this.isInFeedbackMode) return;

      this.isInFeedbackMode = false;

      // Hide pins when exiting feedback mode
      if (this.pinManager) {
        this.pinManager.hide();
      }

      // Destroy feedback widget
      if (this.feedbackWidget) {
        this.feedbackWidget.destroy();
        this.feedbackWidget = null;
      }

      // Show floating button again
      this.floatingButton.show();

      // Restore scroll
      document.body.style.overflow = this._originalOverflow || '';

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
        // Create card in shadow root (pass pinManager for Phase 1)
        const card = new CommentCard(element, coordinates, this.apiClient, this.shadowRoot, this.pinManager);

        // Set draw callback to enter drawing mode with screenshot and annotations
        card.setDrawCallback((onComplete, screenshotData, existingAnnotations) => {
          this._enterDrawingMode(onComplete, screenshotData, existingAnnotations);
        });

        // Set feedback widget reference so it can be hidden during screenshot capture
        if (this.feedbackWidget) {
          card.setFeedbackWidget(this.feedbackWidget);
        }

        this.activeCard = card;

        // Remove from active when closed
        const originalClose = card.close.bind(card);
        card.close = () => {
          originalClose();
          if (this.activeCard === card) {
            this.activeCard = null;
          }
          // Restore snackbar when comment card is closed
          if (this.feedbackOverlay && this.feedbackOverlay.snackbar) {
            this.feedbackOverlay.snackbar.show('Feedback mode ON', {
              type: 'error',
              showExitButton: true,
              onExit: () => this._exitFeedbackMode()
            });
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
     * Enter drawing mode with screenshot
     * @param {Function} onComplete - Callback when drawing is complete
     * @param {Object} screenshotData - Screenshot data (dataURL and metadata)
     */
    _enterDrawingMode(onComplete, screenshotData, existingAnnotations = null) {
      if (this.drawingCanvas) {
        this.drawingCanvas.destroy();
        this.drawingCanvas = null;
      }

      // Hide overlay and its snackbar while drawing
      if (this.feedbackOverlay) {
        this.feedbackOverlay.hide();
      }

      // Hide feedback widget while drawing
      if (this.feedbackWidget) {
        this.feedbackWidget.hide();
      }

      // Create drawing canvas with screenshot as background and existing annotations
      this.drawingCanvas = new DrawingCanvas();
      this.drawingCanvas.create(
        (drawingData) => {
          // Done callback (triggers when user clicks Done button)
          if (onComplete) {
            onComplete(drawingData);
          }
          this._exitDrawingMode();
        },
        () => {
          // Cancel/Exit callback - just exit drawing mode and restore comment card
          this._exitDrawingMode();
          if (this.activeCard) {
            this.activeCard.restore();
          }
        },
        this.shadowRoot,
        screenshotData,
        null,  // No onTap handler - user is annotating existing comment
        existingAnnotations  // NEW: Pass existing annotations for reopening
      );

      dispatchCustomEvent(CONFIG.EVENTS.DRAWING_STARTED);
    }

    /**
     * Exit drawing mode
     */
    _exitDrawingMode() {
      if (!this.drawingCanvas) return;

      // Restore overlay and feedback widget
      if (this.feedbackOverlay) {
        this.feedbackOverlay.show();
      }

      if (this.feedbackWidget) {
        this.feedbackWidget.show();
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

      // Destroy feedback widget
      if (this.feedbackWidget) {
        this.feedbackWidget.destroy();
      }

      // Destroy analytics (NEW)
      analyticsManager.destroy();

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

      // Remove shadow host entirely (this removes all shadow DOM content)
      if (this.shadowHost && this.shadowHost.parentNode) {
        this.shadowHost.parentNode.removeChild(this.shadowHost);
      }

      // Clean up internal references
      if (window.Tapko._internal) {
        delete window.Tapko._internal;
      }

      this.shadowHost = null;
      this.shadowRoot = null;
      this.shadowStyleManager = null;
      this.eventBridge = null;

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
     * Initialize pin manager (NEW - Phase 1)
     */
    async _initializePinManager() {
      try {
        console.log('[Tapko] Initializing pin manager...');

        // Create pin manager
        this.pinManager = new PinManager(this.shadowRoot, this.apiClient);

        // Initialize and fetch pins for current page
        await this.pinManager.init(this.config.projectId, window.location.href);

        // Setup scroll/resize handlers for pin position updates
        // Use requestAnimationFrame for smooth, synchronized updates
        let rafId = null;
        const updatePins = () => {
          if (rafId) {
            return; // Already scheduled
          }

          rafId = requestAnimationFrame(() => {
            if (this.pinManager) {
              this.pinManager.updateAllPinPositions();
            }
            rafId = null;
          });
        };

        window.addEventListener('scroll', updatePins, { passive: true });
        window.addEventListener('resize', updatePins, { passive: true });

        // Listen for feedback queued event to create pins immediately
        this.queueManager.on('queue:added', async ({ id, item }) => {
          console.log('[Tapko] Feedback queued, creating pin immediately:', id);

          const feedbackData = item.feedbackData;

          if (!feedbackData || !feedbackData.context || !feedbackData.context.commentPosition) {
            console.warn('[Tapko] No comment position in feedback data, cannot create pin');
            return;
          }

          try {
            // Create pin with queue ID immediately (will be updated with feedbackId later)
            const pinData = {
              id: id, // Use queue ID initially
              queueId: id, // Store queue ID for later updates
              projectId: feedbackData.projectId,
              pageUrl: feedbackData.context.pageUrl,
              position: {
                documentX: feedbackData.context.commentPosition.x,
                documentY: feedbackData.context.commentPosition.y,
                viewportX: feedbackData.context.commentPosition.x,
                viewportY: feedbackData.context.commentPosition.y
              },
              comment: {
                text: feedbackData.description || feedbackData.title || 'No comment text',
                createdAt: feedbackData.context.timestamp || new Date().toISOString()
              },
              createdAt: feedbackData.context.timestamp || new Date().toISOString(),
              createdInThisBrowser: true
            };

            await this.pinManager.createPin(pinData);
            console.log('[Tapko] Pin created immediately after queueing:', id);
          } catch (error) {
            console.error('[Tapko] Failed to create immediate pin:', error);
          }
        });

        // Listen for successful feedback submissions to update pins with backend feedbackId
        this.queueManager.on('queue:item-completed', async ({ id, feedbackId, feedbackData }) => {
          console.log('[Tapko] Queue item completed, updating pin with feedbackId:', { id, feedbackId });

          if (!feedbackId) {
            console.warn('[Tapko] No feedbackId provided, pin will keep queue ID');
            return;
          }

          try {
            // Update the existing pin with the real feedbackId from backend
            const existingPin = this.pinManager.getPins().get(id);
            if (existingPin) {
              // Remove old pin with queue ID
              await this.pinManager.removePin(id);

              // Create new pin with backend feedbackId
              const pinData = {
                id: feedbackId,
                queueId: id,
                projectId: feedbackData.projectId,
                pageUrl: feedbackData.context.pageUrl,
                position: {
                  documentX: feedbackData.context.commentPosition.x,
                  documentY: feedbackData.context.commentPosition.y,
                  viewportX: feedbackData.context.commentPosition.x,
                  viewportY: feedbackData.context.commentPosition.y
                },
                comment: {
                  text: feedbackData.description || feedbackData.title || 'No comment text',
                  createdAt: feedbackData.context.timestamp || new Date().toISOString()
                },
                createdAt: feedbackData.context.timestamp || new Date().toISOString(),
                createdInThisBrowser: true
              };

              await this.pinManager.createPin(pinData);
              console.log('[Tapko] Pin updated with backend feedbackId:', feedbackId);
            } else {
              console.warn('[Tapko] No existing pin found for queue ID:', id);
            }
          } catch (error) {
            console.error('[Tapko] Failed to update pin with feedbackId:', error);
          }
        });

        console.log('[Tapko] Pin manager initialized successfully');
      } catch (error) {
        console.error('[Tapko] Failed to initialize pin manager:', error);
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
