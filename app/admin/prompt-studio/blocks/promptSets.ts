// Type-only + pure so it can be imported from both the server page and the
// client picker. The Supabase reader lives in getPromptSets.ts ('server-only').

export type PromptSetStatus = 'live' | 'draft'

export interface PromptSet {
  id: string
  /**
   * prompt_sets.prompt_type_id (UUID → prompt_types.id). Used to scope the
   * Blocks table: blocks.prompt_type_key is also a UUID FK → prompt_types.id,
   * so the page filters `prompt_type_key === promptTypeId`. Never a text slug.
   * null when the set has no prompt type assigned (e.g. an unconfigured draft).
   */
  promptTypeId: string | null
  label: string
  version: number
  status: PromptSetStatus
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
