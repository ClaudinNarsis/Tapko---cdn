import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/utils/screenshot.js', () => ({
  captureScreenshot: vi.fn(),
  dataURLToBlob: vi.fn(),
  generateThumbnail: vi.fn(),
}));

const { CommentCard } = await import('../src/components/CommentCard.js');
const { CONFIG } = await import('../src/config.js');

function makeCard() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return new CommentCard(target, { x: 10, y: 10 }, { userId: 'u1', projectId: 'p1' }, document.body, null, {});
}
const recordBtn = (card) => card.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-record`);

describe('CommentCard — Record button', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('is hidden when getDisplayMedia is unsupported (iOS)', () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn() } });
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    expect(recordBtn(makeCard())).toBeNull();
  });

  it('is shown when getDisplayMedia and webm recording are supported, and survives a re-render', () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getDisplayMedia: vi.fn() } });
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (t) => t === 'video/webm' });
    const card = makeCard();
    expect(recordBtn(card).textContent).toBe('Record screen');
    card.recording = { blob: new Blob(['x']), duration: 42000 };
    card._renderBubbleContent();
    expect(card.card.querySelector(`.${CONFIG.CLASS_PREFIX}record-attached`).textContent).toBe('Recording attached (0:42)');
  });
});
