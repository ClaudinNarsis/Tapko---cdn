/**
 * SyncStatusIndicator - Visual feedback for queue sync status
 * Shows compact banner with real-time progress updates
 */
class SyncStatusIndicator {
  constructor(queueManager) {
    this.queueManager = queueManager;
    this.element = null;
    this.currentState = 'idle'; // idle, syncing, failed, warning, completed
    this.stats = { current: 0, total: 0, failed: 0 };
    this.autoHideTimer = null;

    this.init();
    this.setupEventListeners();
  }

  /**
   * Initialize the component
   */
  init() {
    // Create container element
    this.element = document.createElement('div');
    this.element.className = 'tapko-sync-indicator';
    this.element.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999998;
      display: none;
      max-width: 350px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Append to body
    document.body.appendChild(this.element);

    // Add styles
    this.injectStyles();
  }

  /**
   * Setup event listeners for queue events
   */
  setupEventListeners() {
    // Queue started
    this.queueManager.on('queue:started', ({ count }) => {
      this.stats.total = count;
      this.stats.current = 0;
      this.showSyncing();
    });

    // Queue progress
    this.queueManager.on('queue:progress', ({ current, total }) => {
      this.stats.current = current;
      this.stats.total = total;
      this.updateProgress();
    });

    // Item processing
    this.queueManager.on('queue:item-processing', ({ id }) => {
      this.updateSyncingMessage();
    });

    // Step completed
    this.queueManager.on('queue:step-completed', ({ id, step }) => {
      this.updateSyncingMessage(step);
    });

    // Item completed
    this.queueManager.on('queue:item-completed', ({ id }) => {
      this.stats.current++;
      this.updateProgress();
    });

    // All completed
    this.queueManager.on('queue:all-completed', () => {
      this.showCompleted();
    });

    // Queue empty
    this.queueManager.on('queue:empty', () => {
      this.hide();
    });

    // Item failed
    this.queueManager.on('queue:item-failed', ({ id, error }) => {
      this.stats.failed++;
      this.showFailed();
    });

    // Queue resumed
    this.queueManager.on('queue:resumed', ({ count }) => {
      this.showResumed(count);
    });

    // Queue added
    this.queueManager.on('queue:added', async () => {
      const stats = await this.queueManager.getQueueStats();
      if (stats.pending > 0 && !this.queueManager.isProcessingQueue()) {
        // Show queued indicator briefly
        this.showQueued(stats.pending);
      }
    });
  }

  /**
   * Show syncing state
   */
  showSyncing() {
    this.currentState = 'syncing';
    this.render();
    this.show();
  }

  /**
   * Show completed state
   */
  showCompleted() {
    this.currentState = 'completed';
    this.render();
    this.show();

    // Auto-hide after 5 seconds
    this.autoHideTimer = setTimeout(() => {
      this.hide();
    }, 5000);
  }

  /**
   * Show failed state
   */
  async showFailed() {
    this.currentState = 'failed';
    const stats = await this.queueManager.getQueueStats();
    this.stats.failed = stats.failed;
    this.render();
    this.show();
  }

  /**
   * Show resumed state
   */
  showResumed(count) {
    this.currentState = 'resumed';
    this.stats.total = count;
    this.render();
    this.show();

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.hide();
    }, 3000);
  }

  /**
   * Show queued state
   */
  showQueued(count) {
    this.currentState = 'queued';
    this.stats.total = count;
    this.render();
    this.show();

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.hide();
    }, 3000);
  }

  /**
   * Show warning state (before tab close)
   */
  showWarning(remaining) {
    this.currentState = 'warning';
    this.stats.remaining = remaining;
    this.render();
    this.show();
  }

  /**
   * Update progress
   */
  updateProgress() {
    if (this.currentState === 'syncing') {
      this.render();
    }
  }

  /**
   * Update syncing message with current step
   */
  updateSyncingMessage(step = null) {
    if (this.currentState === 'syncing') {
      const messageEl = this.element.querySelector('.sync-message');
      if (messageEl && step) {
        const stepText = {
          screenshot: 'Uploading screenshot...',
          logs: 'Uploading logs...',
          feedback: 'Submitting feedback...'
        }[step] || 'Syncing...';

        const stepSpan = messageEl.querySelector('.sync-step');
        if (stepSpan) {
          stepSpan.textContent = stepText;
        }
      }
    }
  }

  /**
   * Show the indicator
   */
  show() {
    this.element.style.display = 'block';
    // Trigger animation
    setTimeout(() => {
      this.element.classList.add('visible');
    }, 10);
  }

  /**
   * Hide the indicator
   */
  hide() {
    this.element.classList.remove('visible');
    setTimeout(() => {
      this.element.style.display = 'none';
      this.currentState = 'idle';
    }, 300);

    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  /**
   * Render the indicator content
   */
  render() {
    let content = '';

    switch (this.currentState) {
      case 'syncing':
        content = `
          <div class="sync-indicator-content syncing">
            <div class="sync-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            </div>
            <div class="sync-content">
              <div class="sync-message">
                Syncing feedback (${this.stats.current}/${this.stats.total})
                <span class="sync-step"></span>
              </div>
              <div class="sync-progress-bar">
                <div class="sync-progress-fill" style="width: ${(this.stats.current / this.stats.total) * 100}%"></div>
              </div>
            </div>
          </div>
        `;
        break;

      case 'completed':
        content = `
          <div class="sync-indicator-content completed">
            <div class="sync-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div class="sync-content">
              <div class="sync-message">All feedback synced successfully!</div>
            </div>
            <button class="sync-close" onclick="this.closest('.tapko-sync-indicator').style.display='none'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        `;
        break;

      case 'failed':
        content = `
          <div class="sync-indicator-content failed">
            <div class="sync-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="sync-content">
              <div class="sync-message">${this.stats.failed} feedback item${this.stats.failed > 1 ? 's' : ''} failed to sync</div>
              <div class="sync-actions">
                <button class="sync-retry-btn" onclick="window.Tapko.queueManager.retryFailed()">Retry Now</button>
                <button class="sync-details-btn" onclick="window.Tapko.showQueueViewer()">View Details</button>
              </div>
            </div>
            <button class="sync-close" onclick="this.closest('.tapko-sync-indicator').style.display='none'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        `;
        break;

      case 'warning':
        content = `
          <div class="sync-indicator-content warning">
            <div class="sync-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="sync-content">
              <div class="sync-message">Sync in progress (${this.stats.remaining} item${this.stats.remaining > 1 ? 's' : ''} remaining)</div>
              <div class="sync-submessage">Please keep this tab open</div>
            </div>
          </div>
        `;
        break;

      case 'resumed':
        content = `
          <div class="sync-indicator-content resumed">
            <div class="sync-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="sync-content">
              <div class="sync-message">Resuming sync (${this.stats.total} item${this.stats.total > 1 ? 's' : ''})</div>
            </div>
          </div>
        `;
        break;

      case 'queued':
        content = `
          <div class="sync-indicator-content queued">
            <div class="sync-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="sync-content">
              <div class="sync-message">${this.stats.total} feedback item${this.stats.total > 1 ? 's' : ''} queued</div>
            </div>
          </div>
        `;
        break;
    }

    this.element.innerHTML = content;
  }

  /**
   * Inject CSS styles
   */
  injectStyles() {
    const styleId = 'tapko-sync-indicator-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .tapko-sync-indicator {
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      .tapko-sync-indicator.visible {
        opacity: 1;
        transform: translateY(0);
      }

      .sync-indicator-content {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        border: 1px solid #e5e7eb;
        position: relative;
      }

      .sync-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        margin-top: 2px;
      }

      .sync-indicator-content.syncing .sync-icon svg {
        color: #3b82f6;
        animation: spin 1s linear infinite;
      }

      .sync-indicator-content.completed .sync-icon svg {
        color: #10b981;
      }

      .sync-indicator-content.failed .sync-icon svg {
        color: #ef4444;
      }

      .sync-indicator-content.warning .sync-icon svg {
        color: #f59e0b;
      }

      .sync-indicator-content.resumed .sync-icon svg,
      .sync-indicator-content.queued .sync-icon svg {
        color: #6366f1;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .sync-content {
        flex: 1;
        min-width: 0;
      }

      .sync-message {
        font-size: 14px;
        font-weight: 500;
        color: #1f2937;
        line-height: 1.4;
      }

      .sync-step {
        display: block;
        font-size: 12px;
        font-weight: 400;
        color: #6b7280;
        margin-top: 2px;
      }

      .sync-submessage {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
      }

      .sync-progress-bar {
        width: 100%;
        height: 4px;
        background: #e5e7eb;
        border-radius: 2px;
        margin-top: 8px;
        overflow: hidden;
      }

      .sync-progress-fill {
        height: 100%;
        background: #3b82f6;
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .sync-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }

      .sync-retry-btn,
      .sync-details-btn {
        font-size: 12px;
        font-weight: 500;
        padding: 6px 12px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .sync-retry-btn {
        background: #3b82f6;
        color: white;
      }

      .sync-retry-btn:hover {
        background: #2563eb;
      }

      .sync-details-btn {
        background: #f3f4f6;
        color: #374151;
      }

      .sync-details-btn:hover {
        background: #e5e7eb;
      }

      .sync-close {
        position: absolute;
        top: 10px;
        right: 10px;
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: #9ca3af;
        transition: color 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .sync-close:hover {
        color: #6b7280;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

export default SyncStatusIndicator;
