# Crash Diagnosis Guide

## 🚨 For Full Browser Crashes

Since the **entire browser crashes** (not just the tab), we need a special approach to capture logs before the crash happens.

---

## 📋 Step-by-Step Process

### **STEP 1: Setup (Before Reproducing Crash)**

1. **Open your hosted site** where the crash occurs
2. **Open Browser DevTools** (F12 or Cmd+Option+I)
3. **Go to Console tab**
4. **Copy and paste** the contents of `pre-crash-setup.js` (or use the minified version below)
5. **Press Enter**
6. You should see: `✅ SETUP COMPLETE - READY TO REPRODUCE CRASH`

**Quick Setup (Minified):**
```javascript
(function(){localStorage.setItem("tapko_debug_mode","true");console.log("✅ Debug mode enabled");const o={timestamp:new Date().toISOString(),userAgent:navigator.userAgent,browser:/Chrome/.test(navigator.userAgent)?"Chrome":/Firefox/.test(navigator.userAgent)?"Firefox":/Safari/.test(navigator.userAgent)&&!/Chrome/.test(navigator.userAgent)?"Safari":"Unknown",os:/Mac/.test(navigator.userAgent)?"macOS":/Win/.test(navigator.userAgent)?"Windows":/Linux/.test(navigator.userAgent)?"Linux":"Unknown",viewport:`${window.innerWidth}x${window.innerHeight}`,screenResolution:`${window.screen.width}x${window.screen.height}`,devicePixelRatio:window.devicePixelRatio||1};localStorage.setItem("tapko_debug_system_info",JSON.stringify(o));localStorage.setItem("tapko_debug_logs",JSON.stringify([{timestamp:new Date().toISOString(),level:"INFO",message:"Pre-crash setup",data:o}]));localStorage.setItem("tapko_crash_test_active","true");console.log("✅ READY TO CRASH - Click annotation and grant permission");})();
```

---

### **STEP 2: Reproduce the Crash**

1. **Click on an annotation**
2. **Grant screenshot permission** when prompted
3. **Browser will crash** 💥

---

### **STEP 3: Extract Logs (After Browser Restarts)**

1. **Reopen the same URL** (same domain/protocol!)
2. **Open DevTools Console** immediately
3. **Copy and paste** the contents of `extract-crash-logs-v2.js`
4. **Press Enter**

The script will:
- Search for crash data in localStorage
- Display crash summary in console
- **Auto-download** crash report JSON if crash detected

**Quick Extract (Minified):**
```javascript
(function(){console.log("TAPKO CRASH EXTRACTOR V2");const e=Object.keys(localStorage).filter(e=>e.startsWith("tapko"));console.log("Tapko keys found:",e.length);if(0===e.length)return console.log("⚠️ NO DATA! Possible reasons:\n1. Different URL\n2. Browser cleared storage\n3. Debug mode not enabled"),null;let t=!1,a=null;const o=localStorage.getItem("tapko_operation_active");o&&(console.log("🚨 CRASH via flag:",o),t=!0,a={name:o,source:"flag"});const r=localStorage.getItem("tapko_debug_active_operation");if(r&&!a)try{a=JSON.parse(r),a.source="main",t=!0,console.log("🚨 CRASH via main:",a.name)}catch(e){}const n=localStorage.getItem("tapko_debug_active_operation_backup1");if(n&&!a)try{a=JSON.parse(n),a.source="backup1",t=!0,console.log("🚨 CRASH via backup1:",a.name)}catch(e){}let s=[];try{const e=localStorage.getItem("tapko_debug_logs");e&&(s=JSON.parse(e))}catch(e){}const c={crashDetected:t,activeOperation:a,logs:s,allKeys:e,lastLog:s[s.length-1]};console.log("Crash:",t?"🚨 YES":"NO"),t&&a&&console.log("Operation:",a.name),console.log("Logs:",s.length),s.length>0&&(console.log("\nLAST 10 LOGS:"),s.slice(-10).forEach((e,t)=>{console.log(`${t+1}. [${e.level}] ${e.message}`),e.data&&console.log("   ",e.data)}));const l=s.filter(e=>e.message&&e.message.startsWith("START:")),i=s.filter(e=>e.message&&e.message.startsWith("END:"));l.length>i.length&&(console.log("\n⚠️ INCOMPLETE:"),l.slice(i.length).forEach(e=>{console.log("🔴",e.message),e.data&&console.log("  ",e.data)})),window.downloadCrashReport=function(){const e=new Blob([JSON.stringify(c,null,2)],{type:"application/json"}),t=URL.createObjectURL(e),a=document.createElement("a");a.href=t,a.download=`crash-${Date.now()}.json`,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(t),console.log("✅ Downloaded!")},t&&(console.log("\n🚨 AUTO-DOWNLOADING..."),setTimeout(()=>downloadCrashReport(),500));})();
```

---

## 🎯 What to Look For

After running the extraction script, check for:

1. **🚨 Crash Detection** - Did it find an active operation?
2. **📝 Last Logs** - What was the last thing logged?
3. **⚠️ Incomplete Operations** - Operations that started but never finished
4. **📐 Dimensions** - Screenshot size before crash

### Expected Output Example:

```
TAPKO CRASH EXTRACTOR V2
Tapko keys found: 5
🚨 CRASH via flag: Resize screenshot for annotation
Crash: 🚨 YES
Operation: Resize screenshot for annotation
Logs: 47

LAST 10 LOGS:
1. [INFO] Screenshot loaded for resize
    { width: 3840, height: 2160, totalPixels: 8294400 }
2. [INFO] START: Canvas creation
    { width: 3840, height: 2160 }
3. [CRITICAL] START: Convert to dataURL - THIS IS THE CRASH POINT

⚠️ INCOMPLETE:
🔴 START: Convert to dataURL
    { width: 3840, height: 2160 }

🚨 AUTO-DOWNLOADING...
```

---

## 🔍 Alternative: Manual localStorage Check

If scripts don't work, check localStorage manually:

```javascript
// Check for crash flag
localStorage.getItem('tapko_operation_active')

// Check for logs
JSON.parse(localStorage.getItem('tapko_debug_logs'))

// Check system info
JSON.parse(localStorage.getItem('tapko_debug_system_info'))

// List all Tapko keys
Object.keys(localStorage).filter(k => k.startsWith('tapko'))
```

---

## ⚠️ Important Notes

1. **Same URL Required**: Logs are stored per-origin. Must be same domain/protocol.
2. **Browser May Clear Storage**: Some browsers clear localStorage on crash. This is why we use multiple backups.
3. **Timing Matters**: Extract logs IMMEDIATELY after restart before doing anything else.
4. **Debug Mode**: Make sure `?tapko_debug=true` is in URL or run pre-crash setup.

---

## 📊 Interpreting Results

### If Crash Detected:
- ✅ Download the JSON file
- Look at `activeOperation.name` - this is what was running
- Check `logs` for the last completed operations
- Look for incomplete START operations without matching END

### If No Crash Detected:
- Debug mode might not be enabled
- Wrong URL (different domain/protocol)
- Browser cleared localStorage
- Run `pre-crash-setup.js` BEFORE reproducing crash

---

## 🛠️ Troubleshooting

### "NO DATA FOUND"
- Did you run `pre-crash-setup.js` first?
- Are you on the exact same URL (including https vs http)?
- Try adding `?tapko_debug=true` to URL manually

### "No crash detected but I know it crashed"
- The crash happened too fast for logs to persist
- Try running setup script and crash multiple times
- Check if any `tapko_*` keys exist in localStorage at all

### "Browser clears localStorage on crash"
- This is a browser safety feature
- Our multi-write strategy helps, but not foolproof
- Consider testing in a different browser

---

## 📁 Files Reference

- `pre-crash-setup.js` - Run BEFORE crash
- `extract-crash-logs-v2.js` - Run AFTER crash
- `CRASH-DIAGNOSIS-GUIDE.md` - This file

---

## 💡 Quick Command Summary

```javascript
// BEFORE CRASH:
// (paste pre-crash-setup.js)

// AFTER CRASH:
// (paste extract-crash-logs-v2.js)

// MANUAL CHECK:
localStorage.getItem('tapko_operation_active')
```

---

Good luck! Once you get the crash logs, we can identify the exact crash point and create a permanent fix. 🎯
