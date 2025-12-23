/**
 * Analytics Manager
 * Handles Google Analytics 4 integration for widget observability
 * Tracks all user interactions across multiple domains
 */

import { CONFIG } from '../config.js';

class AnalyticsManager {
  constructor() {
    this.measurementId = 'G-KBPCZXZR96';
    this.isInitialized = false;
    this.projectId = null;
    this.userId = null;
    this.sessionId = this._generateSessionId();
    this.eventQueue = [];
    this.isScriptLoaded = false;
  }

  /**
   * Initialize analytics tracking
   */
  async init(projectId, userId) {
    if (this.isInitialized) {
      console.log('[Tapko Analytics] Already initialized');
      return;
    }

    this.projectId = projectId;
    this.userId = userId || 'anonymous';

    try {
      // Load Google Analytics script
      await this._loadGtagScript();

      // Initialize gtag
      this._initializeGtag();

      // Setup event listeners
      this._setupEventListeners();

      this.isInitialized = true;
      console.log('[Tapko Analytics] Initialized with Measurement ID:', this.measurementId);

      // Process any queued events
      this._processQueuedEvents();

      // Track initialization
      this.trackEvent('widget_initialized', {
        widget_version: CONFIG.VERSION,
        session_id: this.sessionId,
        page_url: window.location.href,
        page_title: document.title,
        user_agent: navigator.userAgent,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        viewport_size: `${window.innerWidth}x${window.innerHeight}`
      });
    } catch (error) {
      console.error('[Tapko Analytics] Initialization failed:', error);
    }
  }

  /**
   * Load Google Analytics gtag.js script
   */
  _loadGtagScript() {
    return new Promise((resolve, reject) => {
      // Check if gtag is already loaded
      if (window.gtag && window.dataLayer) {
        this.isScriptLoaded = true;
        resolve();
        return;
      }

      // Create script element
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;

      script.onload = () => {
        this.isScriptLoaded = true;
        resolve();
      };

      script.onerror = () => {
        reject(new Error('Failed to load Google Analytics script'));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Initialize gtag function
   */
  _initializeGtag() {
    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];

    // Define gtag function
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };

    // Set config
    window.gtag('js', new Date());
    window.gtag('config', this.measurementId, {
      send_page_view: false, // We'll manually track page views
      user_id: this.userId,
      custom_map: {
        dimension1: 'project_id',
        dimension2: 'user_id',
        dimension3: 'session_id'
      }
    });
  }

  /**
   * Setup event listeners for all widget events
   */
  _setupEventListeners() {
    // Widget lifecycle
    window.addEventListener(CONFIG.EVENTS.INITIALIZED, (e) => {
      this.trackEvent('widget_ready', {
        is_disabled: e.detail?.isDisabled || false,
        queue_enabled: e.detail?.queueEnabled || false,
        project_data: e.detail?.projectData ? 'present' : 'absent'
      });
    });

    // Feedback mode
    window.addEventListener(CONFIG.EVENTS.FEEDBACK_MODE_ENTERED, () => {
      this.trackEvent('feedback_mode_entered', {
        entry_point: 'floating_button'
      });
    });

    window.addEventListener(CONFIG.EVENTS.FEEDBACK_MODE_EXITED, () => {
      this.trackEvent('feedback_mode_exited');
    });

    // Target selection
    window.addEventListener(CONFIG.EVENTS.FEEDBACK_TARGET_SELECTED, (e) => {
      this.trackEvent('target_selected', {
        target_tag: e.detail?.targetTag || 'unknown',
        has_coordinates: !!(e.detail?.coordinates)
      });
    });

    // Comment lifecycle
    window.addEventListener(CONFIG.EVENTS.COMMENT_CREATED, (e) => {
      this.trackEvent('comment_created', {
        target_tag: e.detail?.targetTag || 'unknown'
      });
    });

    window.addEventListener(CONFIG.EVENTS.COMMENT_SUBMITTED, (e) => {
      this.trackEvent('comment_submitted', {
        has_text: e.detail?.hasText || false,
        has_emoji: e.detail?.hasEmoji || false,
        has_screenshot: e.detail?.hasScreenshot || false,
        has_drawing: e.detail?.hasDrawing || false,
        has_recording: e.detail?.hasRecording || false,
        target_tag: e.detail?.targetTag || 'unknown',
        comment_length: e.detail?.commentLength || 0
      });
    });

    window.addEventListener(CONFIG.EVENTS.COMMENT_CLOSED, (e) => {
      this.trackEvent('comment_closed', {
        was_submitted: e.detail?.wasSubmitted || false
      });
    });

    // Drawing
    window.addEventListener(CONFIG.EVENTS.DRAWING_STARTED, () => {
      this.trackEvent('drawing_started');
    });

    window.addEventListener(CONFIG.EVENTS.DRAWING_COMPLETED, (e) => {
      this.trackEvent('drawing_completed', {
        has_data: !!(e.detail?.drawingData)
      });
    });

    window.addEventListener(CONFIG.EVENTS.DRAWING_UNDO, () => {
      this.trackEvent('drawing_undo');
    });

    window.addEventListener(CONFIG.EVENTS.DRAWING_CLEARED, () => {
      this.trackEvent('drawing_cleared');
    });

    // Recording
    window.addEventListener(CONFIG.EVENTS.RECORDING_STARTED, () => {
      this.trackEvent('recording_started');
    });

    window.addEventListener(CONFIG.EVENTS.RECORDING_STOPPED, (e) => {
      this.trackEvent('recording_stopped', {
        duration_ms: e.detail?.duration || 0,
        has_audio: !!(e.detail?.audioBlob)
      });
    });

    // Errors
    window.addEventListener(CONFIG.EVENTS.ERROR, (e) => {
      this.trackEvent('widget_error', {
        error_type: e.detail?.type || 'unknown',
        error_message: e.detail?.message || 'No message',
        fatal: false
      });
    });
  }

  /**
   * Track a custom event
   */
  trackEvent(eventName, params = {}) {
    if (!this.isInitialized || !this.isScriptLoaded) {
      // Queue event for later
      this.eventQueue.push({ eventName, params });
      return;
    }

    try {
      // Add common parameters
      const enrichedParams = {
        ...params,
        project_id: this.projectId,
        user_id: this.userId,
        session_id: this.sessionId,
        widget_version: CONFIG.VERSION,
        page_url: window.location.href,
        timestamp: new Date().toISOString()
      };

      // Send to GA4
      window.gtag('event', eventName, enrichedParams);

      console.log(`[Tapko Analytics] Event tracked: ${eventName}`, enrichedParams);
    } catch (error) {
      console.error('[Tapko Analytics] Error tracking event:', error);
    }
  }

  /**
   * Process queued events
   */
  _processQueuedEvents() {
    if (this.eventQueue.length === 0) return;

    console.log(`[Tapko Analytics] Processing ${this.eventQueue.length} queued events`);

    this.eventQueue.forEach(({ eventName, params }) => {
      this.trackEvent(eventName, params);
    });

    this.eventQueue = [];
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track page view (optional, for single-page apps)
   */
  trackPageView(pageTitle = document.title, pageUrl = window.location.href) {
    if (!this.isInitialized) return;

    window.gtag('event', 'page_view', {
      page_title: pageTitle,
      page_location: pageUrl,
      project_id: this.projectId,
      user_id: this.userId,
      session_id: this.sessionId
    });
  }

  /**
   * Track timing metric
   */
  trackTiming(category, variable, value, label = '') {
    if (!this.isInitialized) return;

    this.trackEvent('timing_complete', {
      timing_category: category,
      timing_variable: variable,
      timing_value: value,
      timing_label: label
    });
  }

  /**
   * Track user engagement
   */
  trackEngagement(engagementType, data = {}) {
    if (!this.isInitialized) return;

    this.trackEvent('user_engagement', {
      engagement_type: engagementType,
      ...data
    });
  }

  /**
   * Destroy analytics and cleanup
   */
  destroy() {
    if (!this.isInitialized) return;

    // Track widget destruction
    this.trackEvent('widget_destroyed', {
      session_duration: Date.now() - parseInt(this.sessionId.split('_')[1])
    });

    this.isInitialized = false;
    console.log('[Tapko Analytics] Destroyed');
  }
}

// Export singleton
export const analyticsManager = new AnalyticsManager();
