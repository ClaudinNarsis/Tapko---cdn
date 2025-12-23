# Tapko Widget - Robust Queued Feedback System Plan

## Executive Summary

This plan transforms the Tapko feedback widget from synchronous (8-second blocking) submission to an **asynchronous queue-based system** with robust offline support, background sync, and comprehensive user feedback. Users can submit feedback instantly and continue browsing while the system handles uploads in the background.

---

## Current System Analysis

### Pain Points
- **8-second submission time** blocks user interaction
- **No offline support** - failed submissions are lost
- **No persistence** - page refresh loses pending submissions
- **Poor UX** - users must wait for S3 uploads to complete

### Current Flow
```
User clicks Submit
  → Validate input
  → Capture screenshot (if needed)
  → Upload screenshot to S3 (parallel)
  → Upload logs to S3 (parallel)
  → Submit feedback payload to API
  → Show success (8+ seconds total)
```

---

## Proposed System Architecture

### High-Level Flow
```
User clicks Submit
  → Validate input
  → Add to IndexedDB queue (instant)
  → Show "Queued for sync" confirmation
  → Close card immediately
  → Background: Process queue one by one
  → Show sync status indicator
  → User can continue using widget/browsing
```

---

## Core Components

### 1. **FeedbackQueue Manager** (`src/managers/FeedbackQueueManager.js`)

**Responsibilities:**
- Manage IndexedDB for persistent storage
- Queue CRUD operations (add, get, update, delete)
- Track queue state (pending, processing, failed, completed)
- Handle retry logic with exponential backoff
- Emit events for UI synchronization

**Data Structure:**
```javascript
{
  id: string,                    // UUID
  status: 'pending' | 'processing' | 'failed' | 'completed',
  attempts: number,              // Retry counter
  createdAt: timestamp,
  lastAttemptAt: timestamp,
  error: string | null,

  // Original feedback data
  feedbackData: {
    title: string,
    description: string,
    screenshot: Blob,            // Store blob in IndexedDB
    logs: Blob,
    context: {...},
    idempotencyKey: string,
    projectId: string,
    userId: string
  },

  // Upload tracking
  uploadProgress: {
    screenshot: {
      status: 'pending' | 'uploading' | 'completed' | 'failed',
      url: string | null,
      key: string | null,
      bucket: string | null
    },
    logs: {
      status: 'pending' | 'uploading' | 'completed' | 'failed',
      url: string | null,
      key: string | null,
      bucket: string | null
    },
    feedback: {
      status: 'pending' | 'submitting' | 'completed' | 'failed'
    }
  }
}
```

**Key Methods:**
```javascript
class FeedbackQueueManager {
  // Queue operations
  async enqueue(feedbackData)
  async dequeue()
  async getAll()
  async getById(id)
  async updateStatus(id, status, error = null)
  async remove(id)
  async clearCompleted()

  // Processing
  async processQueue()
  async processSingleItem(item)
  async retryFailed()

  // State
  getQueueStats() // { pending, processing, failed, completed }
  isProcessing()
  hasPendingItems()

  // Events
  on('queue:added', callback)
  on('queue:processing', callback)
  on('queue:progress', callback)
  on('queue:completed', callback)
  on('queue:failed', callback)
  on('queue:empty', callback)
}
```

**IndexedDB Schema:**
- Database: `TapkoFeedbackQueue`
- Store: `feedbacks`
- Indexes: `status`, `createdAt`, `projectId`

---

### 2. **Sync Status Indicator** (`src/components/SyncStatusIndicator.js`)

**Visual Design:**
```
┌─────────────────────────────┐
│  🔄 Syncing feedback (2/5)  │  ← Compact banner at top/bottom
└─────────────────────────────┘

or

┌──────────────────────────────────────┐
│  ⚠️  3 feedback items failed to sync │  ← Error state
│     [Retry Now] [View Details]       │
└──────────────────────────────────────┘
```

**States:**
1. **Idle** - No pending items, hidden
2. **Syncing** - Shows progress (X/Y items)
3. **Failed** - Shows error with retry option
4. **Completing** - "Almost done..." transitional state
5. **Warning** - "Sync in progress, don't close tab"

**Positioning:**
- Non-intrusive: Top-right corner or bottom banner
- Always visible when syncing
- Dismissible when completed/failed
- Auto-hide after 5 seconds on success

**Features:**
- Real-time progress updates
- Click to expand details (queue viewer)
- Manual retry button
- Cancel sync option (with confirmation)

---

### 3. **Queue Viewer Modal** (`src/components/QueueViewerModal.js`)

**Purpose:** Advanced view for debugging and manual management

**Features:**
- List all queued items (pending, failed, completed)
- Show detailed status for each item
- Manual retry for individual items
- Clear completed items
- Export queue state (for debugging)

**UI Structure:**
```
┌─────────────────────────────────────────────┐
│  Feedback Queue (5 items)         [X Close] │
├─────────────────────────────────────────────┤
│                                             │
│  ✓ "Login button broken" - Completed       │
│  🔄 "Payment flow issue" - Syncing...       │
│  ⏳ "UI glitch on mobile" - Pending         │
│  ⚠️ "Crash on checkout" - Failed (2 tries) │
│     [Retry] [Remove]                        │
│  ⏳ "Performance issue" - Pending           │
│                                             │
├─────────────────────────────────────────────┤
│  [Clear Completed] [Retry All Failed]       │
└─────────────────────────────────────────────┘
```

---

### 4. **Page Visibility & Lifecycle Handling** (`src/managers/SyncLifecycleManager.js`)

**Responsibilities:**
- Monitor page visibility changes
- Warn user before closing with pending items
- Attempt to complete sync before tab close
- Handle browser backgrounding/foregrounding

**Implementation:**

```javascript
class SyncLifecycleManager {
  constructor(queueManager) {
    this.queueManager = queueManager;
    this.setupListeners();
  }

  setupListeners() {
    // Page Visibility API
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handlePageHidden();
      } else {
        this.handlePageVisible();
      }
    });

    // Beforeunload warning
    window.addEventListener('beforeunload', (e) => {
      if (this.queueManager.hasPendingItems()) {
        e.preventDefault();
        e.returnValue = 'Feedback is still syncing. Close anyway?';
        return e.returnValue;
      }
    });

    // Unload - final attempt
    window.addEventListener('unload', () => {
      this.handlePageUnload();
    });
  }

  handlePageHidden() {
    // Pause queue processing (save battery/bandwidth)
    // Or continue with lower priority
  }

  handlePageVisible() {
    // Resume queue processing
    this.queueManager.processQueue();
  }

  handlePageUnload() {
    // Use sendBeacon for final analytics ping
    if (navigator.sendBeacon) {
      const stats = this.queueManager.getQueueStats();
      navigator.sendBeacon('/api/analytics/queue-state', JSON.stringify(stats));
    }
  }
}
```

**Beforeunload Warning:**
```
┌──────────────────────────────────────┐
│  Leave site?                         │
│                                      │
│  Feedback is still syncing (3 items) │
│  Your feedback may be lost if you    │
│  leave now.                          │
│                                      │
│  [Stay] [Leave Anyway]               │
└──────────────────────────────────────┘
```

---

### 5. **Modified CommentCard Submission** (Update `src/components/CommentCard.js`)

**New Submit Flow:**

```javascript
async submit() {
  console.log('[Tapko] Starting queued submission flow...');

  try {
    // 1. Validate input (same as before)
    if (!this.validateInput()) {
      return;
    }

    // 2. Capture screenshot if needed (same as before)
    const screenshot = await this.captureScreenshot();

    // 3. Prepare logs blob
    const logsBlob = this.prepareLogsBlob();

    // 4. Build feedback data object
    const feedbackData = {
      title: this.generateTitle(),
      description: this.sanitizeDescription(),
      screenshot: screenshot,
      logs: logsBlob,
      context: this.buildContext(),
      idempotencyKey: this.generateIdempotencyKey(),
      projectId: this.config.projectId,
      userId: this.getUserId()
    };

    // 5. Add to queue (instant)
    const queueId = await window.tapkoWidget.queueManager.enqueue(feedbackData);
    console.log('[Tapko] Feedback queued:', queueId);

    // 6. Show "queued" success state
    this.showQueuedConfirmation();

    // 7. Dispatch event
    this.dispatchEvent('tapko:comment:queued', { queueId });

    // 8. Close card immediately
    setTimeout(() => {
      this.remove();
    }, 1500); // Brief confirmation display

    // 9. Trigger queue processing (async, non-blocking)
    window.tapkoWidget.queueManager.processQueue();

  } catch (error) {
    console.error('[Tapko] Error queuing feedback:', error);
    this.showError('Failed to queue feedback. Please try again.');
  }
}

showQueuedConfirmation() {
  this.querySelector('.submit-button').innerHTML = `
    <svg class="checkmark">...</svg>
    Queued for sync
  `;
  this.querySelector('.submit-button').classList.add('queued');
}
```

**Key Changes:**
- Submit no longer awaits API calls
- Feedback stored in IndexedDB with screenshot/logs as blobs
- User sees instant "queued" confirmation
- Card closes after 1.5s (not 8s)
- Background processing starts automatically

---

### 6. **Network Status Monitoring** (`src/managers/NetworkStatusManager.js`)

**Purpose:** Intelligently handle offline/online transitions

```javascript
class NetworkStatusManager {
  constructor(queueManager) {
    this.queueManager = queueManager;
    this.isOnline = navigator.onLine;
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('online', () => {
      console.log('[Tapko] Network connection restored');
      this.isOnline = true;
      this.handleOnline();
    });

    window.addEventListener('offline', () => {
      console.log('[Tapko] Network connection lost');
      this.isOnline = false;
      this.handleOffline();
    });
  }

  handleOnline() {
    // Resume queue processing
    this.queueManager.processQueue();

    // Show toast: "Connection restored, syncing feedback..."
    this.showNotification('Connection restored', 'info');
  }

  handleOffline() {
    // Pause queue processing
    this.queueManager.pauseProcessing();

    // Show toast: "Offline - feedback will sync when online"
    this.showNotification('Offline mode - feedback saved locally', 'warning');
  }

  checkConnection() {
    return this.isOnline;
  }
}
```

---

## Queue Processing Algorithm

### Single Item Processing Flow

```javascript
async processSingleItem(item) {
  console.log(`[Queue] Processing item ${item.id}...`);

  // Update status to processing
  await this.updateStatus(item.id, 'processing');
  this.emit('queue:processing', item);

  try {
    // Step 1: Upload screenshot to S3
    if (item.uploadProgress.screenshot.status !== 'completed') {
      const screenshotResult = await this.uploadAsset(
        item.feedbackData.screenshot,
        'image/jpeg',
        'screenshot'
      );

      item.uploadProgress.screenshot = {
        status: 'completed',
        url: screenshotResult.url,
        key: screenshotResult.key,
        bucket: screenshotResult.bucket
      };

      await this.updateItem(item.id, item);
      this.emit('queue:progress', { id: item.id, step: 'screenshot-uploaded' });
    }

    // Step 2: Upload logs to S3
    if (item.uploadProgress.logs.status !== 'completed') {
      const logsResult = await this.uploadAsset(
        item.feedbackData.logs,
        'text/plain',
        'logs'
      );

      item.uploadProgress.logs = {
        status: 'completed',
        url: logsResult.url,
        key: logsResult.key,
        bucket: logsResult.bucket
      };

      await this.updateItem(item.id, item);
      this.emit('queue:progress', { id: item.id, step: 'logs-uploaded' });
    }

    // Step 3: Submit feedback payload
    if (item.uploadProgress.feedback.status !== 'completed') {
      const payload = {
        title: item.feedbackData.title,
        description: item.feedbackData.description,
        assets: {
          screenshot: {
            key: item.uploadProgress.screenshot.key,
            url: item.uploadProgress.screenshot.url,
            bucket: item.uploadProgress.screenshot.bucket,
            mimeType: 'image/jpeg',
            metadata: item.feedbackData.context.viewport
          },
          logs: {
            key: item.uploadProgress.logs.key,
            url: item.uploadProgress.logs.url,
            bucket: item.uploadProgress.logs.bucket,
            mimeType: 'text/plain'
          }
        },
        context: item.feedbackData.context,
        idempotencyKey: item.feedbackData.idempotencyKey,
        projectId: item.feedbackData.projectId,
        userId: item.feedbackData.userId
      };

      await this.apiClient.submitFeedback(payload);

      item.uploadProgress.feedback.status = 'completed';
      await this.updateItem(item.id, item);
      this.emit('queue:progress', { id: item.id, step: 'feedback-submitted' });
    }

    // Mark as completed
    await this.updateStatus(item.id, 'completed');
    this.emit('queue:completed', item);

    console.log(`[Queue] Item ${item.id} completed successfully`);

    // Auto-remove after 24 hours (configurable)
    setTimeout(() => this.remove(item.id), 24 * 60 * 60 * 1000);

  } catch (error) {
    console.error(`[Queue] Error processing item ${item.id}:`, error);

    // Increment attempts
    item.attempts += 1;
    item.lastAttemptAt = Date.now();
    item.error = error.message;

    // Check if should retry
    if (item.attempts < this.maxRetries) {
      // Exponential backoff: 5s, 10s, 20s, 40s, 80s
      const backoffDelay = Math.min(
        this.baseRetryDelay * Math.pow(2, item.attempts - 1),
        this.maxRetryDelay
      );

      console.log(`[Queue] Will retry item ${item.id} in ${backoffDelay}ms (attempt ${item.attempts}/${this.maxRetries})`);

      await this.updateStatus(item.id, 'pending', error.message);

      // Schedule retry
      setTimeout(() => this.processQueue(), backoffDelay);

    } else {
      // Max retries exceeded
      console.error(`[Queue] Item ${item.id} failed after ${this.maxRetries} attempts`);
      await this.updateStatus(item.id, 'failed', error.message);
      this.emit('queue:failed', item);
    }
  }
}
```

**Key Features:**
- **Resumable uploads** - Each step (screenshot, logs, feedback) tracked separately
- **Partial progress saved** - If screenshot uploads but logs fail, screenshot isn't re-uploaded
- **Exponential backoff** - 5s → 10s → 20s → 40s → 80s between retries
- **Max retry limit** - Default 5 attempts, then marked as failed
- **Idempotency** - Safe to retry without duplicating backend records

---

### Queue Loop Processing

```javascript
async processQueue() {
  // Prevent concurrent processing
  if (this.isProcessing) {
    console.log('[Queue] Already processing, skipping...');
    return;
  }

  // Check network status
  if (!navigator.onLine) {
    console.log('[Queue] Offline, pausing processing...');
    return;
  }

  this.isProcessing = true;

  try {
    // Get all pending items, sorted by creation time (FIFO)
    const pendingItems = await this.getAll({ status: 'pending' });

    if (pendingItems.length === 0) {
      console.log('[Queue] No pending items');
      this.emit('queue:empty');
      return;
    }

    console.log(`[Queue] Processing ${pendingItems.length} items...`);

    // Process items one by one (not parallel to avoid rate limits)
    for (const item of pendingItems) {
      await this.processSingleItem(item);

      // Small delay between items to avoid rate limiting
      await this.delay(1000);
    }

    console.log('[Queue] All items processed');

  } finally {
    this.isProcessing = false;
  }

  // Check if any items are still pending (from retries)
  const remainingPending = await this.getAll({ status: 'pending' });
  if (remainingPending.length > 0) {
    // Schedule next processing cycle
    setTimeout(() => this.processQueue(), 5000);
  }
}
```

---

## User Experience Enhancements

### 1. **Instant Feedback Confirmation**

After clicking Submit:
```
┌─────────────────────────────┐
│  ✓ Feedback queued!         │
│  We'll sync it in the       │
│  background.                │
└─────────────────────────────┘
```

Auto-closes after 1.5 seconds.

---

### 2. **Sync Status Indicator States**

**Idle (hidden):**
- No pending items
- Indicator not visible

**Syncing:**
```
🔄 Syncing feedback (2/5)
```

**Failed:**
```
⚠️ 3 feedback items failed to sync
   [Retry Now] [View Details]
```

**Warning (before tab close):**
```
⏳ Syncing in progress (2 items remaining)
   Please keep this tab open
```

**Completed:**
```
✓ All feedback synced successfully!
```
(Auto-hides after 5 seconds)

---

### 3. **Progressive Enhancement**

**If IndexedDB not supported:**
- Gracefully degrade to synchronous submission
- Show warning: "Your browser doesn't support offline feedback"
- Original 8-second flow

**If offline when submitting:**
- Queue works normally
- Show: "Offline - feedback saved and will sync when online"
- Sync automatically when connection restored

---

### 4. **Visual Feedback During Sync**

**Submit button states:**
```javascript
// Before submit
[Submit Feedback]

// After queued (1.5s)
[✓ Queued for sync]

// During sync (in background)
// Button already removed, status indicator shows progress
```

**Sync indicator progress:**
```
🔄 Uploading screenshot (1/2)...
🔄 Uploading logs (2/2)...
🔄 Submitting feedback...
✓ Feedback synced!
```

---

## Error Handling & Edge Cases

### 1. **Network Failures**

**Scenario:** No internet connection when submitting

**Handling:**
- Feedback saved to IndexedDB
- User sees: "Offline - feedback saved locally"
- Sync starts automatically when online

---

### 2. **Partial Upload Failures**

**Scenario:** Screenshot uploads, but logs fail

**Handling:**
- Track each asset's upload status separately
- On retry, skip already-uploaded screenshot
- Only retry failed logs upload
- Prevents duplicate S3 uploads

---

### 3. **Page Refresh During Sync**

**Scenario:** User refreshes page while feedback is syncing

**Handling:**
- Queue persisted in IndexedDB (survives refresh)
- On page load, check for pending items
- Resume processing automatically
- Show status: "Resuming sync (3 items)..."

---

### 4. **Browser Crashes**

**Scenario:** Browser/tab crashes before sync completes

**Handling:**
- Queue persisted in IndexedDB
- On next visit, items remain in queue
- User sees: "Found 2 unsent feedback items from previous session"
- Option to sync or discard

---

### 5. **Duplicate Prevention**

**Scenario:** User submits same feedback multiple times

**Handling:**
- Each queue item has unique idempotency key
- Backend rejects duplicate idempotency keys
- Client removes duplicates from queue on 409 Conflict

---

### 6. **Storage Quota Exceeded**

**Scenario:** IndexedDB storage full

**Handling:**
```javascript
try {
  await db.put('feedbacks', item);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    // Clear completed items
    await this.clearCompleted();

    // Retry
    await db.put('feedbacks', item);

    // Show warning
    this.showNotification('Storage almost full. Old feedback cleared.', 'warning');
  }
}
```

---

### 7. **API Rate Limiting**

**Scenario:** Backend returns 429 Too Many Requests

**Handling:**
- Respect `Retry-After` header
- Exponential backoff with jitter
- Pause queue processing temporarily
- Resume after cooldown period

```javascript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || 60;
  console.log(`[Queue] Rate limited, waiting ${retryAfter}s...`);
  await this.delay(retryAfter * 1000);
  throw new Error('Rate limited, will retry');
}
```

---

### 8. **Idempotency Key Conflicts**

**Scenario:** Backend returns 409 Conflict (duplicate idempotency key)

**Handling:**
- Treat as success (already submitted)
- Mark as completed
- Remove from queue
- Log for analytics

```javascript
if (response.status === 409) {
  console.log(`[Queue] Feedback already submitted (idempotency key: ${item.feedbackData.idempotencyKey})`);
  await this.updateStatus(item.id, 'completed');
  return;
}
```

---

### 9. **Max Retries Exceeded**

**Scenario:** Item fails 5 times

**Handling:**
- Mark as permanently failed
- Show user notification with details
- Option to manually retry or discard
- Keep in queue for manual intervention

**UI:**
```
⚠️ Feedback "Login issue" failed to sync after 5 attempts
   Last error: Network timeout
   [Retry Now] [Remove] [View Details]
```

---

### 10. **Multiple Tabs/Windows**

**Scenario:** User has multiple tabs open with Tapko widget

**Handling:**
- Use BroadcastChannel API for inter-tab communication
- Only one tab processes queue at a time (leader election)
- Other tabs show read-only sync status
- Prevent duplicate processing

```javascript
class TabCoordinator {
  constructor(queueManager) {
    this.bc = new BroadcastChannel('tapko-queue-sync');
    this.isLeader = false;

    this.bc.onmessage = (event) => {
      if (event.data.type === 'queue:updated') {
        // Refresh UI in other tabs
        this.refreshUI();
      }
    };

    // Leader election (simple: first tab)
    this.electLeader();
  }

  electLeader() {
    // Request leadership
    this.bc.postMessage({ type: 'leader:request' });

    setTimeout(() => {
      if (!this.receivedLeaderResponse) {
        this.isLeader = true;
        this.startProcessing();
      }
    }, 100);
  }
}
```

---

## Configuration & Tuning

### Queue Manager Config

```javascript
const queueConfig = {
  // Retry settings
  maxRetries: 5,
  baseRetryDelay: 5000,        // 5 seconds
  maxRetryDelay: 120000,       // 2 minutes

  // Processing settings
  processInterval: 5000,       // Check queue every 5s
  batchSize: 1,                // Process items one-by-one
  concurrentUploads: 2,        // Parallel S3 uploads per item

  // Storage settings
  autoCleanup: true,           // Remove completed after X time
  completedRetentionDays: 1,   // Keep completed for 24 hours
  maxQueueSize: 100,           // Prevent runaway storage

  // Network settings
  offlineDetection: true,      // Use navigator.onLine
  pauseWhenHidden: false,      // Continue when tab backgrounded

  // UI settings
  showSyncIndicator: true,
  autoHideSuccessAfter: 5000,  // 5 seconds
  enableNotifications: true
};
```

---

## Implementation Phases

### Phase 1: Core Queue Infrastructure (Week 1)
- [ ] Create `FeedbackQueueManager.js`
- [ ] Implement IndexedDB wrapper
- [ ] Add queue CRUD operations
- [ ] Build single item processor
- [ ] Add retry logic with exponential backoff
- [ ] Implement event emitter
- [ ] Write unit tests

**Deliverable:** Working queue that can store and process feedback items

---

### Phase 2: UI Components (Week 2)
- [ ] Create `SyncStatusIndicator.js`
- [ ] Build compact status banner
- [ ] Add progress tracking UI
- [ ] Implement error state display
- [ ] Create `QueueViewerModal.js`
- [ ] Add manual retry/remove controls
- [ ] Style components

**Deliverable:** Visual feedback for queue status

---

### Phase 3: Integration & Lifecycle (Week 2-3)
- [ ] Modify `CommentCard.js` submit method
- [ ] Integrate queue manager into widget
- [ ] Create `SyncLifecycleManager.js`
- [ ] Implement beforeunload warning
- [ ] Add page visibility handling
- [ ] Create `NetworkStatusManager.js`
- [ ] Handle online/offline events

**Deliverable:** Fully integrated queue system with lifecycle management

---

### Phase 4: Error Handling & Edge Cases (Week 3)
- [ ] Implement partial upload recovery
- [ ] Add storage quota management
- [ ] Handle API rate limiting
- [ ] Implement idempotency conflict resolution
- [ ] Add multi-tab coordination
- [ ] Test browser crash recovery

**Deliverable:** Robust system that handles all edge cases

---

### Phase 5: Testing & Optimization (Week 4)
- [ ] Unit tests for all managers
- [ ] Integration tests for queue flow
- [ ] Offline/online transition tests
- [ ] Browser compatibility tests
- [ ] Performance profiling
- [ ] Memory leak detection
- [ ] Load testing (100+ queued items)

**Deliverable:** Production-ready, tested system

---

### Phase 6: Documentation & Monitoring (Week 4)
- [ ] API documentation
- [ ] Configuration guide
- [ ] Troubleshooting guide
- [ ] Add analytics events
- [ ] Create monitoring dashboard
- [ ] Write migration guide

**Deliverable:** Complete documentation and observability

---

## Testing Strategy

### Unit Tests

```javascript
describe('FeedbackQueueManager', () => {
  test('should enqueue feedback item', async () => {
    const manager = new FeedbackQueueManager();
    const id = await manager.enqueue(mockFeedbackData);
    expect(id).toBeDefined();

    const item = await manager.getById(id);
    expect(item.status).toBe('pending');
  });

  test('should process item successfully', async () => {
    const manager = new FeedbackQueueManager();
    const id = await manager.enqueue(mockFeedbackData);

    await manager.processSingleItem({ id, ...mockFeedbackData });

    const item = await manager.getById(id);
    expect(item.status).toBe('completed');
  });

  test('should retry failed items with exponential backoff', async () => {
    // Mock API failure
    jest.spyOn(apiClient, 'submitFeedback').mockRejectedValue(new Error('Network error'));

    const manager = new FeedbackQueueManager();
    const id = await manager.enqueue(mockFeedbackData);

    await manager.processSingleItem({ id, ...mockFeedbackData });

    const item = await manager.getById(id);
    expect(item.status).toBe('pending');
    expect(item.attempts).toBe(1);
  });

  test('should mark as failed after max retries', async () => {
    // ... test implementation
  });
});
```

### Integration Tests

```javascript
describe('Queued Feedback Flow', () => {
  test('should submit feedback instantly and sync in background', async () => {
    // 1. User submits feedback
    const submitButton = screen.getByText('Submit Feedback');
    fireEvent.click(submitButton);

    // 2. Should show "queued" immediately (< 500ms)
    await waitFor(() => {
      expect(screen.getByText('Queued for sync')).toBeInTheDocument();
    }, { timeout: 500 });

    // 3. Card should close
    await waitFor(() => {
      expect(screen.queryByTestId('comment-card')).not.toBeInTheDocument();
    });

    // 4. Sync indicator should appear
    expect(screen.getByText(/Syncing feedback/)).toBeInTheDocument();

    // 5. Wait for background sync to complete
    await waitFor(() => {
      expect(screen.getByText('All feedback synced')).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  test('should handle offline submission', async () => {
    // Simulate offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    window.dispatchEvent(new Event('offline'));

    // Submit feedback
    fireEvent.click(screen.getByText('Submit Feedback'));

    // Should queue and show offline message
    expect(screen.getByText(/Offline - feedback saved locally/)).toBeInTheDocument();

    // Simulate online
    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));

    // Should start syncing
    await waitFor(() => {
      expect(screen.getByText(/Syncing feedback/)).toBeInTheDocument();
    });
  });
});
```

### Manual Testing Scenarios

1. **Happy Path**
   - Submit feedback → See "queued" → Card closes → Sync completes

2. **Offline Submission**
   - Disable network → Submit feedback → Enable network → Auto-sync

3. **Page Refresh During Sync**
   - Submit feedback → Start sync → Refresh page → Resume sync

4. **Browser Close Warning**
   - Submit feedback → Try to close tab → See warning → Stay on page

5. **Multiple Failures**
   - Mock API failures → Submit → Watch retries → Eventually succeed

6. **Storage Quota**
   - Fill storage → Submit feedback → Old items cleared → New item queued

7. **Multi-tab Sync**
   - Open two tabs → Submit in tab 1 → See status in tab 2

---

## Performance Considerations

### Storage Optimization

**Problem:** Storing screenshot blobs in IndexedDB can consume significant storage

**Solution:**
- Compress images before storing (use canvas.toBlob with quality: 0.8)
- Auto-cleanup completed items after 24 hours
- Implement storage quota monitoring
- Warn user when approaching limit

```javascript
async enqueue(feedbackData) {
  // Compress screenshot before storing
  if (feedbackData.screenshot) {
    feedbackData.screenshot = await this.compressImage(feedbackData.screenshot, 0.8);
  }

  // Check storage quota
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const percentUsed = (estimate.usage / estimate.quota) * 100;

    if (percentUsed > 90) {
      console.warn('[Queue] Storage almost full:', percentUsed.toFixed(1) + '%');
      await this.clearCompleted();
    }
  }

  // Proceed with enqueue...
}
```

---

### Memory Management

**Problem:** Loading many queued items into memory

**Solution:**
- Process items one-by-one (not batch loading)
- Use IndexedDB cursors for large queries
- Release blob URLs after use
- Implement pagination in queue viewer

```javascript
async processQueue() {
  // Don't load all items at once
  const cursor = await this.db.openCursor('feedbacks', { status: 'pending' });

  while (cursor) {
    const item = cursor.value;
    await this.processSingleItem(item);

    // Release memory
    URL.revokeObjectURL(item.feedbackData.screenshot);

    cursor = await cursor.continue();
  }
}
```

---

### Network Efficiency

**Problem:** Uploading large assets on mobile networks

**Solution:**
- Respect network conditions (Network Information API)
- Pause/slow down on slow connections
- Use adaptive compression based on connection speed

```javascript
async shouldProcessQueue() {
  if ('connection' in navigator) {
    const conn = navigator.connection;

    // Pause on slow 2G
    if (conn.effectiveType === 'slow-2g') {
      console.log('[Queue] Slow connection, pausing queue...');
      return false;
    }

    // Reduce quality on 3G
    if (conn.effectiveType === '3g') {
      this.compressionQuality = 0.6;
    }
  }

  return true;
}
```

---

## Analytics & Monitoring

### Events to Track

```javascript
// Queue operations
tapko:queue:item-added
tapko:queue:item-completed
tapko:queue:item-failed
tapko:queue:empty

// Sync lifecycle
tapko:sync:started
tapko:sync:progress
tapko:sync:completed
tapko:sync:paused
tapko:sync:resumed

// User interactions
tapko:sync-indicator:clicked
tapko:sync:manual-retry
tapko:sync:cancelled
tapko:queue-viewer:opened

// Errors
tapko:queue:storage-quota-exceeded
tapko:queue:max-retries-exceeded
tapko:sync:network-error
```

### Metrics to Monitor

1. **Queue Health**
   - Average queue length
   - Processing success rate
   - Average time to completion
   - Retry distribution

2. **Performance**
   - Time to enqueue
   - Upload duration per asset
   - Total sync time
   - Storage usage

3. **User Experience**
   - Offline submission rate
   - Beforeunload warning shown
   - Manual retry frequency
   - Queue viewer usage

4. **Error Tracking**
   - Network error frequency
   - Storage quota errors
   - Max retry failures
   - API error types

---

## Migration Path

### For Existing Users

**Backward Compatibility:**
- Keep synchronous submission as fallback
- Detect IndexedDB support
- Progressive enhancement approach

```javascript
async submit() {
  // Check if queue is available
  if (window.tapkoWidget?.queueManager && this.supportsIndexedDB()) {
    // New queued flow
    await this.submitQueued();
  } else {
    // Legacy synchronous flow
    await this.submitLegacy();
  }
}

supportsIndexedDB() {
  return 'indexedDB' in window;
}
```

### Gradual Rollout

1. **Phase 1:** Deploy with feature flag (default: off)
2. **Phase 2:** Enable for 10% of users
3. **Phase 3:** Monitor metrics, fix issues
4. **Phase 4:** Roll out to 50% of users
5. **Phase 5:** Full rollout (100%)

### A/B Testing

Compare metrics:
- Average submission time
- Abandonment rate
- Successful submission rate
- User satisfaction

---

## Security Considerations

### Data Privacy

**Issue:** Sensitive data stored in IndexedDB

**Mitigation:**
- Don't store PII in queue
- Clear queue on logout
- Implement auto-expiry
- Option to disable offline storage

```javascript
// Sanitize data before storing
async enqueue(feedbackData) {
  const sanitized = {
    ...feedbackData,
    // Remove sensitive fields
    userId: this.hashUserId(feedbackData.userId),
    context: this.sanitizeContext(feedbackData.context)
  };

  await this.db.put('feedbacks', sanitized);
}
```

### XSS Prevention

**Issue:** User input stored and re-rendered

**Mitigation:**
- Sanitize HTML before storing
- Use DOMPurify for rendering
- CSP headers

### Storage Tampering

**Issue:** User can modify IndexedDB directly

**Mitigation:**
- Validate queue items before processing
- Server-side validation (idempotency keys)
- Ignore malformed items

---

## Configuration API

### Public Methods

```javascript
// Initialize with custom config
window.tapkoWidget.queueManager.configure({
  maxRetries: 3,
  autoCleanup: true,
  showNotifications: false
});

// Manually trigger sync
await window.tapkoWidget.queueManager.processQueue();

// Get queue status
const stats = window.tapkoWidget.queueManager.getQueueStats();
// { pending: 2, processing: 1, failed: 0, completed: 5 }

// Clear completed items
await window.tapkoWidget.queueManager.clearCompleted();

// Retry all failed items
await window.tapkoWidget.queueManager.retryFailed();

// Listen to events
window.tapkoWidget.queueManager.on('queue:completed', (item) => {
  console.log('Feedback synced:', item.id);
});
```

---

## Success Metrics

### Before (Current System)
- Submission time: ~8 seconds
- User must wait for completion
- No offline support
- Lost submissions on network failure

### After (Queued System)
- Submission time: <500ms (16x faster)
- User can continue immediately
- Full offline support
- No lost submissions (persistent queue)
- Background sync
- Robust error handling

### Target KPIs
- **Submission time:** < 500ms (from 8s)
- **Success rate:** > 99% (with retries)
- **Offline submissions:** > 95% eventually synced
- **User satisfaction:** Measured via feedback survey

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Approve architecture** and implementation approach
3. **Create detailed tickets** for each phase
4. **Set up development environment** with IndexedDB testing
5. **Begin Phase 1** implementation

---

## Questions for Stakeholders

1. **Storage limits:** What's acceptable IndexedDB usage? (50MB? 100MB?)
2. **Retention policy:** How long to keep completed items? (1 day? 7 days?)
3. **Max queue size:** Limit to prevent runaway storage? (100 items? 500?)
4. **Retry strategy:** Acceptable number of retries? (5? 10?)
5. **UI placement:** Where should sync indicator appear? (Top? Bottom?)
6. **Notifications:** Desktop notifications for sync completion?
7. **Analytics:** What metrics are most important to track?
8. **Feature flag:** How to roll out gradually? (% of users? Specific projects?)

---

## Appendix: Code Structure

```
src/
├── managers/
│   ├── FeedbackQueueManager.js       ← Core queue logic
│   ├── SyncLifecycleManager.js       ← Page lifecycle handling
│   ├── NetworkStatusManager.js       ← Online/offline detection
│   └── TabCoordinator.js             ← Multi-tab sync coordination
│
├── components/
│   ├── SyncStatusIndicator.js        ← Compact status banner
│   ├── QueueViewerModal.js           ← Advanced queue UI
│   └── CommentCard.js                ← Modified submit method
│
├── db/
│   └── IndexedDBWrapper.js           ← IndexedDB abstraction
│
├── utils/
│   ├── compression.js                ← Image compression utilities
│   ├── retry.js                      ← Retry logic helpers
│   └── storage.js                    ← Storage quota helpers
│
└── config.js                         ← Queue configuration
```

---

**End of Plan**

This comprehensive plan covers all aspects of implementing a robust, production-ready queued feedback system. The architecture prioritizes user experience, data integrity, and graceful error handling.
