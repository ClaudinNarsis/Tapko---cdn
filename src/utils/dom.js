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
 */
export function dispatchCustomEvent(eventName, detail = {}) {
  const event = new CustomEvent(eventName, {
    detail,
    bubbles: true,
    cancelable: true
  });

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
