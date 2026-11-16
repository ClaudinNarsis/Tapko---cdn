import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Submit-latency work: DPR is capped at 1 for renders, renderer POSTs have a
// hard timeout, and a timeout does NOT chain into the (slower) DOM fallback.
describe('URL render request', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RENDERER_URL', 'https://renderer.example.com');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends devicePixelRatio 1 even on a DPR 2 screen', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ format: 'webp', image: 'AAAA' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { renderURLImage } = await import('../src/utils/screenshot.js');
    await renderURLImage({ url: 'https://x.test/', width: 1000, height: 600, scrollX: 0, scrollY: 40, devicePixelRatio: 2 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.devicePixelRatio).toBe(1);
    expect(body.scrollY).toBe(40);
  });

  it('aborts the renderer fetch after the timeout with a TimeoutError', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
    })));
    const { renderURLImage } = await import('../src/utils/screenshot.js');
    const p = renderURLImage({ url: 'https://x.test/', width: 1, height: 1, devicePixelRatio: 1 });
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(12001);
    await assertion;
  });

  it('honours a caller abort signal and captureScreenshot returns null without the DOM fallback', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
    })));
    const { captureScreenshot } = await import('../src/utils/screenshot.js');
    const ctrl = new AbortController();
    const p = captureScreenshot({ signal: ctrl.signal });
    ctrl.abort(new DOMException('cancelled', 'AbortError'));
    expect(await p).toBeNull();
    expect(logSpy).not.toHaveBeenCalledWith('[Tapko] Analysing page');
  });
});
