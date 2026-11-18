// Tapko widget screenshot harness for any page (--url). Driven by run.sh / the stress-test skill.
// Real page + real dev renderer Lambda; all WRITE endpoints are stubbed so no dev data is created.
// usage: node harness.js --widget path/to/tapko-widget.js --dpr 2 --mode auto|local --render url|html
//          --scrolls 0,1800,6000|auto --out runs/x [--profile dir] [--url ...] [--width 1440 --height 900]
//          [--scenario default|rapid|midscroll|rendererdown|reload|annotate] [--headed 1]
// DEV BUNDLE ONLY. Writes are stubbed by matching the dev API host (execute-api);
// a prod bundle's API host is not matched, so a prod run would create real feedback.
// Build the widget against the dev API first:
//   API_URL=<dev api> RENDERER_URL=<dev api> node build.js && cp dist/tapko-widget.js <somewhere>
// Uses system Chrome (channel 'chrome'); no Playwright browser download needed.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const DPR = Number(args.dpr || 1);
const MODE = args.mode || 'auto';           // project screenshotMode: auto | local
const RENDER = args.render || 'url';        // project renderMode: url | html
let SCROLLS = args.scrolls && args.scrolls !== 'auto' ? args.scrolls.split(',').map(Number) : null; // null = auto
const OUT = path.resolve(args.out || `runs/dpr${DPR}-${MODE}-${RENDER}`);
const WIDGET = path.resolve(args.widget || '../../dist/tapko-widget.js');
const SCENARIO = args.scenario || 'default';
const URL_ = args.url; if (!URL_) { console.error('--url is required'); process.exit(2); }
const W = Number(args.width || 1440), H = Number(args.height || 900);
const PROFILE = path.resolve(args.profile || `profiles/p-${process.pid}`);
// Dev test project/user (dev data only; every write below is stubbed anyway).
const PROJECT = process.env.TAPKO_PROJECT || 'b2b47236-5567-42b2-9fdc-4cb8deb5f63e';
const USER = process.env.TAPKO_USER || 'user_36PrQyirxWUXgwmtnnhuXI8G4xu';
// Refuse non-dev bundles: their API host is not stubbed, so writes would hit real data.
const BUNDLE = fs.readFileSync(WIDGET, 'utf8');
if (!/execute-api[^"'`]*\/dev\/api/.test(BUNDLE) || /api\.tapko\.app|\/prod\/api/.test(BUNDLE)) { console.error(`${WIDGET} is not a dev-API build; refusing (see run.sh)`); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const log = (...m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m.join(' ')}`; console.log(s); fs.appendFileSync(path.join(OUT, 'log.txt'), s + '\n'); };
const results = [];

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome', headless: args.headed ? false : true,
    viewport: { width: W, height: H }, deviceScaleFactor: DPR,
    args: ['--auto-accept-this-tab-capture', '--use-fake-ui-for-media-stream', '--enable-usermedia-screen-capturing'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  // Closed shadow root → open, so the harness can drive the card.
  await page.addInitScript(() => { const o = Element.prototype.attachShadow; Element.prototype.attachShadow = function (i) { return o.call(this, { ...i, mode: 'open' }); }; });

  const renders = [];
  page.on('console', m => { const t = m.text(); if (/\[Tapko\]|Tapko Renderer|screenshot/i.test(t) && !/Timing|S3\]|API\]/.test(t)) fs.appendFileSync(path.join(OUT, 'console.txt'), `${m.type()} ${t.slice(0, 400)}\n`); });
  page.on('pageerror', e => fs.appendFileSync(path.join(OUT, 'console.txt'), `PAGEERROR ${e.message}\n`));

  let uploadN = 0; let lastUpload = null;
  // Only API/upload hosts are routed: Playwright interception bypasses the
  // HTTP cache, and routing everything made the widget's asset inlining
  // re-download the whole site (15-20 s "inline" stages that real users,
  // with a warm cache, never see).
  const API_HOSTS = /execute-api|tapko-fake-upload\.test/;
  await ctx.route((u) => API_HOSTS.test(u.hostname), async (route) => {
    const req = route.request(); const u = req.url();
    if (u.startsWith('https://tapko-fake-upload.test/')) {
      const name = decodeURIComponent(u.split('/').pop());
      const buf = req.postDataBuffer();
      if (buf && /screenshot|\.(png|jpe?g|webp)$/i.test(name)) { const f = path.join(OUT, `upload-${++uploadN}-${name.replace(/[^\w.-]/g, '_')}`); fs.writeFileSync(f, buf); lastUpload = f; }
      return route.fulfill({ status: 200, body: '' });
    }
    if (SCENARIO === 'rendererdown' && u.endsWith('/render')) { renders.push({ kind: 'aborted' }); return route.abort('connectionrefused'); }
    if (u.includes('/upload/presigned-url')) {
      const body = JSON.parse(req.postData() || '{}');
      const key = `${body.folderName || 'f'}/${body.fileName || 'file'}`;
      return route.fulfill({ json: { success: true, data: { uploadUrl: `https://tapko-fake-upload.test/${encodeURIComponent(body.fileName || 'file')}`, key, bucket: 'fake', url: `https://tapko-fake-upload.test/${key}` } } });
    }
    if (req.method() !== 'GET' && /\/(feedback\/submit|comments|feedback)(\b|\/|\?)/.test(u) && !u.includes('/render')) {
      return route.fulfill({ json: { success: true, data: { feedbackId: 'harness-' + Date.now(), id: 'harness' } } });
    }
    if (u.includes('/project?')) {
      const r = await route.fetch(); const j = await r.json();
      j.data = { ...(j.data || {}), screenshotMode: MODE, renderMode: RENDER };
      return route.fulfill({ response: r, json: j });
    }
    if (u.endsWith('/render')) {
      const body = JSON.parse(req.postData() || '{}');
      const t0 = Date.now();
      const r = await route.fetch({ timeout: 60000 }).catch(e => ({ err: e }));
      if (r.err) { renders.push({ kind: body.url ? 'url' : 'html', err: r.err.message }); return route.abort(); }
      const txt = await r.text();
      const rec = { kind: body.url ? 'url' : 'html', status: r.status(), ms: Date.now() - t0, reqScrollY: body.scrollY, w: body.width, h: body.height, dpr: body.devicePixelRatio, htmlKB: body.html ? Math.round(body.html.length / 1024) : undefined };
      if (body.html) fs.writeFileSync(path.join(OUT, `render-${renders.length + 1}-req.html`), body.html);
      try { const j = JSON.parse(txt); if (j.image) { const f = path.join(OUT, `render-${renders.length + 1}-${rec.kind}.${j.format}`); fs.writeFileSync(f, Buffer.from(j.image, 'base64')); rec.file = path.basename(f); } else rec.body = txt.slice(0, 200); } catch { rec.body = txt.slice(0, 200); }
      renders.push(rec);
      return route.fulfill({ response: r, body: txt });
    }
    return route.continue();
  });

  log(`start dpr=${DPR} mode=${MODE} render=${RENDER} widget=${path.basename(WIDGET)} url=${URL_}`);
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'load', timeout: 90000 });
  // Wait for the site's own preloader (bos: html.lenis-stopped) up to 150s.
  // Ready = no loader-named full-viewport layer anywhere in the centre stack
  // (bos: #bos-preloader stays mounted mid-outro after Lenis starts).
  const ready = await page.waitForFunction(() => {
    const force = document.createElement('style');
    force.textContent = '*{pointer-events:auto!important}';
    document.head.appendChild(force);
    const stack = document.elementsFromPoint(innerWidth / 2, innerHeight / 2);
    force.remove();
    if (document.documentElement.classList.contains('lenis-stopped')) return false; // bos: scroll locked until the intro ends
    return !stack.some(e => /pre-?load|loader|splash/i.test(`${e.id} ${typeof e.className === 'string' ? e.className : ''}`)
      && e.getBoundingClientRect().width >= innerWidth * 0.9 && getComputedStyle(e).opacity !== '0' && getComputedStyle(e).visibility !== 'hidden');
  }, null, { timeout: 150000, polling: 500 }).then(() => true, () => false);
  if (!ready) log('WARN loader still covering the page after 150s');
  log(`page ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.waitForTimeout(1500);
  if (!SCROLLS) {
    // auto: top, 25/50/75%, bottom of the scrollable height.
    const max = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
    SCROLLS = [...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f)))];
    log(`auto scrolls: ${SCROLLS.join(',')}`);
  }

  await page.addScriptTag({ content: BUNDLE });
  await page.evaluate(({ PROJECT, USER }) => window.Tapko.init({ projectId: PROJECT, userId: USER }), { PROJECT, USER });
  await page.waitForFunction(() => window.Tapko && window.Tapko.isReady && window.Tapko.isReady(), null, { timeout: 30000 });
  log('widget ready; projectStatus=' + JSON.stringify(await page.evaluate(() => window.Tapko.getProjectStatus && window.Tapko.getProjectStatus())));

  const shadow = () => page.locator('#tapko-widget-shadow-host');
  for (const [i, target] of SCROLLS.entries()) {
    // Scroll like a user (Lenis listens to wheel).
    await page.mouse.move(W / 2, H / 2);
    for (let k = 0; k < 80; k++) {
      const cur = await page.evaluate(() => scrollY);
      const d = target - cur; if (Math.abs(d) < 5) break;
      await page.mouse.wheel(0, Math.sign(d) * Math.min(Math.abs(d), 600)); await page.waitForTimeout(120);
    }
    await page.waitForTimeout(2500);
    const sy = await page.evaluate(() => Math.round(scrollY));
    if (Math.abs(sy - target) > 50) log(`#${i} WARN wanted scrollY ${target}, reached ${sy}`);
    if (SCENARIO === 'reload' && i > 0) {
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(4000);
      await page.addScriptTag({ content: BUNDLE });
      await page.evaluate(({ PROJECT, USER }) => window.Tapko.init({ projectId: PROJECT, userId: USER }), { PROJECT, USER });
      await page.waitForFunction(() => window.Tapko.isReady && window.Tapko.isReady(), null, { timeout: 30000 });
    }
    await page.evaluate(() => window.Tapko.enterFeedbackMode());
    await page.waitForTimeout(600);
    const cx = Math.round(W * (0.3 + 0.4 * ((i % 3) / 2))), cy = Math.round(H * (0.35 + 0.15 * (i % 3)));
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(800);
    const ta = shadow().locator('textarea').first();
    if (!(await ta.count())) { log(`#${i} y=${target}: NO CARD after click`); results.push({ i, target, sy, error: 'no card' }); continue; }
    await ta.fill(`harness comment ${i} at scrollY ${sy}`);
    await page.screenshot({ path: path.join(OUT, `truth-${i}-y${sy}.png`) });
    const before = renders.length; const upBefore = uploadN;
    const ts = Date.now();
    if (SCENARIO === 'annotate') {
      // "Attach annotations" captures first, then opens the drawing canvas.
      const btn = shadow().locator('button', { hasText: /annotation/i }).first();
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(15000); await page.screenshot({ path: path.join(OUT, `annotate-${i}.png`) }); }
      results.push({ i, target, sy, annotateScreenshot: `annotate-${i}.png` });
      await page.keyboard.press('Escape'); continue;
    }
    await shadow().locator('.dtc-btn-submit').first().click();
    if (SCENARIO === 'midscroll') { for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(80); } }
    // Wait until a screenshot upload lands, or 70s.
    // rapid: do not wait for the upload; go straight to the next comment.
    while (SCENARIO !== 'rapid' && Date.now() - ts < 70000 && uploadN === upBefore) await page.waitForTimeout(500);
    const sySub = await page.evaluate(() => Math.round(scrollY));
    const r = { i, target, sy, syAfterSubmit: sySub, click: [cx, cy], ms: Date.now() - ts, renders: renders.slice(before), upload: uploadN > upBefore ? path.basename(lastUpload) : null };
    results.push(r);
    log(`#${i} y=${target} sy=${sy} -> upload=${r.upload} renders=${JSON.stringify(r.renders)}`);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.Tapko.closeAll && window.Tapko.closeAll()).catch(() => {});
    await page.evaluate(() => window.Tapko.exitFeedbackMode()).catch(() => {});
  }
  if (SCENARIO === 'rapid') { const t = Date.now(); while (Date.now() - t < 120000 && uploadN < SCROLLS.length) await page.waitForTimeout(1000); log(`rapid: ${uploadN}/${SCROLLS.length} uploads`); }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  // Chrome can hang on close with a live WebGL page; don't let it block the run.
  await Promise.race([ctx.close(), new Promise(r => setTimeout(r, 10000))]);
  log('done');
  process.exit(0);
})().catch(e => { log('FATAL ' + e.stack); process.exit(1); });
