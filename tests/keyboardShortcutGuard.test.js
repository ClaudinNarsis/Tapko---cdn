import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installKeyboardShortcutGuard, isTextEntryFocused } from '../src/utils/keyboardShortcutGuard.js';

// Regression test for: widget textarea silently drops keystrokes (reported
// as "can't type the letter c") when a host page has its own capture-phase
// keydown listener that preventDefault()s a shortcut key. Repro required a
// real browser with the built widget embedded on a page with a conflicting
// shortcut — see investigation notes. The mechanism is standard DOM capture
// ordering, which jsdom models correctly, so it's exercised here directly
// against window without needing the full TapkoWidget/shadow DOM stack.

function makeShadowRootStandIn() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const textarea = document.createElement('textarea');
  root.appendChild(textarea);
  // Real shadow roots expose `.activeElement` for the currently focused
  // descendant; plain elements don't, so fake just that one property.
  Object.defineProperty(root, 'activeElement', {
    get: () => (document.activeElement === textarea ? textarea : null),
  });
  return { root, textarea };
}

describe('isTextEntryFocused', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is false when nothing is focused inside the shadow root', () => {
    const { root } = makeShadowRootStandIn();
    expect(isTextEntryFocused(root)).toBe(false);
  });

  it('is true when the shadow root focused element is a textarea', () => {
    const { root, textarea } = makeShadowRootStandIn();
    textarea.focus();
    expect(isTextEntryFocused(root)).toBe(true);
  });

  it('is false for a null shadow root (not created yet)', () => {
    expect(isTextEntryFocused(null)).toBe(false);
  });
});

describe('installKeyboardShortcutGuard', () => {
  let teardown;

  afterEach(() => {
    teardown?.();
    document.body.innerHTML = '';
  });

  it('stops a later-registered window capture-phase listener from seeing keystrokes typed into the widget textarea', () => {
    const { root, textarea } = makeShadowRootStandIn();
    teardown = installKeyboardShortcutGuard(window, () => root);

    // Simulates a host page's own shortcut handler, registered on window
    // in the capture phase AFTER the widget's guard — the common case,
    // since widget scripts typically load before a host app's feature code
    // wires up its own shortcuts.
    let hostSawKey = false;
    const hostHandler = (e) => {
      hostSawKey = true;
      e.preventDefault();
    };
    window.addEventListener('keydown', hostHandler, true);

    textarea.focus();
    const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);

    window.removeEventListener('keydown', hostHandler, true);

    expect(hostSawKey).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not interfere with keystrokes when focus is outside the widget', () => {
    const { root } = makeShadowRootStandIn();
    teardown = installKeyboardShortcutGuard(window, () => root);

    const outside = document.createElement('input');
    document.body.appendChild(outside);

    let hostSawKey = false;
    const hostHandler = (e) => {
      hostSawKey = true;
      e.preventDefault();
    };
    window.addEventListener('keydown', hostHandler, true);

    outside.focus();
    const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true });
    outside.dispatchEvent(event);

    window.removeEventListener('keydown', hostHandler, true);

    expect(hostSawKey).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('teardown removes the guard so host listeners see keystrokes again', () => {
    const { root, textarea } = makeShadowRootStandIn();
    teardown = installKeyboardShortcutGuard(window, () => root);
    teardown();
    teardown = null;

    let hostSawKey = false;
    const hostHandler = (e) => { hostSawKey = true; };
    window.addEventListener('keydown', hostHandler, true);

    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }));

    window.removeEventListener('keydown', hostHandler, true);

    expect(hostSawKey).toBe(true);
  });
});
