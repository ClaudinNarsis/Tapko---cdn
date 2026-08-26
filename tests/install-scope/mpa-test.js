// Reproduction 2: the multi-page install path documented in examples/local-testing —
// full snippet on one page, bare <script> on the others, config carried in sessionStorage.
const { chromium } = require('./playwright');
const ORIGIN = 'http://localhost:8099';

async function mockApi(page) {
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/project')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, message: 'ok',
        status: { exists: true, isCollectingFeedback: true },
        data: { projectId: 'proj-test-1', projectName: 'Harness', widgetSettings: {} }
      })});
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { feedbacks: [] } })});
  });
}

const probe = (page) => page.evaluate(() => ({
  scriptLoaded: typeof window.Tapko !== 'undefined',
  widgetMounted: !!document.getElementById('tapko-widget-shadow-host'),
  ready: window.Tapko ? window.Tapko.isReady() : false
}));

(async () => {
  const browser = await chromium.launch();

  // ── Scenario 1: visitor deep-links straight to a page that only has the bare script
  let ctx = await browser.newContext();
  let page = await ctx.newPage();
  await mockApi(page);
  await page.goto(ORIGIN + '/mpa/page-bare.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('S1  fresh session, land on bare page   :', JSON.stringify(await probe(page)));
  await ctx.close();

  // ── Scenario 2: visitor lands on the snippet page first, then navigates to the bare page
  ctx = await browser.newContext();
  page = await ctx.newPage();
  await mockApi(page);
  await page.goto(ORIGIN + '/mpa/page-with-snippet.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('S2a snippet page                       :', JSON.stringify(await probe(page)));
  await page.click('a');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('S2b then bare page (session restore)   :', JSON.stringify(await probe(page)));

  // ── Scenario 3: a page in the same app with no Tapko script at all
  await page.goto(ORIGIN + '/mpa/page-none.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  console.log('S3  page with no script tag            :', JSON.stringify(await probe(page)));
  await ctx.close();

  // ── Scenario 4: the React pattern — bundle injected again by a second route's component
  ctx = await browser.newContext();
  page = await ctx.newPage();
  await mockApi(page);
  const warnings = [];
  page.on('console', m => { if (m.type() === 'warning' || m.text().includes('already')) warnings.push(m.text()); });
  await page.goto(ORIGIN + '/mpa/page-none.html', { waitUntil: 'networkidle' });
  await page.evaluate((origin) => {
    const s = document.createElement('script');
    s.src = origin + '/dist/tapko-widget.js';
    s.setAttribute('data-tapko-project-id', 'proj-test-1');
    document.head.appendChild(s);
  }, ORIGIN);
  await page.waitForTimeout(2500);
  console.log('S4a first dynamic injection            :', JSON.stringify(await probe(page)));
  await page.evaluate(() => window.Tapko.destroy());
  await page.waitForTimeout(500);
  console.log('S4b after destroy() (route unmount)    :', JSON.stringify(await probe(page)));
  await page.evaluate((origin) => {
    const s = document.createElement('script');
    s.src = origin + '/dist/tapko-widget.js';
    s.setAttribute('data-tapko-project-id', 'proj-test-1');
    document.head.appendChild(s);
  }, ORIGIN);
  await page.waitForTimeout(2500);
  console.log('S4c re-injected on next route          :', JSON.stringify(await probe(page)));
  console.log('S4  console warnings                   :', JSON.stringify(warnings.slice(0, 4)));

  await browser.close();
})();
