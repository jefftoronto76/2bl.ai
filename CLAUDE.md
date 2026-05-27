# CLAUDE.md — Natural Resource / Sage Platform

This file is read at the start of every Claude Code session. These principles
are non-negotiable. Apply them to every task. If you cannot follow a principle
on a given task, say so explicitly before proceeding — do not silently skip it.

**This file must stay current.** If the stack, schema, or principles change,
updating CLAUDE.md is part of the Definition of Done for that change — not a
follow-up task.

---

## Principles

### Mobile-First, Responsive on First Pass
Every component ships responsive. Mobile is not a second pass or a polish task
— it is part of the definition of done. Design and build mobile-first, then
extend to desktop cleanly.

### Design Quality Equals Feature Delivery
Aesthetics and functionality are weighted equally. Zero design debt is the
target. Acceptable debt is work that is functional but not yet polished.
Unacceptable debt is anything inconsistent with the design system — that is a
blocker, not a backlog item. We do not ship visually inconsistent work.

### Flexibility Over Convenience
Every architecture decision gets pressure-tested for lock-in. The test is
whether a decision closes a real door, not whether a future scenario can be
imagined. We do not abstract for hypotheticals. Prefer composable, reversible
decisions over fast ones — but only where a real constraint exists.

### Test Plans Are Part of Every Build
Write the test plan before implementation begins. No component ships without
tests. If the task scope makes this impossible, flag it explicitly before
proceeding — do not silently skip it.

### Highest Data Security
Security is a first-class requirement, not a layer added later. Data is
encrypted at rest and in transit. Row Level Security enforced at the database
layer. Access is least-privilege by default. No exceptions.

### Privacy by Design
Collect only what is needed. User data is not stored beyond its purpose.
Privacy obligations are defined before a feature ships, not after. Applies to
visitor chat data, SMS, client threads, and all multi-tenant data.

### API Before Build
Before writing custom logic, check whether an API, library, or platform service
already solves the problem. We do not build what already exists.

### User Experience Over Development Ease
When there is tension between what is easier to build and what is better for
the user, the user wins. Development convenience is never a justification for a
worse experience.

### Plan Before Implementation
Default to planning before writing code. Understand the full scope, the data
model, the edge cases, and the dependencies before touching the repo. Trust the
plan, but verify as you go.

### Accessibility Is Non-Negotiable
Semantic HTML, keyboard navigation, screen reader support, and sufficient color
contrast are part of the definition of done on every component — not a retrofit.

### Error Handling and Graceful Degradation
The app owns its failures. No raw errors surface to users. Every failure state
has an on-brand, user-appropriate response. Fallback behavior is defined before
a component ships.

### Performance Is a Feature
Performance is measured, not assumed. Targets apply to every component:
- LCP under 2 seconds on mobile
- Non-AI API routes under 500ms
- Anthropic streaming: first token under 1 second
- Core Web Vitals pass on mobile — verified via Vercel on every deploy
- Anthropic API cost tracked per session — uncontrolled token usage is an
  architecture problem, not a billing one

### Observability
Logging and monitoring are part of the build. Errors are captured, surfaced in
the admin health panel, and actionable. If something breaks, we know before the
user tells us.

### Documentation Stays Current
PRDs, handoff docs, and architecture decisions are updated as part of shipping.
A feature is not merged until the PRD and any relevant handoff docs reflect the
change. Documentation is a PR gate, not a follow-up task.

### One Change at a Time
Surgical, single-change builds with verification before proceeding. Compound
changes introduce compound risk. Every step is confirmed before the next one
starts.

---

## Stack

- **Framework:** Next.js 15, React 19, TypeScript (strict mode — always)
- **Styling:** Tailwind (public site), Mantine v7 (admin interface)
  — v7 is intentional. v9 requires React canary APIs not in React 19 stable.
  Do not upgrade Mantine without explicit instruction from Jeff.
  Companion packages: `@mantine/notifications@7.17.8` (toast notifications,
  wired into `app/admin/layout.tsx` via `<Notifications />`).
- **Database:** Supabase (Postgres + Row Level Security + Realtime)
- **Auth:** Clerk
- **AI:** Anthropic API (`claude-sonnet-4-6`) + Vercel AI SDK (streaming + fallback)
- **Fallback model:** OpenAI via Vercel AI SDK
- **SMS:** Twilio
- **Deployment:** Vercel

---

## Branch Convention

- Every feature gets its own branch
- Always branch from the most current working branch:
  `git checkout [base-branch] && git pull origin [base-branch] && git checkout -b [new-branch]`
- No changes directly to main unless explicitly instructed by Jeff
- Commit messages are descriptive and specific
- Incremental commits with confirmation between steps — do not batch everything
  into one commit at the end

---

## Development Workflow Rules

These rules apply to all future sessions and should be re-read at every
session start.

1. **PUSH CADENCE**: Every commit must be pushed to origin immediately.
   Verification happens on Vercel preview deployments, never on local-only
   branches. Do not batch pushes to end of PR. Do not say "push after all
   commits approved." After each commit: git push, surface the preview URL
   if known, pause for approval.

2. **VERIFICATION SURFACE**: Verification of runtime behavior happens on
   Vercel preview URLs, not local dev. Static checks (build, tsc, tests)
   happen in the sandbox. Manual verification (page renders, query returns
   right rows, UI looks correct) happens against preview. Do not ask Jeff
   to run `npm run dev` locally as a default verification step.

3. **SCHEMA MIGRATIONS**: All Supabase schema changes are done by Jeff in
   Supabase Studio, not by CC. CC does not write migration files, does not
   run `ALTER TABLE` statements, does not modify database schema directly.
   When a sprint requires schema changes, those happen first (Jeff in
   Studio), then CC's code work proceeds against the already-migrated
   schema. If CC encounters a missing column or table during code work,
   stop and flag — do not attempt to add it.

4. **PR DESCRIPTIONS ARE MANDATORY**: Every PR must have a description
   written when the PR is opened. Descriptions follow a three-section
   format:

   - **What & Why**: What changed and why — not how. The diff shows how.
     Plain language summary of the change and the reason for it.
   - **Reference**: Link to the relevant ticket, spec, design doc, or
     session notes. If none exists, note "no spec, ad-hoc".
   - **Reviewer attention**: Anything specific the reviewer should pay
     attention to — tricky decisions, gotchas, deferred items, manual
     verification steps needed.

   Descriptions are concise. Do not duplicate what the diff shows. Do not
   list every commit (the commit history shows that). Focus on the human
   context the diff cannot convey.

5. **DIVISION OF LABOR**: Jeff is responsible exclusively for Supabase
   Studio work — schema migrations, data backfills, direct database
   inspection. CC is responsible for everything else — code changes,
   opening PRs, writing PR descriptions, merging, deployment configuration,
   GitHub workflow operations. CC does not ask Jeff to perform git
   operations, GitHub UI operations, or deployment management. CC drives
   the workflow end to end with Jeff's approval gates.

---

## Design System

- **Admin interface:** Mantine v7 — components in `/components/admin/`
- **Public site:** Tailwind — components in `/src/components/`
- **Shared design tokens:** `/components/admin/theme/mantine-theme.ts`
- **SBL storefront:** Tailwind — the Second Brain Labs storefront (`2bl.ai`,
  served from `/secondbrainlabs`) has its own isolated token + font set in
  `app/secondbrainlabs/globals.css`. See "Second Brain Labs storefront palette" below.
- **Rule:** No new admin screen is built before the relevant Mantine component
  foundation exists. Design system before screens — always.

### globals.css structure (split by product)

Brand design tokens are **split into per-product, route-scoped CSS files** so
each brand's tokens only load on its own routes. A CSS file imported in a
layout only loads for routes whose component tree includes that layout, which
is what gives the isolation:

| File | Holds | Imported by |
|------|-------|-------------|
| `app/globals.css` | Tailwind directives, shared base reset, scrollbars, and cross-brand component styles (the Sage chat overlay, chat-first hero stage, `nav-chat-*`, Calendly overrides, `.highlight-marker`/`.mark-highlight`). **No brand token blocks.** Token-consuming rules here resolve against whichever brand file loads on the route. | `app/layout.tsx` (root — loads on every route) |
| `app/(jefflougheed)/globals.css` | The inkwell `:root` tokens **and** the full `html[data-palette="inkwell"]` block (the jefflougheed.ca + admin/platform palette). | `app/(jefflougheed)/layout.tsx`, **and** `app/admin/layout.tsx` + `app/(platform)/layout.tsx` — admin/platform live outside the `(jefflougheed)` route group but share the inkwell palette, so they import this file explicitly. |
| `app/secondbrainlabs/globals.css` | SBL tokens promoted to `:root` + the `sb-pulse` / `sb-dot` keyframes. | `app/secondbrainlabs/layout.tsx` |
| `app/heirloom/globals.css` | Heirloom colour/`hl` tokens + `background`/`color` promoted to `:root`; the `--font-*` remaps **stay scoped to `[data-brand="heirloom"]`** (next/font defines `--font-heirloom-*` on that wrapper, not on `:root`, so the remaps must resolve there); the `.bg-*-glow` / `.bg-pattern-dots` utilities (kept `[data-brand="heirloom"]`-scoped). | `app/heirloom/layout.tsx` |

Note: the jefflougheed public-site component CSS (Sage overlay, hero stage,
`nav-chat-*`) intentionally stays in `app/globals.css` for now — it is coupled
to the `Chat`/`Nav`/`Hero` components that don't move until Phase 3.

The token table below is the **jefflougheed.ca + admin palette** (the default
`:root` / `html[data-palette="inkwell"]` tokens in
`app/(jefflougheed)/globals.css`):

| Token | Value |
|-------|-------|
| Background | `#f9f8f5` |
| Accent green | `#2d6a4f` |
| Text primary | `#1a1917` |
| Text muted | `rgba(26,25,23,0.55)` |
| Font display | Playfair Display |
| Font body | DM Sans |
| Font mono | DM Mono |
| Min font size | 16px (labels/mono UI: 11px acceptable) |
| Spacing unit | 4px multiples |

### Second Brain Labs storefront palette

The SBL storefront (`2bl.ai`, served from `/secondbrainlabs`) ships its own
design tokens, **fully isolated** from the jefflougheed/inkwell palette. They
live at `:root` in `app/secondbrainlabs/globals.css` (imported only by the
`/secondbrainlabs` layout, so they load only on SBL routes) and are surfaced as
Tailwind utilities in `tailwind.config.js` (`paper`, `paper-2`, `paper-3`,
`line`, `line-2`, `ink`, `ink-2`, `muted`, `dim`, `accent` — terracotta,
reusing the alpha-aware `rgb(var(--color-accent) / <alpha-value>)` token —
`accent-deep`, `accent-soft`, `pos`). Because the SBL token file only loads on
SBL routes, the Tailwind tokens are inert everywhere else and **the two token
sets do not conflict**: the inkwell `:root` palette ships in a separate file
that does not load on SBL pages, and the root layout drops `data-palette="inkwell"`
whenever the request is SBL (see App Structure & Routing) so the inkwell rules
never bleed in.

| SBL token | Value |
|-----------|-------|
| Paper (bg) | `#FAF6EE` / `#F2ECDF` / `#ECE3D2` |
| Line | `#E2D6BC` / `#D2C3A2` |
| Ink | `#1F1A14` / `#3B3328` |
| Muted / Dim | `#6B6256` / `#9A917F` |
| Accent (terracotta) | `rgb(200 84 46)` |
| Accent deep / soft | `#A93F1D` / `#F4D9CC` |
| Positive | `#4F7A4A` |

**Fonts are scoped per brand.** Newsreader (serif) and Manrope (sans) are loaded
via `next/font/google` in `app/secondbrainlabs/layout.tsx` and exposed as
`--font-serif` / `--font-sans` (Tailwind `font-serif` / `font-sans`) **on the
SBL layout wrapper only**. jefflougheed.ca keeps Playfair Display / DM Sans /
DM Mono (`--font-display` / `--font-body` / `--font-mono`), loaded via the
Google Fonts `<link>` in `app/(jefflougheed)/layout.tsx` and defined in `:root`.
Neither font set bleeds into the other.

### Heirloom storefront palette

The Heirloom storefront (`heirloom.2bl.ai`, served from `/heirloom`) ships its
own design tokens, **fully isolated** from the jefflougheed/inkwell and SBL
palettes. They live in `app/heirloom/globals.css` (imported only by the
`/heirloom` layout, so they load only on Heirloom routes). The colour tokens are
promoted to `:root`: `--color-surface` and `--color-accent` are re-scoped there
so the existing `surface` / `accent` Tailwind tokens render Heirloom values on
these routes, and Heirloom-only tokens (`--hl-bg`, `--hl-text-primary`,
`--hl-text-muted`, `--hl-accent-hover`, `--hl-border`) are surfaced as Tailwind
utilities in `tailwind.config.js` (`background`, `text-primary`, `text-muted`,
`accent-hover`, `border`). Because the Heirloom token file only loads on
Heirloom routes, these tokens are inert everywhere else and do not conflict with
the other palettes — the root layout drops `data-palette="inkwell"` whenever the
request is Heirloom (see App Structure & Routing). The background-image helpers
(`.bg-hero-glow`, `.bg-contributor-glow`, `.bg-pricing-glow`, `.bg-cta-glow`,
`.bg-pattern-dots`) and the `--font-*` remaps **remain scoped to
`[data-brand="heirloom"]`** in that file — the wrapper `<div>` is where
next/font defines `--font-heirloom-serif` / `--font-heirloom-sans`, so the
remaps must resolve there rather than at `:root`.

| Heirloom token | Value |
|----------------|-------|
| Background (`--hl-bg`) | `#1C0F06` |
| Surface (`--color-surface`) | `#2A1A0E` |
| Text primary / muted | `#F5EFE6` / `rgba(245,239,230,0.55)` |
| Accent (`--color-accent`) | `rgb(201 169 110)` (gold) |
| Accent hover | `#B8935A` |
| Border | `rgba(245,239,230,0.12)` |

**Fonts are scoped per brand.** Cormorant Garamond (serif/display) and DM Sans
(body) are loaded via `next/font/google` in `app/heirloom/layout.tsx` and
exposed as `--font-heirloom-serif` / `--font-heirloom-sans`, which
`app/heirloom/globals.css` remaps onto `--font-display` / `--font-serif` /
`--font-body` **on the Heirloom layout wrapper only**.

---

## Shared Primitives

Reusable admin-side components in `/components/admin/primitives/`:

| Component | File | Purpose |
|-----------|------|---------|
| `PromptFullnessMeter` | `PromptFullnessMeter.tsx` | Takes `bodies: string[]`, sums character counts, approximates tokens as `ceil(chars/4)`, renders a Mantine `Progress` bar with a monospace label. Color thresholds: green under 5000 tokens, yellow 5000–8000, red over 8000. Used on the Blocks page (reactive to the client-side items state) and the Prompt page (server-fetched on mount). |
| `Text` | `Text.tsx` | Typography primitive wrapping Mantine `Text` with four variants: `body` / `label` / `title` / `muted`. Always renders as `<p>` (`component="p"` is hardcoded on line 44). **Does NOT passthrough polymorphic props** (`component`, `as`, `renderRoot`) — its prop surface only exposes `variant` + `HTMLAttributes<HTMLParagraphElement>`. For non-`<p>` semantic rendering (e.g. monospace `<pre>` blocks, inline `<code>`), use raw HTML elements styled with Mantine CSS variables (`var(--mantine-font-family-monospace)`, `var(--mantine-color-gray-0)`, etc.) — not `<Text component="pre">`, which fails typecheck. |

### Page-local components

| Component | File | Purpose |
|-----------|------|---------|
| `SageParameters` | `app/admin/settings/SageParameters.tsx` | Mantine-based client component rendered inside the Parameters section on the Settings page. Owns the section header row (title + "Add New" button, right-aligned) and the card list below it. Fetches `/api/admin/sage-parameters` on mount. Each existing parameter renders as a Mantine `Card` showing Label (title), Description (subtitle), CTA label, URL, and Open-as (with Embed-code status when `open_as = 'popup'`), plus edit (pencil) / delete (trash) `ActionIcon`s top-right. Edit expands the card inline with `TextInput`s for Label, Description (max 60 chars, live counter), CTA Label (max 20 chars, live counter), and URL; a Mantine `Select` for Open behavior (`New Tab` / `Inline` — the `Inline` option maps to the `open_as = 'popup'` DB value for backwards compatibility); and — only when Inline is selected — a monospace Mantine `Textarea` labeled "Embed Code" (placeholder "Paste your booking tool's popup snippet here") for the `embed_code` value. Switching back to `New Tab` nulls `embed_code` on save. Save validation blocks PATCH when `open_as = 'popup'` and `embed_code` is empty/whitespace ("Embed code is required for inline booking."). Add New prepends an empty editable card to the top of the list. Save and Add both PATCH `/api/admin/sage-parameters` (Add auto-generates `key` from the label, lowercase non-alphanumerics collapsed to `_`; duplicate keys rejected client-side). Delete opens a Mantine `Modal` confirmation and calls `DELETE /api/admin/sage-parameters/[key]`. Surfaces success/error via `@mantine/notifications`. Console logs cover fetch, PATCH dispatch (with `open_as` / `has_embed_code`), success/failure, DELETE, and add-new-card open. |
| `ChatThresholds` | `app/admin/settings/ChatThresholds.tsx` | Mantine client component rendered as the second section on the Settings page (after Parameters), inside `<section aria-labelledby="thresholds-heading">`. Owns the section header (title "Chat Thresholds" + muted subtitle "How long Sage waits before moving a session from In-progress → Active → Abandoned.") and a single `Card` body with two `NumberInput` fields — `chat_in_progress_idle_seconds` (label "In-progress idle threshold", default 300, step 60) and `chat_active_idle_seconds` (label "Active idle threshold", default 86400, step 3600). Both inputs are seconds; helper `description` text translates the defaults to human units. Fetches `/api/admin/tenant-settings` on mount; PATCHes the same route on Save. Validation: both fields must be positive integers and `in_progress < active` — Save button is disabled while invalid or not dirty (`dirty` compares current input against the last saved snapshot). Reset to defaults button (subtle gray) restores 300 / 86400 in the inputs without writing. Save button (filled green, `loading={saving}`). Surfaces success/error via `@mantine/notifications`. Console logs cover fetch, PATCH dispatch, success, failure, and reset. No view/edit toggle — singleton record with always-visible inputs. |
| `BookingCard` (+ `parseBookingCards`, `injectInlineEmbed`) | `src/components/sage/` (`BookingCard.tsx`, `parseBookingCards.ts`) | Tailwind component and parser used by the public visitor chat — extracted out of `Chat.tsx` into `src/components/sage/`. `parseBookingCards(content)` delegates to `createDefaultRegistry()` (`services/chat/ui/v1/registry.ts`): the registry parses every registered marker, returns `[BOOKING: …]` matches as `BookingCardData`, strips `[NAME: …]` markers from prose (not surfaced as cards), strips any trailing incomplete `[MARKER:` fragment still streaming, collapses leftover blank lines, and returns `{ prose, cards }`. The `useSageParameters` hook (`src/components/sage/useSageParameters.ts`) fetches `/api/sage/parameters` on mount, and `SageReply` (`src/components/sage/SageReply.tsx`) matches each parsed card to a parameter by `url`, passing `openAs` + `embedCode` as props. `BookingCard` is a white card with `border border-black/10` + `shadow-sm`, bold label, muted description, a `#2d6a4f` CTA, and — directly below the card — a ref'd inline-embed container (`mt-2 w-full min-h-[700px]`, hidden until first click). CTA element type switches on `openAs`: `<a target="_blank" rel="noopener noreferrer">` for `'new_tab'`; `<button>` for `'popup'` (admin label "Inline") that, on click, reveals the container and calls `injectInlineEmbed(container, embedCode)`. `injectInlineEmbed` re-materializes the snippet into live `<script>` / `<link>` nodes scoped to the target container so script tags actually execute (handles both pure inline JS and HTML fragments with `<script src="...">`). The button disables itself after injection to keep the mount idempotent. If `openAs = 'popup'` and `embedCode` is empty, falls back to new-tab behavior and `console.warn`s. When the *effective* open behavior is `new_tab` (either explicitly or via the empty-`embed_code` fallback), a small muted Tailwind `<p>` renders directly below the card: "Heads up — clicking the button will open in a new tab to complete your booking." — suppressed for the in-chat inline case. |

---

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
  the landing page with a slide-in chat panel layered over it (see "Heirloom
  storefront" under Public Site below).
- **`app/layout.tsx`** — the shared root layout (`ClerkProvider` + `<html>`).
  It imports the global base layer (`app/globals.css` — reset + shared component
  styles, no brand tokens) and reads the `x-sbl` and `x-heirloom` request headers
  (set by middleware), applying `data-palette="inkwell"` to `<html>` only when the
  request is **neither** SBL **nor** Heirloom, so the inkwell palette never bleeds
  into `/secondbrainlabs` or `/heirloom`. `app/favicon.ico` (the App Router
  favicon convention, served as the default icon) is the **2BL** icon.
- **`app/admin/` + `app/(platform)/`** — the Mantine admin and 2BL platform
  admin. They render under `app/layout.tsx` (not under `(jefflougheed)`), so each
  layout imports `app/(jefflougheed)/globals.css` explicitly to keep the shared
  inkwell tokens its pages consume.

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

## jefflougheed.ca Isolation

jefflougheed.ca-only code and assets are isolated from shared/platform code:

- **Components** live in `app/(jefflougheed)/components/` — the self-contained,
  presentational pieces owned solely by the public site: `Footer`,
  `SectionOutcomes`, `SectionWhy`, `SectionCareer`, `SectionTestimonials`,
  `Problem`, `Session`. `page.tsx` imports these via relative `./components/…`.
- **Public assets** live in `public/sage/jefflougheed/` and are referenced as
  `/sage/jefflougheed/…` (favicons, headshots, the ten career logos,
  `ProblemBackground.webp`, `chewing-gum.svg`, `bench.svg`). Next.js only
  serves static files from the **root** `public/` directory — there is no
  route-group-scoped `public/`, so isolation is achieved by namespacing under
  root `public/` rather than moving the folder into `app/(jefflougheed)/`. The
  webmanifest lives at `/sage/jefflougheed/favicons/site.webmanifest` and its
  internal icon `src`s point at `/sage/jefflougheed/favicons/…`.

The following files remain in `src/components/` **intentionally** — they are
coupled to the Sage chat service and cannot move until Phase 3 (chat service
extraction into `services/chat`):

`Hero.tsx`, `Nav.tsx`, `SectionProcess.tsx`, `Chat.tsx`, `sage/*`

Do not move or delete these without explicit instruction from Jeff.

Notes:
- `SectionProcess.tsx` (stays in `src/components/`) imports
  `FEATURED_TESTIMONIALS` from the moved
  `app/(jefflougheed)/components/SectionTestimonials` — a temporary cross-tree
  import that resolves when `SectionProcess` itself moves in Phase 3.
- `public/logos/` deliberately still holds the platform `2blai_logo.svg` and
  the duplicate/variant logos referenced by the orphan `CareerHighlights.tsx`
  — only the specific jefflougheed logos were namespaced.
- The earlier DesignLab logo filename typo is fixed: `SectionCareer`
  references `/sage/jefflougheed/logos/DesignLab_Logo.svg` and the on-disk
  file is spelled to match, so the logo resolves.

---

## Pages

Admin page routes under `app/admin/`. Each page owns its route header
and section scaffolding; data fetching lives in server components or
page-local client components.

| Page | File | Purpose |
|------|------|---------|
| Settings | `app/admin/settings/page.tsx` | Tenant configuration. Renders two sections inside a single `<Stack gap="lg">`: Parameters (`SageParameters` component) and Chat Thresholds (`ChatThresholds` component). |
| Blocks | `app/admin/prompt-studio/blocks/page.tsx` | Server component — fetches all non-deleted blocks for the tenant (including `order`) and renders `BlocksTable`. Table exposes an inline `Order` column: a Mantine `NumberInput` (no stepper, width ~70px) on desktop, and a labeled field on mobile. Values save automatically on blur via `PATCH /api/admin/blocks/[id]` with `{ order }` — no separate save button. Before dispatch, the client checks `items` state for another block of the same `type` with the same `order`; on conflict, a red Mantine notification ("Order number already used by [title] in this type. Please choose a different number.") fires and the save is aborted, reverting the input to its prior value. Console logs cover blur, duplicate-check result, PATCH dispatch, success, failure. |

---

## Public Site (Visitor)

Public-facing components in `/src/components/`. Tailwind + inline
styles (no Mantine on the public side).

| Component | File | Purpose |
|-----------|------|---------|
| `Chat` (Sage overlay + `#chat` anchor section) | `src/components/Chat.tsx` | Full-viewport visitor chat overlay plus the in-page `#chat` anchor section that CTAs into it. Mounted from `app/page.tsx`; toggled via `useSageStore.expand()` / `collapse()`. **Overlay** is `position: fixed; top: 0; height: 100dvh` by default so iOS 17.4+ resizes when the keyboard opens. On iOS, a VisualViewport listener pins the overlay to the visual viewport by setting `overlayRef.current.style.height = vv.height + 'px'` and `style.transform = 'translateY(' + vv.offsetTop + 'px)'` on `resize` / `scroll` (and once on open, to prime). Position is driven by a **compositor `transform`, not `top`** — reflow-free, so the overlay stays glued to the viewport while the keyboard animates instead of lagging/floating to mid-screen (the overlay also carries no `top`/`height` CSS transition). Same listener sets `keyboardOpen` state (`vv.height < window.innerHeight * 0.75`) which drives the tagline opacity. Compact 56px header (`h-14`, `bg-bg/90` backdrop-blur) with a status pip (`h-1.5 w-1.5 rounded-full`, `bg-accent` when `isStreaming`, `bg-accent/35` otherwise) next to a Playfair 22px wordmark; 44×44 SVG close button. Assistant messages render through `SageReply` — typographic block with a 2px `border-accent/35` left rule, `pl-4`, Playfair 18px prose, `max-w-[680px]`, `sage-slide-up` entry animation; **no bubble** (no bg, no border-radius, no shadow). Visitor messages render as right-aligned italic Playfair `<p>`s with `max-w-[560px]` and the `.sage-visitor-msg` class (defined in `app/globals.css`), which applies CSS curly quotes via `::before` / `::after` — the message content string itself never contains the quote glyphs. Empty state **is** the greeting: mode-aware Playfair copy ("Hi, I'm Sage. *What brings you here?*" default, "Ask me anything about *Jeff's work*." question-mode) in the same left-rule card style. First user send populates `messages` and the empty state unmounts. There is no `sendGreeting` — `messages.length === 0` is the canonical greeting state. Body scroll lock freezes the document with `position: fixed` + `top: -scrollY` on open and restores the scroll position (`window.scrollTo`) on close — hardened beyond `overflow: hidden`, which iOS ignores during focused-input auto-scroll, so the page can't scroll under the overlay and `visualViewport.offsetTop` stays stable. Composer tray padding is `pb-[max(12px,env(safe-area-inset-bottom))]`; send button is `bg-accent` `h-11 w-11 rounded-full`; textarea is `bg-bg rounded-xl`. The streaming indicator uses three dots with the `sage-pulse` keyframes and carries `data-sage-streaming` for the reduced-motion guard. Reduced motion is honored at the CSS layer via `@media (prefers-reduced-motion: reduce)` disabling animations on `.sage-animate`, `.sage-visitor-msg`, and `[data-sage-streaming] > *`. Only two intentional inline `style` props remain in the overlay JSX: the tagline `opacity: keyboardOpen ? 0 : 1`, and the per-dot `animationDelay` on the streaming indicator — everything else is Tailwind (`markdownComponents` and `BookingCard` internals excepted). The overlay container sets **no inline color tokens** — it inherits the inkwell palette from `html[data-palette="inkwell"]`, and assistant prose color resolves through `var(--color-text-primary)` via `markdownComponents` (`src/components/sage/markdownComponents.tsx`), which uses palette tokens rather than hardcoded hex. Reads `mode` from `useSageStore`; on mount, `detectModeFromLocation()` parses `?mode=question` from the hash-query or top-level search string and — if `'question'` — calls `expand('question')` to auto-open the overlay. `mode` is read by the `useChatTurn` engine (`services/chat/ui/v1/`) via injected `ChatEngineAccessors` and sent to `/api/sage` on every send/retry so the server appends the question-mode CONTEXT block — the send → create-session → stream → PATCH lifecycle lives in the hook, not in this component. Marker parsing is documented separately under "Marker Syntax"; `SageReply` resolves each parsed card to a `sage_parameters` row by URL match and spreads `openAs` / `embedCode` into `<BookingCard>`. **`#chat` anchor section** (same file) renders: eyebrow "Not Sure Yet?" → headline → lede → green Start/Continue CTA → outlined Book a Session link. The inline 240px transcript preview that used to render when `messages.length > 0` has been removed; the CTA label still toggles "Start a Conversation" / "Continue Conversation" based on `messages.length`. Reveal animation on the anchor section is unchanged. |
| `Hero` | `src/components/Hero.tsx` | **Chat-first hero** — the landing headline ("Hi, I'm *Jeff*."), lede, and `sage-line` sit above an **inline chat surface** (composer + conversation canvas + suggestion chips) in the same `#hero` section. It is a standalone inline chat that **shares session state with the Chat overlay** via `useSageStore` (the two surfaces drive one conversation) but does **not** use `expand()`. The turn engine is the shared `useChatTurn` hook (`services/chat/ui/v1/`), wired via a `useMemo`'d `ChatEngineAccessors` that reads/writes live store state through `useSageStore.getState()`; `submit()`, Enter-to-send (`onKey`), and the suggestion-chip `handleChipClick` all call `turn.send(text)`, the error block's Retry calls `turn.retry()`, and `turn.isError` drives that block. `isStreaming` (store) drives the three-dot `sage-pulse` indicator and disables the composer/chips. Messages render like the overlay: visitor as right-aligned italic Playfair `.sage-visitor-msg`, assistant via `SageReply` (booking cards parsed by `parseBookingCards`, params from `useSageParameters`). `isEngaged = messages.length > 0 && conversationVisible` toggles the `.stage` → `.stage engaged` class; a `close-x` button collapses the canvas (`conversationVisible`), and the 5 suggestion chips render only when not engaged. On mount it registers the textarea via `setComposerRef` and runs `detectModeFromLocation()` — `?mode=question` (hash-query or top-level search) → `setMode('question')` + focuses the composer. **iOS keyboard handling**: a `visualViewport` listener mirrors `vv.height` / `vv.offsetTop` onto the `.chat-surface` via the `--kb-surface-h` / `--kb-surface-y` CSS vars and flips `.chat-surface--kb` when `keyboardOpen` (mobile only — `vv.height` never drops on desktop, so layout is untouched); **no body scroll-lock** (deliberate — `position: fixed` breaks iOS keyboard detection, so the fixed `.chat-surface--kb` overlay masks the page instead). |
| `Nav` | `src/components/Nav.tsx` | Top fixed navigation. Two links from a `LINKS` array: `Schedule` (`#work`) and `Chat` (calls `expand()` on click — default mode). Desktop and mobile Chat entries diverge. **Desktop** uses `.nav-chat-btn` (plain muted uppercase mono text — same color token as Schedule — with padding `8px 16px` and `border-radius: 8px`; no visible border pre-trigger). A Nav-level `IntersectionObserver` (threshold 0.15) watches the WhyMe section root via `[data-nav-trigger="how-i-operate"]`; on first intersection, `chatBorderDrawn` flips to `true`, the observer disconnects, and the `.nav-chat-btn--drawn` modifier triggers a 700ms ease-out two-stage CSS animation that traces a 1px accent-green border clockwise from top-left (top+right 0–350ms, bottom+left 350–700ms). One-shot: border stays drawn for the rest of the session; scrolling back up does not reset it. **Mobile hamburger drawer** still uses the pre-existing `.nav-chat-pill` filled green pill (`#2d6a4f` bg, white text, `border-radius: 999px`; hover swaps to `var(--color-accent-hover)`; `:focus-visible` adds a 2px accent outline; padding `14px 24px` with top margin and `align-self: flex-start`) — a separate follow-up task will overhaul mobile. Schedule renders as a plain text link, unchanged. Class definitions live in `app/globals.css`. |
| `Work` | `src/components/Work.tsx` | Two service cards (Coaching / Embedded Execution) each with an inline Calendly widget that toggles open via local state and is initialized via the global Calendly script (loaded once on mount). Below the cards: "Still have questions? Click here." line. The "Click here" link uses `href="/#chat?mode=question"` (decorative — preserves the deep-linkable URL for copy/share) and an `onClick` that `preventDefault`s, calls `history.pushState` to update the URL bar (only when the hash isn't already `#chat?mode=question`), then calls `expand('question')` from the Sage store. The overlay opens directly in question mode — no scroll handoff to the chat anchor section. |

### Discovery-call link cleanup

The free 15-minute discovery call is removed as a **user-facing link**
on the public site — `Work.tsx`'s "Click here" routes to question mode
instead. The discovery call is **not** removed from Sage's master
system prompt; Sage may still offer it at her discretion during a
conversation. Remaining intentional references:

- `services/prompt/sage-prompt.ts` — `DEFAULT_SYSTEM_PROMPT` pricing + behavior + booking-link sections
- `src/components/Session.tsx` — `handleDiscoveryClick` popup invocation and the "Start with a free 15-minute call →" link

Do not remove these without explicit instruction.

### Heirloom storefront (chat)

The Heirloom product surface lives entirely under `app/heirloom/` (Tailwind +
the `[data-brand="heirloom"]` palette — no Mantine, isolated from the Sage
visitor chat in `src/components/`). It keeps its own `useReducer` store and UI
components, but its turn engine is the **shared `useChatTurn` hook**
(`services/chat/ui/v1/`, PR #44) — the same engine jefflougheed consumes. The
Heirloom-local `app/heirloom/lib/stream.ts` reader was deleted; the hook owns
transport via the shared `readDataStream` (`services/chat/server/stream-utils.ts`).

| Component | File | Purpose |
|-----------|------|---------|
| `HeirloomPage` (app root) | `app/heirloom/page.tsx` | `'use client'` root. Wraps everything in `ChatProvider` and renders `<LandingPage>` with a slide-in chat panel layered over it. The panel is always mounted and slides off-canvas (`translate-x-full pointer-events-none`) when closed; a `bg-black/50 backdrop-blur-sm` backdrop renders only while open. **Escape** key and **backdrop click** both dispatch `CLOSE_CHAT`. Panel carries `role="dialog"` / `aria-modal` / `aria-hidden`. |
| `chatStore` (`ChatProvider`, `useChatStore`, `Message`) | `app/heirloom/components/store/chatStore.tsx` | `useReducer` context. State: `messages`, `hasStarted`, `isSidebarExpanded`, `isLoading`, `isChatOpen`, `sessionId`. Actions: `SEND_MESSAGE`, `ADD_ASSISTANT_MESSAGE`, `UPDATE_LAST_ASSISTANT`, `SET_LOADING`, `TOGGLE_SIDEBAR` / `SET_SIDEBAR`, `OPEN_CHAT` / `CLOSE_CHAT`, `SET_SESSION_ID`. `sendMessage(content)` is the shared engine's `useChatTurn().send` (PR #44): the provider implements `ChatEngineAccessors` that adapt the reducer (building Heirloom `Message`s with `crypto.randomUUID()` ids + `Date` timestamps, dispatching `SEND_MESSAGE` / `ADD_ASSISTANT_MESSAGE` / `UPDATE_LAST_ASSISTANT` / `SET_LOADING` / `SET_SESSION_ID`), and keeps authoritative `messagesRef` / `sessionIdRef` so the post-stream PATCH reads the full transcript synchronously (the empty assistant message is deferred to the first token to preserve the typing indicator). The context also exposes the engine's `isError`. |
| `ChatHero` | `app/heirloom/components/chat/ChatHero.tsx` | Panel body: `Sidebar` + a column with `ChatHeader`, the message area (`MessageList` once `hasStarted`, else the empty-state greeting **"What's a story worth keeping?"**), and `ChatInput`. |
| `ChatHeader` | `app/heirloom/components/chat/ChatHeader.tsx` | "Your Story" dropdown + Account / Close `IconButton`s (Close dispatches `CLOSE_CHAT`). |
| `ChatInput` | `app/heirloom/components/chat/ChatInput.tsx` | Auto-growing textarea, Enter-to-send (Shift+Enter newline), `ArrowUp` send button (disabled when empty or loading). Calls `sendMessage`. No AI disclaimer. |
| `MessageList` | `app/heirloom/components/chat/MessageList.tsx` | Renders messages (assistant = `Bot`-icon avatar + left bubble, user = right bubble, no avatar) and a bouncing-dots typing indicator while `isLoading`; auto-scrolls to bottom. Assistant prose runs through the marker registry (`createDefaultRegistry()`), so `[BOOKING:]` / `[NAME:]` markers are stripped rather than shown as raw text (Heirloom has no booking-card UI yet, so cards are dropped — only prose shows); empty assistant bubbles are skipped, and the engine's `isError` renders an on-brand error bubble. |
| `Sidebar` | `app/heirloom/components/chat/Sidebar.tsx` | Collapsible nav (`w-12` ↔ `w-64`, toggled via `TOGGLE_SIDEBAR`). Nav items (New Chat / Search / Conversations / Dashboard) + a "Recent" section backed by an **empty** list (no fake history, no user-profile footer). |
| `Avatar` / `IconButton` / `Button` | `app/heirloom/components/ui/` | Tailwind UI primitives ported from the legacy repo, styled with the Heirloom tokens. |

Tenant note: `/api/sage` resolves the tenant from the host. Until a Heirloom
tenant + `master_prompt` is configured, Heirloom chat falls back to Sage's
`DEFAULT_SYSTEM_PROMPT` (it streams, but answers as Sage). Wiring a Heirloom
tenant/prompt is a follow-up.

---

## Utilities

### Auth service (`services/auth/`)

Auth-context resolution, tenant resolution, user sync, and the Supabase client
factories live in the shared `services/auth/` layer (imported as
`@/services/auth/*`). Both `app/` and `src/` may depend on this layer; it is the
intended home for cross-cutting auth/DB plumbing.

| Helper | File | Purpose |
|--------|------|---------|
| `getAuthContext` | `services/auth/get-auth-context.ts` | Resolves the current Clerk user to their Supabase `owner_id` and `tenant_id` via the `users.clerk_id` → `tenant_users.user_id` lookup. Multi-tenant users resolve the active tenant by request Host (falls back to `DEFAULT_ADMIN_TENANT_ID`, then the first membership). Throws `Unauthorized` / `User not found` / `Tenant not found` on failure. Used by every authenticated admin API route for tenant scoping. |
| `getTenantFromRequest` | `services/auth/get-tenant-from-request.ts` | Resolves `tenant_id` from the `Host` header of an anonymous public request. Prefers the exact host (so product subdomains like `heirloom.2bl.ai` resolve to their own tenant), then the registrable root (e.g. `app.jefflougheed.ca` → `jefflougheed.ca`), filters dev hosts (localhost, `*.local`, `127.0.0.1`), queries `tenants.domain` for a match. Returns `tenant_id` string or `null`. Used by `/api/sage/route.ts` for anonymous visitor chat — falls back to `DEFAULT_SYSTEM_PROMPT` on null. |
| `resolveTenantIdFromHost` / `normalizeHost` | `services/auth/resolve-tenant-from-host.ts` | Pure full-host exact-match helper (does NOT collapse subdomains) used by `getAuthContext` for multi-tenant host resolution. Unit-tested in `services/auth/resolve-tenant-from-host.test.ts`. |
| `syncUser` | `services/auth/sync-user.ts` | Upserts the current Clerk user into the Supabase `users` table on `clerk_id` conflict; returns the Supabase UUID or null. Called from `app/admin/layout.tsx`. |
| `getAdminClient` | `services/auth/supabase-admin.ts` | Service-role Supabase client (server-only, bypasses RLS). The most widely imported factory — used by every admin route, the public Sage routes, and `services/chat/server/*`. |
| `createClient` | `services/auth/supabase.ts` (browser) / `services/auth/supabase-server.ts` (SSR cookie-aware) | Anon-key Supabase client factories. |
| `AdminUserProvider` / `useAdminUserId` | `services/auth/admin-user-context.tsx` | `'use client'` React context exposing the synced Supabase user id to the admin tree. Mounted in `app/admin/layout.tsx`. (Moved from `src/context/admin-user.tsx`.) |

### Prompt service (`services/prompt/`)

All prompt and block logic lives in the shared `services/prompt/` layer
(imported as `@/services/prompt/*`, or via the `services/prompt/index.ts`
barrel). Server-only. The `app/api/admin/{prompt,blocks}/*` route handlers are
thin consumers — auth, request validation, and HTTP response mapping only; the
data-access and business logic live here. Block CRUD / compile / save functions
return a discriminated `{ ok: true; data } | { ok: false; status; error }`
result so routes preserve their exact status codes.

| File | Exports | Purpose |
|------|---------|---------|
| `compiler.ts` | `getSystemPrompt`, `QUESTION_MODE_CONTEXT`, `DEFAULT_SYSTEM_PROMPT` (re-export) | Runtime base-prompt assembly: highest-version `master_prompt` row, falls back to `DEFAULT_SYSTEM_PROMPT`. Consumed by the chat orchestrator via the thin `services/chat/server/prompt.ts` re-export. |
| `compile.ts` | `compilePrompt(tenantId)` | Compiles active blocks (guardrail → identity → process → knowledge → escalation; `order`-aware) into `master_prompt`, archiving the prior version to `master_prompt_history`. Backs `POST /api/admin/prompt/compile`. |
| `blocks.ts` | `listActiveBlocks`, `updateBlock`, `createBlock`, `duplicateBlock` (+ `AuthScope`, `BlocksResult`, `BlockUpdate`, `CreateBlockInput`) | Block data-access against `blocks` (and the `content` / `chat_sessions` rows the create/duplicate flows touch). Backs the `app/api/admin/blocks/*` routes (except `blocks/chat`, a streaming composer with no block-table access). |
| `save.ts` | `saveMasterPrompt(tenantId, prompt, checkResult)` | Manual versioned master-prompt save (legacy path). Backs `POST /api/admin/prompt/save`. |
| `safety.ts` | `reviewBlockBody`, `reviewMasterPrompt` (+ `CheckResult`, `CheckIssue`) | LLM safety review — single block (fail-open) backs `POST /api/admin/prompt/compile/check`; whole prompt backs the legacy `POST /api/admin/prompt/check`. |
| `block-types.ts` | `BLOCK_TYPES`, `BlockType`, `TYPE_COLORS`, `TYPE_LABELS`, `TYPE_COMPILE_ORDER`, `formatTypeBadgeLabel` | Block taxonomy + badge/colour/compile-order maps. Consumed by the admin Blocks UI (`components/admin/content/*`, `BlocksTable`). (Moved from `src/lib/blockTypes.ts`.) |
| `block-order.ts` | `isOrdered`, `orderPrefix` | `order`-column helpers for the compile sort + Blocks UI. (Moved from `src/lib/blockOrder.ts`.) |
| `tokenize.ts` | `tokensFor`, `CHARS_PER_TOKEN` | `ceil(chars/4)` token approximation used by compile + the fullness meters. (Moved from `src/lib/tokenize.ts`.) |
| `sage-prompt.ts` | `DEFAULT_SYSTEM_PROMPT` | The fallback Sage system prompt. Imported + re-exported by `compiler.ts`. (Moved from `src/lib/sage-prompt.ts`.) |
| `index.ts` | barrel | Re-exports the public surface above. |

Note: the `readDataStream` data-stream reader (admin composer transport) moved to
`services/chat/server/stream-utils.ts` (named to avoid colliding with the chat
`stream.ts`); it is consumed by `app/admin/prompt-builder/page.tsx`,
`components/admin/PromptBuilderChat.tsx`, and `services/chat/ui/v1/useChatTurn.ts`.

### CRM service (`services/crm/`)

Session state machine, session lifecycle, and inbound-chat triage live in the
shared `services/crm/` layer (imported as `@/services/crm/*`, or via the
`services/crm/index.ts` barrel). Server-only except `status.ts`, which is a
pure helper safe to import (type-only) from client components.

| File | Exports | Purpose |
|------|---------|---------|
| `status.ts` | `deriveSessionStatus` (+ `SessionStatus`, `SessionStatusThresholds`, `DeriveSessionStatusInput`) | Pure function — no DB calls. `({ updatedAt, thresholds: { chat_in_progress_idle_seconds, chat_active_idle_seconds }, now }) => 'in_progress' \| 'active' \| 'abandoned'`. Returns `'in_progress'` when `idle < chat_in_progress_idle_seconds`, `'active'` when below the active threshold, else `'abandoned'`. The PATCH route writes `status = 'in_progress'` on every visitor message; this computes the forward transitions at read time so the displayed status reflects elapsed time without a background sweep. Consumed by `getInboundChats` and `app/admin/sessions/[id]/page.tsx`. |
| `session.ts` | `handleSessionFinish`, `detectVisitorNameMarker` | Chat `onFinish` detection flows (server-only): token-usage accounting, calendar-offer detection, and `[NAME:]`-marker first-name capture (`detectVisitorNameMarker` → titlecase → `isPlausibleName` → persist to `chat_sessions.visitor_name`). Name capture is **marker-only** — the Haiku extractor was removed in PR #46. No-ops when `sessionId` is null. Consumed by the chat orchestrator (`services/chat/server/index.ts`); imports the `TokenUsage` contract type from `services/chat/server/types`. |
| `sessions.ts` | `createSession`, `updateSession` (+ `SessionResult`, `SessionUpdateInput`) | Anonymous visitor session writes. Server-role client, scoped by both `id` AND host-derived `tenant_id` (cross-tenant IDOR guard; cross-tenant id → 404). Backs `POST /api/sessions` and `PATCH /api/sessions/[id]`, which are thin (tenant resolution + parsing + response mapping). |
| `inbound.ts` | `getInboundChats` (+ `ChatSession`) | Inbound Chats triage: fetch the tenant's prospect sessions (newest first), resolve idle thresholds, derive each row's read-time status. Backs the `app/admin/page.tsx` Inbound Chats list (thin consumer). |
| `index.ts` | barrel | Re-exports the public surface above. |

### Chat UI service (`services/chat/ui/v1/`)

The shared client-side chat engine — the marker registry + the `useChatTurn`
turn hook — consumed by **both** the jefflougheed visitor chat (`Chat.tsx`,
`Hero.tsx`) and the Heirloom chat (`app/heirloom/`). Extracted in PRs #42–46.
The type + registry modules are server-safe (no React); `useChatTurn.ts` is a
`'use client'` hook and is intentionally NOT re-exported from the barrel, so
server consumers (e.g. the admin transcript renderer via `parseBookingCards`)
can import the registry without pulling a client module.

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `MarkerType`, `ParsedMarker`, `MarkerParseResult`, `MarkerDispatch`, `MarkerDefinition`, `MarkerRegistry`, `ChatEngineAccessors`, `UseChatTurnOptions`, `UseChatTurnReturn` | Type contracts for the marker registry and the turn hook. No React. `ChatMessage` / `ChatMode` are imported from `services/chat/server/types`, not redefined. |
| `registry.ts` | `createMarkerRegistry`, `createDefaultRegistry`, `BOOKING_MARKER`, `NAME_MARKER` | Concrete marker registry. `createMarkerRegistry()` parses content into `{ prose, markers }`, stripping every registered marker (and its trailing incomplete fragment) from prose, collapsing blank lines. `createDefaultRegistry()` preloads every display-stripped marker. `BOOKING_MARKER` (`[BOOKING: …]`, 4 fields, `dispatch: 'client'`); `NAME_MARKER` (`[NAME: firstname]`, 1 field, `dispatch: 'server'`). |
| `useChatTurn.ts` | `useChatTurn` | Store-agnostic turn engine (`'use client'`). Takes injected `ChatEngineAccessors` (`getMessages` / `addMessage` / `updateLastMessage` / `setStreaming` / `setSessionId` / `getSessionId` / `getMode?`) and owns one turn end-to-end: append user message → lazily create a session (`POST /api/sessions`) → stream from `/api/sage` (via the shared `readDataStream`) → persist the transcript (`PATCH /api/sessions/[id]`, `visitorName: null`). Returns `{ send, retry, isStreaming, isError }`. jefflougheed (Zustand `useSageStore`) and Heirloom (`useReducer`) both consume it by wrapping their store in accessors. |
| `index.ts` | barrel | Re-exports the type contracts + the registry runtime (`createMarkerRegistry`, `createDefaultRegistry`, `BOOKING_MARKER`, `NAME_MARKER`). `useChatTurn` is imported directly from its module, not the barrel. |

### Other shared helpers (`src/lib/`)

| Helper | File | Purpose |
|--------|------|---------|
| `useSageStore` | `store.ts` | Zustand store for the public visitor chat. State: `messages`, `isExpanded`, `mode: 'question' \| null`, `hasGreeted`, `visitorName`, `isStreaming`, `sessionId`. Actions: `expand(mode?: 'question')` (sets both `isExpanded: true` and `mode: mode ?? null` atomically), `collapse()`, `addMessage`, `updateLastMessage`, `setVisitorName`, `setGreeted`, `setStreaming`, `setSessionId`, `reset()` (clears mode along with everything else). Consumed by `Chat`, `Hero`, `Nav`, and `Work`. Because `expand` takes an optional parameter, do not pass it directly as an event handler — wrap as `() => expand()` so React does not forward the `MouseEvent` into the `mode` slot (TS error). |

---

## API Routes

Admin routes all call `getAuthContext()` first and scope Supabase
queries by `tenant_id`. Public routes resolve tenant via the Host
header. The prompt + blocks routes below are **thin consumers** of the
`services/prompt/` service (see Utilities) — they own auth, validation, and
response mapping; the data-access and business logic live in the service.

### Prompt compilation

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/prompt/compile` | POST | Compiles all active blocks for the authenticated tenant into the master prompt. Orders by compile sequence (guardrail → identity → process → knowledge → escalation); within each type, blocks with `order > 0` come first ascending by order, then blocks with `order` = 0 or null come last ordered by title ascending. Logs the final compile sequence (title, type, order) before joining. Joins bodies with double newlines. Archives the previous `master_prompt` row to `master_prompt_history` and increments the version. Returns `{ success, version, tokenCount, content, updatedAt }`. |
| `/api/admin/prompt/compile/check` | POST | LLM-based safety review of a single block body. Takes `{ body: string }`, returns `{ ok: boolean, issues: [{ description: string, offendingText: string \| null }] }`. Server-side verbatim guard: every returned `offendingText` is validated against `body.includes()` and nulled if not a real substring. Fails open to `{ ok: true, issues: [] }` on any error so the save flow is never blocked. |
| `/api/admin/prompt/save` | POST | Manual save path for the master prompt (legacy). Takes `{ prompt, checkResult }`, tenant-scoped, archives previous version to history, increments version. |
| `/api/admin/prompt/check` | POST | Safety check for an entire system prompt (legacy, used by the old prompt save flow). Returns `{ pass, issues }`. |

### Blocks

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/blocks` | GET | Returns active blocks (`id, title, type, body, is_default`) for the authenticated tenant. Filters `active = true`, ordered by type then title. Used for the Composer's existing-blocks context. |
| `/api/admin/blocks/[id]` | PATCH | Updates block `status`, `body`, or `order`. Validates status against `'active' \| 'disabled' \| 'deleted'`; `order` must be an integer. Keeps the legacy `active` boolean in sync with `status` so the Composer GET doesn't surface disabled or deleted blocks. Tenant-scoped via `.eq('tenant_id', authCtx.tenant_id)`. |
| `/api/admin/blocks/save` | POST | Creates a new block (Composer draft confirmation flow + the manual New Block modal). **Body is the only required field**; `title` / `type` / `topic_id` are optional and stored null when omitted (400 only when `body` is missing). |
| `/api/admin/blocks/chat` | POST | Streaming chat route for the Composer. Accepts `{ type, topic, content, messages, documentContext?, existingBlocks? }`. Returns a Vercel AI SDK data stream. |

### Sage Parameters

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/sage-parameters` | GET | Returns all `sage_parameters` rows (`id, tenant_id, key, value, label, description, cta_label, url, open_as, embed_code, updated_at`) for the authenticated tenant, ordered by `key`. 401 when `getAuthContext()` fails. |
| `/api/admin/sage-parameters` | PATCH | Upserts a single parameter for the authenticated tenant. Accepts `{ key, label, description?, cta_label?, url?, value?, open_as?, embed_code? }` (strings except `embed_code` which may be string or null; `description` max 60 chars, `cta_label` max 20 chars; `open_as` one of `'new_tab' \| 'popup'`, default `'new_tab'`). Upsert uses `onConflict: 'tenant_id, key'` and stamps `updated_at` on write. 401 when `getAuthContext()` fails, 400 on invalid body. |
| `/api/admin/sage-parameters/[key]` | DELETE | Deletes the parameter matching `{ tenant_id, key }` for the authenticated tenant. 401 when `getAuthContext()` fails, 400 on missing key, 500 on Supabase error. |

### Tenant Settings

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/tenant-settings` | GET | Returns `{ chat_in_progress_idle_seconds, chat_active_idle_seconds }` for the authenticated tenant from the `tenants` row. 401 when `getAuthContext()` fails, 404 when the tenant row is missing, 500 on Supabase error. Consumed by the `ChatThresholds` component on the Settings page. |
| `/api/admin/tenant-settings` | PATCH | Updates the two chat-threshold columns on the authenticated tenant's `tenants` row. Accepts `{ chat_in_progress_idle_seconds: number, chat_active_idle_seconds: number }`. Validates both are positive integers and `chat_in_progress_idle_seconds < chat_active_idle_seconds` before writing; 400 on validation failure. 401 when `getAuthContext()` fails, 500 on Supabase error. Returns the persisted shape on success. |

### Content / Assets

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/assets/upload` | POST | Multipart upload for documents (PDF, DOCX, TXT). Extracts text via Anthropic (PDF) or mammoth (DOCX) or direct Buffer read (TXT), inserts a `content` row with `type: 'document'`, uploads the original binary to the Supabase Storage `assets` bucket at `{tenant_id}/{content_id}/{filename}`, and updates the content record with the storage path. |
| `/api/admin/content` | POST | Creates a content row from structured input. |
| `/api/admin/content/[id]` | GET | Returns a single content record by id, tenant-scoped. Used to fetch uploaded document raw text. |
| `/api/admin/topics` | GET, POST | Lists and creates topics for the authenticated tenant. |

### Public

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sage` | POST | Public visitor chat. Resolves tenant via `getTenantFromRequest(req)`, reads the highest-version `master_prompt` row for that tenant, and — when a tenant is resolved — also fetches all `sage_parameters` rows for that tenant and appends a "Booking cards" section to the system prompt containing one `[BOOKING: label \| description \| cta_label \| url]` line per parameter. Section is omitted when no parameters exist. Also accepts an optional `mode` field in the request body; when `mode === 'question'`, appends the `QUESTION_MODE_CONTEXT` string to the end of the system prompt (after the booking section) so Sage skips the name-ask/discovery phase and answers directly. The master prompt content itself is never modified — question mode is additive context only. All other modes (absent, unknown) leave the prompt unchanged. Streams the Anthropic response. Falls back to `DEFAULT_SYSTEM_PROMPT` when no tenant is resolved or no master_prompt row exists. |
| `/api/sage/parameters` | GET | Public read for the visitor chat renderer. Resolves tenant via `getTenantFromRequest(req)` and returns `[{ key, label, description, cta_label, url, open_as, embed_code }]` for that tenant (no admin fields, no `value`). Returns `[]` when no tenant is resolved or on DB error — never 4xx/5xx so client rendering stays resilient. Consumed by `src/components/Chat.tsx` to resolve `open_as` / `embed_code` for each parsed `[BOOKING: ...]` card by URL match. |

---

## Marker Syntax

Sage emits structured **markers** in bracket syntax that the chat parses at
render time. The marker registry (`services/chat/ui/v1/registry.ts`) is the
canonical parser; each marker has a **dispatch surface**:

- **`client`** — rendered into UI (e.g. `[BOOKING:]` → a booking card).
- **`server`** — persisted server-side in `onFinish` (e.g. `[NAME:]` →
  `chat_sessions.visitor_name`); never rendered.

**Two rules hold for every marker regardless of dispatch:**
- It is **stripped from displayed prose client-side** — a `server` marker is
  persisted, not shown, but it must never leak as raw text. Client render paths
  (`parseBookingCards`, Heirloom `MessageList`) use `createDefaultRegistry()`,
  which preloads every marker.
- A **trailing incomplete `[MARKER:` fragment still streaming** is stripped, so
  a half-open marker never flashes as prose.

### `[BOOKING: label | description | cta_label | url]` — dispatch `client`

- One card per line, on its own line at the end of the assistant message —
  never inline, never mid-message.
- `label`, `description`, `cta_label`, `url` correspond to the
  `sage_parameters` columns of the same name.
- **Server injection** (`services/chat/server/booking.ts`, via `/api/sage`):
  when a tenant is resolved, the route fetches its `sage_parameters` rows and
  appends a "Booking cards" section to the system prompt — one `[BOOKING: ...]`
  line per parameter. Omitted when the tenant has no parameters.
- **Client render**: the registry returns each completed match as
  `BookingCardData`; prose renders via `ReactMarkdown` and each card renders as
  a `BookingCard` (Tailwind, white background, `#2d6a4f` CTA) below the prose in
  the assistant-aligned column.

### `[NAME: firstname]` — dispatch `server`

- Captures the visitor's first name. **Server detection**:
  `detectVisitorNameMarker` (`services/crm/session.ts`) scans the final
  assistant message in `handleSessionFinish`, titlecases, runs `isPlausibleName`,
  and persists to `chat_sessions.visitor_name`. Stripped from prose client-side
  (not rendered). **Name capture is marker-only** — the Haiku extractor was
  removed in PR #46.

**Open behavior** (`open_as` / `embed_code`): The bracket syntax only
carries `label | description | cta_label | url` — `open_as` and
`embed_code` are intentionally excluded (embed snippets contain HTML/JS
with characters that'd break pipe delimiting, and we don't want the LLM
copying them verbatim). Instead, Chat.tsx fetches `/api/sage/parameters`
on mount and matches each parsed card to a parameter by `url`:
- `open_as = 'new_tab'` (default): CTA renders as an `<a target="_blank" rel="noopener noreferrer">`.
- `open_as = 'popup'` (admin label "Inline") with non-empty `embed_code`:
  CTA renders as a `<button>`, and directly below the card there is a
  hidden ref'd container (`mt-2 w-full min-h-[700px]`). On click, the
  container is revealed and `injectInlineEmbed(container, embedCode)`
  re-materializes the snippet into live `<script>` / `<link>` nodes
  scoped to that container (setting `innerHTML` alone does not execute
  `<script>` tags). Handles both pure inline JS and HTML-with-
  `<script src="...">` fragments (e.g. Calendly's inline-widget
  snippet). The button disables itself after injection so subsequent
  clicks don't remount the widget.
- `open_as = 'popup'` with empty `embed_code`: falls back to new-tab
  behavior and `console.warn`s.

**Terminology note**: The DB value is still `'popup'` for historical
reasons, but the admin label and visitor-facing behavior are both
"Inline" — the embed renders directly below the booking card, not in a
popup overlay. Renaming the DB value would require a migration; the
label-only rename keeps the column untouched.

---

## Database Schema

All tables are multi-tenant. Every data access must respect `tenant_id`.
Row Level Security is enforced at the Supabase layer.

| Table | Key Columns |
|-------|-------------|
| `tenants` | id, parent_id, name, slug, type, settings, domain (text), chat_in_progress_idle_seconds (integer NOT NULL default 300 — idle threshold in seconds before an `in_progress` chat flips to `active`), chat_active_idle_seconds (integer NOT NULL default 86400 — idle threshold in seconds before an `active` chat flips to `abandoned`) |
| `tenant_users` | tenant_id, user_id, role |
| `users` | id, clerk_id, email, name |
| `blocks` | id, topic_id, owner_id, tenant_id, type, title, body, active, status (text default 'active': 'active' \| 'disabled' \| 'deleted'), order (integer, nullable — actively used: within each type, blocks with `order > 0` sort ascending by order, blocks with `order` = 0 or null sort last by title ascending; consumed by `/api/admin/prompt/compile` and the Blocks page inline Order input), is_default (bool default false), default_edited_at (timestamptz), default_edited_by (uuid references users(id)), default_action (text: 'edited' \| 'deleted'), default_acknowledged (bool default false), default_acknowledged_at (timestamptz), created_at (timestamptz), updated_at (timestamptz NOT NULL default now() — auto-set on every UPDATE via the `blocks_updated_at_trigger` Postgres trigger; do not write client-side), updated_by (uuid references users(id), nullable — application-managed; PATCH `/api/admin/blocks/[id]` stamps it from `authCtx.owner_id` on every write; null for legacy rows) |
| `topics` | id, tenant_id, type, name |
| `content` | id, owner_id, tenant_id, block_id, type, name, raw, storage_path |
| `chat_sessions` | id, tenant_id, visitor_name, messages, status, message_count (integer, GENERATED ALWAYS AS `jsonb_array_length(messages)` STORED — read-only, always reflects messages array length), session_type (text default 'prospect': 'prospect' \| 'composer' \| 'client'), session_subtype (text nullable: 'block' \| 'wizard'), block_id (uuid references blocks(id)), reviewed (boolean NOT NULL default false — owner-set triage flag indicating whether Jeff has reviewed this chat), input_tokens (integer NOT NULL default 0 — cumulative input tokens consumed by this session, visitor + system; incremented server-side in `onFinish` via `persistTokenUsage` from the main `streamText` turn — the Haiku name-extractor was removed in PR #46), output_tokens (integer NOT NULL default 0 — cumulative output tokens generated by Sage in this session; incremented from the same `persistTokenUsage` helper), calendar_offered (boolean NOT NULL default false — flips to true the first time Sage emits a booking-card line or a raw `calendly.com` URL in the streamed response; set server-side from `/api/sage/route.ts` `onFinish` via `scanForCalendarOffer` + `persistCalendarOffered`, pre-checked to short-circuit once true), corrective_feedback (text, nullable — non-canonical, slated for retirement when reinforcement loop ships; canonical store is the `chat_corrections` table), email (text, nullable — visitor email captured on a chat session, e.g. Heirloom account creation / follow-up; added 2026-05-25, existing rows + anonymous write path unaffected) |
| `chat_corrections` | id, session_id, tenant_id, block_id, jeff_note. Documented and exists in DB but currently unused — reserved for the reinforcement loop sprint. |
| `do_not_engage` | id, owner_id, tenant_id, content, version |
| `master_prompt` | id, tenant_id, content, version, safety_check_result, updated_at (timestamptz), last_safety_check (timestamptz), key (text, nullable — supports multiple prompt engines per tenant differentiated by key, e.g. 'base' / 'editor' / 'onboarding'; existing rows with `key` = null are unaffected. Unique constraint `master_prompt_tenant_key_unique` on (tenant_id, key)) |
| `master_prompt_history` | id, prompt_id, tenant_id, content, version |
| `sage_parameters` | id (uuid), tenant_id (uuid), key (text), value (text — legacy, not surfaced in UI), label (text — card title), description (text, max 60 chars — card subtitle), cta_label (text, max 20 chars — button text), url (text — booking URL), open_as (text default 'new_tab': 'new_tab' \| 'popup' — controls how the CTA opens on the visitor chat booking card), embed_code (text, nullable — JS/HTML snippet executed on click when `open_as = 'popup'`; ignored otherwise), updated_at (timestamptz). Unique constraint on (tenant_id, key). |
| `tenant_model_config` | tenant_id (uuid), provider (text default 'anthropic'), model_id (text — primary chat model), model_id_fallback (text — circuit-breaker fallback), max_tokens (integer default 1000), rate_limit_requests_per_hour (integer default 100). Per-tenant model configuration; `services/chat/server/stream.ts` `resolveModelConfig()` reads it when a row exists, falling back to code defaults otherwise. Added 2026-05-23. |
| `tenant_branding` | tenant_id (uuid, FK → tenants) plus per-tenant branding fields (logo, palette/colours, fonts). ⚠️ Exact column list to be confirmed from Studio. Per-tenant theming so each storefront/admin surface can be styled from data rather than hardcoded tokens. Added 2026-05-24. |
| `artifacts` | id (uuid, PK), tenant_id (uuid, FK → tenants), user_id (uuid, FK → users), session_id (uuid, FK → chat_sessions), type (text — e.g. 'memory' for Heirloom; general-purpose across tenants), title (text), body (text), metadata (jsonb), status (text: 'draft' \| 'published'), created_at (timestamptz), updated_at (timestamptz). Created in Studio 2026-05-25; **not yet wired to chat** (pending PR). |
| `artifact_media` | id (uuid, PK), artifact_id (uuid, FK → artifacts), type (text), url (text), filename (text), mime_type (text), size (integer), created_at (timestamptz). Media attached to an `artifact`. Created in Studio 2026-05-25; **not yet wired to chat** (pending PR). |

**Deployment note — tenant_id backfill required**: `master_prompt` and
`master_prompt_history` rows must have `tenant_id` populated before
tenant-scoped reads return data. Routes that scope by `tenant_id`
(notably `/api/sage/route.ts`, `/api/admin/prompt/save/route.ts`, and
`/api/admin/prompt/compile/route.ts`) will silently fall back to
`DEFAULT_SYSTEM_PROMPT` (Sage public chat) or treat the tenant as
having no existing prompt (admin save/compile) if existing rows were
inserted before the column was enforced. Backfill existing rows on
deploy.

### Block Types

| Type | Purpose |
|------|---------|
| `identity` | Identity & Voice — who Sage is, tone, personality |
| `knowledge` | Factual context about the business, owner, services |
| `guardrail` | Rules and constraints on Sage's behavior |
| `process` | Step-by-step instructions for how Sage should handle situations |
| `escalation` | When and how to route to a human or off-ramp |

**Compile order**: Types are compiled into the master prompt in this
fixed order: guardrail (1st), identity (2nd), process (3rd), knowledge
(4th), escalation (5th). Within each type, blocks with `order > 0` come
first ascending by `order`; blocks with `order` = 0 or null come last,
ordered by title ascending. This order is enforced in
`/api/admin/prompt/compile` and encoded in `BlocksTable.tsx`
`TYPE_LABELS` — do not change without updating both.

---

## Definition of Done

A task is complete when all of the following are true:

- [ ] Feature works as specified
- [ ] Mobile responsive verified
- [ ] Test plan written before implementation and passing
- [ ] No design system inconsistencies (Mantine admin / Tailwind public)
- [ ] Accessibility checked — semantic HTML, keyboard nav, color contrast
- [ ] Error states handled with on-brand messaging
- [ ] Performance targets not regressed
- [ ] No TypeScript errors (strict mode)
- [ ] Documentation updated — README and/or PRD reflect the change
- [ ] Branch pushed and ready for review

---

## Known Gaps

Tracked, not yet addressed. See `ARCHITECTURE_OVERVIEW.md` and
`SERVICEMIGRATION.md` for the full picture.

- **`services/payments/` not created.** Stripe Connect work is deferred; not
  even a scaffold exists yet.
- **Chat-UI strangle — engine extracted, visual components pending.** The
  engine, marker registry, `useChatTurn` hook, and type contracts moved to
  `services/chat/ui/v1/` (PRs #42–46), and `src/lib/sage.ts` was deleted. The
  remaining **visual** components stay in `src/` as consumers of the hook:
  `src/components/Chat.tsx`, `Hero.tsx`, `src/components/sage/*`, and
  `src/lib/store.ts` (`useSageStore`). These are still the source of the
  remaining `app → src` import-boundary warnings, which is why the
  `boundaries/element-types` rule stays at `warn`.
