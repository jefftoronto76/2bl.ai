// Shared types + helpers for the prompt-set "compile metadata" work.
//
// These three fields are NEW vs the shipping `PromptSet` shape (app/api/admin/
// prompt-sets/route.ts). They are READ-ONLY and DERIVED on the server from data
// that already exists — no writes from any Settings path:
//
//   • block_count          — COUNT(blocks) active in the set
//   • last_compiled_at      — master_prompt.updated_at for this set's compile
//   • compiled_version      — master_prompt.version ("compiled version", the
//                             version stamped by the compile pipeline)
//
// "Stale" is computed, never stored: a set is stale when it was edited after it
// was last compiled (prompt_sets.updated_at > last_compiled_at). See handover §4.

export type PromptSetStatus = 'live' | 'draft'

// The shipping base row — exactly the columns stored on `prompt_sets`. This is the
// shape the PATCH (write) routes return: a write reads back the base table, which has
// no derived compile metadata. Keep in sync with SELECT_COLUMNS in
// app/api/admin/prompt-sets/route.ts.
export interface BasePromptSet {
  id: string
  tenant_id: string
  label: string
  description: string | null
  status: PromptSetStatus
  is_composer_prompt: boolean
  is_default: boolean
  prompt_type_id: string | null
  version: number
  created_at: string
  updated_at: string
}

// The base row + the three derived compile fields, as returned by the GET routes that
// read the `prompt_sets_with_compile_meta` view. Keep in sync with SELECT_COLUMNS_WITH_META.
export interface PromptSet extends BasePromptSet {
  // ── derived compile metadata (read-only) ──
  block_count: number
  last_compiled_at: string | null
  compiled_version: number | null
}

// Cross-tenant row for Platform Settings → Tenant Prompts. Same as PromptSet plus
// the resolved tenant name (the platform list joins tenants for display).
export interface PlatformPromptSet extends PromptSet {
  tenant_name: string
}

// The payload returned by the per-set "view compiled prompt" endpoint.
export interface CompiledPrompt {
  content: string
  version: number | null
  updated_at: string | null
}

// A set is stale when its content changed after the last compile. Never stored.
export function isStale(set: Pick<PromptSet, 'updated_at' | 'last_compiled_at'>): boolean {
  return Boolean(set.last_compiled_at && set.updated_at && set.updated_at > set.last_compiled_at)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function statusLabel(status: string): string {
  return status.toLowerCase() === 'live' ? 'Live' : 'Draft'
}
