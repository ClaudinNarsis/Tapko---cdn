/**
 * First-comment prompt (activation plan) — when Tapko's onboarding sends a
 * project owner to their own site, the widget points at its own entry
 * button and tells them to click it, rather than opening feedback mode for
 * them.
 *
 * Opening it automatically was the obvious shortcut and the wrong one: the
 * real interaction — the one their clients will perform, and the one the
 * owner has to understand before they can explain it to anyone — starts
 * with noticing the button and pressing it. Skipping that step teaches the
 * owner that feedback mode is simply always on, which is both wrong and a
 * worse first impression.
 *
 * Pure so it can be unit tested without a live widget, matching this repo's
 * existing pattern for resolveWidgetPosition/priorityCommand.
 */

export const FIRST_COMMENT_PARAM = 'tapko_feedback';

// Session-scoped so a dismissal survives the reloads a page naturally does
// while someone is poking around, without the prompt being gone forever on
// a later visit through a fresh onboarding link.
export const DISMISSED_STORAGE_KEY = 'tapko_first_comment_prompt_dismissed';

// Deliberately permissive about the value ('1' and 'true' both read as "yes"
// to a human hand-editing the URL) but strict about everything else, so a
// stray ?tapko_feedback=0 in a shared link can't prompt an ordinary visitor.
const TRUTHY = new Set(['1', 'true']);

/**
 * @param {string} search - window.location.search, including the leading '?'
 * @param {boolean} isDisabled - whether the project has feedback collection off
 * @param {Storage|null} storage - sessionStorage, or null where it's unavailable
 * @returns {boolean}
 */
export function shouldShowFirstCommentPrompt(search, isDisabled, storage) {
  if (isDisabled) return false;

  let value;
  try {
    value = new URLSearchParams(search || '').get(FIRST_COMMENT_PARAM);
  } catch (_) {
    return false;
  }
  if (value === null || !TRUTHY.has(value.toLowerCase())) return false;

  // A previous dismissal in this session wins over the parameter — otherwise
  // the prompt returns on every navigation, since the link that carried the
  // parameter is still the page's URL.
  try {
    if (storage && storage.getItem(DISMISSED_STORAGE_KEY) === 'true') return false;
  } catch (_) {
    // Storage blocked (private browsing, blocked cookies) — show the prompt
    // rather than suppress it; a repeated prompt is a smaller failure than
    // never showing the one thing telling them what to do.
  }

  return true;
}

/**
 * Records a dismissal. Never throws: storage can be unavailable, and failing
 * to remember a dismissal must not break the page.
 */
export function rememberDismissal(storage) {
  try {
    if (storage) storage.setItem(DISMISSED_STORAGE_KEY, 'true');
  } catch (_) {
    // Intentionally ignored — see above.
  }
}
