# CLAUDE.md — Natural Resource / Sage Platform

This file is read at the start of every Claude Code session. These principles
are non-negotiable. Apply them to every task. If you cannot follow a principle
on a given task, say so explicitly before proceeding — do not silently skip it.

**This file must stay current.** If the stack, schema, or principles change,
updating CLAUDE.md is part of the Definition of Done for that change — not a
follow-up task.

---

## Principles

###Marker fallback principle###
Never make a business-critical outcome dependent solely on a marker firing. The marker is the fast path, not the only path. For any marker that triggers a server-side operation, a fallback must exist that completes the operation if the marker is missed. Two valid patterns: (1) server-side — handleSessionFinish detects the missed case via regex and writes the data anyway (NAME, EMAIL, PHONE); (2) client-side UI — a turn-count-gated CTA surfaces the action to the user regardless of marker state (ACCOUNT_CREATE → SaveChatCTA after 4 messages). Every new business-critical marker must have one of these two fallback patterns in place before shipping.

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
- **Auth:** Clerk (`@clerk/nextjs` — currently v7, Core 3), consumed ONLY
  through the provider-agnostic boundary at `services/auth/` (the Golden Rule —
  see `docs/auth-service-rebuild.md`). `@clerk/*` may be imported only inside
  `services/auth/providers/clerk/**`; everywhere else is an ESLint **error**
  (`no-restricted-imports`). Product code imports `@/services/auth` (server),
  `@/services/auth/client` (hooks), `@/services/auth/ui` (prebuilt UI
  re-exports), or `@/services/auth/middleware` (edge). AI skills for all Clerk
  patterns are in `.agents/skills/clerk-custom-ui/` and
  `.agents/skills/clerk-nextjs-patterns/`. **Before writing any Clerk auth code,
  read `.agents/skills/clerk-custom-ui/core-3/`.**
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
- **Public site:** Tailwind — components in `app/(jefflougheed)/components/` and the shared shells under `components/shells/`
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

**Fonts are scoped per brand.** Cormorant Garamond (serif/display), DM Sans
(body), and DM Mono (mono) are loaded via `next/font/google` in
`app/heirloom/layout.tsx` and exposed as `--font-heirloom-serif` /
`--font-heirloom-sans` / `--font-heirloom-mono`, which `app/heirloom/globals.css`
remaps onto `--font-display` / `--font-serif` / `--font-body` / `--font-mono`
**on the Heirloom layout wrapper only**, so Tailwind `font-display`, `font-body`,
and `font-mono` resolve correctly on Heirloom routes.

---

## Shared Primitives

Reusable admin-side components in `/components/admin/primitives/`:

| Component | File | Purpose |
|-----------|------|---------|
| `PromptFullnessMeter` | `PromptFullnessMeter.tsx` | Takes `bodies: string[]`, sums character counts, approximates tokens as `ceil(chars/4)`, renders a Mantine `Progress` bar with a monospace label. Color thresholds: green under 5000 tokens, yellow 5000–8000, red over 8000. Used on the Blocks page (reactive to the client-side items state) and the Prompt page (server-fetched on mount). |
| `Text` | `Text.tsx` | Typography primitive wrapping Mantine `Text` with four variants: `body` / `label` / `title` / `muted`. Always renders as `<p>` (`component="p"` is hardcoded on line 44). **Does NOT passthrough polymorphic props** (`component`, `as`, `renderRoot`) — its prop surface only exposes `variant` + `HTMLAttributes<HTMLParagraphElement>`. For non-`<p>` semantic rendering (e.g. monospace `<pre>` blocks, inline `<code>`), use raw HTML elements styled with Mantine CSS variables (`var(--mantine-font-family-monospace)`, `var(--mantine-color-gray-0)`, etc.) — not `<Text component="pre">`, which fails typecheck. |

### Admin list-page primitives (`components/admin/lib/`)

Presentational primitives shared across the admin dashboards/list screens (Blocks, Inbound Chats, Platform Members). Distinct from `/components/admin/primitives/` above — this directory holds dashboard-tile and list-page chrome rather than typography.

| Component | File | Purpose |
|-----------|------|---------|
| `StatTile` / `MetaRow` / `Mono` / `Dim` | `primitives.tsx` | `StatTile`: a bordered `label` + monospace 26px `value` + optional `sub` card for dashboard headers (`accent` overrides the value color). `MetaRow`: label + value row for detail cards. `Mono`/`Dim`: inline monospace / dimmed `Text` spans. |
| `Donut` / `DonutLegend` | `primitives.tsx` | Generic hoverable segmented-ring SVG chart + its clickable swatch legend. |
| `FeedbackCounts` | `primitives.tsx` | Thumb-up/down icon+count pairs (only the populated side(s) render; `—` when a session has no feedback at all). Shared by the Inbound Chats table's Feedback column and the session drawer's transcript-header rollup. |
| `Sparkline` | `primitives.tsx` | Single-`<polyline>` SVG trend line, 64×24 default. No built-in color logic — the caller passes a CSS-var/color string, so the same primitive renders "over threshold" red or brand color depending on context. Points with `null` values (no data for that bucket) are skipped when plotting rather than fabricated or gapped. Used by the Inbound Chats dashboard's Response Time tile (`getTtftTrend`). |
| `CollapsibleSummary` | `CollapsibleSummary.tsx` (+ `CollapsibleSummary.module.css`) | Generic hide/show wrapper: a "Hide {label}" button collapses `children` to a `localStorage`-persisted collapsed recall strip ("Show {label}" + caller-supplied `recallStats`/`recallExtra` content). Extracted from the Blocks screen's `SummarySection.tsx` (which now builds on it, supplying its live/draft dot + `GuardrailMeter` via `recallStats`/`recallExtra`); the Inbound Chats dashboard (`InboundChartsDashboard.tsx`) is the second consumer, with `recallStats` showing sessions/converted/negative-feedback/avg-TTFT counts. Platform Members does **not** use this — it only adopted the sticky toolbar below, not a collapsible dashboard. |

The sticky filter/search toolbar (`.stickyToolbar`, `stickyToolbar.module.css`) is a plain CSS Modules class rather than a component — imported by `BlocksTable.tsx`, `InboundChatsTable.tsx`, and `MembersList.tsx` so their search/filter rows pin to `top: 0` of their scroll container. Each consuming page needs the header/scroll-body layout split described under `app/admin/prompt-studio/blocks/page.tsx` (SCROLL_AREA_STYLE with `pt={0}`) for the bar to pin flush with no gap; `app/admin/page.tsx` and `app/(platform)/platform/members/page.tsx` have this split, `app/admin/members/page.tsx` (tenant admin, sharing `MembersList`) does not yet.

### Page-local components

| Component | File | Purpose |
|-----------|------|---------|
| `SageParameters` | `app/admin/settings/SageParameters.tsx` | Mantine-based client component rendered inside the Parameters section on the Settings page. Owns the section header row (title + "Add New" button, right-aligned) and the card list below it. Fetches `/api/admin/sage-parameters` on mount. Each existing parameter renders as a Mantine `Card` showing Label (title), Description (subtitle), CTA label, URL, and Open-as (with Embed-code status when `open_as = 'popup'`), plus edit (pencil) / delete (trash) `ActionIcon`s top-right. Edit expands the card inline with `TextInput`s for Label, Description (max 60 chars, live counter), CTA Label (max 20 chars, live counter), and URL; a Mantine `Select` for Open behavior (`New Tab` / `Inline` — the `Inline` option maps to the `open_as = 'popup'` DB value for backwards compatibility); and — only when Inline is selected — a monospace Mantine `Textarea` labeled "Embed Code" (placeholder "Paste your booking tool's popup snippet here") for the `embed_code` value. Switching back to `New Tab` nulls `embed_code` on save. Save validation blocks PATCH when `open_as = 'popup'` and `embed_code` is empty/whitespace ("Embed code is required for inline booking."). Add New prepends an empty editable card to the top of the list. Save and Add both PATCH `/api/admin/sage-parameters` (Add auto-generates `key` from the label, lowercase non-alphanumerics collapsed to `_`; duplicate keys rejected client-side). Delete opens a Mantine `Modal` confirmation and calls `DELETE /api/admin/sage-parameters/[key]`. Surfaces success/error via `@mantine/notifications`. Console logs cover fetch, PATCH dispatch (with `open_as` / `has_embed_code`), success/failure, DELETE, and add-new-card open. |
| `ChatThresholds` | `app/admin/settings/ChatThresholds.tsx` | Mantine client component rendered as the second section on the Settings page (after Parameters), inside `<section aria-labelledby="thresholds-heading">`. Owns the section header (title "Chat Thresholds" + muted subtitle "How long Sage waits before moving a session from In-progress → Active → Abandoned.") and a single `Card` body with two `NumberInput` fields — `chat_in_progress_idle_seconds` (label "In-progress idle threshold", default 300, step 60) and `chat_active_idle_seconds` (label "Active idle threshold", default 86400, step 3600). Both inputs are seconds; helper `description` text translates the defaults to human units. Fetches `/api/admin/tenant-settings` on mount; PATCHes the same route on Save. Validation: both fields must be positive integers and `in_progress < active` — Save button is disabled while invalid or not dirty (`dirty` compares current input against the last saved snapshot). Reset to defaults button (subtle gray) restores 300 / 86400 in the inputs without writing. Save button (filled green, `loading={saving}`). Surfaces success/error via `@mantine/notifications`. Console logs cover fetch, PATCH dispatch, success, failure, and reset. No view/edit toggle — singleton record with always-visible inputs. |
| `PromptSets` | `app/admin/settings/PromptSets.tsx` | Mantine v7 client component rendered as the **second** Settings accordion panel (after Parameters). Mirrors `SageParameters` in shape: `fetch` on mount → `@mantine/notifications`, Add-New → view/edit `Card` split → delete `Modal`. Fetches `/api/admin/prompt-sets` (unwrapped `PromptSet[]` — excludes composer-family rows server-side, July 2026) **and** `/api/admin/prompt-types` (for the type selector) on mount. Editable fields: `label`, `description`, and `prompt_type_id`. **`status` is display-only** (a `StatusBadge`, not a `Select`) — it's server-owned by the compile/publish pipeline, so this form can't set `status='live'` with no compile; a new set always starts `'draft'`. The "Used as" prompt-type `Select` renders only when `status === 'live'` (required there), value = `prompt_types.id`, label = `name`; an inline "＋ New type…" option mints a `prompt_types` row via `POST /api/admin/prompt-types` and selects the returned id. `version`, `is_composer_prompt`, `is_default`, `id`, `tenant_id`, and the timestamps are read-only (shown in a `MetaStrip`); the view card chip resolves `prompt_type_id` → name. Save → `PATCH /api/admin/prompt-sets` (omit `id` to insert); delete → `DELETE /api/admin/prompt-sets/[id]`. Validation blocks save when label is empty or a live set has no prompt type. |
| `MembersList` / `MemberDrawer` / `InviteMemberModal` / `LinkTimeline` | `app/admin/members/` | Mantine v7 client components on the Members page (platform admin only). **MembersList**: SegmentedControl filter by status (all/active/invited/waitlist/suspended/deleted), search, checkbox bulk-select (invited-only rows excluded — no user_id for status API), bulk Suspend/Reactivate/Delete; row menus per status. Invited-only rows (user_id IS NULL) rendered with synthetic `invite:${memberId}` id and "Invite pending" label. **"Invited by" column** (2026-07-10) between Status and Last active (desktop) with a matching label/value row on the mobile card — shows `Membership.invitedByName` (resolved server-side via `inviter:users!invited_by`, name → email fallback); no inviter renders a dimmed em-dash; display-only (no sort/filter/link). Copy-invite-link actions (row menu, `InviteMemberModal` success view) build the URL via `inviteUrlFor` (see Utilities → `inviteLink.ts`) — `/invite/{token}`, not the legacy `?invite={token}` query form. **MemberDrawer**: right-side detail drawer (`size="min(440px, 100vw)"` — clamps on narrow viewports), per-tenant status/plan/joined/role info; header shows "Invited by {name}" once under the email (or "Seeded · no inviter"); Role dropdowns with single-request Save. **Invite-link tracking (Option B, 2026-07-11)**: any membership with a tracked invite (or `status = 'invited'`) renders an "Invite link" section — a `StageBadge` (furthest stage reached), a Stalled badge + hint (opened but not accepted for ≥ `INVITE_STALL_DAYS`), the `LinkTimeline` component, and Resend / Copy link / Revoke actions (hidden once revoked or accepted). Live detail is fetched per membership by `memberId` on drawer open (`GET ${inviteApiBase}/invite/{memberId}`), seeded from the page-embedded `Membership.invite` snapshot and falling back to it on refetch failure. Revoke is optimistic (stamps `revokedAt` locally, `POST .../invite/{memberId}/revoke`, reconciles via reload on failure). **`LinkTimeline`** (`LinkTimeline.tsx`) renders the 3-stage vertical timeline (Created → Opened → Accepted, per `INVITE_STAGES`/`INVITE_STAGE_META` in `constants.ts`) with loading/error/revoked states; also exports `isStalled(invite)`. **InviteMemberModal**: optional `invited_name` + tenant select; `POST /api/platform/members/invite`; success stage shows generated invite URL (via the server's `invite_url`, itself built with `inviteUrlFor`) with copy button. |
| `BookingCard` (+ `parseBookingCards`, `injectInlineEmbed`) | `components/shells/widget/sage/BookingCard.tsx`; parser at `services/chat/ui/v1/parseBookingCards.ts` (headless) | Tailwind component and parser used by the public visitor chat — `BookingCard` was extracted out of the pre-consolidation `Chat.tsx` into the widget shell's `sage/` folder (centralization Step E; `Chat.tsx`/`Hero.tsx` were later consolidated into `components/shells/widget/WidgetShell.tsx`'s `WidgetShellChat`/`WidgetShellHero`); the headless `parseBookingCards` parser lives in the chat-UI service (Step B). `parseBookingCards(content)` delegates to `createDefaultRegistry()` (`services/chat/ui/v1/registry.ts`): the registry parses every registered marker, returns `[BOOKING: …]` matches as `BookingCardData`, strips `[NAME: …]` markers from prose (not surfaced as cards), strips any trailing incomplete `[MARKER:` fragment still streaming, collapses leftover blank lines, and returns `{ prose, cards }`. The `useSageParameters` hook (`services/chat/ui/v1/useSageParameters.ts`, a headless data hook) fetches `/api/sage/parameters` on mount, and `SageReply` (`components/shells/widget/sage/SageReply.tsx`) matches each parsed card to a parameter by `url`, passing `openAs` + `embedCode` as props. `BookingCard` is a white card with `border border-black/10` + `shadow-sm`, bold label, muted description, a `#2d6a4f` CTA, and — directly below the card — a ref'd inline-embed container (`mt-2 w-full min-h-[700px]`, hidden until first click). CTA element type switches on `openAs`: `<a target="_blank" rel="noopener noreferrer">` for `'new_tab'`; `<button>` for `'popup'` (admin label "Inline") that, on click, reveals the container and calls `injectInlineEmbed(container, embedCode)`. `injectInlineEmbed` re-materializes the snippet into live `<script>` / `<link>` nodes scoped to the target container so script tags actually execute (handles both pure inline JS and HTML fragments with `<script src="...">`). The button disables itself after injection to keep the mount idempotent. If `openAs = 'popup'` and `embedCode` is empty, falls back to new-tab behavior and `console.warn`s. When the *effective* open behavior is `new_tab` (either explicitly or via the empty-`embed_code` fallback), a small muted Tailwind `<p>` renders directly below the card: "Heads up — clicking the button will open in a new tab to complete your booking." — suppressed for the in-chat inline case. |

**`inviteLink.ts`** (`app/admin/members/inviteLink.ts`, server-safe — no JSX/Mantine/React,
importable from both client components and API route handlers): `toInviteLink(row)` maps
a `members` row (`token, created_at, used_at, opened_at, opens, revoked_at, expires_at`)
onto the `InviteLink` view model, returning `null` when `token` is null (no tracked
invite) and deriving `reached` as `used_at ? 'accepted' : opened_at ? 'opened' : 'sent'`.
`inviteUrlFor(token, tenantDomain?, origin?)` is the single source of truth for the
`/invite/{token}` URL shape — every invite-link builder in the codebase (`MembersList`,
`MemberDrawer`, `InviteMemberModal`, both invite POST routes) calls through it rather than
constructing the string inline.

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

The widget-shell chat surfaces have been extracted (centralization Step E):
the former `Hero.tsx`, `Chat.tsx`, and `sage/*` (`SageReply`, `BookingCard`,
`markdownComponents`) now live in **`components/shells/widget/`** (app-importable
shared presentation) — `Hero.tsx` and `Chat.tsx` were subsequently consolidated
into `WidgetShell.tsx`, exporting `WidgetShellHero` and `WidgetShellChat` — with
the headless pieces (`useWidgetShell`,
`useSageParameters`) in `services/chat/ui/v1/`. `SectionProcess.tsx` is a
jefflougheed marketing section that consumes the widget only via the headless
`useWidgetShell` store (Step E relocates it into `app/(jefflougheed)/components/`).

`Nav.tsx` — jefflougheed nav chrome with no chat coupling — has been relocated
into `app/(jefflougheed)/components/` (it imports `ShareModal` via relative
`./ShareModal`). With this move `src/components/` is **empty and removed**; the
last `boundaries/element-types` warning (the old `Nav → ShareModal` `src→app`
pair) is cleared. `src/` now holds only `calendly.d.ts`.

Do not move or delete these without explicit instruction from Jeff.

Notes:
- `SectionProcess.tsx` now lives in `app/(jefflougheed)/components/`
  (relocated in centralization Step E). It does **not** import
  `FEATURED_TESTIMONIALS` (an earlier note to that effect was stale); its only
  cross-module dependency is the headless `useWidgetShell` store
  (`app→services`, legal).
- `public/logos/` deliberately still holds the platform `2blai_logo.svg` and
  some duplicate/variant logos — only the specific jefflougheed logos were
  namespaced.
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
| Settings | `app/admin/settings/page.tsx` | Tenant configuration. Mantine `Accordion` with five panels in order: Parameters (`SageParameters`), Prompt Sets (`PromptSets`), Chat Thresholds (`ChatThresholds`), Invite Gate (`InviteGate`), Appearance (`Appearance`). |
| Members | `app/admin/members/page.tsx` | Platform-admin member management across all tenants. Server component — queries signed-up users (with embedded members) + invited-only members rows (user_id IS NULL, status in invited/waitlist); fetches `tenants.domain` in both queries and the tenants list; passes combined UserRow[] (with `Membership.tenantDomain`) to `MembersList`. Sidebar nav entry: **Members** at `/admin/members`. **Retired**: `app/admin/invites/` (deleted — invite management moved here). |
| Blocks | `app/admin/prompt-studio/blocks/page.tsx` | Server component — fetches all non-deleted blocks for the tenant (including `order`) and renders `BlocksTable`. **Prompt-set picker**: `getPromptSets()` queries the `prompt_sets_with_compile_meta` VIEW (not the raw `prompt_sets` table — same view the tenant-Settings screen's `GET /api/admin/prompt-sets` reads, joined against `compiled_prompts` by `prompt_set_id`), returning each set's `prompt_type_id` (UUID, informational only), plus the derived `lastCompiledAt`/`compiledVersion` (compiled_prompts.updated_at/version for that set — see Compile & Publish below). The active set scopes the blocks query by `blocks.prompt_set_id === activeSet.id` (the set's own row id, never `prompt_type_id` — that field plays no part in the blocks filter). Status uses lowercase `'live'/'draft'` (DB constraint); `PromptSetSelect` / `BlocksOverview` capitalize for display. `PromptSetSelect` (July 2026 — moved to `components/admin/prompt-studio/PromptSetSelect.tsx`, alongside its shared types/`familyOf` logic in `promptSet.ts`) is no longer Blocks-only: the Composer editor's "Building in" control (`app/admin/prompt-builder/page.tsx`) is the exact same component, passed `label="Building in"` plus `onSelect`/`onCreate` props Blocks doesn't use (picking a set there sets local state instead of navigating; an inline "New prompt set…" form is Composer-only). The former `components/admin/prompt-builder/PromptSetPicker.tsx` — a hand-duplicated copy in plain CSS Modules — is retired. **Row/card affordances (desktop `BlockRow` + mobile `BlockCard`):** inline `Order` field (Mantine `NumberInput`, blur-to-save via `PATCH /api/admin/blocks/[id]` with `{ order }`; duplicate-order check fires a red notification and aborts); inline title rename (double-click title → `TextInput`, Enter/blur commits via `PATCH { title }`, Escape cancels); duplicate confirmation `Popover` (Duplicate / Cancel + "Don't ask again" checkbox persisted to `localStorage` key `block-admin:skip-dup-confirm`; skips popover on subsequent clicks when checked); clipboard copy of block body (`IconClipboard` → `navigator.clipboard.writeText`, 2-second `IconCheck` feedback); "Updated X ago" timestamp rendered with `suppressHydrationWarning` so dates display in the browser's local timezone. **Edit drawer/sheet (`BlockEditForm`, edit mode):** editable Title `TextInput` at top (blur/Enter commits via `PATCH { title }`, Escape reverts; drawer header title updates reactively from items state); clipboard copy icon in the action row (right-aligned, same 2-second feedback). **Compile & Publish (`PublishButton` + `CompilePublishModal`, both `app/admin/prompt-studio/blocks/` and `components/admin/prompt-studio/`):** three-stage modal — Compile (loading) → Review (read-only compiled output, Copy/Download/Cancel/Publish→) → Describe (July 2026 — a required one-line `Summary` (≤72 chars, `services/prompt/release-note.ts`'s `SUMMARY_MAX`), optional `Why`, and an auto-derived "changed since" chip list of blocks edited after the set's `lastCompiledAt`; `⌘↵`/`Ctrl↵` submits). The compile POST (`/api/admin/prompt/compile`) fires only from stage 3, carrying `{ prompt_set_id, note }`; stage 2's "Publish" only advances to stage 3. The pending version shown in both stages (`Will publish as vN` / `Publish vN`) is `compiledVersion + 1` (compiled_prompts.version for this slot, sourced from the same view) — **not** `prompt_sets.version`, which is set once at row creation and never incremented again, so it silently drifts from the real publish history (observed in prod: a tenant's `prompt_sets.version` sitting several versions behind its `compiled_prompts.version`). |

---

## Public Site (Visitor)

Public-facing components live in `app/(jefflougheed)/components/` and the shared
widget shell (`components/shells/widget/`). Tailwind + inline styles (no Mantine
on the public side).

| Component | File | Purpose |
|-----------|------|---------|
| `WidgetShellChat` (Sage overlay + `#chat` anchor section) | `components/shells/widget/WidgetShell.tsx` | Full-viewport visitor chat overlay plus the in-page `#chat` anchor section that CTAs into it. Mounted from `app/(jefflougheed)/page.tsx`; toggled via `useWidgetShell.expand()` / `collapse()`. **Overlay** is a `fixed inset-0` wrapper around an inner `flex h-dvh min-h-0 flex-col` — height is pure CSS (`h-dvh`), unconditionally, no JS-computed inline height or transform. `app/layout.tsx`'s `interactiveWidget: 'resizes-content'` viewport export is what makes `h-dvh` shrink correctly on keyboard-open on both iOS Safari and Android Chrome. `useKeyboardViewport` is called with `trackViewport: false` — it's used only for its `lockBodyScroll: true` side effect (freezes the document with `position: fixed` + `top: -scrollY` on open, restores scroll position via `window.scrollTo` on close — hardened beyond `overflow: hidden`, which iOS ignores during focused-input auto-scroll); no `visualViewport` listener runs and no height/transform is computed in this component (mirrors `components/shells/membership/ChatHero.tsx`'s overlay fix). The composer is a `sticky bottom-0` last child inside the same `overflow-y-auto` messages container, not a flex sibling after it (composer-inside-scroll-container pattern) — `role="log"`/`aria-live`/`aria-busy` are scoped to the message-content wrapper only, not the composer, so the composer's own content changes never fire a live-region announcement. Compact 56px header (`h-14`, `bg-bg/90` backdrop-blur) with a status pip (`h-1.5 w-1.5 rounded-full`, `bg-accent` when `isStreaming`, `bg-accent/35` otherwise) next to a Playfair 22px wordmark; 44×44 SVG close button (48×48 invisible hit-area via a `before:` pseudo-element). Assistant messages render through `SageReply` — typographic block with a 2px `border-accent/35` left rule, `pl-4`, Playfair 18px prose, `max-w-[680px]`, `sage-slide-up` entry animation; **no bubble** (no bg, no border-radius, no shadow). **Visitor bubble (converged with Heirloom's structure 2026-07-28, per `docs/spec_visitor_bubble.md`; widened + alignment-fixed same day):** `w-fit max-w-[90%]` (shrink-to-fit measure, was a fixed `max-w-[560px]`, then `76%` — widened to `90%` after the 76% measure read as cramped next to the assistant's full-width response; `EditableUserBubble`'s editing-state measure widened in step, `86%` → `95%`, to stay proportionally roomier than the read state), `rounded-[18px] rounded-br-[5px]` (18px radius with a 5px bottom-right tail), `border` + `bg-surface`/`border-border` (was borderless on the sent state) — these resolve to jefflougheed's own cream-on-white fill via this file's own CSS cascade (`app/(jefflougheed)/globals.css`'s scoped `--color-surface`/`--color-border` overrides for `#herochat .chat-surface` / `#sage-chat-overlay`), not Heirloom's literal palette. **Shrink-to-fit-vs-percentage bug (found in production 2026-07-28):** the `<p>` bubble used to sit inside an extra `<div className={status === 'failed' ? 'chat-bubble-shake' : undefined}>` wrapper (added only to conditionally apply the failed-state shake animation). That wrapper was a second, unnecessary level of shrink-to-fit sizing between the bubble and its `items-end` flex-item parent — a percentage `max-width` on a plain block descendant of an `align-items:flex-end` flex item (rather than on the flex item itself) hits an indeterminate/circular CSS sizing case, and Chrome resolved it to a width far narrower than the content needed. Confirmed live in production and reproduced on a local dev build via Playwright driving the real composer (not a synthetic harness): typing "Hello" computed the bubble to ~72×76px and wrapped it into two lines ("Hel"/"o") despite ~960px of available width. Fix: apply `chat-bubble-shake` directly on the `<p>` itself (conditionally, alongside its other classes) and drop the wrapper `<div>` entirely, so the bubble is the direct flex item — re-measured at ~80×51px, single line, same content. Same fix applied to `MessageList.tsx`'s bubble `<div>` below, which had the identical wrapper pattern. Text is `font-body` (DM Sans) at 15.5px/1.62, `text-left` (was `font-display` Playfair italic at 18px right-aligned — the font was a real token violation, Playfair is the display font not body; `text-left` fixes wrapped multi-line text reading right-flush, which the spec calls out as wrong). Failed state is `bg-red-400/10 border-red-400/45` (was border-only). The `.sage-visitor-msg` class (defined in `app/(jefflougheed)/globals.css`, not the shared `app/globals.css`) is kept — applies CSS curly quotes via `::before` / `::after` — the message content string itself never contains the quote glyphs — and `italic` is kept too: both are deliberate jefflougheed-specific decorative flourishes layered on top of the shared structure, not something the spec convergence removed. **Bubble/action-row alignment:** the per-message wrapper is `group flex flex-col items-end gap-1.5` — Flexbox `align-items: flex-end` right-aligns each child (bubble, `DeliveryStatus`, `UserMessageActions`) to the container's own edge independently of that child's own width, so the action row's right edge always lands under the bubble's regardless of which one is wider. (A same-day CSS Grid version of this — `group grid justify-end gap-1.5` with `DeliveryStatus`/`UserMessageActions` wrapped in `w-full min-w-0` divs — was tried and reverted: a single-column CSS grid defaults every item to `justify-self: stretch`, and the shared column is sized to the WIDEST row's max-content, usually the actions row, not the bubble — so the bubble's own `max-w-[90%]` resolved against the actions row's width instead of the real container, and for a short message the two rows' right edges were measurably ~136px apart, not aligned at all. Confirmed via a Playwright/Chromium harness reproducing the exact DOM+CSS before reverting.) Mirrors `components/shells/membership/MessageList.tsx`'s identical structure. **Visitor message actions (added 2026-07-27, full parity as of the same date):** each visitor message renders `components/chat/UserMessageActions.tsx` — full Edit/Copy/Send again, same as Heirloom — once `status` is `'sent'`, plus `components/chat/EditableUserBubble.tsx` swapped in place while editing (local `editingId` state, cleared if the target message disappears). Initially shipped Copy-only (`showEdit={false} showResend={false}`) because editing/truncating history here could silently discard an already-offered booking card or an already-captured NAME/EMAIL/PHONE with no undo; flipped to full parity once `conversion_events` landed (see that schema row + `services/crm/conversion-events.ts`) — truncation now flips any still-`'presented'` booking/contact event to `'overwritten'` instead of just vanishing, so the discard is tracked rather than silent. `editMessage`/`resendMessage` come from `useChatSessionContext()`, same shared engine as Heirloom. Empty state **is** the greeting: mode-aware Playfair copy ("Hi, I'm Sage. *What brings you here?*" default, "Ask me anything about *Jeff's work*." question-mode) in the same left-rule card style. First user send populates `messages` and the empty state unmounts. There is no `sendGreeting` — `messages.length === 0` is the canonical greeting state. Composer tray padding is `pb-[max(12px,env(safe-area-inset-bottom))]`; send/stop button is `bg-accent` `h-11 w-11 rounded-full` (48×48 invisible hit-area); textarea is `bg-bg rounded-xl`. The streaming indicator uses three dots with the `sage-pulse` keyframes and carries `data-sage-streaming` for the reduced-motion guard. Reduced motion is honored at the CSS layer via `@media (prefers-reduced-motion: reduce)` disabling animations on `.sage-animate`, `.sage-visitor-msg`, and `[data-sage-streaming] > *`. Only two intentional inline `style` props remain in the overlay JSX: the tagline `opacity: keyboardOpen ? 0 : 1`, and the per-dot `animationDelay` on the streaming indicator — everything else is Tailwind (`markdownComponents` and `BookingCard` internals excepted). The overlay container sets **no inline color tokens** — it inherits the inkwell palette from `html[data-palette="inkwell"]`, and assistant prose color resolves through `var(--color-text-primary)` via `markdownComponents` (`components/shells/widget/sage/markdownComponents.tsx`), which uses palette tokens rather than hardcoded hex. Reads `mode` from the shared session (`useChatSessionContext`); the shell open/close + question `mode` live in `useWidgetShell`. On mount, `detectModeFromLocation()` parses `?mode=question` from the hash-query or top-level search string and — if `'question'` — calls `expand('question')` to auto-open the overlay. `mode` is read by the `useChatTurn` engine (`services/chat/ui/v1/`) via injected `ChatEngineAccessors` and sent to `/api/sage` on every send/retry so the server appends the question-mode CONTEXT block — the send → create-session → stream → PATCH lifecycle lives in the hook, not in this component. Marker parsing is documented separately under "Marker Syntax"; `SageReply` resolves each parsed card to a `sage_parameters` row by URL match and spreads `openAs` / `embedCode` into `<BookingCard>`. **`#chat` anchor section** (same file) renders: eyebrow "Not Sure Yet?" → headline → lede → green Start/Continue CTA → outlined Book a Session link. The inline 240px transcript preview that used to render when `messages.length > 0` has been removed; the CTA label still toggles "Start a Conversation" / "Continue Conversation" based on `messages.length`. Reveal animation on the anchor section is unchanged. |
| `WidgetShellHero` | `components/shells/widget/WidgetShell.tsx` | **Chat-first hero** — the landing headline ("Hi, I'm *Jeff*."), lede, and `sage-line` sit above an **inline chat surface** (composer + conversation canvas + suggestion chips) in the same `#hero` section. It is a standalone inline chat that **shares conversation state with the `WidgetShellChat` overlay** via the shared session (`useChatSessionContext`, instanceKey `"sage"` — the two surfaces drive one conversation) but does **not** use `expand()`. The turn engine is the shared session's `useChatTurn` (owned by the single `ChatSessionProvider`); `submit()`, Enter-to-send (`onKey`), and the suggestion-chip `handleChipClick` all call `session.send(text)`, the error block's Retry calls `session.retry()`, and `session.errorType` (null when the last turn succeeded, else the classified `ChatErrorType` — see "Error classification" below) drives that block. Only `setComposerRef` is shell state (`useWidgetShell`). `isStreaming` (session) drives the three-dot `sage-pulse` indicator and disables the composer/chips. Messages render like the overlay: visitor as right-aligned italic Playfair `.sage-visitor-msg`, assistant via `SageReply` (booking cards parsed by `parseBookingCards`, params from `useSageParameters`). `isEngaged = messages.length > 0 && conversationVisible` toggles the `.stage` → `.stage engaged` class; a `close-x` button collapses the canvas (`conversationVisible`), and the 5 suggestion chips render only when not engaged. On mount it registers the textarea via `setComposerRef` and runs `detectModeFromLocation()` — `?mode=question` (hash-query or top-level search) → `setMode('question')` + focuses the composer. **iOS keyboard handling**: the shared `useKeyboardViewport` hook (no scroll-lock — deliberate; `position: fixed` on the body breaks iOS keyboard detection in an inline context) fires `onViewportChange` on every `visualViewport` resize/scroll event, writing `--kb-surface-h` and `--kb-surface-y` CSS vars onto `chatSurfaceRef` and returning `keyboardOpen`; `keyboardOpen` flips `.chat-surface--kb` (mobile only — the viewport height never drops below the threshold on desktop, so layout is untouched). The CSS vars drive the fixed-position surface overlay (height + compositor `translateY`) so the composer sits directly above the keyboard without needing `position: fixed` on the surface itself. **Auto-scroll (fixed 2026-07-28):** `ChatThread`'s `scrollGuard` is `() => conversationVisible && messages.length > 0` — restored after a `DIAGNOSTIC (temporary)` comment had it hardcoded to `() => false` (commit `dbb7a08`, predates this fix by several days and is unrelated to any of the visitor-bubble work). With auto-scroll disabled, `.hero-conversation`'s `overflow-y: auto` never scrolled itself, so once a conversation grew past the visible height, new messages rendered below the scroll container's clipped bottom edge and were invisible until manually scrolled — confirmed via Playwright (`heroConversation.scrollTop` stuck at `0` despite `scrollHeight > clientHeight`) and a screenshot showing message 6 of 6 simply absent, no z-index/stacking involved. `WidgetShellChat`'s overlay was never affected — its own `scrollGuard={() => isExpanded}` (a different prop, same `ChatThread`) was untouched. Verified safe to re-enable on mobile specifically: a real tap on Hero's composer never reaches this code path at all (see `handleComposerPointerDown` below — it redirects to the overlay before focus), and the residual path (keyboard/assistive-tech focus, which isn't intercepted by the pointerdown guard) was tested directly at a mobile viewport width and scrolls correctly. |
| `Nav` | `app/(jefflougheed)/components/Nav.tsx` | Top fixed navigation for jefflougheed.ca. Three entries from a `LINKS` array: `Book` (`kind: 'scroll'` → smooth-scrolls to `#how-it-works`), `Labs` (`kind: 'external'` → `https://www.2bl.ai`), and `Share` (`kind: 'share'` → opens `ShareModal`). Desktop renders the links inline; mobile uses a hamburger that toggles a fixed dropdown. Scroll past 60px (or an open mobile menu) swaps the bar to a blurred translucent background with a bottom border. **No chat coupling** — Nav does not import `useWidgetShell`/the session and never calls `expand()`. Its only cross-module dependency is `ShareModal`, imported via relative `./ShareModal` now that Nav sits alongside it in `app/(jefflougheed)/components/` (the old `src→app` boundary warning is cleared). Styles are inline + a small `<style>` block (no `app/globals.css` `nav-chat-*` classes). |

### Discovery-call link cleanup

The free 15-minute discovery call is removed as a **user-facing link**
on the public site. The discovery call is **not** removed from Sage's master
system prompt; Sage may still offer it at her discretion during a
conversation. Remaining intentional references:

- `services/prompt/sage-prompt.ts` — `DEFAULT_SYSTEM_PROMPT` pricing + behavior + booking-link sections
- `app/(jefflougheed)/components/Session.tsx` — `handleDiscoveryClick` popup invocation and the "Start with a free 15-minute call →" link

Do not remove these without explicit instruction.

### Heirloom storefront (chat)

The Heirloom chat is the platform's **membership shell** (the chat IS the
product — a slide-in modal panel; see "Chat shells" in README). As of
centralization Step F its presentation lives in **`components/shells/membership/`**
(Tailwind + the `[data-brand="heirloom"]` palette — no Mantine, isolated from the
Sage visitor chat in `components/shells/widget/`), app-importable shared presentation that
`app/heirloom/page.tsx` mounts. It keeps its own `useReducer`-backed shell store
(`chatStore.tsx` here; the pure `chatReducer.ts` is headless in
`services/chat/ui/v1/`), but its turn engine is the **shared `useChatTurn` hook**
(`services/chat/ui/v1/`, PR #44) — the same engine jefflougheed consumes. The
Heirloom-local `app/heirloom/lib/stream.ts` reader was deleted; the hook owns
transport via the shared `readDataStream` (`services/chat/server/stream-utils.ts`).
`app/heirloom/` now holds `page.tsx` (server gate), `HeirloomApp.tsx` (client shell),
`layout.tsx`, `globals.css`, and `components/landing/*`.

| Component | File | Purpose |
|-----------|------|---------|
| `HeirloomPage` (server gate) | `app/heirloom/page.tsx` | **Server component** — reads `invite_gate_enabled` from `tenants.settings` JSONB for `HEIRLOOM_TENANT_ID` (default `true` when key absent) and determines `isAuthorized` via two paths: (1) signed-in Clerk user with an `active` members row; (2) valid unused `?invite=TOKEN` query param (checked via `validateMemberToken()` from `services/members` — reads `members.token` / `members.used_at`, no mark-used at render time). If either path resolves, `isAuthorized = true`; when a valid token resolves, `invitedName` is extracted from the members row. Passes `gateEnabled`, `isAuthorized`, `invitedName`, `hasInviteToken`, and (when the visitor was authorized via an unused token) the raw `inviteToken` string to `<HeirloomApp>`. The raw token is passed only on the token-auth path — not to already-signed-in members. The landing page always renders; the gate only affects the chat widget interior. **GateView** when `!hasInviteToken` shows `WaitlistView` (email form → `POST /api/heirloom/members/waitlist`); when `hasInviteToken` (invalid/expired token) shows the Clerk sign-up modal with optional `invitedName` personalization. |
| `HeirloomApp` | `app/heirloom/HeirloomApp.tsx` | `'use client'` shell — accepts `gateEnabled` and `isAuthorized` from the server page, wraps `<ChatProvider gateEnabled={…} isAuthorized={…}>`, and renders the landing page + slide-in chat panel. Escape key and backdrop click dispatch `CLOSE_CHAT`. Panel carries `role="dialog"` / `aria-modal` / `aria-hidden`. |
| `chatStore` (`ChatProvider`, `useChatStore`, `Message`) | `components/shells/membership/chatStore.tsx` | `useReducer` context composed with the shared session (`useChatSession`, `services/chat/ui/v1/core/`). **Stale note (2026-07-27): the reducer actions below no longer exist as such.** Conversation state (`messages`/`sessionId`/streaming/error) now lives entirely in the shared `useChatSession` store; the local `useReducer` (`chatReducer.ts`) owns only shell state (`TOGGLE_SIDEBAR` / `SET_SIDEBAR` / `OPEN_CHAT` / `CLOSE_CHAT`) — the rest of this entry predates that migration and is kept for its still-accurate parts (gate props, persistence, DB recovery). **Gate props**: `ChatProvider` accepts `gateEnabled?: boolean` (default `true`), `isAuthorized?: boolean` (default `false`), and `inviteToken?: string` (the raw invite token, present only on the token-auth path — stored in a stable ref and consumed once on the false→true `isSignedIn` transition to call `POST /api/heirloom/invites/accept`); computes `isGated = gateEnabled && !isAuthorized` and exposes it on context — consumed by `ChatHero` to render `GateView` instead of the chat. `sendMessage(content)` is the shared engine's `useChatTurn().send`; the context also exposes `retry` / `stop` / `regenerate` / `setActiveVersion` and — added 2026-07-27 — `editMessage` / `resendMessage` (Edit/Copy/Send again on visitor messages, see `useChatTurn.ts` above), plus the engine's `errorType` (see "Error classification" below). **localStorage buffering** (best-effort durability in front of the DB): a `persistCurrent` callback writes the live transcript via `bufferThread` (`services/chat/ui/v1/persistence.ts`) on each turn boundary — user send and stream finish (`setStreaming(false)`); **not** per streamed token. `setSessionId` calls `clearDraft()` then re-buffers under the real session key. A mount effect rehydrates the most-recent buffered thread (`findMostRecentThread`) via `HYDRATE`, syncing the engine refs so the next turn continues the same session (DB write path untouched). A further effect flushes the live transcript on `pagehide` / `visibilitychange` (`document.visibilityState === 'hidden'`) so an interrupted turn that never reached the DB still recovers. **Navigate-away warning**: a `beforeunload` listener (bound once on mount, removed on unmount) triggers the browser's generic leave dialog when a turn is in flight (`isLoadingRef`, a ref mirror of `isLoading` set in `setStreaming`) **or** any conversation exists (`messages.length > 0`). The condition is deliberately broad — anonymous visitors have no cross-device DB recovery yet, so an existing thread is treated as unsaved on leave; tighten to a dirty/confirmed-flush check once signed-in DB recovery is proven. Both `preventDefault()` and `returnValue = ''` are set (Chrome 119+ requires both to show the dialog). **Signed-in DB recovery**: when a Clerk user is signed in (`useUser`), a further effect fetches `GET /api/sessions`, populates `recentSessions` (exposed on the context for the Recent sidebar) and — most-recent-wins — hydrates from the newest DB session only when its `updated_at` is strictly newer than the local buffer's `updatedAt` (so a fresher local thread is never clobbered). `loadSession(id)` (also on the context) loads a previously-fetched session into the conversation via `HYDRATE`. Anonymous users skip this entirely (localStorage only). `newChat()` (also on the context, backing the Sidebar "New Chat" button) captures the active `sessionIdRef` value, clears the engine refs (`messagesRef` / `sessionIdRef` / `assistantPendingRef` / `isLoadingRef`), drops the active thread's localStorage entries — `clearDraft()` for the pre-session draft slot **and** `clearSession(clearedSessionId)` for the current session-keyed entry — then dispatches `RESET`. Clearing the **session** entry (not just the draft) is what actually stops the next mount's rehydration (`findMostRecentThread`) from reloading the just-cleared conversation on refresh: once a conversation has had a completed turn it lives under its real session key, so `clearDraft()` alone left it behind to be re-hydrated (the bug this fixed). History under **other** real session keys + `recentSessions` are preserved (other threads stay loadable from Recent; DB rows are untouched), and the next turn lazily creates a fresh session so the chat returns to the empty greeting. Contact capture is no longer a client concern — phone/email are captured server-side from the visitor's message by the watcher in `services/crm/session.ts` (the `ContactCard` + `CAPTURE_CONTACT` flow was removed). |
| `ChatHero` | `components/shells/membership/ChatHero.tsx` | Panel body: `Sidebar` + a column with `ChatHeader`, then the main content area. **When `isGated`** (from `useChatStore`): renders `<GateView />` occupying the full content area — no composer. **When not gated**: renders `MessageList` (once `hasStarted`), else the empty-state greeting — **personalized** ("Welcome, {invitedName}." heading + tagline subtitle) when `hasInviteToken && invitedName`; generic **"What's a story worth keeping?"** otherwise — followed by `ChatInput` + `SaveChatCTA`. **iOS keyboard handling**: `useKeyboardViewport({ active: state.isChatOpen, lockBodyScroll: true })` — surface shrinks to `vv.height`px when keyboard is open. |
| `GateView` | `components/shells/membership/GateView.tsx` | Rendered by `ChatHero` when `isGated`. Reads `hasInviteToken` and `invitedName` from `useChatStore`. **When signed in** (isLoaded + isSignedIn): "You're on the list." confirmation (fires `POST /api/heirloom/members/claim` once on the false→true sign-in transition). **When `!hasInviteToken`**: renders `<WaitlistView />` — email form that POSTs `{ email }` to `/api/heirloom/members/waitlist`; on success shows "You're on the list." copy. **When `hasInviteToken`** (valid or invalid): "By invitation only." / optional `invitedName` personalization + "Claim a free membership" button that opens the Clerk sign-up modal. Tailwind + Heirloom tokens. No Mantine. |
| `ChatHeader` | `components/shells/membership/ChatHeader.tsx` | "Your Story" dropdown + Account / Close `IconButton`s (Close dispatches `CLOSE_CHAT`). |
| `ChatInput` | `components/shells/membership/ChatInput.tsx` | Auto-growing textarea, Enter-to-send (Shift+Enter newline), `ArrowUp` send button (disabled when empty or loading). Calls `sendMessage`. No AI disclaimer. |
| `MessageList` | `components/shells/membership/MessageList.tsx` | Renders messages (assistant = `Bot`-icon avatar + left bubble, user = right bubble, no avatar) and a bouncing-dots typing indicator while `isLoading`; auto-scrolls to bottom. **Visitor bubble shape (per `docs/spec_visitor_bubble.md`, 2026-07-28; widened + alignment-fixed same day):** `w-fit max-w-[90%]` shrink-to-fit measure (was `max-w-[75%]` with no `w-fit` — the bug that made short messages wrap early / long ones fail to respect the measure — then `76%` per the spec, then widened to `90%` after the 76% measure read as cramped next to the assistant's full-width response), `rounded-[18px] rounded-br-[5px]` (18px radius, 5px tail — was `rounded-2xl`/`rounded-br-sm`, 16px/2px), `border border-border` now applied unconditionally (previously only on the `failed` state — the sent-state bubble had no border at all), text at 15.5px/1.62 (was `text-base`/`leading-relaxed`, 16px/1.625), failed state is `bg-red-400/10 border-red-400/45` (was border-color-only, no background wash), inter-message gap `gap-5` (20px, was `gap-6`/24px), bubble→action-row gap `gap-1.5` (6px, was `gap-1`/4px). `bg-surface`/`border-border` are left as the plain existing tokens (not overridden to the spec's literal `#FFFDF9`/`#E8E0D2` hex) — the delta from the current `#FFFFFF`/alpha-hairline values is negligible, and `border-border`'s own code comment ("matches production weight") signals its alpha was already deliberately calibrated. **Bubble/action-row alignment:** `MessageBubble`'s user-message return is `group flex flex-col items-end gap-1.5` — Flexbox `align-items: flex-end` right-aligns each child (bubble, `DeliveryStatus`, `UserMessageActions`) to the container's own edge independently of its own width, so the action row's right edge always lands under the bubble's. A same-day CSS Grid attempt at this (`group grid justify-end gap-1.5`, with `DeliveryStatus`/`UserMessageActions` wrapped in `w-full min-w-0` divs) was reverted: CSS Grid's default `justify-self: stretch` stretches every item to a single shared column, and that column is sized to the WIDEST row's max-content — usually the actions row, not the bubble — so the bubble's own `max-w-[90%]` resolved against the actions row's width instead of the real container. Measured via a Playwright/Chromium harness reproducing the exact DOM+CSS: for a short message the two rows' right edges were ~136px apart under the grid version (vs. 0px under this flex version), and the bubble's *effective* max-width was bottlenecked to the actions row's own ~185px natural width rather than 90% of the container — explaining why the widen-to-90% change looked like it wasn't taking effect. (The assistant-message branch is early-returned dead code, per the file's own note above, and keeps the older `flex flex-col items-start` shape untouched.) **Assistant action-row alignment (found in production 2026-07-28):** `makeRenderAssistantMessage`'s `MessageActions` row sits below `AssistantMarkdownBubble` in a `ml-[60px]` wrapper — was `ml-11` (44px), which only accounted for the avatar (`w-8` = 32px) + `gap-3` (12px) and ignored the text bubble's own `px-4` (16px) left padding, so the action icons sat visibly left of where the actual prose text started (confirmed against a production screenshot, and measured via a Playwright harness: 16px delta with `ml-11`, 0px with `ml-[60px]`). jefflougheed's equivalent (`WidgetShell.tsx`'s `makeRenderAssistantMessage`) has no avatar to offset for — `SageReply`'s prose and its `MessageActions` row both use a single shared `pl-4`, so they align by construction and never had this bug. The `debugMarkers` wrapper below (admin-only) uses the same `ml-[60px]` for the same reason. Assistant prose runs through the marker registry (`createDefaultRegistry()`), so `[BOOKING:]` / `[NAME:]` / `[EMAIL:]` markers are stripped rather than shown as raw text (Heirloom has no booking-card UI, so BOOKING cards are dropped — only prose shows). Empty assistant bubbles (marker-only or cleared on error) are skipped, and the engine's `errorType` renders an on-brand error bubble (copy per type from `components/chat/errorCopy.ts`) with a real Retry button wired to `retry()`. **Admin debug view**: when `useAuthUser().user.isPlatformAdmin` is true (the client-side boundary signal, mapped from Clerk publicMetadata — display-only gating), all parsed markers extracted by the registry (`result.markers`) render as `DebugPill` components below each assistant message — dark `bg-black/60` monospace pill with a `debug` eyebrow label and the raw bracket text. Display-only: zero changes to the parser, registry, or store. `[SYSTEM: ...]` user-message detection is also wired but won't fire in practice since `sendHidden` never adds hidden turns to the store. Non-admin members: zero behavioral or visual change. **Visitor message actions (added 2026-07-27):** each user message renders `components/chat/UserMessageActions.tsx` (Edit/Copy/Send again — mutually exclusive with `DeliveryStatus`, and only shown once `status` is `'sent'`) below its bubble; tapping Edit swaps the bubble in place for `components/chat/EditableUserBubble.tsx` (an auto-growing textarea, Enter saves/Shift+Enter newline/Esc cancels) via local `editingId` state. Save calls `editMessage(id, text)`, Send again calls `resendMessage(id)` — both from `useChatStore()` (see `chatStore.tsx` above), which truncate the transcript forward from that message and re-deliver (see `useChatTurn.ts`'s `truncateAndRedeliver`). |
| `Sidebar` (v1 — **superseded, unmounted**) | `components/shells/membership/Sidebar.tsx` | The pre-V2 sidebar, replaced by `SidebarV2` in ChatHero. Kept on disk pending preview verification of the V2 pass; delete in the cleanup commit. |
| `SidebarV2` | `components/shells/membership/v2/SidebarV2.tsx` | V2 sidebar (collapsible `w-12` ↔ `w-64` via a **local** `expanded` state, default `true`). Fixed 2026-07-30: this used to be driven by the shared shell reducer's `state.isSidebarExpanded` — the same flag ChatHero uses to decide whether the *mobile* overlay renders at all (initial value `false`). On desktop, where SidebarV2 always renders, that meant the sidebar started in the collapsed icon rail with the entire Memories/Conversations list hidden — clicking "a conversation" appeared to do nothing because no row was rendered to click. The local state decouples "does this instance show full labels/lists" from "is the mobile overlay open," and starts expanded so Recent conversations are visible and clickable immediately on both mobile and desktop. Top → bottom: collapse toggle · threshold-gated Search (faint until `recentSessions.length >= searchThreshold` (8); fires `onSearch` per keystroke — **stubbed at mount**, no filtering) · New Chat (store `newChat()`) · Uploads · Share Heirloom (both stub props) · collapsible Conversations (store `recentSessions` + `loadSession`, active session highlighted, "No conversations yet" empty state) · **anonymous sign-in nudge** (v1 parity, `state.isMember` gate) · Stories (Create / Invite actions — disabled when `storiesDisabled` **or** their handler is absent; story rows with hover tooltip from `description`, optional per-row chat icon + kebab) · Writing Prompts. Per-row kebab `RowMenu` **portals to `document.body`** with fixed positioning captured from the kebab rect (the `overflow-hidden` aside clipped in-tree menus), flips above when out of room below, closes on outside click / scroll / resize / capture-phase Escape; renders only when `onRowAction` is provided (not provided at mount — no menus in pass 1). |
| `ChatDrawerV2` | `components/shells/membership/v2/ChatDrawerV2.tsx` | Right-anchored drawer wrapper: fixed, `z-50`, slide-in via translate-x, two width states (`defaultWidthClassName` ↔ `w-screen` when `isFullScreen`). `inert` + `aria-hidden` + `pointer-events-none` while closed (off-screen content leaves the tab order). Optional built-in minimal header (`showHeader`, default true) — Heirloom passes `false` and keeps `ChatHeader`. Body is `position: relative`, the containing block for the V2 modals' `absolute inset-0` overlays. |
| `BeginStoryModal` | `components/shells/membership/v2/BeginStoryModal.tsx` | "Begin a new story" modal (props only: `open` / `onClose` / `onCreate(name, description)`). Name required (Enter submits), description optional (becomes the story row tooltip). Mounted by ChatHero; `onCreate` appends to the ephemeral stories state. Uses `useModalA11y`. |
| `InviteCollaboratorsModal` / `ShareHeirloomModal` | `components/shells/membership/v2/` | **Landed but not mounted** (deferred / stubbed by decision — no member-facing invite API, no share backend). Props-only; both use `useModalA11y`. ShareHeirloomModal's default `shareUrl` (`heirloom.life`) is a placeholder — pass the real URL when mounting. |
| `useModalA11y` | `components/shells/membership/v2/useModalA11y.ts` | Shared modal behavior: capture-phase Escape with `stopPropagation` (one press closes one layer — the panel's window-level Escape handler never fires while a modal is open), initial focus into the dialog (`initialFocusRef` or the `tabIndex={-1}` container), focus restore on close, Tab/Shift+Tab focus trap. Unit-tested in `useModalA11y.test.tsx` (6 tests). |
| `types` (V2 domain) | `components/shells/membership/v2/types.ts` | `Story`, `Collaborator`, `WritingPrompt`, `RowTarget`, `RowAction` — extracted from `SidebarV2.tsx` at landing (see `v2/HANDOVER.md`). |
| `Avatar` / `IconButton` / `Button` | `components/shells/membership/ui/` | Tailwind UI primitives ported from the legacy repo, styled with the Heirloom tokens. |

Persistence note: `services/chat/ui/v1/persistence.ts` is the pure (no React,
no store dependency) localStorage buffer behind the durability behavior above.
(Moved from `app/heirloom/lib/chatPersistence.ts` in centralization Step B —
the `heirloom:chat:v1:*` storage keys are unchanged.)
Multi-thread by design — each thread is stored under its own session key
(`heirloom:chat:v1:session:<sessionId>`), pre-session threads buffer under a
single draft slot (`heirloom:chat:v1:draft`), and a lightweight index
(`heirloom:chat:v1:index`, holding `{ id, updatedAt, title? }` per thread) feeds
the currently-empty Recent sidebar and lets `findMostRecentThread` pick the
newest entry by `updatedAt`. Two removal helpers mirror each other:
`clearDraft()` drops the pre-session draft slot + its index entry (called when a
real session id arrives), and `clearSession(sessionId)` drops a session-keyed
thread + its index entry (called by New Chat so the cleared conversation is not
re-hydrated on the next mount). Every entry carries an `updatedAt` ISO timestamp,
so recovery is "most-recent wins" (the chosen resolution for the eventual
DB-vs-localStorage conflict). The store converts between its in-memory `Message`
(`timestamp: Date`) and the module's JSON-serializable `PersistedMessage`
(`timestamp: ISO string`). SSR-safe (guards `window`/`localStorage`) and
best-effort (swallows quota/serialization errors). Unit-tested in
`services/chat/ui/v1/persistence.test.ts`. **This is localStorage only — the
session create/PATCH API and the DB write path are unchanged.**

Tenant note: `/api/sage` resolves the tenant from the host. Until a Heirloom
tenant + `compiled_prompts` is configured, Heirloom chat falls back to Sage's
`DEFAULT_SYSTEM_PROMPT` (it streams, but answers as Sage). Wiring a Heirloom
tenant/prompt is a follow-up.

---

## Utilities

### Auth service (`services/auth/`)

Auth-context resolution, tenant resolution, user sync, and the Supabase client
factories live in the shared `services/auth/` layer (imported as
`@/services/auth/*`). Both `app/` and `src/` may depend on this layer; it is the
intended home for cross-cutting auth/DB plumbing.

**The provider boundary (2026-06-11).** `services/auth/` is also the
provider-agnostic auth boundary (Golden Rule, `docs/auth-service-rebuild.md`):
no file outside it imports `@clerk/*` — enforced as an ESLint `error`
(`no-restricted-imports`, override only for `services/auth/providers/clerk/**`).
Caveat: the repo-root `middleware.ts` sits outside `next lint`'s default
directories, so keep it provider-free by review. The provider is swappable by
re-pointing the entry-point re-exports at a new `providers/<name>/` folder.

Entry points (four, one per runtime context — the server barrel never exports
`'use client'` modules, same convention as `services/chat/ui/v1`):

| Entry point | Exports | Consumed by |
|-------------|---------|-------------|
| `services/auth/index.ts` (server) | `getSession()` (cheap JWT presence — `AppSession { providerUserId }`), `getCurrentUser()` (one provider backend call — normalized `AuthUser { providerUserId, email?, phone?, name?, imageUrl?, isPlatformAdmin }`), `requirePlatformAdmin()` (null unless signed-in admin), types, errors, + re-exports of the existing helpers below | API routes, server components/layouts |
| `services/auth/client.ts` (`'use client'`) | `useAuthUser()` (mirrors the provider tri-state — `isSignedIn` stays `undefined` until `isLoaded`; **never coerce while loading**, chatStore's recovery gates depend on it), `useAuthActions()` (`signOut`, `openSignIn`, `openSignUp`, `openUserProfile` — appearance passed as opaque `AuthAppearance`) | Client components (chatStore, ChatHeader, GateView, LandingNav, MessageList, MagicLinkCard, prompt-builder) |
| `services/auth/ui.tsx` (no directive — pure re-exports preserve the provider's SSR boundary markers) | `AuthProvider` (root-layout mount, stays inside `<body>`), `UserButton`, `SignInPanel`, `CaptchaSlot` (`<div id="clerk-captcha">`) | `app/layout.tsx`, admin shells, SBL sign-in page, MagicLinkCard |
| `services/auth/middleware.ts` (edge-safe leaf — never imports the index barrel) | `createAuthMiddleware` (typed passthrough; provider middleware stays outermost), `createRouteMatcher` | repo-root `middleware.ts` (whose `config.matcher` must stay a **literal** array — Next.js static analysis) |

The Clerk adapter (`services/auth/providers/clerk/`): `server.ts` (the
session/user API + `clerkAuth`/`clerkCurrentUser` re-exports for in-boundary
helpers), `client.ts` (`useAuthUser`/`useAuthActions`/`useAuthFlowAdapter`),
`ui.tsx`, `middleware.ts`, `errors.ts` (dual-channel normalization), and
`map.ts` (`mapClerkUser` + the publicMetadata `resolveIsPlatformAdmin`).
**Authorization is ours:** server-side `isPlatformAdmin` is resolved from the
Supabase `users.role` column (`resolveIsPlatformAdminFromDb` in `server.ts` —
`'platform_admin'` → true, any other role or no row → false), with a LOUD
fallback to publicMetadata if the lookup itself fails (e.g. column missing),
logging `[auth] users.role lookup failed — falling back to publicMetadata`.
Client-side `useAuthUser().user.isPlatformAdmin` still maps from
publicMetadata (browser has no service-role DB path) and gates display-only
surfaces; every privileged action is server-gated. Requires `users.role`
(text NOT NULL default `'member'`) to exist + the admin row backfilled —
Jeff's Studio work. Unit tests: `map.test.ts`, `authFlowAdapter.test.tsx`.

| Helper | File | Purpose |
|--------|------|---------|
| `getAuthContext` | `services/auth/get-auth-context.ts` | Resolves the current Clerk user to their Supabase `owner_id` and `tenant_id` via the `users.clerk_id` → `tenant_users.user_id` lookup. Multi-tenant users resolve the active tenant by request Host (falls back to `DEFAULT_ADMIN_TENANT_ID`, then the first membership). Throws `Unauthorized` / `User not found` / `Tenant not found` on failure. Used by every authenticated admin API route for tenant scoping. |
| `getTenantFromRequest` | `services/auth/get-tenant-from-request.ts` | Resolves `tenant_id` from the `Host` header of an anonymous public request. Prefers the exact host (so product subdomains like `heirloom.2bl.ai` resolve to their own tenant), then the registrable root (e.g. `app.jefflougheed.ca` → `jefflougheed.ca`), filters dev hosts (localhost, `*.local`, `127.0.0.1`), queries `tenants.domain` for a match. Returns `tenant_id` string or `null`. **Preview/dev fallback (2026-06-11):** when resolution fails AND `PREVIEW_TENANT_ID` is set AND `VERCEL_ENV !== 'production'`, returns that id instead of null — set the var in Vercel's Preview environment ONLY (it is hard-ignored in production; a real `tenants.domain` match always wins). Exists so tenant-resolved surfaces (session create, OTP E2E) are testable on `*.vercel.app` preview hosts. Unit-tested in `get-tenant-from-request.test.ts`. Used by `/api/sage/route.ts` for anonymous visitor chat — falls back to `DEFAULT_SYSTEM_PROMPT` on null. |
| `resolveTenantIdFromHost` / `normalizeHost` | `services/auth/resolve-tenant-from-host.ts` | Pure full-host exact-match helper (does NOT collapse subdomains) used by `getAuthContext` for multi-tenant host resolution. Unit-tested in `services/auth/resolve-tenant-from-host.test.ts`. |
| `syncUser` | `services/auth/sync-user.ts` | Upserts the current Clerk user into the Supabase `users` table on `clerk_id` conflict; returns the Supabase UUID or null. Called from `app/admin/layout.tsx` and from `POST /api/sessions` (to link a Heirloom session to its signed-in user). |
| `getCurrentUserId` | `services/auth/get-current-user-id.ts` | Read-only resolution of the current Clerk session to `users.id` via the `clerk_id` lookup. Unlike `getAuthContext`, requires NO `tenant_users` membership (for end-customers like Heirloom visitors, who are not admins); unlike `syncUser`, never writes. Returns null when there is no Clerk session or no matching `users` row. Used by `GET /api/sessions`. |
| `ensureClerkUser` | `services/auth/ensure-clerk-user.ts` | Upserts the current Clerk user into `users` by `clerk_id` and returns `users.id`. Unlike `syncUser`, does **not** require an email — supports phone-only Heirloom sign-ups, relying on `users.email` being nullable. Email/name/phone written only when present (`users.phone` added 2026-06-10). Leaves `syncUser`'s admin path untouched. Used by `POST /api/sessions/[id]/claim`. |
| `syncMember` | `services/auth/sync-member.ts` | Upserts a `members` row for a newly-authenticated Clerk user, syncing their email/phone from Clerk. Called once post-authentication; idempotent on re-auth. Upserts on `clerk_id` conflict with `status: 'active'`; updates `email`/`phone` only when the caller passes them (undefined = skip column). Returns `SyncMemberResult` (`{ ok: true; data: MemberRow } \| { ok: false; error: string }`). Exports `HEIRLOOM_TENANT_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56'`. Uses service-role client (server-only, bypasses RLS). |
| `claimMembership` | `services/auth/claim-membership.ts` | Creates a `pending` members row for a self-service visitor who has just authenticated via Clerk. **Never downgrades an existing row** — if a row already exists with any status, returns ok without writing. If no row exists, inserts with `status: 'pending'`. Called by `POST /api/heirloom/members/claim` after GateView sign-up. Service-role client, server-only. |
| `getAdminClient` | `services/auth/supabase-admin.ts` | Service-role Supabase client (server-only, bypasses RLS). The most widely imported factory — used by every admin route, the public Sage routes, and `services/chat/server/*`. |
| `createClient` | `services/auth/supabase.ts` (browser) / `services/auth/supabase-server.ts` (SSR cookie-aware) | Anon-key Supabase client factories. |
| `AdminUserProvider` / `useAdminUserId` | `services/auth/admin-user-context.tsx` | `'use client'` React context exposing the synced Supabase user id to the admin tree. Mounted in `app/admin/layout.tsx`. (Moved from `src/context/admin-user.tsx`.) |
| `useAuthFlow` | `services/auth/useAuthFlow.ts` | Provider-agnostic **stage machine** for the Heirloom custom OTP sign-up/sign-in flow (refactored 2026-06-11): owns stages (`idle → sending → otp_input → verifying → success/error`), contact state, the `mountedRef` guard, the `/api/auth/magic-link` validation gate (always ordered BEFORE any provider call), resend, and reset. All provider mechanics + step-by-step `auth_events` telemetry live in `useAuthFlowAdapter` (`providers/clerk/client.ts`); failure routing follows the adapter's `terminal` flag (terminal → `error`, retryable → `otp_input`). Public `UseAuthFlowReturn` unchanged — `MagicLinkCard` is the consumer. See Core 3 API reference below. |

#### Clerk Core 3 custom OTP (`services/auth/useAuthFlow.ts`)

SDK `@clerk/nextjs@7` (Core 3). All Clerk methods return `{ error: ClerkError | null }`.

**⚠️ Dual error channel (undocumented by Clerk; observed in production, PR #86):**
`signIn.emailCode.sendCode()` / `signIn.phoneCode.sendCode()` can ALSO **throw**
on HTTP 4xx responses (e.g. `ClerkAPIResponseError`) in addition to the
documented `{ error }` return. Every sendCode call site must handle **both**
channels — wrap in try/catch and normalize the thrown shape alongside the
returned one. Do not "clean up" the defensive try/catch to match Clerk's docs;
the docs do not describe the throw path.

Authoritative reference: `.agents/skills/clerk-custom-ui/core-3/custom-sign-in.md` and `custom-sign-up.md`.

**Sign-in OTP (existing user)** — no `signIn.create()`; the identifier is passed to `sendCode` (PR #85)
```typescript
const { signIn } = useSignIn()
await signIn.emailCode.sendCode({ emailAddress })   // email
await signIn.phoneCode.sendCode({ phoneNumber })    // phone
await signIn.emailCode.verifyCode({ code })         // email
await signIn.phoneCode.verifyCode({ code })         // phone
await signIn.finalize({ navigate: () => {} })       // activate session (no-op navigate for embedded)
```

**Sign-up OTP (new user)** — note `.verifications.` namespace (NOT directly on `signUp`)
```typescript
const { signUp } = useSignUp()
await signUp.create({ emailAddress | phoneNumber })
await signUp.verifications.sendEmailCode()              // email  ← NOT signUp.sendEmailCode()
await signUp.verifications.sendPhoneCode()              // phone  ← NOT signUp.sendPhoneCode()
await signUp.verifications.verifyEmailCode({ code })    // email
await signUp.verifications.verifyPhoneCode({ code })    // phone
await signUp.finalize({ navigate: () => {} })           // activate session
```

**New-vs-existing user detection:** **error-code driven** (implemented in
`useAuthFlowAdapter`, `services/auth/providers/clerk/client.ts`).
`signUp.create({ emailAddress | phoneNumber })` is attempted first. If it
succeeds → genuine sign-up (`signUp.verifications.send*Code()`). If it fails
with `form_identifier_exists` (from EITHER error channel — "That email
address / phone number is taken") → existing user → sign in **directly** via
`signIn.emailCode.sendCode({ emailAddress })` / `phoneCode.sendCode({ phoneNumber })`.

**⚠️ Do NOT use Clerk's documented `signUp.isTransferable` /
`signIn.create({ transfer: true })` mechanism as the primary path.** Observed
in production 2026-06-11 (both email and phone): `isTransferable` stayed
`false` on the create-error path for existing identifiers, so transfer-based
detection showed existing users "That email address is taken" instead of
signing them in. The error code is the dependable signal; `isTransferable` is
honored only as a secondary belt in case Clerk starts setting it.

If create fails with any other code (rate limit, invalid identifier, network),
the error is surfaced to the user — a transient failure is never misread as
"new user" (the failure mode of the old signIn-first heuristic, replaced
2026-06-11). Because `signUp.create()` runs for every attempt, the
`#clerk-captcha` div must be present for sign-ins as well — `CaptchaSlot`
renders unconditionally in the MagicLinkCard form.

**Required in sign-up form:** `<div id="clerk-captcha" />` (Clerk bot-protection; silently fails without it).

**`middleware.ts` must include** `'/__clerk/(.*)'` in its matcher array (verification callback paths).

**Known limitations (deliberate; revisit triggers noted):**
- `finalize({ navigate: () => {} })` no-op skips two documented `navigate`
  responsibilities: session-task handling (`session.currentTask`) and Safari ITP
  URL decoration (`decorateUrl`). Not an issue while MFA and session tasks are
  disabled in the Clerk dashboard — revisit if either is enabled (verified users
  would otherwise appear signed-out when a session task is pending).
- `needs_client_trust` / `needs_second_factor` sign-in statuses are unhandled
  (they fall into the generic `status_not_complete` error path). Not triggerable
  by pure OTP flows — revisit if MFA is ever enabled.
- Next.js 16 renames `middleware.ts` → `proxy.ts`. Not relevant on Next.js 15;
  the auth boundary isolates the rename to two files when the upgrade happens.

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
| `compiler.ts` | `getSystemPrompt`, `QUESTION_MODE_CONTEXT`, `DEFAULT_SYSTEM_PROMPT` (re-export) | Runtime base-prompt assembly: highest-version `compiled_prompts` row, falls back to `DEFAULT_SYSTEM_PROMPT`. Consumed by the chat orchestrator via the thin `services/chat/server/prompt.ts` re-export. |
| `compile.ts` | `compilePrompt(tenantId, promptSetId, note, expectedVersion?)` | Compiles active blocks (identity → knowledge → guardrail → process → output_format; `order`-aware) into `compiled_prompts`. Runs an early, read-only `prompt_sets` existence check (404 before spending time compiling blocks) and builds the content in JS, then delegates the entire clear/archive/write/activate sequence to a single Postgres function, **`publish_compiled_prompt`** (Studio, July 2026 atomic-publish), called once via `supabase.rpc()`. **Activation (single-live-per-type):** Publish is the only activation event, and it is unconditional — there is no "compile without activating." The RPC resolves the target prompt_set's `prompt_type_id` and `is_composer_prompt` fresh, inside its own transaction (never client-supplied), takes `pg_advisory_xact_lock` on `(tenant_id, prompt_type_id)` — serializing every publish to that slot even before any row exists to lock, which is exactly the case a row-level lock alone can't cover — clears any *other* row/set currently `status='live'` for that slot in **both** `compiled_prompts` and `prompt_sets` (demoted rows go to **`status='retired'`**, not `'draft'` — `'draft'` means genuinely never-published, and these were live a moment ago), archives the outgoing row's content + note to `compiled_prompts_history`, writes the new compiled row `status='live'`, and flips the target `prompt_sets.status` to `'live'` too. **Composer-family exclusivity, a SECOND independent rule:** when the target has `is_composer_prompt=true`, the RPC additionally takes a fixed-key advisory lock (`publish_compiled_prompt:composer_singleton`) — platform-wide, not scoped to `(tenant_id, prompt_type_id)`, since two composer sets in different type slots would never collide on the type-scoped lock — then retires any other row with `is_composer_prompt=true AND status='live'` (backed by `prompt_sets_single_composer_idx`). This is the **only** activation path for a composer prompt set — the old Platform Settings "Save" pointer is retired, see Known Gaps. **Optimistic concurrency (`expectedVersion`, July 2026):** the version the Compile & Publish modal displayed ("Will publish as vN" → vN-1), frozen client-side at modal-open time (`PublishButton.tsx`) so a background refetch while the modal is open can't silently change what's checked; threaded through `POST /api/admin/prompt/compile`'s `expected_version` body field → `compilePrompt`'s 4th param → the RPC's `p_expected_version`. If the slot's live version has moved since, the RPC raises a distinct conflict (`errcode 'P1002'`) rather than silently overwriting; null/omitted skips the check (a never-compiled slot has nothing to expect). The two partial unique indexes (`compiled_prompts_single_live_typed_idx` / `compiled_prompts_single_live_untyped_idx`) remain as a **backstop** — the advisory locks make a genuine race unreachable in normal operation, but a `23505` (same as `P1002`) still surfaces as a friendly 409 ("Another publish for this prompt type just landed — please retry") rather than a raw 500, for anything that ever writes to these tables outside this function. Backs `POST /api/admin/prompt/compile` (404 if the target prompt_set doesn't exist, 409 on `P1002`/`23505`). |
| `resolve-tenant-for-prompt-set.ts` | `resolveTenantForPromptSet(requestedSetId, authCtx, isPlatformAdmin)` | July 2026, composer-family work. `getAuthContext()` resolves tenant purely by host/session, unrelated to which `prompt_set` a request is actually acting on — fine for ordinary tenant-family sets, but a composer-family set (always owned by the SBL tenant) is silently mis-scoped unless the caller happens to already be resolved there (the common counter-example: a platform admin working from their own tenant's admin session, e.g. jefflougheed.ca). This is the one place that decision gets made: composer-family target + platform admin → override to the set's own (SBL) tenant_id; composer-family target + non-admin → `{ ok: false, status: 403 }`; anything else (no id, lookup miss, ordinary set) → `authCtx.tenant_id` unchanged. Wired into every route that can act on a specific prompt_set directly or via a block's own `prompt_set_id`: `blocks/page.tsx`, `POST /api/admin/prompt/compile`, `POST /api/admin/prompt/preview`, and the three blocks CRUD routes (`PATCH [id]`, `POST save`, `POST duplicate`). |
| `release-note.ts` | `SUMMARY_MAX`, `ChangedBlock`, `ReleaseNote`, `changedSince`, `suggestSummary`, `parseNote` | Shared release-note (July 2026) types + pure helpers for the Blocks screen's Compile & Publish modal. Deliberately NOT `server-only` (no DB/SDK calls) — imported by both the `'use client'` `CompilePublishModal.tsx` and the `POST /api/admin/prompt/compile` route, so `SUMMARY_MAX` (72 chars) and the validation in `parseNote` can never drift between client and server. `changedSince(blocks, lastCompiledAt)` derives the modal's "changed since" chip list; `suggestSummary(changed)` pre-fills the summary field from the changed blocks' `TYPE_LABELS`. |
| `blocks.ts` | `listActiveBlocks`, `updateBlock`, `createBlock`, `duplicateBlock` (+ `AuthScope`, `BlocksResult`, `BlockUpdate`, `CreateBlockInput`) | Block data-access against `blocks` (and the `content` / `chat_sessions` rows the create/duplicate flows touch). `BlockUpdate` accepts `status`, `title`, `body`, `active`, `order`. Backs the `app/api/admin/blocks/*` routes (except `blocks/chat`, a streaming composer with no block-table access). |
| `save.ts` | `saveCompiledPrompt(tenantId, prompt, checkResult)` | Manual versioned compiled-prompt save (legacy path). Formerly backed `POST /api/admin/prompt/save`, called from `PromptEditor.tsx`'s "Check & Save" button. **Orphaned as of 2026-07-27** — the Save action was removed from `PromptEditor.tsx` (see the `/admin/prompt` entry under Known Gaps); this function, its route, and `POST /api/admin/prompt/check` (which only ever gated that Save call) have no remaining caller. Left in place, not deleted — full removal/repurposing of the `/admin/prompt` screen is a separate later decision. |
| `safety.ts` | `reviewBlockBody`, `reviewMasterPrompt` (+ `CheckResult`, `CheckIssue`) | LLM safety review — single block (fail-open) backs `POST /api/admin/prompt/compile/check`; whole prompt backs the legacy `POST /api/admin/prompt/check`. |
| `composer.ts` | `streamBlocksComposer`, `streamPromptChat` (+ `BlocksComposerInput`, `PromptChatInput`) | Streaming composer flows for the admin prompt-building surface. Owns the system-prompt construction + `streamText` invocation and returns the Vercel AI SDK data-stream Response (`toDataStreamResponse`) so the composer wire format is preserved; the 502 upstream-error catch lives here. Backs `POST /api/admin/blocks/chat` (`streamBlocksComposer`, maxTokens 4000) and `POST /api/admin/prompt-chat` (`streamPromptChat`, maxTokens 800). The routes stay thin (ANTHROPIC_API_KEY guard + JSON parse). |
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
| `session.ts` | `handleSessionFinish`, `detectVisitorNameMarker`, `detectVisitorEmailMarker`, `detectVisitorPhoneMarker`, `detectEmailInText`, `detectPhoneInText` | Chat `onFinish` detection flows (server-only): token-usage accounting, calendar-offer detection, `[EMAIL:]`-marker capture (`detectVisitorEmailMarker` → lowercase → `isPlausibleEmail` → `persistVisitorEmail` to `chat_sessions.email`), `[PHONE:]`-marker capture (`detectVisitorPhoneMarker` → trim → `isPlausiblePhone` (must contain a digit and be ≥7 chars) → `persistVisitorPhone` to `chat_sessions.phone`, value kept verbatim — no normalization), a **visitor-message contact watcher**, and `[NAME:]`-marker first-name capture (`detectVisitorNameMarker` → titlecase → `isPlausibleName` → persist to `chat_sessions.visitor_name`). The **contact watcher** scans the visitor's own latest message (`visitorText`, threaded in from `streamChat` — not Sage's reply) via `detectEmailInText` / `detectPhoneInText`: free-text regex that extract + validate a raw email (lowercased, trailing punctuation stripped) or phone (normalized to E.164 — bare 10-digit → `+1…`, 11-digit leading-1 kept, leading-`+` taken as international, 8–15 digits) and persist on first match via `persistVisitorEmail` / `persistVisitorPhone` to `chat_sessions.email` / `chat_sessions.phone`. The persist helpers self-guard against overwrite and `persistVisitorEmail` / `persistVisitorPhone` return a boolean (true = wrote, false = already-set/failed). The regex fallback is **short-circuited per field**: phone/email run the marker path first, and the watcher only attempts a field whose marker write did not succeed — so a value Sage emitted as a marker is never re-derived (and possibly mis-derived) from free text. Marker + fallback run before the name flow's early returns so all capture in one turn. Name capture is **marker-only** — the Haiku extractor was removed in PR #46. No-ops when `sessionId` is null (watcher also skips when `visitorText` is empty). **Conversion event tracking** (added 2026-07-27): right after token-usage accounting, `handleSessionFinish` calls `recordConversionEvents` (`services/crm/conversion-events.ts`) with the assistant text — see that file's row below. `handleSessionFinish` now also accepts an optional `memberId` (threaded from `services/chat/server/index.ts`'s already-resolved `memberId`, null for anonymous jefflougheed visitors), passed through to `recordConversionEvents` for member attribution. Consumed by the chat orchestrator (`services/chat/server/index.ts`); imports the `TokenUsage` contract type from `services/chat/server/types`. |
| `conversion-events.ts` | `recordConversionEvents`, `overwriteConversionEventsFrom` (+ `ConversionEventType`) | `conversion_events` reads/writes — an append-only log of conversion-relevant marker fires (booking offers, contact captures) and what happened to them; see the `conversion_events` schema row for the full column list. Uses the shared service-role client (`services/auth/supabase-admin.ts`), matching `session.ts`'s own convention rather than `feedback.ts`'s local one, since `recordConversionEvents` is consumed as one more onFinish detection flow there. `recordConversionEvents({ tenantId, sessionId, memberId, text })` parses `text` via the shared marker registry (`services/chat/ui/v1/registry.ts`) and inserts one `status: 'presented'` row per matching marker, looked up through the module-local `MARKER_EVENT_TYPES` map (`BOOKING → booking_offered`, `NAME`/`EMAIL`/`PHONE → contact_captured`) — the single place a new conversion point gets added; markers with no map entry (`ARTIFACT`, `ACCOUNT_CREATE`) are silently skipped. `overwriteConversionEventsFrom(tenantId, sessionId, afterTimestamp)` flips every still-`'presented'` row created after `afterTimestamp` (ISO 8601) to `'overwritten'`; there is no message-position column on this table, so the cutoff is time-based rather than index-based (accepted as best-effort). Both functions catch and log every error internally rather than throwing — fire-and-forget by design, since nothing user-facing reads back from this table. Backs `PATCH /api/sessions/[id]/conversion-events`. |
| `sessions.ts` | `createSession`, `updateSession`, `listSessions`, `claimSession` (+ `SessionResult`, `SessionUpdateInput`, `ChatSessionSummary`) | Visitor session writes + signed-in reads. Server-role client, scoped by both `id` AND host-derived `tenant_id` (cross-tenant IDOR guard; cross-tenant id → 404). `createSession` takes an optional `userId` and writes `chat_sessions.user_id` when present (anonymous → null). `listSessions(tenantId, userId)` returns the user's sessions newest-first, scoped by `user_id` + `tenant_id`. `claimSession(tenantId, id, userId)` links an unowned session to `userId` (idempotent re-claim; 403 if owned by another) — the `userId` is always server-resolved, never client-supplied. Backs `POST` / `PATCH /api/sessions/[id]` / `GET /api/sessions` / `POST /api/sessions/[id]/claim`, which are thin (tenant + user resolution + parsing + response mapping). |
| `inbound.ts` | `getInboundChats` (+ `ChatSession`, `FeedbackCountsSummary`), `getTtftTrend` (+ `TtftTrendPoint`) | Inbound Chats triage: fetch the tenant's prospect sessions (newest first, now including `ttft_ms`), resolve idle thresholds, derive each row's read-time status, and attach that session's `message_feedback` rows (`feedback: MessageFeedbackRow[]`) + rollup counts (`feedback_counts: { up, down }`) via one bulk query keyed by session id (no N+1). Backs the `app/admin/page.tsx` Inbound Chats list (thin consumer). `getTtftTrend(tenantId)` returns the last 7 days' day-bucketed TTFT averages for the dashboard sparkline — see the day-bucketing caveat on `chat_sessions.ttft_ms` above for what this average does and doesn't represent. |
| `feedback.ts` | `upsertFeedback`, `listFeedback`, `deleteFeedbackFrom`, `resolveMemberId` (+ `MessageFeedbackRow`, `UpsertFeedbackInput`, `FeedbackResult`) | `message_feedback` reads/writes for the visitor-facing thumbs rating UI. `upsertFeedback` upserts on `(session_id, message_index)`, tenant-scoped (cross-tenant id matches no row, same IDOR guard as `updateSession`); `rating: null` clears the rating + tags/detail (toggle-off). `listFeedback` hydrates a session's ratings on mount. `deleteFeedbackFrom(tenantId, sessionId, fromIndex)` (added 2026-07-27) clears every feedback row at or beyond `fromIndex`, tenant-scoped — called by the chat engine (`services/chat/ui/v1/useChatTurn.ts` `truncateAndRedeliver`) right after editing/resending a visitor message truncates the transcript, since `upsertFeedback` keys only on `(session_id, message_index)` and a fresh reply landing at a previously-rated index would otherwise silently inherit a rating/reason/note that belonged to different, now-discarded content. `resolveMemberId` prefers the server-verified Clerk identity over a client-supplied member id, falling back to the client value when there's no Clerk session. Backs `POST`/`GET`/`DELETE /api/sessions/[id]/feedback`; bulk-read for the admin surfaces happens separately in `inbound.ts` (not through `listFeedback`, which is single-session). |
| `formatting.ts` | `formatTokens`, `formatCost` (+ `INPUT_COST_PER_MILLION`, `OUTPUT_COST_PER_MILLION`) | Token/cost formatting shared by `InboundChatsTable.tsx`, `InboundChartsDashboard.tsx`, and `SessionDrawer.tsx` — extracted so the same Anthropic pricing ($3 / 1M input, $15 / 1M output; approximate, no cache-discount or fallback-model accounting) isn't duplicated per file. |
| `index.ts` | barrel | Re-exports the public surface above. |

### Audit service (`services/audit/`)

Centralised audit and auth-event logging. Server-only. Imported as
`@/services/audit` (barrel) or `@/services/audit/types` (types only).

**Timestamp convention: all `audit_events` / `auth_events` timestamps are
stored in UTC** (`created_at timestamptz default now()` — Postgres stores the
UTC instant). Queries, reports, and any time-window filtering must convert
to/from local time explicitly; never assume rows are in the server's or
viewer's local timezone.

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `AuditAction` (const + type), `AuthEventType` (const + type), `AuditEventInput`, `AuthEventInput` | Typed action-name constants (`AuditAction.BLOCK_UPDATE = 'block.update'`, etc.) and input interfaces matching the DB schema. Eliminates magic strings at every call site. `AuthEventType` covers: `sign_up`, `sign_in`, `sign_in_failed`, `otp_sent`, `otp_verified`, `session_created`, `session_revoked`, `user_deleted`, `admin_access`, `admin_access_failed`. Member-lifecycle `AuditAction` constants added 2026-06-12: `MEMBER_INVITE_CREATED = 'member.invite_created'`, `MEMBER_INVITE_ACCEPTED = 'member.invite_accepted'`, `MEMBER_ROLE_UPDATED = 'member.role_updated'`, `MEMBER_STATUS_UPDATED = 'member.status_updated'`, `MEMBER_HARD_DELETED = 'member.hard_deleted'`. `MEMBER_INVITE_RESENT = 'member.invite_resent'` and `MEMBER_INVITE_REVOKED = 'member.invite_revoked'` back the resend/revoke routes. `MEMBER_INVITE_OPENED = 'member.invite_opened'` (added 2026-07-11, invite-link tracking) is fired fire-and-forget with `actor_type: 'anonymous'` from the public `GET /invite/[token]` redirect route — the only `AuditAction` write with no authenticated actor. |
| `audit.ts` | `logEvent(input: AuditEventInput): Promise<void>`, `logAuthEvent(input: AuthEventInput): Promise<void>` | Thin service-role writes to `audit_events` and `auth_events` respectively. **Fire-and-forget** — all errors are caught and `console.error`'d; neither function ever throws, so a logging failure never blocks or fails the originating request. Call with `void logEvent(…)` from API routes. |
| `index.ts` | barrel | Re-exports `logEvent`, `logAuthEvent`, `AuditAction`, `AuthEventType`, and both input types. |

`logEvent` is called (with `void`) from every mutating admin API route,
every platform tenant route, every session route, and the Heirloom
membership-claim route. **Every `logEvent` / `logAuthEvent` call site passes
`tenant_id` (2026-06-11):** admin routes from `authCtx.tenant_id`, public/
anonymous surfaces (including `/api/auth/log`, the Clerk webhook, and the
`get-auth-context` admin_access_failed path) via host-based
`getTenantFromRequest` resolution; the platform tenant routes also stamp the
host-resolved id (null remains possible and still reads as platform-level). `logAuthEvent` is called from
`services/auth/get-auth-context.ts` (unauthorized-access path) and from
`app/api/auth/log/route.ts` (client-side step-by-step auth flow events via
`useAuthFlow`).

The corresponding DB tables (`audit_events`, `auth_events`) must be created by
Jeff in Supabase Studio before audit rows are written. See DB_CHANGELOG.md and
the plan in `.claude/plans/` for the exact SQL. Until those tables exist, all
`logEvent` / `logAuthEvent` calls return silently (the error is swallowed).

### Members service (`services/members/`)

Member invite and lifecycle operations for the `members` table. Server-only. The `invites` table is retired — invite state now lives on `members` directly via `token` / `used_at` / `invited_name` / `status = 'invited'`. Token generation uses `crypto.randomBytes(24).toString('base64url')` (32-char URL-safe string).

| File | Exports | Purpose |
|------|---------|---------|
| `members.ts` | `createMemberInvite`, `validateMemberToken`, `linkInvitedMember`, `acceptInvite`, `hardDeleteMember` (+ `MemberInviteRow`, `MembersResult`, `HEIRLOOM_TENANT_ID`) | `createMemberInvite(tenantId, actorId, invitedName?, email?, phone?)` — inserts a members row with status='invited', generates token, writes email/phone when supplied (for contact-lock invites), stamps `invited_by = actorId` for provenance (null actor = column left unset), fires `MEMBER_INVITE_CREATED` audit. `validateMemberToken(token)` — returns the members row when the token exists and `used_at IS NULL`. `linkInvitedMember(clerkId, email)` — called on `user.created` webhook: upserts the users row, finds an invited row by email (case-insensitive), updates it with `clerk_id`, `user_id`, `status='active'`, `source='invite'`, `used_at=now()`. `acceptInvite(token, clerkUserId, supabaseUserId)` — accepts an invite by token after Clerk sign-up: finds the invited row, deletes any orphan active row that `syncMember` created (invited row had `clerk_id=null` → no upsert conflict → new active row inserted by webhook), stamps `clerk_id`, `user_id`, `status='active'`, `source='invite'`, `used_at=now()` on the original invited row. `hardDeleteMember(userId, actorId, tenantId)` — writes `MEMBER_HARD_DELETED` audit first, then deletes the users row (DB cascade removes members). |
| `index.ts` | barrel | Re-exports the public surface above. |

**Retired:** `services/invites/` (deleted). All callers updated to use `services/members` equivalents.

### Tenant service (`services/tenant/`)

Tenant management business logic (server-only). Backs the platform-admin tenant
routes as thin consumers — the routes own the `platform_admin` auth gate
(defense-in-depth), JSON parsing, and the `[id]` path param; validation +
data-access live here. Functions return a discriminated `TenantResult<T>`
(`{ ok: true; status; data } | { ok: false; status; error }`) so routes preserve
exact status codes (201/200/400/403/404/409/500), messages, and log strings.

| File | Exports | Purpose |
|------|---------|---------|
| `tenants.ts` | `createTenant`, `updateTenant`, `deleteTenant` (+ `TenantRow`, `TenantInput`, `TenantResult`) | `tenants`-table create/update/delete against the service-role client. Shared validation (name/type/slug/self-parent/domain) + parent-existence check are factored into helpers reused by create + update. Slug/domain uniqueness pre-checks plus the `23505`/`23503` race/FK catches. Backs `POST /api/platform/tenants` and `PATCH`/`DELETE /api/platform/tenants/[id]`. |
| `index.ts` | barrel | Re-exports the public surface above. **`resolveTenantConfig(host)` is DEFERRED to Step I** — it depends on `tenants.shell_type` (a Step I schema add by Jeff) and the unconfirmed `tenant_branding` columns, so per workflow rule #3 it is not built against missing schema yet. |

### Content service (`services/content/`)

Content / asset / topic business logic (server-only). Backs the admin
content-family routes as thin consumers (auth + parsing + required-field
validation + response mapping). Functions return a discriminated
`ContentResult<T>` (`{ ok: true; data } | { ok: false; status; error }`).

| File | Exports | Purpose |
|------|---------|---------|
| `assets.ts` | `extractText`, `createDocumentAsset`, `ACCEPTED_TYPES`, `MAX_FILE_SIZE` (+ `CreateDocumentAssetInput`, `DocumentAsset`) | Document ingestion. `extractText(buffer, mimeType)` extracts raw text (PDF via the Anthropic `/v1/messages` document API, DOCX via mammoth, TXT via Buffer; throws on failure). `createDocumentAsset` inserts the `content` row (`type: 'document'`), uploads the original binary to the Storage `assets` bucket at `{tenant_id}/{content_id}/{filename}`, and stamps `storage_path` — the storage steps are non-fatal (logged, not failed). Backs `POST /api/admin/assets/upload` (route owns multipart parse + size/type validation). |
| `content.ts` | `createContent`, `getContent` (+ `CreateContentInput`) | `content`-row structured create + single-row tenant-scoped read. Back `POST /api/admin/content` and `GET /api/admin/content/[id]` (404 on miss). |
| `topics.ts` | `listTopics`, `createTopic` (+ `CreateTopicInput`) | `topics`-row list (ordered by name) + create, tenant-scoped. Back `GET`/`POST /api/admin/topics`. |
| `types.ts` | `AuthScope`, `ContentResult` | Shared contracts for the service. |
| `index.ts` | barrel | Re-exports the public surface above. |

### Chat UI service (`services/chat/ui/v1/`)

The shared client-side chat engine — the marker registry + the `useChatTurn`
turn hook — consumed by **both** the jefflougheed visitor chat
(`components/shells/widget/WidgetShell.tsx`'s `WidgetShellChat`/`WidgetShellHero`)
and the Heirloom chat (`app/heirloom/`). Extracted in PRs #42–46.
The type + registry modules are server-safe (no React); `useChatTurn.ts` is a
`'use client'` hook and is intentionally NOT re-exported from the barrel, so
server consumers (e.g. the admin transcript renderer via `parseBookingCards`)
can import the registry without pulling a client module.

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `MarkerType`, `ParsedMarker`, `MarkerParseResult`, `MarkerDispatch`, `MarkerDefinition`, `MarkerRegistry`, `ChatEngineAccessors`, `UseChatTurnOptions`, `UseChatTurnReturn` | Type contracts for the marker registry and the turn hook. No React. `ChatMessage` / `ChatMode` are imported from `services/chat/server/types`, not redefined. |
| `registry.ts` | `createMarkerRegistry`, `createDefaultRegistry`, `BOOKING_MARKER`, `NAME_MARKER`, `EMAIL_MARKER`, `PHONE_MARKER`, `ACCOUNT_CREATE_MARKER` | Concrete marker registry. `createMarkerRegistry()` parses content into `{ prose, markers }`, stripping every registered marker (and its trailing incomplete fragment) from prose, collapsing blank lines. `createDefaultRegistry()` preloads every display-stripped marker. `BOOKING_MARKER` (`[BOOKING: …]`, 4 fields, `dispatch: 'client'`); `NAME_MARKER` (`[NAME: firstname]`, 1 field, `dispatch: 'server'`); `EMAIL_MARKER` (`[EMAIL: address]`, 1 field, `dispatch: 'server'`); `PHONE_MARKER` (`[PHONE: value]`, 1 field, `dispatch: 'server'`); `ACCOUNT_CREATE_MARKER` (`[ACCOUNT_CREATE: reason]`, 1 field, `dispatch: 'client'` — the membership shell renders a `MagicLinkCard` inline; stripped everywhere else). The `[CONTACT:]` marker was retired — contact capture moved to the server-side visitor-message watcher in `services/crm/session.ts`, and the marker, its `'CONTACT'` `MarkerType` member, and the Heirloom `ContactCard` are all removed. |
| `parseBookingCards.ts` | `parseBookingCards` (+ `BookingCardData`, `SageParameterPublic`, `OpenAs`) | Headless wrapper over `createDefaultRegistry()` preserving the legacy `{ prose, cards }` API and additionally returning the registry's full `markers: ParsedMarker[]` (additive — consumed by the admin transcript debug pills; existing `{ prose, cards }` consumers unchanged). Filters parsed markers to `BOOKING` and maps each to `BookingCardData`; non-BOOKING markers (e.g. `NAME`) are stripped from prose but not surfaced as cards. Server-safe (no React) so the admin transcript renderer (`app/admin/sessions/[id]/page.tsx`) and the visitor-chat components (`Chat`, `Hero`, `SageReply`, `BookingCard`, `useSageParameters`) all consume it. Moved here from `src/components/sage/parseBookingCards.ts` in centralization Step B. Unit-tested in `parseBookingCards.test.ts`. **Admin transcript debug pills**: `app/admin/sessions/[id]/page.tsx` (server component) calls `getCurrentUser()` and, only when `isPlatformAdmin` (server-resolved from `users.role`), renders each assistant message's `markers[].raw` as dark monospace `DebugPill`s below the booking cards — the page itself stays accessible to regular tenant admins; only the debug view is gated. |
| `persistence.ts` | `bufferThread`, `clearDraft`, `clearSession`, `clearTranscripts`, `readThread`, `readIndex`, `findMostRecentThread`, `toPersistedMessage(s)` (+ `PersistedMessage`, `PersistedThread`, `ThreadIndexEntry`, `PersistenceNamespace`, `DRAFT_ID`) | Pure (no React, no store) **IndexedDB** thread buffer — despite the name suggesting localStorage, it wraps `idb`/`indexedDB` and is namespaced per `PersistenceNamespace` (`'heirloom'` → the `heirloom:chat:v1` database, `'sage'` → `sage:chat:v1`), shared by **both** the Heirloom membership shell and the jefflougheed widget shell (see the Heirloom "Persistence note" above for the behavior, which applies to both namespaces identically). `toPersistedMessage` round-trips `status`/`stopped`/`versions`/`versionIdx`/`edited` alongside `id`/`role`/`content`/`timestamp` (fixed 2026-07-27 — it used to silently drop them on write); reconciling any in-flight-looking state back to settled (e.g. a revived `'sending'` status reading as `'failed'`) is `reviveUIMessage`'s job on the read side (`message.ts`), not this module's. Moved here from `app/heirloom/lib/chatPersistence.ts` in centralization Step B. Unit-tested in `persistence.test.ts`. |
| `chatReducer.ts` | `chatReducer`, `initialState`, `Message` (+ `ShellState`, `ChatAction`) | Pure Heirloom **shell** reducer (no React, no JSX) — sidebar + chat-panel open/close state (`TOGGLE_SIDEBAR` / `SET_SIDEBAR` / `OPEN_CHAT` / `CLOSE_CHAT`). Conversation state lives in the shared session (`useChatSession`); this owns only presentation/shell state, composed with the session by the membership-shell `ChatProvider`. Re-exports `Message = UIMessage`. Moved here from `app/heirloom/components/store/chatReducer.ts` in centralization Step F. Unit-tested in `chatReducer.test.ts`. |
| `useSageParameters.ts` | `useSageParameters` | Headless `'use client'` data hook (no JSX) — fetches `/api/sage/parameters` on mount and returns the public `SageParameterPublic[]` (resilient to fetch errors; returns `[]`). Consumed by the widget-shell `Hero` and `Chat` to resolve `open_as` / `embed_code` for each parsed `[BOOKING: …]` card by URL match. Moved here from `src/components/sage/useSageParameters.ts` in centralization Step E. |
| `useWidgetShell.ts` | `useWidgetShell` | The jefflougheed widget-shell presentation store — a headless module-level Zustand singleton (no JSX) owning **shell** state only: `isExpanded`, `expand(mode?)`, `collapse`, `mode`, `setMode`, `composerRef`, `setComposerRef`. Conversation state (messages/sessionId/streaming/error/mode) lives in the shared session (`useChatSession`, instanceKey `"sage"`) — NOT here. Being a module singleton is load-bearing: the overlay (`Chat`), the inline `Hero` composer, and `SectionProcess` read/write the same object, so opening the overlay from one surface is seen by the others. `expand('question')` sets `isExpanded` + `mode` together — the pairing Chat's mode-bridge depends on. Extracted from `src/lib/store.ts` (`useSageStore`) in centralization Step E; the conversation slice had already migrated to `useChatSession`, and five callerless fields (`visitorName`/`setVisitorName`, `hasGreeted`/`setGreeted`, `focusComposer`) plus the callerless `reset()` were dropped. Unit-tested in `useWidgetShell.test.ts`. |
| `useChatTurn.ts` | `useChatTurn` | Store-agnostic turn engine (`'use client'`). Takes injected `ChatEngineAccessors` (`getMessages` / `addMessage` / `updateLastMessage` / `patchMessageById` / `removeMessageById` / `truncateAfter` / `setStreaming` / `setSessionId` / `getSessionId` / `getMode?`) and owns one turn end-to-end: append user message → lazily create a session (`POST /api/sessions`) → stream from `/api/sage` (via the shared `readDataStream`) → persist the transcript (`PATCH /api/sessions/[id]`, `visitorName: null`). Returns `{ send, sendHidden, retry, stop, regenerate, setActiveVersion, editMessage, resendMessage, isStreaming, errorType }`. `errorType` classifies why the most recent turn didn't complete normally (`ChatErrorType`: `network` / `rate_limited` / `stream_interrupted` / `auth_error` / `unknown` / `user_stopped`, `services/chat/ui/v1/types.ts`) — `null` when it succeeded. On a failure the hook tags the failed message (the user message for `send`/`retry`/`editMessage`/`resendMessage`, the assistant placeholder for `sendHidden`/`regenerate`) with `UIMessage.error_type` and PATCHes `/api/sessions/[id]` with `last_error_type`, so both the per-message and per-session classification reach the DB (previously the PATCH never fired on a failed turn). `user_stopped` (2026-07-28) goes through the identical classify → banner → persist path when the visitor hits Stop, rather than a special-cased silent branch — see "Stop / interrupted-turn protocol" below. Each surface's error banner renders the matching string from `components/chat/errorCopy.ts`. `editMessage(messageId, text)` / `resendMessage(messageId)` (added 2026-07-27) truncate the transcript forward from a visitor message (via `truncateAfter`) and re-deliver it — `editMessage` also replaces its content and sets `UIMessage.edited`; both share the `truncateAndRedeliver` internal, hard-cancel any in-flight turn synchronously before mutating (sequencing rule: a stream token arriving after truncation must never write into a message that no longer exists), and fire a fire-and-forget `DELETE /api/sessions/[id]/feedback?fromIndex=N` for every index the truncation drops (`services/crm/feedback.ts` `deleteFeedbackFrom`) so a new reply can never silently inherit a rating that belonged to different, now-discarded content. Rendered by `components/chat/UserMessageActions.tsx` (Edit/Copy/Send again row) + `components/chat/EditableUserBubble.tsx` (the in-place editing textarea), wired into `components/shells/membership/MessageList.tsx`. jefflougheed (via `ChatSessionProvider`/`useChatSession`, `instanceKey="sage"`) and Heirloom (`useReducer` via `ChatProvider`) both consume it by wrapping their store in `ChatEngineAccessors`. |
| `bufferMarkdown.ts` | `bufferMarkdown` | Pure, no-React function that truncates a streaming assistant message at the earliest unresolved inline markdown token (unterminated bold/italic run, inline code span, code fence, or link/image bracket — including an in-progress `[BOOKING: …` marker, since an unclosed marker bracket is just an unclosed `[`). Plain prose with no markdown syntax always passes through unchanged; emphasis delimiters gate on CommonMark's flanking rule (opener must not be followed by whitespace) so a `* bullet` list marker is never misread as an opening `*`. Unit-tested in `bufferMarkdown.test.ts`. |
| `useBufferedMarkdown.ts` | `useBufferedMarkdown` | Thin `'use client'` `useMemo` wrapper over `bufferMarkdown` — `(content, active) => string`. Returns `content` unchanged once `active` is false (the message is no longer the one being streamed into). Consumed by `ChatThread.tsx`'s internal `BufferedMarkdown` component, not called directly by either chat surface. |
| `index.ts` | barrel | Re-exports the type contracts + the registry runtime (`createMarkerRegistry`, `createDefaultRegistry`, `BOOKING_MARKER`, `NAME_MARKER`, `EMAIL_MARKER`, `PHONE_MARKER`, `ACCOUNT_CREATE_MARKER`). `useChatTurn` and `useBufferedMarkdown` are imported directly from their modules, not the surface. |

#### Stop / interrupted-turn protocol (2026-07-28)

When the visitor hits Stop, whatever text had already streamed in — including
none at all — is **always kept** in that assistant message's own `content`
and tagged `UIMessage.stopped = true` (`useChatTurn.ts`'s `finishAbortedTurn`).
This is what renders the "Stopped" badge in the transcript
(`MessageActions.tsx`, `SessionDrawer.tsx`) and is what's persisted to
`chat_sessions.messages`. **One path regardless of timing (2026-07-28):**
`finishAbortedTurn` previously branched on `content === ''` — an empty
placeholder was deleted outright rather than tagged, so a Stop hit before the
first token arrived left **zero trace** of the turn ever having been
attempted: no error, no badge, no `last_error_type`, nothing in
`chat_sessions.messages` beyond the visitor's own message. That branch is
removed; every Stop, at any point in the stream, now goes through the
identical `stopped: true` + `error_type: 'user_stopped'` tagging.

**`'user_stopped'` is the 6th `ChatErrorType`** (`services/chat/ui/v1/types.ts`
— alongside `network` / `rate_limited` / `stream_interrupted` / `auth_error` /
`unknown`), with its own `errorCopy.ts` entry ("You stopped the response.").
It is not a failure — the visitor deliberately cancelled — but it's modeled
as a class in the same system rather than a special-cased silent branch, so a
Stop gets the exact same treatment every other non-completion gets: `send()`/
`sendHidden()`/`retry()` call `setErrorType('user_stopped')` and
`persist(..., 'user_stopped')` on abort (previously these calls were skipped
entirely for Stop, which is how it stayed silent), writing
`chat_sessions.last_error_type = 'user_stopped'` through the same
`updateSession` path as the other 5. `regenerate()`'s abort handling is a
separate implementation (doesn't call `finishAbortedTurn`) that already
restores the prior good version when nothing new streamed rather than losing
data — that content-preservation logic is intentionally unchanged; only the
banner/persist calls were added there for consistency. The user message's
delivery `status` stays `'sent'` on every Stop path — cancelling generation
was never a delivery failure, so that part is untouched.

**What changed:** how that partial text is resent to the model on the
*next* turn. Claude 4.5 tolerated a truncated assistant turn being replayed
verbatim as if it were a complete reply. **Sonnet 4.6+ (the model this
codebase runs on) does not** — replaying a `stopped` assistant message as a
normal history turn gives the model no signal its own prior reply was cut
short, so it "continues" as though it had already finished speaking, which
produces worse continuations than telling it explicitly. The fix is
`toModelMessages()` (`services/chat/ui/v1/message.ts`): when building the
wire-format `ChatMessage[]` sent to `/api/sage`, a `stopped: true` assistant
turn's **role slot stays in the array** — its content is swapped for a short
neutral `STOPPED_PLACEHOLDER` rather than the visitor's own cut-off words —
and the verbatim partial text is folded into the *next user* turn as a
`[SYSTEM: ...]`-tagged continuation note instead (reusing the codebase's
existing hidden-system-content convention — see `dispatchSystemSignal` in
`chatStore.tsx`).

**Correctness fix (2026-07-28):** an earlier version of this function
*dropped* the stopped assistant turn from the array entirely instead of
keeping its role slot. That broke strict user/assistant role alternation,
which the Anthropic Messages API requires: the message that prompted the
now-stopped reply stayed in the array as its own `user` entry, and with the
assistant turn removed, the very next entry was the fold — also `role:
'user'` — producing two consecutive `user` entries with no `assistant`
between them. Every send following a stop-with-content would have sent
malformed history to Anthropic. Caught during review, not in production;
fixed by keeping the placeholder instead of dropping the turn.
`message.test.ts` has an explicit invariant test (`toModelMessages` >
"never produces two consecutive same-role entries") covering this going
forward.

This is a **wire-only transform** — `send()`/`sendHidden()`/`regenerate()`
call `toModelMessages()` only when building the array passed to
`streamTurn()`/`/api/sage`; the message actually added to the store
(`accessors.addMessage`) and persisted (`persist()` reads
`accessors.getMessages()`, never the model-facing array) is untouched. The
`[SYSTEM: ...]` tag therefore never reaches `chat_sessions.messages` and
never renders in any transcript view (widget shell, Heirloom `MessageList`,
admin `SessionDrawer`) — the existing `[SYSTEM:]` admin-debug branch in
`MessageList.tsx` only inspects stored messages, which this content never
becomes. The one residual risk this doesn't eliminate: the model could in
principle quote the note back verbatim in its reply; the note explicitly
instructs it not to as a mitigation, but this is a prompt-following
expectation, not a code-level guarantee.

`reviveUIMessage()` (`message.ts`) was fixed in the same pass to carry
`stopped`/`versions`/`versionIdx`/`status` through on read-back — it
previously dropped all four, so the "Stopped" badge and this continuation
logic (which keys off `stopped`) both silently broke after a page reload or
in the admin transcript view even though the DB row had the data.

On a genuine stream **error** (not Stop), the existing behavior is already
correct and was not changed: the partial text is wiped to `''` before
persisting, and `retry()` resends the pre-failure context — nothing more.

**Server-side abort propagation.** Stop previously only cancelled the
client's own `fetch` — the server had no `AbortSignal` at all, so the
Anthropic call kept generating to completion after the visitor had stopped
listening, billing for the full generation and still running `onFinish`
(token accounting + `[NAME:]`/`[EMAIL:]`/`[PHONE:]` marker detection, calendar-
offer detection) against text the visitor explicitly cut off and never
confirmed.

**First attempt (2026-07-28, since replaced): threading `Request.signal`
through.** The initial fix threaded the inbound `Request.signal`
(`app/api/sage/route.ts`) through `streamChat()` into `runChatStream()`'s
`abortSignal` (`services/chat/server/stream.ts`), which passes straight into
`streamText()`'s own `abortSignal` — verified against the installed
`ai@3.4.33` source that the AI SDK forwards it to the provider's `doStream()`
call, correctly cancelling the upstream request and correctly preventing
`onFinish` from firing on an aborted stream. This was sound in principle, but
**live-tested and confirmed broken on this deployment**: the client correctly
recorded every Stop (`chat_sessions.last_error_type = 'user_stopped'`
populated as expected), but `server_abort_confirmed_at` stayed null after a
real mid-stream Stop — the server kept generating the full response
regardless. Root cause, as far as it can be determined from code:
`middleware.ts` runs on every `/api/sage` request (its matcher includes
`/(api|trpc)(.*)`) and reconstructs the request via Next.js's internal
header-forwarding mechanism (`x-middleware-override-headers`, confirmed in
the installed `next` package's source) rather than passing a live object
through — a `Headers` object is just strings, structurally incapable of
carrying a live `AbortSignal` reference across that hop. Whatever `req.signal`
the route handler ends up with is tied to a separate internal edge→function
request, not reliably to the original browser connection. This is plausible,
not certain — confirming it definitively would need Vercel-internal
visibility neither Jeff nor Claude Code has from this environment — but it
matches the observed behavior exactly, and it's why the fix stopped depending
on `Request.signal` at all rather than trying to patch around it.

**Current mechanism: explicit client-driven signal, server-side poll.**
Since connection-level disconnect detection can't be trusted here, the client
tells the server explicitly instead — an ordinary new HTTP request, which
doesn't have the cross-hop reliability problem a connection-state signal
does. `useChatTurn.ts`'s `stop()` now fires an immediate
`PATCH /api/sessions/[id]` with `{ stop_requested: true }` the instant Stop is
clicked (alongside its existing `abortControllerRef.current?.abort()`, which
only cancels the client's own fetch and was never the part that was broken).
`updateSession` (`services/crm/sessions.ts`) stamps
`chat_sessions.stop_requested_at` using the *server's* clock — never a
client-supplied timestamp, to avoid clock skew between the client and
whichever server instance later polls it.

`streamChat()` (`services/chat/server/index.ts`) captures `turnStartedAt` at
the top of the function and builds its own `AbortController` via
`createServerAbortController`, which can be triggered by either of two
independent paths:
1. **The poll (reliable, load-bearing):** a `setInterval` every 500ms reads
   `stop_requested_at` for this session and aborts if it's set *and newer
   than `turnStartedAt`* — comparing against the turn's own start time,
   rather than requiring a reset write between turns, is what stops a stale
   flag left over from an earlier stopped turn from false-triggering a later,
   unrelated one.
2. **`req.signal` (best-effort, not load-bearing):** kept wired as a zero-cost
   bonus — if this deployment's request pipeline ever does propagate a real
   disconnect onto it, it aborts immediately instead of waiting for the next
   poll tick. Confirmed not to be what's actually catching Stops today.

Whichever path fires first stops the other (the poll included, so it doesn't
keep querying after the turn is already cancelled) and writes
`chat_sessions.server_abort_confirmed_at` — unchanged from the original
design, just now fed by a mechanism proven to actually fire. `runChatStream`'s
catch block still distinguishes an `AbortError` (quiet `499`) from a genuine
upstream failure (`502`).

**Accepted trade-offs:** worst case ~500ms of continued generation after
Stop is clicked (bounded by the poll interval, a large improvement over
running to full completion, but not instant), plus roughly one extra
lightweight DB read per 500ms of generation time per in-flight turn. Both
are the direct cost of not being able to trust the platform's own connection
state — tighten the interval if faster cutoff is worth more polling reads.

**Still open:** this design hasn't yet been retested live. The mechanism is
built specifically to not depend on the thing that was confirmed broken, but
"should work now" and "confirmed working" are different claims — the same
DB check applies (click Stop mid-reply, query `server_abort_confirmed_at` for
that session afterward) and needs to actually happen before this is proven.

**`components/chat/ChatThread.tsx`** — the shared message-list presentation component consumed by both the jefflougheed widget shell (`WidgetShell.tsx`) and the Heirloom membership shell (`MessageList.tsx`). Owns: the message loop + per-assistant-message marker parsing (`createDefaultRegistry().parse`), scroll-to-bottom behavior (see the per-surface props below), and — as of the shared markdown renderer — markdown rendering itself. Each caller supplies render "slots" (`renderUserMessage`, `renderAssistantMessage`, `renderError`, `renderStreamingIndicator`) plus a `markdownComponents` (react-markdown `Components`) map for its own styling; `ChatThread` calls `registry.parse(msg.content)` for every assistant message, buffers the resulting prose through `useBufferedMarkdown` (only for the last message while `isStreaming` — every earlier, settled message renders in full), renders it via an internal `BufferedMarkdown` sub-component (`<ReactMarkdown components={markdownComponents}>`), and passes the rendered node to `renderAssistantMessage(msg, parsed, markdown)` as a third argument. `BufferedMarkdown` is a real component (not a bare hook call inside `.map`) so `useBufferedMarkdown`'s `useMemo` call stays legal under the Rules of Hooks. The widget's `SageReply.tsx` renders the passed-through `markdown` node inside its existing wrapper div (no longer calls `ReactMarkdown` itself; `sage/markdownComponents.tsx` is unchanged). Membership's `MessageList.tsx` renders it via a new `AssistantMarkdownBubble` (same avatar/bubble chrome as `MessageBubble`, markdown owns its own block spacing) using the new `components/shells/membership/markdownComponents.tsx` — Heirloom's first markdown-rendering surface (warm-prose styling on the existing Heirloom Tailwind tokens: `text-primary`/`text-muted`/`accent`/`surface`/`border`; no table/strikethrough overrides — not needed, and inert without `remark-gfm`). Smoke-tested in `ChatThread.test.tsx`. `renderError: (retry, errorType) => ReactNode` receives the classified `ChatErrorType` (`errorType` prop, `null` when the last turn succeeded) alongside `retry`; both surfaces' implementations render the matching string from `components/chat/errorCopy.ts`'s `ERROR_COPY` map rather than one generic message.

**`core/` — session + keyboard infrastructure**

| File | Exports | Purpose |
|------|---------|---------|
| `core/store.ts` | `createChatSessionStore`, `ChatSessionStore`, `ChatSessionState`, `HydrateInput` | Pure, framework-agnostic conversation store backed by `zustand/vanilla`. Holds `messages`, `sessionId`, `isStreaming`, `errorType`, `mode`. No shell/presentation state. |
| `core/store-registry.ts` | `getSingletonStore`, `hasSingletonStore`, `__resetSingletonStore`, `__clearSingletonRegistry` | Module-level singleton registry (client-only). Same `instanceKey` in → same store out. Throws on the server. |
| `core/useChatSession.ts` | `useChatSession`, `ChatSession`, `ChatSessionConfig` | Core hook: resolves the backing store (singleton if `instanceKey` provided, otherwise ref-local isolated), builds `ChatEngineAccessors` (including `truncateAfter`, added 2026-07-27), calls `useChatTurn` once, exposes `send` / `sendHidden` / `retry` / `stop` / `regenerate` / `setActiveVersion` / `editMessage` / `resendMessage` / `setMode` / `hydrate` / `reset` plus the full `ChatSession` state. One provider → one engine. |
| `core/ChatSessionProvider.tsx` | `ChatSessionProvider`, `useChatSessionContext` | React context wrapper. `ChatSessionProvider` calls `useChatSession` once; surfaces call `useChatSessionContext()`. Throws outside a provider. |
| `core/useKeyboardViewport.ts` | `useKeyboardViewport`, `UseKeyboardViewportOptions`, `UseKeyboardViewportReturn`, `KeyboardViewportMeasurement`, `KeyboardViewportState` | Shared iOS visual-viewport hook for both chat shells. Listens to `visualViewport` resize/scroll events; returns `{ height, offsetTop, keyboardOpen, sync }`. Optional `lockBodyScroll` (freezes `document.body` while active, restores scroll position on deactivate), `trackViewport: false` (scroll-lock only, no VV listeners — used by the Chat overlay), and `onViewportChange` callback for reflow-free CSS-var writes without a React re-render. SSR-safe; no-ops on browsers without the VisualViewport API and when `active: false`. See `docs/chat-shells.md` §3 for per-surface wiring details. |

### Shared utilities (`services/shared/`)

Cross-cutting, brand-agnostic helpers with no chat/auth/prompt coupling.
Headless (no JSX). Imported as `@/services/shared/*`.

| Helper | File | Purpose |
|--------|------|---------|
| `formatRelativeTime` | `time.ts` | Pure render-time relative-timestamp formatter (`"just now"`, `"2d ago"`, …) — see brackets in the file's doc comment. SSR-safe (no interval ticking). Consumed by the admin Block cards/rows (`components/admin/content/BlockCard.tsx`, `BlockRow.tsx`). Moved here from `src/lib/time.ts` in centralization Step B. Unit-tested in `time.test.ts`. |
| `useReveal` | `useReveal.ts` | Headless scroll-reveal hook (no JSX) — returns a ref; an `IntersectionObserver` (threshold 0.15) adds the `visible` class on first intersection then disconnects. Consumed by the jefflougheed public site (the widget-shell `Chat`, plus `Problem`/`Session` in `app/(jefflougheed)/components/`). Moved here from `src/hooks/useReveal.ts` in centralization Step E (clears the `app→src` warnings on Problem/Session). |

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
| `/api/admin/prompt/compile` | POST | Compiles all active blocks for the resolved tenant into the master prompt — tenant is resolved via `resolveTenantForPromptSet(prompt_set_id, authCtx, isPlatformAdmin)` (July 2026), not blindly `authCtx.tenant_id`, so a platform admin publishing a composer-family set gets the SBL tenant regardless of their own session tenant (403 for a non-admin targeting a composer set). Orders by compile sequence (identity → knowledge → guardrail → process → output_format); within each type, blocks with `order > 0` come first ascending by order, then blocks with `order` = 0 or null come last ordered by title ascending. Logs the final compile sequence (title, type, order) before joining. Joins bodies with double newlines. **Requires `note` in the body** (July 2026 — `{ summary, why?, changed_block_ids? }`; validated server-side by `parseNote`, `services/prompt/release-note.ts` — 400 `{ error: 'A release summary is required.' }` when missing/invalid/over 72 chars). Archives the previous `compiled_prompts` row (content + its own release-note fields) to `compiled_prompts_history` and increments the version, writing the new `note` onto the row. **Unconditionally activates** (July 2026, single-live-per-type — see `compile.ts` above): clears any other row/set live for the same `(tenant_id, prompt_type_id)` slot in both `compiled_prompts` and `prompt_sets`, then marks the new compiled row and the target `prompt_set` both `status='live'`. 404 when `prompt_set_id` doesn't resolve to a set in this tenant; 409 (friendly message) on an activation race caught by the partial unique index. Returns `{ success, version, tokenCount, content, updatedAt }`. |
| `/api/admin/prompt/compile/check` | POST | LLM-based safety review of a single block body. Takes `{ body: string }`, returns `{ ok: boolean, issues: [{ description: string, offendingText: string \| null }] }`. Server-side verbatim guard: every returned `offendingText` is validated against `body.includes()` and nulled if not a real substring. Fails open to `{ ok: true, issues: [] }` on any error so the save flow is never blocked. |
| `/api/admin/prompt/save` | POST | Manual save path for the master prompt (legacy). Takes `{ prompt, checkResult }`, tenant-scoped, archives previous version to history, increments version. **Orphaned as of 2026-07-27** — its only caller (`PromptEditor.tsx`'s "Check & Save" button) was removed; see Known Gaps. Route left in place, unreachable from any UI. |
| `/api/admin/prompt/check` | POST | Safety check for an entire system prompt (legacy, used by the old prompt save flow). Returns `{ pass, issues }`. **Orphaned as of 2026-07-27** alongside `/save` above, same reason. |

### Blocks

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/blocks` | GET | Returns active blocks (`id, title, type, body, is_default`) for the authenticated tenant. Filters `active = true`, ordered by type then title. Used for the Composer's existing-blocks context. |
| `/api/admin/blocks/[id]` | PATCH | Updates block `status`, `title`, `body`, or `order`. Validates status against `'active' \| 'disabled' \| 'deleted'`; `title` must be non-empty after trim (400 if empty); `order` must be an integer. Keeps the legacy `active` boolean in sync with `status` so the Composer GET doesn't surface disabled or deleted blocks. Tenant-scoped, but not blindly by `authCtx.tenant_id` — first resolves the block's own `prompt_set_id` (unscoped lookup) through `resolveTenantForPromptSet` (July 2026), so a composer-family block still scopes correctly for a platform admin whose session tenant isn't SBL. |
| `/api/admin/blocks/save` | POST | Creates a new block (Composer draft confirmation flow + the manual New Block modal). **Body is the only required field**; `title` / `type` / `topic_id` are optional and stored null when omitted (400 only when `body` is missing). Tenant scope for the insert goes through `resolveTenantForPromptSet(body.prompt_set_id, ...)` (July 2026) — same composer-family override as `[id]` above. |
| `/api/admin/blocks/duplicate` | POST | Duplicates an existing block (`{ source_id }`). Resolves the source block's own `prompt_set_id` (unscoped lookup) through `resolveTenantForPromptSet` (July 2026) before the tenant-scoped duplicate, same composer-family override as `[id]`/`save` above. |
| `/api/admin/blocks/chat` | POST | Streaming chat route for the Composer. Accepts `{ type, topic, content, messages, documentContext?, existingBlocks? }`. Returns a Vercel AI SDK data stream. Thin consumer of `streamBlocksComposer` (`services/prompt/composer.ts`) — route owns only the ANTHROPIC_API_KEY guard + JSON parse. |

### Sage Parameters

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/sage-parameters` | GET | Returns all `sage_parameters` rows (`id, tenant_id, key, value, label, description, cta_label, url, open_as, embed_code, updated_at`) for the authenticated tenant, ordered by `key`. 401 when `getAuthContext()` fails. |
| `/api/admin/sage-parameters` | PATCH | Upserts a single parameter for the authenticated tenant. Accepts `{ key, label, description?, cta_label?, url?, value?, open_as?, embed_code? }` (strings except `embed_code` which may be string or null; `description` max 60 chars, `cta_label` max 20 chars; `open_as` one of `'new_tab' \| 'popup'`, default `'new_tab'`). Upsert uses `onConflict: 'tenant_id, key'` and stamps `updated_at` on write. 401 when `getAuthContext()` fails, 400 on invalid body. |
| `/api/admin/sage-parameters/[key]` | DELETE | Deletes the parameter matching `{ tenant_id, key }` for the authenticated tenant. 401 when `getAuthContext()` fails, 400 on missing key, 500 on Supabase error. |

### Prompt Sets

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/prompt-sets` | GET | Returns the authenticated tenant's `prompt_sets` rows as an **unwrapped** `PromptSet[]` (`id, tenant_id, label, description, status, is_composer_prompt, is_default, prompt_type_id, version, created_at, updated_at`), ordered `created_at desc`. **Excludes composer-family rows by default** (`.not('is_composer_prompt', 'is', true)`, added July 2026) — this is the ordinary tenant Settings screen; composer sets are managed exclusively from Platform Settings + Blocks, even for the SBL tenant itself. **`?include_composer=true` skips that exclusion** (added July 2026) for the one other caller that shares this route: the Composer editor's own "Building in" picker (`app/admin/prompt-builder/page.tsx`), which IS the composer-authoring context and needs to see composer-family sets — SBL's only `prompt_set` is one, so without this param that picker rendered nothing at all on SBL. Consumed unfiltered by the Settings `PromptSets` panel's fetch and with `include_composer=true` by the Composer picker's fetch. 401 on auth failure, 500 on DB error. |
| `/api/admin/prompt-sets` | PATCH | Upsert. Body `{ id?, label, description, status, prompt_type_id }`. With `id` → tenant-scoped update (404 if the id isn't in the tenant); without `id` → insert (`version`/`is_composer_prompt`/`is_default` from DB defaults). `version`/`is_composer_prompt`/`is_default`/timestamps are server-owned and never written. `prompt_type_id` can be assigned regardless of status — a draft may carry a type — it is only *required* non-null when `status === 'live'` (400 otherwise); when non-null it is validated to belong to the tenant's `prompt_types` (400 otherwise). Writes `PROMPT_SET_UPSERT` audit. |
| `/api/admin/prompt-sets/[id]` | DELETE | Deletes one set scoped to the session tenant (404 if not found). Returns `{ ok: true }`. Writes `PROMPT_SET_DELETE` audit. |

### Prompt Types

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/prompt-types` | GET | Returns the authenticated tenant's `prompt_types` rows (`id, key, name, description, sort_order`), ordered by `sort_order` (nulls last) then `name`. Feeds the `PromptSets` panel's "Used as" type selector. 401 on auth failure, 500 on DB error. |
| `/api/admin/prompt-types` | POST | Creates a prompt type inline from the panel's "＋ New type…" affordance. Body `{ name }`; `tenant_id` from session, `key` slugified from `name` (lowercase, non-alphanumerics → `_`, trimmed). Returns the new row (201). 400 on missing/invalid name, 409 on duplicate `(tenant_id, key)`. |

### Tenant Settings

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/tenant-settings` | GET | Returns `{ chat_in_progress_idle_seconds, chat_active_idle_seconds, invite_gate_enabled }` for the authenticated tenant. `invite_gate_enabled` is read from `tenants.settings` JSONB (default `true` when key absent). 401/404/500 as above. Consumed by `ChatThresholds` (Settings page) and `InvitesManager` (Invites page). |
| `/api/admin/tenant-settings` | PATCH | Accepts any subset of `{ chat_in_progress_idle_seconds, chat_active_idle_seconds, invite_gate_enabled }`. Threshold fields validated as before. `invite_gate_enabled` (boolean) is merged into `tenants.settings` JSONB via read-modify-write. Returns the persisted shape on success. 400 when no valid fields provided. |

### Platform Members (platform admin only)

All routes gate on `user.isPlatformAdmin` from `getCurrentUser()`. Audit rows written via `logEvent` (fire-and-forget).

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/platform/members/invite` | POST | Creates a members row with `status='invited'`, a generated token, and `expires_at` stamped `INVITE_TTL_DAYS` (14) out (`createMemberInvite`). Body: `{ tenant_id, invited_name?, email?, phone? }`. Optional email/phone are stored on the members row for contact-lock invites (used by `linkInvitedMember` for email-match activation via the webhook path). Looks up `tenants.domain` for the tenant and returns `{ token, member_id, invite_url }` where `invite_url = inviteUrlFor(token, domain)` → `'https://{domain}/invite/{token}'` (null when no domain configured). Backs `InviteMemberModal`. |
| `/api/platform/members/invite/resend` | POST | Regenerates the invite token for a member with `status IN ('invited','waitlist')`, resetting invite-tracking (`opened_at: null, opens: 0, revoked_at: null`) and stamping a fresh `expires_at` so the new link starts clean. Setting `status='invited'` on update promotes a waitlist member. Body: `{ member_id }`. Returns `{ token }`. |
| `/api/platform/members/invite/[memberId]` | GET | Returns the live `InviteLink` view model (`toInviteLink`) for the member drawer's on-open refetch. 404 if the row or its token is missing. |
| `/api/platform/members/invite/[memberId]` | DELETE | Hard-deletes a members row that has no linked users row (`user_id IS NULL`). Writes `MEMBER_HARD_DELETED` audit before delete. Guards against deleting rows that already have a users row. Returns 204. Distinct from the soft revoke below — this permanently removes the row. |
| `/api/platform/members/invite/[memberId]/revoke` | POST | Soft-revokes the invite: stamps `revoked_at` (does not delete the row). Refuses once `used_at` is set (409 — already accepted). Writes `MEMBER_INVITE_REVOKED` audit; returns the updated `InviteLink`. The token then 410s at `GET /invite/[token]` and is rejected by `validateMemberToken`/`acceptInvite`. |
| `/api/platform/members/roles` | PATCH | Updates role for one or more tenant memberships of a given user. Body: `{ user_id, changes: [{ tenant_id, role }] }`. Validates role against `owner\|admin\|member\|viewer`. Sequential updates; returns 207 with `failed_tenant_ids` on partial failure. One `MEMBER_ROLE_UPDATED` audit per change. |
| `/api/platform/members/status` | PATCH | Bulk status change across all memberships of target users. Body: `{ user_ids: string[], status }`. `PROTECTED_STATUSES = {deleted}` — never overwritten. Filters eligible memberships, bulk updates, one `MEMBER_STATUS_UPDATED` audit per affected row. |
| `/api/platform/members/[userId]` | DELETE | Hard-deletes a users row. DB cascade removes members, chat_sessions, etc. Writes `MEMBER_HARD_DELETED` audit before delete. 204 on success. |

**Tenant-admin mirrors:** `/api/admin/members/invite`, `/api/admin/members/invite/resend`, `/api/admin/members/invite/[memberId]` (GET/DELETE), and `/api/admin/members/invite/[memberId]/revoke` (POST) mirror the platform routes above one-for-one, scoped to the authenticated admin's own tenant via `getAuthContext()` (`.eq('tenant_id', authCtx.tenant_id)` on every query) instead of the `isPlatformAdmin` gate. Consumed by `app/admin/members/page.tsx` (`inviteApiBase="/api/admin/members"`).

**Retired:** `/api/admin/invites` (GET, POST) and `/api/admin/invites/[id]` (DELETE) are deleted. `/api/heirloom/invites/use` is deleted.

### Platform Settings → Composer Prompt + Tenant Prompts (platform admin only)

Backs the `/platform/settings` page. All routes gate on `getCurrentUser().isPlatformAdmin` (403 else; the `(platform)` layout already redirects non-admins, this is defense-in-depth).

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/platform/prompt-sets` | GET | Cross-tenant superset of prompt sets, now the full enriched row (not just the old lightweight Master Prompt picker shape) — `is_composer_prompt`, `is_default`, `prompt_type_id`, `version`, timestamps, plus derived compile meta (`block_count`/`last_compiled_at`/`compiled_version`), plus camelCase `tenantId`/`tenantName` aliases for back-compat. Sorted by tenant name then label. Backs both the Composer Prompt list (filtered client-side to `is_composer_prompt === true`) and the Tenant Prompts card (unfiltered). |
| `/api/platform/prompt-sets` | PATCH | Cross-tenant upsert. Body `{ id?, tenant_id?, label, description, status, prompt_type_id, is_composer_prompt? }`. With `id` → update (any tenant; `is_composer_prompt` may not be supplied here — 400 if it is). Without `id` → insert; `is_composer_prompt: true` is accepted **only as the literal boolean `true`** (July 2026, UK-4) — when present, `tenant_id` is ignored and hardcoded to the SBL/platform tenant (the create modal has no Tenant field), and `status` is forced to `'draft'` regardless of what's supplied. A composer set may still carry a `prompt_type_id` like any ordinary set — the flag is a pure category marker, unrelated to type. Writes `PROMPT_SET_UPSERT` audit (includes `is_composer_prompt` in metadata). |
| `/api/platform/prompt-sets/[id]` | DELETE | Cross-tenant delete, no confirmation beyond the client modal — no server-side guard against deleting a live, default, or composer-family set. Writes `PROMPT_SET_DELETE` audit. |
| `/api/platform/settings/master-prompt` | GET | Returns `{ promptSetId }` — the `prompt_sets` row with `is_composer_prompt = true AND status = 'live'` (or null). Read-only as of July 2026 (composer-family work) — see Known Gaps for the retired `PUT`. |

### Heirloom Invites

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/heirloom/invites/accept` | POST | Accepts an invite token for the currently signed-in Clerk user. Body: `{ token: string }`. Requires Clerk session (401 if not signed in). Resolves the Supabase `users.id` for the clerk_id; calls `acceptInvite(token, clerkUserId, supabaseUserId)` from `services/members`; writes `MEMBER_INVITE_ACCEPTED` audit event. Returns `{ ok: true }` on success. Called by `ChatProvider` on the false→true `isSignedIn` transition when the visitor arrived with a valid `?invite=TOKEN`. |

### Content / Assets

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/assets/upload` | POST | Multipart upload for documents (PDF, DOCX, TXT). Extracts text via Anthropic (PDF) or mammoth (DOCX) or direct Buffer read (TXT), inserts a `content` row with `type: 'document'`, uploads the original binary to the Supabase Storage `assets` bucket at `{tenant_id}/{content_id}/{filename}`, and updates the content record with the storage path. Thin consumer of `services/content` (`extractText` + `createDocumentAsset`); route owns auth + multipart parse + size/type validation. |
| `/api/admin/content` | POST | Creates a content row from structured input. Thin consumer of `services/content` (`createContent`). |
| `/api/admin/content/[id]` | GET | Returns a single content record by id, tenant-scoped. Used to fetch uploaded document raw text. |
| `/api/admin/topics` | GET, POST | Lists and creates topics for the authenticated tenant. Thin consumer of `services/content` (`listTopics` / `createTopic`). |

### Public

| Route | Method | Purpose |
|-------|--------|---------|
| `/invite/[token]` | GET | Public, unauthenticated. Not under `/api` — the invite-link tracking hinge (Option B). Looks up `members` by `token`; 404 if not found, 410 if `revoked_at` is set. When `used_at IS NULL`, stamps `opened_at` (last-open semantics — updated on every hit, not just the first) and increments `opens`; skipped once the invite is accepted. `expires_at` is read but not enforced. Fires `MEMBER_INVITE_OPENED` (fire-and-forget, `actor_type: 'anonymous'`), then 302s to `/?invite={token}` on the same host — the existing Heirloom gate flow (`app/heirloom/page.tsx`) consumes that query param unchanged. Never rewritten under a product segment on any host (see `isInvitePath` in Middleware). |
| `/api/sage` | POST | Public visitor chat. Resolves tenant via `getTenantFromRequest(req)`, reads the highest-version `compiled_prompts` row for that tenant, and — when a tenant is resolved — also fetches all `sage_parameters` rows for that tenant and appends a "Booking cards" section to the system prompt containing one `[BOOKING: label \| description \| cta_label \| url]` line per parameter. Section is omitted when no parameters exist. Also accepts an optional `mode` field in the request body; when `mode === 'question'`, appends the `QUESTION_MODE_CONTEXT` string to the end of the system prompt (after the booking section) so Sage skips the name-ask/discovery phase and answers directly. The master prompt content itself is never modified — question mode is additive context only. All other modes (absent, unknown) leave the prompt unchanged. Streams the Anthropic response. Falls back to `DEFAULT_SYSTEM_PROMPT` when no tenant is resolved or no compiled_prompts row exists. **Client-disconnect cancellation (added 2026-07-27):** the route forwards the incoming `Request.signal` to `streamChat` (`ChatStreamRequest.signal`, `services/chat/server/types.ts`) → `runChatStream` (`abortSignal`, `services/chat/server/stream.ts`) → `streamText`'s own `abortSignal` option, so a client-side abort (Stop, or `editMessage`/`resendMessage`'s hard-cancel of an in-flight turn) actually stops the model call rather than letting it keep generating in the background. `streamText` does not call `onFinish` for an aborted call, so `handleSessionFinish`/`recordConversionEvents` never runs for a turn nobody's waiting on — closes the race where an abandoned reply's marker could insert a `conversion_events` row after `truncateAndRedeliver`'s overwrite cleanup already ran. Unit-tested in `services/chat/server/stream.test.ts` (verifies the signal is forwarded to `streamText`; the SDK's/model's actual abort behavior once received is trusted, not re-tested). |
| `/api/sage/parameters` | GET | Public read for the visitor chat renderer. Resolves tenant via `getTenantFromRequest(req)` and returns `[{ key, label, description, cta_label, url, open_as, embed_code }]` for that tenant (no admin fields, no `value`). Returns `[]` when no tenant is resolved or on DB error — never 4xx/5xx so client rendering stays resilient. Consumed by the widget-shell `WidgetShellChat` and `WidgetShellHero` (`components/shells/widget/WidgetShell.tsx`, both via `useSageParameters`) to resolve `open_as` / `embed_code` for each parsed `[BOOKING: ...]` card by URL match. |
| `/api/sessions` | GET, POST | Anonymous visitor chat sessions (tenant from Host). **GET** lists the signed-in user's sessions for the tenant, newest first (`getCurrentUserId` + `listSessions`); returns `{ sessions: [] }` for anonymous/unresolved requests so the client stays resilient. **POST** creates a session and, when a Clerk user is signed in, links it via `chat_sessions.user_id` (`syncUser` → upsert `users`, no `tenant_users` membership); anonymous creates leave `user_id` null. Backs the Heirloom localStorage→DB recovery + Recent sidebar. |
| `/api/sessions/[id]` | PATCH | Persists a session's `messages` (+ `visitor_name` when non-empty, + optional `phone` / `email`, each written to its own `chat_sessions.phone` / `chat_sessions.email` column) and marks it `in_progress`. Only supplied fields are written, so a contact-only PATCH (no messages) never clobbers the transcript. The `phone` / `email` fields are still accepted, but the Heirloom contact card that sent them was removed — visitor contact is now captured server-side in `onFinish` by the visitor-message watcher (which writes the columns directly, not via this PATCH). Also accepts `last_error_type` — written to `chat_sessions.last_error_type` only when it is one of the known `ChatErrorType` values, including `user_stopped` (never explicitly cleared back to null on a successful turn); fired by `useChatTurn.ts`'s `persist()` on a failed or stopped turn. Also accepts `stop_requested` (boolean) — when `true`, stamps `chat_sessions.stop_requested_at` with this server's own clock (never a client-supplied timestamp); fired immediately by `useChatTurn.ts`'s `stop()` the instant Stop is clicked, so `streamChat()`'s poll (`services/chat/server/index.ts`) can detect it without depending on the unreliable `Request.signal` propagation — see "Stop / interrupted-turn protocol". Scoped by `id` + host-derived `tenant_id` (cross-tenant → 404). |
| `/api/sessions/[id]/claim` | POST | Links an anonymous session to the now-signed-in user. Resolves the user **server-side** from the active Clerk session (`ensureClerkUser`, no client-supplied `user_id` → no IDOR) and stamps `chat_sessions.user_id` (`claimSession`, scoped by `id` + host `tenant_id`). 401 when no Clerk session. **Now client-orphaned** — its only caller (the Heirloom `ContactCard` inline phone/OTP sign-up) was removed; the route is retained, reversible, for a future signed-in flow (account creation is deferred). |
| `/api/heirloom/members/claim` | POST | Creates a `pending` membership record for the signed-in Clerk user (`claimMembership`). Called by `GateView.handleClaimSuccess` after MagicLinkCard sign-up completes. Idempotent — existing rows (any status) are left unchanged. Returns 401 when no Clerk session, 500 on DB error. |
| `/api/heirloom/members/waitlist` | POST | Public, unauthenticated. Accepts `{ email: string }`, inserts a members row with `status='waitlist'` for `HEIRLOOM_TENANT_ID`. Idempotent — if a row with that email already exists (any status), returns 200 without writing. Email stored lowercased, trimmed. Returns 400 on missing/invalid email, 500 on DB error. Called by `WaitlistView` in `GateView` when the visitor has no invite token. |
| `/api/auth/log` | POST | Client-side auth event logger. Accepts `{ event_type, outcome, failure_reason?, metadata? }`, `await`s `logAuthEvent()` (writing to `auth_events` via service-role client), then returns `{ ok: true }`. Called fire-and-forget from `useAuthFlow` with `keepalive: true` so events survive page navigation. Extracts `ip_address`, `user_agent`, and `correlation_id` from request headers, and stamps `tenant_id` via `getTenantFromRequest(req)` (host-resolved, nullable — 2026-06-11). Returns 400 when `event_type` is missing; 500 on DB error (swallowed at the client). |
| `/api/webhooks/clerk` | POST | Clerk webhook receiver. Verifies the Svix signature (`CLERK_WEBHOOK_SECRET` env var, registered in Clerk dashboard → Webhooks). Maps Clerk event types to `auth_events` rows via `logAuthEvent`: `user.created` → `sign_up`, `user.deleted` → `user_deleted`, `session.created` → `session_created`, `session.revoked` → `session_revoked`. Uses the `svix-id` header as the idempotency key (`svix_event_id` unique constraint on `auth_events` silently absorbs duplicate deliveries). Stamps `tenant_id` via `getTenantFromRequest(req)` — resolves from the domain the webhook endpoint is registered under; nullable (2026-06-11). Unmapped event types return 200 without logging. Returns 400 on signature verification failure. |

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

### `[EMAIL: address]` — dispatch `server`

- Captures the visitor's email. **Server detection**:
  `detectVisitorEmailMarker` (`services/crm/session.ts`) scans the final
  assistant message in `handleSessionFinish`, lowercases, runs `isPlausibleEmail`
  (single `@`, dotted domain, no internal whitespace), and persists to
  `chat_sessions.email` via `persistVisitorEmail` (self-guards against
  overwriting an already-captured email). Stripped from prose client-side (not
  rendered). The email block runs **before** the name flow's early returns in
  `handleSessionFinish`, so name and email both capture in one turn. Emission is
  driven by the contact-capture instruction in `DEFAULT_SYSTEM_PROMPT`
  (`services/prompt/sage-prompt.ts`) — required for fallback-prompt surfaces
  (e.g. Heirloom) that have no tenant `compiled_prompts`.

### `[PHONE: value]` — dispatch `server`

- Captures the visitor's phone. **Server detection**:
  `detectVisitorPhoneMarker` (`services/crm/session.ts`) scans the final
  assistant message in `handleSessionFinish`, trims, runs `isPlausiblePhone`
  (must contain a digit and be at least 7 chars), and persists the value
  **verbatim** (no normalization) to `chat_sessions.phone` via
  `persistVisitorPhone` (self-guards against overwriting an already-captured
  phone). Stripped from prose client-side (not rendered). The phone block runs
  alongside the `[EMAIL:]` block, **before** the name flow's early returns in
  `handleSessionFinish`, so all of name / email / phone can capture in one turn.
  Mirrors `[NAME:]` / `[EMAIL:]` exactly. (Phone is also captured independently
  from the visitor's own message by the visitor-message contact watcher; both
  paths share the self-guarded `persistVisitorPhone`.)

### `[ACCOUNT_CREATE: reason]` — dispatch `client`

- Signals the membership shell (Heirloom) to render a `MagicLinkCard` inline
  below the assistant prose, with `reason` (e.g. `claim_membership`) passed
  through to the card. Parsed by `ACCOUNT_CREATE_MARKER`
  (`services/chat/ui/v1/registry.ts`) and consumed by
  `components/shells/membership/MessageList.tsx`. Stripped from prose in every
  other context (widget shell, admin transcript) via `createDefaultRegistry()`.

### `[CONTACT: phone]` — **retired**

- The `[CONTACT:]` marker, its `'CONTACT'` `MarkerType` member, and the entire
  Heirloom `ContactCard` + `CAPTURE_CONTACT` store flow (including the inline
  Clerk phone/OTP sign-up + client `claimSession` call) have been removed.
  Heirloom contact capture now happens server-side via the **visitor-message
  contact watcher** (`detectPhoneInText` / `detectEmailInText` in
  `services/crm/session.ts`), which scans the visitor's own typed message for a
  phone/email rather than relying on Sage emitting a trigger marker and the
  visitor filling in an inline card.
- **Account creation is deferred.** The server-side claim infrastructure
  (`POST /api/sessions/[id]/claim`, `claimSession` in `services/crm/sessions.ts`,
  `ensureClerkUser`) is left in place but is now **client-orphaned** — no surface
  calls it. It is retained, reversible, for a future signed-in flow rather than
  torn out.

**Open behavior** (`open_as` / `embed_code`): The bracket syntax only
carries `label | description | cta_label | url` — `open_as` and
`embed_code` are intentionally excluded (embed snippets contain HTML/JS
with characters that'd break pipe delimiting, and we don't want the LLM
copying them verbatim). Instead, both `WidgetShellChat` and `WidgetShellHero`
(`components/shells/widget/WidgetShell.tsx`) fetch `/api/sage/parameters`
via `useSageParameters` and match each parsed card to a parameter by `url`:
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

## Contact Capture Architecture

Contact capture uses two sequential paths with short-circuit logic:

1. Marker detection (primary) — scans Sage's response for [PHONE:],
   [EMAIL:], [NAME:] markers emitted per prompt instructions. Runs first.
   If a value is found, passes validation, and is written successfully,
   the fallback is skipped for that field.

2. Regex watcher (fallback) — scans the visitor's own message for
   phone numbers and emails. Only runs if the marker path found nothing
   or failed to write.

Design decisions:
- Sequential not parallel — eliminates format conflicts between paths
- Short-circuit — marker wins if it captures and writes a valid value
- Self-guarded writes — once a field is written, neither path overwrites it
- Validation before write — isPlausiblePhone/isPlausibleEmail reject
  malformed values, allowing the fallback to try
- persistVisitorEmail and persistVisitorPhone return boolean — true means
  a fresh write occurred and the fallback is skipped; false means already
  set or failed, fallback still runs but self-guards

---

## Database Schema

All tables are multi-tenant. Every data access must respect `tenant_id`.
Row Level Security is enforced at the Supabase layer.

| Table | Key Columns |
|-------|-------------|
| `tenants` | id, parent_id, name, slug, type, settings, domain (text), chat_in_progress_idle_seconds (integer NOT NULL default 300 — idle threshold in seconds before an `in_progress` chat flips to `active`), chat_active_idle_seconds (integer NOT NULL default 86400 — idle threshold in seconds before an `active` chat flips to `abandoned`) |
| `tenant_users` | tenant_id, user_id, role |
| `users` | id, clerk_id, email (text, nullable — phone-only sign-ups have no email), name (text, nullable), phone (text, nullable — added 2026-06-10; synced from Clerk by the webhook + `ensureClerkUser`), role (text NOT NULL default 'member' — `'platform_admin'` drives server-side `isPlatformAdmin`; see Auth service), deleted_at (timestamptz, nullable — soft-delete stamp set by the Clerk webhook on `user.deleted`), status (text NOT NULL default 'active': 'active' \| 'deleted' — added 2026-06-11; set to 'deleted' by the Clerk webhook on `user.deleted` alongside `deleted_at`) |
| `blocks` | id, topic_id, owner_id, tenant_id, type, title, body, active, status (text default 'active': 'active' \| 'disabled' \| 'deleted'), order (integer, nullable — actively used: within each type, blocks with `order > 0` sort ascending by order, blocks with `order` = 0 or null sort last by title ascending; consumed by `/api/admin/prompt/compile` and the Blocks page inline Order input), is_default (bool default false), default_edited_at (timestamptz), default_edited_by (uuid references users(id)), default_action (text: 'edited' \| 'deleted'), default_acknowledged (bool default false), default_acknowledged_at (timestamptz), created_at (timestamptz), updated_at (timestamptz NOT NULL default now() — auto-set on every UPDATE via the `blocks_updated_at_trigger` Postgres trigger; do not write client-side), updated_by (uuid references users(id), nullable — application-managed; PATCH `/api/admin/blocks/[id]` stamps it from `authCtx.owner_id` on every write; null for legacy rows), scope (text NOT NULL default 'runtime': 'platform' \| 'composer' \| 'runtime' — added 2026-06-18; `platform` = 2BL-owned defaults flowing to all tenants, `composer` = Prompt Studio Composer UI blocks never compiled into runtime, `runtime` = existing blocks that compile into the tenant Sage prompt; default 'runtime' so all pre-existing blocks are valid without backfill), prompt_set_id (uuid, nullable — added 2026-06-18 as `prompt_type_key`, renamed `prompt_type_key` → `prompt_set_key` → `prompt_set_id` 2026-06-25; null = shared across all prompt types, non-null = block only compiles into the matching prompt set's prompt type) |
| `topics` | id, tenant_id, type, name |
| `content` | id, owner_id, tenant_id, block_id, type, name, raw, storage_path |
| `chat_sessions` | id, tenant_id, visitor_name, messages, status, message_count (integer, GENERATED ALWAYS AS `jsonb_array_length(messages)` STORED — read-only, always reflects messages array length), session_type (text default 'prospect': 'prospect' \| 'composer' \| 'client'), session_subtype (text nullable: 'block' \| 'wizard'), block_id (uuid references blocks(id)), reviewed (boolean NOT NULL default false — owner-set triage flag indicating whether Jeff has reviewed this chat), input_tokens (integer NOT NULL default 0 — cumulative input tokens consumed by this session, visitor + system; incremented server-side in `onFinish` via `persistTokenUsage` from the main `streamText` turn — the Haiku name-extractor was removed in PR #46), output_tokens (integer NOT NULL default 0 — cumulative output tokens generated by Sage in this session; incremented from the same `persistTokenUsage` helper), calendar_offered (boolean NOT NULL default false — flips to true the first time Sage emits a booking-card line or a raw `calendly.com` URL in the streamed response; set server-side from `/api/sage/route.ts` `onFinish` via `scanForCalendarOffer` + `persistCalendarOffered`, pre-checked to short-circuit once true), corrective_feedback (text, nullable — non-canonical, slated for retirement when reinforcement loop ships; canonical store is the `chat_corrections` table), email (text, nullable — visitor email captured on a chat session; added 2026-05-25. Populated server-side in `onFinish` two ways: via `detectVisitorEmailMarker` + `persistVisitorEmail` when Sage emits an `[EMAIL: address]` marker, and via the visitor-message contact watcher (`detectEmailInText` → `persistVisitorEmail`) scanning the visitor's own message; both self-guard against overwrite. Existing rows + anonymous write path unaffected), phone (text, nullable — visitor phone captured on a chat session; added 2026-05-29 in Studio. Populated server-side in `onFinish` three ways: via `detectVisitorPhoneMarker` + `persistVisitorPhone` when Sage emits a `[PHONE: value]` marker (value kept verbatim), via the visitor-message contact watcher (`detectPhoneInText` → `persistVisitorPhone`, normalized to E.164), and by the Heirloom contact-card PATCH; all self-guarded against overwrite. Existing rows + anonymous write path unaffected), user_id (uuid, nullable, FK → users(id) — links a session to a signed-in end-customer for cross-device DB recovery; added 2026-05-28 with index `idx_chat_sessions_user_id_updated` on `(user_id, updated_at DESC)`. Written by `POST /api/sessions` via `syncUser` when a Clerk user is signed in, and by `POST /api/sessions/[id]/claim` via `ensureClerkUser` (the claim route is retained but now client-orphaned — the Heirloom inline phone/OTP sign-up that called it was removed); null for anonymous sessions, so the anonymous path is unaffected. NOTE: phone-only sign-ups require `users.email` to be nullable — `ensureClerkUser` inserts a `users` row without an email), ttft_ms (integer, nullable — time-to-first-token for a turn, in milliseconds; added 2026-07-14. Measured client-side in `useChatTurn.ts`'s `send()` (from the initial user send to the first streamed chunk, `performance.now()`), sent on the turn-completion `PATCH /api/sessions/[id]` call, and written by `updateSession` (`services/crm/sessions.ts`) — overwritten on every turn, so it reflects the latest turn, not a self-guarded first-turn value. `sendHidden()`/`retry()` do not measure or send it. **Admin surfacing note (2026-07-15):** because this is a single overwritten value with no per-turn history, `getTtftTrend` (`services/crm/inbound.ts`) can only produce a *day-bucketed proxy* trend for the Inbound Chats dashboard sparkline — each day's point averages "the latest known ttft_ms among sessions touched that day," not a true intra-day average across every turn. For the same reason, the session drawer (`SessionDrawer.tsx`) renders the TTFT badge only on the most recent assistant message, since the stored value can only ever correspond to that turn), last_error_type (text, nullable — the classified `ChatErrorType` of the most recent turn that didn't complete normally (`network` \| `rate_limited` \| `stream_interrupted` \| `auth_error` \| `unknown` \| `user_stopped`); added 2026-07-14, `user_stopped` added 2026-07-28. Written by `useChatTurn.ts`'s `persist()` via `PATCH /api/sessions/[id]` → `updateSession` only when a turn ends in one of these 6 classes — a normally-completed turn does not clear a prior value, so this reflects the most recent *non-completion* (failure or a visitor-initiated Stop), not the most recent turn's outcome), server_abort_confirmed_at (timestamptz, nullable — added 2026-07-28 in Studio. Diagnostic ground truth, entirely separate from `last_error_type`: written server-side, not by the client, the instant `streamChat()`'s server-side abort actually fires (see `createServerAbortController` in `services/chat/server/index.ts`). Exists specifically because `last_error_type: 'user_stopped'` only proves the *client* observed a Stop; this proves the *server's* abort-cancellation handler actually ran, checkable directly in the DB with no Vercel log/dashboard access needed. Always overwritten on each occurrence, not self-guarded, so it reflects the latest Stop attempt, not a first-ever one), stop_requested_at (timestamptz, nullable — added 2026-07-28 in Studio. The reliable trigger for the above: confirmed live that the inbound `/api/sage` request's own `AbortSignal` does not reliably propagate the client's disconnect to the server (see `server_abort_confirmed_at`'s note and the "Stop / interrupted-turn protocol" section), so the client instead tells the server explicitly. `useChatTurn.ts`'s `stop()` PATCHes this via the ordinary `PATCH /api/sessions/[id]` route the instant Stop is clicked; `updateSession` stamps it with the *server's* clock, never a client-supplied timestamp. `streamChat()` polls it every 500ms while a turn streams, comparing against that turn's own start time so a stale flag from an earlier, already-finished turn can never false-trigger a later one. Always overwritten, not self-guarded) |
| `message_feedback` | id (uuid, PK), session_id (uuid, FK → chat_sessions), tenant_id (uuid, FK → tenants), member_id (uuid, nullable, FK → members — null for an anonymous jefflougheed visitor), message_index (integer, NOT NULL — 0-indexed position in that session's `chat_sessions.messages` array, counting both user and assistant turns; matches the index the admin transcript renders each message at), rating (text NOT NULL: `'up' \| 'down'`), tags (text[], default `'{}'` — reason chips), detail (text, nullable — free-text note), created_at (timestamptz), updated_at (timestamptz). Unique on (session_id, message_index) — one rating per message, upserted. Written by the visitor-facing widget (thumbs rating UI, `POST /api/sessions/[id]/feedback` → `upsertFeedback`, `services/crm/feedback.ts`); read there via `listFeedback`, and in bulk (all sessions in one query) by `getInboundChats` (`services/crm/inbound.ts`) for the admin Inbound Chats table/dashboard/drawer. |
| `conversion_events` | id (uuid, PK), tenant_id (uuid, NOT NULL), session_id (uuid, NOT NULL, FK → chat_sessions), member_id (uuid, nullable — null for an anonymous jefflougheed visitor), event_type (text NOT NULL: `'booking_offered' \| 'contact_captured'`), marker_type (text NOT NULL: `'BOOKING' \| 'NAME' \| 'EMAIL' \| 'PHONE'`), status (text NOT NULL default `'presented'`: `'presented' \| 'accepted' \| 'ignored' \| 'overwritten'` — `'accepted'`/`'ignored'` are reserved, not yet written by any code path; there is no completion signal, e.g. a calendar booking confirmation, to key them off yet), created_at (timestamptz), updated_at (timestamptz). Added 2026-07-27 in Studio. **No upsert, no unique row identifier** — every marker fire is its own row (unlike `message_feedback`'s upsert-on-`(session_id, message_index)`); multiple offers in one session produce multiple `'presented'` rows. Index: `idx_conversion_events_tenant_type_status` on `(tenant_id, event_type, status)`. Written by `recordConversionEvents` (`services/crm/conversion-events.ts`), called from `handleSessionFinish` (`services/crm/session.ts`) as one more onFinish detection flow — scans the assistant reply via the shared marker registry (`services/chat/ui/v1/registry.ts`) and inserts one `'presented'` row per matching marker, looked up through a `MARKER_EVENT_TYPES` map (the single place a new conversion point gets added). Updated to `'overwritten'` by `overwriteConversionEventsFrom`, called from `PATCH /api/sessions/[id]/conversion-events?after=<ISO timestamp>` — fired fire-and-forget by `useChatTurn.ts`'s `truncateAndRedeliver` alongside the `message_feedback` cleanup, whenever editing/resending a visitor message truncates the transcript. No message-position column exists on this table, so the cutoff is time-based (the truncated-from message's own timestamp) rather than index-based like `message_feedback`'s `fromIndex` — accepted as best-effort, not a source of truth. |
| `chat_corrections` | id, session_id, tenant_id, block_id, jeff_note. Documented and exists in DB but currently unused — reserved for the reinforcement loop sprint. |
| `do_not_engage` | id, owner_id, tenant_id, content, version |
| `invites` | **Retired 2026-06-12; code deleted 2026-06-13.** Invite state has moved to the `members` table (`token`, `used_at`, `invited_name`, `status='invited'`, `source`). The table still exists in Supabase but is no longer read or written by application code — `services/invites/` is deleted; `app/api/admin/invites/` is deleted; `app/admin/invites/` is deleted. The table may be dropped by Jeff in Studio once confirmed unused. |
| `compiled_prompts` | (renamed from `master_prompt` in Studio 2026-06-28) id, tenant_id, content, version, safety_check_result, updated_at (timestamptz), last_safety_check (timestamptz), key (text, nullable — supports multiple prompt engines per tenant differentiated by key, e.g. 'base' / 'editor' / 'onboarding'; existing rows with `key` = null are unaffected. Unique constraint `compiled_prompts_tenant_key_unique` on (tenant_id, key)), prompt_set_id (uuid, nullable — the brief `prompt_type_key`/`prompt_set_key` column was dropped 2026-06-25 as an empty ghost; `compiled_prompts.prompt_set_id` already existed and is canonical; identifies which prompt set this compiled prompt serves; null = default prompt, no filtering), description (text, nullable — added 2026-06-18; human-readable label for the admin UI, e.g. "Base prompt — compiled 2026-06-18"; null for pre-existing rows), release_summary (text, nullable — added 2026-07-27; required-at-the-application-layer one-line imperative release-note summary for the Compile & Publish modal's stage 3, validated by `services/prompt/release-note.ts`'s `parseNote` client + server, 72-char cap; null for rows compiled before this column existed), release_why (text, nullable — added 2026-07-27; optional longer "why" for the same release note), release_changed_block_ids (text[], default '{}', added 2026-07-27 — ids of the blocks the note covers, derived client-side from blocks edited since the set's `last_compiled_at`, never typed by the author), status (text NOT NULL default 'live': 'live' \| 'draft' \| 'retired' — added in Studio, applied by 2026-07-28; `retired` added alongside the composer-family work to distinguish "was live, just demoted by a newer publish" from `draft` ("never published") — see `compile.ts`; single-live-per-type activation. `getSystemPrompt` (`compiler.ts`) filters runtime reads to `status = 'live'` as of 2026-07-28 — see Known Gaps for the remaining type-awareness gap), prompt_type_id (uuid, nullable, FK → prompt_types.id — added in Studio, applied by 2026-07-28; denormalized from the parent `prompt_set.prompt_type_id` at compile time rather than joined, same pattern as `prompt_set_id`; null = the untyped/default slot. Two partial unique indexes enforce at most one live row per slot: `compiled_prompts_single_live_typed_idx` on (tenant_id, prompt_type_id) WHERE status='live' AND prompt_type_id IS NOT NULL, and `compiled_prompts_single_live_untyped_idx` on (tenant_id) WHERE status='live' AND prompt_type_id IS NULL) |
| `compiled_prompts_history` | (renamed from `master_prompt_history` in Studio 2026-06-28) id, prompt_id, tenant_id, content, version, release_summary (text, nullable, added 2026-07-27), release_why (text, nullable, added 2026-07-27), release_changed_block_ids (text[], default '{}', added 2026-07-27) — mirrors the three `compiled_prompts` release-note columns above so archiving a version on the next compile preserves that version's note; `compilePrompt()` reads the outgoing row's note fields and copies them into the history insert before overwriting the live row with the new note |
| `sage_parameters` | id (uuid), tenant_id (uuid), key (text), value (text — legacy, not surfaced in UI), label (text — card title), description (text, max 60 chars — card subtitle), cta_label (text, max 20 chars — button text), url (text — booking URL), open_as (text default 'new_tab': 'new_tab' \| 'popup' — controls how the CTA opens on the visitor chat booking card), embed_code (text, nullable — JS/HTML snippet executed on click when `open_as = 'popup'`; ignored otherwise), updated_at (timestamptz). Unique constraint on (tenant_id, key). |
| `tenant_model_config` | tenant_id (uuid), provider (text default 'anthropic'), model_id (text — primary chat model), model_id_fallback (text — circuit-breaker fallback), max_tokens (integer default 1000), rate_limit_requests_per_hour (integer default 100). Per-tenant model configuration; `services/chat/server/stream.ts` `resolveModelConfig()` reads it when a row exists, falling back to code defaults otherwise. Added 2026-05-23. |
| `tenant_branding` | tenant_id (uuid, FK → tenants) plus per-tenant branding fields (logo, palette/colours, fonts). ⚠️ Exact column list to be confirmed from Studio. Per-tenant theming so each storefront/admin surface can be styled from data rather than hardcoded tokens. Added 2026-05-24. |
| `artifacts` | id (uuid, PK), tenant_id (uuid, FK → tenants), user_id (uuid, FK → users), session_id (uuid, FK → chat_sessions), type (text — e.g. 'memory' for Heirloom; general-purpose across tenants), title (text), body (text), metadata (jsonb), status (text: 'draft' \| 'published'), created_at (timestamptz), updated_at (timestamptz). Created in Studio 2026-05-25; **not yet wired to chat** (pending PR). |
| `artifact_media` | id (uuid, PK), artifact_id (uuid, FK → artifacts), type (text), url (text), filename (text), mime_type (text), size (integer), created_at (timestamptz). Media attached to an `artifact`. Created in Studio 2026-05-25; **not yet wired to chat** (pending PR). |
| `members` | id (uuid, PK), clerk_id (text, unique, nullable — the Clerk user id `user_...`; null for invited rows before sign-up; renamed from `clerk_user_id` on 2026-06-11), user_id (uuid, nullable, FK → users.id — linked after sign-up; null for pending-invite rows), tenant_id (uuid, FK → tenants — scopes the member to a product tenant), role (text, NOT NULL, default 'member' — `owner\|admin\|member\|viewer`), name (text, nullable — display name supplied during sign-up; written via `syncMember`), email (text, nullable — synced from Clerk on auth; also written at invite creation when admin supplies it; used to match invited rows in `linkInvitedMember`), phone (text, nullable — synced from Clerk on auth; also written at invite creation when admin supplies it), status (text, default 'active' — `active\|invited\|waitlist\|suspended\|deleted`), source (text, nullable — `'invite'` when the member joined via an invite token; stamped by `acceptInvite` and `linkInvitedMember`; null for self-service / waitlist sign-ups), token (text, unique, nullable — 32-char base64url invite token; set on `createMemberInvite`, consumed by `acceptInvite`), used_at (timestamptz, nullable — stamped by `acceptInvite` or `linkInvitedMember` when the invited user signs up), invited_name (text, nullable — display name stored at invite-creation time; shown in GateView personalization and ChatHero personalized greeting), invited_by (uuid, nullable, FK → users.id ON DELETE SET NULL — added 2026-07-10; the acting admin who created the invite, stamped by `createMemberInvite`; null = seeded/self-service/waitlist, renders as a dimmed dash in the members UI; never backfilled), opened_at (timestamptz, nullable — added 2026-07-11, invite-link tracking; last redirect hit at `GET /invite/[token]`, not first — updated on every open until the invite is accepted), opens (integer, nullable — added 2026-07-11; cumulative redirect-hit count, incremented on every `GET /invite/[token]` hit while `used_at IS NULL`), expires_at (timestamptz, nullable — added 2026-07-11; stamped `INVITE_TTL_DAYS` (14 days) out on invite create/resend; read at the redirect route but **not yet enforced**), revoked_at (timestamptz, nullable — added 2026-07-11; stamped by the `POST .../invite/[memberId]/revoke` soft-revoke endpoints; non-null ⇒ the token 410s at `GET /invite/[token]` and is rejected by `validateMemberToken`/`acceptInvite`), created_at (timestamptz), updated_at (timestamptz). Heirloom membership record created/updated on each authentication via `syncMember` (`services/auth/sync-member.ts`). Invited-only rows (user_id IS NULL) created via `createMemberInvite` (`services/members/members.ts`). Heirloom tenant_id: `20767f1d-1148-4e43-ab73-f6da88f0ac56`. See `app/admin/members/inviteLink.ts` (`toInviteLink`) for the row → `InviteLink` view-model mapping used by the member-drawer timeline (Option B). |
| `audit_events` | id (bigint generated always as identity), product_id (text, nullable — 'sage' \| 'heirloom' \| 'platform'), tenant_id (uuid, nullable — null = platform-level event), actor_id (uuid, nullable — users.id), actor_type (text default 'user': 'user' \| 'system' \| 'anonymous'), actor_email (text, nullable), clerk_user_id (text, nullable — Clerk correlation id, separate from actor_id), action (text — namespaced noun.verb e.g. 'block.update'; see `AuditAction` constants in `services/audit/types.ts`), target_type (text, nullable — 'block' \| 'tenant' \| 'session' etc.), target_id (text, nullable), outcome (text default 'success': 'success' \| 'failure'), ip_address (inet, nullable), user_agent (text, nullable), correlation_id (uuid, nullable — from `x-correlation-id` middleware header), changes (jsonb, nullable — `{before, after}` where relevant), metadata (jsonb NOT NULL default '{}'), created_at (timestamptz NOT NULL default now() — UTC). PK: (id, created_at). **Append-only** — BEFORE UPDATE/DELETE triggers raise an exception; UPDATE/DELETE/TRUNCATE revoked from all non-service-role roles. RLS enabled: tenant admins read own rows; platform admins read all. ⚠️ Must be created by Jeff in Supabase Studio before audit rows are written. |
| `auth_events` | id (bigint generated always as identity), tenant_id (uuid, nullable), clerk_user_id (text, nullable), actor_id (uuid, nullable — users.id when resolved), email (text, nullable — claimed email, may be unverified on failure), event_type (text — 'sign_up' \| 'sign_in' \| 'sign_out' \| 'otp_sent' \| 'otp_verified' \| 'sign_in_failed' \| 'mfa_failed' \| 'session_created' \| 'session_revoked' \| 'admin_access' \| 'admin_access_failed' \| 'user_deleted' \| 'password_reset'), outcome (text default 'success'), failure_reason (text, nullable), ip_address (inet, nullable), user_agent (text, nullable), correlation_id (uuid, nullable), svix_event_id (text, unique — idempotency key for Clerk webhook deliveries; null for app-logged events), metadata (jsonb NOT NULL default '{}'), created_at (timestamptz NOT NULL default now() — UTC). PK: (id, created_at). **Append-only** — same immutability enforcement as `audit_events`. RLS enabled: users read their own rows; platform admins read all. Written by `logAuthEvent` (`services/audit/audit.ts`) and the Clerk webhook receiver (`/api/webhooks/clerk`). ⚠️ Must be created by Jeff in Supabase Studio before auth events are written. |
| `auth_logs` | id (uuid PK), clerk_id_attempted (text), matched_table (text), matched_column (text), user_id (uuid), member_id (uuid), environment (text), created_at (timestamptz). **Pre-existing Clerk ID resolution diagnostic table** — created in Supabase Studio to help troubleshoot Clerk ID lookup issues. Not a general audit log; no `tenant_id`, `action`, `outcome`, or immutability. Preserved as-is. This is NOT the same as `auth_events` — do not confuse them. Undocumented in DB_CHANGELOG.md until 2026-06-08 (see backfill entry). |
| `prompt_types` | id (uuid, PK), tenant_id (uuid NOT NULL, FK → tenants), key (text NOT NULL — short identifier, e.g. 'base' / 'sales' / 'onboarding' / 'editor'), name (text NOT NULL — display name), description (text, nullable), is_default (boolean NOT NULL default false — flags the type used when no `prompt_set_id` is specified), sort_order (integer, nullable — display ordering, nulls last), created_at (timestamptz NOT NULL), updated_at (timestamptz NOT NULL). Unique constraint on (tenant_id, key). Index: `prompt_types_tenant_id_idx`. Added 2026-06-18. Platform tenant (`6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb`) owns the four platform defaults (base/sales/onboarding/editor); product tenants may add their own. |
| `pills` | id (uuid, PK), tenant_id (uuid NOT NULL, FK → tenants), label (text NOT NULL — display text on the pill/chip), scope (text NOT NULL CHECK ('composer' \| 'runtime') — `composer` = action pill in Prompt Studio, `runtime` = suggestion chip in member chat), trigger_type (text NOT NULL CHECK ('message' \| 'tool' \| 'card') — what firing the pill does: sends a message, invokes a tool, or renders a card), payload (jsonb NOT NULL default '{}' — carries message text / tool definition / card config depending on `trigger_type`), prompt_type_key (text, nullable — null = applies to all prompt types, non-null = scoped to that type), block_id (uuid, nullable, FK → blocks — optionally links a composer pill to a specific block), is_default (boolean NOT NULL default false), sort_order (integer, nullable), created_at (timestamptz NOT NULL), updated_at (timestamptz NOT NULL). Index: `pills_tenant_id_idx`. Added 2026-06-18. Three platform default composer pills seeded: "Summarize my prompt", "Identify opportunities to improve", "Create a new block". |
| `session_tokens` | id (uuid, PK), tenant_id (uuid NOT NULL, FK → tenants), created_by (uuid NOT NULL, FK → users), token (text NOT NULL UNIQUE — the URL token), context_injection (text, nullable — invisible system-prompt addition injected for the life of the session), prompt_type_key (text, nullable — prompt type to load for the session), chip_preload (jsonb NOT NULL default '[]' — array of chip definitions to surface at session open), expires_at (timestamptz, nullable — null = never expires), used_count (integer NOT NULL default 0 — sessions initiated with this token; informational only), created_at (timestamptz NOT NULL), updated_at (timestamptz NOT NULL). Indexes: `session_tokens_tenant_id_idx`, `session_tokens_token_idx`. Added 2026-06-18. Used for custom deep-link URLs, QR codes, and referral links that pre-configure a session. **Currently unpopulated** — no application code reads or writes this table yet; table created ahead of the feature build. |

**Deployment note — tenant_id backfill required**: `compiled_prompts` and
`compiled_prompts_history` rows must have `tenant_id` populated before
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

## Dependency & API Rules

Before writing any code that depends on a third-party SDK or API, read
`package.json` to confirm the exact installed version. Write only to the
stable, documented API for that version. Never use experimental, future,
beta, or preview API shapes unless explicitly instructed. If a stable and
unstable path exist for the same thing, always take the stable path.

**Clerk auth code:** Before writing or modifying any Clerk auth code, read
`.agents/skills/clerk-custom-ui/core-3/` — the Core 3 API shape differs
substantially from Core 2. The sign-up OTP methods are namespaced under
`signUp.verifications.*`, not directly on `signUp`. The skills are the
authoritative reference; do not infer API shapes from training data or autocomplete.

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

- **`getSystemPrompt` filters by `status='live'` (2026-07-28) but is still not
  type-aware — single-live-per-type (2026-07-27) constrains Publish but not
  fully the runtime read.** `services/prompt/compiler.ts`'s `getSystemPrompt`
  now scopes its query to `status = 'live'` (closing the original bug where any
  row, live or draft, could be picked purely by highest `version` — see
  `compiler.test.ts`), but it still has **no `prompt_type_id` filtering**. The
  partial unique indexes (`compiled_prompts_single_live_typed_idx` / `_untyped_idx`,
  see the `compiled_prompts` schema row and `compile.ts`) guarantee at most one
  live row per `(tenant_id, prompt_type_id)` slot, but do nothing to make the
  runtime read pick the *correct* slot once a tenant has more than one live type
  (e.g. a live Base and a live Sales prompt for the same tenant) — whichever has
  the higher `version` number among that tenant's live rows wins, regardless of
  type. This "worked" before only because every tenant happened to have exactly
  one compiled row. Making `getSystemPrompt` filter by the runtime-relevant type
  (Base, or whatever a session's `mode`/context calls for) is separate,
  still-open work — do not treat the `status='live'` fix as having closed this.
- **`/admin/prompt` ("Prompt" in nav) is a redundant legacy screen — Save
  removed 2026-07-27, full disposition still undecided.** This screen
  predates the Blocks/Compile & Publish flow and duplicated what that flow
  now does properly, with none of its gates (no release note, and
  `saveCompiledPrompt`'s `.limit(1)` didn't even scope by `prompt_set_id` —
  an arbitrary `compiled_prompts` row per tenant). Its Save action (button +
  the `POST /api/admin/prompt/save` call) has been removed from
  `PromptEditor.tsx`; the page is now read-only (version, compiled content,
  version history — the textarea and "View" no longer write anywhere). It is
  still mounted and still linked from the admin sidebar nav. `services/prompt/
  save.ts`, `POST /api/admin/prompt/save`, and `POST /api/admin/prompt/check`
  (which only ever gated that Save call) are consequently orphaned — no
  remaining caller — but left in place rather than deleted. **Open decision
  for Jeff:** fully remove this screen (delete the page, nav entry, and the
  three orphaned files/routes above) or repurpose it as something else. Until
  decided, do not delete it or its nav entry as a side effect of unrelated work.

- **`AuditAction.PROMPT_SET_MASTER_SET` is orphaned — no remaining caller,
  same treatment as the `/admin/prompt` orphans above.** The composer-family
  work (July 2026) retired `PUT /api/platform/settings/master-prompt`, the
  only place that ever wrote this action — it used to flip
  `prompt_sets.is_composer_prompt` directly with no compile step, no release
  note, and no real audit trail beyond a bare flag flip. Compile & Publish
  (`services/prompt/compile.ts`) is now the only path that activates a
  composer prompt set, same as it already was for every ordinary tenant set;
  its writes go through `AuditAction.PROMPT_COMPILE`, not this constant. The
  `PROMPT_SET_MASTER_SET` enum value is left in place (`services/audit/types.ts`)
  rather than deleted, in case historical `audit_events` rows reference it.

- **Heirloom chat-widget V2 is UI-first; its backends do not exist yet.**
  The V2 pass (branch `06-11-26_mvp-ui-update`, 2026-06-12) shipped the
  presentation layer only. Outstanding, in dependency order: a `stories`
  schema (Jeff, Studio — created stories are currently **ephemeral client
  state** in ChatHero, lost on refresh) + story CRUD; per-story collaborator
  invites (member-facing magic-link API — the existing `invites` table is the
  admin-created access gate, not this); conversation search (the sidebar field
  is a visible stub); Uploads; Share Heirloom (sidebar item + ChatHeader icon
  are inert; `ShareHeirloomModal` is landed but unmounted — pass the real
  `heirloom.2bl.ai` URL when mounting, its default is a placeholder); per-row
  kebab actions (star/rename/move/delete need session endpoints that don't
  exist; `onRowAction` is not passed, so menus don't render); Writing Prompts
  copy review (the 4 static prompts in ChatHero are placeholder-grade). The
  v1 `Sidebar.tsx` is superseded and unmounted — delete after preview
  verification.

- **Save CTA message threshold should be tenant-configurable.** Currently
  hardcoded at 4 messages in `SaveChatCTA.tsx` (`if (messages.length < 4 …)`).
  Should be a per-tenant setting stored in `tenants.settings` JSONB with a
  default of 4. Same pattern as `chat_in_progress_idle_seconds` /
  `chat_active_idle_seconds` — admin UI in Settings, fetched via
  `GET /api/admin/tenant-settings`, written via `PATCH /api/admin/tenant-settings`.
  Schema change (add key to `tenants.settings` JSONB) is Jeff's Studio work;
  code work proceeds once the column convention is confirmed.

- **Server-side Stop-abort's reliable mechanism (poll-based) hasn't been
  live-tested yet.** (2026-07-28, see the Chat UI service section's "Stop /
  interrupted-turn protocol" for the full history.) The first attempt
  (threading `Request.signal` into `streamText()`'s `abortSignal`) was
  live-tested and confirmed **not working** on this deployment — the client
  correctly recorded every Stop, but the server kept generating regardless,
  most likely because Next.js middleware reconstructs the request via
  header-forwarding at the edge→function boundary rather than passing a live
  signal object through (see the protocol section for the full trace). The
  current mechanism no longer depends on that connection-level signal at
  all: the client explicitly PATCHes `chat_sessions.stop_requested_at` the
  instant Stop is clicked, and `streamChat()` polls it every 500ms, comparing
  against the current turn's own start time. This is designed specifically
  to route around the confirmed failure mode, but it has not itself been
  retested live yet. Same DB check as before: click Stop mid-reply, query
  `server_abort_confirmed_at` for that session afterward — populated is
  proof it fired; null means it's still broken and needs another pass.
- **`services/payments/` not created.** Stripe Connect work is deferred; not
  even a scaffold exists yet.
- **Chat-UI strangle — widget shell extracted (centralization Step E).** The
  engine, marker registry, `useChatTurn` hook, and type contracts moved to
  `services/chat/ui/v1/` (PRs #42–46); `src/lib/sage.ts` and `src/lib/store.ts`
  were deleted. The widget-shell visual components (`Hero`, `Chat`, `sage/*`)
  now live in `components/shells/widget/`, with the headless `useWidgetShell` +
  `useSageParameters` in `services/chat/ui/v1/`. `Nav.tsx` was relocated into
  `app/(jefflougheed)/components/` (importing `ShareModal` via relative
  `./ShareModal`), which clears the last `src→app` boundary warning and empties
  `src/components/` (directory removed; `src/` holds only `calendly.d.ts`).
  `boundaries/element-types` is now at **0 warnings**; the rule stays at `warn`
  until Step G flips it to `error`.
- **eslint `components` element-type registered (centralization Step D).** Root
  `components/**` (the Mantine admin UI) is now a first-class boundary element:
  `app → components` and `components → services` are legal; `components` may not
  reach into `app` or `src` internals. This is the same allowance the
  `components/shells/` widget + membership shells will consume in Steps E/F. The
  rule stays at `warn` until the shells land and Step G flips it to `error`.
