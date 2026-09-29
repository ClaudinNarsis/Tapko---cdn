// Reproduction: does the Tapko widget follow a client-side route change?
// The widget is installed ONCE in the app shell (the "correct" install).
const { chromium } = require('./playwright');

const ORIGIN = 'http://localhost:8099';

const feedbacks = [
  {
    feedbackId: 'fb-a', projectId: 'proj-test-1', feedbackTitle: 'Pin that belongs to route A',
    description: 'Pin that belongs to route A', status: 'open', createdAt: new Date().toISOString(),
    context: {
      pageUrl: ORIGIN + '/spa/route-a',
      position: { x: 100, y: 300, selector: '#target-a', relativeX: 0.2, relativeY: 0.3 },
      viewport: { width: 1280, height: 720 }
    }
  },
  {
    feedbackId: 'fb-b', projectId: 'proj-test-1', feedbackTitle: 'Pin that belongs to route B',
    description: 'Pin that belongs to route B', status: 'open', createdAt: new Date().toISOString(),
    context: {
      pageUrl: ORIGIN + '/spa/route-b',
      position: { x: 100, y: 300, selector: '#target-b', relativeX: 0.2, relativeY: 0.3 },
      viewport: { width: 1280, height: 720 }
    }
  }
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const apiCalls = [];
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    apiCalls.push(url.replace(/^https?:\/\/[^/]+/, ''));
    if (url.includes('/project')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true,
        message: 'ok',
        status: { exists: true, isCollectingFeedback: true },
        data: { projectId: 'proj-test-1', projectName: 'Harness', widgetSettings: {} }
      })});
    }
    if (url.includes('/feedbacks')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, data: { feedbacks }
      })});
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{}}' });
  });

  const pinLog = [];
  page.on('console', m => {
    const t = m.text();
    if (t.includes('[PinManager]') || t.includes('[Tapko]')) pinLog.push(t);
  });

  // The shadow root is opened in closed mode; the widget exposes it internally.
  const countPins = () => page.evaluate(() => {
    const host = document.getElementById('tapko-widget-shadow-host');
    const root = window.Tapko && window.Tapko._internal && window.Tapko._internal.shadowRoot;
    if (!host || !root) return { hostInDom: !!host, mounted: false, pins: [] };
    return {
      hostInDom: true,
      mounted: true,
      url: location.pathname,
      pins: [...root.querySelectorAll('.dtc-comment-pin')]
        .map(p => p.getAttribute('data-feedback-id') || p.dataset.feedbackId || 'pin')
    };
  });

  console.log('--- Load /spa/route-a (full page load) ---');
  await page.goto(ORIGIN + '/spa/route-a', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  console.log('route-a state:', JSON.stringify(await countPins()));
  console.log('api calls so far:', JSON.stringify(apiCalls));

  console.log('\n--- Client-side navigate to /spa/route-b (pushState, no reload) ---');
  const before = apiCalls.length;
  await page.click('#to-b');
  await page.waitForTimeout(2500);
  console.log('url now:', page.url());
  console.log('route-b state:', JSON.stringify(await countPins()));
  console.log('new api calls during navigation:', JSON.stringify(apiCalls.slice(before)));

  console.log('\n--- Hard reload of /spa/route-b (full page load) ---');
  await page.goto(ORIGIN + '/spa/route-b', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  console.log('route-b after reload:', JSON.stringify(await countPins()));

  console.log('\n--- PinManager log ---');
  console.log(pinLog.filter(l => l.includes('feedbacks for current page') || l.includes('Fetched')).join('\n'));

  await browser.close();
})();
