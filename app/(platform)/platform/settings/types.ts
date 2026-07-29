// Shared types for the Platform Settings → Master Prompt screen.
// Status is the DB lowercase ('live' | 'draft'); the UI capitalizes for display.

export type PromptSetStatus = 'live' | 'draft' | 'retired'

// One selectable prompt set, scoped across ALL tenants the platform admin sees.
// `id` is the value persisted as the platform master pointer.
export interface MasterPromptOption {
  id: string
  label: string
  tenantId: string
  tenantName: string
  status: PromptSetStatus
  version?: number
}

// The platform's current master pointer. `promptSetId` is null when no master
// has been set yet (distinct from "no prompt sets exist anywhere").
export interface MasterPromptSetting {
  promptSetId: string | null
  setByName?: string | null
  setAt?: number | null
}

export function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'live': return 'Live'
    case 'retired': return 'Retired'
    default: return 'Draft'
  }
}
