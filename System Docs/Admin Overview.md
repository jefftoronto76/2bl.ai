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

Maps CLAUDE.md design tokens to Mantine's `createTheme()`:
- Primary color: `#2d6a4f` (10-shade green scale)
- Background: `#f9f8f5`
- Body font: DM Sans
- Heading font: Playfair Display
- Monospace font: DM Mono
- Spacing, radius, shadows mapped from design tokens

### MantineProvider

Wrapped at `app/admin/layout.tsx` → renders `AdminShell` (`'use client'`
component) which uses `AppShell` for the sidebar + main layout.

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

### Composites — `/components/admin/content/`

| Component | Mantine Base | Purpose |
|---|---|---|
| `Tag` | `Badge` + `CloseButton` | Dismissible label |
| `StatusBadge` | `Badge` | Maps status → color (active→green, error→red, etc.) |
| `AddBlockButton` | `Button` + `Tooltip` | Subtle button with plus icon, tooltip when disabled |
| `PromptCard` | `Paper` + `Stack` + `Group` | Card with title, status, tags, actions |
| `Accordion` | `Accordion` | Single collapsible section |

### Navigation — `/components/admin/navigation/`

| Component | Mantine Base | Purpose |
|---|---|---|
| `AdminSidebarNav` | `NavLink` + `Stack` | Router-aware sidebar nav with sub-items |
| `SidebarItem` | `NavLink` | Dark-themed nav item with active state |
| `SidebarSection` | `Stack` + `Text` | Grouped nav items with optional label |

### Layout — `/components/admin/layout/`

| Component | Mantine Base | Purpose |
|---|---|---|
| `AdminShell` | `AppShell` | Full admin layout — dark navbar, light main area, Clerk UserButton |

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
