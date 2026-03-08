# Quick Copy-Paste Scripts for Browser Crash Diagnosis

## 🟢 STEP 1: Run THIS Before Crash

Open console BEFORE clicking annotation, paste this, press Enter:

```javascript
(function(){localStorage.setItem("tapko_debug_mode","true");["tapko_debug_logs","tapko_debug_active_operation","tapko_debug_active_operation_backup1","tapko_debug_active_operation_backup2","tapko_operation_active","tapko_debug_system_info"].forEach(e=>localStorage.removeItem(e));const e={timestamp:new Date().toISOString(),userAgent:navigator.userAgent,browser:/Chrome/.test(navigator.userAgent)?"Chrome":/Firefox/.test(navigator.userAgent)?"Firefox":/Safari/.test(navigator.userAgent)&&!/Chrome/.test(navigator.userAgent)?"Safari":"Unknown",os:/Mac/.test(navigator.userAgent)?"macOS":/Win/.test(navigator.userAgent)?"Windows":/Linux/.test(navigator.userAgent)?"Linux":"Unknown",viewport:`${window.innerWidth}x${window.innerHeight}`,screenResolution:`${window.screen.width}x${window.screen.height}`,devicePixelRatio:window.devicePixelRatio||1,colorDepth:window.screen.colorDepth,hardwareConcurrency:navigator.hardwareConcurrency||"unknown",language:navigator.language,memory:window.performance&&window.performance.memory?{jsHeapSizeLimit:window.performance.memory.jsHeapSizeLimit,totalJSHeapSize:window.performance.memory.totalJSHeapSize,usedJSHeapSize:window.performance.memory.usedJSHeapSize}:null};localStorage.setItem("tapko_debug_system_info",JSON.stringify(e)),localStorage.setItem("tapko_debug_logs",JSON.stringify([{timestamp:new Date().toISOString(),time:performance.now().toFixed(3),level:"INFO",message:"Pre-crash setup completed",data:{browser:e.browser,os:e.os,viewport:e.viewport,dpr:e.devicePixelRatio}}])),localStorage.setItem("tapko_crash_test_active","true"),localStorage.setItem("tapko_crash_test_started",new Date().toISOString()),console.log("%c✅ SETUP COMPLETE - READY TO REPRODUCE CRASH","color: #4CAF50; font-weight: bold; font-size: 16px"),console.log("\n📋 NEXT: Click annotation → Grant permission → Browser crashes"),console.log("📋 AFTER CRASH: Run the extraction script"),console.log("\n📊 System: "+e.browser+" on "+e.os),console.log("📐 Viewport: "+e.viewport+" (DPR: "+e.devicePixelRatio+")"),window.checkTapkoDebugStatus=function(){console.log("Debug mode:",localStorage.getItem("tapko_debug_mode")),console.log("Active operation:",localStorage.getItem("tapko_operation_active")||"none")}})();
```

You should see: **✅ SETUP COMPLETE - READY TO REPRODUCE CRASH**

Now reproduce the crash (click annotation, grant permission).

---

## 🔴 STEP 2: Run THIS After Crash

After browser restarts, open console on the SAME URL, paste this, press Enter:

```javascript
(function(){console.log("%c=".repeat(70),"font-weight: bold; color: #ff6b6b"),console.log("%cTAPKO CRASH EXTRACTOR V2","font-weight: bold; font-size: 16px; color: #ff6b6b"),console.log("%c=".repeat(70),"font-weight: bold; color: #ff6b6b");const e=Object.keys(localStorage).filter((e=>e.startsWith("tapko")));if(console.log("\n📦 Tapko keys found:",e.length),0===e.length)return console.log("%c⚠️  NO TAPKO DATA FOUND!","color: orange; font-weight: bold; font-size: 14px"),console.log("\nPossible reasons:"),console.log("1. Browser crashed before localStorage could write"),console.log("2. Different domain/protocol"),console.log("3. Debug mode not enabled"),console.log("\n💡 SOLUTION: Run pre-crash setup script BEFORE reproducing crash"),void e.forEach((e=>{const o=localStorage.getItem(e);console.log(`  ${e}: ${o?o.substring(0,50)+"...":"null"}`)}));let o=!1,t=null;const a=localStorage.getItem("tapko_operation_active");a&&(console.log("\n%c🚨 CRASH DETECTED via simple flag!","color: red; font-weight: bold; font-size: 14px"),console.log("Operation:",a),o=!0,t={name:a,source:"simple_flag"});const n=localStorage.getItem("tapko_debug_active_operation_backup1"),r=localStorage.getItem("tapko_debug_active_operation_backup2"),s=localStorage.getItem("tapko_debug_active_operation");if(s&&!t)try{t=JSON.parse(s),t.source="main",o=!0,console.log("\n%c🚨 CRASH DETECTED via main storage!","color: red; font-weight: bold; font-size: 14px")}catch(e){}if(n&&!t)try{t=JSON.parse(n),t.source="backup1",o=!0,console.log("\n%c🚨 CRASH DETECTED via backup1!","color: red; font-weight: bold; font-size: 14px")}catch(e){}if(r&&!t)try{t=JSON.parse(r),t.source="backup2",o=!0,console.log("\n%c🚨 CRASH DETECTED via backup2!","color: red; font-weight: bold; font-size: 14px")}catch(e){}let c=[];try{const e=localStorage.getItem("tapko_debug_logs");e&&(c=JSON.parse(e))}catch(e){console.error("Failed to parse logs:",e)}let l=null;try{const e=localStorage.getItem("tapko_debug_system_info");e&&(l=JSON.parse(e))}catch(e){}const g={extractedAt:(new Date).toISOString(),crashDetected:o,activeOperation:t,systemInfo:l||{userAgent:navigator.userAgent,viewport:`${window.innerWidth}x${window.innerHeight}`,screen:`${screen.width}x${screen.height}`,dpr:window.devicePixelRatio},allTapkoKeys:e,logs:c,lastLog:c.length>0?c[c.length-1]:null};console.log("\n"+"=".repeat(70)),console.log("CRASH REPORT"),console.log("=".repeat(70)),console.log("Crash Detected:",o?"🚨 YES":"✅ NO"),o&&t&&(console.log("%cCrashed Operation: "+t.name,"color: red; font-weight: bold"),console.log("Data Source:",t.source),t.timestamp&&console.log("Started:",new Date(t.timestamp).toLocaleString()),t.context&&console.log("Context:",t.context)),console.log("\nLogs found:",c.length),c.length>0&&(console.log("\n"+"=".repeat(70)),console.log("LAST 15 LOG ENTRIES"),console.log("=".repeat(70)),c.slice(-15).forEach(((e,o)=>{const t="ERROR"===e.level||"CRITICAL"===e.level?"color: red; font-weight: bold":"WARN"===e.level?"color: orange":"INFO"===e.level?"color: green":"";console.log(`%c${o+1}. [${e.level}] ${e.message}`,t),e.data&&console.log("   Data:",e.data)})));const i=c.filter((e=>e.message&&e.message.startsWith("START:"))),d=c.filter((e=>e.message&&e.message.startsWith("END:")));if(i.length>d.length){console.log("\n%c⚠️  INCOMPLETE OPERATIONS (CRASH POINTS):","color: red; font-weight: bold; font-size: 14px");i.slice(d.length).forEach((e=>{console.log("%c  🔴 "+e.message,"color: red; font-weight: bold"),e.data&&console.log("     Data:",e.data)}))}const m=c.filter((e=>e.message&&(e.message.toLowerCase().includes("dimension")||e.message.toLowerCase().includes("canvas")||e.message.toLowerCase().includes("width")||e.message.toLowerCase().includes("todataurl"))));m.length>0&&(console.log("\n%c📐 DIMENSION/CANVAS LOGS:","font-weight: bold"),m.slice(-10).forEach((e=>{console.log(`  - ${e.message}`),e.data&&console.log("    Data:",e.data)}))),window.downloadCrashReport=function(){const e=new Blob([JSON.stringify(g,null,2)],{type:"application/json"}),o=URL.createObjectURL(e),t=document.createElement("a");t.href=o,t.download=`tapko-crash-${Date.now()}.json`,document.body.appendChild(t),t.click(),document.body.removeChild(t),URL.revokeObjectURL(o),console.log("%c✅ Report downloaded!","color: green; font-weight: bold")},window.viewFullReport=function(){console.log(JSON.stringify(g,null,2))},window.clearAllTapkoData=function(){confirm("Clear ALL Tapko data from localStorage?")&&(e.forEach((e=>localStorage.removeItem(e))),console.log("%c✅ All Tapko data cleared!","color: green; font-weight: bold"))},console.log("\n"+"=".repeat(70)),console.log("%cAVAILABLE FUNCTIONS:","font-weight: bold"),console.log("=".repeat(70)),console.log("  downloadCrashReport()  - Download full crash report as JSON"),console.log("  viewFullReport()       - Print full report to console"),console.log("  clearAllTapkoData()    - Clear all Tapko localStorage"),o?(console.log("\n%c🚨 AUTO-DOWNLOADING CRASH REPORT...","color: red; font-weight: bold; font-size: 14px"),setTimeout((()=>downloadCrashReport()),1e3)):e.length>0&&(console.log("\n%c💾 Tapko data found but no crash detected.","color: blue"),console.log("Download anyway with: downloadCrashReport()")),console.log("\n"+"=".repeat(70))})();
```

The script will automatically download crash report if crash is detected!

---

## 📋 Quick Manual Check

If scripts don't work, paste this to manually check:

```javascript
console.log("Crash flag:", localStorage.getItem('tapko_operation_active'));
console.log("All Tapko keys:", Object.keys(localStorage).filter(k => k.startsWith('tapko')));
```

---

## 🎯 What You'll See

### ✅ Success:
```
🚨 CRASH DETECTED via simple flag!
Operation: Resize screenshot for annotation

INCOMPLETE OPERATIONS:
🔴 START: Convert to dataURL
  Data: { width: 3840, height: 2160 }

🚨 AUTO-DOWNLOADING CRASH REPORT...
✅ Report downloaded!
```

### ❌ No Data:
```
⚠️  NO TAPKO DATA FOUND!

Possible reasons:
1. Browser crashed before localStorage could write
2. Different domain/protocol
3. Debug mode not enabled
```

**Solution:** Run STEP 1 script again, then reproduce crash.

---

## 🆘 Still Not Working?

Try this ultra-simple check:

```javascript
// Run this BEFORE crash
localStorage.setItem('tapko_test', 'working');

// After crash, run this
localStorage.getItem('tapko_test'); // Should return 'working'
```

If this returns `null`, your browser is clearing localStorage on crash. This is a browser safety feature and makes diagnosis very difficult.

---

## 📊 Next Steps

Once you get the crash report JSON:
1. Open the downloaded file
2. Look at `activeOperation.name` - what was running when it crashed
3. Check `logs` array - last operations before crash
4. Share the JSON file for analysis

The report will show us:
- Exact operation that crashed
- Screenshot dimensions
- Memory usage
- System information
- Complete operation sequence

This is everything we need to create a permanent fix! 🎯
