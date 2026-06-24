# Appearance — Storefront + Admin targets & Sync status (handoff bundle)

Drop-in for two additions to **Settings › Appearance**: (1) nesting the tab into **Storefront** and
**Admin** branding targets, and (2) a read-only **Sync status** card. Extract at the repo root; the
trees land where they belong.

```
docs/
  appearance-branding-targets.md          ← the handover doc (read this first)

app/admin/settings/
  Appearance.tsx                          ← rewritten: target switch + BrandingEditor + SyncStatus
  SyncStatus.tsx                          ← new: read-only Last synced + Warnings
  AdminPreview.tsx                        ← new: admin-console live preview
  types.ts                                ← + BrandingTarget, BrandingWarning, BrandingSync
  utils.ts                                ← + formatSyncTime

app/api/admin/appearance/
  route.ts                                ← updated: ?target= + (tenant_id,target) + sync columns

db/
  2026-06-24_branding_targets_and_sync.sql  ← schema sketch (adapt constraint names)
```

## To finish wiring (see the handover §3)

1. **Schema** — run `db/2026-06-24_branding_targets_and_sync.sql` (drop the old single-row
   constraint first; existing rows default to `target = 'storefront'`).
2. **API** — `route.ts` already threads `target` and selects the sync columns; verify the
   `onConflict: 'tenant_id,target'` name matches your unique index.
3. **Apply admin theme** — feed the saved `admin` row into the admin `MantineProvider` so
   `use_db_branding` actually themes the console (`AdminPreview` shows the target look).
4. **Sync job** — something must *write* `defaults_synced_at` + `branding_warnings`; this UI only
   reads them (safe null states until then).
5. *(optional)* **Per-target history** — filter `getAppearanceHistory` by `metadata.target`
   (PATCH now records it).

Built against Mantine v7 and the existing `@/services/branding`, `@/services/auth`, `@/services/audit`
modules — verify import paths and the Supabase columns against your schema before shipping.

Reusing untouched: `ThemePreview.tsx`, `AppearanceHistory.tsx`, `AppearanceDiff.tsx`,
`getAppearanceHistory.ts`, `appearance.css`.
