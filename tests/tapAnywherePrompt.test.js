import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldShowTapPrompt,
  rememberTapDismissal,
  rememberDismissal,
  shouldShowFirstCommentPrompt,
  TAP_PROMPT_DISMISSED_STORAGE_KEY,
  DISMISSED_STORAGE_KEY,
} from '../src/utils/firstCommentPrompt.js';
import { TapAnywherePrompt } from '../src/components/TapAnywherePrompt.js';
import { CONFIG } from '../src/config.js';

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    _data: data,
  };
}

const hostileStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

describe('shouldShowTapPrompt', () => {
  it('prompts inside a guided session', () => {
    expect(shouldShowTapPrompt(true, makeStorage())).toBe(true);
  });

  it('stays quiet outside a guided session, so no ordinary visitor is coached', () => {
    expect(shouldShowTapPrompt(false, makeStorage())).toBe(false);
  });

  it('stays quiet once dismissed in this session', () => {
    const storage = makeStorage({ [TAP_PROMPT_DISMISSED_STORAGE_KEY]: 'true' });
    expect(shouldShowTapPrompt(true, storage)).toBe(false);
  });

  it('prompts anyway when storage is unreadable', () => {
    expect(shouldShowTapPrompt(true, hostileStorage)).toBe(true);
    expect(shouldShowTapPrompt(true, null)).toBe(true);
  });

  it('keeps its dismissal separate from the first prompt in both directions', () => {
    const dismissedFirst = makeStorage();
    rememberDismissal(dismissedFirst);
    expect(shouldShowTapPrompt(true, dismissedFirst)).toBe(true);

    const dismissedTap = makeStorage();
    rememberTapDismissal(dismissedTap);
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=1', false, dismissedTap)).toBe(true);
    expect(dismissedTap.getItem(DISMISSED_STORAGE_KEY)).toBeNull();
  });
});

describe('rememberTapDismissal', () => {
  it('records the dismissal and suppresses a later prompt in the same session', () => {
    const storage = makeStorage();
    rememberTapDismissal(storage);
    expect(storage.getItem(TAP_PROMPT_DISMISSED_STORAGE_KEY)).toBe('true');
    expect(shouldShowTapPrompt(true, storage)).toBe(false);
  });

  it('is a no-op rather than a throw when storage is blocked', () => {
    expect(() => rememberTapDismissal(hostileStorage)).not.toThrow();
    expect(() => rememberTapDismissal(null)).not.toThrow();
  });
});

describe('TapAnywherePrompt', () => {
  let root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root');
  });

  it('tells them to click the page, which is the step feedback mode never states', () => {
    const prompt = new TapAnywherePrompt();
    prompt.show(root);
    expect(root.textContent).toMatch(/Try tapping here/);
    expect(root.textContent).toMatch(/Click anywhere on your page/);
  });

  it('becomes visible when shown', () => {
    const prompt = new TapAnywherePrompt();
    prompt.show(root);
    expect(prompt.isVisible()).toBe(true);
  });

  it('calls back on dismiss so the dismissal can be remembered', () => {
    const onDismiss = vi.fn();
    const prompt = new TapAnywherePrompt();
    prompt.show(root, onDismiss);

    root
      .querySelector(`.${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-close`)
      .dispatchEvent(new Event('click'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(prompt.isVisible()).toBe(false);
  });

  it('stops the dismiss click reaching the feedback overlay behind it', () => {
    const prompt = new TapAnywherePrompt();
    prompt.show(root);

    const onOverlayClick = vi.fn();
    root.addEventListener('click', onOverlayClick);

    root
      .querySelector(`.${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-close`)
      .dispatchEvent(new Event('click', { bubbles: true }));

    expect(onOverlayClick).not.toHaveBeenCalled();
  });

  it('hides without calling the dismiss callback when the prompt was followed', () => {
    const onDismiss = vi.fn();
    const prompt = new TapAnywherePrompt();
    prompt.show(root, onDismiss);

    prompt.hide();

    expect(onDismiss).not.toHaveBeenCalled();
    expect(prompt.isVisible()).toBe(false);
  });

  it('can be shown again after being hidden, without stacking a second copy', () => {
    const prompt = new TapAnywherePrompt();
    prompt.show(root);
    prompt.hide();
    prompt.show(root);

    expect(prompt.isVisible()).toBe(true);
    expect(root.querySelectorAll(`.${CONFIG.CLASS_PREFIX}tap-anywhere-prompt`)).toHaveLength(1);
  });

  it('gives the dismiss control an accessible name and announces politely', () => {
    const prompt = new TapAnywherePrompt();
    prompt.show(root);
    const el = root.querySelector(`.${CONFIG.CLASS_PREFIX}tap-anywhere-prompt`);
    const closeBtn = root.querySelector(`.${CONFIG.CLASS_PREFIX}tap-anywhere-prompt-close`);
    expect(closeBtn.getAttribute('aria-label')).toBe('Dismiss');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('removes itself on destroy', () => {
    const prompt = new TapAnywherePrompt();
    prompt.show(root);
    prompt.destroy();
    expect(root.querySelector(`.${CONFIG.CLASS_PREFIX}tap-anywhere-prompt`)).toBeNull();
  });
});
