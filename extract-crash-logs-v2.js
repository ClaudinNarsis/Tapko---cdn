/**
 * EMERGENCY CRASH LOG EXTRACTOR V2
 * For full browser crashes where localStorage may not persist properly
 *
 * PASTE THIS INTO BROWSER CONSOLE IMMEDIATELY AFTER BROWSER RESTARTS
 */

(function() {
  console.log('%c' + '='.repeat(70), 'font-weight: bold; font-size: 14px');
  console.log('%cTAPKO EMERGENCY CRASH LOG EXTRACTOR V2', 'font-weight: bold; font-size: 16px; color: #ff6b6b');
  console.log('%cFor full browser crashes', 'font-style: italic; color: #888');
  console.log('%c' + '='.repeat(70), 'font-weight: bold; font-size: 14px');

  // Check ALL possible storage locations
  const allKeys = Object.keys(localStorage);
  const tapkoKeys = allKeys.filter(k => k.startsWith('tapko'));

  console.log('\n📦 ALL TAPKO LOCALSTORAGE KEYS FOUND:');
  if (tapkoKeys.length === 0) {
    console.log('%c⚠️  NO TAPKO DATA FOUND IN LOCALSTORAGE!', 'color: orange; font-weight: bold; font-size: 14px');
    console.log('\nPossible reasons:');
    console.log('1. Browser crashed before localStorage could write');
    console.log('2. Browser cleared storage on crash');
    console.log('3. Debug mode was not enabled (?tapko_debug=true)');
    console.log('4. Different domain/protocol (check you\'re on the same URL)');
    console.log('\n💡 SOLUTION: Add ?tapko_debug=true to URL BEFORE reproducing crash');
  } else {
    tapkoKeys.forEach(key => {
      const value = localStorage.getItem(key);
      console.log(`  ✓ ${key}: ${value ? value.substring(0, 50) + '...' : 'null'}`);
    });
  }

  // Try to get crash data from ALL sources
  let crashDetected = false;
  let activeOp = null;

  // Check simple flag first (most likely to survive)
  const simpleFlag = localStorage.getItem('tapko_operation_active');
  if (simpleFlag) {
    console.log('\n%c🚨 CRASH DETECTED via simple flag!', 'color: red; font-weight: bold; font-size: 14px');
    console.log('Operation:', simpleFlag);
    crashDetected = true;
    activeOp = { name: simpleFlag, source: 'simple_flag' };
  }

  // Check backups
  const backup1 = localStorage.getItem('tapko_debug_active_operation_backup1');
  const backup2 = localStorage.getItem('tapko_debug_active_operation_backup2');
  const main = localStorage.getItem('tapko_debug_active_operation');

  if (main && !activeOp) {
    try {
      activeOp = JSON.parse(main);
      activeOp.source = 'main';
      crashDetected = true;
      console.log('\n%c🚨 CRASH DETECTED via main storage!', 'color: red; font-weight: bold; font-size: 14px');
    } catch (e) {}
  }

  if (backup1 && !activeOp) {
    try {
      activeOp = JSON.parse(backup1);
      activeOp.source = 'backup1';
      crashDetected = true;
      console.log('\n%c🚨 CRASH DETECTED via backup1!', 'color: red; font-weight: bold; font-size: 14px');
    } catch (e) {}
  }

  if (backup2 && !activeOp) {
    try {
      activeOp = JSON.parse(backup2);
      activeOp.source = 'backup2';
      crashDetected = true;
      console.log('\n%c🚨 CRASH DETECTED via backup2!', 'color: red; font-weight: bold; font-size: 14px');
    } catch (e) {}
  }

  // Get logs
  let logs = [];
  try {
    const logsStr = localStorage.getItem('tapko_debug_logs');
    if (logsStr) {
      logs = JSON.parse(logsStr);
    }
  } catch (e) {
    console.error('Failed to parse logs:', e);
  }

  // Get system info
  let systemInfo = null;
  try {
    const sysStr = localStorage.getItem('tapko_debug_system_info');
    if (sysStr) {
      systemInfo = JSON.parse(sysStr);
    }
  } catch (e) {}

  // Compile report
  const report = {
    extractedAt: new Date().toISOString(),
    crashDetected,
    activeOperation: activeOp,
    systemInfo: systemInfo || {
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screen: `${screen.width}x${screen.height}`,
      dpr: window.devicePixelRatio
    },
    allTapkoKeys: tapkoKeys,
    logs: logs,
    lastLog: logs.length > 0 ? logs[logs.length - 1] : null
  };

  console.log('\n' + '='.repeat(70));
  console.log('CRASH REPORT');
  console.log('='.repeat(70));
  console.log('Crash Detected:', crashDetected ? '🚨 YES' : '✅ NO');

  if (crashDetected && activeOp) {
    console.log('%cCrashed Operation: ' + activeOp.name, 'color: red; font-weight: bold');
    console.log('Data Source:', activeOp.source);
    if (activeOp.timestamp) {
      console.log('Started:', new Date(activeOp.timestamp).toLocaleString());
    }
    if (activeOp.context) {
      console.log('Context:', activeOp.context);
    }
  }

  console.log('\nLogs found:', logs.length);

  if (logs.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('LAST 15 LOG ENTRIES');
    console.log('='.repeat(70));

    logs.slice(-15).forEach((log, idx) => {
      const color = log.level === 'ERROR' || log.level === 'CRITICAL' ? 'color: red; font-weight: bold' :
                    log.level === 'WARN' ? 'color: orange' :
                    log.level === 'INFO' ? 'color: green' : '';
      console.log(`%c${idx + 1}. [${log.level}] ${log.message}`, color);
      if (log.data) {
        console.log('   Data:', log.data);
      }
    });

    // Find incomplete operations
    const startOps = logs.filter(l => l.message && l.message.startsWith('START:'));
    const endOps = logs.filter(l => l.message && l.message.startsWith('END:'));

    if (startOps.length > endOps.length) {
      console.log('\n%c⚠️  INCOMPLETE OPERATIONS (CRASH POINTS):', 'color: red; font-weight: bold; font-size: 14px');
      const incomplete = startOps.slice(endOps.length);
      incomplete.forEach(op => {
        console.log('%c  🔴 ' + op.message, 'color: red; font-weight: bold');
        if (op.data) console.log('     Data:', op.data);
      });
    }

    // Find dimension logs
    const dimLogs = logs.filter(l => l.message &&
      (l.message.toLowerCase().includes('dimension') ||
       l.message.toLowerCase().includes('canvas') ||
       l.message.toLowerCase().includes('width') ||
       l.message.toLowerCase().includes('todataurl')));

    if (dimLogs.length > 0) {
      console.log('\n%c📐 DIMENSION/CANVAS LOGS:', 'font-weight: bold');
      dimLogs.slice(-10).forEach(log => {
        console.log(`  - ${log.message}`);
        if (log.data) console.log('    Data:', log.data);
      });
    }
  }

  // Download function
  window.downloadCrashReport = function() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tapko-crash-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('%c✅ Report downloaded!', 'color: green; font-weight: bold');
  };

  window.viewFullReport = function() {
    console.log(JSON.stringify(report, null, 2));
  };

  window.clearAllTapkoData = function() {
    if (confirm('Clear ALL Tapko data from localStorage?')) {
      tapkoKeys.forEach(key => localStorage.removeItem(key));
      console.log('%c✅ All Tapko data cleared!', 'color: green; font-weight: bold');
    }
  };

  console.log('\n' + '='.repeat(70));
  console.log('%cAVAILABLE FUNCTIONS:', 'font-weight: bold');
  console.log('='.repeat(70));
  console.log('  downloadCrashReport()  - Download full crash report as JSON');
  console.log('  viewFullReport()       - Print full report to console');
  console.log('  clearAllTapkoData()    - Clear all Tapko localStorage');

  if (crashDetected) {
    console.log('\n%c🚨 AUTO-DOWNLOADING CRASH REPORT...', 'color: red; font-weight: bold; font-size: 14px');
    setTimeout(() => downloadCrashReport(), 1000);
  } else if (tapkoKeys.length > 0) {
    console.log('\n%c💾 Tapko data found but no crash detected. Download anyway with:', 'color: blue');
    console.log('   downloadCrashReport()');
  }

  console.log('\n' + '='.repeat(70));

  return report;
})();
