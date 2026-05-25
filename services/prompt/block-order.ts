/**
 * Predicate for "this block has a meaningful, user-placed ordinal."
 *
 * The `blocks.order` column is a nullable integer. Both `null` and `0`
 * represent "unordered / default" — new blocks insert with null, and 0
 * is accepted as an equivalent sentinel for historical reasons. Any
 * positive integer is treated as an explicit placement.
 *
 * Consumers:
 * - /api/admin/prompt/compile/route.ts uses this to partition blocks
 *   into "ordered" (sorted ascending by value) and "unordered" (sorted
 *   by title ascending at the end of each type bucket).
 * - The Blocks admin page uses this to gate the per-type duplicate-
 *   order check so multiple blocks of the same type can coexist at
 *   0 / null without firing a false conflict.
 */
export function isOrdered(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Display string for a block's order, used as a monospace prefix in
 * the title cell on the Blocks admin page (Step 12 of PR 2).
 *
 * - Ordered (positive integer < 100): zero-padded to 2 digits ("01"…"99").
 * - Ordered ≥ 100: rendered at natural width ("100", "101", …).
 * - Unordered (null / 0 / undefined): empty string. Callers reserve
 *   horizontal gutter via `width: 2ch` on the prefix container so
 *   ordered and unordered titles still align vertically.
 */
export function orderPrefix(value: number | null | undefined): string {
  if (!isOrdered(value)) return ''
  return value < 100 ? String(value).padStart(2, '0') : String(value)
}
