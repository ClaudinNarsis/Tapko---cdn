/**
 * QueueViewerModal - Advanced queue management UI
 * Shows detailed status and manual controls for queue items
 */
class QueueViewerModal {
  constructor(queueManager) {
    this.queueManager = queueManager;
    this.element = null;
    this.isOpen = false;
    this.refreshInterval = null;

    this.init();
  }

  /**
   * Initialize the component
   */
  init() {
    // Create modal element
    this.element = document.createElement('div');
    this.element.className = 'tapko-queue-viewer-modal';
    this.element.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Append to body
    document.body.appendChild(this.element);

    // Add styles
    this.injectStyles();

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Refresh on queue events
    const refreshEvents = [
      'queue:added',
      'queue:item-completed',
      'queue:item-failed',
      'queue:item-retry',
      'queue:removed',
      'queue:cleared'
    ];

    refreshEvents.forEach(event => {
      this.queueManager.on(event, () => {
        if (this.isOpen) {
          this.refresh();
        }
      });
    });
  }

  /**
   * Open the modal
   */
  async open() {
    this.isOpen = true;
    await this.render();
    this.element.style.display = 'flex';

    // Trigger animation
    setTimeout(() => {
      this.element.classList.add('visible');
    }, 10);

    // Auto-refresh every 2 seconds
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, 2000);
  }

  /**
   * Close the modal
   */
  close() {
    this.isOpen = false;
    this.element.classList.remove('visible');

    setTimeout(() => {
      this.element.style.display = 'none';
    }, 300);

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Refresh the modal content
   */
  async refresh() {
    if (!this.isOpen) return;
    await this.render();
  }

  /**
   * Render the modal content
   */
  async render() {
    // Get all items
    const allItems = await this.queueManager.getAll();
    const stats = await this.queueManager.getQueueStats();

    // Sort: processing > pending > failed > completed
    const sortOrder = { processing: 0, pending: 1, failed: 2, completed: 3 };
    allItems.sort((a, b) => {
      const orderDiff = sortOrder[a.status] - sortOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return b.createdAt - a.createdAt; // Newest first within same status
    });

    const totalItems = allItems.length;

    this.element.innerHTML = `
      <div class="queue-modal-backdrop" onclick="window.Tapko.closeQueueViewer()"></div>
      <div class="queue-modal-content">
        <div class="queue-modal-header">
          <div class="queue-modal-title">
            <h2>Feedback Queue</h2>
            <span class="queue-count">${totalItems} item${totalItems !== 1 ? 's' : ''}</span>
          </div>
          <button class="queue-modal-close" onclick="window.Tapko.closeQueueViewer()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="queue-stats">
          <div class="queue-stat">
            <div class="stat-value">${stats.pending}</div>
            <div class="stat-label">Pending</div>
          </div>
          <div class="queue-stat">
            <div class="stat-value">${stats.processing}</div>
            <div class="stat-label">Processing</div>
          </div>
          <div class="queue-stat">
            <div class="stat-value">${stats.failed}</div>
            <div class="stat-label">Failed</div>
          </div>
          <div class="queue-stat">
            <div class="stat-value">${stats.completed}</div>
            <div class="stat-label">Completed</div>
          </div>
        </div>

        <div class="queue-items-container">
          ${totalItems === 0 ? `
            <div class="queue-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <p>No feedback items in queue</p>
            </div>
          ` : allItems.map(item => this.renderQueueItem(item)).join('')}
        </div>

        <div class="queue-modal-footer">
          <button class="queue-action-btn secondary" onclick="window.Tapko.queueManager.clearCompleted()">
            Clear Completed
          </button>
          ${stats.failed > 0 ? `
            <button class="queue-action-btn primary" onclick="window.Tapko.queueManager.retryFailed()">
              Retry All Failed
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Render a single queue item
   */
  renderQueueItem(item) {
    const statusIcons = {
      pending: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>`,
      processing: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>`,
      completed: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>`,
      failed: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>`
    };

    const statusLabels = {
      pending: 'Pending',
      processing: 'Syncing...',
      completed: 'Completed',
      failed: 'Failed'
    };

    const timeAgo = this.getTimeAgo(item.createdAt);
    const title = item.feedbackData.title || 'Untitled feedback';
    const truncatedTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;

    // Get current step if processing
    let stepText = '';
    if (item.status === 'processing') {
      if (item.uploadProgress.screenshot.status === 'completed' &&
          item.uploadProgress.logs.status === 'completed') {
        stepText = '<div class="item-step">Submitting feedback...</div>';
      } else if (item.uploadProgress.screenshot.status === 'completed') {
        stepText = '<div class="item-step">Uploading logs...</div>';
      } else {
        stepText = '<div class="item-step">Uploading screenshot...</div>';
      }
    }

    return `
      <div class="queue-item ${item.status}">
        <div class="item-status-icon ${item.status}">
          ${statusIcons[item.status]}
        </div>
        <div class="item-content">
          <div class="item-title">${this.escapeHtml(truncatedTitle)}</div>
          <div class="item-meta">
            <span class="item-status-label">${statusLabels[item.status]}</span>
            <span class="item-time">${timeAgo}</span>
            ${item.attempts > 0 ? `<span class="item-attempts">${item.attempts} attempt${item.attempts > 1 ? 's' : ''}</span>` : ''}
          </div>
          ${stepText}
          ${item.error ? `<div class="item-error">${this.escapeHtml(item.error)}</div>` : ''}
        </div>
        <div class="item-actions">
          ${item.status === 'failed' ? `
            <button class="item-action-btn retry" onclick="window.Tapko.retryQueueItem('${item.id}')" title="Retry">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            </button>
          ` : ''}
          ${item.status !== 'processing' ? `
            <button class="item-action-btn remove" onclick="window.Tapko.removeQueueItem('${item.id}')" title="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Get time ago string
   */
  getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Inject CSS styles
   */
  injectStyles() {
    const styleId = 'tapko-queue-viewer-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .tapko-queue-viewer-modal {
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .tapko-queue-viewer-modal.visible {
        opacity: 1;
      }

      .queue-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      }

      .queue-modal-content {
        position: relative;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
      }

      .queue-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #e5e7eb;
      }

      .queue-modal-title {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .queue-modal-title h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #111827;
      }

      .queue-count {
        font-size: 12px;
        font-weight: 500;
        padding: 4px 8px;
        background: #f3f4f6;
        color: #6b7280;
        border-radius: 12px;
      }

      .queue-modal-close {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: #9ca3af;
        transition: color 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
      }

      .queue-modal-close:hover {
        color: #6b7280;
        background: #f3f4f6;
      }

      .queue-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        padding: 20px 24px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
      }

      .queue-stat {
        text-align: center;
      }

      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #111827;
        line-height: 1;
      }

      .stat-label {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
      }

      .queue-items-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px 24px;
        min-height: 200px;
      }

      .queue-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        color: #9ca3af;
        text-align: center;
      }

      .queue-empty svg {
        margin-bottom: 16px;
      }

      .queue-empty p {
        margin: 0;
        font-size: 14px;
      }

      .queue-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        margin-bottom: 8px;
        transition: all 0.2s ease;
      }

      .queue-item:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }

      .item-status-icon {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        margin-top: 2px;
      }

      .item-status-icon.pending svg { color: #6b7280; }
      .item-status-icon.processing svg { color: #3b82f6; animation: spin 1s linear infinite; }
      .item-status-icon.completed svg { color: #10b981; }
      .item-status-icon.failed svg { color: #ef4444; }

      .item-content {
        flex: 1;
        min-width: 0;
      }

      .item-title {
        font-size: 14px;
        font-weight: 500;
        color: #111827;
        margin-bottom: 6px;
        word-break: break-word;
      }

      .item-meta {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 12px;
        color: #6b7280;
      }

      .item-status-label {
        font-weight: 500;
      }

      .item-status-label,
      .item-time,
      .item-attempts {
        display: inline-block;
      }

      .item-attempts {
        padding: 2px 6px;
        background: #fef3c7;
        color: #92400e;
        border-radius: 4px;
        font-size: 11px;
      }

      .item-step {
        font-size: 12px;
        color: #3b82f6;
        margin-top: 6px;
        font-weight: 500;
      }

      .item-error {
        font-size: 12px;
        color: #ef4444;
        margin-top: 6px;
        padding: 8px;
        background: #fef2f2;
        border-radius: 4px;
      }

      .item-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }

      .item-action-btn {
        background: none;
        border: none;
        padding: 6px;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .item-action-btn.retry {
        color: #3b82f6;
      }

      .item-action-btn.retry:hover {
        background: #eff6ff;
      }

      .item-action-btn.remove {
        color: #ef4444;
      }

      .item-action-btn.remove:hover {
        background: #fef2f2;
      }

      .queue-modal-footer {
        display: flex;
        gap: 12px;
        padding: 16px 24px;
        border-top: 1px solid #e5e7eb;
        justify-content: flex-end;
      }

      .queue-action-btn {
        font-size: 14px;
        font-weight: 500;
        padding: 10px 16px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .queue-action-btn.primary {
        background: #3b82f6;
        color: white;
      }

      .queue-action-btn.primary:hover {
        background: #2563eb;
      }

      .queue-action-btn.secondary {
        background: #f3f4f6;
        color: #374151;
      }

      .queue-action-btn.secondary:hover {
        background: #e5e7eb;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

export default QueueViewerModal;
