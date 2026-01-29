import IndexedDBWrapper from '../db/IndexedDBWrapper.js';

/**
 * FeedbackQueueManager - Manages the feedback submission queue
 * Handles persistent storage, retry logic, and background processing
 */
class FeedbackQueueManager {
  constructor(apiClient, config = {}) {
    this.apiClient = apiClient;
    this.config = {
      maxRetries: config.maxRetries || 5,
      baseRetryDelay: config.baseRetryDelay || 5000,
      maxRetryDelay: config.maxRetryDelay || 120000,
      processInterval: config.processInterval || 5000,
      concurrentUploads: config.concurrentUploads || 2,
      autoCleanup: config.autoCleanup !== false,
      completedRetentionMs: config.completedRetentionDays ? config.completedRetentionDays * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
      maxQueueSize: config.maxQueueSize || 100,
      enableNotifications: config.enableNotifications !== false
    };

    this.db = new IndexedDBWrapper('TapkoFeedbackQueue', 'feedbacks', 1);
    this.isProcessing = false;
    this.processingInterval = null;
    this.eventListeners = {};
    this.initialized = false;
  }

  /**
   * Initialize the queue manager
   */
  async init() {
    if (this.initialized) {
      return;
    }

    try {
      // Check IndexedDB support
      if (!IndexedDBWrapper.isSupported()) {
        console.warn('[FeedbackQueue] IndexedDB not supported, queue disabled');
        return false;
      }

      // Initialize database
      await this.db.init();
      console.log('[FeedbackQueue] Queue manager initialized');

      // Clean up old completed items
      if (this.config.autoCleanup) {
        await this.cleanupCompleted();
      }

      // Check for pending items from previous session
      const pendingCount = await this.db.count({ index: 'status', value: 'pending' });
      if (pendingCount > 0) {
        console.log(`[FeedbackQueue] Found ${pendingCount} pending items from previous session`);
        this.emit('queue:resumed', { count: pendingCount });

        // Start processing after a short delay
        setTimeout(() => this.processQueue(), 2000);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[FeedbackQueue] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Add feedback to the queue
   */
  async enqueue(feedbackData) {
    if (!this.initialized) {
      throw new Error('Queue manager not initialized');
    }

    try {
      // Check queue size limit
      const currentSize = await this.db.count();
      if (currentSize >= this.config.maxQueueSize) {
        console.warn('[FeedbackQueue] Queue size limit reached, cleaning up...');
        await this.cleanupCompleted();

        // Check again
        const newSize = await this.db.count();
        if (newSize >= this.config.maxQueueSize) {
          throw new Error('Queue is full. Please try again later.');
        }
      }

      // Generate unique ID
      const id = this.generateId();

      // Create queue item
      const queueItem = {
        id,
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
        lastAttemptAt: null,
        error: null,
        feedbackData: {
          title: feedbackData.title,
          description: feedbackData.description,
          screenshot: feedbackData.screenshot, // Blob (unmerged)
          annotationData: feedbackData.annotationData, // NEW: Annotation data {paths, strokeColor, strokeWidth}
          logs: feedbackData.logs, // Blob
          context: feedbackData.context,
          idempotencyKey: feedbackData.idempotencyKey,
          projectId: feedbackData.projectId,
          userId: feedbackData.userId
        },
        uploadProgress: {
          screenshot: {
            status: 'pending',
            url: null,
            key: null,
            bucket: null
          },
          logs: {
            status: 'pending',
            url: null,
            key: null,
            bucket: null
          },
          feedback: {
            status: 'pending'
          }
        }
      };

      // Store in IndexedDB
      await this.db.put(queueItem);

      console.log('[FeedbackQueue] Item enqueued:', id);
      this.emit('queue:added', { id, item: queueItem });

      return id;
    } catch (error) {
      console.error('[FeedbackQueue] Error enqueuing item:', error);
      throw error;
    }
  }

  /**
   * Get item by ID
   */
  async getById(id) {
    return await this.db.get(id);
  }

  /**
   * Get all items with optional filter
   */
  async getAll(filter = null) {
    if (filter && filter.status) {
      return await this.db.getAll({ index: 'status', value: filter.status });
    }
    return await this.db.getAll();
  }

  /**
   * Update item status
   */
  async updateStatus(id, status, error = null) {
    const item = await this.db.get(id);
    if (!item) {
      console.warn('[FeedbackQueue] Item not found:', id);
      return;
    }

    item.status = status;
    item.error = error;
    item.lastAttemptAt = Date.now();

    await this.db.put(item);
    console.log(`[FeedbackQueue] Item ${id} status updated to:`, status);
  }

  /**
   * Update entire item
   */
  async updateItem(id, updates) {
    const item = await this.db.get(id);
    if (!item) {
      console.warn('[FeedbackQueue] Item not found:', id);
      return;
    }

    const updatedItem = { ...item, ...updates };
    await this.db.put(updatedItem);
    return updatedItem;
  }

  /**
   * Remove item from queue
   */
  async remove(id) {
    await this.db.delete(id);
    console.log('[FeedbackQueue] Item removed:', id);
    this.emit('queue:removed', { id });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [pending, processing, failed, completed] = await Promise.all([
      this.db.count({ index: 'status', value: 'pending' }),
      this.db.count({ index: 'status', value: 'processing' }),
      this.db.count({ index: 'status', value: 'failed' }),
      this.db.count({ index: 'status', value: 'completed' })
    ]);

    return { pending, processing, failed, completed };
  }

  /**
   * Check if queue is currently processing
   */
  isProcessingQueue() {
    return this.isProcessing;
  }

  /**
   * Check if there are pending items
   */
  async hasPendingItems() {
    const count = await this.db.count({ index: 'status', value: 'pending' });
    return count > 0;
  }

  /**
   * Process the queue
   */
  async processQueue() {
    // Prevent concurrent processing
    if (this.isProcessing) {
      console.log('[FeedbackQueue] Already processing, skipping...');
      return;
    }

    // Check network status
    if (!navigator.onLine) {
      console.log('[FeedbackQueue] Offline, pausing processing...');
      return;
    }

    this.isProcessing = true;

    try {
      // Get all pending items, sorted by creation time (FIFO)
      const pendingItems = await this.db.getAll({ index: 'status', value: 'pending' });

      if (pendingItems.length === 0) {
        console.log('[FeedbackQueue] No pending items');
        this.emit('queue:empty');
        return;
      }

      // Sort by createdAt (oldest first)
      pendingItems.sort((a, b) => a.createdAt - b.createdAt);

      console.log(`[FeedbackQueue] Processing ${pendingItems.length} items...`);
      this.emit('queue:started', { count: pendingItems.length });

      // Process items one by one
      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];

        this.emit('queue:progress', {
          id: item.id,
          current: i + 1,
          total: pendingItems.length
        });

        await this.processSingleItem(item);

        // Small delay between items to avoid rate limiting
        if (i < pendingItems.length - 1) {
          await this.delay(1000);
        }
      }

      console.log('[FeedbackQueue] All items processed');
      this.emit('queue:all-completed');

    } finally {
      this.isProcessing = false;
    }

    // Check if any items are still pending (from retries)
    const remainingPending = await this.db.getAll({ index: 'status', value: 'pending' });
    if (remainingPending.length > 0) {
      console.log(`[FeedbackQueue] ${remainingPending.length} items pending retry, scheduling next cycle...`);
      setTimeout(() => this.processQueue(), this.config.processInterval);
    }
  }

  /**
   * Process a single queue item
   */
  async processSingleItem(item) {
    console.log(`[FeedbackQueue] Processing item ${item.id}...`);

    // Update status to processing
    await this.updateStatus(item.id, 'processing');
    this.emit('queue:item-processing', { id: item.id });

    try {
      // Step 1: Upload screenshot to S3 (merge annotations if needed)
      if (item.uploadProgress.screenshot.status !== 'completed' && item.feedbackData.screenshot) {
        console.log(`[FeedbackQueue] Uploading screenshot for item ${item.id}...`);

        // Merge annotations if they exist
        let screenshotToUpload = item.feedbackData.screenshot;
        if (item.feedbackData.annotationData && item.feedbackData.annotationData.paths && item.feedbackData.annotationData.paths.length > 0) {
          console.log(`[FeedbackQueue] Merging ${item.feedbackData.annotationData.paths.length} annotations before upload...`);
          screenshotToUpload = await this._mergeAnnotationsToScreenshot(
            item.feedbackData.screenshot,
            item.feedbackData.annotationData
          );
        }

        const screenshotResult = await this.uploadAsset(
          screenshotToUpload,  // Upload merged screenshot
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
        this.emit('queue:step-completed', { id: item.id, step: 'screenshot' });
      }

      // Step 2: Upload logs to S3
      if (item.uploadProgress.logs.status !== 'completed' && item.feedbackData.logs) {
        console.log(`[FeedbackQueue] Uploading logs for item ${item.id}...`);

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
        this.emit('queue:step-completed', { id: item.id, step: 'logs' });
      }

      // Step 3: Submit feedback payload
      if (item.uploadProgress.feedback.status !== 'completed') {
        console.log(`[FeedbackQueue] Submitting feedback for item ${item.id}...`);

        // Build assets object with only uploaded items
        const assets = {};

        if (item.uploadProgress.screenshot.status === 'completed' && item.uploadProgress.screenshot.key) {
          assets.screenshot = {
            key: item.uploadProgress.screenshot.key,
            url: item.uploadProgress.screenshot.url,
            bucket: item.uploadProgress.screenshot.bucket,
            mimeType: 'image/jpeg',
            metadata: item.feedbackData.context?.viewport || {}
          };
        }

        if (item.uploadProgress.logs.status === 'completed' && item.uploadProgress.logs.key) {
          assets.logs = {
            key: item.uploadProgress.logs.key,
            url: item.uploadProgress.logs.url,
            bucket: item.uploadProgress.logs.bucket,
            mimeType: 'text/plain'
          };
        }

        const payload = {
          title: item.feedbackData.title,
          description: item.feedbackData.description,
          assets: assets,
          context: item.feedbackData.context,
          idempotencyKey: item.feedbackData.idempotencyKey,
          projectId: item.feedbackData.projectId,
          userId: item.feedbackData.userId
        };

        console.log('[FeedbackQueue] Submitting payload:', {
          title: payload.title,
          hasScreenshot: !!assets.screenshot,
          hasLogs: !!assets.logs,
          screenshotKey: assets.screenshot?.key,
          logsKey: assets.logs?.key
        });

        const response = await this.apiClient.submitFeedback(payload);

        // Capture feedbackId from backend response
        const feedbackId = response?.data?.feedbackId || response?.data?.id || null;
        if (feedbackId) {
          item.feedbackId = feedbackId;
          console.log('[FeedbackQueue] Captured feedbackId from backend:', feedbackId);
        } else {
          console.warn('[FeedbackQueue] No feedbackId in backend response:', response);
        }

        item.uploadProgress.feedback.status = 'completed';
        await this.updateItem(item.id, item);
        this.emit('queue:step-completed', { id: item.id, step: 'feedback' });
      }

      // Mark as completed
      await this.updateStatus(item.id, 'completed');
      this.emit('queue:item-completed', {
        id: item.id,
        feedbackId: item.feedbackId,
        feedbackData: item.feedbackData
      });

      console.log(`[FeedbackQueue] Item ${item.id} completed successfully`);

      // Schedule auto-removal after retention period
      if (this.config.autoCleanup) {
        setTimeout(() => {
          this.remove(item.id).catch(err => {
            console.error('[FeedbackQueue] Error removing completed item:', err);
          });
        }, this.config.completedRetentionMs);
      }

    } catch (error) {
      console.error(`[FeedbackQueue] Error processing item ${item.id}:`, error);

      // Handle idempotency conflict (already submitted)
      if (error.status === 409 || error.message?.includes('duplicate')) {
        console.log(`[FeedbackQueue] Item ${item.id} already submitted (idempotency conflict)`);
        await this.updateStatus(item.id, 'completed');
        this.emit('queue:item-completed', { id: item.id, duplicate: true });
        return;
      }

      // Increment attempts
      item.attempts += 1;
      item.lastAttemptAt = Date.now();
      item.error = error.message || 'Unknown error';

      // Check if should retry
      if (item.attempts < this.config.maxRetries) {
        // Exponential backoff
        const backoffDelay = Math.min(
          this.config.baseRetryDelay * Math.pow(2, item.attempts - 1),
          this.config.maxRetryDelay
        );

        console.log(`[FeedbackQueue] Will retry item ${item.id} in ${backoffDelay}ms (attempt ${item.attempts}/${this.config.maxRetries})`);

        await this.updateItem(item.id, item);
        await this.updateStatus(item.id, 'pending', error.message);

        this.emit('queue:item-retry', {
          id: item.id,
          attempt: item.attempts,
          maxRetries: this.config.maxRetries,
          nextRetryIn: backoffDelay
        });

      } else {
        // Max retries exceeded
        console.error(`[FeedbackQueue] Item ${item.id} failed after ${this.config.maxRetries} attempts`);
        await this.updateStatus(item.id, 'failed', error.message);
        this.emit('queue:item-failed', {
          id: item.id,
          error: error.message,
          attempts: item.attempts
        });
      }
    }
  }

  /**
   * Upload an asset to S3
   */
  async uploadAsset(blob, mimeType, type) {
    // Generate file name
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = mimeType === 'image/jpeg' ? 'jpg' : 'txt';
    const fileName = `${timestamp}-${random}.${extension}`;

    // Determine folder name based on type
    const folderName = type === 'screenshot' ? 'screenshots' : 'logs';

    // Get presigned URL
    const presignedData = await this.apiClient.getPresignedUrl({
      folderName: folderName,
      fileName: fileName,
      fileType: mimeType
    });

    // Upload to S3
    await this.apiClient.uploadToS3(presignedData.data.uploadUrl, blob, mimeType);

    return {
      url: presignedData.data.url,
      key: presignedData.data.key,
      bucket: presignedData.data.bucket
    };
  }

  /**
   * Retry all failed items
   */
  async retryFailed() {
    const failedItems = await this.db.getAll({ index: 'status', value: 'failed' });

    console.log(`[FeedbackQueue] Retrying ${failedItems.length} failed items...`);

    for (const item of failedItems) {
      // Reset attempts and status
      item.attempts = 0;
      item.error = null;
      await this.updateItem(item.id, item);
      await this.updateStatus(item.id, 'pending');
    }

    this.emit('queue:retry-all', { count: failedItems.length });

    // Start processing
    setTimeout(() => this.processQueue(), 1000);
  }

  /**
   * Clear all completed items
   */
  async clearCompleted() {
    const completedItems = await this.db.getAll({ index: 'status', value: 'completed' });

    for (const item of completedItems) {
      await this.db.delete(item.id);
    }

    console.log(`[FeedbackQueue] Cleared ${completedItems.length} completed items`);
    this.emit('queue:cleared', { count: completedItems.length });
  }

  /**
   * Clean up old completed items
   */
  async cleanupCompleted() {
    const completedItems = await this.db.getAll({ index: 'status', value: 'completed' });
    const now = Date.now();
    let cleaned = 0;

    for (const item of completedItems) {
      const age = now - item.createdAt;
      if (age > this.config.completedRetentionMs) {
        await this.db.delete(item.id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[FeedbackQueue] Cleaned up ${cleaned} old completed items`);
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Event emitter
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('[FeedbackQueue] Error in event listener:', error);
      }
    });
  }

  /**
   * Merge annotations into screenshot blob
   * Returns a new blob with annotations drawn on the screenshot
   */
  async _mergeAnnotationsToScreenshot(screenshotBlob, annotationData) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw screenshot background
          ctx.drawImage(img, 0, 0);

          // Apply annotation settings
          ctx.strokeStyle = annotationData.strokeColor || '#ff0000';
          ctx.lineWidth = annotationData.strokeWidth || 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Draw each annotation
          annotationData.paths.forEach(item => {
            if (item.type === 'path' || Array.isArray(item)) {
              // Freehand path
              const path = item.type === 'path' ? item.data : item;
              if (path.length === 0) return;
              ctx.beginPath();
              ctx.moveTo(path[0].x, path[0].y);
              for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
              }
              ctx.stroke();

            } else if (item.type === 'ellipse') {
              // Ellipse
              const centerX = (item.startX + item.endX) / 2;
              const centerY = (item.startY + item.endY) / 2;
              const radiusX = Math.abs(item.endX - item.startX) / 2;
              const radiusY = Math.abs(item.endY - item.startY) / 2;
              ctx.beginPath();
              ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
              ctx.stroke();

            } else if (item.type === 'rectangle') {
              // Rectangle
              const width = item.endX - item.startX;
              const height = item.endY - item.startY;
              ctx.beginPath();
              ctx.rect(item.startX, item.startY, width, height);
              ctx.stroke();

            } else if (item.type === 'arrow') {
              // Arrow
              ctx.beginPath();
              ctx.moveTo(item.startX, item.startY);
              ctx.lineTo(item.endX, item.endY);
              ctx.stroke();

              // Draw arrowhead
              const angle = Math.atan2(item.endY - item.startY, item.endX - item.startX);
              const arrowLength = 15;
              const arrowAngle = Math.PI / 6;

              ctx.beginPath();
              ctx.moveTo(item.endX, item.endY);
              ctx.lineTo(
                item.endX - arrowLength * Math.cos(angle - arrowAngle),
                item.endY - arrowLength * Math.sin(angle - arrowAngle)
              );
              ctx.moveTo(item.endX, item.endY);
              ctx.lineTo(
                item.endX - arrowLength * Math.cos(angle + arrowAngle),
                item.endY - arrowLength * Math.sin(angle + arrowAngle)
              );
              ctx.stroke();

            } else if (item.type === 'text') {
              // Text
              ctx.font = '16px sans-serif';
              ctx.fillStyle = annotationData.strokeColor || '#ff0000';
              ctx.fillText(item.text, item.x, item.y);
            }
          });

          // Convert to blob
          canvas.toBlob((blob) => {
            if (blob) {
              console.log('[FeedbackQueue] Annotations merged successfully. Size:', blob.size, 'bytes');
              resolve(blob);
            } else {
              reject(new Error('Failed to create merged screenshot blob'));
            }
          }, 'image/jpeg', 0.85);
        };
        img.onerror = (err) => {
          reject(new Error('Failed to load screenshot image: ' + err));
        };
        img.src = e.target.result;
      };
      reader.onerror = (err) => {
        reject(new Error('Failed to read screenshot blob: ' + err));
      };
      reader.readAsDataURL(screenshotBlob);
    });
  }

  /**
   * Destroy the queue manager
   */
  destroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    this.db.close();
    this.eventListeners = {};
    this.initialized = false;
  }
}

export default FeedbackQueueManager;
