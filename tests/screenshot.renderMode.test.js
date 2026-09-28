import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Auth-redirect render-mode plan (T9) — regression test for the shared
// production capture path in captureScreenshot()'s orchestrator. Locks in:
// (1) unchanged today's URL-first behavior when renderMode is 'url'/unset,
// (2) the new skip-to-DOM-serialization behavior when renderMode is 'html'.
//
// captureURLScreenshot/captureDOMScreenshot are internal (same-module,
// non-exported-binding) calls, so they can't be intercepted via vi.mock —
// instead this asserts on the orchestrator's own log lines, which uniquely
// identify which branch it took, without needing the underlying capture
// functions (which need real network/canvas/DOM APIs) to actually succeed.
describe('captureScreenshot — renderMode branch (T9)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RENDERER_URL', 'https://renderer.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('attempts URL-based screenshot first when renderMode is "url" (unchanged behavior)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { captureScreenshot } = await import('../src/utils/screenshot.js');

    await captureScreenshot({ renderMode: 'url' });

    expect(logSpy).toHaveBeenCalledWith('[Tapko] Attempting URL-based screenshot');
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('skipping URL-based screenshot')
    );
  });

  it('attempts URL-based screenshot first when renderMode is undefined (existing projects, unchanged behavior)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { captureScreenshot } = await import('../src/utils/screenshot.js');

    await captureScreenshot({});

    expect(logSpy).toHaveBeenCalledWith('[Tapko] Attempting URL-based screenshot');
  });

  it('skips URL-based screenshot and goes straight to DOM serialization when renderMode is "html"', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { captureScreenshot } = await import('../src/utils/screenshot.js');

    await captureScreenshot({ renderMode: 'html' });

    expect(logSpy).not.toHaveBeenCalledWith('[Tapko] Attempting URL-based screenshot');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('renderMode is "html" — skipping URL-based screenshot')
    );
  });
});

// screenshotMode 'local' used to be a dead end: HiDPI returned null and a
// denied getDisplayMedia threw, so feedback was submitted with no screenshot.
// It must now fall back to DOM serialization (never URL navigation).
describe('captureScreenshot — screenshotMode "local" fallback', () => {
  const DOM_FALLBACK_LOG = expect.stringContaining('renderMode is "html" — skipping URL-based screenshot');

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RENDERER_URL', 'https://renderer.example.com');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete navigator.mediaDevices;
    vi.restoreAllMocks();
    window.devicePixelRatio = 1;
  });

  it('falls back to DOM serialization on HiDPI instead of returning no screenshot', async () => {
    window.devicePixelRatio = 2;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { captureScreenshot } = await import('../src/utils/screenshot.js');

    await captureScreenshot({ screenshotMode: 'local' });

    expect(logSpy).toHaveBeenCalledWith(DOM_FALLBACK_LOG);
    expect(logSpy).not.toHaveBeenCalledWith('[Tapko] Attempting URL-based screenshot');
  });

  it('falls back to DOM serialization when screen capture permission is denied', async () => {
    window.devicePixelRatio = 1;
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: vi.fn().mockRejectedValue(denied) } });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { captureScreenshot } = await import('../src/utils/screenshot.js');

    await captureScreenshot({ screenshotMode: 'local' });

    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(DOM_FALLBACK_LOG);
    expect(logSpy).not.toHaveBeenCalledWith('[Tapko] Attempting URL-based screenshot');
  });
});

// Regression test: when the visitor has scrolled, captureDOMScreenshot() used
// to shift <body> up via a negative margin without clipping <html> to the
// viewport. <html> grew to fit the shifted body, so the renderer's unscrolled
// top-left `width x height` capture landed on blank space above the real
// content instead of on it — a blank screenshot for any scrollY/scrollX > 0.
describe('captureDOMScreenshot — clips the document to the viewport after the scroll-offset shift', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RENDERER_URL', 'https://renderer.example.com');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('constrains the cloned <html> to viewportWidth x viewportHeight with overflow hidden', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 800 });
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 });
    // jsdom's CSSStyleDeclaration isn't iterable, unrelated to the fix under
    // test — stub getComputedStyle so captureDOMScreenshot can run to completion.
    vi.stubGlobal('getComputedStyle', vi.fn(() => Object.assign([], { getPropertyValue: () => '' })));

    let sentHtml = '';
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      sentHtml = JSON.parse(init.body).html;
      return { ok: true, json: async () => ({ format: 'webp', image: 'AAAA' }) };
    }));

    const { captureScreenshot } = await import('../src/utils/screenshot.js');
    const result = await captureScreenshot({ renderMode: 'html' });

    expect(result).not.toBeNull();
    expect(sentHtml).toMatch(/<html[^>]*overflow:\s*hidden/);
    expect(sentHtml).toMatch(new RegExp(`<html[^>]*width:\\s*${window.innerWidth}px`));
    expect(sentHtml).toMatch(new RegExp(`<html[^>]*height:\\s*${window.innerHeight}px`));
  });
});

// Regression test: cloneNode(true) only copies an <iframe src="..."> tag, not
// its live contentDocument. Sites that render real content inside a
// same-origin iframe (e.g. an embedded preview pane) ended up with an empty
// iframe shell in the serialized HTML — the renderer painted only the outer
// page's background, matching the "blank DOM screenshot" bug report.
describe('captureDOMScreenshot — inlines same-origin iframe content', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RENDERER_URL', 'https://renderer.example.com');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('getComputedStyle', vi.fn(() => Object.assign([], { getPropertyValue: () => '' })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll('iframe').forEach(el => el.remove());
  });

  it('replaces a same-origin iframe with its rendered content instead of an empty shell', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write('<html><body><div id="preview-content">Rendered preview</div></body></html>');
    iframe.contentDocument.close();

    let sentHtml = '';
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      sentHtml = JSON.parse(init.body).html;
      return { ok: true, json: async () => ({ format: 'webp', image: 'AAAA' }) };
    }));

    const { captureScreenshot } = await import('../src/utils/screenshot.js');
    const result = await captureScreenshot({ renderMode: 'html' });

    expect(result).not.toBeNull();
    expect(sentHtml).toContain('Rendered preview');
    expect(sentHtml).not.toContain('<iframe');
  });
});
