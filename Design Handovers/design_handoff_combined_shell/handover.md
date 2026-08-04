# Handover — Combined Admin Shell

**2BL.AI Platform · target: unified chrome for `app/(platform)/*` + `app/admin/*`**
Mantine v7 · Next.js App Router · TypeScript strict. Status: **design complete & approved.**

> **Scope of this package: the SHELL only** — the merged sidebar, routing, and
> page-layout chrome that wraps both admins. The individual screens (Settings,
> Inbound Chats, Blocks, Composer, Tenants, etc.) are handed over separately. Do
> **not** rebuild those screens from this package; only the navigation + layout
> that contains them.

---

## 1. What was built & what changed

Today there are **two separate admin shells**:

| Shell | Wraps | Sidebar | Source (current) |
|-------|-------|---------|------------------|
| Platform | `/platform/*` | Tenants · Products · Members · Usage | `PlatformSidebarNav.tsx` |
| Tenant | `/admin/*` | Inbound Chats · Prompt · Settings · Members + **Prompt Studio** group | `AdminShell.tsx` + `AdminSidebarNav.tsx` |

Moving between them was a context switch — different chrome, no cross-links.

**The merge:** one dark sidebar, one set of chrome, wrapping **both** route groups.
The sidebar is split into three labelled sections:

```
PLATFORM              ← /platform/* + a Prompt shortcut
  Tenants
  Members
  Usage
  Prompt

SECOND BRAIN LABS     ← the active tenant; /admin/* tenant screens
  Inbound Chats
  Prompt
  Settings

PROMPT STUDIO         ← /admin/prompt-studio/* (tenant-scoped)
  Composer
  Blocks
  History
  Assets
```

**What changed**

| Area | Before | Now |
|------|--------|-----|
| Sidebars | Two (`PlatformSidebarNav`, `AdminSidebarNav`) | **One** `UnifiedSidebarNav`, sectioned |
| Shells | Two wrappers | **One** `UnifiedAdminShell`, mounted by both layouts |
| Wordmark | Per-admin | **"Second Brain Labs / Admin"** (platform owner) everywhere |
| Cross-nav | None | Platform & tenant routes reachable from the same sidebar |
| Tenant heading | n/a | Section heading = **active tenant name** (dynamic) |

**Kept as-is:** the dark sidebar visual language, 240px width, green active/hover
states, the mobile burger + drawer, and every route path (no URLs changed — only
the chrome around them). Per-segment auth gating is unchanged.

---

## 2. Architecture — one shell, two layouts

The cleanest merge in App Router keeps each route group's **own** server layout
(so each keeps its own gating and data boundary) but has both render the **same**
shared shell component:

```
app/
  (platform)/
    layout.tsx        → gates platform admin, renders <UnifiedAdminShell>
    platform/admin/…   (Tenants)
    platform/members/… (Members)
    platform/usage/…   (Usage)
  admin/
    layout.tsx        → gates tenant admin, renders <UnifiedAdminShell>
    page.tsx           (Inbound Chats)
    settings/…  prompt/…  members/…  prompt-builder/…  prompt-studio/…

components/admin/shell/
    UnifiedAdminShell.tsx     Mantine AppShell: navbar + mobile header/drawer + main
    UnifiedSidebarNav.tsx     the sectioned nav + active state via usePathname()
    UserButton.tsx            footer user button
    nav-config.ts             NAV_SECTIONS, PAGE_TITLES, PADDED_ROUTES, isActive()
    *.module.css              dark-sidebar tokens lifted from the prototype
```

`UnifiedAdminShell` is **presentational + client-side** (`usePathname` for active
link, `useDisclosure` for the drawer). Gating stays in the two `layout.tsx`
server components. This is the recommended approach because:

- each admin keeps its independent auth gate and data-loading boundary;
- the nav is defined **once** (`nav-config.ts`) and imported by both;
- no route paths move, so existing links / bookmarks keep working.

> **Alternative considered:** a single route-group layout owning both segment
> trees. Rejected — it would force the two admins to share one gate and one data
> boundary, and require moving `/platform/*` and `/admin/*` under a common
> segment. Higher blast radius for no UX gain. If you prefer it, the shell
> component is identical; only the layout wiring differs.

---

## 3. Navigation model (`nav-config.ts`)

- **`NAV_SECTIONS`** — the single source of truth, ordered top→bottom. The tenant
  section is flagged `isTenant: true`; the shell swaps its label for the active
  tenant name at render.
- **`isActive(href, pathname)`** — exact match for leaf routes; prefix match for
  sub-trees (so `/admin/prompt-studio/blocks/123` keeps "Blocks" lit). `/admin`
  (Inbound Chats) is special-cased so it doesn't match every `/admin/*` route.
- **`PAGE_TITLES`** — mobile-header title per route; falls back to the active
  item's label.
- **The duplicated "Prompt" entry** (Platform section → `/admin/prompt-studio/prompt`)
  is intentional in the approved design: a platform-operator shortcut into the
  compiled-prompt preview. Confirm whether to keep it. *(Open decision §5.2.)*

---

## 4. Content layout — padded vs. full-bleed

Two kinds of screen render inside `<AppShell.Main>`:

1. **Full-bleed tenant screens** (Inbound Chats, Settings, Blocks, Composer, …) —
   each owns its own height, scroll region, and sticky header (the `.screen`
   pattern). These render as **direct children** of `Main`, no wrapper.
2. **Padded screens** (all `/platform/*` + `/admin/members`) — render inside a
   `max-width: 1080px`, `padding: 24px` column (`.mainInner`).

`isPaddedRoute(pathname)` (driven by `PADDED_ROUTES`) decides which. When you add
a screen, add its route to `PADDED_ROUTES` only if it should sit in the narrow
padded column; otherwise it goes full-bleed and must manage its own layout.

---

## 5. Open decisions / things to handle in implementation

1. **Active-tenant resolution.** The tenant section heading and all `/admin/*`
   links assume "the tenant being administered." The prototype hardcodes *Second
   Brain Labs*. In production, resolve it (subdomain? selected-tenant cookie?
   `getActiveTenant()` placeholder in both layouts) and pass `tenantName` to the
   shell. **Decide how a platform admin picks which tenant `/admin/*` targets** —
   today there's no tenant switcher in the merged sidebar. If platform operators
   manage many tenants, you likely need one (e.g. a picker in the tenant section
   header, or selecting a tenant from the Tenants screen sets the context).
2. **Duplicate "Prompt" entry** (see §3) — keep the platform shortcut or drop it.
3. **Wordmark.** Always shows "Second Brain Labs / Admin" (the platform owner).
   Confirm it shouldn't switch to the active tenant's brand when inside `/admin/*`.
4. **Auth gating per segment.** `app/admin/layout.tsx` currently gates on a
   placeholder `user.canAccessAdmin`. Define who may see `/admin/*` — tenant
   admins only, or platform admins too (they need it, since the merged sidebar
   links there). Adjust both layout gates accordingly.
5. **AppShell vs. custom flex.** The prototype uses a hand-rolled flex shell; the
   handover `.tsx` uses Mantine **`AppShell`** (idiomatic, gives the mobile
   navbar collapse for free). If your app already standardises on a custom shell,
   keep the CSS-module tokens and drop them into that instead.
6. **CSS tokens.** The `.module.css` files carry literal hex from the prototype
   (dark-9 `#101113`, green-6 `#2d6a4f`, etc.). Replace with your existing Mantine
   theme variables (`var(--mantine-color-dark-9)` …) where you already have them —
   the literals are there so the files render standalone, not to introduce a new
   palette.

---

## 6. Design tokens (sidebar chrome)

| Token | Value | Use |
|-------|-------|-----|
| Sidebar bg | `#101113` (dark-9) | `.navbar` |
| Sidebar border | `#2C2E33` (dark-6) | right border |
| Nav width | `240px` | fixed |
| Link idle | `#ced4da` (gray-4) | nav link text |
| Link hover | bg `#245741` (green-7), text `#fff` | hover |
| Link active | bg `#2d6a4f` (green-6), text `#fff`, weight 500 | active |
| Section label | `#868e96` (gray-6), 9px, mono, 0.08em, uppercase | group headings |
| Wordmark name | `#f1f3f5` (gray-1), 16px, Playfair Display 400 | brand |
| Wordmark kicker | `#2d6a4f` (green-6), 9px, mono, 0.18em, uppercase | "Admin" |
| Main bg | `#fff` | content |
| Padded column | `max-width 1080px`, `padding 24px` | `.mainInner` |
| Mobile header | `48px` tall, white, `#e9ecef` bottom border | burger bar |
| Breakpoint | `sm` (≤768px) → sidebar collapses to drawer | responsive |
| Radius | `4px` (r-sm) | nav links |
| Fonts | Playfair Display (headings) · DM Sans (body) · DM Mono (labels) | — |

---

## 7. Files in this package

**Production-shaped skeletons** (recreate against your real modules — verify
import paths, `getActiveTenant`, and the auth gates):

- `src/components/admin/shell/nav-config.ts`
- `src/components/admin/shell/UnifiedAdminShell.tsx` (+ `.module.css`)
- `src/components/admin/shell/UnifiedSidebarNav.tsx` (+ `.module.css`)
- `src/components/admin/shell/UserButton.tsx` (+ `.module.css`)
- `src/app/(platform)/layout.tsx`
- `src/app/admin/layout.tsx`

**Design reference (not code to copy):**

- `prototype/Combined Admin - Production.html` — the approved interactive
  prototype. Open it (served, not `file://`) to see the merged sidebar, active
  states, the padded-vs-full-bleed behaviour, and the mobile drawer. The shell
  logic lives in `prototype/combined/app.jsx`; the chrome CSS in
  `prototype/tenant-admin/styles.css` (`.shell`, `.navbar`, `.navlink`,
  `.nav-section-label`, `.main`, `.main-inner`, mobile-header / drawer rules).

> These HTML/JSX files are **design references** — recreate the shell in the
> existing Mantine v7 + App Router codebase using its patterns, don't ship the
> HTML. The `.tsx` above is the production target.
