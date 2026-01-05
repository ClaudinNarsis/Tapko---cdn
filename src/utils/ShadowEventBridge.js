/**
 * Shadow Event Bridge
 * Bridges events across shadow DOM boundary for analytics and public API
 */

export class ShadowEventBridge {
  constructor(shadowRoot, publicEventsTarget = window) {
    this.shadowRoot = shadowRoot;
    this.publicTarget = publicEventsTarget;
  }

  /**
   * Dispatch event in shadow DOM only (internal events)
   * @param {string} eventName - Name of the event
   * @param {Object} detail - Event detail data
   */
  dispatchInternal(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      cancelable: true
    });

    this.shadowRoot.dispatchEvent(event);
    return event;
  }

  /**
   * Dispatch event on window (for analytics, public API)
   * @param {string} eventName - Name of the event
   * @param {Object} detail - Event detail data
   */
  dispatchPublic(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      cancelable: true,
      composed: true  // Allows event to cross shadow boundary
    });

    this.publicTarget.dispatchEvent(event);
    return event;
  }

  /**
   * Dispatch event in both shadow DOM and on window
   * @param {string} eventName - Name of the event
   * @param {Object} detail - Event detail data
   */
  dispatchBoth(eventName, detail = {}) {
    this.dispatchInternal(eventName, detail);
    this.dispatchPublic(eventName, detail);
  }
}
