// Type-only + pure so it can be imported from both the server page and the
// client picker. The Supabase reader lives in getPromptSets.ts ('server-only').

export type PromptSetStatus = 'live' | 'draft' | 'retired'

export interface PromptSet {
  id: string
  /**
   * prompt_sets.prompt_type_id (UUID → prompt_types.id) — the prompt type this
   * set maps to. Informational only; the Blocks page scopes blocks by the set's
   * own id (blocks.prompt_set_id → prompt_sets.id), not this field. null when no
   * prompt type is assigned (e.g. an unconfigured draft).
   */
  promptTypeId: string | null
  label: string
  /**
   * prompt_sets.version. Display-only (the "Live version" badge on the Blocks
   * overview card) — NEVER incremented after row creation, so it silently
   * drifts from the real publish history. Do NOT use this to compute the next
   * publish version; use `compiledVersion` below instead.
   */
  version: number
  status: PromptSetStatus
  /**
   * Derived from the prompt_sets_with_compile_meta VIEW (not a stored column) —
   * compiled_prompts.updated_at for this set's compiled row, or null if this
   * slot has never been compiled. Cut-off for the Compile & Publish modal's
   * "changed since" list.
   */
  lastCompiledAt: string | null
  /**
   * Derived from the same view — compiled_prompts.version for this set's
   * compiled row, or null if never compiled. This IS the source of truth for
   * the next publish version (compiledVersion + 1) — see compile.ts, which
   * increments compiled_prompts.version, never prompt_sets.version.
   */
  compiledVersion: number | null
  /**
   * Category flag, not a lifecycle one — true for every composer-family set
   * (draft or live), false for an ordinary tenant-family set. Drives the
   * Blocks screen's 2bl.ai / Composer family switch (PromptSetSelect.tsx).
   */
  isComposerPrompt: boolean
}

/**
 * Resolve which set is active given the `?set=` query value.
 * Falls back to the Live set, then the first set, then null (no sets).
 */
export function resolveActiveSet(sets: PromptSet[], requestedId: string | null): PromptSet | null {
  if (sets.length === 0) return null
  if (requestedId) {
    const match = sets.find((s) => s.id === requestedId)
    if (match) return match
  }
  return sets.find((s) => String(s.status).toLowerCase() === 'live') ?? sets[0]
}
