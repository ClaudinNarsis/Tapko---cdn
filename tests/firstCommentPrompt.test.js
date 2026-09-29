import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldShowFirstCommentPrompt,
  rememberDismissal,
  FIRST_COMMENT_PARAM,
  DISMISSED_STORAGE_KEY,
} from '../src/utils/firstCommentPrompt.js';
import { FirstCommentPrompt } from '../src/components/FirstCommentPrompt.js';
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

// Storage that throws on every access — private browsing / blocked cookies.
const hostileStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

describe('shouldShowFirstCommentPrompt', () => {
  it('prompts on ?tapko_feedback=1', () => {
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=1', false, makeStorage())).toBe(true);
  });

  it('prompts on ?tapko_feedback=true, case-insensitively', () => {
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=TRUE', false, makeStorage())).toBe(true);
  });

  it('stays quiet with no parameter', () => {
    expect(shouldShowFirstCommentPrompt('', false, makeStorage())).toBe(false);
    expect(shouldShowFirstCommentPrompt('?utm_source=tapko', false, makeStorage())).toBe(false);
  });

  it('stays quiet for an explicit falsy value, so a shared link cannot prompt a visitor', () => {
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=0', false, makeStorage())).toBe(false);
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=false', false, makeStorage())).toBe(false);
  });

  it('stays quiet when the project is not collecting feedback', () => {
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=1', true, makeStorage())).toBe(false);
  });

  it('stays quiet once dismissed in this session, since the link is still the page URL', () => {
    const storage = makeStorage({ [DISMISSED_STORAGE_KEY]: 'true' });
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=1', false, storage)).toBe(false);
  });

  it('prompts anyway when storage is unreadable, rather than suppressing the guidance', () => {
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=1', false, hostileStorage)).toBe(true);
  });

  it('prompts when there is no storage at all', () => {
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=1', false, null)).toBe(true);
  });

  it('survives a null/undefined search string', () => {
    expect(shouldShowFirstCommentPrompt(undefined, false, makeStorage())).toBe(false);
  });

  it('exports the param name so callers build the link from one source', () => {
    expect(FIRST_COMMENT_PARAM).toBe('tapko_feedback');
  });
});

describe('rememberDismissal', () => {
  it('records the dismissal', () => {
    const storage = makeStorage();
    rememberDismissal(storage);
    expect(storage.getItem(DISMISSED_STORAGE_KEY)).toBe('true');
  });

  it('is a no-op rather than a throw when storage is blocked', () => {
    expect(() => rememberDismissal(hostileStorage)).not.toThrow();
    expect(() => rememberDismissal(null)).not.toThrow();
  });

  it('suppresses a later prompt in the same session', () => {
    const storage = makeStorage();
    rememberDismissal(storage);
    expect(shouldShowFirstCommentPrompt('?tapko_feedback=1', false, storage)).toBe(false);
  });
});

describe('FirstCommentPrompt', () => {
  let root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root');
  });

  it('points at the button rather than opening feedback mode', () => {
    const prompt = new FirstCommentPrompt();
    prompt.show(root);
    expect(root.textContent).toMatch(/Click the Tapko button to start leaving feedback/);
  });

  it('becomes visible when shown', () => {
    const prompt = new FirstCommentPrompt();
    prompt.show(root);
    expect(prompt.isVisible()).toBe(true);
  });

  it('calls back on dismiss so the dismissal can be remembered', () => {
    const onDismiss = vi.fn();
    const prompt = new FirstCommentPrompt();
    prompt.show(root, onDismiss);

    root
      .querySelector(`.${CONFIG.CLASS_PREFIX}first-comment-prompt-close`)
      .dispatchEvent(new Event('click'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(prompt.isVisible()).toBe(false);
  });

  it('hides without calling the dismiss callback when the prompt was followed', () => {
    const onDismiss = vi.fn();
    const prompt = new FirstCommentPrompt();
    prompt.show(root, onDismiss);

    prompt.hide();

    expect(onDismiss).not.toHaveBeenCalled();
    expect(prompt.isVisible()).toBe(false);
  });

  it('gives the dismiss control an accessible name', () => {
    const prompt = new FirstCommentPrompt();
    prompt.show(root);
    const closeBtn = root.querySelector(`.${CONFIG.CLASS_PREFIX}first-comment-prompt-close`);
    expect(closeBtn.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('announces politely, so it cannot interrupt a screen reader mid-page', () => {
    const prompt = new FirstCommentPrompt();
    prompt.show(root);
    const el = root.querySelector(`.${CONFIG.CLASS_PREFIX}first-comment-prompt`);
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('does not stack a second copy of itself', () => {
    const prompt = new FirstCommentPrompt();
    prompt.show(root);
    prompt.show(root);
    expect(root.querySelectorAll(`.${CONFIG.CLASS_PREFIX}first-comment-prompt`)).toHaveLength(1);
  });

  it('removes itself on destroy', () => {
    const prompt = new FirstCommentPrompt();
    prompt.show(root);
    prompt.destroy();
    expect(root.querySelector(`.${CONFIG.CLASS_PREFIX}first-comment-prompt`)).toBeNull();
  });
});
