# Admin Branding → Mantine — handover

Make the **admin console** themeable from its own set of database variables, passed to the
client **the Mantine-idiomatic way** (one `createTheme` + `cssVariablesResolver` → real
`--mantine-color-*` / `--admin-*` CSS variables). This replaces today's setup where the
admin borrows the storefront's Tailwind-driven branding and applies it through a
half-Mantine / half-hand-rolled bridge.

## Contents

```
Admin Branding Handover/
  README.md                       ← this file
  ADMIN_THEME_SPEC.md             ← the production spec (read this)
  reference/                      ← runnable design reference (open in a browser)
    Admin Appearance Preview.html ← Settings → Appearance → toggle "Admin"
    appearance.js                 ← the Appearance editor + Storefront/Admin live previews
    settings-screen.js            ← Settings screen (hosts the Appearance section)
    promptset.js                  ← Prompt Sets section (dependency of Settings)
    harness.js                    ← Mantine theme + shell + shared components
    data.js                       ← fixtures incl. ADMIN_THEME_TOKENS (the seed values)
```

## How to view the reference

Open `reference/Admin Appearance Preview.html` in a browser (it loads React + Mantine
7.17.8 from CDN via an import map — needs internet). Expand **Appearance**, switch the
segmented control to **Admin**. That panel is the target design: the purpose-built admin
field set + the live `AdminPreview`. The editor is reactive — every field updates the
preview.

## The admin variable set (what to store)

Stored on `tenant_branding` for `target = 'admin'`, seeded from each tenant's base palette
(SBL shown). Full mapping + types in `ADMIN_THEME_SPEC.md §1`.

- **Accent** — `accent`, `accent_hover`, `accent_buttons`
- **Sidebar** — `sidebar_bg`, `sidebar_text`  *(new columns)*
- **Content** — `background`, `heading`, `body`, `muted`  *(`muted` is new)*
- **Typography** — `font_primary`, `font_secondary`, `font_mono`

**New DB columns:** `sidebar_bg`, `sidebar_text`, `muted` (nullable; admin-target only).
`paper_effect` is intentionally **not** in the admin set — it is a storefront-only concept.

## Production touch-points (what to change in `jefftoronto76/2bl.ai@main`)

- `components/admin/theme/mantine-theme.ts` — rewrite `buildAdminTheme` to use
  `generateColors()` for real scales + return a `cssVariablesResolver` (spec §3). Drop
  `colorsTuple`, `theme.other`, and the separate `textMuted`/`accentHover` returns.
- `app/admin/layout.tsx` — pass `cssVariablesResolver` to `<MantineProvider>`; delete the
  hand-written `<style>{:root{--mantine-color-body:…}}</style>` block. Keep the
  `use_db_branding` apply gate.
- `components/admin/shell/UnifiedAdminShell.tsx` — read `var(--admin-sidebar-bg)` /
  `var(--admin-sidebar-text)` instead of `--mantine-color-background-9` / hardcoded greys.
- `app/admin/settings/Appearance.tsx` — Admin target: adopt the grouped fields + labels
  (Accent / Sidebar / Content / Typography) shown in the reference; drop Paper effect from
  the Admin target; add Sidebar background, Sidebar text, Muted text.
- `app/api/admin/appearance/route.ts` — add `sidebar_bg`, `sidebar_text`, `muted` to
  `STRING_FIELDS` / `GET_SELECT` / `FIELD_KIND`.
- `services/branding/get-tenant-branding.ts` — add the three new columns to the select +
  `TenantBranding` type.
- **DB migration** — add `sidebar_bg text`, `sidebar_text text`, `muted text` to
  `tenant_branding` (nullable). Seed each tenant's `admin` row from its base palette.

## One-line summary

DB row (admin target) → one Mantine theme + `cssVariablesResolver` → CSS variables → every
admin surface (sidebar, nav, active/hover, buttons, headings, body, muted, borders). No
storefront-token borrowing, no `colorsTuple` flattening, no manual `<style>` var bridge.
