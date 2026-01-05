/**
 * Gradient Sanitizer
 * Detects and sanitizes problematic CSS gradients before screenshot capture
 *
 * Fixes html2canvas errors:
 * - TypeError: Failed to execute 'addColorStop' on 'CanvasGradient': The provided double value is non-finite
 * - Issues with modern CSS gradient syntaxes (oklch, color(), lab(), lch(), color-mix())
 */

export class GradientSanitizer {
  constructor() {
    // Pattern to detect modern/problematic CSS functions
    this.problematicGradientPattern = /oklch|color\(|lab\(|lch\(|color-mix\(/i;
  }

  /**
   * Sanitize all gradient elements in the DOM
   * Returns a restore function to revert changes
   * @param {HTMLElement} rootElement - Root element to search for gradients
   * @returns {Function} Restore function to revert changes
   */
  sanitizeElement(rootElement) {
    const originalStyles = [];
    const elements = this.findGradientElements(rootElement);

    console.log(`[Tapko] Found ${elements.length} elements with gradients`);

    elements.forEach(el => {
      const computed = window.getComputedStyle(el);
      const bgImage = computed.backgroundImage;

      if (this.hasProblematicGradient(bgImage)) {
        // Store original style
        originalStyles.push({
          element: el,
          property: 'backgroundImage',
          original: el.style.backgroundImage
        });

        // Replace with safe fallback
        el.style.backgroundImage = this.getSafeFallback(computed.backgroundColor);
        console.log('[Tapko] Sanitized problematic gradient:', bgImage.substring(0, 50) + '...');
      }
    });

    // Return restore function
    return () => {
      originalStyles.forEach(({ element, property, original }) => {
        if (original) {
          element.style[property] = original;
        } else {
          element.style.removeProperty(property);
        }
      });
      console.log(`[Tapko] Restored ${originalStyles.length} gradient styles`);
    };
  }

  /**
   * Find all elements with gradients in their background
   * @param {HTMLElement} root - Root element to search
   * @returns {Array<HTMLElement>} Elements with gradients
   */
  findGradientElements(root) {
    const elements = root.querySelectorAll('*');
    return Array.from(elements).filter(el => {
      const bg = window.getComputedStyle(el).backgroundImage;
      return bg && bg.includes('gradient');
    });
  }

  /**
   * Check if a gradient uses problematic CSS functions
   * @param {string} bgImage - Background image CSS value
   * @returns {boolean} True if gradient is problematic
   */
  hasProblematicGradient(bgImage) {
    return this.problematicGradientPattern.test(bgImage);
  }

  /**
   * Get a safe fallback for a problematic gradient
   * @param {string} backgroundColor - Element's background color
   * @returns {string} Safe CSS value
   */
  getSafeFallback(backgroundColor) {
    // Use element's background color as fallback, or transparent
    if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
      // Keep the background color but remove the gradient
      return 'none';
    }
    return 'none';
  }
}
