/**
 * Tapko Widget Configuration
 * Central configuration for the widget
 */

export const CONFIG = {
  // Widget version
  VERSION: '1.0.0',

  // API Configuration
  API: {
    baseUrl: typeof process !== 'undefined' && process.env && process.env.API_URL
      ? process.env.API_URL
      : 'http://localhost:6000/api',
    version: '',
    timeout: 5000,
    retries: 3
  },

  // Widget defaults
  DEFAULTS: {
    theme: 'light',
    position: 'bottom-right',
    enableVoiceComments: true,
    enableEmojis: true,
    doubleClickEnabled: true,
    doubleTapEnabled: true,
    doubleTapDelay: 300
  },

  // UI Configuration
  UI: {
    cardMinWidth: 260,
    cardMaxWidth: 340,
    animationDuration: 300,
    zIndex: 2147483647
  },

  // Event names
  EVENTS: {
    INITIALIZED: 'tapko:initialized',
    COMMENT_CREATED: 'tapko:comment:created',
    COMMENT_SUBMITTED: 'tapko:comment:submitted',
    COMMENT_CLOSED: 'tapko:comment:closed',
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
Object.freeze(CONFIG.EVENTS);
