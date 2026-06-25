// Shared types for the Platform Settings screen (§5 of the handover).
// One screen, one field for now: Master Prompt. These shapes are NEW — there is no
// existing platform-settings model to lift from. Keep them aligned with the
// Composer's `PromptSet` type (components/admin/prompt-builder/types.ts) so the
// cross-tenant option list and the per-tenant picker agree on `status`/`version`.

// One selectable prompt set, scoped across ALL tenants the platform admin can see.
// `id` is the value persisted as the platform master pointer.
export interface MasterPromptOption {
  id: string                 // prompt set id
  label: string              // e.g. "Sage — Production"
  tenantId: string
  tenantName: string         // e.g. "Sage"
  status: 'Live' | 'Draft'
  version?: number           // optional, shown as v{n} in the row meta
}

// The platform's current master pointer (what's live right now). `promptSetId` is
// null when no master has been set yet (distinct from "no prompt sets exist" — §7).
export interface MasterPromptSetting {
  promptSetId: string | null
  setByName?: string         // who last changed it
  setAt?: number             // epoch ms, for the "Set by … · {date}" stamp
}

// Format the "Set by … · {date}" stamp. Date-only is enough for an audit read-out.
export function formatSetAt(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
