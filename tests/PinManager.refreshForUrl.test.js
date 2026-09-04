import { describe, it, expect, vi } from 'vitest';
import PinManager from '../src/managers/PinManager.js';

describe('PinManager.refreshForUrl — SPA route-change pin refresh', () => {
  it('clears existing DOM pins and re-inits for the new URL with the stored projectId', async () => {
    const pm = new PinManager(document.createElement('div'), {});
    pm._projectId = 'proj-123';
    pm.initialized = true;

    const removed = [];
    const el = { remove: () => removed.push(true) };
    pm.pins.set('pin-1', { data: {}, element: el });

    const initSpy = vi.spyOn(pm, 'init').mockImplementation(async () => {
      // init() itself no-ops when `initialized` is still true — assert
      // refreshForUrl already reset it before delegating, or a stale
      // guard would silently swallow every route-change refresh.
      expect(pm.initialized).toBe(false);
    });

    await pm.refreshForUrl('https://example.com/new-route');

    expect(removed).toEqual([true]);
    expect(pm.pins.size).toBe(0);
    expect(initSpy).toHaveBeenCalledWith('proj-123', 'https://example.com/new-route');
  });
});
