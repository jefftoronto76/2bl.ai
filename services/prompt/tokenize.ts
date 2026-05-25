export const CHARS_PER_TOKEN = 4

/**
 * Approximate token count for a given content string. Uses the
 * 4-chars-per-token heuristic that's been the convention across
 * Sage's admin and prompt-compile paths since Phase 1.
 *
 * Null-ish inputs collapse to 0 tokens. Caller is responsible
 * for pre-trimming if trimming semantics matter (the heuristic
 * counts whitespace as content).
 *
 * Centralized in Step 13 of PR 2 as the single source of truth.
 * Three call sites — SegmentedTokenMeter, PromptFullnessMeter,
 * and /api/admin/prompt/compile — all import this function.
 */
export function tokensFor(value: string | null | undefined): number {
  return Math.ceil((value?.length ?? 0) / CHARS_PER_TOKEN)
}
