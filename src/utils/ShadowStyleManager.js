/**
 * Shadow Style Manager
 * Manages styles within shadow DOM for complete CSS isolation
 */

export class ShadowStyleManager {
  constructor(shadowRoot) {
    this.shadowRoot = shadowRoot;
    this.injectedStyles = new Map();
  }

  /**
   * Inject styles into shadow DOM
   * @param {string} id - Unique identifier for the style element
   * @param {string} cssText - CSS content to inject
   */
  injectStyles(id, cssText) {
    if (this.injectedStyles.has(id)) {
      console.warn(`[Tapko] Styles with id "${id}" already injected`);
      return;
    }

    const style = document.createElement('style');
    style.id = id;
    style.textContent = cssText;

    this.shadowRoot.appendChild(style);
    this.injectedStyles.set(id, style);

    console.log(`[Tapko] Injected styles: ${id}`);
  }

  /**
   * Remove styles from shadow DOM
   * @param {string} id - Identifier of the style element to remove
   */
  removeStyles(id) {
    const style = this.injectedStyles.get(id);
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
      this.injectedStyles.delete(id);
      console.log(`[Tapko] Removed styles: ${id}`);
    }
  }

  /**
   * Update existing styles
   * @param {string} id - Identifier of the style element to update
   * @param {string} cssText - New CSS content
   */
  updateStyles(id, cssText) {
    this.removeStyles(id);
    this.injectStyles(id, cssText);
  }

  /**
   * Check if styles are injected
   * @param {string} id - Identifier to check
   * @returns {boolean}
   */
  hasStyles(id) {
    return this.injectedStyles.has(id);
  }

  /**
   * Clear all injected styles
   */
  clearAll() {
    this.injectedStyles.forEach((style, id) => {
      this.removeStyles(id);
    });
  }
}
