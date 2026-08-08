// components/shells/membership/memoryPanelWidth.ts
//
// Pure width math for the memory panel's drag-resize (memory-panel-layout
// Stage C). Kept separate from ChatHero.tsx so it's testable without
// rendering anything — nothing here reads the DOM; the caller supplies
// `total` (the row container's clientWidth).

/** SidebarV2's collapsed rail while the panel is open (Stage B) — matches its own w-12. */
export const RAIL_WIDTH = 48;
/** MemoryPanelDivider's own fixed width. */
export const DIVIDER_WIDTH = 9;
/** Must match ChatHero.tsx's min-w-[260px] on the chat column — kept as a
 *  literal Tailwind class there since Tailwind can't scan a JS-interpolated
 *  arbitrary value; this constant is the same number for the drag math. */
export const MIN_CHAT_WIDTH = 260;
/** Must match ChatHero.tsx's min-w-[280px] on the panel, same reasoning. */
export const MIN_PANEL_WIDTH = 280;
/** Seed target: ~55% of the space left after the collapsed rail. */
export const DEFAULT_PANEL_FRACTION = 0.55;

/**
 * Clamps `v` between `lo` and `hi`, with `hi` winning when they conflict
 * (`lo > hi`) — the priority fix from this session's Curtain.tsx
 * investigation. `Math.max(lo, Math.min(hi, v))` always returns `lo` when
 * `lo > hi`, regardless of how little room `hi` actually represents;
 * nesting `Math.min` as the outer call instead makes it the one that
 * actually bounds the result.
 */
export function clampWidth(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/**
 * The most the panel can ever claim given the row's total width — whatever
 * remains after the collapsed sidebar rail, the divider itself, and the
 * chat column's own floor. Floored at MIN_PANEL_WIDTH so callers never see
 * an inverted range: verified safe with the real numbers above — even at
 * the drawer's own narrowest (680px, ChatDrawerV2's clamp floor), combined
 * floors (48 + 9 + 260 + 280 = 597) leave 83px of slack. See
 * System Docs/Known Gaps.md's Memories entry.
 */
export function maxPanelWidth(total: number): number {
  return Math.max(MIN_PANEL_WIDTH, total - RAIL_WIDTH - DIVIDER_WIDTH - MIN_CHAT_WIDTH);
}

/**
 * The panel's default width on open (or on a future Home/double-click
 * reset, Stage E) — always recomputed against the CURRENT total, never a
 * frozen constant, so resetting after a window resize reflects the new
 * size rather than whatever it was when the panel first opened.
 */
export function seedPanelWidth(total: number): number {
  return clampWidth(Math.round(total * DEFAULT_PANEL_FRACTION), MIN_PANEL_WIDTH, maxPanelWidth(total));
}
