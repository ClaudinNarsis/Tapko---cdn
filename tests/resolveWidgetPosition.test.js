import { describe, it, expect } from 'vitest';
import { resolveWidgetPosition } from '../src/utils/dom.js';
import { CONFIG } from '../src/config.js';

describe('resolveWidgetPosition — defensive runtime default (v1)', () => {
  it('passes through each of the 4 valid corners unchanged', () => {
    expect(resolveWidgetPosition('bottom-right')).toBe('bottom-right');
    expect(resolveWidgetPosition('bottom-left')).toBe('bottom-left');
    expect(resolveWidgetPosition('top-right')).toBe('top-right');
    expect(resolveWidgetPosition('top-left')).toBe('top-left');
  });

  it('falls back to CONFIG.DEFAULTS.position when the value is undefined', () => {
    expect(resolveWidgetPosition(undefined)).toBe(CONFIG.DEFAULTS.position);
  });

  it('falls back to CONFIG.DEFAULTS.position when the value is null', () => {
    expect(resolveWidgetPosition(null)).toBe(CONFIG.DEFAULTS.position);
  });

  it('falls back to CONFIG.DEFAULTS.position for an empty string', () => {
    expect(resolveWidgetPosition('')).toBe(CONFIG.DEFAULTS.position);
  });

  it('falls back to CONFIG.DEFAULTS.position for an unrecognized string', () => {
    expect(resolveWidgetPosition('middle-right')).toBe(CONFIG.DEFAULTS.position);
  });

  it('falls back to CONFIG.DEFAULTS.position for a non-string value (defense against a corrupted/legacy field)', () => {
    expect(resolveWidgetPosition(42)).toBe(CONFIG.DEFAULTS.position);
    expect(resolveWidgetPosition({})).toBe(CONFIG.DEFAULTS.position);
    expect(resolveWidgetPosition(['bottom-right'])).toBe(CONFIG.DEFAULTS.position);
  });

  it('CONFIG.DEFAULTS.position is itself bottom-right, matching the widget\'s pre-existing hardcoded behavior', () => {
    expect(CONFIG.DEFAULTS.position).toBe('bottom-right');
  });
});
