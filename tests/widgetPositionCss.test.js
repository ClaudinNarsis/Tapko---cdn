import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// This is a structural correctness check on widget.css, not a pixel-level
// visual regression test — this repo's test infra (vitest + jsdom) can't do
// real computed-style/layout verification across a live browser. A true
// visual regression pass (4 corners x desktop/mobile x panel states) needs
// a real-browser tool (Playwright/Puppeteer screenshot diffing), which
// doesn't exist in this repo yet — tracked as a gap, not silently skipped.
//
// What this DOES verify, reliably, without a browser: for every
// :host([data-position="..."]) override block, the opposite edge property
// (left vs right, top vs bottom) is explicitly reset to `auto` — this is
// the exact bug class a careless override would introduce (both `left` and
// `right` set simultaneously on a position:fixed element with an explicit
// width is invalid/inconsistent per spec), and it's fully checkable by
// parsing the stylesheet text alone.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.join(__dirname, '../src/styles/widget.css');

let css;

beforeAll(() => {
  css = readFileSync(CSS_PATH, 'utf8');
});

// Extract every `:host([data-position="X"]) .selector, ... { body }` rule
// (including multi-selector rules) as { position, selectors, body } tuples.
function extractPositionRules(cssText) {
  const rules = [];
  const ruleRegex = /((?:[^{}]*:host\(\[data-position="[a-z-]+"\]\)[^{,]*,?\s*)+)\{([^}]*)\}/g;
  let match;
  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selectorList = match[1];
    const body = match[2];
    const positions = [...selectorList.matchAll(/data-position="([a-z-]+)"/g)].map((m) => m[1]);
    const uniquePositions = [...new Set(positions)];
    rules.push({ selectorList, body, positions: uniquePositions });
  }
  return rules;
}

describe('widget.css — position override structural correctness (v1)', () => {
  it('contains at least one override rule for each of the 3 non-default corners', () => {
    const rules = extractPositionRules(css);
    const coveredPositions = new Set(rules.flatMap((r) => r.positions));
    expect(coveredPositions.has('bottom-left')).toBe(true);
    expect(coveredPositions.has('top-right')).toBe(true);
    expect(coveredPositions.has('top-left')).toBe(true);
  });

  it('every rule that sets `left` also resets `right: auto` in the same rule body', () => {
    const rules = extractPositionRules(css);
    const offenders = rules.filter(
      (r) => /(?<!-)\bleft:\s*\d/.test(r.body) && !/\bright:\s*auto\b/.test(r.body)
    );
    expect(offenders).toEqual([]);
  });

  it('every rule that sets `right` (a pixel value) also resets `left: auto` in the same rule body', () => {
    const rules = extractPositionRules(css);
    const offenders = rules.filter(
      (r) => /(?<!-)\bright:\s*\d/.test(r.body) && !/\bleft:\s*auto\b/.test(r.body)
    );
    expect(offenders).toEqual([]);
  });

  it('every rule that sets `top` also resets `bottom: auto` in the same rule body', () => {
    const rules = extractPositionRules(css);
    const offenders = rules.filter(
      (r) => /(?<!-)\btop:\s*\d/.test(r.body) && !/\bbottom:\s*auto\b/.test(r.body)
    );
    expect(offenders).toEqual([]);
  });

  it('every rule that sets `bottom` (a pixel value) also resets `top: auto` in the same rule body', () => {
    const rules = extractPositionRules(css);
    const offenders = rules.filter(
      (r) => /(?<!-)\bbottom:\s*\d/.test(r.body) && !/\btop:\s*auto\b/.test(r.body)
    );
    expect(offenders).toEqual([]);
  });

  it('the 4 persistent elements each get a top-left rule (full corner-flip coverage)', () => {
    const rules = extractPositionRules(css);
    const topLeftSelectors = rules
      .filter((r) => r.positions.includes('top-left'))
      .map((r) => r.selectorList)
      .join(' ');
    expect(topLeftSelectors).toContain('.dtc-floating-entry-button');
    expect(topLeftSelectors).toContain('.dtc-widget-view-all-btn');
    expect(topLeftSelectors).toContain('.dtc-widget-hidden-warning');
    expect(topLeftSelectors).toContain('.dtc-feedback-disabled-popup');
  });

  it('none of the session-scoped overlay elements (feedback-overlay, snackbar, screenshot/drawing UI, permission/exit dialogs) are targeted by a position override', () => {
    const rules = extractPositionRules(css);
    const allSelectors = rules.map((r) => r.selectorList).join(' ');
    const sessionScoped = [
      '.dtc-feedback-overlay',
      '.dtc-snackbar',
      '.dtc-screenshot-fullscreen',
      '.dtc-drawing-container',
      '.dtc-drawing-instructions',
      '.dtc-drawing-toolbar',
      '.screenshot-permission-overlay',
      '.dtc-exit-dialog-overlay',
    ];
    for (const selector of sessionScoped) {
      expect(allSelectors).not.toContain(selector);
    }
  });
});
