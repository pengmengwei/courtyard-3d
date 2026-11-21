import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'screenshots');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/Users/bytedance/Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('body.ready', { timeout: 60000 });
  await page.waitForFunction(() => window.__courtyard?.renderer?.info?.render?.frame > 1, null, { timeout: 60000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).visibility === 'hidden', null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '01-overview.png') });

  for (const [key, file] of [['facade', '02-facade.png'], ['tea', '03-tea.png'], ['gate', '04-gate.png']]) {
    await page.click(`[data-view="${key}"]`);
    await page.waitForFunction(key => {
      const app = window.__courtyard;
      const destination = app.views[key].position;
      return app.camera.position.distanceTo({ x: destination[0], y: destination[1], z: destination[2] }) < 0.03;
    }, key, { timeout: 10000 });
    await page.screenshot({ path: path.join(shots, file) });
  }

  await page.click('[data-view="overview"]');
  await page.waitForFunction(() => {
    const app = window.__courtyard;
    const p = app.views.overview.position;
    return app.camera.position.distanceTo({ x: p[0], y: p[1], z: p[2] }) < 0.03;
  });
  await page.click('[data-time="20"]');
  await page.waitForSelector('body.night');
  await page.screenshot({ path: path.join(shots, '05-night.png') });
  await page.click('[data-time="14.5"]');

  await page.click('#labels-button');
  await page.waitForSelector('#labels.visible');
  if (await page.locator('.scene-label:visible').count() < 1) throw new Error('No scene labels rendered');
  await page.click('#labels-button');

  await page.evaluate(() => document.querySelector('#rotate-button').click());
  await page.waitForFunction(() => window.__courtyard.controls.autoRotate === true);
  await page.evaluate(() => document.querySelector('#rotate-button').click());
  await page.waitForFunction(() => window.__courtyard.controls.autoRotate === false);
  await page.evaluate(() => {
    const app = window.__courtyard;
    app.controls.enableDamping = false;
    app.setView('overview', true);
    app.controls.update();
    app.controls.enableDamping = true;
  });

  await page.click('#references-button');
  await page.waitForSelector('#reference-dialog[open]');
  await page.click('[data-photo="2"]');
  await page.waitForFunction(() => document.querySelector('#reference-image').src.endsWith('/3.jpeg'));
  await page.screenshot({ path: path.join(shots, '06-references.png') });
  await page.click('#close-references');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__courtyard.setView('overview', true));
  await page.waitForFunction(() => document.querySelector('canvas').width === 390);
  await page.screenshot({ path: path.join(shots, '07-mobile.png') });

  const stats = await page.evaluate(() => ({
    meshes: window.__courtyard.renderer.info.render.calls,
    triangles: window.__courtyard.renderer.info.render.triangles,
    sceneObjects: window.__courtyard.scene.children.length,
    canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height],
  }));
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.click('#capture-button', { timeout: 120000 }),
  ]);
  if (!download.suggestedFilename().endsWith('.png')) throw new Error('PNG export failed');

  console.log(JSON.stringify({ status: 'ok', stats, download: download.suggestedFilename(), errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (error) {
  await page.screenshot({ path: path.join(shots, 'error.png') }).catch(() => {});
  console.error(error);
  console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
