/**
 * Tapko Widget Configuration
 * Central configuration for the widget
 */

export const CONFIG = {
  // Widget version
  VERSION: '1.0.0',

  // API Configuration
  API: {
    baseUrl: process.env.API_URL || 'https://5mjiz034ia.execute-api.ap-south-1.amazonaws.com/dev/api',
    rendererUrl: process.env.RENDERER_URL || '',
    version: '',
    timeout: 20000,
    retries: 3
  },

  // Feedback URL Configuration
  FEEDBACK_URL: process.env.FEEDBACK_URL || 'http://localhost:3001/feedbacks',

  // Widget defaults
  DEFAULTS: {
    theme: 'light',
    position: 'bottom-right',
    enableVoiceComments: true,
    enableEmojis: true,
    enableDrawing: true,
    // V2: Single-tap mode (no double-click/tap required in feedback mode)
    feedbackModeEnabled: true,
    // Widget-copy fallback text (widget-copy plan) — used when a project's
    // widgetSettings.placeholderText/submitButtonText is unset/empty.
    // Independently maintained from TapKo's own copy of these same strings
    // (src/lib/widgetSettings.ts WIDGET_SETTINGS_DEFAULTS, used for the
    // settings-UI preview) — no shared source, no cross-repo runtime call.
    commentPlaceholderText: "What's on your mind?",
    submitButtonText: 'Submit'
  },

  // UI Configuration
  UI: {
    cardMinWidth: 260,
    cardMaxWidth: 340,
    animationDuration: 300,
    zIndex: 2147483647,
    // V2: Floating entry button specs
    entryButtonSize: 44, // 38-44px per spec
    overlayOpacity: 0.04, // 4% tint
    overlayColor: 'rgba(0, 0, 0, 0.04)'
  },

  // Drawing Configuration
  DRAWING: {
    strokeWidth: 2,
    defaultColor: '#ff0000', // Red (can be changed to yellow #ffaa00)
    smoothing: true
  },

  // Debug Configuration
  DEBUG: {
    enabled: false,
    storageKeys: {
      LOGS: 'tapko_debug_logs',
      ACTIVE_OPERATION: 'tapko_debug_active_operation',
      SYSTEM_INFO: 'tapko_debug_system_info',
      DEBUG_MODE: 'tapko_debug_mode'
    },
    maxLogs: 200,
    maxCanvasSize: 4096,
    maxPixels: 16777216
  },

  // Event names
  EVENTS: {
    INITIALIZED: 'tapko:initialized',
    FEEDBACK_MODE_ENTERED: 'tapko:feedback:mode:entered',
    FEEDBACK_MODE_EXITED: 'tapko:feedback:mode:exited',
    FEEDBACK_TARGET_SELECTED: 'tapko:feedback:target:selected',
    COMMENT_CREATED: 'tapko:comment:created',
    COMMENT_SUBMITTED: 'tapko:comment:submitted',
    COMMENT_CLOSED: 'tapko:comment:closed',
    DRAWING_STARTED: 'tapko:drawing:started',
    DRAWING_COMPLETED: 'tapko:drawing:completed',
    DRAWING_UNDO: 'tapko:drawing:undo',
    DRAWING_CLEARED: 'tapko:drawing:cleared',
    RECORDING_STARTED: 'tapko:recording:started',
    RECORDING_STOPPED: 'tapko:recording:stopped',
    ERROR: 'tapko:error'
  },

  // CSS class prefixes to avoid conflicts
  CLASS_PREFIX: 'dtc-',

  // Global namespace
  NAMESPACE: 'Tapko'
};

// Freeze config to prevent modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.API);
Object.freeze(CONFIG.DEFAULTS);
Object.freeze(CONFIG.UI);
Object.freeze(CONFIG.DRAWING);
Object.freeze(CONFIG.DEBUG);
Object.freeze(CONFIG.DEBUG.storageKeys);
Object.freeze(CONFIG.EVENTS);
