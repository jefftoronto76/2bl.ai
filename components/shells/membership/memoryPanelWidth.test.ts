// Unit coverage for the memory panel's drag-resize math (memory-panel-layout
// Stage C). Pure functions, no DOM — the whole point of splitting this out
// of ChatHero.tsx.
import { describe, it, expect } from 'vitest';
import {
  clampWidth,
  maxPanelWidth,
  seedPanelWidth,
  RAIL_WIDTH,
  DIVIDER_WIDTH,
  MIN_CHAT_WIDTH,
  MIN_PANEL_WIDTH,
  NAV_EXPANDED_WIDTH,
} from './memoryPanelWidth';

describe('clampWidth', () => {
  it('clamps to lo when v is below the range', () => {
    expect(clampWidth(50, 100, 500)).toBe(100);
  });

  it('clamps to hi when v is above the range', () => {
    expect(clampWidth(600, 100, 500)).toBe(500);
  });

  it('passes v through unchanged (rounded) when inside the range', () => {
    expect(clampWidth(300.4, 100, 500)).toBe(300);
  });

  it('rounds v before clamping', () => {
    expect(clampWidth(299.6, 100, 500)).toBe(300);
  });

  it('regression: hi wins when lo > hi — the Curtain.tsx priority bug this was written to fix', () => {
    // Math.max(lo, Math.min(hi, v)) would return 320 here regardless of v;
    // this must always return hi (231) instead.
    expect(clampWidth(374, 320, 231)).toBe(231);
    expect(clampWidth(100, 320, 231)).toBe(231);
    expect(clampWidth(1000, 320, 231)).toBe(231);
  });
});

describe('maxPanelWidth', () => {
  it('returns the space left after the rail, divider, and chat floor', () => {
    // total=1000: 1000 - 48 - 9 - 260 = 683
    expect(maxPanelWidth(1000)).toBe(1000 - RAIL_WIDTH - DIVIDER_WIDTH - MIN_CHAT_WIDTH);
  });

  it('never returns less than MIN_PANEL_WIDTH, even when the raw subtraction would go negative', () => {
    expect(maxPanelWidth(0)).toBe(MIN_PANEL_WIDTH);
    expect(maxPanelWidth(100)).toBe(MIN_PANEL_WIDTH);
  });

  it('holds with real numbers at the Heirloom Workspace\'s rail width (672px, max-w-2xl)', () => {
    const max = maxPanelWidth(672);
    // Verified safe: 75px of slack over the combined floors at this exact width.
    expect(max).toBe(672 - RAIL_WIDTH - DIVIDER_WIDTH - MIN_CHAT_WIDTH);
    expect(max).toBeGreaterThan(MIN_PANEL_WIDTH);
  });
});

describe('seedPanelWidth', () => {
  it('seeds to roughly 55% of the total, clamped within range', () => {
    // total=1200: 55% = 660; maxPanelWidth(1200) = 1200-48-9-260 = 883, so 660 fits untouched.
    expect(seedPanelWidth(1200)).toBe(660);
  });

  it('never seeds below MIN_PANEL_WIDTH at a very narrow total', () => {
    expect(seedPanelWidth(400)).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH);
  });

  it('never seeds above maxPanelWidth at a very narrow total', () => {
    const total = 700;
    expect(seedPanelWidth(total)).toBeLessThanOrEqual(maxPanelWidth(total));
  });

  it('recomputes against the total passed in, not a frozen value — same total always seeds the same width', () => {
    expect(seedPanelWidth(900)).toBe(seedPanelWidth(900));
    expect(seedPanelWidth(900)).not.toBe(seedPanelWidth(1400));
  });
});

// Story-deck workspace fixes item 1 (2026-09): a panel no longer locks the
// Nav to its rail. An expanded Nav grows the Workspace by its own 208px
// delta, so the panel math takes the Nav's actual width.
describe('panel math with an expanded Nav', () => {
  const DELTA = NAV_EXPANDED_WIDTH - RAIL_WIDTH;

  it('maxPanelWidth subtracts the Nav\'s actual width', () => {
    expect(maxPanelWidth(1000, NAV_EXPANDED_WIDTH)).toBe(1000 - NAV_EXPANDED_WIDTH - DIVIDER_WIDTH - MIN_CHAT_WIDTH);
  });

  it('gives the same panel headroom at 880px expanded as at 672px rail — the Workspace grew by exactly the Nav delta', () => {
    expect(maxPanelWidth(672 + DELTA, NAV_EXPANDED_WIDTH)).toBe(maxPanelWidth(672));
  });

  it('seeds the same panel width expanded as rail when the Workspace grew by the delta', () => {
    expect(seedPanelWidth(672 + DELTA, NAV_EXPANDED_WIDTH)).toBe(seedPanelWidth(672));
    expect(seedPanelWidth(1200 + DELTA, NAV_EXPANDED_WIDTH)).toBe(seedPanelWidth(1200));
  });

  it('at a fixed total (100vw, no room to grow) an expanded Nav shrinks the headroom by the delta, keeping the chat floor', () => {
    const total = 1280;
    expect(maxPanelWidth(total, NAV_EXPANDED_WIDTH)).toBe(maxPanelWidth(total) - DELTA);
    expect(seedPanelWidth(total, NAV_EXPANDED_WIDTH)).toBeLessThanOrEqual(maxPanelWidth(total, NAV_EXPANDED_WIDTH));
  });

  it('defaults navWidth to the rail, so existing callers are unchanged', () => {
    expect(maxPanelWidth(900)).toBe(maxPanelWidth(900, RAIL_WIDTH));
    expect(seedPanelWidth(900)).toBe(seedPanelWidth(900, RAIL_WIDTH));
  });
});

describe('MIN_VIEWPORT_FOR_EXPANDED_NAV_WITH_PANEL', () => {
  it('is the sum of every floor that must fit beside an expanded Nav (805px)', async () => {
    const { MIN_VIEWPORT_FOR_EXPANDED_NAV_WITH_PANEL } = await import('./memoryPanelWidth')
    expect(MIN_VIEWPORT_FOR_EXPANDED_NAV_WITH_PANEL).toBe(NAV_EXPANDED_WIDTH + DIVIDER_WIDTH + MIN_CHAT_WIDTH + MIN_PANEL_WIDTH)
    expect(MIN_VIEWPORT_FOR_EXPANDED_NAV_WITH_PANEL).toBe(805)
    // At that width, the panel still gets its floor beside an expanded Nav.
    expect(maxPanelWidth(805, NAV_EXPANDED_WIDTH)).toBe(MIN_PANEL_WIDTH)
  })
})
