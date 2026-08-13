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
