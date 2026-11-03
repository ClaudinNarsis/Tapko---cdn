import { describe, it, expect, afterEach, vi } from 'vitest';

// Feedback text must be stored raw (TapKo app + ClickUp showed `&amp;`
// when the widget pre-escaped it) and escaped only at render time.
vi.mock('../src/utils/screenshot.js', () => ({
  captureScreenshot: vi.fn(),
  dataURLToBlob: vi.fn(() => new Blob(['x'])),
  generateThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,thumb'),
}));

const { CommentCard } = await import('../src/components/CommentCard.js');
const { CONFIG } = await import('../src/config.js');

describe('CommentCard — queued submit stores raw text', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.Tapko;
  });

  it('enqueues the raw description and still escapes it in the queued bubble', async () => {
    const enqueue = vi.fn().mockResolvedValue('q1');
    window.Tapko = { queueManager: { enqueue } };
    const target = document.createElement('div');
    document.body.appendChild(target);
    const card = new CommentCard(target, { x: 10, y: 10 }, { userId: 'u1', projectId: 'p1' }, document.body, null, {});
    card.screenshot = 'data:image/png;base64,x';

    const text = 'Tom & Jerry <img src=x onerror=alert(1)>';
    card.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`).value = text;
    await card._submitQueued(text, card.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`));

    expect(enqueue.mock.calls[0][0].description).toBe(text);
    const shown = card.card.querySelector(`.${CONFIG.CLASS_PREFIX}feedback-text`);
    expect(shown.textContent).toBe(text);
    expect(shown.querySelector('img')).toBeNull();
  });
});
