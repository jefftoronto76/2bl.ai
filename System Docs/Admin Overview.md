# Admin Design System

## Purpose

The Natural Resource admin interface is built on **Mantine v7**. All admin
components use Mantine primitives and the shared theme defined in
`/components/admin/theme/mantine-theme.ts`. No hardcoded hex values — all
visual values flow through Mantine's theme system.

---

## Architecture

### Theme

**Location:** `/components/admin/theme/mantine-theme.ts`

**Stale as static values — corrected 2026-08-14.** The theme is no longer one
fixed palette mapped from `System Docs/Design System.md`'s jefflougheed/admin
token table; `buildAdminTheme(branding, tenantId)` builds a distinct Mantine
theme per tenant, falling back to one of three hardcoded `TENANT_FALLBACKS`
palettes (keyed by tenant UUID) when a branding field is null:
- **jefflougheed** (dark inkwell) — accent `#a8c8a8`, background `#181820`,
  Playfair Display / DM Sans / DM Mono
- **2bl.ai / SBL** — accent `#C8542E`, background `#FAF6EE`,
  Newsreader / Manrope / DM Mono
- **Heirloom** — accent `#2E854D`, background `#ECE3D2`,
  Cormorant Garamond / DM Sans / DM Mono

None of these match the `#2d6a4f` / `#f9f8f5` pair this section previously
listed as *the* primary/background — those values now only appear as inert
CSS-var fallbacks (`var(--mantine-color-green-6, #2d6a4f)`) and in admin mock
fixtures (`components/admin/lib/fixtures.ts`), not in the live theme.
Spacing, radius, and shadows remain static, mapped from design tokens as
before. This overlaps `System Docs/Design System.md`'s token table, which
still documents the old single-palette jefflougheed/admin values — see this
audit's cover note for the discrepancy.

### MantineProvider

Wrapped at `app/admin/layout.tsx` → renders `UnifiedAdminShell`
(`components/admin/shell/UnifiedAdminShell.tsx`, `'use client'`) which uses
`AppShell` for the sidebar + main layout. **Renamed from `AdminShell`** (PR
#145, "Unified admin shell — merge platform and tenant chrome into one") —
`app/(platform)/layout.tsx` renders the same component, one shell shared by
both the tenant-admin and platform-admin surfaces rather than two separate
ones.

### Component layers

```
mantine-theme.ts → Mantine primitives → thin wrappers → composites → app
```

---

## Component Inventory

### Primitives — `/components/admin/primitives/`

Thin wrappers around Mantine components. Preserve the existing variant API
so composites don't need changes.

| Component | Mantine Base | Variants |
|---|---|---|
| `Button` | `Button` | primary→filled, secondary→default, ghost→subtle, danger→filled+red |
| `Text` | `Text` | body→md, label→sm+fw500, title→lg+fw600, muted→sm+dimmed |
| `Badge` | `Badge` | default→gray, success→green, warning→yellow, danger→red (all light) |
| `Card` | `Paper` | default→shadow, outlined→withBorder, interactive→border+hover |
| `Icon` | Custom span | sm/md/lg sizes, default/muted color via Mantine CSS vars |
| `PromptFullnessMeter` | Custom (Mantine CSS vars) | Segmented completeness meter for prompt blocks |

### Composites — `/components/admin/content/`

| Component | Mantine Base | Purpose |
|---|---|---|
| `Tag` | `Badge` + `CloseButton` | Dismissible label |
| `StatusBadge` | `Badge` | Maps status → color (active→green, error→red, etc.) |
| `AddBlockButton` | `Button` + `Tooltip` | Subtle button with plus icon, tooltip when disabled |
| `PromptCard` | `Paper` + `Stack` + `Group` | Card with title, status, tags, actions |
| `Accordion` | `Accordion` | Single collapsible section |

### Navigation + Layout — `/components/admin/shell/`

**Renamed and consolidated (PR #145).** `AdminSidebarNav`/`AdminShell`
(previously under now-deleted `/components/admin/navigation/` and
`/components/admin/layout/` directories) no longer exist — replaced by:

| Component | Mantine Base | Purpose |
|---|---|---|
| `UnifiedAdminShell` | `AppShell` | Full admin layout — dark navbar, light main area, Clerk UserButton. Shared by both `app/admin/layout.tsx` (tenant admin) and `app/(platform)/layout.tsx` (platform admin). |
| `UnifiedSidebarNav` | `NavLink` + `Stack` | Router-aware sidebar nav with sub-items, driven by `nav-config.ts`'s `NAV_SECTIONS`/`isActive` rather than the old per-item component composition below. |

The old `/components/admin/navigation/` directory's `SidebarItem.tsx` and
`SidebarSection.tsx` files still exist on disk but are **orphaned** — no
remaining import anywhere in the codebase (`UnifiedSidebarNav.tsx` renders
its nav items inline via Mantine's `NavLink`/`Stack`/`Text` directly, not by
composing these).

### Chat — `/components/admin/`

| Component | Notes |
|---|---|
| `PromptBuilderChat` | Modal chat assistant. Uses Mantine CSS vars only (no tokens.ts) |

---

## Build Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Mantine v7 installed, theme bridge | Complete |
| Phase 2 | Primitives replaced with Mantine wrappers | Complete |
| Phase 3a | Composites replaced with Mantine components | Complete |
| Phase 3b | Navigation + layout → Mantine AppShell + NavLink | Complete |
| Phase 3c | PromptBuilderChat + form inputs + tokens.ts cleanup | Complete |

**Mantine migration complete.** Legacy `tokens.ts` and old layout shells
have been removed. All admin components use Mantine theme vars exclusively.
**Since then, theme values are no longer purely static:** `AdminThemeProvider`
(`components/admin/theme/AdminThemeProvider.tsx`) calls `buildAdminTheme(branding, tenantId)`
(`components/admin/theme/mantine-theme.ts`) to build the Mantine theme at
runtime from a tenant's actual branding row, not from hardcoded values alone
— the "no hardcoded hex values" property above still holds, it's just
resolved dynamically per tenant now rather than compiled once.
