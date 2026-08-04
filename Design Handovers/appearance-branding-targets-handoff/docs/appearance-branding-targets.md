# Handover — Appearance: Storefront + Admin targets & Sync status

**2BL.AI tenant admin · `app/admin/settings/Appearance.tsx`**
Mantine v7 · Next.js App Router · TypeScript strict. Built against `jefftoronto76/2bl.ai@main`.
Status: **UI complete; needs the schema + sync-job wiring in §3.**

---

## 1. What was built

Two changes to the **Settings › Appearance** accordion, both visible in the approved prototype
(`Combined Admin - Production.html` → Settings → Appearance).

### 1a. Nesting: Storefront + Admin targets

Appearance now hosts **two branding targets**, switched by a `SegmentedControl` at the top:

- **Storefront** — the existing editor + storefront `ThemePreview`. Unchanged behavior.
- **Admin** — *the same editor*, pointed at a second branding row, with an `AdminPreview` (a
  miniature of the real `UnifiedAdminShell`: dark sidebar, "Admin" kicker, accent-colored active
  nav + primary buttons, paper-effect content card).

"Admin is essentially a copy of the storefront editor" is literal: identical token shape, identical
controls, identical save path — only the **stored row** (`target = 'admin'`) and the **preview**
differ.

### 1b. Read-only Sync status

Below the editor grid, each target shows a **Sync status** card (informational, no actions):

- **Last synced** — `defaults_synced_at` formatted as `June 23, 2026 at 9:47 PM`, or **"Never synced"**.
- **Warnings** — `branding_warnings` rendered as a list of flagged tokens (mono token chip + reason),
  or a green **"No warnings"** state when null/empty.

In the prototype the two states are shown across the two targets (Storefront = populated, Admin =
never-synced / no-warnings) so both render side-by-side for review.

---

## 2. Files in this bundle (drop into the repo at the same paths)

| File | Type | Status | What changed |
|------|------|--------|--------------|
| `app/admin/settings/Appearance.tsx` | Client | **rewritten** | Editor body extracted into `BrandingEditor({ target })`; new `Appearance` wrapper adds the Storefront/Admin `SegmentedControl` (keyed remount). Fetch/PATCH/history calls gain `?target=`. Mounts `SyncStatus`. |
| `app/admin/settings/SyncStatus.tsx` | Client | **new** | Read-only sync card (Last synced + Warnings). Dependency-free inline icons. |
| `app/admin/settings/AdminPreview.tsx` | Client | **new** | Admin-console live preview; sibling of `ThemePreview`, same `ThemeTokens` prop. |
| `app/admin/settings/types.ts` | — | **extended** | Adds `BrandingTarget`, `BrandingWarning`, `BrandingSync` (keeps `AppearanceChange*`). |
| `app/admin/settings/utils.ts` | — | **extended** | Adds `formatSyncTime` (keeps `formatAuditTime`). |
| `app/api/admin/appearance/route.ts` | Server | **updated** | `?target=` param; `(tenant_id, target)` read/write + `onConflict: 'tenant_id,target'`; sync columns in `GET_SELECT`; `target` in audit metadata. |
| `db/2026-06-24_branding_targets_and_sync.sql` | SQL | **sketch** | Adds `target`, the composite unique index, and `defaults_synced_at` + `branding_warnings`. |

Untouched and reused as-is: `ThemePreview.tsx`, `AppearanceHistory.tsx`, `AppearanceDiff.tsx`,
`getAppearanceHistory.ts`, `appearance.css`, `@/services/branding/font-registry`.

### One small edit not included as a file

`app/admin/settings/page.tsx` — the Appearance accordion subtitle still reads
*"Colors, fonts, and brand tokens for your storefront."* Suggest:
*"Colors, fonts, and brand tokens for your storefront and admin console."* (one line.)

---

## 3. Wiring to finish

**1. Schema (`db/…sql`).** Add the `target` column + composite unique `(tenant_id, target)` and the
two sync columns. The old single-row-per-tenant constraint must be dropped first (name varies —
inspect `tenant_branding`). Existing rows become `target = 'storefront'` via the column default.

**2. API.** `route.ts` in this bundle already threads `target` through GET/PATCH and selects the
sync columns. Verify the conflict target name `'tenant_id,target'` matches the index you create.

**3. Admin theme application (the real work behind the Admin target).** Saving an `admin` row stores
tokens; **applying** them to the console is separate. The admin chrome is themed by the Mantine theme
(`brand`, `background-9`, `ink`). To honor `use_db_branding` for the admin target, feed the saved
`admin` row into the admin `MantineProvider`/theme (e.g. map `accent → brand`) where the shell is
mounted. Until that's wired, the Admin editor + preview work, but the live console keeps the static
theme. `AdminPreview` is the source of truth for what "applied" should look like.

**4. Sync job (owns `defaults_synced_at` + `branding_warnings`).** This UI only **reads** these.
Something must write them — the nightly/defaults push that reconciles stored tokens with the live
theme, recording the timestamp and any flagged tokens (contrast, font licensing, collisions). Until
it exists, every row shows "Never synced" / "No warnings" (the safe null states the UI handles).

**5. Per-target history (optional, minor).** `getAppearanceHistory` currently returns all appearance
audit rows. The PATCH handler now writes `target` into audit metadata, so to split history per tab,
filter `getAppearanceHistory` by `metadata.target` and read `?target=` in
`app/api/admin/appearance/history/route.ts`. Safe to defer — both tabs just show the shared log until
then.

---

## 4. Data shapes

```ts
// types.ts
type BrandingTarget = 'storefront' | 'admin';

interface BrandingWarning { token: string; message: string }  // message may be ''

interface BrandingSync {
  defaults_synced_at: string | null;       // ISO, or null → "Never synced"
  branding_warnings: BrandingWarning[] | null;  // null/[] → "No warnings"
}
```

`GET /api/admin/appearance?target=admin` returns the branding row **plus** `defaults_synced_at` and
`branding_warnings`. The client splits the row into the editable form (`rowToForm`) and the read-only
sync (`rowToSync`); sync fields never enter dirty-tracking or the PATCH payload. `branding_warnings`
accepts either `string[]` or `{token,message}[]` — strings are normalized to `{ token, message: '' }`.

---

## 5. Notes & decisions

1. **Two rows, not admin-prefixed columns.** Modeling Admin as a second `tenant_branding` row
   (`target`) keeps the token shape, the editor, the API validation, and the audit pipeline identical
   for both — the "copy" the request asked for. No `admin_*` column sprawl.
2. **Keyed remount.** `<BrandingEditor key={target} />` fully remounts on switch, so each tab
   refetches and resets — no value bleed between Storefront and Admin.
3. **`paper_effect` is `'warm' | 'lift' | 'flat'`** (segmented), matching main — not a boolean.
   `AdminPreview` reuses the same `paperStack` derivation as `ThemePreview`.
4. **Informational, not actionable.** The Sync status card has no buttons; it reads from the row.
   Icons are inline SVG (no `@tabler` dependency assumed).
5. **Admin sidebar color.** Preview hardcodes `#101113` to mirror `--mantine-color-background-9`. If
   you later let tenants theme the sidebar itself, add a token + map it in both the preview and the
   shell.

---

## 6. Reference

- Prototype: `Combined Admin - Production.html` → **Settings → Appearance** (toggle Storefront/Admin).
  Design reference, not code to copy.
- Real source this extends: `app/admin/settings/Appearance.tsx`, `ThemePreview.tsx`,
  `app/api/admin/appearance/route.ts`, `components/admin/shell/UnifiedAdminShell.tsx`.
- Mirrors the audit/notification split already used here: the server records audit on write; the
  client reads and renders.
