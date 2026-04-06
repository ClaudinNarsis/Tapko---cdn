/**
 * DebugLogger - Crash-diagnostic logging system
 *
 * Always-on for crash-critical paths (screenshot flow, canvas ops).
 * Persists everything to localStorage so logs survive a full browser crash/OS kill.
 * On next page load, call detectCrash() to retrieve what happened.
 *
 * Downloadable via: TapkoDebug.downloadCrashReport()
 */

const STORAGE_KEYS = {
  LOGS: 'tapko_debug_logs',
  ACTIVE_OPERATION: 'tapko_debug_active_operation',
  SYSTEM_INFO: 'tapko_debug_system_info',
  DEBUG_MODE: 'tapko_debug_mode',
  MEMORY_TICKER: 'tapko_memory_ticker',
  USER_ACTIONS: 'tapko_user_actions',
  CRASH_CHECKPOINTS: 'tapko_crash_checkpoints'
};

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

// Operations that are always logged regardless of debug mode
const ALWAYS_LOG_OPS = [
  'Capture viewport screenshot',
  'Resize screenshot for annotation',
  'Handle draw click',
  'Draw screenshot background'
];

const MAX_LOGS = 300;
const MAX_USER_ACTIONS = 200;
const MAX_MEMORY_TICKS = 150;
const MAX_CHECKPOINTS = 100;
const MEMORY_TICK_INTERVAL_MS = 2000; // Log memory every 2 seconds

class DebugLogger {
  constructor() {
    this.enabled = this.isDebugMode();
    this.systemInfo = this.collectSystemInfo();
    this._memoryTickerInterval = null;
    this._sessionId = Date.now().toString(36);

    // Always save system info — needed even without debug mode for crash reports
    this.saveSystemInfo();

    // Start periodic memory ticker — always-on, survives crashes
    this._startMemoryTicker();

    // Log page visibility changes (helps detect OS-level suspend/resume)
    document.addEventListener('visibilitychange', () => {
      this._persistUserAction('visibility-change', { state: document.visibilityState });
      this.checkpoint('visibility-change', { state: document.visibilityState });
    });
  }

  // ─── Debug mode ──────────────────────────────────────────────────────────────

  isDebugMode() {
    let configEnabled = false;
    try {
      if (typeof window !== 'undefined' && window.TapkoConfig) {
        configEnabled = window.TapkoConfig.DEBUG.enabled;
      }
    } catch (e) { /* CONFIG not available yet */ }

    const urlParams = new URLSearchParams(window.location.search);
    const urlDebug = urlParams.get('tapko_debug') === 'true';
    const storageDebug = localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === 'true';

    return configEnabled || urlDebug || storageDebug;
  }

  enableDebugMode() {
    this.enabled = true;
    localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, 'true');
    console.log('[Tapko Debug] Debug mode enabled');
  }

  disableDebugMode() {
    this.enabled = false;
    localStorage.removeItem(STORAGE_KEYS.DEBUG_MODE);
    console.log('[Tapko Debug] Debug mode disabled');
  }

  // ─── System info ─────────────────────────────────────────────────────────────

  collectSystemInfo() {
    const info = {
      sessionId: this._sessionId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      browser: this.detectBrowser(),
      os: this.detectOS(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      colorDepth: window.screen.colorDepth,
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
      language: navigator.language,
      url: window.location.href
    };

    const mem = this._rawMemory();
    if (mem) {
      info.memory = {
        jsHeapSizeLimit: this.formatBytes(mem.jsHeapSizeLimit),
        totalJSHeapSize: this.formatBytes(mem.totalJSHeapSize),
        usedJSHeapSize: this.formatBytes(mem.usedJSHeapSize),
        usedPercent: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(2) + '%'
      };
    }

    return info;
  }

  saveSystemInfo() {
    try {
      localStorage.setItem(STORAGE_KEYS.SYSTEM_INFO, JSON.stringify(this.systemInfo));
    } catch (e) { /* storage full */ }
  }

  detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) return 'Safari';
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    return 'Unknown';
  }

  detectOS() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Mac') > -1) return 'macOS';
    if (ua.indexOf('Win') > -1) return 'Windows';
    if (ua.indexOf('Linux') > -1) return 'Linux';
    if (ua.indexOf('Android') > -1) return 'Android';
    if (ua.indexOf('iOS') > -1) return 'iOS';
    return 'Unknown';
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ─── Memory ticker (always-on, 2-second interval) ─────────────────────────

  _rawMemory() {
    if (window.performance && window.performance.memory) {
      return window.performance.memory;
    }
    return null;
  }

  _startMemoryTicker() {
    // Always-on — do not gate on this.enabled
    this._memoryTickerInterval = setInterval(() => {
      this._tickMemory();
    }, MEMORY_TICK_INTERVAL_MS);
  }

  _tickMemory() {
    const mem = this._rawMemory();
    const tick = {
      t: Date.now(),
      perf: performance.now().toFixed(0)
    };

    if (mem) {
      tick.usedMB = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
      tick.totalMB = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
      tick.limitMB = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1);
      tick.usedPct = ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1);
      tick.usedRaw = mem.usedJSHeapSize;
      tick.totalRaw = mem.totalJSHeapSize;
      tick.limitRaw = mem.jsHeapSizeLimit;
    } else {
      tick.memoryApiAvailable = false;
    }

    this._appendToList(STORAGE_KEYS.MEMORY_TICKER, tick, MAX_MEMORY_TICKS);
  }

  getMemoryTicks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MEMORY_TICKER);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  // ─── Crash checkpoints (step-level, always persisted) ─────────────────────

  /**
   * Write a named checkpoint with memory snapshot.
   * These are always persisted regardless of debug mode.
   * Used to trace exactly which step a crash occurred at.
   */
  checkpoint(name, data = {}) {
    const mem = this._rawMemory();
    const entry = {
      t: Date.now(),
      perf: performance.now().toFixed(2),
      name,
      data,
      mem: mem ? {
        usedMB: (mem.usedJSHeapSize / 1024 / 1024).toFixed(1),
        totalMB: (mem.totalJSHeapSize / 1024 / 1024).toFixed(1),
        limitMB: (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1),
        usedPct: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1),
        usedRaw: mem.usedJSHeapSize
      } : null
    };

    console.log(`[Tapko][CHECKPOINT] ${name}`, entry);
    this._appendToList(STORAGE_KEYS.CRASH_CHECKPOINTS, entry, MAX_CHECKPOINTS);
  }

  getCrashCheckpoints() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CRASH_CHECKPOINTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  // ─── User action tracking (always-on) ────────────────────────────────────

  /**
   * Log a user interaction. Called from UI components.
   * Always persisted to survive crashes.
   */
  logUserAction(action, detail = {}) {
    this._persistUserAction(action, detail);

    if (this.enabled) {
      console.log(`[Tapko][ACTION] ${action}`, detail);
    }
  }

  _persistUserAction(action, detail = {}) {
    const mem = this._rawMemory();
    const entry = {
      t: Date.now(),
      perf: performance.now().toFixed(2),
      action,
      detail,
      mem: mem ? {
        usedMB: (mem.usedJSHeapSize / 1024 / 1024).toFixed(1),
        usedPct: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1)
      } : null
    };

    this._appendToList(STORAGE_KEYS.USER_ACTIONS, entry, MAX_USER_ACTIONS);
  }

  getUserActions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_ACTIONS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  // ─── Storage helpers ──────────────────────────────────────────────────────

  _appendToList(key, item, maxItems) {
    try {
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      list.push(item);
      const trimmed = list.length > maxItems ? list.slice(-maxItems) : list;
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch (e) {
      // localStorage full — try to make room by trimming aggressively
      try {
        localStorage.setItem(key, JSON.stringify([item]));
      } catch (e2) { /* nothing we can do */ }
    }
  }

  // ─── General log methods ──────────────────────────────────────────────────

  getLogs() {
    try {
      const logsStr = localStorage.getItem(STORAGE_KEYS.LOGS);
      return logsStr ? JSON.parse(logsStr) : [];
    } catch (e) { return []; }
  }

  log(level, message, data = null) {
    if (!this.enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      time: performance.now().toFixed(3),
      level,
      message,
      data: data ? this.sanitizeData(data) : null
    };

    const consoleMethod = level === 'ERROR' || level === 'CRITICAL' ? 'error' :
                         level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](`[Tapko Debug ${level}]`, message, data || '');

    this._appendToList(STORAGE_KEYS.LOGS, entry, MAX_LOGS);
  }

  sanitizeData(data) {
    try { return JSON.parse(JSON.stringify(data)); }
    catch (e) { return String(data); }
  }

  // Kept for backward compatibility
  saveLog(entry) {
    this._appendToList(STORAGE_KEYS.LOGS, entry, MAX_LOGS);
  }

  debug(message, data) { this.log(LOG_LEVELS.DEBUG, message, data); }
  info(message, data) { this.log(LOG_LEVELS.INFO, message, data); }
  warn(message, data) { this.log(LOG_LEVELS.WARN, message, data); }
  error(message, data) { this.log(LOG_LEVELS.ERROR, message, data); }
  critical(message, data) { this.log(LOG_LEVELS.CRITICAL, message, data); }

  // ─── Operation tracking ───────────────────────────────────────────────────

  startOperation(operationName, context = {}) {
    const forceEnable = ALWAYS_LOG_OPS.some(op => operationName.includes(op));
    if (!this.enabled && !forceEnable) return;

    const operation = {
      name: operationName,
      startTime: performance.now(),
      timestamp: new Date().toISOString(),
      context: this.sanitizeData(context)
    };

    try {
      const opStr = JSON.stringify(operation);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OPERATION, opStr);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup1', opStr);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup2', opStr);
      localStorage.setItem('tapko_operation_active', operationName);
      // Force sync
      localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION);
    } catch (e) { /* ignore */ }

    this.checkpoint(`op-start:${operationName}`, context);
    this.info(`START: ${operationName}`, context);
  }

  endOperation(operationName, result = null) {
    try {
      const activeOp = this.getActiveOperation();
      if (activeOp && activeOp.name === operationName) {
        const duration = performance.now() - activeOp.startTime;
        this.checkpoint(`op-end:${operationName}`, { duration: duration.toFixed(2), result });
        this.info(`END: ${operationName}`, {
          duration: `${duration.toFixed(2)}ms`,
          result: result ? this.sanitizeData(result) : null
        });

        localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup1');
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup2');
        localStorage.removeItem('tapko_operation_active');
      }
    } catch (e) { /* ignore */ }
  }

  getActiveOperation() {
    try {
      let opStr = localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION)
        || localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup1')
        || localStorage.getItem(STORAGE_KEYS.ACTIVE_OPERATION + '_backup2');

      if (!opStr) {
        const simpleName = localStorage.getItem('tapko_operation_active');
        if (simpleName) return { name: simpleName, timestamp: new Date().toISOString(), startTime: 0, context: {} };
      }

      return opStr ? JSON.parse(opStr) : null;
    } catch (e) {
      const simpleName = localStorage.getItem('tapko_operation_active');
      return simpleName
        ? { name: simpleName, timestamp: 'unknown', startTime: 0, context: {} }
        : null;
    }
  }

  // ─── Crash detection ──────────────────────────────────────────────────────

  detectCrash() {
    const activeOp = this.getActiveOperation();
    if (activeOp) {
      return {
        crashed: true,
        operation: activeOp,
        lastCheckpoints: this.getCrashCheckpoints().slice(-20),
        logs: this.getLogs(),
        systemInfo: this.getSystemInfo()
      };
    }
    return { crashed: false };
  }

  getSystemInfo() {
    try {
      const infoStr = localStorage.getItem(STORAGE_KEYS.SYSTEM_INFO);
      return infoStr ? JSON.parse(infoStr) : this.systemInfo;
    } catch (e) { return this.systemInfo; }
  }

  // ─── Memory snapshot / report (legacy API kept) ──────────────────────────

  getMemorySnapshot() {
    const mem = this._rawMemory();
    if (!mem) return null;
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

  logMemory(label = 'Memory', additionalContext = {}) {
    const snapshot = this.getMemorySnapshot();
    if (snapshot) {
      this.info(`${label} - ${snapshot.formatted.used} / ${snapshot.formatted.limit} (${snapshot.usedPercent}%)`, {
        ...snapshot, ...additionalContext, label, timestamp: Date.now()
      });
      this._storeMemoryCheckpoint(label, snapshot);
    } else {
      this.warn(`${label} - Memory API not available (non-Chrome browser)`);
    }
  }

  _storeMemoryCheckpoint(label, snapshot) {
    try {
      const checkpoints = this._getMemoryCheckpoints();
      checkpoints.push({ label, timestamp: Date.now(), ...snapshot });
      localStorage.setItem('tapko_memory_checkpoints', JSON.stringify(checkpoints.slice(-50)));
    } catch (e) { /* ignore */ }
  }

  _getMemoryCheckpoints() {
    try {
      const data = localStorage.getItem('tapko_memory_checkpoints');
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  }

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

  logMemoryDelta(fromLabel, toLabel, context = {}) {
    const delta = this.getMemoryDelta(fromLabel, toLabel);
    if (delta) {
      this.info(`Memory Change [${fromLabel} → ${toLabel}]: ${delta.deltaFormatted} (${delta.percentChange}%)`, { ...delta, ...context });
    }
  }

  getMemoryReport() {
    const checkpoints = this._getMemoryCheckpoints();
    if (checkpoints.length === 0) return { message: 'No memory checkpoints available' };

    const report = {
      totalCheckpoints: checkpoints.length,
      firstCheckpoint: checkpoints[0],
      lastCheckpoint: checkpoints[checkpoints.length - 1],
      checkpoints,
      deltas: []
    };

    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1];
      const curr = checkpoints[i];
      const delta = curr.usedJSHeapSize - prev.usedJSHeapSize;
      report.deltas.push({
        from: prev.label, to: curr.label, delta,
        deltaFormatted: this.formatBytes(Math.abs(delta)),
        percentChange: ((delta / prev.usedJSHeapSize) * 100).toFixed(2),
        timestamp: curr.timestamp
      });
    }

    if (report.deltas.length > 0) {
      report.largestIncrease = report.deltas.reduce((max, d) => d.delta > max.delta ? d : max);
    }

    return report;
  }

  // ─── Export / download ────────────────────────────────────────────────────

  exportLogs() {
    const crashData = this.detectCrash();
    return {
      exported: new Date().toISOString(),
      crashDetected: crashData.crashed,
      activeOperation: crashData.operation || null,
      systemInfo: this.getSystemInfo(),
      logs: this.getLogs()
    };
  }

  /**
   * Full crash diagnostic report — includes memory ticks, user actions, checkpoints.
   * Call TapkoDebug.downloadCrashReport() from the browser console after a crash.
   */
  buildCrashReport() {
    const checkpoints = this.getCrashCheckpoints();
    const memTicks = this.getMemoryTicks();
    const userActions = this.getUserActions();
    const activeOp = this.getActiveOperation();
    const systemInfo = this.getSystemInfo();

    // Find the last checkpoint before any suspected crash
    const lastCheckpoint = checkpoints[checkpoints.length - 1] || null;

    // Find peak memory from ticks
    let peakMemMB = 0;
    let peakMemTick = null;
    for (const tick of memTicks) {
      const mb = parseFloat(tick.usedMB);
      if (mb > peakMemMB) { peakMemMB = mb; peakMemTick = tick; }
    }

    return {
      reportGeneratedAt: new Date().toISOString(),
      sessionId: systemInfo.sessionId,
      systemInfo,
      summary: {
        crashDetected: !!activeOp,
        crashedDuringOperation: activeOp?.name || null,
        lastRecordedCheckpoint: lastCheckpoint?.name || null,
        lastRecordedCheckpointTime: lastCheckpoint ? new Date(lastCheckpoint.t).toISOString() : null,
        lastUserAction: userActions[userActions.length - 1]?.action || null,
        peakMemoryMB: peakMemMB.toFixed(1),
        peakMemoryAt: peakMemTick ? new Date(peakMemTick.t).toISOString() : null,
        memoryTickCount: memTicks.length,
        userActionCount: userActions.length,
        checkpointCount: checkpoints.length
      },
      activeOperation: activeOp,
      // Most recent 30 checkpoints (nearest to crash)
      recentCheckpoints: checkpoints.slice(-30),
      // All user actions
      userActions,
      // Memory timeline
      memoryTimeline: memTicks,
      // Debug logs (if debug mode was on)
      debugLogs: this.getLogs()
    };
  }

  downloadLogs(filename = 'tapko-debug-logs.json') {
    this._downloadJSON(this.exportLogs(), filename);
    console.log('[Tapko Debug] Logs downloaded:', filename);
  }

  downloadMemoryReport() {
    const report = this.getMemoryReport();
    this._downloadJSON(report, `tapko-memory-report-${Date.now()}.json`);
    console.log('[Tapko Debug] Memory report downloaded');
  }

  downloadCrashReport() {
    const report = this.buildCrashReport();
    const filename = `tapko-crash-report-${Date.now()}.json`;
    this._downloadJSON(report, filename);
    console.log('[Tapko Debug] Crash report downloaded:', filename);
    console.log('[Tapko Debug] Summary:', report.summary);
    return report.summary;
  }

  _downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Clear ────────────────────────────────────────────────────────────────

  clearAll() {
    try {
      [
        STORAGE_KEYS.LOGS,
        STORAGE_KEYS.ACTIVE_OPERATION,
        STORAGE_KEYS.ACTIVE_OPERATION + '_backup1',
        STORAGE_KEYS.ACTIVE_OPERATION + '_backup2',
        STORAGE_KEYS.SYSTEM_INFO,
        STORAGE_KEYS.MEMORY_TICKER,
        STORAGE_KEYS.USER_ACTIONS,
        STORAGE_KEYS.CRASH_CHECKPOINTS,
        'tapko_operation_active',
        'tapko_memory_checkpoints'
      ].forEach(k => localStorage.removeItem(k));
      console.log('[Tapko Debug] All debug data cleared');
    } catch (e) { /* ignore */ }
  }
}

// Singleton
const debugLogger = new DebugLogger();
export default debugLogger;
