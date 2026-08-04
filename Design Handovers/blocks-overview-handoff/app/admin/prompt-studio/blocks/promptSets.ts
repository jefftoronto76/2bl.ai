// app/admin/prompt-studio/blocks/promptSets.ts
//
// Types + pure helpers for the "Current Prompt Set" picker. A prompt set is a
// named, versioned collection of blocks that compiles into one system prompt
// (e.g. "Sage — Production", "Sage — Staging", "Discovery Bot"). Blocks belong
// to a set via `blocks.prompt_set_id` (see db/ migration).
//
// Type-only + pure so it can be imported from BOTH the server page and the
// client picker. The Supabase reader lives in getPromptSets.ts ('server-only').

export type PromptSetStatus = 'Live' | 'Draft' | string;

export interface PromptSet {
  id: string;
  label: string;
  /** Published version number; 0 / unpublished sets read as Draft. */
  version: number;
  status: PromptSetStatus;
}

/**
 * Resolve which set is active given the `?set=` query value.
 * Falls back to the Live set, then the first set, then null (no sets).
 */
export function resolveActiveSet(sets: PromptSet[], requestedId: string | null): PromptSet | null {
  if (sets.length === 0) return null;
  if (requestedId) {
    const match = sets.find((s) => s.id === requestedId);
    if (match) return match;
  }
  return sets.find((s) => String(s.status).toLowerCase() === 'live') ?? sets[0];
}
