# Fixes Applied to Queue System

## Fix #1: Namespace Bug
**Issue:** Queue system wasn't being used because code referenced wrong namespace.

**Root Cause:** Code used `window.tapkoWidget` instead of `window.Tapko`

**Files Fixed:**
- `src/components/CommentCard.js` (3 locations)
- `src/components/SyncStatusIndicator.js` (all onclick handlers)
- `src/components/QueueViewerModal.js` (all onclick handlers)

**Fix:**
```javascript
// BEFORE
window.tapkoWidget.queueManager.enqueue()

// AFTER
window.Tapko.queueManager.enqueue()
```

---

## Fix #2: Presigned URL API Parameters
**Issue:** No request payload sent to presigned URL API

**Root Cause:** Queue system called `getPresignedUrl()` with wrong parameters:
- Sent: `{ fileType, assetType }`
- Expected: `{ folderName, fileName, fileType }`

**File Fixed:**
- `src/managers/FeedbackQueueManager.js` (uploadAsset method, lines 456-481)

**Fix:**
```javascript
// BEFORE
async uploadAsset(blob, mimeType, type) {
  const presignedData = await this.apiClient.getPresignedUrl({
    fileType: mimeType,
    assetType: type  // ❌ Wrong parameter
  });
  // ...
}

// AFTER
async uploadAsset(blob, mimeType, type) {
  // Generate proper file name
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'txt';
  const fileName = `${timestamp}-${random}.${extension}`;

  // Determine folder
  const folderName = type === 'screenshot' ? 'screenshots' : 'logs';

  // Call with correct parameters
  const presignedData = await this.apiClient.getPresignedUrl({
    folderName: folderName,  // ✅ Required
    fileName: fileName,       // ✅ Required
    fileType: mimeType       // ✅ Required
  });

  // Access nested data object
  await this.apiClient.uploadToS3(presignedData.data.uploadUrl, blob, mimeType);

  return {
    url: presignedData.data.url,    // ✅ Access via .data
    key: presignedData.data.key,    // ✅ Access via .data
    bucket: presignedData.data.bucket
  };
}
```

**Additional Fix:** Also corrected response structure access - API returns `presignedData.data.uploadUrl` not `presignedData.uploadUrl`

---

## Build Status
✅ **Both fixes applied and rebuilt successfully**
- File: dist/tapko-widget-v2.js
- Size: 174.91 KB
- Errors: 0
- Warnings: 0

---

## Testing
The queue system should now:
1. ✅ Be detected and initialized (namespace fixed)
2. ✅ Successfully upload assets to S3 (API params fixed)
3. ✅ Complete full queued submission flow

**Test:** Open examples/index.html and submit feedback - should see:
- "Feedback queued for sync!" message
- Sync indicator showing progress
- Successful upload and submission in console logs
