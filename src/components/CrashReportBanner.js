/**
 * CrashReportBanner - Display crash reports and debug logs
 */

import debugLogger from '../utils/DebugLogger.js';

export default class CrashReportBanner {
  constructor(shadowRoot) {
    this.shadowRoot = shadowRoot;
    this.banner = null;
    this.modal = null;
  }

  /**
   * Show crash report banner
   */
  show(crashData) {
    if (this.banner) return;

    this.banner = document.createElement('div');
    this.banner.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff6b6b;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      cursor: pointer;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
    `;

    this.banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">
            ⚠️ Tapko Debug: Crash Detected
          </div>
          <div style="font-size: 12px; opacity: 0.9;">
            Previous session crashed during: ${crashData.operation.name}
            <br>Click to view details
          </div>
        </div>
        <div id="tapko-crash-close" style="cursor: pointer; font-size: 20px; opacity: 0.8; padding: 0 4px;">
          ×
        </div>
      </div>
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    this.shadowRoot.appendChild(style);

    this.shadowRoot.appendChild(this.banner);

    // Click to show modal
    this.banner.addEventListener('click', (e) => {
      if (e.target.id !== 'tapko-crash-close') {
        this.showModal(crashData);
      }
    });

    // Close button
    const closeBtn = this.banner.querySelector('#tapko-crash-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });
  }

  /**
   * Hide banner
   */
  hide() {
    if (this.banner) {
      this.banner.remove();
      this.banner = null;
    }
  }

  /**
   * Show detailed crash modal
   */
  showModal(crashData) {
    if (this.modal) return;

    const logs = crashData.logs || [];
    const lastLogs = logs.slice(-20);

    this.modal = document.createElement('div');
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      max-width: 800px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;

    modalContent.innerHTML = `
      <div style="padding: 20px 24px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
        <h2 style="margin: 0; font-size: 20px; color: #333;">Crash Report</h2>
        <button id="tapko-modal-close" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #666; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">×</button>
      </div>

      <div style="padding: 24px; overflow-y: auto; flex: 1;">
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
          <strong style="color: #856404;">Crashed Operation:</strong>
          <div style="margin-top: 4px; color: #856404;">${crashData.operation.name}</div>
          <div style="margin-top: 8px; font-size: 13px; color: #856404;">Started: ${new Date(crashData.operation.timestamp).toLocaleString()}</div>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; margin: 0 0 12px 0; color: #333;">System Information</h3>
          <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 13px; font-family: monospace;">
            ${this.formatSystemInfo(crashData.systemInfo)}
          </div>
        </div>

        ${crashData.operation.context ? `
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 16px; margin: 0 0 12px 0; color: #333;">Operation Context</h3>
            <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 13px; font-family: monospace; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">
${JSON.stringify(crashData.operation.context, null, 2)}
            </div>
          </div>
        ` : ''}

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; margin: 0 0 12px 0; color: #333;">Recent Logs (Last 20)</h3>
          <div style="background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; font-size: 12px; font-family: 'Courier New', monospace; max-height: 300px; overflow-y: auto;">
            ${this.formatLogs(lastLogs)}
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; margin: 0 0 12px 0; color: #333;">Analysis</h3>
          <div style="background: #e3f2fd; padding: 12px; border-radius: 4px; font-size: 13px; color: #0d47a1;">
            ${this.generateAnalysis(logs, crashData.operation)}
          </div>
        </div>
      </div>

      <div style="padding: 16px 24px; border-top: 1px solid #e0e0e0; display: flex; gap: 12px; justify-content: flex-end;">
        <button id="tapko-download-logs" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
          Download Full Logs
        </button>
        <button id="tapko-clear-data" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
          Clear Debug Data
        </button>
        <button id="tapko-close-modal" style="background: #757575; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
          Close
        </button>
      </div>
    `;

    this.modal.appendChild(modalContent);
    this.shadowRoot.appendChild(this.modal);

    // Event listeners
    const closeModalBtn = modalContent.querySelector('#tapko-modal-close');
    const closeBtn = modalContent.querySelector('#tapko-close-modal');
    const downloadBtn = modalContent.querySelector('#tapko-download-logs');
    const clearBtn = modalContent.querySelector('#tapko-clear-data');

    closeModalBtn.addEventListener('click', () => this.hideModal());
    closeBtn.addEventListener('click', () => this.hideModal());

    downloadBtn.addEventListener('click', () => {
      debugLogger.downloadLogs(`tapko-crash-${Date.now()}.json`);
    });

    clearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all debug data? This cannot be undone.')) {
        debugLogger.clearAll();
        this.hideModal();
        this.hide();
        alert('Debug data cleared. Reload the page to start fresh.');
      }
    });

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hideModal();
      }
    });
  }

  /**
   * Hide modal
   */
  hideModal() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  /**
   * Format system info
   */
  formatSystemInfo(info) {
    if (!info) return 'No system info available';

    let html = `
Browser: ${info.browser}<br>
OS: ${info.os}<br>
Viewport: ${info.viewport}<br>
Screen: ${info.screenResolution}<br>
DPR: ${info.devicePixelRatio}<br>
Color Depth: ${info.colorDepth}-bit<br>
CPU Cores: ${info.hardwareConcurrency}
    `;

    if (info.memory) {
      html += `<br><br><strong>Memory (Chrome only):</strong><br>
Heap Limit: ${info.memory.jsHeapSizeLimit}<br>
Heap Total: ${info.memory.totalJSHeapSize}<br>
Heap Used: ${info.memory.usedJSHeapSize} (${info.memory.usedPercent})`;
    }

    return html;
  }

  /**
   * Format logs
   */
  formatLogs(logs) {
    if (!logs || logs.length === 0) {
      return '<div style="color: #888;">No logs available</div>';
    }

    return logs.map(log => {
      const color = this.getLogColor(log.level);
      const time = new Date(log.timestamp).toLocaleTimeString();
      const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : '';
      return `<div style="color: ${color}; margin-bottom: 4px;">[${time}] [${log.level}] ${log.message}${dataStr}</div>`;
    }).join('');
  }

  /**
   * Get color for log level
   */
  getLogColor(level) {
    switch (level) {
      case 'DEBUG': return '#888';
      case 'INFO': return '#4CAF50';
      case 'WARN': return '#FFC107';
      case 'ERROR': return '#FF5722';
      case 'CRITICAL': return '#F44336';
      default: return '#d4d4d4';
    }
  }

  /**
   * Generate analysis from logs
   */
  generateAnalysis(logs, operation) {
    const lastLog = logs[logs.length - 1];
    let analysis = '';

    analysis += `<strong>Last completed log:</strong><br>${lastLog ? lastLog.message : 'None'}<br><br>`;
    analysis += `<strong>Crash likely occurred in:</strong><br>${operation.name}<br><br>`;

    // Check for dimension-related logs
    const dimensionLogs = logs.filter(log =>
      log.message.includes('dimensions') ||
      log.message.includes('pixels') ||
      log.message.includes('Canvas')
    );

    if (dimensionLogs.length > 0) {
      const lastDim = dimensionLogs[dimensionLogs.length - 1];
      analysis += `<strong>Screenshot dimensions at crash:</strong><br>${lastDim.message}<br>`;
      if (lastDim.data) {
        analysis += `Data: ${JSON.stringify(lastDim.data)}<br>`;
      }
    }

    analysis += `<br><strong>Recommendation:</strong><br>Check the screenshot dimensions above. If they exceed 4096x4096 or 8+ megapixels, the canvas operation likely exhausted browser memory.`;

    return analysis;
  }
}
