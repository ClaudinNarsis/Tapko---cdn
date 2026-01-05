/**
 * Screenshot Permission Overlay
 * Shows user-friendly message while browser prompts for screen capture permission
 */

export class ScreenshotPermissionOverlay {
  constructor(parentRoot) {
    this.parentRoot = parentRoot;
    this.overlay = null;
  }

  show() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'screenshot-permission-overlay';
    this.overlay.innerHTML = `
      <div class="screenshot-permission-content">
        <div class="screenshot-permission-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </div>
        <h3 class="screenshot-permission-title">Screenshot Permission Needed</h3>
        <p class="screenshot-permission-description">
          We need to capture a screenshot of your current view to include with your feedback.
          This helps us understand and fix the issue you're reporting.
        </p>
        <p class="screenshot-permission-instruction">
          Please click <strong>"Allow"</strong> in the browser prompt to continue.
        </p>
        <div class="screenshot-permission-loader">
          <div class="spinner"></div>
          <span>Waiting for permission...</span>
        </div>
      </div>
    `;

    this.parentRoot.appendChild(this.overlay);
  }

  hide() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  destroy() {
    this.hide();
  }
}
