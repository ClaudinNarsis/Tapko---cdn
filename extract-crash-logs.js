/**
 * Emergency Crash Log Extractor
 *
 * Paste this entire script into the browser console to extract crash logs
 * from localStorage after a crash occurs.
 *
 * Usage:
 * 1. Open browser DevTools (F12 or Cmd+Option+I)
 * 2. Go to Console tab
 * 3. Paste this entire script and press Enter
 * 4. The script will automatically download crash logs if found
 */

(function() {
  console.log('='.repeat(60));
  console.log('TAPKO CRASH LOG EXTRACTOR');
  console.log('='.repeat(60));

  // Storage keys
  const KEYS = {
    LOGS: 'tapko_debug_logs',
    ACTIVE_OPERATION: 'tapko_debug_active_operation',
    SYSTEM_INFO: 'tapko_debug_system_info',
    DEBUG_MODE: 'tapko_debug_mode'
  };

  // Helper to format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Helper to get memory snapshot
  function getMemorySnapshot() {
    if (window.performance && window.performance.memory) {
      const mem = window.performance.memory;
      return {
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        totalJSHeapSize: mem.totalJSHeapSize,
        usedJSHeapSize: mem.usedJSHeapSize,
        usedPercent: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(2) + '%',
        formatted: {
          limit: formatBytes(mem.jsHeapSizeLimit),
          total: formatBytes(mem.totalJSHeapSize),
          used: formatBytes(mem.usedJSHeapSize)
        }
      };
    }
    return null;
  }

  // Try to retrieve data from localStorage
  let logs = [];
  let activeOperation = null;
  let systemInfo = null;
  let crashDetected = false;

  try {
    const logsStr = localStorage.getItem(KEYS.LOGS);
    if (logsStr) {
      logs = JSON.parse(logsStr);
      console.log(`✅ Found ${logs.length} log entries`);
    } else {
      console.log('⚠️  No logs found in localStorage');
    }
  } catch (e) {
    console.error('❌ Failed to parse logs:', e);
  }

  try {
    const activeOpStr = localStorage.getItem(KEYS.ACTIVE_OPERATION);
    if (activeOpStr) {
      activeOperation = JSON.parse(activeOpStr);
      crashDetected = true;
      console.log('🚨 CRASH DETECTED! Active operation found:', activeOperation.name);
    } else {
      console.log('✅ No active operation (no crash detected)');
    }
  } catch (e) {
    console.error('❌ Failed to parse active operation:', e);
  }

  try {
    const sysInfoStr = localStorage.getItem(KEYS.SYSTEM_INFO);
    if (sysInfoStr) {
      systemInfo = JSON.parse(sysInfoStr);
      console.log('✅ System info found');
    }
  } catch (e) {
    console.error('❌ Failed to parse system info:', e);
  }

  // Compile crash report
  const crashReport = {
    extractedAt: new Date().toISOString(),
    crashDetected: crashDetected,
    activeOperation: activeOperation || null,
    systemInfo: systemInfo || {
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      language: navigator.language,
      platform: navigator.platform
    },
    currentMemory: getMemorySnapshot(),
    logs: logs,
    summary: {
      totalLogs: logs.length,
      lastLog: logs.length > 0 ? logs[logs.length - 1] : null,
      errorCount: logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length,
      warningCount: logs.filter(l => l.level === 'WARN').length
    }
  };

  // Print summary to console
  console.log('\n' + '='.repeat(60));
  console.log('CRASH REPORT SUMMARY');
  console.log('='.repeat(60));
  console.log('Crash Detected:', crashDetected ? '🚨 YES' : '✅ NO');

  if (crashDetected && activeOperation) {
    console.log('Crashed Operation:', activeOperation.name);
    console.log('Started At:', new Date(activeOperation.timestamp).toLocaleString());
    if (activeOperation.context) {
      console.log('Context:', activeOperation.context);
    }
  }

  console.log('\nLog Statistics:');
  console.log('  Total Logs:', crashReport.summary.totalLogs);
  console.log('  Errors:', crashReport.summary.errorCount);
  console.log('  Warnings:', crashReport.summary.warningCount);

  if (crashReport.summary.lastLog) {
    console.log('\nLast Log Entry:');
    console.log(' ', crashReport.summary.lastLog.message);
    console.log('  Time:', new Date(crashReport.summary.lastLog.timestamp).toLocaleString());
  }

  console.log('\nSystem Info:');
  console.log('  Browser:', crashReport.systemInfo.browser || 'Unknown');
  console.log('  OS:', crashReport.systemInfo.os || navigator.platform);
  console.log('  Viewport:', crashReport.systemInfo.viewport);
  console.log('  DPR:', crashReport.systemInfo.devicePixelRatio);

  if (crashReport.currentMemory) {
    console.log('\nCurrent Memory:');
    console.log('  Heap Limit:', crashReport.currentMemory.formatted.limit);
    console.log('  Heap Used:', crashReport.currentMemory.formatted.used);
    console.log('  Usage:', crashReport.currentMemory.usedPercent);
  }

  // Print last 10 logs
  if (logs.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('LAST 10 LOG ENTRIES');
    console.log('='.repeat(60));
    const lastTen = logs.slice(-10);
    lastTen.forEach((log, idx) => {
      const color = log.level === 'ERROR' || log.level === 'CRITICAL' ? 'color: red; font-weight: bold' :
                    log.level === 'WARN' ? 'color: orange' :
                    log.level === 'INFO' ? 'color: green' : '';
      console.log(`%c${idx + 1}. [${log.level}] ${log.message}`, color);
      if (log.data) {
        console.log('   Data:', log.data);
      }
    });
  }

  // Analysis
  if (crashDetected) {
    console.log('\n' + '='.repeat(60));
    console.log('CRASH ANALYSIS');
    console.log('='.repeat(60));

    // Find dimension-related logs
    const dimensionLogs = logs.filter(log =>
      log.message.toLowerCase().includes('dimensions') ||
      log.message.toLowerCase().includes('pixels') ||
      log.message.toLowerCase().includes('canvas') ||
      log.message.toLowerCase().includes('width') ||
      log.message.toLowerCase().includes('height')
    );

    if (dimensionLogs.length > 0) {
      console.log('\nDimension-related logs found:');
      dimensionLogs.slice(-5).forEach(log => {
        console.log(`  - ${log.message}`);
        if (log.data) console.log('    Data:', log.data);
      });
    }

    // Find START operations without END
    const startOps = logs.filter(l => l.message.startsWith('START:'));
    const endOps = logs.filter(l => l.message.startsWith('END:'));

    if (startOps.length > endOps.length) {
      const incompleteOps = startOps.slice(endOps.length);
      console.log('\n⚠️  Incomplete operations (likely crash point):');
      incompleteOps.forEach(op => {
        console.log('%c  🔴 ' + op.message, 'color: red; font-weight: bold');
        if (op.data) console.log('     Data:', op.data);
      });
    }
  }

  // Download function
  console.log('\n' + '='.repeat(60));
  console.log('DOWNLOAD OPTIONS');
  console.log('='.repeat(60));

  window.downloadTapkoCrashLogs = function() {
    const blob = new Blob([JSON.stringify(crashReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tapko-crash-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('✅ Crash logs downloaded!');
  };

  window.clearTapkoDebugData = function() {
    const confirm = window.confirm('Are you sure you want to clear all Tapko debug data?');
    if (confirm) {
      localStorage.removeItem(KEYS.LOGS);
      localStorage.removeItem(KEYS.ACTIVE_OPERATION);
      localStorage.removeItem(KEYS.SYSTEM_INFO);
      localStorage.removeItem(KEYS.DEBUG_MODE);
      console.log('✅ All Tapko debug data cleared!');
    }
  };

  window.viewTapkoCrashReport = function() {
    console.log(JSON.stringify(crashReport, null, 2));
  };

  console.log('\nAvailable functions:');
  console.log('  downloadTapkoCrashLogs()  - Download crash logs as JSON file');
  console.log('  clearTapkoDebugData()     - Clear all debug data from localStorage');
  console.log('  viewTapkoCrashReport()    - View full crash report in console');

  // Auto-download if crash detected
  if (crashDetected) {
    console.log('\n🚨 Crash detected! Auto-downloading logs...');
    setTimeout(() => {
      window.downloadTapkoCrashLogs();
    }, 1000);
  } else {
    console.log('\n✅ No crash detected. You can still download logs using downloadTapkoCrashLogs()');
  }

  console.log('\n' + '='.repeat(60));
  console.log('EXTRACTION COMPLETE');
  console.log('='.repeat(60));

  // Return the crash report object
  return crashReport;

})();
