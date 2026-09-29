import { describe, it, expect, vi, afterEach } from 'vitest';
import { _resolveCSSImports } from '../src/utils/screenshot.js';

// DOM-screenshot font mismatch: a page's Google Fonts @font-face rule can
// arrive via @import inside an external stylesheet instead of a <link>
// pointing directly at fonts.googleapis.com. _inlineCSSUrls only inlines
// <link> tags, so an unresolved @import means the renderer never sees the
// font-family declaration and silently falls back to a system font.
//
// Root cause confirmed against a real production stylesheet (Tailwind
// v4/Vite minified build output): `@import"https://fonts.googleapis..."`
// — no space between @import and the opening quote. A \s+ requirement in
// the resolver regex misses this real-world minified form entirely.
describe('_resolveCSSImports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a minified @import with no whitespace before the quoted URL (Tailwind v4/Vite production shape)', async () => {
    const importedCss = '@font-face{font-family:"Instrument Serif";src:url(https://fonts.gstatic.com/s/instrumentserif/foo.woff2) format("woff2");}';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(importedCss)
    });

    const css = '@import"https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap";h1{font-family:\'Instrument Serif\',serif;}';
    const result = await _resolveCSSImports(css, 'https://example.com/style.css');

    expect(result).not.toMatch(/@import/);
    expect(result).toContain('@font-face');
    expect(result).toContain('Instrument Serif');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap',
      expect.objectContaining({ mode: 'cors', credentials: 'omit' })
    );
  });

  it('resolves a spaced @import url(...) form', async () => {
    const importedCss = '@font-face{font-family:"Inter";src:url(https://fonts.gstatic.com/s/inter/foo.woff2);}';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(importedCss)
    });

    const css = "@import url('https://fonts.googleapis.com/css2?family=Inter');body{color:red;}";
    const result = await _resolveCSSImports(css, 'https://example.com/style.css');

    expect(result).not.toMatch(/@import/);
    expect(result).toContain('@font-face');
    expect(result).toContain('body{color:red;}');
  });

  it('leaves CSS with no @import untouched and makes no network request', async () => {
    global.fetch = vi.fn();
    const css = 'h1{font-family:Inter,sans-serif;}';

    const result = await _resolveCSSImports(css, 'https://example.com/style.css');

    expect(result).toBe(css);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('leaves the original @import text in place when the fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const css = '@import"https://fonts.googleapis.com/css2?family=Inter";h1{color:red;}';

    const result = await _resolveCSSImports(css, 'https://example.com/style.css');

    expect(result).toContain('@import');
    expect(result).toContain('h1{color:red;}');
  });

  it('does not infinite-loop on a pathological/circular @import chain', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('@import"https://example.com/self.css";')
    });

    const result = await _resolveCSSImports('@import"https://example.com/self.css";', 'https://example.com/self.css');

    expect(typeof result).toBe('string');
    expect(global.fetch.mock.calls.length).toBeLessThanOrEqual(6);
  });
});
