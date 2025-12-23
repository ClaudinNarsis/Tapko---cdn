/**
 * SyncLifecycleManager - Manages page lifecycle and sync coordination
 * Handles beforeunload warnings, visibility changes, and tab coordination
 */
class SyncLifecycleManager {
  constructor(queueManager, syncIndicator) {
    this.queueManager = queueManager;
    this.syncIndicator = syncIndicator;
    this.beforeUnloadBound = null;
    this.visibilityChangeBound = null;

    this.setupListeners();
  }

  /**
   * Setup lifecycle listeners
   */
  setupListeners() {
    // Page Visibility API - pause/resume processing when tab hidden/visible
    this.visibilityChangeBound = () => this.handleVisibilityChange();
    document.addEventListener('visibilitychange', this.visibilityChangeBound);

    // Beforeunload warning - prevent closing with pending items
    this.beforeUnloadBound = (e) => this.handleBeforeUnload(e);
    window.addEventListener('beforeunload', this.beforeUnloadBound);

    // Unload - final attempt to send analytics
    window.addEventListener('unload', () => this.handleUnload());

    console.log('[SyncLifecycle] Lifecycle manager initialized');
  }

  /**
   * Handle visibility change (tab hidden/visible)
   */
  handleVisibilityChange() {
    if (document.hidden) {
      console.log('[SyncLifecycle] Page hidden');
      this.handlePageHidden();
    } else {
      console.log('[SyncLifecycle] Page visible');
      this.handlePageVisible();
    }
  }

  /**
   * Handle page becoming hidden
   */
  handlePageHidden() {
    // Could pause queue processing to save battery/bandwidth
    // For now, we continue processing in background
    console.log('[SyncLifecycle] Continuing sync in background...');
  }

  /**
   * Handle page becoming visible
   */
  async handlePageVisible() {
    // Resume queue processing if there are pending items
    const hasPending = await this.queueManager.hasPendingItems();

    if (hasPending && !this.queueManager.isProcessingQueue()) {
      console.log('[SyncLifecycle] Resuming queue processing...');
      setTimeout(() => {
        this.queueManager.processQueue();
      }, 500);
    }
  }

  /**
   * Handle beforeunload - warn if pending items
   */
  async handleBeforeUnload(e) {
    // Check if there are pending or processing items
    const stats = await this.queueManager.getQueueStats();
    const hasActiveItems = stats.pending > 0 || stats.processing > 0;

    if (hasActiveItems) {
      const totalActive = stats.pending + stats.processing;

      // Show warning in sync indicator
      if (this.syncIndicator) {
        this.syncIndicator.showWarning(totalActive);
      }

      // Modern browsers will show their own message
      // Custom message is ignored in most browsers, but we set it anyway
      const message = `Feedback is still syncing (${totalActive} item${totalActive > 1 ? 's' : ''}). Your feedback may be lost if you leave now.`;

      e.preventDefault();
      e.returnValue = message;
      return message;
    }
  }

  /**
   * Handle unload - final analytics
   */
  handleUnload() {
    // Use sendBeacon for final analytics ping (non-blocking)
    if (navigator.sendBeacon) {
      this.queueManager.getQueueStats().then(stats => {
        const data = JSON.stringify({
          event: 'queue-state-on-unload',
          stats,
          timestamp: Date.now()
        });

        // Note: This requires a backend endpoint to receive the beacon
        // Uncomment if you have an analytics endpoint
        // navigator.sendBeacon('/api/analytics/queue-state', data);

        console.log('[SyncLifecycle] Queue state on unload:', stats);
      }).catch(err => {
        console.error('[SyncLifecycle] Error getting queue stats on unload:', err);
      });
    }
  }

  /**
   * Check if safe to close (no pending items)
   */
  async isSafeToClose() {
    const stats = await this.queueManager.getQueueStats();
    return stats.pending === 0 && stats.processing === 0;
  }

  /**
   * Wait for queue to complete (with timeout)
   */
  async waitForQueueCompletion(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = 500;

      const check = async () => {
        const stats = await this.queueManager.getQueueStats();
        const hasActiveItems = stats.pending > 0 || stats.processing > 0;

        if (!hasActiveItems) {
          console.log('[SyncLifecycle] Queue completed');
          resolve(true);
          return;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed >= timeoutMs) {
          console.warn('[SyncLifecycle] Queue completion timeout');
          resolve(false);
          return;
        }

        setTimeout(check, checkInterval);
      };

      check();
    });
  }

  /**
   * Destroy the manager
   */
  destroy() {
    if (this.visibilityChangeBound) {
      document.removeEventListener('visibilitychange', this.visibilityChangeBound);
    }

    if (this.beforeUnloadBound) {
      window.removeEventListener('beforeunload', this.beforeUnloadBound);
    }

    console.log('[SyncLifecycle] Lifecycle manager destroyed');
  }
}

export default SyncLifecycleManager;
