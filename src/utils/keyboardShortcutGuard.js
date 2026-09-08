/**
 * Keyboard shortcut guard
 *
 * Host pages commonly bind single-letter keyboard shortcuts (e.g. "c" for
 * compose/comment/create) via a capture-phase listener on window with
 * preventDefault(). Capture always flows top-down starting at window, so a
 * listener the widget attaches to its own shadow DOM elements — even in the
 * capture phase — runs strictly after any listener already on window. That
 * means the widget's own textarea never even sees the keystroke: the host's
 * preventDefault() has already suppressed the browser's native
 * character-insertion behavior before propagation reaches the shadow tree.
 *
 * The fix is to also listen on window, in the capture phase, registered as
 * early as possible (ideally at widget construction time) so this guard
 * lands ahead of any shortcut a host page registers afterward — same target,
 * same phase, and same-target/same-phase listeners run in registration
 * order. When the widget's own shadow DOM currently has focus, this calls
 * stopImmediatePropagation() so no later-registered window-capture listener
 * (the host's shortcut handler) runs at all for that keystroke.
 *
 * This cannot help against a shortcut handler the host page registered on
 * window BEFORE the widget script loaded — that ordering constraint is
 * inherent to the DOM event model, not something a widget can escape.
 */

/**
 * Returns true if the currently focused element inside `shadowRoot` is a
 * text-entry element (textarea or input) whose typed keystrokes should be
 * protected from host-page interception.
 */
export function isTextEntryFocused(shadowRoot) {
  if (!shadowRoot) return false;
  const active = shadowRoot.activeElement;
  return !!active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
}

/**
 * Installs the guard on `target` (window in production; injectable for
 * tests) for keydown, keypress, and keyup. `getShadowRoot` is a thunk so the
 * guard can be installed before the shadow root exists yet (it's created
 * lazily) and still see it once it's assigned.
 *
 * Returns a teardown function that removes all three listeners.
 */
export function installKeyboardShortcutGuard(target, getShadowRoot) {
  const stopIfFocusInsideWidget = (e) => {
    if (isTextEntryFocused(getShadowRoot())) {
      e.stopImmediatePropagation();
    }
  };

  target.addEventListener('keydown', stopIfFocusInsideWidget, true);
  target.addEventListener('keypress', stopIfFocusInsideWidget, true);
  target.addEventListener('keyup', stopIfFocusInsideWidget, true);

  return () => {
    target.removeEventListener('keydown', stopIfFocusInsideWidget, true);
    target.removeEventListener('keypress', stopIfFocusInsideWidget, true);
    target.removeEventListener('keyup', stopIfFocusInsideWidget, true);
  };
}
