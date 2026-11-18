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

describe('_urlSkipReason — sticky live canvas', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; document.documentElement.className = ''; });
  afterEach(() => vi.restoreAllMocks());

  it('stays skipped once a live canvas was seen, even after it leaves the viewport', async () => {
    const { _urlSkipReason } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<canvas width="10" height="10"></canvas>';
    const c = document.querySelector('canvas');
    c.getBoundingClientRect = () => rect(0, 0, window.innerWidth, window.innerHeight);
    expect(_urlSkipReason()).toMatch(/live canvas/);
    document.body.innerHTML = '<p>static</p>';
    expect(_urlSkipReason()).toMatch(/live canvas/);
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

// Heavy-page captures (sweet-tape.com, zrk.technology, jjettas.com, 2026-11-18)
describe('heavy page payload reduction', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; });
  afterEach(() => vi.restoreAllMocks());

  const doc = (body, head = '') => { const d = document.implementation.createHTMLDocument(''); d.head.innerHTML = head; d.body.innerHTML = body; return d.documentElement; };

  it('sheds offscreen inlined images before dropping the site stylesheet', async () => {
    const { _reducePayload } = await import('../src/utils/screenshot.js');
    const clone = doc('<img id="on" data-tapko-inview="1" src="data:image/png;base64,AAAA"><img id="off" src="data:image/png;base64,BBBB">', '<style>body{color:red}</style>');
    _reducePayload(clone, 0, 900, 2);
    expect(clone.querySelector('#on').getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(clone.querySelector('#off').hasAttribute('src')).toBe(false);
    expect(clone.querySelector('style')).not.toBeNull();
  });

  it('keeps canvas snapshots through level 3, which drops other inlined images', async () => {
    const { _reducePayload } = await import('../src/utils/screenshot.js');
    const clone = doc('<img id="cv" data-tapko-canvas="1" data-tapko-inview="1" src="data:image/jpeg;base64,CC"><img id="pic" data-tapko-inview="1" src="data:image/png;base64,DD">');
    _reducePayload(clone, 0, 900, 3);
    expect(clone.querySelector('#cv').hasAttribute('src')).toBe(true);
    expect(clone.querySelector('#pic').hasAttribute('src')).toBe(false);
  });

  it('actually prunes content far below the fold (data-* strip used to erase its position stamp)', async () => {
    const { _reducePayload } = await import('../src/utils/screenshot.js');
    const clone = doc('<section id="near" data-tapko-rect-top="100"></section><section id="far" data-tapko-rect-top="90000"></section>');
    _reducePayload(clone, 0, 900, 1);
    expect(clone.querySelector('#near')).not.toBeNull();
    expect(clone.querySelector('#far')).toBeNull();
  });

  it('keeps data-* attributes that stylesheets select on (Vue scoped styles), strips the rest', async () => {
    const { _reducePayload } = await import('../src/utils/screenshot.js');
    const clone = doc('<section id="s" data-v-f0db7165 data-track="x"></section>', '<style>.door[data-v-f0db7165]{height:var(--height)}</style>');
    _reducePayload(clone, 0, 900, 1);
    expect(clone.querySelector('#s').hasAttribute('data-v-f0db7165')).toBe(true);
    expect(clone.querySelector('#s').hasAttribute('data-track')).toBe(false);
  });

  it('does not strip an element whose style merely contains backface-visibility: hidden', async () => {
    const { _reducePayload } = await import('../src/utils/screenshot.js');
    const clone = doc('<div id="hero" style="transform: translate3d(0px, 0px, 0px); backface-visibility: hidden"></div><div id="gone" style="color:red; visibility: hidden"></div>');
    _reducePayload(clone, 0, 900, 1);
    expect(clone.querySelector('#hero')).not.toBeNull();
    expect(clone.querySelector('#gone')).toBeNull();
  });

  it('keeps aria-hidden decorative elements (hero canvases/backgrounds) at level 1', async () => {
    const { _reducePayload } = await import('../src/utils/screenshot.js');
    const clone = doc('<img id="bg" aria-hidden="true" src="x.jpg"><div id="gone" hidden></div><div id="gone2" style="display:none"></div>');
    _reducePayload(clone, 0, 900, 1);
    expect(clone.querySelector('#bg')).not.toBeNull();
    expect(clone.querySelector('#gone')).toBeNull();
    expect(clone.querySelector('#gone2')).toBeNull();
  });

  it('bakes a stuck position:sticky offset into the clone (nothing scrolls in the renderer)', async () => {
    const { _snapshotDOMSync } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<div><section id="pane" style="position:sticky;top:0"></section><p id="plain"></p></div>';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const top = this.id === 'pane' ? (this.style.position === 'relative' ? 1200 : 0) : 50; // unstuck spot 1200, stuck at 0
      return rect(0, top, 100, 100);
    });
    const { clone } = _snapshotDOMSync();
    const pane = clone.querySelector('#pane');
    expect(pane.style.getPropertyValue('top')).toBe('-1200px');
    expect(pane.style.getPropertyValue('position')).toBe('relative');
    expect(pane.hasAttribute('data-tapko-sticky')).toBe(false);
    expect(document.querySelector('#pane').getAttribute('style')).toBe('position:sticky;top:0');
    expect(clone.querySelector('#plain').style.getPropertyValue('position')).toBe('');
  });

  it('hoists a data URI repeated across style rules into one custom property', async () => {
    const { _dedupeStyleDataURIs } = await import('../src/utils/screenshot.js');
    const uri = 'data:image/webp;base64,' + 'A'.repeat(30000);
    const clone = doc('', `<style>.a{background-image:url("${uri}")}.b:before{background:url("${uri}") 0 0}</style>`);
    document.documentElement.replaceWith(clone); // helpers create nodes via the global document
    _dedupeStyleDataURIs(clone);
    const css = [...clone.querySelectorAll('style')].map(x => x.textContent).join('');
    expect(css.split(uri).length - 1).toBe(1);
    expect(css).toContain('.a{background-image:var(--tapko-d0)}');
  });

  it('does not turn a canvas that reads fully transparent into an opaque black JPEG', async () => {
    const { _snapshotDOMSync } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<canvas id="gl" width="1440" height="900"></canvas>';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(16 * 9 * 4) }) });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,BLACK');
    const { clone } = _snapshotDOMSync();
    expect(clone.querySelector('img#gl')).toBeNull();
    expect(clone.querySelector('canvas#gl')).not.toBeNull();
  });

  it('keeps a canvas snapshot by stepping quality down when the first JPEG is over the cap', async () => {
    const { _snapshotDOMSync } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<canvas id="gl" width="1440" height="900"></canvas>';
    let calls = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => (++calls < 4 ? 'data:image/jpeg;base64,' + 'A'.repeat(600 * 1024) : 'data:image/jpeg;base64,SMALL'));
    const { clone } = _snapshotDOMSync();
    expect(clone.querySelector('canvas')).toBeNull();
    expect(clone.querySelector('img#gl').getAttribute('src')).toBe('data:image/jpeg;base64,SMALL');
  });

  it('keeps the first readable frame of each canvas; an always-blank canvas does not lose it', async () => {
    const { _snapshotDOM } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<canvas id="gl" width="1440" height="900"></canvas><canvas id="blank" width="1440" height="900"></canvas>';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(0, 0, window.innerWidth, window.innerHeight));
    let glProbes = 0; // #gl is drawn only in its 3rd probed frame; blank again at snapshot time (buffer cleared)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      let drawn = false;
      return { drawImage(src) { drawn = src.id === 'gl' && ++glProbes === 3; }, getImageData: () => ({ data: new Uint8ClampedArray(16 * 9 * 4).fill(drawn ? 255 : 0) }) };
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,GLFRAME');
    const { clone } = await _snapshotDOM(200);
    expect(clone.querySelector('img#gl').getAttribute('src')).toBe('data:image/jpeg;base64,GLFRAME');
    expect(clone.querySelector('canvas#blank')).not.toBeNull();
  });

  it('encodes a canvas that has transparent areas as WebP, not JPEG (JPEG makes them an opaque black box)', async () => {
    const { _snapshotDOMSync } = await import('../src/utils/screenshot.js');
    document.body.innerHTML = '<canvas id="gl" width="1440" height="900"></canvas>';
    const px = new Uint8ClampedArray(64 * 36 * 4).fill(255); px[3] = 0; // one transparent pixel, the rest opaque
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {}, getImageData: () => ({ data: px }) });
    const enc = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(t => `data:${t};base64,X`);
    const { clone } = _snapshotDOMSync();
    expect(clone.querySelector('img#gl').getAttribute('src')).toBe('data:image/webp;base64,X');
    expect(enc).not.toHaveBeenCalledWith('image/jpeg', expect.anything());
  });
});
