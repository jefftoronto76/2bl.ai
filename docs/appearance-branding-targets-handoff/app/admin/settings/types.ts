// app/admin/settings/types.ts
//
// Shared types for the Appearance change-history (audit trail) AND the new
// Storefront/Admin branding-target nesting + read-only Sync status.
// Read-only history rows are produced by the audit log the Appearance "Save"
// handler writes; sync fields are produced by the defaults sync job.

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

// ─────────────────────────────────────────────────────────────────────────────
// Branding targets + sync status (new)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which surface a branding row themes. The Appearance tab nests two: the public
 * `storefront` and this `admin` console. Both use the identical token shape and
 * the same editor — they are two rows of `tenant_branding`, keyed by
 * (tenant_id, target). See the migration in this bundle's `db/`.
 */
export type BrandingTarget = 'storefront' | 'admin';

/** One token flagged by the nightly defaults sync. `message` may be empty. */
export interface BrandingWarning {
  /** Theme token id, e.g. "accent", "font_primary". */
  token: string;
  /** Human-readable reason, or '' to render the token alone. */
  message: string;
}

/**
 * Read-only sync status for one target. Produced by the defaults sync job, not
 * by this UI. Both fields are nullable:
 *   • `defaults_synced_at === null` → "Never synced"
 *   • `branding_warnings === null` (or empty) → green "No warnings"
 */
export interface BrandingSync {
  defaults_synced_at: string | null;
  branding_warnings: BrandingWarning[] | null;
}
