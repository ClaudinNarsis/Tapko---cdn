import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regressions found on bos.studiofreight.dev (GSAP SplitText + full-viewport
// WebGL scene + a preloader the renderer never gets past).

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

describe('DOM snapshot fidelity', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; });
  afterEach(() => vi.restoreAllMocks());

  it('keeps whitespace between tags (SplitText words must not glue together)', async () => {
    const { _serialiseClone } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<p><div class="word">Building</div> <div class="word">on</div>\n <div class="word">BOS</div></p>';
    const html = _serialiseClone(document.documentElement.cloneNode(true));
    expect(html).toContain('Building</div> <div class="word">on</div>\n <div');
  });

  it('replaces canvases with images that keep class, id and style', async () => {
    const { _snapshotDOMSync } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<div><canvas id="gl" class="scene" style="position:absolute;inset:0;width:100%" width="2880" height="1800"></canvas></div>';
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
    const { clone } = _snapshotDOMSync();
    const img = clone.querySelector('img#gl');
    expect(img).not.toBeNull();
    expect(img.className).toBe('scene');
    expect(img.getAttribute('style')).toContain('position:absolute');
    expect(img.getAttribute('width')).toBe('2880');
    expect(clone.querySelector('canvas')).toBeNull();
  });

  it('pairs canvases by index even when a masked element holding a canvas is removed', async () => {
    const { _snapshotDOMSync } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<div class="mk-mask"><canvas id="a" width="10" height="10"></canvas></div><canvas id="b" width="10" height="10"></canvas>';
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function () { return `data:image/jpeg;base64,${this.id}`; });
    const { clone } = _snapshotDOMSync();
    expect(clone.querySelector('#b').getAttribute('src')).toBe('data:image/jpeg;base64,b');
  });
});

describe('_viewportHasLiveCanvas', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; });
  afterEach(() => vi.restoreAllMocks());

  it('is true for a canvas covering the viewport and false for a small or hidden one', async () => {
    const { _viewportHasLiveCanvas } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<canvas id="big" width="100" height="100"></canvas><canvas id="small" width="10" height="10"></canvas>';
    const big = document.getElementById('big');
    const small = document.getElementById('small');
    big.getBoundingClientRect = () => rect(0, 0, window.innerWidth, window.innerHeight);
    small.getBoundingClientRect = () => rect(0, 0, 50, 50);
    expect(_viewportHasLiveCanvas()).toBe(true);
    big.style.visibility = 'hidden';
    expect(_viewportHasLiveCanvas()).toBe(false);
    big.style.visibility = '';
    big.getBoundingClientRect = () => rect(0, window.innerHeight + 10, window.innerWidth, 500); // below the fold
    expect(_viewportHasLiveCanvas()).toBe(false);
  });
});

describe('captureScreenshot — URL capture is not retried on a page where it failed', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('RENDERER_URL', 'https://renderer.example.com'); document.body.innerHTML = '<p>hi</p>'; });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('skips URL capture after one failure, and when a live canvas fills the viewport', async () => {
    const urlCalls = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      if (init && init.body && JSON.parse(init.body).url) urlCalls.push(1);
      return new Response('{}', { status: 500 });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('../src/utils/screenshot.js');

    await mod.captureScreenshot({});
    await mod.captureScreenshot({});
    expect(urlCalls.length).toBe(1);

    mod._urlCaptureFailed.clear();
    document.body.innerHTML = '<canvas width="10" height="10"></canvas>';
    document.querySelector('canvas').getBoundingClientRect = () => rect(0, 0, window.innerWidth, window.innerHeight);
    await mod.captureScreenshot({});
    expect(urlCalls.length).toBe(1);
  });
});

describe('parse-hostile nesting and doctype', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; });

  it('turns a <p> holding block children into a <div> that survives an HTML re-parse', async () => {
    const { _snapshotDOMSync, _serialiseClone } = await import('../src/utils/screenshot.js');
    const p = document.createElement('p');
    p.className = 'description';
    p.innerHTML = '<span class="letter-reveal"></span>';
    for (const w of ['trust', 'among', 'institutions']) {
      const d = document.createElement('div'); d.className = 'word'; d.textContent = w;
      p.firstChild.append(d, ' ');
    }
    document.body.append(p);
    const { clone } = _snapshotDOMSync();
    const html = _serialiseClone(clone);
    const reparsed = new DOMParser().parseFromString(html, 'text/html');
    const holder = reparsed.querySelector('.description');
    expect(holder.tagName).toBe('DIV');
    expect(holder.querySelectorAll('.word').length).toBe(3);
  });

  it('leaves an ordinary <p> alone and keeps the doctype', async () => {
    const { _snapshotDOMSync, _serialiseClone } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<p class="plain">hello <span>world</span></p>';
    const { clone } = _snapshotDOMSync();
    expect(clone.querySelector('p.plain')).not.toBeNull();
    expect(_serialiseClone(clone).startsWith('<!DOCTYPE html>')).toBe(true);
  });
});
