// Reproduction 3: navigation styles that replace <body> wholesale.
// Turbo (Rails/Hotwire), Astro view transitions, htmx hx-boost, Livewire wire:navigate,
// Barba/Swup all do some form of this.
const { chromium } = require('./playwright');
const ORIGIN = 'http://localhost:8099';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('**/api/**', (r) => {
    const url = r.request().url();
    if (url.includes('/project')) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
      success:true, message:'ok', status:{exists:true,isCollectingFeedback:true},
      data:{ projectId:'proj-test-1', projectName:'H', widgetSettings:{} }})});
    return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({success:true,data:{feedbacks:[]}})});
  });
  const probe = () => page.evaluate(() => ({
    hostInDom: !!document.getElementById('tapko-widget-shadow-host'),
    ready: window.Tapko ? window.Tapko.isReady() : false
  }));

  await page.goto(ORIGIN + '/mpa/page-with-snippet.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('after initial load        :', JSON.stringify(await probe()));

  // What Turbo does on turbo:render, and Astro's router on swap.
  await page.evaluate(() => {
    const fresh = document.createElement('body');
    fresh.innerHTML = '<h1>Next page rendered by the router</h1>';
    document.body.replaceWith(fresh);
    history.pushState({}, '', '/mpa/page-with-snippet.html?p=2');
  });
  await page.waitForTimeout(2500);
  console.log('after <body> swap         :', JSON.stringify(await probe()));
  console.log('isInitialized still true? :', await page.evaluate(() => window.Tapko.isReady()));

  await browser.close();
})();
