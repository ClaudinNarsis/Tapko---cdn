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
  const probe = () => page.evaluate(() => ({ mounted: !!document.getElementById('tapko-widget-shadow-host'), ready: window.Tapko ? window.Tapko.isReady() : false }));
  await page.goto(ORIGIN + '/mpa/page-with-snippet.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('mount 1              :', JSON.stringify(await probe()));
  await page.evaluate(() => window.Tapko.destroy());
  await page.waitForTimeout(500);
  console.log('after destroy        :', JSON.stringify(await probe()));
  await page.evaluate(() => window.Tapko.init({ projectId: 'proj-test-1' }));
  await page.waitForTimeout(2500);
  console.log('after manual re-init :', JSON.stringify(await probe()));
  await browser.close();
})();
