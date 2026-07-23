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
