import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Submit must not block on the screenshot render: the card pre-captures while
// the user types, waits at most ~1.5s at submit, and otherwise hands the
// in-flight capture (plus persisted render params) to the queue worker.
const renderURLImage = vi.fn();
const compositeWidgetOverlay = vi.fn(async d => `${d}#overlay`);
const renderParamsMatchPage = vi.fn(() => true);
const captureScreenshot = vi.fn().mockResolvedValue(null);
const captureDOMScreenshot = vi.fn();
const urlCaptureSkipReason = vi.fn(() => null);
const markUrlCaptureFailed = vi.fn();
vi.mock('../src/utils/screenshot.js', () => ({
  captureScreenshot: (...a) => captureScreenshot(...a),
  dataURLToBlob: () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
  generateThumbnail: vi.fn().mockResolvedValue('thumb'),
  getRenderParams: () => ({ url: 'https://x.test/', scrollX: 0, scrollY: 0, width: 1000, height: 600, devicePixelRatio: 2 }),
  renderParamsMatchPage: (...a) => renderParamsMatchPage(...a),
  renderURLImage: (...a) => renderURLImage(...a),
  compositeWidgetOverlay: (...a) => compositeWidgetOverlay(...a),
  captureDOMScreenshot: (...a) => captureDOMScreenshot(...a),
  urlCaptureSkipReason: (...a) => urlCaptureSkipReason(...a),
  markUrlCaptureFailed: (...a) => markUrlCaptureFailed(...a),
  _snapshotDOM: () => Promise.resolve({ clone: 'snap' })
}));

// CONFIG is frozen; a mutable stand-in lets tests toggle the renderer URL.
const rendererState = { url: '' };
vi.mock('../src/config.js', async (orig) => {
  const mod = await orig();
  const API = { ...mod.CONFIG.API };
  Object.defineProperty(API, 'rendererUrl', { get: () => rendererState.url });
  return { ...mod, CONFIG: { ...mod.CONFIG, API } };
});
const { CommentCard } = await import('../src/components/CommentCard.js');

function makeCard() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const card = new CommentCard(target, { x: 10, y: 10 }, { userId: 'u', projectId: 'p' }, document.body, null);
  card._isPinVisible = () => true;
  return card;
}

describe('CommentCard — non-blocking submit', () => {
  let enqueue;
  beforeEach(() => {
    vi.useFakeTimers();
    rendererState.url = 'https://renderer.test';
    renderURLImage.mockReset();
    renderParamsMatchPage.mockReturnValue(true);
    captureScreenshot.mockClear();
    captureDOMScreenshot.mockReset();
    urlCaptureSkipReason.mockReturnValue(null);
    markUrlCaptureFailed.mockClear();
    enqueue = vi.fn().mockResolvedValue('q1');
    window.Tapko = { queueManager: { initialized: true, enqueue, processQueue: vi.fn() } };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    rendererState.url = '';
    delete window.Tapko;
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('starts the pre-capture ~1s after open and not before', async () => {
    renderURLImage.mockResolvedValue('data:image/webp;base64,AA');
    makeCard();
    await vi.advanceTimersByTimeAsync(900);
    expect(renderURLImage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(renderURLImage).toHaveBeenCalledTimes(1);
  });

  it('starts it on the first keystroke', () => {
    renderURLImage.mockReturnValue(new Promise(() => {}));
    const card = makeCard();
    card.card.querySelector('textarea').dispatchEvent(new Event('input'));
    expect(renderURLImage).toHaveBeenCalledTimes(1);
  });

  it('cancelling the card aborts the in-flight render', () => {
    renderURLImage.mockReturnValue(new Promise(() => {}));
    const card = makeCard();
    card._startPrecapture();
    const signal = renderURLImage.mock.calls[0][1];
    card.close();
    expect(signal.aborted).toBe(true);
  });

  it('uses a finished pre-capture: screenshot attached, nothing deferred, no blocking capture', async () => {
    renderURLImage.mockResolvedValue('data:image/webp;base64,AA');
    const card = makeCard();
    await vi.advanceTimersByTimeAsync(1100);
    await card._submitQueued('hello', card.card.querySelector('textarea'));
    const [data, opts] = enqueue.mock.calls[0];
    expect(data.screenshot).toBeTruthy();
    expect(data.captureParams).toBeUndefined();
    expect(opts).toBeUndefined();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('waits at most 1.5s for a slow render, then defers it to the queue', async () => {
    renderURLImage.mockReturnValue(new Promise(() => {})); // never resolves
    const card = makeCard();
    await vi.advanceTimersByTimeAsync(1100);
    const submit = card._submitQueued('hello', card.card.querySelector('textarea'));
    await vi.advanceTimersByTimeAsync(1500);
    await submit;
    const [data, opts] = enqueue.mock.calls[0];
    expect(data.screenshot).toBeNull();
    expect(data.captureParams).toMatchObject({ url: 'https://x.test/', devicePixelRatio: 2 });
    expect(data.captureParams.widgetOverlay).toBeTruthy();
    expect(opts.capturePromise).toBeInstanceOf(Promise);
    expect(captureScreenshot).not.toHaveBeenCalled();
    // submit does not abort the render the queue now owns
    card.close(true);
    expect(renderURLImage.mock.calls[0][1].aborted).toBe(false);
  });

  it('discards a stale pre-capture (page scrolled) and falls back to the blocking capture', async () => {
    renderURLImage.mockReturnValue(new Promise(() => {}));
    const card = makeCard();
    await vi.advanceTimersByTimeAsync(1100);
    const first = renderURLImage.mock.calls[0][1];
    renderParamsMatchPage.mockReturnValue(false);
    const submit = card._submitQueued('hello', card.card.querySelector('textarea'));
    await vi.advanceTimersByTimeAsync(1600);
    await submit;
    expect(first.aborted).toBe(true);
  });

  it('keeps DOM mode (renderMode html) on the blocking capture path', async () => {
    const card = makeCard();
    card.renderMode = 'html';
    await vi.advanceTimersByTimeAsync(1100);
    expect(renderURLImage).not.toHaveBeenCalled();
    const submit = card._submitQueued('hello', card.card.querySelector('textarea'));
    await vi.advanceTimersByTimeAsync(1000); // rAF + settle waits inside _captureScreenshot
    await submit;
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
  });

  // #114 resn.co.nz: WebGL hero -> renderer 422 -> comment saved with no screenshot.
  it('skips the URL pre-capture when URL capture would be skipped (live canvas)', async () => {
    urlCaptureSkipReason.mockReturnValue('a live canvas fills the viewport');
    const card = makeCard();
    await vi.advanceTimersByTimeAsync(1100);
    expect(renderURLImage).not.toHaveBeenCalled();
    const submit = card._submitQueued('hello', card.card.querySelector('textarea'));
    await vi.advanceTimersByTimeAsync(1000);
    await submit;
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('a deferred render that fails (422) falls back to the DOM snapshot taken at submit', async () => {
    let reject;
    renderURLImage.mockReturnValue(new Promise((_, r) => { reject = r; }));
    captureDOMScreenshot.mockResolvedValue({ dataURL: 'data:image/jpeg;base64,DOM' });
    const card = makeCard();
    await vi.advanceTimersByTimeAsync(1100);
    const submit = card._submitQueued('hello', card.card.querySelector('textarea'));
    await vi.advanceTimersByTimeAsync(1500);
    await submit;
    const [, opts] = enqueue.mock.calls[0];
    const err = new Error('URL renderer responded with 422');
    reject(err);
    await expect(opts.capturePromise).resolves.toBe('data:image/jpeg;base64,DOM');
    expect(markUrlCaptureFailed).toHaveBeenCalledWith(err);
    const domOpts = captureDOMScreenshot.mock.calls[0][0];
    expect(domOpts.widgetOverlay).toBeTruthy();
    await expect(domOpts.snapshot).resolves.toEqual({ clone: 'snap' });
  });
});
