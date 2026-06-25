// Type-only + pure so it can be imported from both the server page and the
// client picker. The Supabase reader lives in getPromptSets.ts ('server-only').

export type PromptSetStatus = 'Live' | 'Draft' | string

export interface PromptSet {
  id: string
  /** prompt_types.key — used to filter blocks by prompt_type_key */
  key: string
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
