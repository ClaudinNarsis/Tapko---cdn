import { describe, it, expect } from 'vitest';
import { shouldAutoEnterFeedbackMode, AUTO_FEEDBACK_PARAM } from '../src/utils/autoFeedbackMode.js';

describe('shouldAutoEnterFeedbackMode — guided first-comment entry', () => {
  it('opts in on ?tapko_feedback=1', () => {
    expect(shouldAutoEnterFeedbackMode('?tapko_feedback=1', false)).toBe(true);
  });

  it('opts in on ?tapko_feedback=true, case-insensitively', () => {
    expect(shouldAutoEnterFeedbackMode('?tapko_feedback=true', false)).toBe(true);
    expect(shouldAutoEnterFeedbackMode('?tapko_feedback=TRUE', false)).toBe(true);
  });

  it('stays out when the param is absent', () => {
    expect(shouldAutoEnterFeedbackMode('', false)).toBe(false);
    expect(shouldAutoEnterFeedbackMode('?utm_source=tapko', false)).toBe(false);
  });

  it('stays out for an explicit falsy value, so a shared link cannot force feedback mode', () => {
    expect(shouldAutoEnterFeedbackMode('?tapko_feedback=0', false)).toBe(false);
    expect(shouldAutoEnterFeedbackMode('?tapko_feedback=false', false)).toBe(false);
    expect(shouldAutoEnterFeedbackMode('?tapko_feedback=', false)).toBe(false);
  });

  it('stays out when the project is not collecting feedback, even with the param set', () => {
    expect(shouldAutoEnterFeedbackMode('?tapko_feedback=1', true)).toBe(false);
  });

  it('survives a null/undefined search string', () => {
    expect(shouldAutoEnterFeedbackMode(undefined, false)).toBe(false);
    expect(shouldAutoEnterFeedbackMode(null, false)).toBe(false);
  });

  it('coexists with other params on the same URL', () => {
    expect(shouldAutoEnterFeedbackMode('?a=1&tapko_feedback=1&b=2', false)).toBe(true);
  });

  it('exports the param name so callers build the link from one source', () => {
    expect(AUTO_FEEDBACK_PARAM).toBe('tapko_feedback');
  });
});
