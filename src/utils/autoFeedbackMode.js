/**
 * Guided first-comment entry (activation plan) — lets a link open a page
 * with feedback mode already on, so a project owner reaching their own site
 * from Tapko's "Leave your first comment" step lands ready to comment
 * instead of having to find the floating button first.
 *
 * Pure so it can be unit tested without a live widget instance, matching
 * this repo's existing pattern for resolveWidgetPosition/priorityCommand.
 */

export const AUTO_FEEDBACK_PARAM = 'tapko_feedback';

// Deliberately permissive about the value ('1' and 'true' both read as "yes"
// to a human hand-editing the URL) but strict about everything else, so a
// stray ?tapko_feedback=0 in a shared link can't drop a visitor into
// feedback mode.
const TRUTHY = new Set(['1', 'true']);

/**
 * @param {string} search - window.location.search, including the leading '?'
 * @param {boolean} isDisabled - whether the project has feedback collection off
 * @returns {boolean}
 */
export function shouldAutoEnterFeedbackMode(search, isDisabled) {
  if (isDisabled) return false;
  let value;
  try {
    value = new URLSearchParams(search || '').get(AUTO_FEEDBACK_PARAM);
  } catch (_) {
    return false;
  }
  return value !== null && TRUTHY.has(value.toLowerCase());
}
