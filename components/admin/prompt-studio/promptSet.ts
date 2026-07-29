// Shared, framework-agnostic prompt-set types + pure logic. Client-safe (no
// DB access) so it can be imported from a server component (Blocks' page.tsx,
// which reads prompt_sets_with_compile_meta directly), a server-only reader
// (getPromptSets.ts), and a plain client component that fetches the same
// shape over the API (the Composer's prompt-builder page.tsx).
//
// This is the SINGLE PromptSet shape both prompt-set pickers in the admin —
// Blocks' and the Composer's — are built against. Moved here (from
// app/admin/prompt-studio/blocks/promptSets.ts) alongside PromptSetSelect.tsx
// once the Composer needed the exact same family-switch behavior; keeping
// one implementation is the point, not two components that happen to look
// alike.

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
   * 2bl.ai / Composer family switch (PromptSetSelect.tsx).
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

/**
 * Maps a raw prompt_sets_with_compile_meta row (snake_case, whether read
 * directly from Supabase or fetched as JSON from an API route) onto the
 * shared PromptSet shape. The two current callers select slightly different
 * column subsets (getPromptSets.ts's Blocks query omits tenant_id/description/
 * is_default; the /api/admin/prompt-sets JSON includes them) — this only
 * reads the fields the shared shape actually needs, so either row works.
 */
export function mapPromptSetRow(row: Record<string, unknown>): PromptSet {
  return {
    id: row.id as string,
    promptTypeId: (row.prompt_type_id as string | null) ?? null,
    label: row.label as string,
    version: (row.version as number | null) ?? 0,
    status: ((row.status as string | null) ?? 'draft') as PromptSetStatus,
    lastCompiledAt: (row.last_compiled_at as string | null) ?? null,
    compiledVersion: (row.compiled_version as number | null) ?? null,
    isComposerPrompt: row.is_composer_prompt === true,
  }
}

export type SetFamily = 'tenant' | 'composer'

export const SET_FAMILIES: { value: SetFamily; label: string; hint: string }[] = [
  { value: 'tenant', label: '2bl.ai', hint: 'Prompt sets your tenants ship to their users.' },
  { value: 'composer', label: 'Composer', hint: 'The prompt that powers the Composer AI itself.' },
]

/** Which family a set belongs to. is_composer_prompt is a plain category flag. */
export function familyOf(set: PromptSet): SetFamily {
  return set.isComposerPrompt === true ? 'composer' : 'tenant'
}
