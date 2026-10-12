import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import PinManager from '../src/managers/PinManager.js';

function statusEl(status) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const pm = new PinManager(document.createElement('div'), {});
  const card = pm._createPinDetailCard({ id: 'p1', status, comment: { text: 'hi', createdAt: Date.now() } });
  return card.querySelector('.dtc-pin-detail-status');
}

describe('PinManager pin detail status label', () => {
  it('renders "Needs Clarification" with its own style class', () => {
    const el = statusEl('needs_clarification');
    expect(el.textContent).toBe('Needs Clarification');
    expect(el.classList.contains('dtc-pin-detail-status-needs_clarification')).toBe(true);
  });

  it('has a matching CSS rule so the badge is not unstyled', () => {
    const css = readFileSync(path.join(__dirname, '../src/styles/widget.css'), 'utf8');
    expect(css).toMatch(/\.dtc-pin-detail-status-needs_clarification\s*\{/);
  });

  // Value: protects=an unknown status from the API/cache renders as text, never markup or a class name;
  // fails_when=status is interpolated into innerHTML unescaped again; why_new=only known labels were tested; seam=none
  it('escapes an unknown status instead of rendering it as HTML', () => {
    const el = statusEl('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.className).toBe('dtc-pin-detail-status dtc-pin-detail-status-unknown');
  });

  it('does not throw on a non-string status', () => {
    expect(statusEl(42).textContent).toBe('42');
  });

  it('keeps existing labels intact', () => {
    expect(statusEl('in_progress').textContent).toBe('In Progress');
    expect(statusEl(undefined).textContent).toBe('Pending');
  });
});
