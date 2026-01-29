/**
 * Device Matcher Utility
 * Determines if feedback from one device should be displayed on another device
 * based on viewport dimensions, screen size, and DPR
 */

/**
 * Device type categories
 */
const DEVICE_CATEGORIES = {
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop'
};

/**
 * Tolerance in pixels for viewport matching
 */
const VIEWPORT_TOLERANCE = 50; // ±100 pixels

/**
 * DPR tolerance (for Retina vs non-Retina displays)
 */
const DPR_TOLERANCE = 0.5;

/**
 * Categorize device based on viewport width
 * @param {number} viewportWidth - Viewport width in pixels
 * @returns {string} - Device category
 */
function categorizeDevice(viewportWidth) {
  if (viewportWidth <= 768) {
    return DEVICE_CATEGORIES.MOBILE;
  } else if (viewportWidth <= 1024) {
    return DEVICE_CATEGORIES.TABLET;
  } else {
    return DEVICE_CATEGORIES.DESKTOP;
  }
}

/**
 * Check if two viewport dimensions are similar within tolerance
 * @param {number} dim1 - First dimension
 * @param {number} dim2 - Second dimension
 * @param {number} tolerance - Allowed difference in pixels
 * @returns {boolean}
 */
function areDimensionsSimilar(dim1, dim2, tolerance = VIEWPORT_TOLERANCE) {
  return Math.abs(dim1 - dim2) <= tolerance;
}

/**
 * Check if two DPR values are similar
 * @param {number} dpr1 - First DPR
 * @param {number} dpr2 - Second DPR
 * @returns {boolean}
 */
function areDPRsSimilar(dpr1, dpr2) {
  return Math.abs(dpr1 - dpr2) <= DPR_TOLERANCE;
}

/**
 * Calculate similarity score between two devices (0-100)
 * Higher score means more similar devices
 * @param {Object} currentDevice - Current device info
 * @param {Object} feedbackDevice - Feedback device info
 * @returns {number} - Similarity score (0-100)
 */
export function calculateDeviceSimilarity(currentDevice, feedbackDevice) {
  let score = 0;

  // Category match (30 points)
  const currentCategory = categorizeDevice(currentDevice.viewportWidth);
  const feedbackCategory = categorizeDevice(feedbackDevice.viewportWidth);

  if (currentCategory === feedbackCategory) {
    score += 30;
  }

  // Viewport width similarity (25 points)
  const widthDiff = Math.abs(currentDevice.viewportWidth - feedbackDevice.viewportWidth);
  const widthSimilarity = Math.max(0, 1 - (widthDiff / VIEWPORT_TOLERANCE));
  score += widthSimilarity * 25;

  // Viewport height similarity (25 points)
  const heightDiff = Math.abs(currentDevice.viewportHeight - feedbackDevice.viewportHeight);
  const heightSimilarity = Math.max(0, 1 - (heightDiff / VIEWPORT_TOLERANCE));
  score += heightSimilarity * 25;

  // DPR similarity (20 points)
  if (areDPRsSimilar(currentDevice.dpr, feedbackDevice.dpr)) {
    score += 20;
  } else {
    const dprDiff = Math.abs(currentDevice.dpr - feedbackDevice.dpr);
    const dprSimilarity = Math.max(0, 1 - (dprDiff / DPR_TOLERANCE));
    score += dprSimilarity * 20;
  }

  return Math.round(score);
}

/**
 * Determine if a feedback should be shown on the current device
 * @param {Object} currentDevice - Current device info
 * @param {Object} feedbackDevice - Feedback device info
 * @param {number} threshold - Minimum similarity score (0-100, default 50)
 * @returns {boolean}
 */
export function shouldShowFeedback(currentDevice, feedbackDevice, threshold = 80) {
  // If no feedback device info, show it (backward compatibility)
  if (!feedbackDevice || !feedbackDevice.viewportWidth || !feedbackDevice.viewportHeight) {
    return true;
  }

  const similarity = calculateDeviceSimilarity(currentDevice, feedbackDevice);
  return similarity >= threshold;
}

/**
 * Get current device information
 * @returns {Object} - Current device info
 */
export function getCurrentDeviceInfo() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    dpr: window.devicePixelRatio || 1,
    category: categorizeDevice(window.innerWidth)
  };
}

/**
 * Extract device info from feedback context
 * @param {Object} feedback - Feedback object from API
 * @returns {Object|null} - Device info or null if not available
 */
export function extractFeedbackDeviceInfo(feedback) {
  const context = feedback?.context;

  if (!context) {
    return null;
  }

  // Try to get viewport info from context
  const viewport = context.viewport || context.browserInfo?.viewport;
  const dpr = context.viewport?.devicePixelRatio ||
              context.browserInfo?.pixelRatio ||
              context.devicePixelRatio ||
              1;

  if (!viewport || !viewport.width || !viewport.height) {
    return null;
  }

  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    screenWidth: context.browserInfo?.screenResolution?.width || viewport.width,
    screenHeight: context.browserInfo?.screenResolution?.height || viewport.height,
    dpr: dpr,
    category: categorizeDevice(viewport.width)
  };
}

/**
 * Group feedbacks by device category and count hidden ones
 * @param {Array} allFeedbacks - All feedbacks
 * @param {Array} visibleFeedbacks - Feedbacks that passed the filter
 * @returns {Object} - Stats about hidden feedbacks
 */
export function getHiddenFeedbackStats(allFeedbacks, visibleFeedbacks) {
  const visibleIds = new Set(visibleFeedbacks.map(f => f.feedbackId || f.id));
  const hiddenFeedbacks = allFeedbacks.filter(f => !visibleIds.has(f.feedbackId || f.id));

  const stats = {
    total: hiddenFeedbacks.length,
    byCategory: {
      mobile: 0,
      tablet: 0,
      desktop: 0,
      unknown: 0
    }
  };

  hiddenFeedbacks.forEach(feedback => {
    const deviceInfo = extractFeedbackDeviceInfo(feedback);
    if (deviceInfo) {
      stats.byCategory[deviceInfo.category] = (stats.byCategory[deviceInfo.category] || 0) + 1;
    } else {
      stats.byCategory.unknown++;
    }
  });

  return stats;
}

/**
 * Format hidden feedback message
 * @param {Object} stats - Hidden feedback stats
 * @returns {string} - Formatted message
 */
export function formatHiddenFeedbackMessage(stats) {
  if (stats.total === 0) {
    return '';
  }

  const parts = [];
  if (stats.byCategory.mobile > 0) {
    parts.push(`${stats.byCategory.mobile} from mobile`);
  }
  if (stats.byCategory.tablet > 0) {
    parts.push(`${stats.byCategory.tablet} from tablet`);
  }
  if (stats.byCategory.desktop > 0) {
    parts.push(`${stats.byCategory.desktop} from desktop`);
  }
  if (stats.byCategory.unknown > 0) {
    parts.push(`${stats.byCategory.unknown} unknown`);
  }

  const deviceBreakdown = parts.length > 0 ? ` (${parts.join(', ')})` : '';

  return `${stats.total} comment${stats.total === 1 ? '' : 's'} not shown made on other screen sizes${deviceBreakdown}`;
}

export default {
  calculateDeviceSimilarity,
  shouldShowFeedback,
  getCurrentDeviceInfo,
  extractFeedbackDeviceInfo,
  getHiddenFeedbackStats,
  formatHiddenFeedbackMessage,
  DEVICE_CATEGORIES,
  VIEWPORT_TOLERANCE,
  DPR_TOLERANCE
};
