/**
 * PRE-CRASH SETUP SCRIPT
 *
 * RUN THIS BEFORE REPRODUCING THE CRASH!
 *
 * This script:
 * 1. Enables debug mode
 * 2. Sets up aggressive logging
 * 3. Creates safety markers
 * 4. Prepares for crash detection
 *
 * HOW TO USE:
 * 1. Open browser console BEFORE clicking annotation
 * 2. Paste this entire script and press Enter
 * 3. You'll see "✅ READY TO CRASH" message
 * 4. Now reproduce the crash (click annotation, grant permission)
 * 5. After browser crashes and restarts, run extract-crash-logs-v2.js
 */

(function() {
  console.log('%c' + '='.repeat(70), 'font-weight: bold; color: #4CAF50');
  console.log('%cTAPKO PRE-CRASH SETUP', 'font-weight: bold; font-size: 18px; color: #4CAF50');
  console.log('%c' + '='.repeat(70), 'font-weight: bold; color: #4CAF50');

  // 1. Enable debug mode
  localStorage.setItem('tapko_debug_mode', 'true');
  console.log('✓ Debug mode enabled');

  // 2. Clear old data
  const oldKeys = ['tapko_debug_logs', 'tapko_debug_active_operation',
                   'tapko_debug_active_operation_backup1',
                   'tapko_debug_active_operation_backup2',
                   'tapko_operation_active', 'tapko_debug_system_info'];

  oldKeys.forEach(key => localStorage.removeItem(key));
  console.log('✓ Old debug data cleared');

  // 3. Set initial system info
  const systemInfo = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    browser: /Chrome/.test(navigator.userAgent) ? 'Chrome' :
             /Firefox/.test(navigator.userAgent) ? 'Firefox' :
             /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'Safari' :
             'Unknown',
    os: /Mac/.test(navigator.userAgent) ? 'macOS' :
        /Win/.test(navigator.userAgent) ? 'Windows' :
        /Linux/.test(navigator.userAgent) ? 'Linux' : 'Unknown',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio || 1,
    colorDepth: window.screen.colorDepth,
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    language: navigator.language,
    memory: window.performance && window.performance.memory ? {
      jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit,
      totalJSHeapSize: window.performance.memory.totalJSHeapSize,
      usedJSHeapSize: window.performance.memory.usedJSHeapSize
    } : null
  };

  localStorage.setItem('tapko_debug_system_info', JSON.stringify(systemInfo));
  console.log('✓ System info saved');

  // 4. Create initial log entries
  const initialLogs = [
    {
      timestamp: new Date().toISOString(),
      time: performance.now().toFixed(3),
      level: 'INFO',
      message: 'Pre-crash setup completed',
      data: {
        setupTime: new Date().toLocaleString(),
        browser: systemInfo.browser,
        os: systemInfo.os,
        viewport: systemInfo.viewport,
        dpr: systemInfo.devicePixelRatio
      }
    }
  ];

  localStorage.setItem('tapko_debug_logs', JSON.stringify(initialLogs));
  console.log('✓ Initial logs created');

  // 5. Set a marker that we're about to test
  localStorage.setItem('tapko_crash_test_active', 'true');
  localStorage.setItem('tapko_crash_test_started', new Date().toISOString());

  // 6. Display system info
  console.log('\n📊 SYSTEM INFORMATION:');
  console.log('  Browser:', systemInfo.browser);
  console.log('  OS:', systemInfo.os);
  console.log('  Viewport:', systemInfo.viewport);
  console.log('  Screen:', systemInfo.screenResolution);
  console.log('  Device Pixel Ratio:', systemInfo.devicePixelRatio);
  console.log('  Color Depth:', systemInfo.colorDepth + '-bit');
  console.log('  CPU Cores:', systemInfo.hardwareConcurrency);

  if (systemInfo.memory) {
    const formatBytes = (bytes) => {
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    console.log('\n💾 MEMORY (Chrome only):');
    console.log('  Heap Limit:', formatBytes(systemInfo.memory.jsHeapSizeLimit));
    console.log('  Heap Used:', formatBytes(systemInfo.memory.usedJSHeapSize));
    console.log('  Usage:', ((systemInfo.memory.usedJSHeapSize / systemInfo.memory.jsHeapSizeLimit) * 100).toFixed(2) + '%');
  }

  // 7. Add URL parameter helper
  const currentUrl = new URL(window.location.href);
  const hasDebugParam = currentUrl.searchParams.get('tapko_debug') === 'true';

  if (!hasDebugParam) {
    currentUrl.searchParams.set('tapko_debug', 'true');
    console.log('\n⚠️  URL PARAMETER MISSING!');
    console.log('For best results, reload with:');
    console.log('%c' + currentUrl.toString(), 'background: #ffffcc; padding: 5px; color: #000');
    console.log('\nOr copy this command:');
    console.log('%clocation.href = "' + currentUrl.toString() + '"', 'background: #e3f2fd; padding: 5px; font-family: monospace');
  } else {
    console.log('\n✓ URL parameter already set');
  }

  // 8. Verify localStorage is working
  try {
    const testKey = 'tapko_test_' + Date.now();
    localStorage.setItem(testKey, 'test');
    const testValue = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);

    if (testValue === 'test') {
      console.log('\n✓ LocalStorage is working correctly');
    } else {
      console.log('\n⚠️  LocalStorage may not be persisting!');
    }
  } catch (e) {
    console.error('\n❌ LocalStorage is NOT working:', e);
  }

  // 9. Check if widget is loaded
  if (window.Tapko) {
    console.log('\n✓ Tapko widget detected');

    // Try to enable debug mode on widget if it has the method
    if (window.Tapko._internal && window.Tapko._internal.debugLogger) {
      window.Tapko._internal.debugLogger.enableDebugMode();
      console.log('✓ Enabled debug mode on widget instance');
    }
  } else {
    console.log('\n⚠️  Tapko widget not detected yet');
  }

  console.log('\n' + '='.repeat(70));
  console.log('%c✅ SETUP COMPLETE - READY TO REPRODUCE CRASH', 'color: #4CAF50; font-weight: bold; font-size: 16px');
  console.log('%c' + '='.repeat(70), 'font-weight: bold; color: #4CAF50');

  console.log('\n📋 NEXT STEPS:');
  console.log('1. Click on an annotation');
  console.log('2. Grant screenshot permission when prompted');
  console.log('3. Browser will crash');
  console.log('4. After restart, open console and run extract-crash-logs-v2.js');

  console.log('\n💡 TIP: Keep this console tab open (if possible) to see logs before crash');

  // Return function to check status
  window.checkTapkoDebugStatus = function() {
    console.log('\nDEBUG STATUS:');
    console.log('  Debug mode:', localStorage.getItem('tapko_debug_mode'));
    console.log('  System info:', !!localStorage.getItem('tapko_debug_system_info'));
    console.log('  Logs:', !!localStorage.getItem('tapko_debug_logs'));
    console.log('  Active op:', localStorage.getItem('tapko_operation_active') || 'none');
    console.log('  Test active:', localStorage.getItem('tapko_crash_test_active'));
  };

  console.log('\n🔍 To check status anytime: checkTapkoDebugStatus()');

})();
