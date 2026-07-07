// app/admin/settings/types.ts
//
// Shared types for the Appearance change-history (audit trail) AND the
// Storefront/Admin branding-target nesting + read-only Sync status.

/** Drives how a before/after value is displayed. */
export type AppearanceChangeKind = 'color' | 'font' | 'toggle' | 'text';

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

export type BrandingTarget = 'storefront' | 'admin';

/** One token flagged by the nightly defaults sync. `message` may be empty. */
export interface BrandingWarning {
  token: string;
  message: string;
}

export interface BrandingSync {
  defaults_synced_at: string | null;
  branding_warnings: BrandingWarning[] | null;
}
