/**
 * Inline /high /medium /low priority command parsing for the feedback
 * textarea. Kept as a pure function (no DOM access) so it's directly
 * unit-testable without mocking the widget's shadow DOM.
 */

const PRIORITY_COMMAND_PATTERN = /(^|\s)\/(high|medium|low)(?=$|\s|[.,!?;:])/gi;

/**
 * Finds every /high, /medium, or /low command in the text — each bounded by
 * whitespace/string-start on the left and whitespace/punctuation/string-end
 * on the right, so "/highlighting" or "/high-value" do NOT match. All
 * matched commands are stripped from the returned text (so a stray earlier
 * command a user forgot to delete doesn't leak into the submitted feedback);
 * if more than one command is present, the LAST one's value wins for
 * `priority` (matches how someone revising their priority mid-message would
 * expect it to behave).
 *
 * Returns { priority, text } where `text` has every matched command removed
 * (and the resulting double space collapsed) and `priority` is 'high' |
 * 'medium' | 'low' | undefined.
 */
export function parsePriorityCommand(rawText) {
  if (!rawText) {
    return { priority: undefined, text: rawText };
  }

  let priority;
  let matchCount = 0;
  const pattern = new RegExp(PRIORITY_COMMAND_PATTERN.source, PRIORITY_COMMAND_PATTERN.flags);
  const text = rawText
    .replace(pattern, (fullMatch, leadingBoundary, word) => {
      matchCount += 1;
      priority = word.toLowerCase(); // last match in iteration order wins
      return leadingBoundary === '' ? '' : ' ';
    })
    .replace(/ {2,}/g, ' ')
    .replace(/ +([.,!?;:])/g, '$1') // no space between the trailing gap and punctuation the command butted up against
    .trim();

  if (matchCount === 0) {
    return { priority: undefined, text: rawText };
  }

  return { priority, text };
}

/**
 * Same matching rules as parsePriorityCommand, but read-only — for live
 * detection on every keystroke (e.g. showing a chip as the user types)
 * without mutating the textarea's value out from under their cursor.
 * Returns 'high' | 'medium' | 'low' | undefined; last match wins.
 */
export function detectPriorityCommand(rawText) {
  if (!rawText) {
    return undefined;
  }

  let priority;
  const pattern = new RegExp(PRIORITY_COMMAND_PATTERN.source, PRIORITY_COMMAND_PATTERN.flags);
  let match;
  while ((match = pattern.exec(rawText)) !== null) {
    priority = match[2].toLowerCase();
  }
  return priority;
}

const PRIORITY_WORDS = ['low', 'medium', 'high'];

// An in-progress command right at the caret: "/", "/h", "/hi" — bounded by
// whitespace/string-start on the left, caret on the right, nothing after it
// (no boundary char yet, since the word isn't finished). Deliberately
// narrower than PRIORITY_COMMAND_PATTERN: it only looks at the token
// touching the caret, not anywhere in the text, so moving the cursor away
// from a stray "/x" elsewhere in the message doesn't reopen the dropdown.
const IN_PROGRESS_PATTERN = /(?:^|\s)\/([a-z]*)$/i;

/**
 * Detects an in-progress "/" command at the given caret position and
 * returns the priorities whose name starts with what's typed so far —
 * driving the live suggestion dropdown while the user is mid-keystroke,
 * before detectPriorityCommand() would ever match.
 *
 * Returns null when the caret isn't inside a "/"-command (dropdown should
 * be closed). Returns [] when a "/" command is open but no priority name
 * starts with the typed letters (dropdown should show "No match").
 * Otherwise returns the matching priority names in fixed low/medium/high
 * order, e.g. "/" -> ['low','medium','high'], "/h" -> ['high'].
 */
export function matchInProgressCommand(text, caretIndex) {
  if (!text) return null;
  const index = typeof caretIndex === 'number' ? caretIndex : text.length;
  const upToCaret = text.slice(0, index);
  const match = upToCaret.match(IN_PROGRESS_PATTERN);
  if (!match) return null;

  const typed = match[1].toLowerCase();
  // A fully-typed word (e.g. "/high") hands off to detectPriorityCommand's
  // chip instead of staying open as a redundant one-item dropdown.
  if (PRIORITY_WORDS.includes(typed)) return null;

  return PRIORITY_WORDS.filter((word) => word.startsWith(typed));
}

/**
 * Replaces the in-progress "/"-command at the caret with the full command
 * word (e.g. accepting "high" while the text reads "fix this /hi|" produces
 * "fix this /high"), preserving the rest of the text and reporting where
 * the caret should land. Only call this when matchInProgressCommand()
 * returned a non-null result for the same (text, caretIndex).
 *
 * Returns { text, caretIndex } with the caret placed right after the
 * inserted word, ready for the user to keep typing or submit.
 */
export function completeInProgressCommand(text, caretIndex, word) {
  const index = typeof caretIndex === 'number' ? caretIndex : text.length;
  const upToCaret = text.slice(0, index);
  const match = upToCaret.match(IN_PROGRESS_PATTERN);
  if (!match) return { text, caretIndex: index };

  const commandStart = index - match[1].length;
  const newText = text.slice(0, commandStart) + word + text.slice(index);
  return { text: newText, caretIndex: commandStart + word.length };
}
