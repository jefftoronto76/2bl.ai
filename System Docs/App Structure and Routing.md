# App Structure & Routing

## App Structure & Routing

The Next.js `app/` directory serves multiple brands from one codebase, split by
route group / segment and resolved at the edge by `middleware.ts`.

- **`app/(jefflougheed)/`** — route group holding the jefflougheed.ca public
  site (`page.tsx` + `layout.tsx`). The group's `layout.tsx` imports the inkwell
  token file (`app/(jefflougheed)/globals.css`) and owns the jefflougheed
  `<head>`: metadata, favicons/webmanifest (`metadata.icons` →
  `/sage/jefflougheed/favicons/…`), the Google Fonts `<link>` (Playfair Display
  / DM Sans / DM Mono), and the Calendly widget CSS/JS. Being a route group,
  `(jefflougheed)` is **not** part of the URL — these pages still serve from `/`.
- **`app/secondbrainlabs/`** — the Second Brain Labs storefront for `2bl.ai`
  (`page.tsx` + `layout.tsx`). `layout.tsx` imports the SBL token file
  (`app/secondbrainlabs/globals.css`), wraps the page in
  `<div data-brand="sbl">` (which carries the next/font `--font-serif` /
  `--font-sans` variables), sets `metadata.icons` → `/2bl/favicons/…`, and loads
  Newsreader + Manrope via `next/font/google`.
- **`app/heirloom/`** — the Heirloom storefront for `heirloom.2bl.ai`
  (`page.tsx` + `layout.tsx`). Unlike `(jefflougheed)`, this is a plain path
  segment, not a route group — it serves from `/heirloom` (the `heirloom.2bl.ai`
  host is rewritten there by middleware). `layout.tsx` imports the Heirloom token
  file (`app/heirloom/globals.css`) and wraps the page in
  `<div data-brand="heirloom">` (which carries the next/font
  `--font-heirloom-serif` / `--font-heirloom-sans` variables that the Heirloom
  `--font-*` remaps depend on), loading Cormorant Garamond (serif/display) + DM
  Sans (body) via `next/font/google`. `layout.tsx` has **no `metadata.icons`**
  (so Heirloom routes fall back to the App Router `app/favicon.ico` convention).
  `page.tsx` is the **product app root**: it mounts `ChatProvider` and renders
  the landing page with a slide-in chat panel layered over it (see the
  "Heirloom storefront" section in `System Docs/Public Site.md`).
- **`app/layout.tsx`** — the shared root layout. `<ClerkProvider afterSignOutUrl="/">` is
  inside `<body>` (not wrapping `<html>`) — Clerk requires this placement; do not move it.
  It imports the global base layer (`app/globals.css` — reset + shared component
  styles, no brand tokens) and reads the `x-sbl` and `x-heirloom` request headers
  (set by middleware), applying `data-palette="inkwell"` to `<html>` only when the
  request is **neither** SBL **nor** Heirloom, so the inkwell palette never bleeds
  into `/secondbrainlabs` or `/heirloom`. `app/favicon.ico` (the App Router
  favicon convention, served as the default icon) is the **2BL** icon.
- **`app/admin/` + `app/(platform)/`** — the Mantine admin and 2BL platform
  admin. They render under `app/layout.tsx` (not under `(jefflougheed)`), so each
  layout imports `app/(jefflougheed)/globals.css` explicitly to keep the shared
  inkwell tokens its pages consume. Platform-admin screens live under
  `app/(platform)/platform/*` (gated in `app/(platform)/layout.tsx`); e.g.
  `platform/settings` is the Platform Settings screen: a Composer Prompt section
  (read-only list of composer-family prompt sets, is_composer_prompt=true, each
  with an Edit pencil into Blocks — no Select/Save/Revert; activation only
  happens via Compile & Publish there) plus the Tenant Prompts card (full
  cross-tenant CRUD over every ordinary prompt set); page + `MasterPromptPicker`
  co-located there, Mantine.

### Middleware (`middleware.ts`)

`middleware.ts` wraps Clerk's `clerkMiddleware` and now performs **domain-based
routing in addition to Clerk auth**:

- **Domain routing (runs first):** `host` is normalized (lowercased, port
  stripped). For the SBL hosts (`2bl.ai`, `www.2bl.ai`) or any request already
  under `/secondbrainlabs`, the request is tagged with an `x-sbl: 1` header.
  SBL-host requests not already on the SBL path are **rewritten** to
  `/secondbrainlabs` (root `/` → `/secondbrainlabs`, otherwise the path is
  prefixed). The rewrite is internal — the `2bl.ai` URL is preserved in the
  address bar.
- **Heirloom routing:** the same pattern for the Heirloom host
  (`HEIRLOOM_HOSTS = {heirloom.2bl.ai}`) or any request already under
  `/heirloom`. Such requests are tagged with an `x-heirloom: 1` header, and
  Heirloom-host requests not already on the `/heirloom` path are **rewritten**
  to `/heirloom` (root `/` → `/heirloom`, otherwise prefixed). The SBL rewrite
  is guarded so it never catches `/heirloom` (or `/api/platform/*`); the rewrite
  is internal so the `heirloom.2bl.ai` URL is preserved.
- **`/admin` is excluded from every host rewrite.** An `isAdminPath` guard
  (`/admin` or `/admin/*`, mirroring the `isApiPath` guard) is ANDed into both
  the SBL and Heirloom block conditions, so `2bl.ai/admin` and
  `heirloom.2bl.ai/admin` are **not** rewritten under a product segment — they
  pass through to the shared root `/admin` route, which resolves the tenant from
  the host (see "Multi-tenant admin" below). (`/api/*` already passes through on
  the Heirloom host via `isApiPath`, so admin API calls resolve there too.)
- **jefflougheed.ca passes through** to `/` unchanged — no `x-sbl` /
  `x-heirloom` tag, no rewrite.
- **`/invite` is excluded from every host rewrite.** An `isInvitePath` guard
  (`/invite` or `/invite/*`) is ANDed into the preview-routing guard and the
  SBL/Heirloom/Legacy host rewrite blocks, so `2bl.ai/invite/x` and
  `heirloom.2bl.ai/invite/x` are **not** rewritten under a product segment —
  they fall through to the shared root `/invite/[token]/route.ts` handler
  (the public invite-link redirect; see "Public" API routes).
- **`/join` is excluded from every host rewrite, same as `/invite`.** An
  `isJoinPath` guard (`/join` or `/join/*`) added 2026-08-10
  (reusable-story-invite-links) is ANDed into the same four places
  `isInvitePath` is — the preview-routing guard and the SBL/Heirloom/Legacy
  host rewrite blocks — so `heirloom.2bl.ai/join/x` falls through to the
  shared root `/join/[token]/route.ts` handler (the public story-invite-link
  redirect) instead of being rewritten to `/heirloom/join/x`, which has no
  route handler. **This guard was missing when the feature first shipped** —
  the new route was added without it, which would 404 every
  `/join/[token]` hit on `heirloom.2bl.ai` (and the SBL/Legacy hosts, same
  reason). Caught and fixed in a post-merge documentation review by tracing
  `/invite`'s own carve-out and checking whether the new sibling route had
  the same one; actual production exposure before the fix was not
  independently verified either way. Treat this as the reference example of
  why a new top-level public route needs this same treatment — grep this
  file's `isInvitePath` usages before adding another one.
- **Correlation ID generation:** a `crypto.randomUUID()` is generated at the
  top of every request handler and written as `x-correlation-id` onto
  `requestHeaders`. The header propagates through all `NextResponse.next` /
  `NextResponse.rewrite` returns (including the SBL, Heirloom, admin, and
  fallthrough paths), so every API route can read `req.headers.get('x-correlation-id')`
  and forward it to `logEvent` / `logAuthEvent` for end-to-end traceability.
- **Clerk auth (unchanged):** after the domain check, `/admin(.*)` routes are
  still protected via `auth.protect()`.

**Multi-tenant admin:** the same `/admin` code serves every tenant; the tenant
is resolved per-request from the Host. `getAuthContext()` picks the active
tenant by host for multi-tenant users, and the **AdminShell banner name is
host-derived, not hardcoded** — `app/admin/layout.tsx` calls
`getTenantName()` (`services/auth/get-tenant-name.ts`, which resolves via
`getAuthContext` then reads `tenants.name`) and passes it as the `tenantName`
prop to `AdminShell` (falling back to `'Natural Resource'` only if resolution
returns null). The `ADMIN` eyebrow is a fixed role descriptor, not a tenant
name. So `jefflougheed.ca/admin` shows "Natural Resource" and
`heirloom.2bl.ai/admin` shows the Heirloom tenant's `tenants.name`.

The `x-sbl` and `x-heirloom` headers are the signals the root layout uses to
choose the palette, keeping brand resolution in one place (middleware) rather
than sniffing the host in every layout.

---
