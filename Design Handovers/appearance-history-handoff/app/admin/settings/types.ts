// app/admin/settings/types.ts
//
// Shared types for the Appearance change-history (audit trail) on the Settings
// › Appearance tab. Read-only: these rows are produced by the audit log that the
// Appearance "Save" handler already writes — this UI only renders them.

/** Drives how a before/after value is displayed. */
export type AppearanceChangeKind = 'color' | 'font' | 'toggle';

export interface AppearanceChange {
  id: string;
  /** Display name of whoever made the change ("System" for automated changes). */
  actor: string;
  /** Optional — used for the row's hover tooltip / disambiguation. */
  email?: string;
  /** Human label of the field that changed, e.g. "Accent", "Primary font". */
  field: string;
  kind: AppearanceChangeKind;
  /** Prior value, pre-formatted for display (hex, font name, or "On"/"Off"). */
  from: string;
  /** New value, pre-formatted for display. */
  to: string;
  /** ISO timestamp; the UI formats it (see utils.formatAuditTime). */
  at: string;
}
