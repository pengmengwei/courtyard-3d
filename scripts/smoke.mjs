import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: '/Users/bytedance/Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('body.ready', { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'screenshots/smoke-overview.png' });
  console.log(JSON.stringify({ errors }, null, 2));
} catch (e) {
  await page.screenshot({ path: 'screenshots/smoke-error.png' }).catch(()=>{});
  console.log('FAIL', e.message, errors);
}
await browser.close();
