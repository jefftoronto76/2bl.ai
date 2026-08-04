# Friday cleanup — Sage Blocks redesign PR

Captured during Steps 6–18. Do not address inside per-step commits.
Each item is either polish, deferred refactor, or doc debt.

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
