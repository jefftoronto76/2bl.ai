// Idle-cost measurement for the page-flip engine, identical method to the hand-rolled spike (measure.mjs).
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { RAF_INIT_SCRIPT, sample } from './measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const server = await createServer({ configFile: join(here, 'vite.config.ts'), server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = {};
for (const [name, ctxOpts] of [['desktop', { viewport: { width: 900, height: 800 } }], ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript(RAF_INIT_SCRIPT);
  await page.goto(url);
  const cdp = await ctx.newCDPSession(page);
  results[`${name}_baseline_empty_page_3s`] = await sample(page, cdp, 3000);
  await page.evaluate(() => window.__mount({ variant: 'spike' }));
  await page.waitForTimeout(400);
  results[`${name}_idle_mounted_3s`] = await sample(page, cdp, 3000);
  await page.evaluate(() => window.__unmount());
  await page.waitForTimeout(300);
  results[`${name}_after_unmount_with_wrapper_cleanup_1500ms`] = await sample(page, cdp, 1500);
  await page.evaluate(() => window.__mount({ variant: 'raw' }));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__unmount());
  await page.waitForTimeout(300);
  results[`${name}_after_raw_unmount_no_cleanup_1500ms`] = await sample(page, cdp, 1500);
  await ctx.close();
}
writeFileSync(join(here, 'idle-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
await server.close();
