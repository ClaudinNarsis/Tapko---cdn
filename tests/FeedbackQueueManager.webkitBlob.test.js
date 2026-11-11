import { describe, it, expect, vi } from 'vitest';

// WebKit (Safari, DuckDuckGo on macOS) often can't use a Blob read back from
// IndexedDB as a fetch body ("WebKitBlobResource error 1" / "Load failed").
// The queue stored the screenshot as a Blob, so the screenshot PUT threw, the
// whole item failed before logs or the submit, and the comment was lost.
// Fix: persist bytes (ArrayBuffer + type), rebuild a Blob at upload time, and
// submit the comment even when an asset upload fails.
vi.mock('../src/db/IndexedDBWrapper.js', () => {
  return {
    default: class MockIndexedDBWrapper {
      static isSupported() {
        return true;
      }
      constructor() {
        this.items = new Map();
      }
      async init() {}
      async count() {
        return this.items.size;
      }
      async getAll() {
        return Array.from(this.items.values());
      }
      async put(item) {
        this.items.set(item.id, item);
      }
      async get(id) {
        return this.items.get(id);
      }
    }
  };
});

// jsdom's Blob lacks arrayBuffer() (every supported browser has it).
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const { default: FeedbackQueueManager } = await import('../src/managers/FeedbackQueueManager.js');

function makeApiClient({ failScreenshot = false } = {}) {
  let n = 0;
  return {
    getPresignedUrl: vi.fn(async ({ folderName }) => {
      n += 1;
      return { data: { uploadUrl: `https://s3/${folderName}/${n}`, url: `u${n}`, key: `${folderName}/k${n}`, bucket: 'b' } };
    }),
    uploadToS3: vi.fn(async (url, body) => {
      if (failScreenshot && url.includes('/screenshots/')) throw new TypeError('Load failed');
      return true;
    }),
    submitFeedback: vi.fn(async () => ({ data: { feedbackId: 'f1' } }))
  };
}

const feedback = () => ({
  title: 't',
  description: 'd',
  screenshot: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  logs: new Blob(['log line'], { type: 'text/plain' }),
  networkLogs: new Blob(['[]'], { type: 'text/plain' }),
  context: {},
  idempotencyKey: 'k1',
  projectId: 'p1',
  userId: 'u1'
});

describe('FeedbackQueueManager — WebKit-safe asset storage', () => {
  it('persists assets as ArrayBuffer, and uploads a fresh Blob of the right type', async () => {
    const api = makeApiClient();
    const manager = new FeedbackQueueManager(api, { autoCleanup: false });
    await manager.init();

    const id = await manager.enqueue(feedback());
    const stored = await manager.db.get(id);
    expect(stored.feedbackData.screenshot).not.toBeInstanceOf(Blob);
    expect(stored.feedbackData.screenshot.data).toBeInstanceOf(ArrayBuffer);
    expect(stored.feedbackData.screenshot.type).toBe('image/jpeg');
    expect(stored.feedbackData.logs.data).toBeInstanceOf(ArrayBuffer);

    await manager.processSingleItem(stored);

    const [, body, mime] = api.uploadToS3.mock.calls.find(([url]) => url.includes('/screenshots/'));
    expect(body).toBeInstanceOf(Blob);
    expect(body.type).toBe('image/jpeg');
    expect(mime).toBe('image/jpeg');
    expect(new Uint8Array(await body.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('still submits the comment with logs when the screenshot upload rejects', async () => {
    const api = makeApiClient({ failScreenshot: true });
    const manager = new FeedbackQueueManager(api, { autoCleanup: false });
    await manager.init();

    const id = await manager.enqueue(feedback());
    await manager.processSingleItem(await manager.db.get(id));

    expect(api.submitFeedback).toHaveBeenCalledTimes(1);
    const payload = api.submitFeedback.mock.calls[0][0];
    expect(payload.assets.screenshot).toBeUndefined();
    expect(payload.assets.logs.key).toMatch(/^logs\//);
    expect(payload.assets.networkLogs.key).toMatch(/^logs\//);
    expect(payload.idempotencyKey).toBe('k1');
    expect((await manager.db.get(id)).status).toBe('completed');
  });

  it('treats an unreadable legacy Blob as a missing asset', async () => {
    const api = makeApiClient();
    const manager = new FeedbackQueueManager(api, { autoCleanup: false });
    await manager.init();

    const id = await manager.enqueue(feedback());
    const item = await manager.db.get(id);
    // Item queued by an older widget build: raw Blob, unreadable on WebKit.
    item.feedbackData.screenshot = new Blob(['x'], { type: 'image/jpeg' });
    item.feedbackData.screenshot.arrayBuffer = () => Promise.reject(new Error('WebKitBlobResource error 1'));
    await manager.processSingleItem(item);

    expect(api.submitFeedback).toHaveBeenCalledTimes(1);
    const payload = api.submitFeedback.mock.calls[0][0];
    expect(payload.assets.screenshot).toBeUndefined();
    expect(payload.assets.logs).toBeDefined();
  });
});

describe('FeedbackQueueManager — screen recording (assets.video)', () => {
  it('uploads the recording to recordings/ as video/webm and attaches assets.video', async () => {
    const api = makeApiClient();
    const manager = new FeedbackQueueManager(api, { autoCleanup: false });
    await manager.init();
    const id = await manager.enqueue({ ...feedback(), video: new Blob(['v'], { type: 'video/webm' }) });
    await manager.processSingleItem(await manager.db.get(id));

    expect(api.getPresignedUrl).toHaveBeenCalledWith(expect.objectContaining({ folderName: 'recordings', fileType: 'video/webm', fileName: expect.stringMatching(/\.webm$/) }));
    const { assets } = api.submitFeedback.mock.calls[0][0];
    expect(assets.video).toEqual(expect.objectContaining({ key: expect.stringMatching(/^recordings\//), mimeType: 'video/webm' }));
  });

  it('still processes an item queued before recordings existed (no uploadProgress.video)', async () => {
    const api = makeApiClient();
    const manager = new FeedbackQueueManager(api, { autoCleanup: false });
    await manager.init();
    const id = await manager.enqueue(feedback());
    const item = await manager.db.get(id);
    delete item.uploadProgress.video;
    delete item.feedbackData.video;
    await manager.processSingleItem(item);
    expect((await manager.db.get(id)).status).toBe('completed');
  });

  it('retries a recording-only comment whose video upload failed instead of submitting it empty', async () => {
    const api = makeApiClient();
    api.uploadToS3.mockImplementation(async (url) => { if (url.includes('/recordings/')) throw new TypeError('Load failed'); });
    const manager = new FeedbackQueueManager(api, { autoCleanup: false, baseRetryDelay: 60000 });
    await manager.init();
    const id = await manager.enqueue({ ...feedback(), description: '', video: new Blob(['v'], { type: 'video/webm' }) });
    await manager.processSingleItem(await manager.db.get(id));
    expect(api.submitFeedback).not.toHaveBeenCalled();
    expect((await manager.db.get(id)).status).not.toBe('completed');
  });
});
