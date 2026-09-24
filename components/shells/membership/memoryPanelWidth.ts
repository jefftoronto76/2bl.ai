// components/shells/membership/memoryPanelWidth.ts
//
// Pure width math for the memory panel's drag-resize (memory-panel-layout
// Stage C). Kept separate from ChatHero.tsx so it's testable without
// rendering anything — nothing here reads the DOM; the caller supplies
// `total` (the row container's clientWidth).

/** SidebarV2's collapsed rail — matches its own w-12. */
export const RAIL_WIDTH = 48;
/** SidebarV2's docked expanded width — matches its own w-64. A panel no
 *  longer forces the Nav to the rail (2026-09): a manual expand wins, and
 *  the Workspace grows by NAV_EXPANDED_WIDTH − RAIL_WIDTH to fit it, so
 *  the math below takes the Nav's ACTUAL width rather than assuming the
 *  rail. Keep in sync with HeirloomApp's navExpandedWidthClassName. */
export const NAV_EXPANDED_WIDTH = 256;
/** MemoryPanelDivider's own fixed width. */
export const DIVIDER_WIDTH = 9;
/** Must match ChatHero.tsx's min-w-[260px] on the chat column — kept as a
 *  literal Tailwind class there since Tailwind can't scan a JS-interpolated
 *  arbitrary value; this constant is the same number for the drag math. */
export const MIN_CHAT_WIDTH = 260;
/** Must match ChatHero.tsx's min-w-[280px] on the panel, same reasoning. */
export const MIN_PANEL_WIDTH = 280;
/** Seed target: ~55% of the row measured as if the Nav were the rail — so an
 *  expanded Nav (which grows the Workspace by its own delta) seeds the same
 *  panel width a rail would. */
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
 * remains after the Nav (`navWidth`, the rail by default), the divider
 * itself, and the chat column's own floor. Floored at MIN_PANEL_WIDTH so
 * callers never see an inverted range: verified safe with the real numbers
 * above — at the Heirloom Workspace's rail width (672px, max-w-2xl),
 * combined floors (48 + 9 + 260 + 280 = 597) leave 75px of slack, and an
 * expanded Nav brings its own 208px of Workspace growth with it (880px),
 * so the slack is the same. Only at 100vw, where the Workspace can't grow,
 * does an expanded Nav eat into the room. See System Docs/Known Gaps.md's
 * Memories entry.
 */
export function maxPanelWidth(total: number, navWidth: number = RAIL_WIDTH): number {
  return Math.max(MIN_PANEL_WIDTH, total - navWidth - DIVIDER_WIDTH - MIN_CHAT_WIDTH);
}

/**
 * The panel's default width on open (or on a future Home/double-click
 * reset, Stage E) — always recomputed against the CURRENT total, never a
 * frozen constant, so resetting after a window resize reflects the new
 * size rather than whatever it was when the panel first opened.
 */
export function seedPanelWidth(total: number, navWidth: number = RAIL_WIDTH): number {
  return clampWidth(Math.round((total - navWidth + RAIL_WIDTH) * DEFAULT_PANEL_FRACTION), MIN_PANEL_WIDTH, maxPanelWidth(total, navWidth));
}

/**
 * Narrowest viewport at which the Nav may be manually EXPANDED beside an
 * open panel: expanded Nav + divider + chat floor + panel floor
 * (256 + 9 + 260 + 280 = 805). Below this the Workspace is already capped
 * at 100vw, those floors can't all fit, and the row would clip the chat or
 * the panel's controls (found in review, PR #494) — so the Nav stays on
 * its rail there, same as before manual override existed.
 */
export const MIN_VIEWPORT_FOR_EXPANDED_NAV_WITH_PANEL =
  NAV_EXPANDED_WIDTH + DIVIDER_WIDTH + MIN_CHAT_WIDTH + MIN_PANEL_WIDTH;
