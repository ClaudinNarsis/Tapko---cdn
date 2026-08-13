import { describe, it, expect, afterEach, vi } from 'vitest';

// Live "/" priority suggestion dropdown — typing just "/" (or a partial
// word like "/h") should surface a dropdown of matching priorities
// immediately, before the full word is finished and the chip
// (CommentCard.priorityChip.test.js) would ever appear. This is the fix
// for the gap flagged in design review: mid-typing ("/", "/h", "/hi") gave
// zero feedback before this, so the visitor couldn't tell if they were on
// a recognized path until they'd already typed the whole word.
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

function dropdown(card) {
  return card.card.querySelector(`.${CONFIG.CLASS_PREFIX}priority-suggest`);
}

function items(card) {
  return [...dropdown(card).querySelectorAll(`.${CONFIG.CLASS_PREFIX}priority-suggest-item`)];
}

// jsdom's HTMLTextAreaElement supports setSelectionRange/selectionStart, so
// we can set the caret precisely rather than always assuming end-of-text.
function typeText(card, value, caretIndex = value.length) {
  const ta = textarea(card);
  ta.value = value;
  ta.setSelectionRange(caretIndex, caretIndex);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function keydown(card, key) {
  const ta = textarea(card);
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  ta.dispatchEvent(event);
  return event;
}

describe('CommentCard — live "/" priority suggestion dropdown', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is hidden when the card first opens', () => {
    const card = makeCard();
    expect(dropdown(card).hidden).toBe(true);
  });

  it('opens with all three priorities right after typing "/"', () => {
    const card = makeCard();
    typeText(card, 'fix this /');
    expect(dropdown(card).hidden).toBe(false);
    expect(items(card).map((el) => el.textContent)).toEqual(['Low', 'Medium', 'High']);
  });

  it('narrows to a single match as more letters are typed', () => {
    const card = makeCard();
    typeText(card, 'fix this /h');
    expect(items(card).map((el) => el.textContent)).toEqual(['High']);
  });

  it('shows "No matching priority" instead of silently showing nothing', () => {
    const card = makeCard();
    typeText(card, 'fix this /x');
    expect(dropdown(card).hidden).toBe(false);
    expect(dropdown(card).textContent).toContain('No matching priority');
  });

  it('closes once the full word is typed — the chip takes over from there', () => {
    const card = makeCard();
    typeText(card, 'fix this /high');
    expect(dropdown(card).hidden).toBe(true);
  });

  it('closes when the "/" command is deleted', () => {
    const card = makeCard();
    typeText(card, 'fix this /h');
    expect(dropdown(card).hidden).toBe(false);

    typeText(card, 'fix this ');
    expect(dropdown(card).hidden).toBe(true);
  });

  it('closes when the caret moves away from the "/" command, even without new typing', () => {
    const card = makeCard();
    typeText(card, '/h rest of message', 2); // caret right after "/h"
    expect(dropdown(card).hidden).toBe(false);

    const ta = textarea(card);
    ta.setSelectionRange(18, 18); // move caret to end, away from "/h"
    ta.dispatchEvent(new Event('click', { bubbles: true }));
    expect(dropdown(card).hidden).toBe(true);
  });

  it('highlights the first match by default', () => {
    const card = makeCard();
    typeText(card, '/');
    const active = dropdown(card).querySelector(`.${CONFIG.CLASS_PREFIX}priority-suggest-item--active`);
    expect(active.textContent).toBe('Low');
  });

  it('ArrowDown/ArrowUp move the highlight and wrap around', () => {
    const card = makeCard();
    typeText(card, '/');

    keydown(card, 'ArrowDown');
    let active = dropdown(card).querySelector(`.${CONFIG.CLASS_PREFIX}priority-suggest-item--active`);
    expect(active.textContent).toBe('Medium');

    keydown(card, 'ArrowDown');
    active = dropdown(card).querySelector(`.${CONFIG.CLASS_PREFIX}priority-suggest-item--active`);
    expect(active.textContent).toBe('High');

    keydown(card, 'ArrowDown'); // wraps back to the first item
    active = dropdown(card).querySelector(`.${CONFIG.CLASS_PREFIX}priority-suggest-item--active`);
    expect(active.textContent).toBe('Low');

    keydown(card, 'ArrowUp'); // wraps backward to the last item
    active = dropdown(card).querySelector(`.${CONFIG.CLASS_PREFIX}priority-suggest-item--active`);
    expect(active.textContent).toBe('High');
  });

  it('Tab accepts the highlighted suggestion, completing the word in the textarea', () => {
    const card = makeCard();
    typeText(card, 'fix this /h');

    const event = keydown(card, 'Tab');
    expect(event.defaultPrevented).toBe(true); // consumed by the dropdown, not focus-move
    expect(textarea(card).value).toBe('fix this /high');
    expect(dropdown(card).hidden).toBe(true);
  });

  it('Enter accepts the highlighted suggestion instead of submitting', () => {
    const card = makeCard();
    typeText(card, 'fix this /m');

    const event = keydown(card, 'Enter');
    expect(event.defaultPrevented).toBe(true); // consumed by the dropdown, not submit
    expect(textarea(card).value).toBe('fix this /medium');
    expect(dropdown(card).hidden).toBe(true);
  });

  it('accepting a suggestion shows the matching chip immediately', () => {
    const card = makeCard();
    typeText(card, 'fix this /h');
    keydown(card, 'Tab');

    const chip = card.card.querySelector(`.${CONFIG.CLASS_PREFIX}priority-chip`);
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe('High priority');
  });

  it('Escape closes the dropdown without closing the whole comment card', () => {
    const card = makeCard();
    const closeSpy = vi.spyOn(card, 'close');
    typeText(card, 'fix this /h');

    const event = keydown(card, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(dropdown(card).hidden).toBe(true);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('Escape closes the card as normal when the dropdown is not open', () => {
    const card = makeCard();
    const closeSpy = vi.spyOn(card, 'close');
    typeText(card, 'fix this button');

    keydown(card, 'Escape');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('Enter still submits as normal when the dropdown is not open', () => {
    const card = makeCard();
    const submitSpy = vi.spyOn(card, 'submit').mockImplementation(() => {});
    typeText(card, 'just a normal comment');

    keydown(card, 'Enter');
    expect(submitSpy).toHaveBeenCalled();
  });

  it('Enter falls through to its default submit behavior when the dropdown shows "no match"', () => {
    // Enter always preventDefaults (it never inserts a newline), so the
    // meaningful assertion here is that submit() still runs — the dropdown
    // branch declined to consume the key itself and let normal handling
    // continue, rather than swallowing Enter with nothing accepted.
    const card = makeCard();
    const submitSpy = vi.spyOn(card, 'submit').mockImplementation(() => {});
    typeText(card, 'fix this /x');

    keydown(card, 'Enter');
    expect(submitSpy).toHaveBeenCalled();
  });

  it('clicking a suggestion accepts it', () => {
    const card = makeCard();
    typeText(card, 'fix this /');

    const highItem = items(card).find((el) => el.textContent === 'High');
    highItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(textarea(card).value).toBe('fix this /high');
    expect(dropdown(card).hidden).toBe(true);
  });
});
