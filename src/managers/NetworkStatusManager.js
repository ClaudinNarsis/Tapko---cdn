/**
 * NetworkStatusManager - Manages network status and queue coordination
 * Handles online/offline transitions and automatic queue resumption
 */
class NetworkStatusManager {
  constructor(queueManager, syncIndicator) {
    this.queueManager = queueManager;
    this.syncIndicator = syncIndicator;
    this.isOnline = navigator.onLine;
    this.onlineBound = null;
    this.offlineBound = null;

    this.setupListeners();
  }

  /**
   * Setup network event listeners
   */
  setupListeners() {
    // Online event
    this.onlineBound = () => this.handleOnline();
    window.addEventListener('online', this.onlineBound);

    // Offline event
    this.offlineBound = () => this.handleOffline();
    window.addEventListener('offline', this.offlineBound);

    console.log('[NetworkStatus] Network status manager initialized, online:', this.isOnline);
  }

  /**
   * Handle online event
   */
  async handleOnline() {
    console.log('[NetworkStatus] Network connection restored');
    this.isOnline = true;

    // Show notification
    this.showNotification('Connection restored, syncing feedback...', 'info');

    // Check if there are pending items
    const hasPending = await this.queueManager.hasPendingItems();

    if (hasPending) {
      console.log('[NetworkStatus] Resuming queue processing after reconnection...');

      // Small delay to ensure connection is stable
      setTimeout(() => {
        this.queueManager.processQueue();
      }, 1000);
    }
  }

  /**
   * Handle offline event
   */
  handleOffline() {
    console.log('[NetworkStatus] Network connection lost');
    this.isOnline = false;

    // Show notification
    this.showNotification('Offline - feedback will sync when online', 'warning');

    // Queue will naturally pause on next API call
    // No need to explicitly pause processing
  }

  /**
   * Check current connection status
   */
  checkConnection() {
    return this.isOnline;
  }

  /**
   * Show notification to user
   */
  showNotification(message, type = 'info') {
    console.log(`[NetworkStatus] ${type.toUpperCase()}: ${message}`);

    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `tapko-network-toast ${type}`;
    toast.textContent = message;

    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      padding: 12px 20px;
      background: ${type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      z-index: 999997;
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: none;
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);

    // Remove after 4 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';

      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }

  /**
   * Destroy the manager
   */
  destroy() {
    if (this.onlineBound) {
      window.removeEventListener('online', this.onlineBound);
    }

    if (this.offlineBound) {
      window.removeEventListener('offline', this.offlineBound);
    }

    console.log('[NetworkStatus] Network status manager destroyed');
  }
}

export default NetworkStatusManager;
