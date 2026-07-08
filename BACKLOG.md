
# Admin work July - 2026 (when noted)

Backlog: Safety check rewrite suggestion UI
When the safety check flags an issue and offers a suggested rewrite, surface an "Apply rewrite" button that replaces the block body with the suggested version. Currently operators see the suggestion but have no way to apply it without manually editing.

# Admin work July - 2026 (when noted)

Embed Composer in New Block Drawer
Currently the "New block" button opens a blank form. Operators who create blocks directly bypass the Composer's coaching and guidance, and are left stranded if the safety check flags issues with no way to fix them.
The fix: embed the Composer experience directly into the new block drawer. Operator describes what they want, Composer drafts the block with proper structure and positive language, operator reviews and saves. "Check & Save" becomes the final gate on an already-coached block rather than a cold quality check on unguided input.
Defer until after Heirloom V1 is in production.


# Admin work July - 2026 (when noted)

Preview tenant routing — dynamic resolution
Middleware preview routing (?preview=<slug>) is currently a hardcoded block per tenant. Doesn't scale — every new tenant requires a middleware edit. Needs a dynamic solution that works within edge runtime constraints (no Supabase client, raw fetch only, or an alternative architecture). Deferred until there's bandwidth to think it through properly.

# Friday cleanup — Sage Blocks redesign PR

Captured during Steps 6–18. Do not address inside per-step commits.
Each item is either polish, deferred refactor, or doc debt.

## Heirloom — auth & chat flow (2026-06-12 pre-merge test session, branch `claude/wonderful-mendel-59lgnj`)

- [ ] **Name field design.** Chat prompt captures first name only; full
      name wasn't designed for. Decide on approach: separate first/last
      fields in MagicLinkCard/SaveChatCTA, or accept full name and split
      on the backend. (The current implementation splits client-side on
      first whitespace — first token → firstName, remainder → lastName.)

- [ ] **Returning user name update.** If a returning user provides a name
      they didn't give at original sign-up, it should update their Clerk
      profile. Currently it doesn't — the sign-in path deliberately never
      writes the name (`useAuthFlowAdapter.sendCode` attaches it on the
      sign-up path only). Needs an "update if empty" rule or a post-auth
      profile write.

- [ ] **Returning user flow — name prompt.** Returning users shouldn't be
      asked for their name again. Suppress the name field for known users
      (detection happens at OTP send via `form_identifier_exists`, after
      the form is already filled — may need a UX rethink, e.g. drop the
      field once `flowType === 'signin'` is known, or never require it).

- [ ] **Confirmation copy inconsistency.** "You're in." (MagicLinkCard
      success stage) vs "You're now a member — your story is saved." /
      "Welcome back — your story is saved." (SaveChatCTA injected
      message) depends on which entry point triggered the flow. Needs one
      consistent copy set across both paths.

- [ ] **Booking cards not firing on preview.** Cards rendering as inline
      text on jefflougheed.ca preview. Likely tenant/environment issue
      (preview host tenant resolution → no `sage_parameters` → no marker
      match). Confirm on production post-merge.

- [ ] **Improved CTA modal switching.** Scoped to a separate branch;
      address post-merge. Confirm the branch exists and carries this
      scope before closing the item.

## Refactors

- [ ] **AppShell refactor for admin layout.** Hoist Mantine primitives
      to admin layout file to remove from per-route critical path.
      Should reduce First Load JS on /admin/prompt-studio/blocks and
      sibling routes. Replaces the inline `flex:1 + overflow:auto`
      pattern (`SCROLL_AREA_STYLE` constant in blocks/page.tsx).
      Also resolves the `flex-1` and `overflow-auto` items from the
      Step 6 Tailwind→Mantine migration that landed as inline styles.

- [ ] **BlockEditForm render-site cast cleanup.** Lines 122, 215, 241
      in components/admin/content/BlockEditForm.tsx use `props as ModeProps`
      casts inside JSX because TypeScript loses narrowing across the
      JSX boundary. Refactor to split-render functions
      (renderNewMode/renderEditMode) that take typed props directly.
      ~20 min. Drops 3 casts, gains type-safe rendering inside each
      branch. Group 1 bridge casts (lines 101, 104, 109, 112, 118, 119)
      and Group 2 Mantine setter cast (line 173) stay as-is — those
      are structural to the discriminated union and Mantine's Select
      API respectively.

- [ ] **Drawer vs inline-edit decision.** When Step 12 lands (order
      column → monospace prefix, manual edit moves to drawer), eyeball
      whether the expanded row preview is the natural place to edit
      blocks instead of the drawer. Make the call from the live page,
      not in the abstract.

## Refactors (continued)

- [ ] **Centralize `tokensFor()` utility.** Currently duplicated
      in SegmentedTokenMeter.tsx, PromptFullnessMeter.tsx, and
      /api/admin/prompt/compile/route.ts. Step 13 will add a
      fourth site (BlockRow Tokens column). Best moment to
      centralize is Step 13 itself; if it doesn't happen there,
      do it Friday. Target: src/lib/tokenize.ts. Three-line
      function, four call sites, no logic risk — pure cosmetic
      cleanup.

- [ ] **Auto-assign order on new block creation.** POST
      /api/admin/blocks/save currently omits order, so new
      blocks land at order=null. Modify route to look up
      max(order) WHERE tenant_id=? AND type=? and insert
      max+1. Small API change, deserves its own commit.
      Step 12 deferred this to keep UI scope clean.

- [ ] **`sage_parameters.value` legacy column.** Round-tripped on
      every PATCH to `/api/admin/sage-parameters` but never
      surfaced in UI or set by users. CLAUDE.md notes it as
      legacy. Either remove from schema and the round-trip
      payload, or document its intended use. Decide which.

## Performance tracking

- [ ] **First Load JS budget.** Step 6 baseline: 275 kB on
      /admin/prompt-studio/blocks. Step 7: 276 kB (+1 kB). Track per
      step. If it exceeds 350 kB before Friday, escalate AppShell
      refactor priority.

## CLAUDE.md updates (batch on Friday)

- [ ] JSX text content with apostrophes uses `&apos;`
      (react/no-unescaped-entities lint rule)
- [ ] New schema columns documented (already done in Step 2 — verify
      still accurate after all 18 steps)
- [ ] `updated_by` stamping pattern: PATCH and POST endpoints both
      stamp from `authCtx.owner_id` (Steps 3 and 7)
- [ ] Any new patterns established by Steps 8–18
- [ ] Reaffirm: Mantine primitives only in admin, no Tailwind,
      no raw divs

## Polish items

(populate as Steps 8–18 surface them)

- [ ] **Inbound page header uses raw HTML.** `app/admin/page.tsx`
      renders the "Inbound Chats" page header with raw `<h1>` and
      `<p>` plus inline styles, not Mantine `Title` and `Text`.
      Inconsistent with the AdminShell pattern. Replace with
      Mantine primitives in PR 4 OR sooner as part of the broader
      admin layout refactor.

- [ ]

## Polish items (continued)

UX observations captured from Step 8.5 mobile screenshot at 390px.
Not actioning during current step — re-evaluate after Step 9.

- [ ] **Mobile information density on /admin/prompt-studio/blocks.**
      At 390px the vertical stack is: header (title + subtitle +
      2 buttons) → meter (label + bar + 5 wrapping badges) → search
      → type chips → status chips → counter + expand → first card.
      Seven UI clusters before content. Information is correct;
      density isn't optimal. Re-evaluate after Step 9 lands the
      Chip.Group swap, then decide if further consolidation is
      worth a dedicated mobile pass.

- [ ] **Compile & Publish visual weight on mobile.** Green filled
      button stacks below "+ New block" outlined and dominates the
      header. On desktop the inline layout balances; on mobile
      stacked it eats the viewport. Consider: smaller variant on
      mobile, or move Compile & Publish to a different location
      entirely (page footer? collapsed menu?). Defer until full
      mobile pass.

- [ ] **Two "All" chips stack ambiguously.** Type's "All" and
      Status's "All" appear as duplicate controls visually.
      Consider: "All types" / "All statuses" labels, or visual
      divider between the two chip groups. Step 9 may already
      address this depending on the Chip.Group implementation.

- [ ] **Unidentified floating black circle, right side of meter
      area.** Visible in Step 8.5 mobile screenshot. Source
      unknown — could be a debug artifact, stray FAB, or
      Mantine notification. Investigate before merging this PR.

- [ ] **Stale Step 9 comment in BlocksTable.tsx:366-372** uses
      forward-looking tense ("Step 9 of the rework swaps...")
      now that Step 9 has shipped. Update to past tense during
      the Friday comment pass.

- [ ] **Chip check icon visual review.** Mantine v7 has no
      clean `hideCheckIcon` prop for single-select Chip.Group.
      If the six type chips with check icons feel noisy at
      390px on Jeff's eyeball test, wire
      `styles={{ iconWrapper: { display: 'none' } }}`.
      If they look fine, no action.

## Verification protocol additions

(populate as Steps 8–18 surface them)

- [ ]

## Product / scope review

- [ ] **Manual + New block button — keep or remove?** The Composer
      is the intended primary path for block creation. The manual
      form button (Step 7) was specced before Composer was working
      end-to-end. Built it anyway in Step 7 for V1 completeness.
      Re-evaluate after Sage chat redesign ships and real usage
      data accumulates. If nobody uses the manual form, replace
      with a "Compose new block" deep-link to the Composer.

## Data integrity

- [ ] **Backfill `updated_by` on pre-Step-7 blocks.** Step 3 added
      `updated_by` stamping to PATCH only. Step 7 added it to POST
      (`/api/admin/blocks/save`). Any blocks created via POST
      between Step 3 merge and Step 7 merge have NULL `updated_by`.
      Run a one-time backfill query if Step 14's author attribution
      shows missing data. Likely zero rows in production, but verify.

## Design decisions

- [ ] **Mobile search experience.** When a body matches but the
      title doesn't, mobile users have no visual indicator of
      why a card matched the query. Desktop has the expanded
      row body preview which Step 18 highlights; mobile dropped
      that surface in Step 11 and only has the edit sheet
      (textarea — can't render <mark> tags inside an input).
      Three approaches:
      A. Add a read-only body preview to mobile cards (changes
         card design, makes Step 18 highlights work consistently)
      B. Build an overlay highlight system for the edit sheet
         textarea (custom component, not a small change)
      C. Show match-context snippets in the card itself when
         search is active (e.g., "...matched in body: ...keyword...")
      Real design decision. Not a polish task. Resolve in
      follow-up PR.

## Design decisions (continued)

- [ ] **Row prefix as position vs order-value.** The prototype
      shows two numbers per expanded block: a row prefix ("01")
      that appears to be position-in-current-view, and an Order
      value ("81") in the metadata panel. Today's working
      version uses the prefix to display the order field —
      which means unordered blocks show an empty gutter.
      Changing the prefix to row position would: (a) eliminate
      the empty gutter for unordered blocks, (b) make Order
      purely an editing concern surfaced in the expanded panel,
      (c) introduce a new question of whether row position is
      stable (filter changes shift it). Real design decision.
      Resolve in follow-up PR.

## Theme-level changes

- [ ] **Bar redesign.** Per prototype: thinner bar, integrated
      legend with type-color dots and per-type token counts
      inline to the right of the bar. Replaces today's full-width
      bar + Badge legend below.

- [ ] **Shading and contrast.** Stronger separation between page
      canvas and component panels (cards, drawers, expanded rows).
      Today's Mantine defaults give soft borders on a near-uniform
      cream background; the prototype has more deliberate elevation
      treatment.

- [ ] **Square vs rounded corners.** Tighter, less Mantine-default
      look. Buttons, inputs, panels — all currently rounded by
      Mantine theme. Squarer corners propagate via Mantine theme
      override; not a per-component change.

These are theme-level concerns that touch every admin page,
not just blocks. Worth doing as a single dedicated commit after
the expanded row consolidation lands.

## Production readiness

- [ ] **Clerk on development keys.** Clerk is loaded with development
      keys on Vercel preview (and possibly production). Console
      warning: "Development instances have strict usage limits and
      should not be used when deploying your application to
      production." Migrate to production Clerk keys before public
      launch / Tenant 2 onboarding. Not blocking at current scale.

## Cosmetic clean-up (post-merge)

- [ ] **Type cell ordinal redundancy.** Type column shows
      "PROCESS (3RD)" — the (3RD) duplicates the title's monospace
      order prefix. Drop the ordinal from the Type cell; type
      label only.

- [ ] **Expanded panel visual separation.** Block content and
      metadata panel currently inherit the page background with
      no elevation cue. Theme-level treatment (covered in the
      pending theme commit) should add subtle separation.

- [ ] **Active toggle column width.** The Status column's "Active"
      label + Switch combination is wider than the "Status" header
      text above it; visual centering looks off. Adjust column
      width or label sizing.

## Sage capture & onboarding

- [ ] **Transition visitor name capture to full LLM.** Replace the
      Haiku extractor in `app/api/sage/route.ts` with direct tool
      use from Sage — when she learns the visitor's name during
      conversation, she calls a `record_visitor_name` tool herself
      rather than relying on a second-pass extractor reading the
      transcript after each turn. Removes the per-turn Haiku call,
      consolidates capture into a single model, and gives Sage
      explicit awareness of when the name was captured.

- [ ] **Custom pill URL parameters.** Ability to pass a URL
      parameter that pre-seeds chat suggestion pills for campaigns
      and referral links. Marketing can deep-link visitors into
      Sage with a tailored set of starter prompts (e.g.
      `?pills=coaching,team-offsite`) without changing the master
      prompt or admin config per campaign.

- [ ] **Custom pills in admin.** Configure suggestion pills and
      their linked blocks per tenant. Admin UI to define the pill
      label, the prompt that fires on click, and the block(s) that
      should be activated for that conversation path. Pairs with
      the URL-parameter feature above — admin defines the catalog,
      URL params select which subset to show.

## Prompt Contradiction Detection

**What it is:** During the safety check that runs on save, the compiler
analyzes the full compiled prompt for semantic contradictions across blocks —
not just within a single block. Two blocks can each be internally valid and
still produce conflicting instructions that cause non-deterministic model
behavior.

**Examples of what it needs to catch:**
- An identity block says "never use bullet points, always respond in flowing
  prose" and a process block says "present options as a numbered list"
- A guardrail block says "never discuss pricing beyond the working session fee"
  and a knowledge block includes a detailed rate card
- A tone instruction says "be warm and conversational" and an escalation block
  says "respond formally and direct the visitor to email"

**The requirement:** When the owner saves or publishes, the safety check passes
the full compiled prompt to Claude with a specific instruction: identify any
pairs of instructions that would produce contradictory behavior in the model.
Return each conflict as a structured flag — which blocks are in conflict, what
the contradiction is, and a suggested resolution.

**Distinct from existing safety check categories** (tone, legal risk, brand
alignment). Contradiction detection operates on the compiled output, not
individual blocks in isolation.

**Why it's priority:** A single contradictory instruction pair can make Sage's
behavior unpredictable in ways that are invisible until a visitor hits the exact
conversation pattern that triggers it. It's a silent quality problem.

**Where it lives:** Safety check enhancement, inside the existing save flow. No
schema changes required — output feeds into the existing `safety_check_result`
jsonb field.

## Security — Worth Watching

### P1 — Rate limiting on /api/sage (highest priority)
No rate limiting exists on the /api/sage route. A motivated actor
could hammer it and run up Anthropic API costs significantly. Must
be addressed before Heirloom gets real traffic. Add rate limiting
at the middleware or route level.

### P2 — RLS policies audit
NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are
public by design — that's the Supabase model. RLS is the only
protection. Audit all RLS policies to confirm tenant isolation
is airtight across all tables, especially chat_sessions,
artifacts, and artifact_media.

### P3 — Consolidate service role client creation
services/crm/sessions.ts has a local getAdminClient() that
duplicates the one in services/auth/supabase-admin.ts. Not a
vulnerability but a maintenance risk — two places to update if
the service role key or URL ever changes. Consolidate to
services/auth/supabase-admin.ts.

## Font Scale Standardization

Standardize font sizes across all tenants using a shared
scale. Currently jefflougheed.ca and 2bl.ai are hand-tuned
to matching values but there is no single source of truth.
Future tenants will drift without a proper system.

Options to evaluate:
- Tailwind config extension (named steps, per-tenant override)
- CSS custom properties in app/globals.css (shared, less flexible)
- Per-tenant token file with a shared naming convention

Goal: one definition, per-tenant override capability,
applies automatically to new tenants.

## Prompt Admin UX

- [ ] **Block rename.** Ability to edit the name/title of an existing block
      inline on the Blocks page or in the expanded panel. Currently the title
      is set at creation and not editable without going through the raw form.

- [ ] **Copy block confirmation.** The copy/duplicate button should show a
      confirmation dialog before creating the duplicate, with a "don't show
      again" option (persisted to localStorage) to prevent accidental
      duplicates. The current single-click duplicate fires immediately with no
      undo.

- [ ] **Copy block text.** Add a "copy text" action to each block that copies
      the block body to the clipboard. Intended for easy sharing with other
      tools (e.g. pasting into a doc or another AI). Clipboard icon beside the
      existing action buttons; show a transient "Copied" toast on success.

## Code Quality — Pre-existing Warnings

Do not fix these inside feature branches. Address in a dedicated cleanup pass.

- [ ] **Unescaped apostrophes/quotes in JSX** — multiple files. Raw `'` and
      `"` characters inside JSX text nodes trigger the
      `react/no-unescaped-entities` rule. Replace with `&apos;` and `&quot;`
      respectively.

- [ ] **`<img>` instead of Next.js `<Image />`** — multiple files. Raw `<img>`
      tags bypass Next.js image optimisation (automatic WebP conversion, lazy
      loading, size hints). Each instance is a missed LCP improvement. Migrate
      to `next/image` `<Image />` with explicit `width`/`height` or `fill`.

- [ ] **`<a>` tag instead of `<Link />` in SectionProcess.tsx line 360** —
      raw anchor bypasses the Next.js client-side router and triggers the
      `@next/next/no-html-link-for-pages` rule. Replace with `<Link href="…">`.

- [ ] **Custom font loading not in `_document.js`** —
      `app/(jefflougheed)/layout.tsx` loads Google Fonts via a `<link>` tag in
      the layout rather than through `next/font`. This triggers the
      `@next/next/no-page-custom-font` rule and prevents font preloading
      optimisations. Migrate to `next/font/google`.

- [ ] **`useEffect` missing dependency `messages.length`** —
      `components/admin/PromptBuilderChat.tsx` line 100. The exhaustive-deps
      lint rule flags this; the effect may not re-run when `messages` grows.
      Audit the intended behaviour and either add the dependency or suppress
      with a documented justification comment.

