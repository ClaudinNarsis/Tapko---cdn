import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Auth-redirect render-mode plan (T9) — CommentCard gains a renderMode
// constructor parameter and must forward it into both of its
// captureScreenshot() call sites (:342 in _handleDrawClick, :1145 in
// _captureScreenshot). screenshot.js is mocked here since these tests only
// care about what CommentCard passes to it, not the real capture pipeline
// (that's covered separately in screenshot.renderMode.test.js).
const captureScreenshotMock = vi.fn();
vi.mock('../src/utils/screenshot.js', () => ({
  captureScreenshot: captureScreenshotMock,
  dataURLToBlob: vi.fn(),
  generateThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,thumb'),
}));

const { CommentCard } = await import('../src/components/CommentCard.js');

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makeCard(renderMode) {
  const target = makeTarget();
  const apiClient = { userId: 'u1', projectId: 'p1' };
  return renderMode === undefined
    ? new CommentCard(target, { x: 10, y: 10 }, apiClient, document.body, null)
    : new CommentCard(target, { x: 10, y: 10 }, apiClient, document.body, null, { renderMode });
}

describe('CommentCard — renderMode constructor param (T9)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('defaults renderMode to "url" when omitted (existing call sites, unchanged behavior)', () => {
    const card = makeCard(undefined);
    expect(card.renderMode).toBe('url');
  });

  it('stores an explicitly passed renderMode', () => {
    const card = makeCard('html');
    expect(card.renderMode).toBe('html');
  });
});

describe('CommentCard — forwards renderMode into captureScreenshot() (T9)', () => {
  beforeEach(() => {
    captureScreenshotMock.mockReset();
    captureScreenshotMock.mockResolvedValue({ dataURL: 'data:image/png;base64,xx', metadata: {} });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('forwards renderMode from the _captureScreenshot() call site (:1145)', async () => {
    const card = makeCard('html');

    await card._captureScreenshot(null);

    expect(captureScreenshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ renderMode: 'html' })
    );
  });

  it('forwards renderMode "url" unchanged from the _captureScreenshot() call site (:1145)', async () => {
    const card = makeCard('url');

    await card._captureScreenshot(null);

    expect(captureScreenshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ renderMode: 'url' })
    );
  });

  it('forwards renderMode from the _handleDrawClick() call site (:342)', async () => {
    const card = makeCard('html');
    // Bypass the annotation-resize pipeline (real Image decoding — not what
    // this test is verifying) so the test stays focused on the
    // captureScreenshot() call arguments.
    vi.spyOn(card, '_resizeScreenshotForAnnotation').mockResolvedValue('data:image/jpeg;base64,resized');
    card.onDrawRequested = vi.fn();

    await card._handleDrawClick();

    expect(captureScreenshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ renderMode: 'html' })
    );
    expect(card.onDrawRequested).toHaveBeenCalled();
  });

  it('forwards renderMode "url" unchanged from the _handleDrawClick() call site (:342)', async () => {
    const card = makeCard('url');
    vi.spyOn(card, '_resizeScreenshotForAnnotation').mockResolvedValue('data:image/jpeg;base64,resized');
    card.onDrawRequested = vi.fn();

    await card._handleDrawClick();

    expect(captureScreenshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ renderMode: 'url' })
    );
  });
});

// When every capture path fails, captureScreenshot() returns null. The Draw
// button used to hit a TypeError on screenshotData.dataURL and fire a native
// alert() that blocked the host page; it must show an inline error instead.
describe('CommentCard — Draw click when no screenshot can be captured', () => {
  beforeEach(() => {
    captureScreenshotMock.mockReset();
    captureScreenshotMock.mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows an inline error, no alert(), and does not open drawing mode', async () => {
    const card = makeCard('url');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const errorSpy = vi.spyOn(card, '_showError');
    card.onDrawRequested = vi.fn();

    await card._handleDrawClick();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Couldn't capture a screenshot"));
    expect(card.onDrawRequested).not.toHaveBeenCalled();
    expect(card.card.style.display).toBe('');
  });
});
