export const CHARS_PER_TOKEN = 4

/** Hard-red display threshold — informational everywhere it's used, not an enforced ceiling. */
export const TOKEN_LIMIT = 8000

/** Soft-yellow display threshold, below TOKEN_LIMIT. */
export const YELLOW_THRESHOLD = 5000

/**
 * Approximate token count for a given content string. Uses the
 * 4-chars-per-token heuristic that's been the convention across
 * Sage's admin and prompt-compile paths since Phase 1.
 *
 * Null-ish inputs collapse to 0 tokens. Caller is responsible
 * for pre-trimming if trimming semantics matter (the heuristic
 * counts whitespace as content).
 *
 * Centralized in Step 13 of PR 2 as the single source of truth —
 * the canonical home for token-budget math and constants. Import
 * from here rather than re-deriving; do not list call sites here,
 * they drift (confirmed 2026-08 — the prior enumeration was already
 * stale).
 */
export function tokensFor(value: string | null | undefined): number {
  return Math.ceil((value?.length ?? 0) / CHARS_PER_TOKEN)
}
