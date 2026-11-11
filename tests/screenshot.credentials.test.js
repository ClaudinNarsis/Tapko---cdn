import { describe, it, expect, vi, afterEach } from 'vitest';
import { _credentialsFor, _fetchAsDataURI, _resolveCSSImports } from '../src/utils/screenshot.js';

// Regression: on an auth-walled page (dev.tapko.app behind basic auth) every
// snapshot asset fetch used credentials:'omit', so same-origin assets like the
// logo 401'd, stayed relative, and rendered broken in the screenshot. Only the
// page's own origin may get credentials; cross-origin stays 'omit'.
describe('snapshot asset credentials', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends credentials only to the page origin', () => {
    const origin = location.origin;
    expect(_credentialsFor('/assets/logo.svg')).toBe('same-origin');
    expect(_credentialsFor(`${origin}/a.css`)).toBe('same-origin');
    expect(_credentialsFor('https://cdn.example.com/logo.svg')).toBe('omit');
    expect(_credentialsFor('https://fonts.googleapis.com/css2?family=Inter')).toBe('omit');
    expect(_credentialsFor('http://[bad')).toBe('omit');
  });

  it('_fetchAsDataURI uses same-origin for own assets and omit for third-party ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    await _fetchAsDataURI(`${location.origin}/assets/logo.svg`);
    await _fetchAsDataURI('https://cdn.example.com/logo.svg');
    expect(fetchMock.mock.calls[0][1]).toEqual({ mode: 'cors', credentials: 'same-origin' });
    expect(fetchMock.mock.calls[1][1]).toEqual({ mode: 'cors', credentials: 'omit' });
  });

  it('@import resolution follows the same rule', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    await _resolveCSSImports('@import "/own.css";@import "https://fonts.googleapis.com/x.css";', `${location.origin}/style.css`);
    const byUrl = Object.fromEntries(fetchMock.mock.calls.map(([u, o]) => [u, o.credentials]));
    expect(byUrl[`${location.origin}/own.css`]).toBe('same-origin');
    expect(byUrl['https://fonts.googleapis.com/x.css']).toBe('omit');
  });
});
