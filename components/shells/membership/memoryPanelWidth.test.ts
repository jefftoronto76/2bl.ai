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

  it('holds with real numbers at the drawer\'s own narrowest width (680px, ChatDrawerV2\'s clamp floor)', () => {
    const max = maxPanelWidth(680);
    // Verified safe: 83px of slack over the combined floors at this exact width.
    expect(max).toBe(680 - RAIL_WIDTH - DIVIDER_WIDTH - MIN_CHAT_WIDTH);
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
