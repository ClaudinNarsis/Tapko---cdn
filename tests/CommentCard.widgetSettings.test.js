import { describe, it, expect, vi, afterEach } from 'vitest';

// Widget-copy plan — CommentCard gains placeholderText/submitButtonText via
// the options object (alongside renderMode, see CommentCard.renderMode.test.js)
// and must apply them via imperative DOM property assignment at BOTH render
// call sites: _createCard() (initial) and _renderBubbleContent() (re-render
// after drawing/minimize-restore) — a prior version of this feature only
// covered the first, letting custom copy silently revert to default.
vi.mock('../src/utils/screenshot.js', () => ({
  captureScreenshot: vi.fn(),
  dataURLToBlob: vi.fn(),
  generateThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,thumb'),
}));

const { CommentCard } = await import('../src/components/CommentCard.js');
const { CONFIG } = await import('../src/config.js');

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makeCard(options = {}) {
  const target = makeTarget();
  const apiClient = { userId: 'u1', projectId: 'p1' };
  return new CommentCard(target, { x: 10, y: 10 }, apiClient, document.body, null, options);
}

function textarea(card) {
  return card.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
}

function submitBtn(card) {
  return card.card.querySelector(`.${CONFIG.CLASS_PREFIX}btn-submit`);
}

describe('CommentCard — widgetSettings, _createCard() (initial render)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applies custom placeholderText and submitButtonText (happy path)', () => {
    const card = makeCard({ placeholderText: 'Tell us more', submitButtonText: 'Send' });
    expect(textarea(card).placeholder).toBe('Tell us more');
    expect(submitBtn(card).textContent).toBe('Send');
  });

  it('falls back to CONFIG.DEFAULTS when options are omitted (legacy project)', () => {
    const card = makeCard({});
    expect(textarea(card).placeholder).toBe(CONFIG.DEFAULTS.commentPlaceholderText);
    expect(submitBtn(card).textContent).toBe(CONFIG.DEFAULTS.submitButtonText);
  });

  it('falls back to CONFIG.DEFAULTS when fields are empty strings (explicit reset)', () => {
    const card = makeCard({ placeholderText: '', submitButtonText: '' });
    expect(textarea(card).placeholder).toBe(CONFIG.DEFAULTS.commentPlaceholderText);
    expect(submitBtn(card).textContent).toBe(CONFIG.DEFAULTS.submitButtonText);
  });

  it('renders an adversarial payload as literal text, not executed markup', () => {
    const payload = '"><img src=x onerror=alert(1)>';
    const card = makeCard({ placeholderText: payload, submitButtonText: payload });
    expect(textarea(card).placeholder).toBe(payload);
    expect(submitBtn(card).textContent).toBe(payload);
    expect(card.card.querySelector('img')).toBeNull();
  });
});

describe('CommentCard — widgetSettings, _renderBubbleContent() (re-render)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('custom copy survives a re-render (drawing/minimize-restore), not just initial creation', () => {
    const card = makeCard({ placeholderText: 'Tell us more', submitButtonText: 'Send' });
    card._renderBubbleContent();
    expect(textarea(card).placeholder).toBe('Tell us more');
    expect(submitBtn(card).textContent).toBe('Send');
  });

  it('falls back to CONFIG.DEFAULTS on re-render when options are omitted', () => {
    const card = makeCard({});
    card._renderBubbleContent();
    expect(textarea(card).placeholder).toBe(CONFIG.DEFAULTS.commentPlaceholderText);
    expect(submitBtn(card).textContent).toBe(CONFIG.DEFAULTS.submitButtonText);
  });

  it('falls back to CONFIG.DEFAULTS on re-render when fields are empty strings', () => {
    const card = makeCard({ placeholderText: '', submitButtonText: '' });
    card._renderBubbleContent();
    expect(textarea(card).placeholder).toBe(CONFIG.DEFAULTS.commentPlaceholderText);
    expect(submitBtn(card).textContent).toBe(CONFIG.DEFAULTS.submitButtonText);
  });

  it('renders an adversarial payload as literal text on re-render, not executed markup', () => {
    const payload = '"><img src=x onerror=alert(1)>';
    const card = makeCard({ placeholderText: payload, submitButtonText: payload });
    card._renderBubbleContent();
    expect(textarea(card).placeholder).toBe(payload);
    expect(submitBtn(card).textContent).toBe(payload);
    expect(card.card.querySelector('img')).toBeNull();
  });

  it('preserves the visitor\'s in-progress comment text across a re-render', () => {
    const card = makeCard({});
    textarea(card).value = 'my draft comment';
    card._renderBubbleContent();
    expect(textarea(card).value).toBe('my draft comment');
  });

  it('renders an adversarial currentText payload as literal value, not executed markup (pre-existing XSS fix)', () => {
    const card = makeCard({});
    textarea(card).value = '</textarea><img src=x onerror=alert(1)>';
    card._renderBubbleContent();
    expect(textarea(card).value).toBe('</textarea><img src=x onerror=alert(1)>');
    expect(card.card.querySelector('img')).toBeNull();
  });
});

describe('CommentCard — widgetSettings end-to-end wiring (index.js -> CommentCard options)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('maps project.widgetSettings into the options object the same way index.js does', () => {
    // Mirrors the exact mapping in index.js's _handleFeedbackTap: reads
    // this.projectData?.widgetSettings?.{placeholderText,submitButtonText}
    // into the CommentCard options object. Proves the wiring shape, not a
    // re-test of _createCard()'s own fallback logic (covered above).
    const projectData = {
      renderMode: 'url',
      widgetSettings: { placeholderText: 'What made your day?', submitButtonText: 'Send it' },
    };
    const options = {
      renderMode: projectData?.renderMode,
      placeholderText: projectData?.widgetSettings?.placeholderText,
      submitButtonText: projectData?.widgetSettings?.submitButtonText,
    };
    const card = makeCard(options);
    expect(textarea(card).placeholder).toBe('What made your day?');
    expect(submitBtn(card).textContent).toBe('Send it');
  });

  it('maps a legacy project with no widgetSettings to defaults, not undefined/errors', () => {
    const projectData = { renderMode: 'url' };
    const options = {
      renderMode: projectData?.renderMode,
      placeholderText: projectData?.widgetSettings?.placeholderText,
      submitButtonText: projectData?.widgetSettings?.submitButtonText,
    };
    const card = makeCard(options);
    expect(textarea(card).placeholder).toBe(CONFIG.DEFAULTS.commentPlaceholderText);
    expect(submitBtn(card).textContent).toBe(CONFIG.DEFAULTS.submitButtonText);
  });
});
