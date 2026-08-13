import { describe, it, expect, afterEach, vi } from 'vitest';

// Live priority chip — typing /high /medium /low into the textarea should
// surface a chip immediately (on 'input', not just at submit time), giving
// the visitor confirmation the command was recognized before they submit.
//
// NOTE: these assertions check the `hidden` DOM property, which is what
// _updatePriorityChip() sets. A real regression happened here that this
// suite could NOT catch: .dtc-priority-chip had an explicit `display:
// inline-flex` rule in widget.css, which (per CSS cascade rules) overrides
// the UA stylesheet's `[hidden] { display: none }` — so the chip stayed
// visually visible with stale content even though `chip.hidden === true`.
// jsdom doesn't apply the real stylesheet cascade, so it can't see this;
// the fix (a `.dtc-priority-chip[hidden] { display: none }` override in
// widget.css) was only confirmed by loading the built widget in a real
// browser and watching the chip actually disappear.
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

function makeCard() {
  const target = makeTarget();
  const apiClient = { userId: 'u1', projectId: 'p1' };
  return new CommentCard(target, { x: 10, y: 10 }, apiClient, document.body, null, {});
}

function textarea(card) {
  return card.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-textarea`);
}

function chip(card) {
  return card.card.querySelector(`.${CONFIG.CLASS_PREFIX}priority-chip`);
}

function microLabel(card) {
  return card.card.querySelector(`.${CONFIG.CLASS_PREFIX}comment-micro-label`);
}

function typeText(card, value) {
  const ta = textarea(card);
  ta.value = value;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('CommentCard — live priority chip', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is hidden when the card first opens', () => {
    const card = makeCard();
    expect(chip(card).hidden).toBe(true);
    expect(microLabel(card).hidden).toBe(false);
  });

  it('shows a "High priority" chip immediately after typing /high', () => {
    const card = makeCard();
    typeText(card, 'this is broken /high');
    expect(chip(card).hidden).toBe(false);
    expect(chip(card).textContent).toBe('High priority');
    expect(chip(card).className).toContain(`${CONFIG.CLASS_PREFIX}priority-chip--high`);
  });

  it('shows the matching chip for /medium and /low', () => {
    const card = makeCard();
    typeText(card, '/medium please look at this');
    expect(chip(card).textContent).toBe('Medium priority');

    typeText(card, '/low minor nit');
    expect(chip(card).textContent).toBe('Low priority');
  });

  it('hides the chip again once the command is deleted', () => {
    const card = makeCard();
    typeText(card, 'fix this /high');
    expect(chip(card).hidden).toBe(false);

    typeText(card, 'fix this ');
    expect(chip(card).hidden).toBe(true);
  });

  it('does not show a chip for a partial/in-progress word like /hig', () => {
    const card = makeCard();
    typeText(card, 'fix this /hig');
    expect(chip(card).hidden).toBe(true);
  });

  it('hides the micro-label tip while the chip is showing, to avoid duplicate text', () => {
    const card = makeCard();
    typeText(card, 'fix this /high');
    expect(microLabel(card).hidden).toBe(true);

    typeText(card, 'fix this ');
    expect(microLabel(card).hidden).toBe(false);
  });

  it('updates to the last command when the user revises priority mid-message', () => {
    const card = makeCard();
    typeText(card, '/low actually no /high this is bad');
    expect(chip(card).textContent).toBe('High priority');
  });
});
