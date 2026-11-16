import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/IndexedDBWrapper.js', () => ({
  default: class MockIndexedDBWrapper {
    static isSupported() { return true; }
    constructor() { this.items = new Map(); }
    async init() {}
    async count() { return this.items.size; }
    async getAll(q) {
      const all = Array.from(this.items.values());
      return q?.index === 'status' ? all.filter(i => i.status === q.value) : all;
    }
    async put(item) { this.items.set(item.id, structuredClone(item)); }
    async get(id) { const i = this.items.get(id); return i ? structuredClone(i) : i; }
    async delete(id) { this.items.delete(id); }
  }
}));

const renderURLImage = vi.fn();
const compositeWidgetOverlay = vi.fn(async d => d + '#overlay');
vi.mock('../src/utils/screenshot.js', () => ({
  renderURLImage: (...a) => renderURLImage(...a),
  compositeWidgetOverlay: (...a) => compositeWidgetOverlay(...a),
  dataURLToBlob: () => new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' })
}));

if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}

const { default: FeedbackQueueManager } = await import('../src/managers/FeedbackQueueManager.js');

function makeApi({ onPut } = {}) {
  let n = 0;
  return {
    getPresignedUrl: vi.fn(async ({ folderName }) => {
      n += 1;
      return { data: { uploadUrl: `https://s3/${folderName}/${n}`, url: `u${n}`, key: `${folderName}/k${n}`, bucket: 'b' } };
    }),
    uploadToS3: vi.fn(async (url) => { await onPut?.(url); return true; }),
    submitFeedback: vi.fn(async () => ({ data: { feedbackId: 'f1' } }))
  };
}

const feedback = (extra = {}) => ({
  title: 't', description: 'd',
  screenshot: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
  logs: new Blob(['l'], { type: 'text/plain' }),
  networkLogs: new Blob(['[]'], { type: 'text/plain' }),
  context: {}, idempotencyKey: 'k', projectId: 'p', userId: 'u',
  ...extra
});

describe('queue — parallel uploads', () => {
  it('starts all three S3 PUTs before any finishes', async () => {
    let inFlight = 0, maxInFlight = 0;
    const api = makeApi({
      onPut: async () => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 20));
        inFlight--;
      }
    });
    const m = new FeedbackQueueManager(api, { autoCleanup: false });
    await m.init();
    await m.enqueue(feedback());
    await m.processQueue();
    expect(maxInFlight).toBe(3);
    expect(api.submitFeedback.mock.calls[0][0].assets).toEqual(
      expect.objectContaining({ screenshot: expect.any(Object), logs: expect.any(Object), networkLogs: expect.any(Object) })
    );
  });
});

describe('queue — mid-run enqueue', () => {
  it('processes an item enqueued while running without waiting for a re-poll', async () => {
    const api = makeApi();
    const m = new FeedbackQueueManager(api, { autoCleanup: false });
    await m.init();
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await m.enqueue(feedback({ idempotencyKey: 'a' }));
    api.submitFeedback.mockImplementationOnce(async () => {
      await m.enqueue(feedback({ idempotencyKey: 'b' }));
      return { data: { feedbackId: 'f1' } };
    });
    await m.processQueue();
    expect(api.submitFeedback).toHaveBeenCalledTimes(2);
    expect(timeoutSpy.mock.calls.some(([, ms]) => ms === 5000)).toBe(false);
    timeoutSpy.mockRestore();
  });
});

describe('queue — deferred screenshot capture', () => {
  it('awaits the card\'s in-flight capture, then uploads it', async () => {
    const api = makeApi();
    const m = new FeedbackQueueManager(api, { autoCleanup: false });
    await m.init();
    let resolveCapture;
    const capturePromise = new Promise(r => { resolveCapture = r; });
    const id = await m.enqueue(
      feedback({ screenshot: null, captureParams: { url: 'https://x.test/' } }),
      { capturePromise }
    );
    const run = m.processQueue();
    await new Promise(r => setTimeout(r, 10));
    expect(api.submitFeedback).not.toHaveBeenCalled();
    resolveCapture('data:image/jpeg;base64,AAAA');
    await run;
    expect(renderURLImage).not.toHaveBeenCalled();
    expect(api.getPresignedUrl.mock.calls.map(c => c[0].folderName)).toContain('screenshots');
    expect(api.submitFeedback.mock.calls[0][0].assets.screenshot).toBeTruthy();
    expect((await m.getById(id)).feedbackData.captureParams).toBeNull();
  });

  it('re-renders from persisted params (and overlay) when the in-flight capture is gone', async () => {
    renderURLImage.mockResolvedValue('data:image/webp;base64,BBBB');
    const api = makeApi();
    const m = new FeedbackQueueManager(api, { autoCleanup: false });
    await m.init();
    const params = { url: 'https://x.test/', scrollY: 5, widgetOverlay: { pinX: 1, pinY: 2 } };
    await m.enqueue(feedback({ screenshot: null, captureParams: params }));
    await m.processQueue();
    expect(renderURLImage).toHaveBeenCalledWith(params);
    expect(compositeWidgetOverlay).toHaveBeenCalledWith('data:image/webp;base64,BBBB', params.widgetOverlay);
    expect(api.submitFeedback.mock.calls[0][0].assets.screenshot).toBeTruthy();
  });

  it('submits without a screenshot when the deferred capture fails', async () => {
    const api = makeApi();
    const m = new FeedbackQueueManager(api, { autoCleanup: false });
    await m.init();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = Promise.reject(new Error('boom'));
    failing.catch(() => {});
    await m.enqueue(
      feedback({ screenshot: null, captureParams: { url: 'https://x.test/' } }),
      { capturePromise: failing }
    );
    await m.processQueue();
    expect(api.submitFeedback).toHaveBeenCalledTimes(1);
    expect(api.submitFeedback.mock.calls[0][0].assets.screenshot).toBeUndefined();
  });
});
