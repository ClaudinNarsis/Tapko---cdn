/**
 * DebugLogger - Minimal crash detection and logging
 *
 * Provides lightweight crash detection for monitoring browser issues.
 * Only active when debug mode is explicitly enabled.
 */

const STORAGE_KEYS = {
  LOGS: 'tapko_debug_logs',
  ACTIVE_OPERATION: 'tapko_debug_active_operation',
  SYSTEM_INFO: 'tapko_debug_system_info',
  DEBUG_MODE: 'tapko_debug_mode'
};

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

const MAX_LOGS = 100; // Reduced from 200

class DebugLogger {
  constructor() {
    this.enabled = this.isDebugMode();
    this.systemInfo = this.collectSystemInfo();

    if (this.enabled) {
      this.saveSystemInfo();
    }
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode() {
    // Check if CONFIG is available (may not be during import)
    let configEnabled = false;
    try {
      // Dynamic import to avoid circular dependency
      if (typeof window !== 'undefined' && window.TapkoConfig) {
        configEnabled = window.TapkoConfig.DEBUG.enabled;
      }
    } catch (e) {
      // CONFIG not available yet
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlDebug = urlParams.get('tapko_debug') === 'true';
    const storageDebug = localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === 'true';

    return configEnabled || urlDebug || storageDebug;
  }

  /**
   * Enable debug mode
   */
  enableDebugMode() {
    this.enabled = true;
    localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, 'true');
    console.log('[Tapko Debug] Debug mode enabled');
  }

  /**
   * Disable debug mode
   */
  disableDebugMode() {
    this.enabled = false;
    localStorage.removeItem(STORAGE_KEYS.DEBUG_MODE);
    console.log('[Tapko Debug] Debug mode disabled');
  }

  /**
   * Collect system information
   */
  collectSystemInfo() {
    const info = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      browser: this.detectBrowser(),
      os: this.detectOS(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      colorDepth: window.screen.colorDepth,
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
      language: navigator.language
    };

    if (window.performance && window.performance.memory) {
      const mem = window.performance.memory;
      info.memory = {
        jsHeapSizeLimit: this.formatBytes(mem.jsHeapSizeLimit),
        totalJSHeapSize: this.formatBytes(mem.totalJSHeapSize),
        usedJSHeapSize: this.formatBytes(mem.usedJSHeapSize),
        usedPercent: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(2) + '%'
      };
    }

    return info;
  }

  /**
   * Detect browser name and version
   */
  detectBrowser() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';

    if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
      browser = 'Chrome';
    } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
      browser = 'Safari';
    } else if (ua.indexOf('Firefox') > -1) {
      browser = 'Firefox';
    } else if (ua.indexOf('Edg') > -1) {
      browser = 'Edge';
    }

    return browser;
  }

  /**
   * Detect OS
   */
  detectOS() {
    const ua = navigator.userAgent;

    if (ua.indexOf('Mac') > -1) return 'macOS';
    if (ua.indexOf('Win') > -1) return 'Windows';
    if (ua.indexOf('Linux') > -1) return 'Linux';
    if (ua.indexOf('Android') > -1) return 'Android';
    if (ua.indexOf('iOS') > -1) return 'iOS';

    return 'Unknown';
  }

  /**
   * Format bytes to human-readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Save system info to localStorage
   */
  saveSystemInfo() {
    try {
      localStorage.setItem(STORAGE_KEYS.SYSTEM_INFO, JSON.stringify(this.systemInfo));
    } catch (e) {
      console.error('[Tapko Debug] Failed to save system info:', e);
    }
  }

  /**
   * Get all logs from localStorage
   */
  getLogs() {
    try {
      const logsStr = localStorage.getItem(STORAGE_KEYS.LOGS);
      return logsStr ? JSON.parse(logsStr) : [];
    } catch (e) {
      console.error('[Tapko Debug] Failed to parse logs:', e);
      return [];
    }
  }

  /**
   * Write log entry
   */
  log(level, message, data = null) {
    if (!this.enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      time: performance.now().toFixed(3),
      level,
      message,
      data: data ? this.sanitizeData(data) : null
    };

    // Also log to console
    const consoleMethod = level === 'ERROR' || level === 'CRITICAL' ? 'error' :
                         level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](`[Tapko Debug ${level}]`, message, data || '');

    // Save to localStorage
    this.saveLog(entry);
  }

  /**
   * Sanitize data to prevent circular references
   */
  sanitizeData(data) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      return String(data);
    }
  }

  /**
   * Save log entry to localStorage
   */
  saveLog(entry) {
    try {
      const logs = this.getLogs();
      logs.push(entry);

      // Keep only last MAX_LOGS entries
      const trimmedLogs = logs.slice(-MAX_LOGS);

      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(trimmedLogs));
    } catch (e) {
      console.error('[Tapko Debug] Failed to save log:', e);
    }
  }

  /**
   * Convenience methods for different log levels
   */
  debug(message, data) {
    this.log(LOG_LEVELS.DEBUG, message, data);
  }

  info(message, data) {
    this.log(LOG_LEVELS.INFO, message, data);
  }

  warn(message, data) {
    this.log(LOG_LEVELS.WARN, message, data);
  }

  error(message, data) {
    this.log(LOG_LEVELS.ERROR, message, data);
  }

  critical(message, data) {
    this.log(LOG_LEVELS.CRITICAL, message, data);
  }

  /**
   * Mark start of an operation
   */
  startOperation(operationName, context = {}) {
    // CRITICAL: Always enable for crash-prone operations
    const crashProneOps = [
      'Capture viewport screenshot',
      'Resize screenshot for annotation',
      'Handle draw click',
      'Draw screenshot background'
    ];

    const forceEnable = crashProneOps.some(op => operationName.includes(op));

    if (!this.enabled && !forceEnable) return;

    const operation = {
      name: operationName,
      startTime: performance.now(),
      timestamp: new Date().toISOString(),
      context: this.sanitizeData(context)
    };

    // Save active operation MULTIPLE times for redundancy
    try {
      const opStr = JSON.stringify(operation);

      // Write 3 times to ensure persistence before browser crash
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OPERATION, opStr);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup1', opStr);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup2', opStr);

      // Also set a simple flag for quick crash detection
      localStorage.setItem('tapko_operation_active', operationName);

      // Force sync (browsers batch writes, this helps)
      localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION);
    } catch (e) {
      console.error('[Tapko Debug] Failed to save active operation:', e);
    }

    this.info(`START: ${operationName}`, context);
  }

  /**
   * Mark end of an operation
   */
  endOperation(operationName, result = null) {
    // Clear active operation
    try {
      const activeOp = this.getActiveOperation();
      if (activeOp && activeOp.name === operationName) {
        const duration = performance.now() - activeOp.startTime;
        this.info(`END: ${operationName}`, {
          duration: `${duration.toFixed(2)}ms`,
          result: result ? this.sanitizeData(result) : null
        });

        // Remove all backup copies
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup1');
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup2');
        localStorage.removeItem('tapko_operation_active');
      }
    } catch (e) {
      console.error('[Tapko Debug] Failed to end operation:', e);
    }
  }

  /**
   * Get active operation (if any)
   */
  getActiveOperation() {
    try {
      // Try main storage first
      let opStr = localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION);

      // Fallback to backups if main is corrupted
      if (!opStr) {
        opStr = localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup1');
      }
      if (!opStr) {
        opStr = localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup2');
      }

      // Fallback to simple flag
      if (!opStr) {
        const simpleName = localStorage.getItem('tapko_operation_active');
        if (simpleName) {
          return {
            name: simpleName,
            timestamp: new Date().toISOString(),
            startTime: 0,
            context: {}
          };
        }
      }

      return opStr ? JSON.parse(opStr) : null;
    } catch (e) {
      // Even parsing failed, try simple flag
      const simpleName = localStorage.getItem('tapko_operation_active');
      if (simpleName) {
        return {
          name: simpleName,
          timestamp: 'unknown',
          startTime: 0,
          context: {}
        };
      }
      return null;
    }
  }

  /**
   * Check if a crash was detected
   */
  detectCrash() {
    const activeOp = this.getActiveOperation();
    if (activeOp) {
      return {
        crashed: true,
        operation: activeOp,
        logs: this.getLogs(),
        systemInfo: this.getSystemInfo()
      };
    }
    return { crashed: false };
  }

  /**
   * Get system info from localStorage
   */
  getSystemInfo() {
    try {
      const infoStr = localStorage.getItem(STORAGE_KEYS.SYSTEM_INFO);
      return infoStr ? JSON.parse(infoStr) : this.systemInfo;
    } catch (e) {
      return this.systemInfo;
    }
  }

  /**
   * Clear all debug data
   */
  clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEYS.LOGS);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup1');
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup2');
      localStorage.removeItem(STORAGE_KEYS.SYSTEM_INFO);
      localStorage.removeItem('tapko_operation_active');
      console.log('[Tapko Debug] All debug data cleared');
    } catch (e) {
      console.error('[Tapko Debug] Failed to clear data:', e);
    }
  }

  /**
   * Export logs as downloadable JSON
   */
  exportLogs() {
    const crashData = this.detectCrash();
    const exportData = {
      exported: new Date().toISOString(),
      crashDetected: crashData.crashed,
      activeOperation: crashData.operation || null,
      systemInfo: this.getSystemInfo(),
      logs: this.getLogs()
    };

    return exportData;
  }

  /**
   * Download logs as JSON file
   */
  downloadLogs(filename = 'tapko-debug-logs.json') {
    const data = this.exportLogs();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[Tapko Debug] Logs downloaded:', filename);
  }

  /**
   * Get memory snapshot (Chrome only)
   */
  getMemorySnapshot() {
    if (window.performance && window.performance.memory) {
      const mem = window.performance.memory;
      return {
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        totalJSHeapSize: mem.totalJSHeapSize,
        usedJSHeapSize: mem.usedJSHeapSize,
        usedPercent: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(2),
        formatted: {
          limit: this.formatBytes(mem.jsHeapSizeLimit),
          total: this.formatBytes(mem.totalJSHeapSize),
          used: this.formatBytes(mem.usedJSHeapSize)
        }
      };
    }
    return null;
  }

  /**
   * Log memory state with detailed analysis
   */
  logMemory(label = 'Memory', additionalContext = {}) {
    const snapshot = this.getMemorySnapshot();
    if (snapshot) {
      const memoryData = {
        ...snapshot,
        ...additionalContext,
        label,
        timestamp: Date.now()
      };

      this.info(`${label} - ${snapshot.formatted.used} / ${snapshot.formatted.limit} (${snapshot.usedPercent}%)`, memoryData);

      // Store memory checkpoint for comparison
      this._storeMemoryCheckpoint(label, snapshot);
    } else {
      this.warn(`${label} - Memory API not available (non-Chrome browser)`);
    }
  }

  /**
   * Store memory checkpoint for tracking
   */
  _storeMemoryCheckpoint(label, snapshot) {
    try {
      const checkpoints = this._getMemoryCheckpoints();
      checkpoints.push({
        label,
        timestamp: Date.now(),
        ...snapshot
      });

      // Keep last 50 checkpoints
      const trimmed = checkpoints.slice(-50);
      localStorage.setItem('tapko_memory_checkpoints', JSON.stringify(trimmed));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Get memory checkpoints
   */
  _getMemoryCheckpoints() {
    try {
      const data = localStorage.getItem('tapko_memory_checkpoints');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Get memory delta between two checkpoints
   */
  getMemoryDelta(fromLabel, toLabel) {
    const checkpoints = this._getMemoryCheckpoints();
    const from = checkpoints.find(c => c.label === fromLabel);
    const to = checkpoints.find(c => c.label === toLabel);

    if (from && to) {
      return {
        delta: to.usedJSHeapSize - from.usedJSHeapSize,
        deltaFormatted: this.formatBytes(Math.abs(to.usedJSHeapSize - from.usedJSHeapSize)),
        percentChange: ((to.usedJSHeapSize - from.usedJSHeapSize) / from.usedJSHeapSize * 100).toFixed(2),
        from: from.formatted.used,
        to: to.formatted.used
      };
    }
    return null;
  }

  /**
   * Log memory delta
   */
  logMemoryDelta(fromLabel, toLabel, context = {}) {
    const delta = this.getMemoryDelta(fromLabel, toLabel);
    if (delta) {
      this.info(`Memory Change [${fromLabel} → ${toLabel}]: ${delta.deltaFormatted} (${delta.percentChange}%)`, {
        ...delta,
        ...context
      });
    }
  }

  /**
   * Get memory report for all checkpoints
   */
  getMemoryReport() {
    const checkpoints = this._getMemoryCheckpoints();
    if (checkpoints.length === 0) {
      return { message: 'No memory checkpoints available' };
    }

    const report = {
      totalCheckpoints: checkpoints.length,
      firstCheckpoint: checkpoints[0],
      lastCheckpoint: checkpoints[checkpoints.length - 1],
      checkpoints: checkpoints,
      deltas: []
    };

    // Calculate deltas between consecutive checkpoints
    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1];
      const curr = checkpoints[i];
      const delta = curr.usedJSHeapSize - prev.usedJSHeapSize;

      report.deltas.push({
        from: prev.label,
        to: curr.label,
        delta,
        deltaFormatted: this.formatBytes(Math.abs(delta)),
        percentChange: ((delta / prev.usedJSHeapSize) * 100).toFixed(2),
        timestamp: curr.timestamp
      });
    }

    // Find largest memory increase
    if (report.deltas.length > 0) {
      const largest = report.deltas.reduce((max, d) => d.delta > max.delta ? d : max);
      report.largestIncrease = largest;
    }

    return report;
  }

  /**
   * Download memory report
   */
  downloadMemoryReport() {
    const report = this.getMemoryReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tapko-memory-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[Tapko Debug] Memory report downloaded');
    console.log('Largest memory increase:', report.largestIncrease);
  }
}

// Create singleton instance
const debugLogger = new DebugLogger();

// Export singleton
export default debugLogger;
