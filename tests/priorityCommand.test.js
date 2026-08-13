import { describe, it, expect } from 'vitest';
import { parsePriorityCommand, detectPriorityCommand } from '../src/utils/priorityCommand.js';

describe('parsePriorityCommand', () => {
  it('returns priority undefined and text unchanged when no command is present', () => {
    expect(parsePriorityCommand('this button is broken')).toEqual({
      priority: undefined,
      text: 'this button is broken'
    });
  });

  it('matches /high at the end of the message and strips it', () => {
    expect(parsePriorityCommand('fix this /high')).toEqual({
      priority: 'high',
      text: 'fix this'
    });
  });

  it('matches /medium in the middle of the message and strips it', () => {
    expect(parsePriorityCommand('fix this /medium please')).toEqual({
      priority: 'medium',
      text: 'fix this please'
    });
  });

  it('matches /low at the start of the message and strips it', () => {
    expect(parsePriorityCommand('/low this is a minor nit')).toEqual({
      priority: 'low',
      text: 'this is a minor nit'
    });
  });

  it('is case-insensitive', () => {
    expect(parsePriorityCommand('fix this /HIGH')).toEqual({
      priority: 'high',
      text: 'fix this'
    });
  });

  it('does NOT match /highlighting — no boundary after the word', () => {
    expect(parsePriorityCommand('fix this /highlighting bug')).toEqual({
      priority: undefined,
      text: 'fix this /highlighting bug'
    });
  });

  it('does NOT match /high-value — hyphen is not a boundary character', () => {
    expect(parsePriorityCommand('the /high-value customers page is broken')).toEqual({
      priority: undefined,
      text: 'the /high-value customers page is broken'
    });
  });

  it('matches when followed by punctuation', () => {
    expect(parsePriorityCommand('please fix /high, thanks')).toEqual({
      priority: 'high',
      text: 'please fix, thanks'
    });
  });

  it('when multiple commands are present, the LAST value wins and BOTH tokens are stripped', () => {
    expect(parsePriorityCommand('/low actually no /high this is bad')).toEqual({
      priority: 'high',
      text: 'actually no this is bad'
    });
  });

  it('handles empty string input', () => {
    expect(parsePriorityCommand('')).toEqual({ priority: undefined, text: '' });
  });

  it('handles a message that is only the command', () => {
    expect(parsePriorityCommand('/high')).toEqual({ priority: 'high', text: '' });
  });

  it('collapses the double space left behind when stripping a mid-sentence command', () => {
    const result = parsePriorityCommand('fix this /high please');
    expect(result.text).not.toMatch(/ {2,}/);
    expect(result.text).toBe('fix this please');
  });
});

describe('detectPriorityCommand — live/read-only detection (chip UI)', () => {
  it('returns undefined for empty or command-less text', () => {
    expect(detectPriorityCommand('')).toBeUndefined();
    expect(detectPriorityCommand('this is broken')).toBeUndefined();
  });

  it('detects /high the instant the word is complete, with nothing after it', () => {
    expect(detectPriorityCommand('fix this /high')).toBe('high');
  });

  it('does not detect a partial word mid-typing', () => {
    expect(detectPriorityCommand('fix this /hig')).toBeUndefined();
  });

  it('does not false-positive on /highlighting or /high-value', () => {
    expect(detectPriorityCommand('fix /highlighting bug')).toBeUndefined();
    expect(detectPriorityCommand('the /high-value page')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(detectPriorityCommand('fix this /HIGH')).toBe('high');
  });

  it('returns the last command when multiple are present, matching parsePriorityCommand', () => {
    expect(detectPriorityCommand('/low actually no /high this is bad')).toBe('high');
  });

  it('does not mutate the input text (no strip side effect)', () => {
    const input = 'fix this /high please';
    detectPriorityCommand(input);
    expect(input).toBe('fix this /high please');
  });
});
