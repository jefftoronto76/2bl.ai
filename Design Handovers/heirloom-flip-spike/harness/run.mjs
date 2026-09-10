import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { RAF_INIT_SCRIPT, listenerCounts, sample } from './measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const server = await createServer({ configFile: join(here, 'vite.config.ts'), server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const results = {};
async function open({ mobile = false, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion }
      : { viewport: { width: 900, height: 800 }, reducedMotion },
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 240)}`));
  await page.addInitScript(RAF_INIT_SCRIPT);
  await page.goto(url);
  const cdp = await ctx.newCDPSession(page);
  const api = {
    page, cdp, ctx,
    errors: () => errors.splice(0),
    events: () => page.evaluate(() => window.__events.splice(0).map((e) => `${e.name}:${e.pageIndex}`)),
    mount: (o) => page.evaluate((x) => window.__mount(x), o ?? {}),
    unmount: () => page.evaluate(() => window.__unmount()),
    status: () => page.getByTestId('status').textContent(),
    phase: () => page.locator('[data-phase]').getAttribute('data-phase'),
    rotation: (leaf) => page.locator(`[data-leaf="${leaf}"]`).evaluate((el) => el.style.transform || '(none)'),
    box: () => page.locator('[data-phase]').boundingBox(),
    settle: (ms = 900) => page.waitForTimeout(ms),
    close: () => ctx.close(),
  };
  return api;
}

/** Mouse drag across `fraction` of the surface width; `steps`/`stepDelay` set the velocity. */
async function drag(h, fraction, { steps = 12, stepDelay = 30, holdBefore = 0 } = {}) {
  const b = await h.box();
  const x0 = b.x + b.width * 0.6; const y = b.y + b.height / 2;
  await h.page.mouse.move(x0, y);
  await h.page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await h.page.mouse.move(x0 + (b.width * fraction * i) / steps, y);
    if (stepDelay) await h.page.waitForTimeout(stepDelay);
  }
  if (holdBefore) await h.page.waitForTimeout(holdBefore);
  await h.page.mouse.up();
}

/** Touch drag via CDP (pointerType touch), for the mobile-emulated context. */
async function touchDrag(h, fraction, { steps = 12, stepDelay = 30, axis = 'x' } = {}) {
  const b = await h.box();
  const x0 = b.x + b.width * 0.6; const y0 = b.y + b.height / 2;
  const pt = (x, y) => ({ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 });
  await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x0, y0)] });
  for (let i = 1; i <= steps; i++) {
    const d = (b.width * fraction * i) / steps;
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [axis === 'x' ? pt(x0 + d, y0) : pt(x0, y0 + d)] });
    if (stepDelay) await h.page.waitForTimeout(stepDelay);
  }
  await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// ---------- desktop ----------
{
  const h = await open();
  const baseWin = await listenerCounts(h.cdp, 'window');
  const baseDoc = await listenerCounts(h.cdp, 'document');

  // H1 mount (StrictMode)
  await h.mount({ strict: true });
  await h.settle(300);
  results.H1_mount_strict = { status: await h.status(), leaves: await h.page.locator('[data-leaf]').count(), current: await h.rotation('current'), errors: h.errors(), events: await h.events() };

  // H11 idle cost while mounted (3 s)
  results.H11_idle_mounted_3s = await sample(h.page, h.cdp, 3000);

  // H2 click Next
  await h.page.getByRole('button', { name: 'Next' }).click();
  await h.page.waitForTimeout(250);
  await h.page.screenshot({ path: join(here, 'mid-flip.png') });
  const midRotation = await h.rotation('current');
  await h.settle();
  results.H2_click_next = { midRotation, events: await h.events(), status: await h.status(), phase: await h.phase(), current: await h.rotation('current'), previous: await h.rotation('previous'), errors: h.errors() };

  // H14 click Prev (previous leaf turns in)
  await h.page.getByRole('button', { name: 'Previous' }).click();
  await h.page.waitForTimeout(250);
  const midPrev = await h.rotation('previous');
  await h.settle();
  results.H14_click_prev = { midPrevRotation: midPrev, events: await h.events(), status: await h.status(), phase: await h.phase(), errors: h.errors() };

  // H3 slow drag 10% -> spring back
  await drag(h, -0.10, { steps: 10, stepDelay: 40, holdBefore: 300 });
  await h.settle(700);
  results.H3_drag_10pct_cancel = { events: await h.events(), status: await h.status(), phase: await h.phase(), current: await h.rotation('current') };

  // H4 slow drag 40% -> commit
  await drag(h, -0.40, { steps: 16, stepDelay: 40, holdBefore: 300 });
  await h.settle();
  results.H4_drag_40pct_commit = { events: await h.events(), status: await h.status(), phase: await h.phase(), current: await h.rotation('current') };

  // H5 flick: 8% distance, fast
  await drag(h, -0.08, { steps: 3, stepDelay: 4 });
  await h.settle();
  results.H5_flick_8pct_fast = { events: await h.events(), status: await h.status(), phase: await h.phase() };

  // H8 drag while animating -> ignored
  await h.page.getByRole('button', { name: 'Next' }).click();
  await h.page.waitForTimeout(80);
  await drag(h, 0.5, { steps: 4, stepDelay: 10 });
  await h.settle();
  results.H8_drag_during_flip = { events: await h.events(), status: await h.status(), phase: await h.phase(), errors: h.errors() };

  // H7 rapid clicks
  await h.unmount(); await h.mount(); await h.settle(200); await h.events();
  for (let i = 0; i < 10; i++) { await h.page.getByRole('button', { name: 'Next' }).click({ force: true }); await h.page.waitForTimeout(30); }
  await h.settle(1500);
  const ev7 = await h.events();
  results.H7_rapid_10_clicks = { nextAccepted: ev7.filter((e) => e.startsWith('next')).length, settled: ev7.filter((e) => e.startsWith('settled')).length, status: await h.status(), phase: await h.phase(), nextEnabled: await h.page.getByRole('button', { name: 'Next' }).isEnabled(), errors: h.errors() };

  // H7b rapid alternating
  for (let i = 0; i < 8; i++) { await h.page.getByRole('button', { name: i % 2 ? 'Previous' : 'Next' }).click({ force: true }); await h.page.waitForTimeout(25); }
  await h.settle(1500);
  const ev7b = await h.events();
  results.H7b_rapid_alternating = { accepted: ev7b.filter((e) => !e.startsWith('settled')).length, settled: ev7b.filter((e) => e.startsWith('settled')).length, status: await h.status(), phase: await h.phase(), errors: h.errors() };

  // H7c 20 ArrowRight presses 40 ms apart: the hook's lock, not a disabled button, must serialise them
  await h.unmount(); await h.mount(); await h.settle(200); await h.events();
  await h.page.locator('[data-phase]').focus();
  for (let i = 0; i < 20; i++) { await h.page.keyboard.press('ArrowRight'); await h.page.waitForTimeout(40); }
  await h.settle(1500);
  const ev7c = await h.events();
  results.H7c_rapid_20_keypresses = { accepted: ev7c.filter((e) => e.startsWith('next')).length, settled: ev7c.filter((e) => e.startsWith('settled')).length, status: await h.status(), phase: await h.phase(), errors: h.errors() };
  // H7d presses paced at ~animation length (600 ms): each should land
  await h.unmount(); await h.mount(); await h.settle(200); await h.events();
  await h.page.locator('[data-phase]').focus();
  for (let i = 0; i < 5; i++) { await h.page.keyboard.press('ArrowRight'); await h.page.waitForTimeout(600); }
  await h.settle(800);
  const ev7d = await h.events();
  results.H7d_5_keypresses_paced_600ms = { accepted: ev7d.filter((e) => e.startsWith('next')).length, settled: ev7d.filter((e) => e.startsWith('settled')).length, status: await h.status(), phase: await h.phase() };

  // H6 drag back on first page -> nothing
  await h.unmount(); await h.mount(); await h.settle(200); await h.events();
  await drag(h, 0.4, { steps: 8, stepDelay: 30 });
  await h.settle(600);
  results.H6_drag_back_on_first_page = { events: await h.events(), status: await h.status(), previousLeafPresent: await h.page.locator('[data-leaf="previous"]').count(), current: await h.rotation('current') };

  // H13 keyboard
  await h.page.locator('[data-phase]').focus();
  await h.page.keyboard.press('ArrowRight'); await h.settle();
  await h.page.keyboard.press('ArrowLeft'); await h.settle();
  results.H13_keyboard = { events: await h.events(), status: await h.status() };

  // H9 viewport + surface height mutation mid-drag (desktop mouse)
  {
    const b = await h.box(); const x0 = b.x + b.width * 0.6; const y = b.y + b.height / 2;
    await h.page.mouse.move(x0, y); await h.page.mouse.down();
    for (let i = 1; i <= 5; i++) { await h.page.mouse.move(x0 - (b.width * 0.15 * i) / 5, y); await h.page.waitForTimeout(30); }
    await h.page.setViewportSize({ width: 420, height: 560 });
    await h.page.evaluate(() => { document.documentElement.style.setProperty('--surface-h', '420px'); window.dispatchEvent(new Event('resize')); });
    await h.page.waitForTimeout(60);
    const b2 = await h.box();
    for (let i = 6; i <= 12; i++) { await h.page.mouse.move(x0 - (b.width * 0.40 * i) / 12, y); await h.page.waitForTimeout(30); }
    await h.page.waitForTimeout(300);
    await h.page.mouse.up();
    await h.settle();
    results.H9_geometry_mutation_mid_drag = { boxBefore: { w: b.width, h: b.height }, boxAfter: { w: b2.width, h: b2.height }, events: await h.events(), status: await h.status(), phase: await h.phase(), errors: h.errors() };
    await h.page.evaluate(() => document.documentElement.style.removeProperty('--surface-h'));
    await h.page.setViewportSize({ width: 900, height: 800 });
  }

  // H10 unmount cleanliness: 3 mount/unmount cycles — a per-instance leak grows, a one-time global registration does not
  const winMounted = await listenerCounts(h.cdp, 'window');
  const cycles = [];
  for (let i = 0; i < 3; i++) { await h.unmount(); await h.page.waitForTimeout(100); await h.mount(); await h.settle(200); await h.page.getByRole('button', { name: 'Next' }).click(); await h.settle(); cycles.push(await listenerCounts(h.cdp, 'window')); }
  results.H10a_window_listeners_per_cycle = cycles;
  {
    const { result } = await h.cdp.send('Runtime.evaluate', { expression: 'window' });
    const { listeners } = await h.cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    results.H10b_window_listener_sources = listeners.map((l) => `${l.type}: ${(l.handler?.description ?? '').replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  await h.unmount();
  await h.page.waitForTimeout(300);
  const after = await sample(h.page, h.cdp, 1500);
  results.H10_unmount = { windowBaseline: baseWin, windowMounted: winMounted, windowAfterUnmount: await listenerCounts(h.cdp, 'window'), documentBaseline: baseDoc, documentAfterUnmount: await listenerCounts(h.cdp, 'document'), idleAfterUnmount: after, errors: h.errors() };
  await h.close();
}

// ---------- reduced motion ----------
{
  const h = await open({ reducedMotion: 'reduce' });
  await h.mount(); await h.settle(200); await h.events();
  await h.page.getByRole('button', { name: 'Next' }).click();
  await h.page.waitForTimeout(120);
  results.H12_reduced_motion = { events: await h.events(), status: await h.status(), phase: await h.phase(), errors: h.errors() };
  await h.close();
}

// ---------- mobile (390x844, touch) ----------
{
  const h = await open({ mobile: true });
  await h.mount(); await h.settle(300); await h.events();
  await touchDrag(h, -0.40, { steps: 12, stepDelay: 30 });
  await h.settle();
  results.M1_touch_drag_40pct_commit = { events: await h.events(), status: await h.status(), phase: await h.phase(), errors: h.errors() };
  await touchDrag(h, -0.10, { steps: 8, stepDelay: 40 });
  await h.settle(700);
  results.M2_touch_drag_10pct_cancel = { events: await h.events(), status: await h.status(), phase: await h.phase() };
  const scrollBefore = await h.page.evaluate(() => window.scrollY);
  await h.page.evaluate(() => { document.body.style.height = '3000px'; });
  {
    await h.page.evaluate(() => window.scrollTo(0, 0));
    await h.cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 300, yDistance: -300, gestureSourceType: 'touch', speed: 800 });
  }
  await h.settle(500);
  results.M3_vertical_touch_scrolls_not_flips = { events: await h.events(), status: await h.status(), scrollYBefore: scrollBefore, scrollYAfter: await h.page.evaluate(() => window.scrollY), touchAction: await h.page.locator('[data-phase]').evaluate((el) => getComputedStyle(el).touchAction) };
  await h.page.evaluate(() => { document.body.style.height = ''; window.scrollTo(0, 0); });
  // M4: keyboard-style viewport shrink + body scroll-lock (the repo's pattern) mid touch-drag
  {
    const b = await h.box(); const x0 = b.x + b.width * 0.6; const y0 = b.y + b.height / 2;
    const pt = (x, y) => ({ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 });
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x0, y0)] });
    for (let i = 1; i <= 4; i++) { await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(x0 - (b.width * 0.12 * i) / 4, y0)] }); await h.page.waitForTimeout(30); }
    await h.page.setViewportSize({ width: 390, height: 520 });
    await h.page.evaluate(() => { document.documentElement.style.setProperty('--surface-h', '380px'); document.body.style.position = 'fixed'; document.body.style.top = '0px'; document.body.style.left = '0'; document.body.style.right = '0'; });
    await h.page.waitForTimeout(60);
    for (let i = 5; i <= 12; i++) { await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(x0 - (b.width * 0.40 * i) / 12, y0)] }); await h.page.waitForTimeout(30); }
    await h.page.waitForTimeout(300);
    await h.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await h.settle();
    results.M4_viewport_shrink_and_body_lock_mid_touch_drag = { events: await h.events(), status: await h.status(), phase: await h.phase(), errors: h.errors() };
    await h.page.evaluate(() => { document.body.style.position = ''; document.documentElement.style.removeProperty('--surface-h'); });
  }
  results.M5_idle_mounted_mobile_3s = await sample(h.page, h.cdp, 3000);
  await h.close();
}

writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
await server.close();
