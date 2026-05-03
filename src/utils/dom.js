/**
 * DOM Utilities
 * Helper functions for DOM manipulation
 */

import { CONFIG } from '../config.js';

/**
 * Find the best anchor container for positioning
 */
export function getAnchorContainer(target) {
  let el = target;

  // Walk up the tree until we find a non-inline element
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    if (style.display !== 'inline') break;
    el = el.parentElement;
  }

  // Fallback to body if nothing suitable
  if (!el || el === document.body || el === document.documentElement) {
    el = document.body;
  }

  // Ensure element has positioning context
  const cs = window.getComputedStyle(el);
  if (!['relative', 'absolute', 'fixed', 'sticky'].includes(cs.position)) {
    el.classList.add(`${CONFIG.CLASS_PREFIX}anchored-container`);
  }

  return el;
}

/**
 * Calculate optimal position for comment card
 */
export function calculateCardPosition(targetRect, anchorRect, cardWidth, cardHeight) {
  const offsetLeft = targetRect.left - anchorRect.left;
  const offsetTop = targetRect.top - anchorRect.top;

  let left = offsetLeft + 10;
  let top = offsetTop + targetRect.height + 8;

  const anchorWidth = anchorRect.width || window.innerWidth;
  const anchorHeight = anchorRect.height || window.innerHeight;

  // Adjust horizontal position if card overflows
  if (left + cardWidth > anchorWidth) {
    left = anchorWidth - cardWidth - 8;
  }
  if (left < 0) left = 0;

  // Adjust vertical position if card overflows
  if (top + cardHeight > anchorHeight) {
    top = offsetTop - cardHeight - 8;
  }
  if (top < 0) top = 0;

  return { left, top };
}

/**
 * Create element with class name
 */
export function createElement(tag, className = '', attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;

  Object.entries(attributes).forEach(([key, value]) => {
    if (key.startsWith('data-')) {
      element.setAttribute(key, value);
    } else if (key === 'innerHTML' || key === 'textContent') {
      element[key] = value;
    } else {
      element[key] = value;
    }
  });

  return element;
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHTML(html) {
  const tempDiv = document.createElement('div');
  tempDiv.textContent = html;
  return tempDiv.innerHTML;
}

/**
 * Safely remove element from DOM
 */
export function removeElement(element, animate = true) {
  if (!element || !element.parentNode) return;

  if (animate) {
    element.classList.remove(`${CONFIG.CLASS_PREFIX}visible`);
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, CONFIG.UI.animationDuration);
  } else {
    element.parentNode.removeChild(element);
  }
}

/**
 * Check if element is in viewport
 */
export function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Dispatch custom event
 * Events are dispatched on both window (for analytics/public API) and shadow root (if available)
 */
export function dispatchCustomEvent(eventName, detail = {}) {
  const event = new CustomEvent(eventName, {
    detail,
    bubbles: true,
    cancelable: true,
    composed: true  // Allow event to cross shadow boundary
  });

  // Dispatch on window only — shadow root dispatch with bubbles+composed would
  // propagate the event back to window a second time, causing double-fires.
  window.dispatchEvent(event);

  return event;
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Get element's absolute position
 */
export function getAbsolutePosition(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.pageYOffset,
    left: rect.left + window.pageXOffset,
    width: rect.width,
    height: rect.height
  };
}

/**
 * Get element hierarchy path (from root to target)
 */
export function getElementHierarchy(element) {
  const hierarchy = [];
  let current = element;

  while (current && current !== document.documentElement) {
    const selector = getElementSelector(current);
    hierarchy.unshift({
      tagName: current.tagName.toLowerCase(),
      id: current.id || null,
      className: current.className || null,
      selector: selector,
      attributes: getRelevantAttributes(current)
    });
    current = current.parentElement;
  }

  return hierarchy;
}

/**
 * Get a unique selector for an element
 */
function getElementSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).join('.');
    if (classes) {
      return `${element.tagName.toLowerCase()}.${classes}`;
    }
  }

  // Get nth-child position
  let nth = 0;
  let sibling = element;
  while (sibling) {
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      nth++;
    }
    sibling = sibling.previousElementSibling;
  }

  return `${element.tagName.toLowerCase()}:nth-of-type(${nth})`;
}

/**
 * Get relevant attributes from an element
 */
function getRelevantAttributes(element) {
  const attrs = {};
  const relevantAttrs = ['data-testid', 'data-id', 'aria-label', 'role', 'name', 'type', 'href', 'src'];

  relevantAttrs.forEach(attr => {
    if (element.hasAttribute(attr)) {
      attrs[attr] = element.getAttribute(attr);
    }
  });

  return attrs;
}

/**
 * Get feedback position information
 */
export function getFeedbackPosition(element) {
  const rect = element.getBoundingClientRect();
  const hierarchy = getElementHierarchy(element);

  return {
    hierarchy: hierarchy,
    selector: getElementSelector(element),
    boundingBox: {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y
    },
    scroll: {
      x: window.pageXOffset || document.documentElement.scrollLeft,
      y: window.pageYOffset || document.documentElement.scrollTop
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

/**
 * Get browser and device information
 */
export function getBrowserInfo() {
  const userAgent = navigator.userAgent;

  // Detect browser
  let browserName = 'Unknown';
  let browserVersion = 'Unknown';

  if (userAgent.indexOf('Firefox') > -1) {
    browserName = 'Firefox';
    browserVersion = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
  } else if (userAgent.indexOf('Chrome') > -1 && userAgent.indexOf('Edg') === -1) {
    browserName = 'Chrome';
    browserVersion = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
  } else if (userAgent.indexOf('Safari') > -1 && userAgent.indexOf('Chrome') === -1) {
    browserName = 'Safari';
    browserVersion = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
  } else if (userAgent.indexOf('Edg') > -1) {
    browserName = 'Edge';
    browserVersion = userAgent.match(/Edg\/(\d+\.\d+)/)?.[1] || 'Unknown';
  }

  // Detect OS
  let os = 'Unknown';
  if (userAgent.indexOf('Win') > -1) os = 'Windows';
  else if (userAgent.indexOf('Mac') > -1) os = 'macOS';
  else if (userAgent.indexOf('Linux') > -1) os = 'Linux';
  else if (userAgent.indexOf('Android') > -1) os = 'Android';
  else if (userAgent.indexOf('iOS') > -1 || userAgent.indexOf('iPhone') > -1 || userAgent.indexOf('iPad') > -1) os = 'iOS';

  // Detect device type
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);

  let deviceType = 'Desktop';
  if (isTablet) deviceType = 'Tablet';
  else if (isMobile) deviceType = 'Mobile';

  return {
    browser: browserName,
    browserVersion: browserVersion,
    os: os,
    deviceType: deviceType,
    userAgent: userAgent,
    language: navigator.language || navigator.userLanguage,
    platform: navigator.platform,
    screenResolution: {
      width: window.screen.width,
      height: window.screen.height
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    pixelRatio: window.devicePixelRatio || 1,
    cookieEnabled: navigator.cookieEnabled,
    onlineStatus: navigator.onLine
  };
}

/**
 * Get current breakpoint based on viewport width
 */
export function getCurrentBreakpoint() {
  const width = window.innerWidth;

  if (width < 640) return { name: 'xs', width: width, min: 0, max: 639 };
  if (width < 768) return { name: 'sm', width: width, min: 640, max: 767 };
  if (width < 1024) return { name: 'md', width: width, min: 768, max: 1023 };
  if (width < 1280) return { name: 'lg', width: width, min: 1024, max: 1279 };
  if (width < 1536) return { name: 'xl', width: width, min: 1280, max: 1535 };

  return { name: '2xl', width: width, min: 1536, max: Infinity };
}

/**
 * Get URL parameter value by name
 */
export function getUrlParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}
