/** Shared measurement helpers so both spikes are scored the same way. */
export const RAF_INIT_SCRIPT = `
  (() => {
    const orig = window.requestAnimationFrame.bind(window);
    window.__rafCalls = 0;
    window.requestAnimationFrame = (cb) => orig((t) => { window.__rafCalls += 1; cb(t); });
    window.__longTasks = 0;
    try { new PerformanceObserver((l) => { window.__longTasks += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch {}
  })();
`;

export async function listenerCounts(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  const counts = {};
  for (const l of listeners) counts[l.type] = (counts[l.type] ?? 0) + 1;
  return counts;
}

const KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutCount', 'LayoutDuration', 'RecalcStyleCount', 'RecalcStyleDuration', 'JSHeapUsedSize'];

/** Sample CDP Performance metrics + rAF callback count over a window. */
export async function sample(page, cdp, ms) {
  await cdp.send('Performance.enable');
  const m0 = await cdp.send('Performance.getMetrics');
  const raf0 = await page.evaluate(() => window.__rafCalls);
  const lt0 = await page.evaluate(() => window.__longTasks);
  await page.waitForTimeout(ms);
  const m1 = await cdp.send('Performance.getMetrics');
  const raf1 = await page.evaluate(() => window.__rafCalls);
  const lt1 = await page.evaluate(() => window.__longTasks);
  const get = (m, k) => m.metrics.find((x) => x.name === k)?.value ?? 0;
  const out = { windowMs: ms, rafCallbacksPerSec: +(((raf1 - raf0) * 1000) / ms).toFixed(1), longTasks: lt1 - lt0 };
  for (const k of KEYS) {
    const d = get(m1, k) - get(m0, k);
    out[k] = k.endsWith('Duration') ? +(d * 1000).toFixed(2) + ' ms' : k === 'JSHeapUsedSize' ? +(d / 1024).toFixed(0) + ' KB' : d;
  }
  out.webAnimations = await page.evaluate(() => document.getAnimations().length);
  return out;
}
