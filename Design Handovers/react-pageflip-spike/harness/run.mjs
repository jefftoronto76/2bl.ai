import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const server = await createServer({ configFile: join(here, 'vite.config.ts'), server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
await page.goto(url);
const cdp = await ctx.newCDPSession(page);

const results = {};
const drain = () => page.evaluate(() => window.__events.splice(0).map((e) => `${e.name}:${JSON.stringify(e.data)}`));
const drainErrors = () => errors.splice(0);
const settle = (ms) => page.waitForTimeout(ms);
const call = (expr) => page.evaluate((x) => { const pf = window.__handle?.pageFlip(); return new Function('pf', `return (${x})`)(pf); }, expr);
const winListeners = async () => {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  const counts = {};
  for (const l of listeners) counts[l.type] = (counts[l.type] ?? 0) + 1;
  return counts;
};
const itemCount = () => page.locator('.stf__item').count();

// T1: mount (no StrictMode) -> does onInit fire, and in what order vs flip?
await page.evaluate(() => window.__mount({ variant: 'raw' }));
await settle(300);
results.T1_mount_raw = { events: await drain(), items: await itemCount(), errors: drainErrors() };

// T2: animated flipNext -> expected changeState:flipping, flip:N, changeState:read
await call('pf.flipNext()');
await settle(120);
await page.screenshot({ path: join(here, 'mid-flip.png') });
await settle(700);
results.T2_flipNext = { events: await drain(), index: await call('pf.getCurrentPageIndex()'), state: await call('pf.getState()'), errors: drainErrors() };

// T3: turnToPage (no animation) -> expect flip only, no changeState
await call('pf.turnToPage(4)');
await settle(100);
results.T3_turnToPage_4 = { events: await drain(), index: await call('pf.getCurrentPageIndex()'), state: await call('pf.getState()') };

// T3b: turnToPage to the SAME page -> does flip re-fire?
await call('pf.turnToPage(4)');
await settle(100);
results.T3b_turnToPage_same = { events: await drain() };

// T4: animated jump back to page 0
await call('pf.flip(0)');
await settle(900);
results.T4_flip_to_0 = { events: await drain(), index: await call('pf.getCurrentPageIndex()'), state: await call('pf.getState()') };

// T5: two rapid flipNext calls
await call('pf.flipNext()');
await settle(50);
await call('pf.flipNext()');
await settle(1200);
results.T5_rapid_double_flipNext = { events: await drain(), index: await call('pf.getCurrentPageIndex()'), state: await call('pf.getState()'), errors: drainErrors() };

// T6: flipNext at the last spread -> any events?
await call('pf.turnToPage(5)');
await drain();
await call('pf.flipNext()');
await settle(700);
results.T6_flipNext_at_end = { events: await drain(), index: await call('pf.getCurrentPageIndex()'), state: await call('pf.getState()') };

// T7: change children count after mount (6 -> 7): is onUpdate delivered? DOM sane? React errors?
await page.evaluate(() => window.__mount({ variant: 'raw', pageCount: 7 }));
await settle(300);
results.T7_add_page_raw = { events: await drain(), items: await itemCount(), pageCount: await call('pf.getPageCount()'), errors: drainErrors() };

// T12: orientation change on resize (landscape -> portrait)
await page.setViewportSize({ width: 380, height: 700 });
await settle(400);
results.T12_resize_to_portrait = { events: await drain(), errors: drainErrors() };
await page.setViewportSize({ width: 1000, height: 700 });
await settle(400);
results.T12b_resize_to_landscape = { events: await drain(), errors: drainErrors() };

// T8: unmount RAW with no cleanup -> window listeners left behind?
const before = await winListeners();
await page.evaluate(() => window.__unmount());
await settle(100);
results.T8_raw_unmount_no_cleanup = { listenersBefore: before, listenersAfter: await winListeners(), errors: drainErrors(), rootChildren: await page.evaluate(() => document.getElementById('root').childElementCount) };

// T9: raw mount, call destroy() then unmount -> does React throw?
await page.evaluate(() => window.__mount({ variant: 'raw' }));
await settle(300); await drain(); drainErrors();
await call('pf.destroy()');
await page.evaluate(() => window.__unmount());
await settle(100);
results.T9_raw_destroy_then_unmount = { listenersAfter: await winListeners(), errors: drainErrors() };

// T10: StrictMode mount (raw) -> duplicated pages?
await page.evaluate(() => window.__mount({ variant: 'raw', strict: true }));
await settle(400);
results.T10_strict_raw = { events: await drain(), items: await itemCount(), pageCount: await call('pf.getPageCount()'), errors: drainErrors() };
await page.evaluate(() => window.__unmount());
await settle(100);

// T11: our typed wrapper (spike) in StrictMode -> same check, plus init/flip
await page.evaluate(() => window.__mount({ variant: 'spike', strict: true }));
await settle(400);
results.T11_strict_spike = { events: await drain(), items: await itemCount(), errors: drainErrors() };
await page.getByRole('button', { name: 'Next' }).click();
await settle(900);
results.T11b_spike_next_click = { events: await drain(), status: await page.getByTestId('status').textContent(), errors: drainErrors() };

// T13: spike wrapper unmount -> listeners cleaned by getUI().destroy()?
const before13 = await winListeners();
await page.evaluate(() => window.__unmount());
await settle(100);
results.T13_spike_unmount_cleanup = { listenersBefore: before13, listenersAfter: await winListeners(), errors: drainErrors() };

// T14: stale closure — re-render RAW with a new label (same children); does a flip report the old label?
await page.evaluate(() => window.__unmount());
await page.evaluate(() => window.__mount({ variant: 'raw', label: 'A' }));
await settle(300); await drain();
await page.evaluate(() => window.__mount({ variant: 'raw', label: 'B' }));
await settle(100); await drain();
await call('pf.turnToPage(2)');
await settle(100);
results.T14_raw_stale_closure = { events_after_rerender_with_label_B: await drain() };
await page.evaluate(() => window.__unmount());
await settle(50);
await page.evaluate(() => window.__mount({ variant: 'spike', label: 'A' }));
await settle(300); await drain();
await page.evaluate(() => window.__mount({ variant: 'spike', label: 'B' }));
await settle(100); await drain();
await page.getByRole('button', { name: 'Next' }).click();
await settle(900);
results.T14b_spike_stale_closure = { events_after_rerender_with_label_B: await drain() };
await page.evaluate(() => window.__unmount());
await settle(50);

// T15: StrictMode + spike wrapper: is the book still visible after the simulated remount, and does it flip?
await page.evaluate(() => window.__mount({ variant: 'spike', strict: true, label: 'S' }));
await settle(400); await drain(); drainErrors();
const visible = await page.evaluate(() => {
  const el = document.querySelector('.stf__block');
  return el ? { attached: document.contains(el), rect: el.getBoundingClientRect().width, items: el.querySelectorAll('.stf__item').length } : null;
});
await page.getByRole('button', { name: 'Next' }).click();
await settle(900);
results.T15_strict_spike_after_remount = { block: visible, events: await drain(), status: await page.getByTestId('status').textContent(), errors: drainErrors() };
const before15 = await winListeners();
await page.evaluate(() => window.__unmount());
await settle(100);
results.T15b_strict_spike_unmount = { listenersBefore: before15, listenersAfter: await winListeners(), errors: drainErrors() };

// T16: does a parent re-render with IDENTICAL children rebuild the engine's page collection? (DOM churn in .stf__block)
const churn = async (renderOnly) => {
  await page.evaluate(() => window.__unmount());
  await page.evaluate((ro) => window.__mount({ variant: 'raw', label: 'A', renderOnly: ro }), renderOnly);
  await settle(300); await drain();
  await page.evaluate(() => {
    const block = document.querySelector('.stf__block');
    window.__mutations = 0;
    new MutationObserver((list) => { window.__mutations += list.length; }).observe(block, { childList: true });
  });
  await page.evaluate((ro) => window.__mount({ variant: 'raw', label: 'B', renderOnly: ro }), renderOnly);
  await settle(200);
  const mutations = await page.evaluate(() => window.__mutations);
  await call('pf.turnToPage(2)');
  await settle(100);
  return { childListMutationsAfterRerender: mutations, flipEventLabel: await drain(), errors: drainErrors() };
};
results.T16_rerender_default = await churn(false);
results.T16b_rerender_renderOnlyPageLengthChange = await churn(true);

// T17: parent re-render landing mid-animation (default mode)
await page.evaluate(() => window.__unmount());
await page.evaluate(() => window.__mount({ variant: 'raw', label: 'A' }));
await settle(300); await drain(); drainErrors();
await call('pf.flipNext()');
await settle(120);
await page.evaluate(() => window.__mount({ variant: 'raw', label: 'B' }));
await settle(900);
results.T17_rerender_mid_flip = { events: await drain(), index: await call('pf.getCurrentPageIndex()'), state: await call('pf.getState()'), items: await itemCount(), errors: drainErrors() };

writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
await server.close();
